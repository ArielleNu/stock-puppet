"""
SVD embedding index for semantic company search.

Takes the same company JSON as tfidf_index.py but compresses the TF-IDF
matrix with Truncated SVD.  This captures latent topic structure so that
queries like "electric vehicles" can match companies whose descriptions say
"EV maker" even without exact token overlap.

This module also exposes helpers to *introspect* the latent dimensions so the
UI can show users why a company matched: which latent concepts are shared,
how strongly the query and the company activate each concept, and which
words define each concept.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.decomposition import TruncatedSVD
from sklearn.preprocessing import normalize


_DIM_LABEL_STOPWORDS = {
    # entity suffixes
    "inc", "corp", "corporation", "company", "companies", "co", "ltd", "llc",
    "plc", "group", "holding", "holdings", "international", "global",
    # generic verbs / connectors common in 10-K boilerplate
    "the", "and", "for", "with", "from", "into", "that", "this", "their",
    "its", "they", "have", "has", "had", "are", "was", "were", "been",
    "being", "use", "used", "using", "make", "makes", "made", "include",
    "includes", "including", "various", "well", "also", "such", "provides",
    "provider", "providers", "products", "product", "services", "service",
    "offers", "offering", "operates", "subsidiary", "subsidiaries", "segment",
    "segments", "operating", "primarily", "located", "headquartered",
    "principally", "additionally", "engages", "engage", "engaged",
    "approximately", "manufactures", "manufacturing", "designs", "designed",
    "develops", "developed", "development", "based", "business", "businesses",
    "customers", "customer", "market", "markets", "marketing", "industry",
    "industries", "solutions", "solution", "platform", "platforms",
    "technology", "technologies", "system", "systems", "applications",
    "application", "support", "related", "across",
    # common date / number-ish noise
    "year", "years", "period", "quarter",
}


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


def _humanize_label(top_terms: List[str]) -> str:
    """Turn the top distinctive terms of a dimension into a short readable label."""
    cleaned: List[str] = []
    for t in top_terms:
        t = t.strip()
        if not t or t.lower() in _DIM_LABEL_STOPWORDS:
            continue
        if t.isdigit():
            continue
        # Avoid 1-2 character noise tokens.
        if len(t) <= 2:
            continue
        cleaned.append(t)
        if len(cleaned) >= 3:
            break
    if not cleaned:
        return "general theme"
    return " · ".join(cleaned)


class CompanySvdIndex:
    def __init__(
        self,
        companies: List[Dict[str, Any]],
        doc_embeddings_unit: np.ndarray,
        doc_embeddings_raw: np.ndarray,
        vectorizer: TfidfVectorizer,
        svd: TruncatedSVD,
    ) -> None:
        self.companies = companies
        self.doc_embeddings = doc_embeddings_unit
        self._doc_embeddings_raw = doc_embeddings_raw
        self._vectorizer = vectorizer
        self._svd = svd

        self._feature_names: List[str] = (
            list(vectorizer.get_feature_names_out())
            if companies
            else []
        )
        self._symbol_to_doc_id: Dict[str, int] = {}
        for i, c in enumerate(companies):
            sym = (c.get("symbol") or "").strip().upper()
            if sym:
                self._symbol_to_doc_id[sym] = i

        # Cache of per-dimension term info (top positive / negative loadings).
        self._dim_info_cache: Dict[int, Dict[str, Any]] = {}

    @classmethod
    def build(cls, companies, stopwords, n_components=100):
        if not companies:
            empty_vec = TfidfVectorizer()
            empty_svd = TruncatedSVD(n_components=2)
            empty = np.empty((0, 0))
            return cls([], empty, empty, empty_vec, empty_svd)

        docs = [_company_to_doc_text(c) for c in companies]

        vectorizer = TfidfVectorizer(
            stop_words=list(stopwords),
            token_pattern=r"[a-zA-Z0-9]+",
            min_df=1,
            sublinear_tf=True,
        )
        tfidf_matrix = vectorizer.fit_transform(docs)

        n_components = min(
            n_components,
            tfidf_matrix.shape[0] - 1,
            tfidf_matrix.shape[1] - 1,
        )

        svd = TruncatedSVD(n_components=n_components, random_state=42)
        doc_embeddings_raw = svd.fit_transform(tfidf_matrix)
        doc_embeddings_unit = normalize(doc_embeddings_raw, norm="l2")

        return cls(
            companies,
            doc_embeddings_unit,
            doc_embeddings_raw,
            vectorizer,
            svd,
        )

    # ------------------------------------------------------------------ #
    # Latent-dimension introspection                                     #
    # ------------------------------------------------------------------ #

    @property
    def n_components(self) -> int:
        return int(getattr(self._svd, "n_components", 0) or 0)

    def get_dimension_info(self, dim_idx: int, top_k_terms: int = 6) -> Dict[str, Any]:
        """Return the top positive/negative loading terms for a latent dimension."""
        if dim_idx in self._dim_info_cache:
            cached = self._dim_info_cache[dim_idx]
            if (
                len(cached.get("top_positive", [])) >= top_k_terms
                and len(cached.get("top_negative", [])) >= top_k_terms
            ):
                return cached

        if not self._feature_names:
            info = {
                "index": dim_idx,
                "label": "general theme",
                "top_positive": [],
                "top_negative": [],
                "explained_variance_ratio": 0.0,
            }
            self._dim_info_cache[dim_idx] = info
            return info

        comp = self._svd.components_[dim_idx]
        order = np.argsort(comp)
        neg_idx = order[:top_k_terms]
        pos_idx = order[-top_k_terms:][::-1]

        top_positive = [
            {"term": self._feature_names[i], "weight": float(comp[i])}
            for i in pos_idx
        ]
        top_negative = [
            {"term": self._feature_names[i], "weight": float(comp[i])}
            for i in neg_idx
        ]
        label = _humanize_label([t["term"] for t in top_positive])

        ev = (
            float(self._svd.explained_variance_ratio_[dim_idx])
            if hasattr(self._svd, "explained_variance_ratio_")
            and dim_idx < len(self._svd.explained_variance_ratio_)
            else 0.0
        )

        info = {
            "index": int(dim_idx),
            "label": label,
            "top_positive": top_positive,
            "top_negative": top_negative,
            "explained_variance_ratio": ev,
        }
        self._dim_info_cache[dim_idx] = info
        return info

    def list_dimensions(self, top_k_terms: int = 5) -> List[Dict[str, Any]]:
        """Catalog of every latent dimension with its readable label."""
        return [
            self.get_dimension_info(d, top_k_terms=top_k_terms)
            for d in range(self.n_components)
        ]

    def _embed_query(self, query: str) -> Optional[Tuple[np.ndarray, np.ndarray, float]]:
        """Return (raw_embed, unit_embed, raw_norm) for a query string."""
        if not query or not query.strip():
            return None
        if not self.companies:
            return None
        q_tfidf = self._vectorizer.transform([query])
        if q_tfidf.nnz == 0:
            return None
        raw = self._svd.transform(q_tfidf).flatten()
        norm = float(np.linalg.norm(raw))
        if norm == 0:
            return None
        unit = raw / norm
        return raw, unit, norm

    def _query_term_loadings(self, query: str, dim_idx: int, top_k: int = 3) -> List[Dict[str, Any]]:
        """Which words *in the query* drive the projection onto `dim_idx`?"""
        if not self._feature_names:
            return []
        q_tfidf = self._vectorizer.transform([query])
        if q_tfidf.nnz == 0:
            return []
        comp = self._svd.components_[dim_idx]
        # Per-token contribution to dim's projection = tfidf_weight * loading
        contribs: List[Tuple[str, float]] = []
        rows, cols = q_tfidf.nonzero()
        for col in cols:
            term = self._feature_names[col]
            weight = float(q_tfidf[0, col])
            contribs.append((term, weight * float(comp[col])))
        contribs.sort(key=lambda kv: abs(kv[1]), reverse=True)
        return [
            {"term": t, "contribution": float(c)}
            for t, c in contribs[:top_k]
            if abs(c) > 1e-9
        ]

    def _doc_term_loadings(
        self, doc_id: int, dim_idx: int, top_k: int = 3
    ) -> List[Dict[str, Any]]:
        """Which words *in the company's text* drive its loading on `dim_idx`?"""
        if not self._feature_names:
            return []
        # Re-vectorize the doc (cheap; doc count is small).
        doc_text = _company_to_doc_text(self.companies[doc_id])
        d_tfidf = self._vectorizer.transform([doc_text])
        if d_tfidf.nnz == 0:
            return []
        comp = self._svd.components_[dim_idx]
        contribs: List[Tuple[str, float]] = []
        _rows, cols = d_tfidf.nonzero()
        for col in cols:
            term = self._feature_names[col]
            weight = float(d_tfidf[0, col])
            contribs.append((term, weight * float(comp[col])))
        contribs.sort(key=lambda kv: abs(kv[1]), reverse=True)
        return [
            {"term": t, "contribution": float(c)}
            for t, c in contribs[:top_k]
            if abs(c) > 1e-9
        ]

    def explain_match(
        self,
        query: str,
        ticker: str,
        top_k_dims: int = 5,
    ) -> Optional[Dict[str, Any]]:
        """
        Explain a single (query, company) match in *latent space*.

        Returns the top contributing SVD dimensions: each one comes with a
        human-readable label, its top defining terms, the query's activation,
        the company's activation and the resulting contribution to the cosine
        similarity (between the L2-normalized query and document embeddings).
        """
        sym = (ticker or "").strip().upper()
        doc_id = self._symbol_to_doc_id.get(sym)
        if doc_id is None:
            return None

        embed = self._embed_query(query)
        if embed is None:
            return None
        _q_raw, q_unit, _q_norm = embed

        doc_unit = self.doc_embeddings[doc_id]
        if doc_unit.size == 0:
            return None

        contributions = q_unit * doc_unit  # element-wise; sums to cosine sim
        cosine_sim = float(contributions.sum())

        order = np.argsort(np.abs(contributions))[::-1][:top_k_dims]
        total_abs = float(np.abs(contributions).sum()) or 1.0

        dims_payload: List[Dict[str, Any]] = []
        positive_dims: List[Dict[str, Any]] = []
        for k in order:
            k_int = int(k)
            info = self.get_dimension_info(k_int, top_k_terms=5)
            contrib = float(contributions[k])
            entry = {
                "index": k_int,
                "label": info["label"],
                "top_positive": info["top_positive"][:5],
                "top_negative": info["top_negative"][:3],
                "query_activation": float(q_unit[k]),
                "result_activation": float(doc_unit[k]),
                "contribution": contrib,
                "abs_share": abs(contrib) / total_abs,
                "alignment": "positive" if contrib >= 0 else "opposing",
                "query_drivers": self._query_term_loadings(query, k_int, top_k=3),
                "result_drivers": self._doc_term_loadings(doc_id, k_int, top_k=3),
            }
            dims_payload.append(entry)
            if contrib > 0:
                positive_dims.append(entry)

        # Build a short, human readable summary using the strongest *shared*
        # (positive) dimensions.  These are the latent themes the query and
        # the company both activate – this is what we surface as "matched on
        # concept X".
        top_concepts = [d["label"] for d in positive_dims[:2]] or [
            dims_payload[0]["label"] if dims_payload else "shared theme"
        ]

        return {
            "cosine_similarity": cosine_sim,
            "top_dimensions": dims_payload,
            "top_concepts": top_concepts,
            "n_components": self.n_components,
        }

    # ------------------------------------------------------------------ #
    # Search                                                             #
    # ------------------------------------------------------------------ #

    def search(self, query, top_n=10):
        if top_n <= 0 or len(self.companies) == 0:
            return []
        if not query or not query.strip():
            return []

        embed = self._embed_query(query)
        if embed is None:
            return []
        _q_raw, q_unit, _q_norm = embed

        scores = (self.doc_embeddings @ q_unit.T).flatten()
        top_indices = np.argsort(scores)[::-1][:top_n]

        out = []
        for idx in top_indices:
            s = float(scores[idx])
            if s > 0:
                out.append(_company_to_api_dict(self.companies[idx], s))
        return out
    
    def portfolio_recommend(
        self, tickers: List[str], top_n: int = 10, mode: str = "similar"
    ) -> List[Dict[str, Any]]:
        """
        Recommend stocks based on a portfolio of tickers.
        There are two modes users can choose from.
        mode="similar" finds stocks closest to the portfolio centroid.
        mode="diversify" finds top stocks from sectors the portfolio
        does NOT already cover.
        """
        if not tickers or len(self.companies) == 0:
            return []

        ticker_set = {t.upper() for t in tickers}
        portfolio_indices = []
        portfolio_sectors = set()
        for i, c in enumerate(self.companies):
            sym = (c.get("symbol") or "").upper()
            if sym in ticker_set:
                portfolio_indices.append(i)
                sector = c.get("sector")
                if sector:
                    portfolio_sectors.add(sector)

        if not portfolio_indices:
            return []

        # compute portfolio centroid
        portfolio_embeddings = self.doc_embeddings[portfolio_indices]
        centroid = portfolio_embeddings.mean(axis=0)
        norm = np.linalg.norm(centroid)
        if norm == 0:
            return []
        centroid = centroid / norm

        scores = (self.doc_embeddings @ centroid).flatten()

        if mode == "diversify":
            candidates = []
            for i in range(len(self.companies)):
                sym = (self.companies[i].get("symbol") or "").upper()
                if sym in ticker_set:
                    continue
                sector = self.companies[i].get("sector", "")
                sim = float(scores[i])
                if sim > 0:
                    candidates.append((i, sim, sector))

            candidates.sort(key=lambda x: x[1], reverse=True)

            seen_sectors = set()
            out = []
            for idx_c, sim, sector in candidates:
                if sector in portfolio_sectors:
                    continue
                if sector in seen_sectors:
                    continue
                seen_sectors.add(sector)
                diversify_score = 1.0 - sim * 0.5
                out.append(_company_to_api_dict(self.companies[idx_c], diversify_score))
                if len(out) >= top_n:
                    break

            if len(out) < top_n:
                same_sector = [
                    (i, s, sec) for i, s, sec in candidates
                    if sec in portfolio_sectors
                ]
                same_sector.sort(key=lambda x: x[1])
                for idx_c, sim, sector in same_sector:
                    sym = (self.companies[idx_c].get("symbol") or "").upper()
                    if sym in ticker_set:
                        continue
                    if len(out) >= top_n:
                        break
                    diversify_score = 1.0 - sim * 0.5
                    out.append(_company_to_api_dict(self.companies[idx_c], diversify_score))

            return out
        else:
            top_indices = np.argsort(scores)[::-1]
            out = []
            for idx_c in top_indices:
                sym = (self.companies[idx_c].get("symbol") or "").upper()
                if sym in ticker_set:
                    continue
                s = float(scores[idx_c])
                if s > 0:
                    out.append(_company_to_api_dict(self.companies[idx_c], s))
                if len(out) >= top_n:
                    break
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
