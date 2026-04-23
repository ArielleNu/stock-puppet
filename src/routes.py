"""
Routes: React app serving and episode search API.

To enable AI suggestions, set USE_LLM = True below. See llm_routes.py for AI code.
"""
import os
from flask import send_from_directory, request, jsonify
from models import db, Episode, Review, Company
from tfidf_index import get_company_tfidf_index
from svd_index import get_company_svd_index
from llm_routes import suggest_query, recommend_from_ir_results

# ── AI toggle ────────────────────────────────────────────────────────────────
#USE_LLM = False
USE_LLM = True
# ─────────────────────────────────────────────────────────────────────────────

# Resolve paths relative to this file so deployments work
SRC_DIR = os.path.dirname(os.path.abspath(__file__))
COMPANY_DATA_PATH = os.path.join(SRC_DIR, "data", "company-data.json")

# words we don't care about in the descriptions of companies
STOPWORDS = {
    "the", "and", "or", "of", "in", "to", "for", "a", "an", "with", "that"
}

SVD_WEIGHT = 0.6
TFIDF_WEIGHT = 0.4

CAP_THRESHOLDS = {
    "large": 10e9,   # > $10B
    "mid_low": 2e9,  # $2B - $10B
    "small": 2e9,    # < $2B
}

def json_search(query):
    if not query or not query.strip():
        query = "Kardashian"
    results = db.session.query(Episode, Review).join(
        Review, Episode.id == Review.id
    ).filter(
        Episode.title.ilike(f'%{query}%')
    ).all()
    matches = []
    for episode, review in results:
        matches.append({
            'title': episode.title,
            'descr': episode.descr,
            'imdb_rating': review.imdb_rating
        })
    return matches

def recommend_stocks(portfolio, top_n=5):
    """
    Generate stock recommendations based on user's portfolio.
    
    Parameters
    ----------
    portfolio : list[str]
        A list of stock tickers provided by the user.
        Example: ["NVDA", "AMD"]
        
    top_n : int
        Number of recommendations to return.
        
    Returns
    -------
    list[dict]
        A list of recommended companies ranked by similarity score.
        Each result contains company metadata used by the frontend.

    Notes
    -----
    - Companies already in the portfolio are excluded from recommendations.
    - Higher score = more similar to portfolio.
    """

    # handle empty portfolio input
    if not portfolio:
        return []
    
    raw_inputs = [item.strip() for item in portfolio if item and item.strip()]
    if not raw_inputs:
        return []
    
    normalized_inputs = list(dict.fromkeys(raw_inputs)) # dedupe
    portfolio_tickers = set()
    matched_companies = []

    for item in normalized_inputs:
        item_upper = item.upper()

        #try exact ticker match
        company = Company.query.filter(
            Company.ticker == item_upper
        ).first()

        # match by company name
        if not company:
            company = Company.query.filter(
                Company.name.ilike(item)
            ).first()

        # substring match on company name
        if not company:
            company = Company.query.filter(
                Company.name.ilike(f"%{item}%")
            ).first()

        if company and company.ticker not in portfolio_tickers:
            matched_companies.append(company)
            portfolio_tickers.add(company.ticker)

    if not matched_companies:
        return []
    
    # synthetic query from matched portfolio companies

    query_parts = []

    for company in matched_companies:
        text = " ".join([
            company.ticker or "",
            company.name or "",
            company.sector or "",
            company.industry or "",
            company.description or ""
        ])
        query_parts.append(text)

    synthetic_query = " ".join(query_parts).strip()
    if not synthetic_query:
        return []
    
    # ask for extra results since we will filter portfolio
    candidates = recommend_from_text_query(synthetic_query, top_n=top_n + len(portfolio_tickers))

    # exclude portfolio companies from returned recommendations
    filtered = [
        company for company in candidates 
        if company.get("ticker", "").upper() not in portfolio_tickers
    ]

    return filtered[:top_n]

def recommend_from_text_query(query, top_n=10, method="hybrid"):
    """
    Returns companies ranked by similarity to the query.

    method can be "hybrid" (default), "svd", or "tfidf".
    Hybrid blends both: combined = 0.6*svd + 0.4*tfidf.
    """
    if not query or not query.strip():
        return []

    q = query.strip()

    if method == "tfidf":
        index = get_company_tfidf_index(COMPANY_DATA_PATH, STOPWORDS)
        return index.search(q, STOPWORDS, top_n)

    if method == "svd":
        index = get_company_svd_index(COMPANY_DATA_PATH, STOPWORDS)
        results = index.search(q, top_n)
        if not results:
            tfidf = get_company_tfidf_index(COMPANY_DATA_PATH, STOPWORDS)
            results = tfidf.search(q, STOPWORDS, top_n)
        else:
            tfidf = get_company_tfidf_index(COMPANY_DATA_PATH, STOPWORDS)
            for row in results:
                if row.get("explanation"):
                    continue
                ex = tfidf.explain_for_ticker_query(
                    q, STOPWORDS, row["ticker"], score_breakdown_final=row["score"]
                )
                if ex:
                    row["explanation"] = ex
        return results

    # hybrid: SVD + tfidf
    svd_index = get_company_svd_index(COMPANY_DATA_PATH, STOPWORDS)
    tfidf_index = get_company_tfidf_index(COMPANY_DATA_PATH, STOPWORDS)

    svd_results = svd_index.search(q, top_n=50)
    tfidf_results = tfidf_index.search(q, STOPWORDS, top_n=50)

    merged = {}
    for r in svd_results:
        merged[r["ticker"]] = {"svd": r["score"], "tfidf": 0.0, "data": r}
    for r in tfidf_results:
        if r["ticker"] in merged:
            merged[r["ticker"]]["tfidf"] = r["score"]
        else:
            merged[r["ticker"]] = {"svd": 0.0, "tfidf": r["score"], "data": r}

    ranked = []
    for ticker, info in merged.items():
        combined = SVD_WEIGHT * info["svd"] + TFIDF_WEIGHT * info["tfidf"]
        result = dict(info["data"])
        result["score"] = combined
        if not result.get("explanation"):
            ex = tfidf_index.explain_for_ticker_query(
                q, STOPWORDS, ticker, score_breakdown_final=combined
            )
            if ex:
                result["explanation"] = ex
        ranked.append(result)

    ranked.sort(key=lambda x: x["score"], reverse=True)
    return ranked[:top_n]

def apply_preferences(results, preferences):
    """
    Reweight and filter results based on user preferences.

    preferences is a dict with optional keys:
      - risk_tolerance: "low" | "medium" | "high"
      - focus: "dividend" | "growth" | "any"
      - cap_preference: "large" | "mid" | "small" | "any"
    """
    if not preferences or not results:
        return results

    risk = preferences.get("risk_tolerance", "any")
    focus = preferences.get("focus", "any")
    cap_pref = preferences.get("cap_preference", "any")

    reweighted = []
    for r in results:
        score = r.get("score", 0)
        beta = r.get("beta", 1.0) or 1.0
        dividend = r.get("dividend_yield", 0) or 0
        market_cap = r.get("market_cap", 0) or 0

        multiplier = 1.0

        # Risk tolerance
        if risk == "low":
            if beta < 1.0:
                multiplier *= 1.2
            elif beta > 1.5:
                multiplier *= 0.6
        elif risk == "high":
            if beta > 1.5:
                multiplier *= 1.2
            elif beta < 0.8:
                multiplier *= 0.7

        # Focus
        if focus == "dividend":
            if dividend > 1.0:
                multiplier *= 1.3
            elif dividend == 0:
                multiplier *= 0.7
        elif focus == "growth":
            if dividend == 0 or dividend < 0.5:
                multiplier *= 1.2
            elif dividend > 2.0:
                multiplier *= 0.7

        # Market cap preference
        if cap_pref == "large" and market_cap < CAP_THRESHOLDS["large"]:
            multiplier *= 0.6
        elif cap_pref == "small" and market_cap > CAP_THRESHOLDS["small"]:
            multiplier *= 0.6
        elif cap_pref == "mid":
            if market_cap < CAP_THRESHOLDS["mid_low"] or market_cap > CAP_THRESHOLDS["large"]:
                multiplier *= 0.6

        result = dict(r)
        result["score"] = score * multiplier
        reweighted.append(result)

    reweighted.sort(key=lambda x: x["score"], reverse=True)
    return reweighted

def recommend_from_ticker_global_peers(ticker, top_n=6):
    index = get_company_tfidf_index(COMPANY_DATA_PATH, STOPWORDS)
    return index.similar_companies(ticker, top_n, STOPWORDS)

def register_routes(app):
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve(path):
        if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
            return send_from_directory(app.static_folder, path)
        else:
            return send_from_directory(app.static_folder, 'index.html')

    @app.route("/api/config")
    def config():
        return jsonify({"use_llm": USE_LLM})

    @app.route("/api/episodes")
    def episodes_search():
        text = request.args.get("title", "")
        return jsonify(json_search(text))
    
    @app.route("/api/recommend", methods=["POST"])
    def recommend():
        """
        Recommendation endpoint.

        Supports:
        - text queries like {"query": "AI semicondoctor companies"}
        - portfolio queries like {"portfolio": ["NVDA", "AMD"]}

        Returns:
        {
            "results": [...],
            "ai_query_suggestion": {...},
            "ai_recommendations": {...}
        }
        """
        data = request.get_json() or {}

        query = data.get("query", "")
        portfolio = data.get("portfolio", [])
        method = data.get("method", "hybrid")
        preferences = data.get("preferences", {})

        results = []
        llm_basis_query = ""

        if query:
            results = recommend_from_text_query(query, method=method)
            llm_basis_query = query
        elif portfolio:
            results = recommend_stocks(portfolio)
            llm_basis_query = " ".join(portfolio)
        else:
            results = [
            {"ticker": "AVGO", "name": "Broadcom"},
            {"ticker": "INTC", "name": "Intel"},
            {"ticker": "QCOM", "name": "Qualcomm"}
        ]
        
        if preferences:
            results = apply_preferences(results, preferences)

        response = {
            "results": results,
            "ai_query_suggestion": None,
            "ai_recommendations": None,
        }

        if USE_LLM and llm_basis_query and results:
            try:
                response["ai_query_suggestion"] = suggest_query(
                    llm_basis_query, 
                    results,
                )
                response["ai_recommendations"] = recommend_from_ir_results(
                    llm_basis_query,
                    results,
                )
            except Exception as e:
                response["ai_query_suggestion"] = {
                    "suggested_query": llm_basis_query,
                    "reason": f"LLM unavailable: {str(e)}",
                }
                response["ai_recommendations"] = {
                    "recommended_indices": [],
                    "summary": "LLM unavailable.",
                    "reasons": {},
                }

        return jsonify(response)

    @app.route("/api/peers/<ticker>")
    def global_peers(ticker: str):
        try:
            limit = int(request.args.get("limit") or "6")
        except Exception:
            limit = 6
        limit = max(1, min(20, limit))
        peers = recommend_from_ticker_global_peers(ticker, top_n=limit)
        return jsonify(peers)

    # tester code for making sure the routes are hit correctly
    # @app.route("/api/recommend", methods=["POST"])
    # def recommend():
    #     print("recommend route was hit")
    #     data = request.get_json()
    #     print("data received:", data)
    #     return jsonify({"ok": True, "data": data})

    @app.route("/api/companies")
    def companies_list():
        """
        Simple company browse/search endpoint.
        Query params:
          - q: substring match on ticker or name
          - sector: exact match filter
          - limit: max results (default 50, max 200)
        """
        q = (request.args.get("q") or "").strip()
        sector = (request.args.get("sector") or "").strip()
        try:
            limit = int(request.args.get("limit") or "50")
        except Exception:
            limit = 50
        limit = max(1, min(200, limit))

        query = Company.query
        if sector:
            query = query.filter(Company.sector == sector)
        if q:
            query = query.filter(
                db.or_(
                    Company.ticker.ilike(f"%{q}%"),
                    Company.name.ilike(f"%{q}%"),
                )
            )

        results = query.limit(limit).all()
        return jsonify([c.to_dict() for c in results])

    @app.route("/api/companies/<ticker>")
    def company_detail(ticker: str):
        t = (ticker or "").strip().upper()
        company = Company.query.get(t)
        if not company:
            return jsonify({"error": "Company not found"}), 404
        return jsonify(company.to_dict())
