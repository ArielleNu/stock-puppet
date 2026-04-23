"""
Recommendation logic: TF-IDF / SVD / hybrid ranking and preference reweighting.

Separated from `routes.py` so the Flask layer can stay focused on HTTP
concerns while ranking logic lives here and can be imported/tested directly.
"""
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from models import Company
from svd_index import get_company_svd_index
from tfidf_index import get_company_tfidf_index

# ── Config ──────────────────────────────────────────────────────────────────
SRC_DIR = os.path.dirname(os.path.abspath(__file__))
COMPANY_DATA_PATH = os.path.join(SRC_DIR, "data", "company-data.json")

# Words we don't care about in the descriptions of companies.
STOPWORDS = {
    "the", "and", "or", "of", "in", "to", "for", "a", "an", "with", "that",
}

SVD_WEIGHT = 0.6
TFIDF_WEIGHT = 0.4

CAP_THRESHOLDS = {
    "large": 10e9,   # > $10B
    "mid_low": 2e9,  # $2B - $10B
    "small": 2e9,    # < $2B
}


# ── Explanation helpers ────────────────────────────────────────────────────
def _attach_latent_explanation(
    query: str,
    result: Dict[str, Any],
    tfidf_index,
    svd_index,
    score_for_breakdown: float,
) -> Dict[str, Any]:
    """Recompute the explanation for ``result`` so it includes SVD latent info."""
    ticker = result.get("ticker")
    if not ticker:
        return result

    latent = svd_index.explain_match(query, ticker, top_k_dims=5)
    explanation = tfidf_index.explain_for_ticker_query(
        query,
        STOPWORDS,
        ticker,
        score_breakdown_final=score_for_breakdown,
        latent=latent,
    )

    if explanation:
        result["explanation"] = explanation
    elif latent:
        # No TF-IDF overlap, but we still want to expose the latent reasoning.
        result["explanation"] = _latent_only_explanation(latent, score_for_breakdown)

    return result


def _latent_only_explanation(
    latent: Dict[str, Any], score_for_breakdown: float
) -> Dict[str, Any]:
    """Build an explanation payload from latent (SVD) info alone."""
    top_concept = (latent.get("top_concepts") or ["shared theme"])[0]
    dims = [
        {
            "index": d["index"],
            "label": d["label"],
            "top_positive": d.get("top_positive", []),
            "top_negative": d.get("top_negative", []),
            "query_activation": round(float(d.get("query_activation", 0)), 6),
            "result_activation": round(float(d.get("result_activation", 0)), 6),
            "contribution": round(float(d.get("contribution", 0)), 6),
            "abs_share": round(float(d.get("abs_share", 0)), 6),
            "alignment": d.get("alignment", "positive"),
            "query_drivers": d.get("query_drivers", []),
            "result_drivers": d.get("result_drivers", []),
        }
        for d in latent.get("top_dimensions", [])
    ]
    return {
        "short": f"latent concept «{top_concept}»",
        "reasons": [
            "Pure latent (SVD) match: query and company share semantic dimensions, "
            "with little or no direct keyword overlap.",
        ],
        "matched_terms": [],
        "snippets": [],
        "query_terms": [],
        "semantic_matches": [],
        "semantic_match_details": [],
        "feature_matches": {},
        "score_breakdown": {
            "text_similarity": 0.0,
            "sentiment_impact": 0.0,
            "final_score": round(score_for_breakdown, 6),
        },
        "sentiment": {"available": False},
        "latent": {
            "top_concepts": latent.get("top_concepts", []),
            "cosine_similarity": latent.get("cosine_similarity"),
            "n_components": latent.get("n_components"),
            "dimensions": dims,
        },
    }


# ── Ranking pipelines ──────────────────────────────────────────────────────
def _tfidf_only_ranking(query: str, top_n: int) -> List[Dict[str, Any]]:
    """Pure TF-IDF ranking, no latent info attached (used for the 'Without SVD' view)."""
    tfidf_index = get_company_tfidf_index(COMPANY_DATA_PATH, STOPWORDS)
    return tfidf_index.search(query, STOPWORDS, top_n)


def _hybrid_ranking(query: str, top_n: int) -> List[Dict[str, Any]]:
    """Hybrid SVD+TFIDF ranking, with latent explanations attached."""
    svd_index = get_company_svd_index(COMPANY_DATA_PATH, STOPWORDS)
    tfidf_index = get_company_tfidf_index(COMPANY_DATA_PATH, STOPWORDS)

    svd_results = svd_index.search(query, top_n=50)
    tfidf_results = tfidf_index.search(query, STOPWORDS, top_n=50)

    merged: Dict[str, Dict[str, Any]] = {}
    for r in svd_results:
        merged[r["ticker"]] = {"svd": r["score"], "tfidf": 0.0, "data": r}
    for r in tfidf_results:
        if r["ticker"] in merged:
            merged[r["ticker"]]["tfidf"] = r["score"]
        else:
            merged[r["ticker"]] = {"svd": 0.0, "tfidf": r["score"], "data": r}

    ranked: List[Dict[str, Any]] = []
    for _ticker, info in merged.items():
        combined = SVD_WEIGHT * info["svd"] + TFIDF_WEIGHT * info["tfidf"]
        result = dict(info["data"])
        result["score"] = combined
        result["component_scores"] = {
            "svd": round(info["svd"], 6),
            "tfidf": round(info["tfidf"], 6),
            "svd_weight": SVD_WEIGHT,
            "tfidf_weight": TFIDF_WEIGHT,
        }
        _attach_latent_explanation(query, result, tfidf_index, svd_index, combined)
        ranked.append(result)

    ranked.sort(key=lambda x: x["score"], reverse=True)
    return ranked[:top_n]


def recommend_from_text_query(
    query: str, top_n: int = 10, method: str = "hybrid"
) -> List[Dict[str, Any]]:
    """
    Returns companies ranked by similarity to the query.

    ``method`` can be "hybrid" (default), "svd", or "tfidf".
    Hybrid blends both: combined = 0.6*svd + 0.4*tfidf.

    All hybrid/svd results have a ``latent`` block attached to their explanation
    so the UI can show which SVD dimensions drove the match.
    """
    if not query or not query.strip():
        return []

    q = query.strip()

    if method == "tfidf":
        return _tfidf_only_ranking(q, top_n)

    if method == "svd":
        svd_index = get_company_svd_index(COMPANY_DATA_PATH, STOPWORDS)
        tfidf_index = get_company_tfidf_index(COMPANY_DATA_PATH, STOPWORDS)
        results = svd_index.search(q, top_n)
        if not results:
            return _tfidf_only_ranking(q, top_n)
        for row in results:
            _attach_latent_explanation(q, row, tfidf_index, svd_index, row["score"])
        return results

    return _hybrid_ranking(q, top_n)


def recommend_from_ticker_global_peers(
    ticker: str, top_n: int = 6
) -> List[Dict[str, Any]]:
    index = get_company_tfidf_index(COMPANY_DATA_PATH, STOPWORDS)
    return index.similar_companies(ticker, top_n, STOPWORDS)


# ── Portfolio → query synthesis ────────────────────────────────────────────
def _match_company(item: str) -> Optional[Company]:
    """Look up a Company by exact ticker first, then by (partial) name."""
    item_upper = item.upper()
    company = Company.query.filter(Company.ticker == item_upper).first()
    if company:
        return company
    company = Company.query.filter(Company.name.ilike(item)).first()
    if company:
        return company
    return Company.query.filter(Company.name.ilike(f"%{item}%")).first()


def _synthesize_portfolio_query(companies: List[Company]) -> str:
    parts = []
    for c in companies:
        parts.append(
            " ".join(
                [
                    c.ticker or "",
                    c.name or "",
                    c.sector or "",
                    c.industry or "",
                    c.description or "",
                ]
            )
        )
    return " ".join(parts).strip()


def recommend_stocks(portfolio: List[str], top_n: int = 5) -> List[Dict[str, Any]]:
    """
    Generate stock recommendations based on a user's portfolio.

    Parameters
    ----------
    portfolio : list[str]
        A list of stock tickers or company names provided by the user.
    top_n : int
        Number of recommendations to return.

    Returns
    -------
    list[dict]
        Companies ranked by similarity to the synthetic portfolio query,
        excluding companies already in the portfolio.
    """
    if not portfolio:
        return []

    raw_inputs = [item.strip() for item in portfolio if item and item.strip()]
    if not raw_inputs:
        return []

    normalized_inputs = list(dict.fromkeys(raw_inputs))  # dedupe, preserve order

    portfolio_tickers: set = set()
    matched_companies: List[Company] = []
    for item in normalized_inputs:
        company = _match_company(item)
        if company and company.ticker not in portfolio_tickers:
            matched_companies.append(company)
            portfolio_tickers.add(company.ticker)

    if not matched_companies:
        return []

    synthetic_query = _synthesize_portfolio_query(matched_companies)
    if not synthetic_query:
        return []

    # Ask for extra results since we'll filter out portfolio members.
    candidates = recommend_from_text_query(
        synthetic_query, top_n=top_n + len(portfolio_tickers)
    )
    filtered = [
        c for c in candidates
        if c.get("ticker", "").upper() not in portfolio_tickers
    ]
    return filtered[:top_n]


# ── Preference reweighting ─────────────────────────────────────────────────
def _risk_multiplier(risk: str, beta: float) -> float:
    if risk == "low":
        if beta < 1.0:
            return 1.2
        if beta > 1.5:
            return 0.6
    elif risk == "high":
        if beta > 1.5:
            return 1.2
        if beta < 0.8:
            return 0.7
    return 1.0


def _focus_multiplier(focus: str, dividend: float) -> float:
    if focus == "dividend":
        if dividend > 1.0:
            return 1.3
        if dividend == 0:
            return 0.7
    elif focus == "growth":
        if dividend == 0 or dividend < 0.5:
            return 1.2
        if dividend > 2.0:
            return 0.7
    return 1.0


def _cap_multiplier(cap_pref: str, market_cap: float) -> float:
    if cap_pref == "large" and market_cap < CAP_THRESHOLDS["large"]:
        return 0.6
    if cap_pref == "small" and market_cap > CAP_THRESHOLDS["small"]:
        return 0.6
    if cap_pref == "mid":
        if market_cap < CAP_THRESHOLDS["mid_low"] or market_cap > CAP_THRESHOLDS["large"]:
            return 0.6
    return 1.0


def apply_preferences(
    results: List[Dict[str, Any]], preferences: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """
    Reweight and (soft) filter results based on user preferences.

    ``preferences`` is a dict with optional keys:
      - risk_tolerance: "low" | "medium" | "high" | "any"
      - focus:          "dividend" | "growth" | "any"
      - cap_preference: "large" | "mid" | "small" | "any"
    """
    if not preferences or not results:
        return results

    risk = preferences.get("risk_tolerance", "any")
    focus = preferences.get("focus", "any")
    cap_pref = preferences.get("cap_preference", "any")

    reweighted: List[Dict[str, Any]] = []
    for r in results:
        beta = r.get("beta", 1.0) or 1.0
        dividend = r.get("dividend_yield", 0) or 0
        market_cap = r.get("market_cap", 0) or 0

        multiplier = (
            _risk_multiplier(risk, beta)
            * _focus_multiplier(focus, dividend)
            * _cap_multiplier(cap_pref, market_cap)
        )

        result = dict(r)
        result["score"] = r.get("score", 0) * multiplier
        reweighted.append(result)

    reweighted.sort(key=lambda x: x["score"], reverse=True)
    return reweighted


# ── Compare (with vs without SVD) ──────────────────────────────────────────
def build_compare_payload(query: str, top_n: int) -> Dict[str, Any]:
    """
    Run the same query through both pipelines and return a side-by-side
    ranking comparison.  Used by the UI's "With SVD vs Without SVD" toggle.
    """
    query = (query or "").strip()
    if not query:
        return {"query": "", "with_svd": [], "without_svd": [], "diff": []}

    with_svd = recommend_from_text_query(query, top_n=top_n, method="hybrid")
    without_svd = recommend_from_text_query(query, top_n=top_n, method="tfidf")

    rank_tfidf = {r["ticker"]: i + 1 for i, r in enumerate(without_svd)}
    rank_hybrid = {r["ticker"]: i + 1 for i, r in enumerate(with_svd)}

    diff: List[Dict[str, Any]] = []
    for ticker, hybrid_rank in rank_hybrid.items():
        tfidf_rank = rank_tfidf.get(ticker)
        entry: Dict[str, Any] = {
            "ticker": ticker,
            "rank_with_svd": hybrid_rank,
            "rank_without_svd": tfidf_rank,
        }
        if tfidf_rank is None:
            entry["status"] = "new"
            entry["delta"] = None
        else:
            entry["status"] = "moved" if tfidf_rank != hybrid_rank else "same"
            # Positive delta = moved up (better) thanks to SVD.
            entry["delta"] = tfidf_rank - hybrid_rank
        diff.append(entry)

    for ticker, tfidf_rank in rank_tfidf.items():
        if ticker not in rank_hybrid:
            diff.append({
                "ticker": ticker,
                "rank_with_svd": None,
                "rank_without_svd": tfidf_rank,
                "status": "dropped",
                "delta": None,
            })

    diff.sort(
        key=lambda e: (
            0 if e["rank_with_svd"] is not None else 1,
            e["rank_with_svd"] or e["rank_without_svd"] or 999,
        )
    )

    return {
        "query": query,
        "with_svd": with_svd,
        "without_svd": without_svd,
        "diff": diff,
    }
