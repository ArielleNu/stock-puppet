import { CompareResponse, Stock } from "../types";

export type SearchMethod = "hybrid" | "tfidf" | "compare";

export interface Preferences {
  risk_tolerance: string;
  focus: string;
  cap_preference: string;
}

export function mapStockRow(d: Record<string, unknown>): Stock {
  return {
    ticker: d.ticker as string,
    name: d.name as string,
    similarity: typeof d.score === "number" ? (d.score as number) : 0,
    sector: d.sector as string | undefined,
    industry: d.industry as string | undefined,
    description: d.description as string | undefined,
    market_cap: d.market_cap as number | string | undefined,
    dividend_yield: d.dividend_yield as number | undefined,
    website: d.website as string | undefined,
    image: d.image as string | undefined,
    explanation: d.explanation as Stock["explanation"],
    city: d.city as string | undefined,
    state: d.state as string | undefined,
    country: d.country as string | undefined,
    component_scores: d.component_scores as Stock["component_scores"],
  };
}

export async function fetchConfig(): Promise<{ use_llm: boolean }> {
  const r = await fetch("/api/config");
  return r.json();
}

export async function fetchRecommend(body: unknown): Promise<Stock[]> {
  const res = await fetch("/api/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>[];
  return data.map(mapStockRow);
}

export async function fetchCompare(
  query: string,
  topN = 10,
): Promise<CompareResponse> {
  const res = await fetch("/api/recommend/compare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_n: topN }),
  });
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  const cmp = (await res.json()) as CompareResponse;
  return {
    query: cmp.query,
    with_svd: (cmp.with_svd as unknown as Record<string, unknown>[]).map(mapStockRow),
    without_svd: (cmp.without_svd as unknown as Record<string, unknown>[]).map(
      mapStockRow,
    ),
    diff: cmp.diff,
  };
}

export async function fetchGlobalPeers(
  ticker: string,
  limit = 6,
): Promise<Stock[]> {
  const res = await fetch(`/api/peers/${ticker}?limit=${limit}`);
  if (!res.ok) throw new Error(`Failed to load peers (${res.status})`);
  const data = (await res.json()) as Array<Record<string, unknown>>;
  return data.map(mapStockRow);
}
