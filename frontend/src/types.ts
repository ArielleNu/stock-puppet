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
}

export type QueryMode = "text" | "portfolio";
