from __future__ import annotations

import re
from typing import Any, Dict, List, Set, Tuple

_TOKEN_RE = re.compile(r"[a-zA-Z0-9]+")
_POSITIVE_TOKENS = {
    "growth", "growing", "profit", "profits", "profitable", "expansion",
    "innovative", "innovation", "leader", "strong", "efficient", "demand",
    "opportunity", "opportunities", "renewable", "advancement", "scalable",
}
_NEGATIVE_TOKENS = {
    "decline", "declining", "loss", "losses", "debt", "risk", "risks",
    "volatile", "volatility", "weak", "pressure", "lawsuit", "uncertain",
    "uncertainty", "downturn", "contraction",
}


def _tokenize_basic(text: str, stopwords: Set[str]) -> List[str]:
    out: List[str] = []
    for m in _TOKEN_RE.finditer(text or ""):
        token = m.group(0).lower()
        if len(token) < 2 or token in stopwords:
            continue
        out.append(token)
    return out


def estimate_description_sentiment(
    company: Dict[str, Any], stopwords: Set[str]
) -> Tuple[float, int, int]:
    desc = (company.get("description") or "").strip()
    if not desc:
        return 0.0, 0, 0
    tokens = _tokenize_basic(desc, stopwords)
    if not tokens:
        return 0.0, 0, 0
    pos = sum(1 for t in tokens if t in _POSITIVE_TOKENS)
    neg = sum(1 for t in tokens if t in _NEGATIVE_TOKENS)
    raw = pos - neg
    norm = raw / max(1, len(tokens))
    score = max(-1.0, min(1.0, norm * 8))
    return score, pos, neg


def top_related_terms_from_doc_vector(
    doc_vector: Dict[str, float],
    excluded_terms: Set[str],
    top_n: int = 5,
) -> List[Dict[str, Any]]:
    candidates = [
        (term, weight)
        for term, weight in doc_vector.items()
        if term not in excluded_terms and len(term) >= 3
    ]
    candidates.sort(key=lambda kv: kv[1], reverse=True)
    top = candidates[:top_n]
    total = sum(weight for _, weight in top) or 1.0
    out: List[Dict[str, Any]] = []
    for term, weight in top:
        out.append(
            {
                "term": term,
                "weight": round(weight, 6),
                "share": round(weight / total, 6),
            }
        )
    return out


def _market_cap_bucket(market_cap: Any) -> str:
    try:
        cap = float(market_cap)
    except Exception:
        return "Unknown-cap"
    if cap >= 200_000_000_000:
        return "Mega-cap"
    if cap >= 10_000_000_000:
        return "Large-cap"
    if cap >= 2_000_000_000:
        return "Mid-cap"
    return "Small-cap"


def _description_match_snippets(company: Dict[str, Any], terms: List[str]) -> List[str]:
    desc = (company.get("description") or "").strip()
    if not desc or not terms:
        return []
    desc_l = desc.lower()
    snippets: List[str] = []
    for term in terms:
        idx = desc_l.find(term.lower())
        if idx < 0:
            continue
        start = max(0, idx - 45)
        end = min(len(desc), idx + len(term) + 45)
        snippet = desc[start:end].strip()
        if start > 0:
            snippet = "..." + snippet
        if end < len(desc):
            snippet = snippet + "..."
        if snippet and snippet not in snippets:
            snippets.append(snippet)
        if len(snippets) >= 2:
            break
    return snippets


def build_stock_explanation(
    company: Dict[str, Any],
    top_terms: List[Tuple[str, float]],
    related_terms: List[Dict[str, Any]],
    original_query_terms: List[str],
    corrected_query_terms: List[str],
    sentiment_score: float,
    sentiment_pos_count: int,
    sentiment_neg_count: int,
    sentiment_impact: float,
    base_score: float,
    final_score: float,
) -> Dict[str, Any]:
    total_contrib = sum(contrib for _, contrib in top_terms) or 1.0
    matched_terms = []
    original_set = set(original_query_terms)
    corrected_set = set(corrected_query_terms)
    for term, contrib in top_terms:
        if term in original_set:
            match_type = "exact"
        elif term in corrected_set:
            match_type = "corrected"
        else:
            match_type = "related"
        matched_terms.append(
            {
                "term": term,
                "contribution": round(contrib, 6),
                "share": round(contrib / total_contrib, 6),
                "match_type": match_type,
            }
        )

    reason_bits: List[str] = []
    q_terms_unique = list(dict.fromkeys(corrected_query_terms))
    matched_q_terms = [t for t in q_terms_unique if any(mt["term"] == t for mt in matched_terms)]

    if matched_terms:
        top_term_text = ", ".join(
            f"{t['term']} ({int(round(float(t['share']) * 100))}%)"
            for t in matched_terms[:3]
        )
        if matched_q_terms:
            reason_bits.append(f"Keyword match: {top_term_text}")
        else:
            reason_bits.append(f"Closest TF-IDF concepts: {top_term_text}")
    else:
        reason_bits.append("General text similarity match")

    sector = (company.get("sector") or "").strip()
    industry = (company.get("industry") or "").strip()
    q_terms = set(corrected_query_terms)
    sector_overlap = [
        tok for tok in _tokenize_basic(sector, set()) if tok in q_terms
    ] if sector else []
    industry_overlap = [
        tok for tok in _tokenize_basic(industry, set()) if tok in q_terms
    ] if industry else []

    market_cap_bucket = _market_cap_bucket(company.get("marketCap"))
    profile_bits = []
    if sector:
        profile_bits.append(f"{sector} sector")
    if industry:
        profile_bits.append(f"{industry} industry")
    profile_bits.append(f"{market_cap_bucket} profile")
    reason_bits.append(f"Company profile: {', '.join(profile_bits)}")

    if sentiment_impact > 0.002:
        sentiment_label = "positive"
    elif sentiment_impact < -0.002:
        sentiment_label = "negative"
    else:
        sentiment_label = "neutral"
    reason_bits.append(
        f"Sentiment: {sentiment_label} ({sentiment_pos_count} positive vs {sentiment_neg_count} negative cues, impact {sentiment_impact:+.3f})"
    )
    if related_terms:
        reason_bits.append(
            "Related terms in company profile: "
            + ", ".join(rt["term"] for rt in related_terms[:3])
        )

    snippets = _description_match_snippets(company, [t["term"] for t in matched_terms[:3]])
    short_bits = []
    if matched_q_terms:
        short_bits.append(f"matched on {', '.join(matched_q_terms[:2])}")
    elif matched_terms:
        short_bits.append(f"matched concepts {', '.join(t['term'] for t in matched_terms[:2])}")
    short_bits.append(market_cap_bucket.lower())
    short_bits.append(f"{sentiment_label} sentiment")
    short = " + ".join(short_bits[:3])

    return {
        "short": short,
        "reasons": reason_bits,
        "matched_terms": matched_terms,
        "snippets": snippets,
        "query_terms": q_terms_unique,
        "semantic_matches": [rt["term"] for rt in related_terms[:5]],
        "semantic_match_details": related_terms[:5],
        "feature_matches": {
            "sector_query_overlap": bool(sector_overlap),
            "industry_query_overlap": bool(industry_overlap),
            "market_cap_bucket": market_cap_bucket,
        },
        "score_breakdown": {
            "text_similarity": round(base_score, 6),
            "sentiment_impact": round(sentiment_impact, 6),
            "final_score": round(final_score, 6),
        },
        "sentiment": {
            "available": True,
            "score": round(sentiment_score, 6),
            "impact": round(sentiment_impact, 6),
            "positive_cues": sentiment_pos_count,
            "negative_cues": sentiment_neg_count,
            "note": "Sentiment is estimated from company description language.",
        },
    }
