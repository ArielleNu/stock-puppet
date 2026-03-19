"""
Offline data builder for Stock Puppet.

Source:
  - `src/data/holdings.csv` (ETF holdings with columns like TICKER/HOLDINGS)

API:
  - Financial Modeling Prep (FMP) `stable/profile` endpoint

Output:
  - `src/data/company-data.json` (JSON array of raw FMP profile objects)

Notes:
  - No premium bulk endpoints.
  - Avoids HTTP 414 by never sending comma-separated symbols.
  - Calls the profile endpoint once per ticker.
  - Processes tickers in chunks of 250.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import time
from typing import Dict, List, Optional, Set

import requests
from dotenv import load_dotenv

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

HOLDINGS_CSV = os.path.join(PROJECT_ROOT, "src", "data", "holdings.csv")
OUT_DIR = os.path.join(PROJECT_ROOT, "src", "data")
COMPANY_DATA_PATH = os.path.join(OUT_DIR, "company-data.json")
TICKERS_PATH = os.path.join(OUT_DIR, "tickers.txt")


def read_holdings() -> List[Dict[str, str]]:
    if not os.path.exists(HOLDINGS_CSV):
        raise RuntimeError(f"Holdings CSV not found at {HOLDINGS_CSV}")

    with open(HOLDINGS_CSV, "r", encoding="utf-8") as f:
        reader = csv.reader(f)
        fieldnames: List[str] = []
        rows: List[Dict[str, str]] = []

        for row in reader:
            if not fieldnames:
                # Header row looks like:
                # ["", "SEDOL", "HOLDINGS", "TICKER", "% OF FUNDS*", ...]
                if (
                    len(row) > 3
                    and row[1].strip() == "SEDOL"
                    and row[2].strip() == "HOLDINGS"
                    and row[3].strip() == "TICKER"
                ):
                    fieldnames = [c.strip() for c in row]
                continue

            if not row:
                continue

            if len(row) < len(fieldnames):
                row += [""] * (len(fieldnames) - len(row))
            elif len(row) > len(fieldnames):
                row = row[: len(fieldnames)]

            rows.append({fieldnames[i]: row[i] for i in range(len(fieldnames))})

        if not fieldnames:
            raise RuntimeError("Could not find holdings header row (',SEDOL,HOLDINGS,TICKER,...').")

    return rows


def normalize_holdings_ticker(t: str) -> str:
    t = (t or "").strip().upper()
    if not t or t == "---":
        return ""
    # Common case in your holdings file
    t = t.replace("BRK/B", "BRK.B")
    # Keep punctuation; FMP is picky, but we'll try a few variants in profile fetch.
    return t


def ticker_candidates(t: str) -> List[str]:
    """
    Generate a few likely FMP-accepted symbol variants for tricky punctuation.
    """
    t = normalize_holdings_ticker(t)
    if not t:
        return []
    out: Set[str] = {t}
    # BRK.B <-> BRK-B <-> BRK/B
    out.add(t.replace(".", "-"))
    out.add(t.replace(".", "/"))
    out.add(t.replace("/", "."))
    return [x for x in out if x]


def profile_single(symbol: str, api_key: str) -> Optional[Dict]:
    """
    FMP `stable/profile`:
      https://financialmodelingprep.com/stable/profile?symbol=AAPL&apikey=...

    Returns a profile dict or None if empty payload.
    """
    symbol = (symbol or "").strip()
    if not symbol:
        return None

    url = "https://financialmodelingprep.com/stable/profile"
    # Retry on rate limit / transient errors.
    max_retries = int((os.getenv("FMP_MAX_RETRIES") or "5").strip() or "5")
    backoff_base_s = float((os.getenv("FMP_BACKOFF_BASE_S") or "1.5").strip() or "1.5")
    data = None
    for attempt in range(max_retries + 1):
        resp = requests.get(url, params={"symbol": symbol, "apikey": api_key}, timeout=60)
        if resp.status_code == 200:
            data = resp.json()
            break
        # Backoff on rate limit and transient server errors.
        if resp.status_code in {429, 500, 502, 503, 504} and attempt < max_retries:
            # Prefer Retry-After if present.
            retry_after = resp.headers.get("Retry-After")
            if retry_after:
                try:
                    sleep_s = float(retry_after)
                except Exception:
                    sleep_s = backoff_base_s * (2 ** attempt)
            else:
                sleep_s = backoff_base_s * (2 ** attempt)
            time.sleep(max(0.25, min(30.0, sleep_s)))
            continue
        # Non-retriable, or out of retries: skip this symbol instead of crashing run.
        return None

    if data is None:
        return None

    # Typical response is a list: [ { ...profile... } ]
    if isinstance(data, list):
        if data and isinstance(data[0], dict):
            return data[0]
        return None
    if isinstance(data, dict):
        # Some variants might return a dict; accept if it looks like a profile.
        if data.get("symbol") or data.get("companyName") or data.get("name"):
            return data
    return None


def chunked(seq: List[str], size: int) -> List[List[str]]:
    return [seq[i : i + size] for i in range(0, len(seq), size)]


def build_tickers_file_from_holdings(holdings_by_ticker: Dict[str, Dict[str, str]]) -> List[str]:
    tickers = sorted(holdings_by_ticker.keys())
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(TICKERS_PATH, "w", encoding="utf-8") as f:
        for t in tickers:
            f.write(t + "\n")
    return tickers


def read_tickers_file() -> List[str]:
    if not os.path.exists(TICKERS_PATH):
        raise RuntimeError(f"Tickers file not found at {TICKERS_PATH}")
    with open(TICKERS_PATH, "r", encoding="utf-8") as f:
        tickers = [normalize_holdings_ticker(line) for line in f if normalize_holdings_ticker(line)]
    return tickers


def build_companies(start: int, end: int) -> None:
    api_key = os.getenv("FMP_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("FMP_API_KEY not set in .env.")

    holdings = read_holdings()

    # First row per ticker is used to keep ETF-specific metadata (weight/shares/etc).
    holdings_by_ticker: Dict[str, Dict[str, str]] = {}
    for r in holdings:
        t = normalize_holdings_ticker(r.get("TICKER") or "")
        if not t or t in holdings_by_ticker:
            continue
        holdings_by_ticker[t] = r

    # Ensure tickers.txt exists and then use it as the request source of truth.
    if not os.path.exists(TICKERS_PATH):
        all_tickers = build_tickers_file_from_holdings(holdings_by_ticker)
        print(f"Generated {len(all_tickers)} tickers at {TICKERS_PATH}")
    all_tickers = read_tickers_file()
    if not all_tickers:
        raise RuntimeError(f"No valid tickers found in {TICKERS_PATH}")

    # 1-indexed inclusive range from CLI.
    start = max(1, start)
    end = min(len(all_tickers), end)
    if start > end:
        raise RuntimeError(f"Invalid range: start={start}, end={end}, total={len(all_tickers)}")
    tickers = all_tickers[start - 1 : end]

    # Per your requirement: process at most 250 ticker requests at a time.
    chunk_size = 250

    # Safer default for free-tier rate limits.
    sleep_between_calls_s = float((os.getenv("SLEEP_BETWEEN_CALLS_S") or "0.35").strip() or "0.35")
    sleep_between_calls_s = max(0.0, min(2.0, sleep_between_calls_s))

    total_calls = 0

    # Load existing company-data.json once, then append incrementally.
    existing: List[Dict] = []
    if os.path.exists(COMPANY_DATA_PATH):
        with open(COMPANY_DATA_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                existing = [x for x in data if isinstance(x, dict)]

    existing_symbols: Set[str] = set()
    for item in existing:
        sym = str(item.get("symbol") or "").strip().upper()
        if sym:
            existing_symbols.add(sym)

    merged = existing[:]
    new_profiles_added = 0

    # Process tickers in chunks, but persist after EACH new profile.
    for idx, t_chunk in enumerate(chunked(tickers, chunk_size), start=1):
        print(f"Chunk {idx}/{(len(tickers) + chunk_size - 1)//chunk_size}: {len(t_chunk)} tickers")
        for t in t_chunk:
            chosen: Optional[Dict] = None
            for cand in ticker_candidates(t):
                total_calls += 1
                p = profile_single(cand, api_key)
                if p:
                    chosen = p
                    break
            if chosen:
                sym = str(chosen.get("symbol") or t).strip().upper()
                if sym and sym not in existing_symbols:
                    existing_symbols.add(sym)
                    merged.append(chosen)
                    new_profiles_added += 1
                    # Persist immediately so progress is never lost.
                    with open(COMPANY_DATA_PATH, "w", encoding="utf-8") as f:
                        json.dump(merged, f, indent=2, ensure_ascii=False)
            if sleep_between_calls_s:
                time.sleep(sleep_between_calls_s)

    print(f"Requested ticker range: {start}-{end} ({len(tickers)} tickers)")
    print(f"HTTP calls attempted: {total_calls}")
    print(f"New profiles added: {new_profiles_added}")
    print(f"Total profiles in {COMPANY_DATA_PATH}: {len(merged)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch FMP profiles for a ticker range from src/data/tickers.txt")
    parser.add_argument("--start", type=int, default=1, help="1-indexed start ticker index (inclusive)")
    parser.add_argument("--end", type=int, default=250, help="1-indexed end ticker index (inclusive)")
    args = parser.parse_args()
    build_companies(start=args.start, end=args.end)

