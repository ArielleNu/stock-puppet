"""
Fetches S&P 500 company data and save to companies.json

Uses yfinance to grab company info for each ticker. Results are cached to companies.json
so you only need to run this once (or re-run to refresh data).
"""

import json
import time
import os

import pandas as pd
import yfinance as yf


def get_tickers():
    # Scrape S&P 500 ticker list from wikipedia
    url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
    tables = pd.read_html(url)
    df = tables[0]
    tickers = df["Symbol"].tolist()
    tickers = [t.replace(".", "-") for t in tickers]
    return tickers


def fetch_company_info(ticker):
    # Fetch company info from yfinance. Returns dict or None if failing
    try:
        info = yf.Ticker(ticker).info
        if not info or "shortName" not in info:
            print(f" SKIP {ticker}: no data returned")
            return None

        return {
            "ticker": ticker,
            "name": info.get("shortName", info.get("longName", ticker)),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "market_cap": info.get("marketCap"),
            "dividend_yield": info.get("dividendYield"),
            "description": info.get("longBusinessSummary"),
            "city": info.get("city"),
            "state": info.get("state"),
            "country": info.get("country"),
            "website": info.get("website"),
        }
    except Exception as e:
        print(f" ERROR {ticker}: {e}")
        return None


def main():
    output_path = os.path.join(os.path.dirname(__file__), "companies.json")

    # continue from existing file if possible
    existing = {}
    if os.path.exists(output_path):
        with open(output_path, "r") as f:
            data = json.load(f)
            existing = {c["ticker"]: c for c in data}
        print(f"Loaded {len(existing)} existing companies from memory")

    print("Fetching S&P 500 ticker list")
    print("____________________________________________")
    tickers = get_tickers()
    print(f"Found {len(tickers)} tickers")

    companies = list(existing.values())
    fetched_tickers = set(existing.keys())

    for i, ticker in enumerate(tickers):
        if ticker in fetched_tickers:
            continue

        print(f"[{i+1}/{len(tickers)}] Fetching {ticker}...")
        company = fetch_company_info(ticker)
        if company:
            companies.append(company)
            fetched_tickers.add(ticker)

        # save progress every 25 tickers
        if len(companies) % 25 == 0:
            with open(output_path, "w") as f:
                json.dump(companies, f, indent=2)
            print(f" saved {len(companies)} companies so far")

        time.sleep(0.3)

    # save
    with open(output_path, "w") as f:
        json.dump(companies, f, indent=2)

    print(f"\nSaved {len(companies)} companies to {output_path}")


if __name__ == "__main__":
    main()
