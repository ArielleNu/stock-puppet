// POST /api/recommend { query } -> Stock[]
// similarity: 0-1, sentiment: roughly -1 to 1

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
  };
}

export type QueryMode = "text" | "portfolio";
