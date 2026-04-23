import { useState, useEffect, useRef } from "react";
import "./App.css";
import SearchIcon from "./assets/mag.png";
import {
  Stock,
  QueryMode,
  RecommendResponse,
  AiQuerySuggestion,
  AiRecommendations,
} from "./types";

const TICKER_COLORS: Record<string, string> = {
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

function getTickerColor(ticker: string): string {
  return (
    TICKER_COLORS[ticker] ||
    `hsl(${[...ticker].reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 50%, 45%)`
  );
}

function getMatchColor(pct: number): string {
  if (pct >= 75) return "var(--bullish)";
  if (pct >= 40) return "var(--match-mid)";
  return "var(--text-muted)";
}

function formatMarketCap(cap: number | string | undefined): string {
  if (cap === undefined || cap === null) return "—";
  if (typeof cap === "string") return cap;
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(1)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(0)}M`;
  return `$${cap.toLocaleString()}`;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

type PeerNode = {
  ticker: string;
  similarity: number;
  x: number;
  y: number;
  isCenter: boolean;
  sector?: string;
  marketCap?: number | string;
};
type PeerScope = "result" | "global";

function getSectorColor(sector?: string): string {
  if (!sector) return "#787b86";
  const hue = [...sector].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 360;
  return `hsl(${hue}, 62%, 56%)`;
}

function getPeerNodes(center: Stock, peers: Stock[]): PeerNode[] {
  if (!center) return [];

  const centerNode: PeerNode = {
    ticker: center.ticker,
    similarity: 1,
    x: 50,
    y: 50,
    isCenter: true,
    sector: center.sector,
    marketCap: center.market_cap,
  };

  const peerNodes: PeerNode[] = peers.map((stock, i) => {
    const angle = (i / Math.max(peers.length, 1)) * Math.PI * 2 - Math.PI / 2;
    // Higher similarity sits closer to the center.
    const radius = 12 + (1 - stock.similarity) * 30;
    return {
      ticker: stock.ticker,
      similarity: stock.similarity,
      x: 50 + Math.cos(angle) * radius,
      y: 50 + Math.sin(angle) * radius,
      isCenter: false,
      sector: stock.sector,
      marketCap: stock.market_cap,
    };
  });

  return [centerNode, ...peerNodes];
}

function parsePortfolioInput(value: string): string[] {
  // Accept comma, space, and newline-delimited entries.
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function App(): JSX.Element {
  const [useLlm, setUseLlm] = useState<boolean | null>(null);
  const [queryMode, setQueryMode] = useState<QueryMode>("text");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [peerScopeByTicker, setPeerScopeByTicker] = useState<
    Record<string, PeerScope>
  >({});
  const [globalPeersByTicker, setGlobalPeersByTicker] = useState<
    Record<string, Stock[]>
  >({});
  const [globalPeersLoading, setGlobalPeersLoading] = useState<
    Record<string, boolean>
  >({});
  const [showPrefs, setShowPrefs] = useState(false);
  const [riskTolerance, setRiskTolerance] = useState("any");
  const [focus, setFocus] = useState("any");
  const [capPreference, setCapPreference] = useState("any");
  const [aiQuerySuggestion, setAiQuerySuggestion] =
    useState<AiQuerySuggestion | null>(null);
  const [aiRecommendations, setAiRecommendations] =
    useState<AiRecommendations | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => setUseLlm(data.use_llm))
      .catch(() => setUseLlm(false));
  }, []);

  const focusStockRow = (idx: number): void => {
    const stock = stocks[idx]
    if (!stock) return;

    setExpandedIdx(idx);

    requestAnimationFrame(() => {
      setTimeout(() => {
        const rowEl = rowRefs.current[stock.ticker];
        if (rowEl) {
          rowEl.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      }, 80);
    });
  };

  const handleSearch = async (value: string): Promise<void> => {
    setSearchTerm(value);
    setError(null);

    if (value.trim() === "") {
      setStocks([]);
      setAiQuerySuggestion(null);
      setAiRecommendations(null)
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setHasSearched(true);
    setExpandedIdx(null);

    try {
      const payload =
        queryMode === "portfolio"
          ? { portfolio: parsePortfolioInput(value) }
          : { query: value };

      if (
        queryMode === "portfolio" &&
        (!("portfolio" in payload) || !payload.portfolio ||
          payload.portfolio.length === 0)
      ) {
        setStocks([]);
        setAiQuerySuggestion(null);
        setAiRecommendations(null);
        setError("Enter at least one ticker or company name.");
        return;
      }

      // Theme Search and Portfolio Match share backend endpoint.
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          preferences: {
            risk_tolerance: riskTolerance,
            focus: focus,
            cap_preference: capPreference,
          },
        }),
      });

      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      const responseData = (await res.json()) as RecommendResponse;
      const data = responseData.results ?? [];

      setAiQuerySuggestion(responseData.ai_query_suggestion ?? null);
      setAiRecommendations(responseData.ai_recommendations ?? null);

      // const data = (await res.json()) as Array<{
      //   ticker: string;
      //   name: string;
      //   score?: number;
      //   sector?: string;
      //   industry?: string;
      //   market_cap?: number | string;
      //   dividend_yield?: number;
      //   description?: string;
      //   image?: string;
      //   website?: string;
      //   explanation?: Stock["explanation"];
      //   city?: string;
      //   state?: string;
      //   country?: string;
      // }>;

      const maxScore =
        Math.max(
          ...data.map((d) => (typeof d.score === "number" ? d.score : 0)),
        ) || 1;

      const mapped: Stock[] = data.map((d) => ({
        ticker: d.ticker,
        name: d.name,
        similarity: (typeof d.score === "number" ? d.score : 0) / maxScore,
        sector: d.sector,
        industry: d.industry,
        description: d.description,
        market_cap: d.market_cap,
        dividend_yield: d.dividend_yield,
        website: d.website,
        image: d.image,
        explanation: d.explanation,
        city: d.city,
        state: d.state,
        country: d.country,
      }));

      setStocks(mapped);
    } catch (err) {
      setStocks([]);
      setAiQuerySuggestion(null);
      setAiRecommendations(null);
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    handleSearch(searchTerm);
  };

  const getSentimentInfo = (score: number) => {
    if (score >= 0.3) return { label: "Bullish", cls: "bullish" };
    if (score <= -0.3) return { label: "Bearish", cls: "bearish" };
    return { label: "Neutral", cls: "neutral" };
  };

  const handlePeerScopeChange = async (
    ticker: string,
    scope: PeerScope,
  ): Promise<void> => {
    setPeerScopeByTicker((prev) => ({ ...prev, [ticker]: scope }));
    if (scope !== "global" || globalPeersByTicker[ticker]) {
      return;
    }
    setGlobalPeersLoading((prev) => ({ ...prev, [ticker]: true }));
    try {
      const res = await fetch(`/api/peers/${ticker}?limit=6`);
      if (!res.ok) throw new Error(`Failed to load peers (${res.status})`);
      const data = (await res.json()) as Array<{
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
        explanation?: Stock["explanation"];
      }>;
      const maxScore =
        Math.max(
          ...data.map((d) => (typeof d.score === "number" ? d.score : 0)),
        ) || 1;
      const mapped: Stock[] = data.map((d) => ({
        ticker: d.ticker,
        name: d.name,
        similarity: (typeof d.score === "number" ? d.score : 0) / maxScore,
        sector: d.sector,
        industry: d.industry,
        description: d.description,
        market_cap: d.market_cap,
        dividend_yield: d.dividend_yield,
        website: d.website,
        image: d.image,
        explanation: d.explanation,
      }));
      setGlobalPeersByTicker((prev) => ({ ...prev, [ticker]: mapped }));
    } catch {
      setGlobalPeersByTicker((prev) => ({ ...prev, [ticker]: [] }));
    } finally {
      setGlobalPeersLoading((prev) => ({ ...prev, [ticker]: false }));
    }
  };

  if (useLlm === null) return <></>;

  return (
    <div className={`app ${useLlm ? "llm-mode" : ""}`}>
      <nav className="topbar">
        <div className="topbar-left">
          <div className="brand">
            <svg
              className="brand-chart-icon"
              width="20"
              height="16"
              viewBox="0 0 20 16"
              fill="none"
            >
              <polyline
                points="1,14 5,9 9,11 13,4 17,7 19,2"
                stroke="#2962ff"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="brand-name">StockPuppet</span>
          </div>
          <span className="brand-divider" />
          <span className="brand-sub">Stock Screener</span>
        </div>
      </nav>

      <div
        className={`hero ${hasSearched && stocks.length > 0 ? "hero-compact" : ""}`}
      >
        <div className="hero-logo">
          <svg
            className="logo-marionette"
            width="120"
            height="150"
            viewBox="0 0 120 150"
            fill="none"
          >
            {/* control bar */}
            <line
              x1="30"
              y1="6"
              x2="90"
              y2="26"
              stroke="#d1d4dc"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <line
              x1="90"
              y1="6"
              x2="30"
              y2="26"
              stroke="#d1d4dc"
              strokeWidth="4"
              strokeLinecap="round"
            />
            {/* strings */}
            <line
              x1="35"
              y1="9"
              x2="48"
              y2="68"
              stroke="#2962ff"
              strokeWidth="1.2"
              opacity="0.55"
            />
            <line
              x1="85"
              y1="9"
              x2="72"
              y2="68"
              stroke="#2962ff"
              strokeWidth="1.2"
              opacity="0.55"
            />
            <line
              x1="60"
              y1="16"
              x2="60"
              y2="46"
              stroke="#2962ff"
              strokeWidth="1.2"
              opacity="0.55"
            />
            <line
              x1="38"
              y1="23"
              x2="40"
              y2="108"
              stroke="#2962ff"
              strokeWidth="1.2"
              opacity="0.55"
            />
            <line
              x1="82"
              y1="23"
              x2="80"
              y2="108"
              stroke="#2962ff"
              strokeWidth="1.2"
              opacity="0.55"
            />
            {/* body */}
            <circle cx="60" cy="52" r="12" fill="#d1d4dc" />
            <ellipse cx="60" cy="82" rx="14" ry="18" fill="#d1d4dc" />
            <path d="M46 74 Q34 62 30 68 Q26 74 38 78" fill="#d1d4dc" />
            <circle cx="30" cy="68" r="4" fill="#d1d4dc" />
            <path d="M74 74 Q86 68 90 74 Q94 80 82 80" fill="#d1d4dc" />
            <circle cx="90" cy="74" r="4" fill="#d1d4dc" />
            <path
              d="M52 97 L42 126 Q40 130 44 130 L50 130 Q54 130 52 126 Z"
              fill="#d1d4dc"
            />
            <path
              d="M68 97 L78 126 Q80 130 76 130 L70 130 Q66 130 68 126 Z"
              fill="#d1d4dc"
            />
            {/* chart on torso */}
            <polyline
              points="48,88 52,82 56,85 60,76 64,80 68,74 72,78"
              stroke="#2962ff"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="68" cy="74" r="2.5" fill="#2962ff" />
          </svg>
        </div>

        <h1 className="hero-title">
          Stock<span className="hero-highlight">Puppet</span>
        </h1>
        <p className="hero-sub">Pull the strings of smarter investing.</p>

        <div className="mode-tabs">
          <button
            className={`tab ${queryMode === "text" ? "active" : ""}`}
            onClick={() => setQueryMode("text")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            Theme Search
          </button>
          <button
            className={`tab ${queryMode === "portfolio" ? "active" : ""}`}
            onClick={() => setQueryMode("portfolio")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
            Portfolio Match
          </button>
        </div>

        <form className="search-form" onSubmit={handleSubmit}>
          <div className="search-input-wrap">
            <img src={SearchIcon} alt="" className="search-mag" />
            <input
              id="search-input"
              placeholder={
                queryMode === "text"
                  ? 'Search by theme... "high dividend tech" or "AI chip makers"'
                  : "Enter tickers... AAPL, MSFT, NVDA, TSLA"
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoComplete="off"
            />
          </div>
          <button type="submit" className="search-submit" disabled={loading}>
            {loading ? (
              <span className="spinner" />
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </form>
        {!loading &&
          !error &&
          aiQuerySuggestion?.suggested_query &&
          aiQuerySuggestion.suggested_query.trim() &&
          aiQuerySuggestion.suggested_query.trim().toLowerCase() !==
          searchTerm.trim().toLowerCase() && (
            <button
              type="button"
              className="ai-query-tooltip"
              onClick={() => {
                const newQuery = aiQuerySuggestion.suggested_query;
                setSearchTerm(newQuery);
                setStocks([]);
                handleSearch(newQuery);
              }}
            >
              <span className="ai-query-tooltip-badge" aria-hidden="true">
                <svg
                  width="30"
                  height="30"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="ai-query-tooltip-sparkle"
                >
                  <path
                    d="M12 4L13.8 9.2L19 11L13.8 12.8L12 18L10.2 12.8L5 11L10.2 9.2L12 4Z"
                    fill="currentColor"
                  />
                  <path
                    d="M17 3L17.6 5L19.6 5.6L17.6 6.2L17 8.2L16.4 6.2L14.4 5.6L16.4 5L17 3Z"
                    fill="currentColor"
                    opacity="0.8"
                  />
                </svg>
              </span>

              <span className="ai-query-tooltip-content">
                <span className="ai-query-tooltip-text">
                  <strong className="ai-query-label">Click to try query:</strong>{" "}
                  <span className="ai-query-value">
                    “{aiQuerySuggestion.suggested_query}”
                  </span>
                </span>

                {aiQuerySuggestion.reason && (
                  <span className="ai-query-tooltip-reason">
                    {aiQuerySuggestion.reason}
                  </span>
                )}
              </span>
            </button>
          )}
        <button
          className="prefs-toggle"
          onClick={() => setShowPrefs(!showPrefs)}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 3v1m0 16v1m-8-9H3m18 0h-1m-2.636-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          {showPrefs ? "Hide Preferences" : "Preferences"}
        </button>

        {showPrefs && (
          <div className="prefs-panel">
            <div className="pref-group">
              <span className="pref-label">Risk Tolerance</span>
              <div className="pref-options">
                {["any", "low", "medium", "high"].map((v) => (
                  <button
                    key={v}
                    className={`pref-btn ${riskTolerance === v ? "active" : ""}`}
                    onClick={() => setRiskTolerance(v)}
                  >
                    {v === "any"
                      ? "Any"
                      : v === "low"
                        ? "Low"
                        : v === "medium"
                          ? "Medium"
                          : "High"}
                  </button>
                ))}
              </div>
            </div>
            <div className="pref-group">
              <span className="pref-label">Investment Focus</span>
              <div className="pref-options">
                {["any", "dividend", "growth"].map((v) => (
                  <button
                    key={v}
                    className={`pref-btn ${focus === v ? "active" : ""}`}
                    onClick={() => setFocus(v)}
                  >
                    {v === "any"
                      ? "Any"
                      : v === "dividend"
                        ? "Dividend"
                        : "Growth"}
                  </button>
                ))}
              </div>
            </div>
            <div className="pref-group">
              <span className="pref-label">Market Cap</span>
              <div className="pref-options">
                {["any", "large", "mid", "small"].map((v) => (
                  <button
                    key={v}
                    className={`pref-btn ${capPreference === v ? "active" : ""}`}
                    onClick={() => setCapPreference(v)}
                  >
                    {v === "any"
                      ? "Any"
                      : v === "large"
                        ? "Large"
                        : v === "mid"
                          ? "Mid"
                          : "Small"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {loading && (
        <div className="screener">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton-row">
              <div className="skeleton-badge" />
              <div className="skeleton-info">
                <div className="skeleton-line skeleton-line-title" />
                <div className="skeleton-line skeleton-line-sub" />
                <div className="skeleton-line skeleton-line-desc" />
              </div>
              <div className="skeleton-cells">
                <div className="skeleton-cell" />
                <div className="skeleton-cell" />
                <div className="skeleton-cell" />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="state-message error-state">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ef5350"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {!error && hasSearched && !loading && stocks.length === 0 && (
        <div className="state-message empty-state">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#787b86"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
            <path d="M8 11h6" />
          </svg>
          <span>No matching stocks found. Try a different query.</span>
        </div>
      )}

      {/* {!loading && !error && aiQuerySuggestion?.suggested_query && (
        <div className="ai-panel">
          <div className="ai-panel-header">
            <span className="ai-panel-title">AI Query Suggestion</span>
          </div>
          <div className="ai-query-box">
            <div className="ai-query-main">
              <span className="ai-query-label">Suggested query</span>
              <span className="ai-query-text">
                {aiQuerySuggestion.suggested_query}
              </span>
            </div>
            {aiQuerySuggestion.reason && (
              <p className="ai-query-reason">{aiQuerySuggestion.reason}</p>
            )}
            <button
              className="ai-query-run"
              onClick={() => {
                setSearchTerm(aiQuerySuggestion.suggested_query);
                handleSearch(aiQuerySuggestion.suggested_query);
              }}
            >
              Run suggested query
            </button>
          </div>
        </div>
      )} */}

      {!loading &&
        !error &&
        stocks.length > 0 &&
        aiRecommendations &&
        aiRecommendations.recommended_indices &&
        aiRecommendations.recommended_indices.length > 0 && (
          <div className="ai-panel">
            <div className="ai-panel-header">
              <span className="ai-panel-title">AI Recommended Results</span>
            </div>

            {aiRecommendations.summary && (
              <p className="ai-rec-summary">{aiRecommendations.summary}</p>
            )}

            <div className="ai-rec-list">
              {aiRecommendations.recommended_indices
                .filter((idx) => idx >= 0 && idx < stocks.length)
                .map((idx) => {
                  const stock = stocks[idx];
                  const reason =
                    aiRecommendations.reasons?.[String(idx)] ?? "";

                  return (
                    <div
                      key={`ai-pick-${stock.ticker}-${idx}`}
                      className="ai-rec-card ai-rec-card-clickable"
                      role="button"
                      tabIndex={0}
                      onClick={() => focusStockRow(idx)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          focusStockRow(idx);
                        }
                      }}
                    >
                      <div className="ai-rec-top">
                        <span className="ai-rec-ticker">{stock.ticker}</span>
                        <span className="ai-rec-name">{stock.name}</span>
                      </div>
                      <div className="ai-rec-meta">
                        {stock.industry ?? stock.sector ?? "—"}
                      </div>
                      {reason && <p className="ai-rec-reason">{reason}</p>}
                      <span className="ai-rec-hint">Click to view in results</span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

      {stocks.length > 0 && (
        <div className="screener">
          <div className="screener-header">
            <span className="sh-count">{stocks.length} results</span>
            <div className="sh-cols">
              <span className="sh-col col-match">Match</span>
              <span className="sh-col col-cap">Mkt Cap</span>
              <span className="sh-col col-div">Div Yield</span>
              <span className="sh-col col-sent">Sentiment</span>
            </div>
          </div>

          <div className="screener-body">
            {stocks.map((stock, i) => {
              const sent =
                stock.sentiment !== undefined
                  ? getSentimentInfo(stock.sentiment)
                  : null;
              const isExpanded = expandedIdx === i;
              const peerScope = peerScopeByTicker[stock.ticker] ?? "result";
              const resultPeers = stocks
                .filter((s) => s.ticker !== stock.ticker)
                .sort((a, b) => b.similarity - a.similarity)
                .slice(0, 6);
              const selectedPeers =
                peerScope === "global"
                  ? (globalPeersByTicker[stock.ticker] ?? [])
                  : resultPeers;
              const peerNodes = getPeerNodes(stock, selectedPeers);
              const centerNode = peerNodes[0];
              const peerOnlyNodes = peerNodes.slice(1);
              const peerCount = Math.max(peerNodes.length - 1, 0);
              const sectorLegend = Array.from(
                new Map(
                  peerOnlyNodes
                    .filter((node) => node.sector)
                    .map((node) => [node.sector as string, node]),
                ).entries(),
              ).slice(0, 4);
              return (
                <div
                  key={`${stock.ticker}-${i}`}
                  ref={(el) => {
                    rowRefs.current[stock.ticker] = el;
                  }}
                  className={`row ${isExpanded ? "row-expanded" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedIdx(isExpanded ? null : i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpandedIdx(isExpanded ? null : i);
                    }
                  }}
                >
                  <div className="row-top-section">
                    <div className="row-main">
                      <div
                        className="ticker-badge"
                        style={{
                          backgroundColor: stock.image
                            ? "transparent"
                            : getTickerColor(stock.ticker),
                        }}
                      >
                        {stock.image ? (
                          <img
                            src={stock.image}
                            alt={stock.ticker}
                            className="ticker-badge-img"
                          />
                        ) : (
                          stock.ticker
                        )}
                      </div>
                      <div className="row-info">
                        <div className="row-top">
                          <span className="row-ticker">{stock.ticker}</span>
                          <span className="row-name">{stock.name}</span>
                        </div>
                        <span className="row-industry">
                          {stock.industry ?? stock.sector ?? ""}
                        </span>
                        <span className="row-desc">
                          {stock.description ?? ""}
                        </span>
                        {stock.explanation?.short && (
                          <span className="row-explainer">
                            Why: {stock.explanation.short}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="row-data">
                      <span className="cell col-match">
                        <span className="match-bar-bg">
                          <span
                            className="match-bar-fill"
                            style={{
                              width: `${stock.similarity * 100}%`,
                              background: getMatchColor(stock.similarity * 100),
                            }}
                          />
                        </span>
                        <span
                          className="match-pct"
                          style={{
                            color: getMatchColor(stock.similarity * 100),
                          }}
                        >
                          {(stock.similarity * 100).toFixed(0)}%
                        </span>
                      </span>
                      <span className="cell col-cap mono">
                        {formatMarketCap(stock.market_cap)}
                      </span>
                      <span className="cell col-div mono">
                        {stock.dividend_yield !== undefined
                          ? `${stock.dividend_yield.toFixed(2)}%`
                          : "—"}
                      </span>
                      <span className={`cell col-sent ${sent?.cls ?? ""}`}>
                        {sent ? sent.label : "—"}
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="row-expanded-card">
                      <div className="expanded-grid">
                        <div className="expanded-col">
                          <span className="expanded-label">Sector</span>
                          <span className="expanded-value">
                            {stock.sector ?? "—"}
                          </span>
                        </div>
                        <div className="expanded-col">
                          <span className="expanded-label">Industry</span>
                          <span className="expanded-value">
                            {stock.industry ?? "—"}
                          </span>
                        </div>
                        <div className="expanded-col">
                          <span className="expanded-label">Market Cap</span>
                          <span className="expanded-value">
                            {formatMarketCap(stock.market_cap)}
                          </span>
                        </div>
                        <div className="expanded-col">
                          <span className="expanded-label">Dividend Yield</span>
                          <span className="expanded-value">
                            {stock.dividend_yield !== undefined
                              ? `${stock.dividend_yield.toFixed(2)}%`
                              : "—"}
                          </span>
                        </div>
                        {(stock.city || stock.state || stock.country) && (
                          <div className="expanded-col">
                            <span className="expanded-label">Headquarters</span>
                            <span className="expanded-value">
                              {[stock.city, stock.state, stock.country]
                                .filter(Boolean)
                                .join(", ")}
                            </span>
                          </div>
                        )}
                        {stock.website && (
                          <div className="expanded-col">
                            <span className="expanded-label">Website</span>
                            <a
                              className="expanded-link"
                              href={stock.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {stock.website.replace(
                                /^https?:\/\/(www\.)?/,
                                "",
                              )}
                            </a>
                          </div>
                        )}
                      </div>
                      {stock.description && (
                        <div className="expanded-desc-full">
                          <span className="expanded-label">About</span>
                          <p>{stock.description}</p>
                        </div>
                      )}
                      {stock.explanation && (
                        <div className="expanded-explanation">
                          <span className="expanded-label">
                            Why this was recommended
                          </span>
                          {stock.explanation.reasons &&
                            stock.explanation.reasons.length > 0 && (
                              <ul className="expanded-reason-list">
                                {stock.explanation.reasons
                                  .filter(
                                    (reason) =>
                                      !reason
                                        .toLowerCase()
                                        .startsWith("evidence:"),
                                  )
                                  .slice(0, 3)
                                  .map((reason, idx) => (
                                    <li key={`${stock.ticker}-reason-${idx}`}>
                                      {reason}
                                    </li>
                                  ))}
                              </ul>
                            )}
                          {stock.explanation.matched_terms &&
                            stock.explanation.matched_terms.length > 0 && (
                              <div className="term-chip-wrap">
                                {stock.explanation.matched_terms
                                  .slice(0, 3)
                                  .map((termObj) => (
                                    <span
                                      key={`${stock.ticker}-term-${termObj.term}`}
                                      className={`term-chip ${termObj.match_type ?? ""}`}
                                    >
                                      {termObj.term}
                                    </span>
                                  ))}
                              </div>
                            )}
                          {stock.explanation.semantic_matches &&
                            stock.explanation.semantic_matches.length > 0 && (
                              <div className="related-terms-row">
                                <span className="expanded-label">
                                  Related terms
                                </span>
                                <span className="related-terms-text">
                                  {stock.explanation.semantic_matches
                                    .slice(0, 4)
                                    .join(", ")}
                                </span>
                              </div>
                            )}
                          {stock.explanation.score_breakdown && (
                            <div className="score-breakdown-card">
                              <span className="expanded-label">
                                Score Breakdown
                              </span>
                              {(() => {
                                const textScore =
                                  stock.explanation?.score_breakdown
                                    ?.text_similarity ?? 0;
                                const sentimentImpact =
                                  stock.explanation?.score_breakdown
                                    ?.sentiment_impact ?? 0;
                                const finalScore =
                                  stock.explanation?.score_breakdown
                                    ?.final_score ?? 0;
                                const maxVal = Math.max(
                                  0.01,
                                  textScore,
                                  finalScore,
                                  Math.abs(sentimentImpact),
                                );
                                const textWidth =
                                  clamp01(textScore / maxVal) * 100;
                                const sentimentWidth =
                                  clamp01(Math.abs(sentimentImpact) / maxVal) *
                                  100;
                                const finalWidth =
                                  clamp01(finalScore / maxVal) * 100;
                                const matchedTerms =
                                  stock.explanation?.matched_terms?.slice(
                                    0,
                                    4,
                                  ) ?? [];
                                const relatedDetails =
                                  stock.explanation?.semantic_match_details?.slice(
                                    0,
                                    4,
                                  ) ?? [];
                                const queryTerms =
                                  stock.explanation?.query_terms ?? [];
                                const matchedQueryCount = queryTerms.filter(
                                  (qt) =>
                                    matchedTerms.some((mt) => mt.term === qt),
                                ).length;
                                return (
                                  <div className="score-breakdown-bars">
                                    <div className="score-breakdown-row">
                                      <span className="score-breakdown-name">
                                        Text similarity
                                      </span>
                                      <div className="score-breakdown-track">
                                        <span
                                          className="score-breakdown-fill text"
                                          style={{ width: `${textWidth}%` }}
                                        />
                                      </div>
                                      <span className="score-breakdown-value">
                                        {textScore.toFixed(3)}
                                      </span>
                                    </div>
                                    <div className="score-breakdown-row">
                                      <span className="score-breakdown-name">
                                        Sentiment adj.
                                      </span>
                                      <div className="score-breakdown-track">
                                        <span
                                          className={`score-breakdown-fill ${sentimentImpact >= 0
                                            ? "positive"
                                            : "negative"
                                            }`}
                                          style={{
                                            width: `${sentimentWidth}%`,
                                          }}
                                        />
                                      </div>
                                      <span className="score-breakdown-value">
                                        {sentimentImpact >= 0 ? "+" : ""}
                                        {sentimentImpact.toFixed(3)}
                                      </span>
                                    </div>
                                    <div className="score-breakdown-row">
                                      <span className="score-breakdown-name">
                                        Final score
                                      </span>
                                      <div className="score-breakdown-track">
                                        <span
                                          className="score-breakdown-fill final"
                                          style={{ width: `${finalWidth}%` }}
                                        />
                                      </div>
                                      <span className="score-breakdown-value">
                                        {finalScore.toFixed(3)}
                                      </span>
                                    </div>
                                    {matchedTerms.length > 0 && (
                                      <div className="text-contrib-block">
                                        <span className="score-breakdown-subtitle">
                                          Text similarity contributors
                                        </span>
                                        {queryTerms.length > 0 && (
                                          <span className="score-breakdown-coverage">
                                            Query coverage: {matchedQueryCount}/
                                            {queryTerms.length} terms
                                          </span>
                                        )}
                                        {matchedTerms.map((termObj) => {
                                          const sharePct =
                                            clamp01(termObj.share ?? 0) * 100;
                                          return (
                                            <div
                                              className="score-breakdown-row term"
                                              key={`${stock.ticker}-text-contrib-${termObj.term}`}
                                            >
                                              <span className="score-breakdown-name term-name">
                                                {termObj.term}
                                              </span>
                                              <div className="score-breakdown-track">
                                                <span
                                                  className="score-breakdown-fill term"
                                                  style={{
                                                    width: `${sharePct}%`,
                                                  }}
                                                />
                                              </div>
                                              <span className="score-breakdown-value">
                                                {sharePct.toFixed(0)}%
                                              </span>
                                            </div>
                                          );
                                        })}
                                        {relatedDetails.length > 0 && (
                                          <>
                                            <span className="score-breakdown-subtitle">
                                              Related concept strength
                                            </span>
                                            {relatedDetails.map((termObj) => {
                                              const sharePct =
                                                clamp01(termObj.share) * 100;
                                              return (
                                                <div
                                                  className="score-breakdown-row term"
                                                  key={`${stock.ticker}-related-contrib-${termObj.term}`}
                                                >
                                                  <span className="score-breakdown-name term-name">
                                                    {termObj.term}
                                                  </span>
                                                  <div className="score-breakdown-track">
                                                    <span
                                                      className="score-breakdown-fill related"
                                                      style={{
                                                        width: `${sharePct}%`,
                                                      }}
                                                    />
                                                  </div>
                                                  <span className="score-breakdown-value">
                                                    {sharePct.toFixed(0)}%
                                                  </span>
                                                </div>
                                              );
                                            })}
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                          {stock.explanation.snippets &&
                            stock.explanation.snippets.length > 0 && (
                              <div className="explain-snippets">
                                <span className="expanded-label">
                                  Evidence snippet
                                </span>
                                <p>{stock.explanation.snippets[0]}</p>
                              </div>
                            )}
                        </div>
                      )}
                      <div className="peer-network-card">
                        <div className="peer-network-header">
                          <span className="expanded-label">
                            Peer Network Graph
                          </span>
                          <div
                            className="peer-scope-tabs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className={`peer-scope-tab ${peerScope === "result" ? "active" : ""}`}
                              onClick={() =>
                                handlePeerScopeChange(stock.ticker, "result")
                              }
                            >
                              Result Set
                            </button>
                            <button
                              type="button"
                              className={`peer-scope-tab ${peerScope === "global" ? "active" : ""}`}
                              onClick={() =>
                                handlePeerScopeChange(stock.ticker, "global")
                              }
                            >
                              Global
                            </button>
                          </div>
                          <span className="peer-network-meta">
                            {globalPeersLoading[stock.ticker]
                              ? "Loading global peers..."
                              : peerCount > 0
                                ? peerScope === "global"
                                  ? `${peerCount} global TF-IDF peers`
                                  : `${peerCount} nearby peers from this result set`
                                : "No peers available"}
                          </span>
                        </div>
                        <svg
                          className="peer-network-svg"
                          viewBox="0 0 100 100"
                          role="img"
                          aria-label={`Peer network for ${stock.ticker}`}
                        >
                          <circle
                            cx="50"
                            cy="50"
                            r="14"
                            className="peer-ring"
                          />
                          <circle
                            cx="50"
                            cy="50"
                            r="28"
                            className="peer-ring"
                          />
                          <circle
                            cx="50"
                            cy="50"
                            r="42"
                            className="peer-ring"
                          />

                          {centerNode &&
                            peerNodes.slice(1).map((node) => (
                              <g key={`edge-${stock.ticker}-${node.ticker}`}>
                                <line
                                  x1={centerNode.x}
                                  y1={centerNode.y}
                                  x2={node.x}
                                  y2={node.y}
                                  className="peer-edge"
                                  style={{
                                    opacity: Math.max(node.similarity, 0.2),
                                    strokeWidth: 0.4 + node.similarity * 1.2,
                                  }}
                                />
                              </g>
                            ))}

                          {peerNodes.map((node) => (
                            <g
                              key={`node-${stock.ticker}-${node.ticker}`}
                              className="peer-node"
                            >
                              <circle
                                cx={node.x}
                                cy={node.y}
                                r={node.isCenter ? 8 : 5.5}
                                fill={
                                  node.isCenter
                                    ? getTickerColor(node.ticker)
                                    : getSectorColor(node.sector)
                                }
                                stroke={node.isCenter ? "#ffffff" : "#4c525e"}
                                strokeWidth={node.isCenter ? 1.2 : 0.6}
                              />
                              <text
                                x={node.x}
                                y={node.y + (node.isCenter ? 0.8 : 0.5)}
                                textAnchor="middle"
                                className="peer-node-label"
                                style={{
                                  fontSize: node.isCenter ? "3px" : "2.2px",
                                  fontWeight: node.isCenter ? 700 : 600,
                                }}
                              >
                                {node.ticker}
                              </text>
                            </g>
                          ))}
                        </svg>
                        <div className="peer-network-scale">
                          <span className="peer-key-title">Position key</span>
                          <div className="peer-key-items">
                            <span className="peer-key-item">
                              <span className="peer-key-swatch peer-key-swatch-inner" />
                              Center ring: more similar
                            </span>
                            <span className="peer-key-item">
                              <span className="peer-key-swatch peer-key-swatch-outer" />
                              Outer rings: less similar
                            </span>
                          </div>
                        </div>
                        {sectorLegend.length > 0 && (
                          <div className="peer-legend">
                            {sectorLegend.map(([sector, node]) => (
                              <span
                                key={`legend-${stock.ticker}-${sector}`}
                                className="peer-legend-item"
                              >
                                <span
                                  className="peer-legend-dot"
                                  style={{
                                    backgroundColor: getSectorColor(
                                      node.sector,
                                    ),
                                  }}
                                />
                                {sector}
                              </span>
                            ))}
                          </div>
                        )}
                        {peerOnlyNodes.length > 0 && (
                          <div className="peer-table">
                            <div className="peer-table-head">
                              <span>Peer</span>
                              <span>Sector</span>
                              <span>Market Cap</span>
                              <span>Similarity</span>
                            </div>
                            {peerOnlyNodes
                              .slice()
                              .sort((a, b) => b.similarity - a.similarity)
                              .map((node) => (
                                <div
                                  key={`peer-row-${stock.ticker}-${node.ticker}`}
                                  className="peer-table-row"
                                >
                                  <span className="peer-table-ticker">
                                    {node.ticker}
                                  </span>
                                  <span>{node.sector ?? "—"}</span>
                                  <span>{formatMarketCap(node.marketCap)}</span>
                                  <span className="peer-table-sim">
                                    {(node.similarity * 100).toFixed(1)}%
                                  </span>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
