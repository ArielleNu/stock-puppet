"""
Routes: React app serving and episode search API.

To enable AI chat, set USE_LLM = True below. See llm_routes.py for AI code.
"""
import os
from flask import send_from_directory, request, jsonify
from models import db, Episode, Review, Company

# ── AI toggle ────────────────────────────────────────────────────────────────
USE_LLM = False
# USE_LLM = True
# ─────────────────────────────────────────────────────────────────────────────


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
