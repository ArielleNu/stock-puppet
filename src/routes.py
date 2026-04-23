"""
HTTP routes: React app serving and the stock recommendation API.

Ranking logic lives in ``recommender.py``; this module only glues it to
Flask endpoints.  To enable the AI chat, set ``USE_LLM = True`` below and
see ``llm_routes.py`` for the chat implementation.
"""
import os

from flask import jsonify, request, send_from_directory

from models import Company, Episode, Review, db
from recommender import (
    COMPANY_DATA_PATH,
    STOPWORDS,
    apply_preferences,
    build_compare_payload,
    recommend_from_text_query,
    recommend_from_ticker_global_peers,
    recommend_stocks,
)
from svd_index import get_company_svd_index

# ── AI toggle ────────────────────────────────────────────────────────────────
USE_LLM = False
# USE_LLM = True
# ─────────────────────────────────────────────────────────────────────────────


def _parse_int_arg(name: str, default: int, lo: int, hi: int) -> int:
    """Parse an integer request arg, clamped to [lo, hi]."""
    try:
        value = int(request.args.get(name) or default)
    except (TypeError, ValueError):
        value = default
    return max(lo, min(hi, value))


def json_search(query: str):
    """Substring search over Episodes (used by the optional LLM chat route)."""
    if not query or not query.strip():
        query = "Kardashian"
    results = (
        db.session.query(Episode, Review)
        .join(Review, Episode.id == Review.id)
        .filter(Episode.title.ilike(f"%{query}%"))
        .all()
    )
    return [
        {
            "title": episode.title,
            "descr": episode.descr,
            "imdb_rating": review.imdb_rating,
        }
        for episode, review in results
    ]


def register_routes(app):
    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve(path):
        if path and os.path.exists(os.path.join(app.static_folder, path)):
            return send_from_directory(app.static_folder, path)
        return send_from_directory(app.static_folder, "index.html")

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
          - text queries like ``{"query": "AI semiconductor companies"}``
          - portfolio queries like ``{"portfolio": ["NVDA", "AMD"]}``
          - ``method`` = "hybrid" (default) | "svd" | "tfidf"
        """
        data = request.get_json() or {}
        query = data.get("query", "")
        portfolio = data.get("portfolio", [])
        method = data.get("method", "hybrid")
        preferences = data.get("preferences", {})

        if query:
            results = recommend_from_text_query(query, method=method)
        elif portfolio:
            results = recommend_stocks(portfolio)
        else:
            return jsonify([])

        if preferences:
            results = apply_preferences(results, preferences)
        return jsonify(results)

    @app.route("/api/recommend/compare", methods=["POST"])
    def recommend_compare():
        """
        Run the same query through both pipelines (with / without SVD) and
        return a side-by-side ranking comparison.
        """
        data = request.get_json() or {}
        query = (data.get("query") or "").strip()
        try:
            top_n = int(data.get("top_n") or 10)
        except (TypeError, ValueError):
            top_n = 10
        top_n = max(1, min(top_n, 25))
        return jsonify(build_compare_payload(query, top_n))

    @app.route("/api/svd/dimensions")
    def svd_dimensions():
        """Catalog of every latent SVD dimension and its top defining terms."""
        limit = _parse_int_arg("limit", default=0, lo=0, hi=10_000)
        index = get_company_svd_index(COMPANY_DATA_PATH, STOPWORDS)
        dims = index.list_dimensions(top_k_terms=6)
        if limit > 0:
            dims = dims[:limit]
        return jsonify({"n_components": index.n_components, "dimensions": dims})

    @app.route("/api/peers/<ticker>")
    def global_peers(ticker: str):
        limit = _parse_int_arg("limit", default=6, lo=1, hi=20)
        return jsonify(recommend_from_ticker_global_peers(ticker, top_n=limit))

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
        limit = _parse_int_arg("limit", default=50, lo=1, hi=200)

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
        return jsonify([c.to_dict() for c in query.limit(limit).all()])

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
