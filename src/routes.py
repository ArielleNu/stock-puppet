"""
Routes: React app serving and episode search API.

To enable AI chat, set USE_LLM = True below. See llm_routes.py for AI code.
"""
import json
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

    # TODO: Finish

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
        data = request.get_json()
        portfolio = data.get("portfolio", [])

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

    if USE_LLM:
        from llm_routes import register_chat_route
        register_chat_route(app, json_search)
