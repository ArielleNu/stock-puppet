"""
TF-IDF retrieval with an inverted index and cosine similarity.

"""
from __future__ import annotations

import json
import math
import os
import re
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple
from explainability import (
    build_stock_explanation,
    estimate_description_sentiment,
    top_related_terms_from_doc_vector,
)

_TOKEN_RE = re.compile(r"[a-zA-Z0-9]+")


def tokenize(text: str, stopwords: Set[str]) -> List[str]:
    """Lowercase alphanumeric tokens; drop stopwords and single-character runs."""
    out: List[str] = []
    for m in _TOKEN_RE.finditer(text or ""):
        t = m.group(0).lower()
        if len(t) < 2 or t in stopwords:
            continue
        out.append(t)
    return out


def _company_to_doc_text(company: Dict[str, Any]) -> str:
    sym = (company.get("symbol") or "").strip()
    name = (company.get("companyName") or "").strip()
    sector = (company.get("sector") or "").strip()
    industry = (company.get("industry") or "").strip()
    desc = (company.get("description") or "").strip()
    parts = [
        f"{sym} {sym}" if sym else "",
        f"{name} {name}" if name else "",
        f"{sector} {sector}" if sector else "",
        f"{industry} {industry}" if industry else "",
        desc,
    ]
    return " ".join(p for p in parts if p)


def _tf_weight(count: int) -> float:
    """Logarithmic term frequency (1 + log(count)) for count >= 1."""
    if count <= 0:
        return 0.0
    return 1.0 + math.log(count)


def _company_to_api_dict(
    company: Dict[str, Any],
    score: float,
    explanation: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    out = {
        "ticker": company.get("symbol"),
        "name": company.get("companyName"),
        "sector": company.get("sector"),
        "industry": company.get("industry"),
        "market_cap": company.get("marketCap"),
        "dividend_yield": company.get("lastDividend"),
        "beta": company.get("beta"),
        "description": company.get("description"),
        "website": company.get("website"),
        "image": company.get("image"),
        "city": company.get("city"),
        "state": company.get("state"),
        "country": company.get("country"),
        "score": score,
    }
    if explanation:
        out["explanation"] = explanation
    return out


def _edit_distance(s1: str, s2: str) -> int:
    # computing the standard edit distance
    if len(s1) < len(s2):
        return _edit_distance(s2, s1)
    prev = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        curr = [i + 1]
        for j, c2 in enumerate(s2):
            curr.append(min(
                prev[j + 1] + 1,
                curr[j] + 1,
                prev[j] + (0 if c1 == c2 else 1),
            ))
        prev = curr
    return prev[-1]
class CompanyTfidfIndex:
    """
    Inverted index: term -> list of (doc_id, tfidf_weight).
    doc_norms[i] = L2 norm of the TF-IDF vector for document i.
    """

    def __init__(
        self,
        companies: List[Dict[str, Any]],
        inverted: Dict[str, List[Tuple[int, float]]],
        idf: Dict[str, float],
        doc_norms: List[float],
        doc_vectors: List[Dict[str, float]],
        symbol_to_doc_id: Dict[str, int],
    ) -> None:
        self.companies = companies
        self._inverted = inverted
        self._idf = idf
        self._doc_norms = doc_norms
        self._doc_vectors = doc_vectors
        self._symbol_to_doc_id = symbol_to_doc_id
        self._n_docs = len(companies)

    @classmethod
    def build(cls, companies: List[Dict[str, Any]], stopwords: Set[str]) -> CompanyTfidfIndex:
        n_docs = len(companies)
        if n_docs == 0:
            return cls([], {}, {}, [], [], {})

        doc_term_tf: List[Counter] = []
        df: Counter = Counter()

        for c in companies:
            tokens = tokenize(_company_to_doc_text(c), stopwords)
            tf = Counter(tokens)
            doc_term_tf.append(tf)
            df.update(tf.keys())

        idf: Dict[str, float] = {}
        for term, dfi in df.items():
            # Smoothed IDF (idf > 0 when dfi <= n_docs)
            idf[term] = math.log((n_docs + 1) / (dfi + 1)) + 1.0

        inverted: Dict[str, List[Tuple[int, float]]] = defaultdict(list)
        doc_norm_sq = [0.0] * n_docs
        doc_vectors: List[Dict[str, float]] = [{} for _ in range(n_docs)]

        for doc_id, tf in enumerate(doc_term_tf):
            for term, cnt in tf.items():
                w = _tf_weight(cnt) * idf[term]
                inverted[term].append((doc_id, w))
                doc_norm_sq[doc_id] += w * w
                doc_vectors[doc_id][term] = w

        doc_norms = [math.sqrt(s) for s in doc_norm_sq]
        symbol_to_doc_id: Dict[str, int] = {}
        for doc_id, company in enumerate(companies):
            symbol = (company.get("symbol") or "").strip().upper()
            if symbol:
                symbol_to_doc_id[symbol] = doc_id
        return cls(
            companies,
            dict(inverted),
            idf,
            doc_norms,
            doc_vectors,
            symbol_to_doc_id,
        )

    def _prepare_query_weights(
        self, query: str, stopwords: Set[str]
    ) -> Optional[Tuple[List[str], List[str], Dict[str, float], float]]:
        """Tokenize query, map OOV tokens to nearest vocab, return TF-IDF query vector."""
        q_tokens = tokenize(query, stopwords)
        if not q_tokens:
            return None

        corrected = []
        for t in q_tokens:
            if t in self._idf:
                corrected.append(t)
            else:
                best_term, best_dist = None, float("inf")
                for vocab_term in self._idf:
                    if abs(len(vocab_term) - len(t)) > 2:
                        continue
                    d = _edit_distance(t, vocab_term)
                    if d < best_dist:
                        best_dist = d
                        best_term = vocab_term
                if best_term and best_dist <= 2:
                    corrected.append(best_term)

        if not corrected:
            return None

        q_tf = Counter(corrected)
        q_weights: Dict[str, float] = {}
        for term, cnt in q_tf.items():
            if term not in self._idf:
                continue
            q_weights[term] = _tf_weight(cnt) * self._idf[term]

        if not q_weights:
            return None

        norm_q = math.sqrt(sum(w * w for w in q_weights.values()))
        if norm_q == 0:
            return None

        return q_tokens, corrected, q_weights, norm_q

    def explain_for_ticker_query(
        self,
        query: str,
        stopwords: Set[str],
        ticker: str,
        *,
        score_breakdown_final: Optional[float] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Build TF-IDF-based explainability for one company vs a text query.
        Used to attach explanations to SVD / hybrid rows that lack them.
        """
        prep = self._prepare_query_weights(query, stopwords)
        if not prep:
            return None
        q_tokens, corrected, q_weights, norm_q = prep
        doc_id = self._symbol_to_doc_id.get(ticker.strip().upper())
        if doc_id is None:
            return None

        dot = 0.0
        term_contribs: Dict[str, float] = defaultdict(float)
        for term, qw in q_weights.items():
            postings = self._inverted.get(term)
            if not postings:
                continue
            for did, w_td in postings:
                if did != doc_id:
                    continue
                contrib = qw * w_td
                dot += contrib
                term_contribs[term] += contrib

        dn = self._doc_norms[doc_id]
        if dn == 0 or norm_q == 0:
            return None

        base_cos = dot / (norm_q * dn) if dot > 0 else 0.0
        top_terms = sorted(
            term_contribs.items(), key=lambda kv: kv[1], reverse=True
        )[:5]

        sent, sent_pos, sent_neg = estimate_description_sentiment(
            self.companies[doc_id], stopwords
        )
        sentiment_weight = 0.08
        tfidf_final = (
            base_cos * (1.0 + sentiment_weight * sent) if base_cos > 0 else 0.0
        )
        sent_impact = tfidf_final - base_cos

        excluded = set(q_tokens) | set(corrected)
        related_terms = top_related_terms_from_doc_vector(
            self._doc_vectors[doc_id], excluded, top_n=5
        )

        final_for_explanation = (
            score_breakdown_final if score_breakdown_final is not None else tfidf_final
        )

        explanation = build_stock_explanation(
            self.companies[doc_id],
            top_terms,
            related_terms,
            q_tokens,
            corrected,
            sent,
            sent_pos,
            sent_neg,
            sent_impact,
            base_cos,
            final_for_explanation,
        )

        if base_cos < 1e-9 and score_breakdown_final is not None and score_breakdown_final > 0.05:
            note = (
                "Strong latent (embedding) similarity with the query; "
                "little or no direct keyword overlap in the text index."
            )
            reasons = explanation.get("reasons") or []
            explanation["reasons"] = [note] + list(reasons)

        if score_breakdown_final is not None:
            sb = explanation.get("score_breakdown") or {}
            sb["final_score"] = round(score_breakdown_final, 6)
            explanation["score_breakdown"] = sb

        return explanation

    def search(self, query: str, stopwords: Set[str], top_n: int) -> List[Dict[str, Any]]:
        if top_n <= 0 or not self.companies:
            return []

        prep = self._prepare_query_weights(query, stopwords)
        if not prep:
            return []

        q_tokens, corrected, q_weights, norm_q = prep

        dot_acc: Dict[int, float] = defaultdict(float)
        term_contrib_acc: Dict[int, Dict[str, float]] = defaultdict(lambda: defaultdict(float))
        for term, qw in q_weights.items():
            postings = self._inverted.get(term)
            if not postings:
                continue
            for doc_id, w_td in postings:
                contrib = qw * w_td
                dot_acc[doc_id] += contrib
                term_contrib_acc[doc_id][term] += contrib

        scored: List[Tuple[int, float, float, int, int, float, float]] = []
        sentiment_weight = 0.08
        for doc_id, dot in dot_acc.items():
            dn = self._doc_norms[doc_id]
            if dn == 0:
                continue
            base_cos = dot / (norm_q * dn)
            if base_cos <= 0:
                continue
            sent, sent_pos, sent_neg = estimate_description_sentiment(
                self.companies[doc_id], stopwords
            )
            final_score = base_cos * (1.0 + sentiment_weight * sent)
            if final_score > 0:
                scored.append(
                    (doc_id, final_score, sent, sent_pos, sent_neg, final_score - base_cos, base_cos)
                )

        scored.sort(key=lambda x: x[1], reverse=True)
        out: List[Dict[str, Any]] = []
        for doc_id, score, sent, sent_pos, sent_neg, sent_impact, base_cos in scored[:top_n]:
            term_contribs = term_contrib_acc.get(doc_id, {})
            top_terms = sorted(
                term_contribs.items(), key=lambda kv: kv[1], reverse=True
            )[:5]
            excluded = set(q_tokens) | set(corrected)
            related_terms = top_related_terms_from_doc_vector(
                self._doc_vectors[doc_id], excluded, top_n=5
            )
            explanation = build_stock_explanation(
                self.companies[doc_id],
                top_terms,
                related_terms,
                q_tokens,
                corrected,
                sent,
                sent_pos,
                sent_neg,
                sent_impact,
                base_cos,
                score,
            )
            api_item = _company_to_api_dict(self.companies[doc_id], score, explanation)
            api_item["sentiment"] = sent
            out.append(api_item)
        return out

    def similar_companies(
        self, ticker: str, top_n: int, stopwords: Set[str]
    ) -> List[Dict[str, Any]]:
        if top_n <= 0 or not ticker:
            return []
        doc_id = self._symbol_to_doc_id.get(ticker.strip().upper())
        if doc_id is None:
            return []

        center_norm = self._doc_norms[doc_id]
        if center_norm == 0:
            return []

        anchor_company = self.companies[doc_id]
        query_text = _company_to_doc_text(anchor_company)

        dot_acc: Dict[int, float] = defaultdict(float)
        center_vec = self._doc_vectors[doc_id]
        for term, w_center in center_vec.items():
            postings = self._inverted.get(term, [])
            for other_doc_id, w_other in postings:
                if other_doc_id == doc_id:
                    continue
                dot_acc[other_doc_id] += w_center * w_other

        scored: List[Tuple[int, float]] = []
        for other_doc_id, dot in dot_acc.items():
            other_norm = self._doc_norms[other_doc_id]
            if other_norm == 0:
                continue
            cos = dot / (center_norm * other_norm)
            if cos > 0:
                scored.append((other_doc_id, cos))

        scored.sort(key=lambda x: x[1], reverse=True)
        out: List[Dict[str, Any]] = []
        for other_doc_id, cos in scored[:top_n]:
            company = self.companies[other_doc_id]
            sym = (company.get("symbol") or "").strip().upper()
            explanation = None
            if sym:
                explanation = self.explain_for_ticker_query(
                    query_text,
                    stopwords,
                    sym,
                    score_breakdown_final=cos,
                )
            out.append(_company_to_api_dict(company, cos, explanation))
        return out


_index_cache: Optional[Tuple[Tuple[float, Tuple[str, ...]], CompanyTfidfIndex]] = None


def get_company_tfidf_index(data_path: str, stopwords: Set[str]) -> CompanyTfidfIndex:
    """Load JSON companies and rebuild the index when the file or stopwords change."""
    global _index_cache
    mtime = os.path.getmtime(data_path)
    sw_key = tuple(sorted(stopwords))
    cache_key = (mtime, sw_key)
    if _index_cache is not None and _index_cache[0] == cache_key:
        return _index_cache[1]

    with open(data_path, "r", encoding="utf-8") as f:
        companies = json.load(f)
    if not isinstance(companies, list):
        companies = []

    index = CompanyTfidfIndex.build(companies, stopwords)
    _index_cache = (cache_key, index)
    return index
