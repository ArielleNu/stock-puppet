export const TICKER_COLORS: Record<string, string> = {
  AAPL: "#555555",
  MSFT: "#00a4ef",
  NVDA: "#76b900",
  AVGO: "#cc0000",
  GOOGL: "#4285f4",
  AMZN: "#ff9900",
  META: "#0668e1",
  TSLA: "#cc0000",
  NEE: "#0072ce",
  JPM: "#003087",
  V: "#1a1f71",
  UNH: "#002677",
};

export function getTickerColor(ticker: string): string {
  return (
    TICKER_COLORS[ticker] ||
    `hsl(${[...ticker].reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 50%, 45%)`
  );
}

export function getSectorColor(sector?: string): string {
  if (!sector) return "#787b86";
  const hue = [...sector].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 360;
  return `hsl(${hue}, 62%, 56%)`;
}

export function getMatchColor(pct: number): string {
  if (pct >= 75) return "var(--bullish)";
  if (pct >= 40) return "var(--match-mid)";
  return "var(--text-muted)";
}
