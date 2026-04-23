"""
SVD embedding index for semantic company search.

Takes the same company JSON as tfidf_index.py but compresses the TF-IDF
matrix with Truncated SVD.  This captures latent topic structure so that
queries like "electric vehicles" can match companies whose descriptions say
"EV maker" even without exact token overlap.
"""
from __future__ import annotations

import json
import math
import os
from typing import Any, Dict, List, Optional, Set, Tuple

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.decomposition import TruncatedSVD
from sklearn.preprocessing import normalize


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


def _company_to_api_dict(company: Dict[str, Any], score: float) -> Dict[str, Any]:
    return {
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
        "score": score,
    }


class CompanySvdIndex:
    def __init__(self, companies, doc_embeddings, vectorizer, svd):
        self.companies = companies
        self.doc_embeddings = doc_embeddings
        self._vectorizer = vectorizer
        self._svd = svd

    @classmethod
    def build(cls, companies, stopwords, n_components=100):
        if not companies:
            empty_vec = TfidfVectorizer()
            empty_svd = TruncatedSVD(n_components=2)
            return cls([], np.empty((0, 0)), empty_vec, empty_svd)

        docs = [_company_to_doc_text(c) for c in companies]

        vectorizer = TfidfVectorizer(
            stop_words=list(stopwords),
            token_pattern=r"[a-zA-Z0-9]+",
            min_df=1,
            sublinear_tf=True,
        )
        tfidf_matrix = vectorizer.fit_transform(docs)

        n_components = min(n_components, tfidf_matrix.shape[0] - 1, tfidf_matrix.shape[1] - 1)

        svd = TruncatedSVD(n_components=n_components, random_state=42)
        doc_embeddings = svd.fit_transform(tfidf_matrix)
        doc_embeddings = normalize(doc_embeddings, norm="l2")

        return cls(companies, doc_embeddings, vectorizer, svd)

    def search(self, query, top_n=10):
        if top_n <= 0 or len(self.companies) == 0:
            return []
        if not query or not query.strip():
            return []

        q_tfidf = self._vectorizer.transform([query])
        q_embed = self._svd.transform(q_tfidf)

        norm = np.linalg.norm(q_embed)
        if norm == 0:
            return []
        q_embed = q_embed / norm

        scores = (self.doc_embeddings @ q_embed.T).flatten()
        top_indices = np.argsort(scores)[::-1][:top_n]

        out = []
        for idx in top_indices:
            s = float(scores[idx])
            if s > 0:
                out.append(_company_to_api_dict(self.companies[idx], s))
        return out


_svd_cache = None


def get_company_svd_index(data_path, stopwords, n_components=100):
    global _svd_cache
    mtime = os.path.getmtime(data_path)
    sw_key = tuple(sorted(stopwords))
    cache_key = (mtime, sw_key, n_components)
    if _svd_cache is not None and _svd_cache[0] == cache_key:
        return _svd_cache[1]

    with open(data_path, "r", encoding="utf-8") as f:
        companies = json.load(f)
    if not isinstance(companies, list):
        companies = []

    index = CompanySvdIndex.build(companies, stopwords, n_components)
    _svd_cache = (cache_key, index)
    return index