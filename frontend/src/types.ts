// POST /api/recommend { query } -> RecommendResponse
// similarity: 0-1, sentiment: roughly -1 to 1

export interface LatentDimensionTerm {
  term: string;
  weight?: number;
  contribution?: number;
}

export interface LatentDimension {
  index: number;
  label: string;
  top_positive: LatentDimensionTerm[];
  top_negative: LatentDimensionTerm[];
  query_activation: number;
  result_activation: number;
  contribution: number;
  abs_share: number;
  alignment: "positive" | "opposing";
  query_drivers?: LatentDimensionTerm[];
  result_drivers?: LatentDimensionTerm[];
}

export interface LatentExplanation {
  top_concepts: string[];
  cosine_similarity?: number;
  n_components?: number;
  dimensions: LatentDimension[];
}

export interface Stock {
  ticker: string;
  name: string;
  similarity: number;
  sector?: string;
  industry?: string;
  description?: string;
  market_cap?: number | string;
  dividend_yield?: number;
  website?: string;
  city?: string;
  state?: string;
  country?: string;
  image?: string;
  sentiment?: number;
  component_scores?: {
    svd?: number;
    tfidf?: number;
    svd_weight?: number;
    tfidf_weight?: number;
  };
  explanation?: {
    short?: string;
    reasons?: string[];
    matched_terms?: Array<{
      term: string;
      contribution: number;
      share?: number;
      match_type?: "exact" | "corrected" | "related";
    }>;
    semantic_matches?: string[];
    semantic_match_details?: Array<{
      term: string;
      weight: number;
      share: number;
    }>;
    snippets?: string[];
    query_terms?: string[];
    score_breakdown?: {
      text_similarity?: number;
      sentiment_impact?: number;
      final_score?: number;
    };
    sentiment?: {
      available?: boolean;
      score?: number;
      impact?: number;
      note?: string;
    };
    latent?: LatentExplanation | null;
  };
}

export interface CompareDiffEntry {
  ticker: string;
  rank_with_svd: number | null;
  rank_without_svd: number | null;
  delta: number | null;
  status: "new" | "moved" | "same" | "dropped";
}

export interface CompareResponse {
  query: string;
  with_svd: Stock[];
  without_svd: Stock[];
  diff: CompareDiffEntry[];
}

export interface AiQuerySuggestion {
  suggested_query: string;
  reason?: string;
}

export interface AiRecommendations {
  recommended_indices: number[];
  summary?: string;
  reasons?: Record<string, string>;
}

export interface RecommendResponse {
  results: Array<{
    ticker: string;
    name: string;
    score?: number;
    sector?: string;
    industry?: string;
    market_cap?: number | string;
    dividend_yield?: number;
    description?: string;
    image?: string;
    website?: string;
    city?: string;
    state?: string;
    country?: string;
    sentiment?: number;
    component_scores?: Stock["component_scores"];
    explanation?: Stock["explanation"];
  }>;
  ai_query_suggestion?: AiQuerySuggestion | null;
  ai_recommendations?: AiRecommendations | null;
}

export type QueryMode = "text" | "portfolio";
