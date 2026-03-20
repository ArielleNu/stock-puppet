"""
Routes: React app serving and episode search API.

To enable AI chat, set USE_LLM = True below. See llm_routes.py for AI code.
"""
import os
import json
from flask import send_from_directory, request, jsonify
from models import db, Episode, Review, Company

# ── AI toggle ────────────────────────────────────────────────────────────────
USE_LLM = False
# USE_LLM = True
# ─────────────────────────────────────────────────────────────────────────────

# words we don't care about in the descriptions of companies
STOPWORDS = {
    "the", "and", "or", "of", "in", "to", "for", "a", "an", "with", "that"
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
    
    # normalize tickers
    portfolio = [ticker.upper().strip() for ticker in portfolio if ticker.strip()]

    # portfolio_companies = Company.query.filter(Company.ticker.in_(portfolio)).all()
    # TODO: Finish
    raise NotImplementedError

def recommend_from_text_query(query, top_n=10):
    """
    Returns companies whose descriptions best match the query.

    Parameters
    ----------
    query : str
        A text query provided by the user.
        Example: "AI semiconductor companies"
        
    top_n : int
        Number of recommendations to return.

    Returns
    -------
    List[Dict[str, Any]]
        A list of dictionaries representing the top recommended 
        companies ranked by relevance to the user's query.
    """
    if not query or not query.strip():
        return []
    
    query_words = [w for w in query.lower().split() if w not in STOPWORDS]

    # database:
    # companies = Company.query.all()

    # json:
    with open("src/data/company-data.json", "r") as f:
        companies = json.load(f)

    scored_results = []

    for company in companies:
        # database:
        # description = (company.description or "").lower()
        # sector = (company.sector or "").lower()
        # industry = (company.industry or "").lower()
        # name = (company.name or "").lower()

        # json:
        description = company.get("description", "").lower()
        sector = company.get("sector", "").lower()
        industry = company.get("industry", "").lower()
        name = company.get("companyName", "").lower()


        score = 0

        for word in query_words:
            if word in description:
                score += 1
            if word in sector:
                score += 2
            if word in industry:
                score += 2
            if word in name:
                score += 1

        if score > 0:
            # database:
            # scored_results.append({
            #     "ticker": company.ticker,
            #     "name": company.name,
            #     "sector": company.sector,
            #     "industry": company.industry,
            #     "market_cap": company.market_cap,
            #     "dividend_yield": company.dividend_yield,
            #     "description": company.description,
            #     "website": company.website,
            #     "score": score
            # })

            # json:
            scored_results.append({
                "ticker": company.get("symbol"),
                "name": company.get("companyName"),
                "sector": company.get("sector"),
                "industry": company.get("industry"),
                "market_cap": company.get("marketCap"),
                "dividend_yield": company.get("lastDividend"),
                "description": company.get("description"),
                "website": company.get("website"),
                "score": score
            })

    scored_results.sort(key = lambda x: x["score"], reverse=True)
    return scored_results[:top_n]

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
        Baseline recommendation endpoint.

        Supports:
        - text queries like {"query": "AI semicondoctor companies"}
        - portfolio queries like {"portfolio": ["NVDA", "AMD"]}
        """
        data = request.get_json() or {}

        query = data.get("query", "")
        portfolio = data.get("portfolio", [])

        if query:
            results = recommend_from_text_query(query)
            return jsonify(results)
        
        if portfolio:
            results = recommend_stocks(portfolio)
            return jsonify(results)


        # TODO: replace placeholder results with ranking based on Company data
        results = [
            {"ticker": "AVGO", "name": "Broadcom"},
            {"ticker": "INTC", "name": "Intel"},
            {"ticker": "QCOM", "name": "Qualcomm"}
        ]

        return jsonify(results)

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

    if USE_LLM:
        from llm_routes import register_chat_route
        register_chat_route(app, json_search)
