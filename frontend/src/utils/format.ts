export function formatMarketCap(cap: number | string | undefined): string {
  if (cap === undefined || cap === null) return "—";
  if (typeof cap === "string") return cap;
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(1)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(0)}M`;
  return `$${cap.toLocaleString()}`;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function parsePortfolioInput(value: string): string[] {
  // Accept comma, space, and newline-delimited entries.
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getSentimentInfo(score: number): { label: string; cls: string } {
  if (score >= 0.3) return { label: "Bullish", cls: "bullish" };
  if (score <= -0.3) return { label: "Bearish", cls: "bearish" };
  return { label: "Neutral", cls: "neutral" };
}
