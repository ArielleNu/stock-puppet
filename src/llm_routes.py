"""
LLM chat route — only loaded when USE_LLM = True in routes.py.
Adds a POST /api/chat endpoint that performs LLM-driven RAG.

Setup:
  1. Add API_KEY=your_key to .env
  2. Set USE_LLM = True in routes.py
"""
import json
import os
import re
import logging
from flask import request, jsonify, Response, stream_with_context
from typing import Any, Dict, List
from infosci_spark_client import LLMClient

logger = logging.getLogger(__name__)

def get_llm_client() -> LLMClient:
    api_key = os.getenv("SPARK_API_KEY")
    if not api_key:
        raise RuntimeError("SPARK_API_KEY not set - add it to your .env file")
    return LLMClient(api_key = api_key)

def try_parse_json(text: str) -> Dict[str, Any]:
    text = (text or "").strip()
    if not text:
        return {}
    
    try:
        return json.loads(text)
    except Exception:
        pass

    if "```" in text:
        chunks = text.split("```")
        for chunk in chunks:
            cleaned = chunk.strip()
            if cleaned.startswith("json"):
                cleaned = cleaned[4:].strip()
            try:
                return json.loads(cleaned)
            except Exception:
                continue

    return {}

def build_result_context(results: List[Dict[str, Any]], max_results: int = 8) -> str:
    lines = []
    for i, r in enumerate(results[:max_results]):
        explanation = r.get("explanation") or {}
        lines.append(
            f"""Result {i}
Ticker: {r.get('ticker', '')}
Name: {r.get('name', '')}
Sector: {r.get('sector', '')}
Industry: {r.get('industry', '')}
Description: {r.get('description', '')}
IR Explanation: {explanation.get('short', '')}
            """
        )
    return "\n\n".join(lines)
    

def suggest_query(user_query: str, results: List[Dict[str, Any]]) -> Dict[str, Any]:
    client = get_llm_client()
    result_context  = build_result_context(results, max_results=5)

    messages = [
        {
            "role": "system",
            "content": (
                "You help improve search queries for a stock recommendation app. "
                "Return valid JSON only."
            ),
        },
        {
            "role": "user",
            "content": f"""
The user has entered this query:
"{user_query}"

These are the top retrieved results from the IR system:
{result_context}

Return JSON in exactly this format:
{{
    "suggested_query": "short improved query",
    "reason": "one short sentence"
}}

Rules:
- Keep the suggested query under 20 words.
- Make it more specific and retrieval-friendly.
- Do not change the user's intent.
- Do not invent companies that were not implied by the results.
""",
        },
    ]

    response = client.chat(messages)
    parsed = try_parse_json(response.get("content", ""))

    return {
        "suggested_query": parsed.get("suggested_query", user_query),
        "reason": parsed.get("reason", "AI suggestion unavailable.")
    }

def recommend_from_ir_results(user_query: str, results: List[Dict[str, Any]]) -> Dict[str, Any]:
    client = get_llm_client()
    result_context = build_result_context(results, max_results=10)

    messages = [
        {
            "role": "system",
            "content": (
                "You are doing grounded RAG for a stock recommendation app. "
                "You must only choose from the provided IR results. "
                "Return a valid JSON only."
            ),
        },
        {
            "role": "user",
            "content": f"""
User query:
"{user_query}"

These are the retrieved results from the IR system:
{result_context}

Return JSON in exactly this format:
{{
    "recommended_indices": [0, 2, 4],
    "summary": "1-2 sentence explanation',
    "reasons": {{
      "0": "why this result matches",
      "2": "why this result matches",
      "4": "why this result matches"
    }}
}}

Rules:
- Choose 3 results.
- Only choose from the provided results.
- Base your reasoning on the descriptions, sectors, industries, and the IR explanation.
""",
        },
    ]

    response = client.chat(messages)
    parsed = try_parse_json(response.get("content", ""))

    indices = parsed.get("recommended_indices", [])
    if not isinstance(indices, list):
        indices = []

    clean_indices = [
        idx for idx in indices
        if isinstance(idx, int) and 0 <= idx < len(results)
    ]

    reasons = parsed.get("reasons", {})
    if not isinstance(reasons, dict):
        reasons = {}

    return {
        "recommended_indices": clean_indices,
        "summary": parsed.get("summary", "AI recommendations unavailable."),
        "reasons": reasons,
    }


def llm_search_decision(client, user_message):
    """Ask the LLM whether to search the DB and which word to use."""
    messages = [
        {
            "role": "system",
            "content": (
                "You have access to a database of Keeping Up with the Kardashians episode titles, "
                "descriptions, and IMDB ratings. Search is by a single word in the episode title. "
                "Reply with exactly: YES followed by one space and ONE word to search (e.g. YES wedding), "
                "or NO if the question does not need episode data."
            ),
        },
        {"role": "user", "content": user_message},
    ]
    response = client.chat(messages)
    content = (response.get("content") or "").strip().upper()
    logger.info(f"LLM search decision: {content}")
    if re.search(r"\bNO\b", content) and not re.search(r"\bYES\b", content):
        return False, None
    yes_match = re.search(r"\bYES\s+(\w+)", content)
    if yes_match:
        return True, yes_match.group(1).lower()
    if re.search(r"\bYES\b", content):
        return True, "Kardashian"
    return False, None


def register_chat_route(app, json_search):
    """Register the /api/chat SSE endpoint. Called from routes.py."""

    @app.route("/api/chat", methods=["POST"])
    def chat():
        data = request.get_json() or {}
        user_message = (data.get("message") or "").strip()
        if not user_message:
            return jsonify({"error": "Message is required"}), 400

        api_key = os.getenv("SPARK_API_KEY")
        if not api_key:
            raise RuntimeError("SPARK_API_KEY not set - add it to your .env file")

        client = LLMClient(api_key=api_key)
        use_search, search_term = llm_search_decision(client, user_message)

        if use_search:
            episodes = json_search(search_term or "Kardashian")
            context_text = "\n\n---\n\n".join(
                f"Title: {ep['title']}\nDescription: {ep['descr']}\nIMDB Rating: {ep['imdb_rating']}"
                for ep in episodes
            ) or "No matching episodes found."
            messages = [
                {"role": "system", "content": "Answer questions about Keeping Up with the Kardashians using only the episode information provided."},
                {"role": "user", "content": f"Episode information:\n\n{context_text}\n\nUser question: {user_message}"},
            ]
        else:
            messages = [
                {"role": "system", "content": "You are a helpful assistant for Keeping Up with the Kardashians questions."},
                {"role": "user", "content": user_message},
            ]

        def generate():
            if use_search and search_term:
                yield f"data: {json.dumps({'search_term': search_term})}\n\n"
            try:
                for chunk in client.chat(messages, stream=True):
                    if chunk.get("content"):
                        yield f"data: {json.dumps({'content': chunk['content']})}\n\n"
            except Exception as e:
                logger.error(f"Streaming error: {e}")
                yield f"data: {json.dumps({'error': 'Streaming error occurred'})}\n\n"

        return Response(
            stream_with_context(generate()),
            mimetype="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
