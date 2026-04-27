import { useEffect, useRef, useState } from "react";
import "./App.css";
import SearchIcon from "./assets/mag.png";
import CompareSummary from "./components/CompareSummary";
import ResultRow from "./components/ResultRow";
import PreferencesPanel from "./components/PreferencesPanel";
import { BrandChartIcon, HeroMarionette } from "./components/BrandMark";
import {
  AiQuerySuggestion,
  AiRecommendations,
  CompareResponse,
  QueryMode,
  Stock,
} from "./types";
import {
  Preferences,
  SearchMethod,
  fetchCompare,
  fetchConfig,
  fetchGlobalPeers,
  fetchRecommend,
} from "./utils/api";
import { parsePortfolioInput } from "./utils/format";
import { PeerScope } from "./utils/peers";
type SearchHistoryItem = {
  id: string;
  mode: QueryMode;
  query: string;
  portfolioTickers?: string[];
  portfolioMode?: "similar" | "diversify";
  searchMethod?: SearchMethod;
  riskTolerance?: string;
  focus?: string;
  capPreference?: string;
  timestamp: number;
};
const timeAgo = (timestamp: number): string => {
  const now = Date.now();
  const diff = Math.floor((now - timestamp) / 1000); // seconds

  if (diff < 60) return "just now";

  const minutes = Math.floor(diff / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(months / 12);
  return `${years}y ago`;
};

function App(): JSX.Element {
  const [useLlm, setUseLlm] = useState<boolean | null>(null);
  const [queryMode, setQueryMode] = useState<QueryMode>("text");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [portfolioMode, setPortfolioMode] = useState<"similar" | "diversify">(
    "similar",
  );
  const [portfolioTickers, setPortfolioTickers] = useState<string[]>([]);
  const [tickerInput, setTickerInput] = useState("");
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
  const [searchMethod, setSearchMethod] = useState<SearchMethod>("hybrid");
  const [compareData, setCompareData] = useState<CompareResponse | null>(null);
  const [aiQuerySuggestion, setAiQuerySuggestion] =
    useState<AiQuerySuggestion | null>(null);
  const [aiRecommendations, setAiRecommendations] =
    useState<AiRecommendations | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [prefsClosing, setPrefsClosing] = useState(false);
  const [collapsingIdx, setCollapsingIdx] = useState<number | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const prefsRef = useRef<HTMLDivElement | null>(null);
  const historyRef = useRef<HTMLDivElement | null>(null);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    fetchConfig()
      .then((data) => setUseLlm(Boolean(data.use_llm)))
      .catch(() => setUseLlm(false));
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem("stockpuppet-search-history");
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as SearchHistoryItem[];
      setSearchHistory(parsed);
    } catch {
      localStorage.removeItem("stockpuppet-search-history");
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        historyRef.current &&
        !historyRef.current.contains(e.target as Node)
      ) {
        setShowHistory(false);
      }
    };

    if (showHistory) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showHistory]);

  const expandAndFocusRow = (idx: number): void => {
    const stock = stocks[idx];
    if (!stock) return;

    const isClosing = expandedIdx === idx;

    if (isClosing) {
      setCollapsingIdx(idx);

      setTimeout(() => {
        setExpandedIdx(null);
        setCollapsingIdx(null);

        const rowEl = rowRefs.current[stock.ticker];
        if (rowEl) {
          const topbarOffset = 90;
          const rowTop = rowEl.getBoundingClientRect().top + window.scrollY;

          window.scrollTo({
            top: rowTop - topbarOffset,
            behavior: "smooth",
          });
        }
      }, 180);

      return;
    }

    setExpandedIdx(idx);

    requestAnimationFrame(() => {
      setTimeout(() => {
        const rowEl = rowRefs.current[stock.ticker];
        if (rowEl) {
          const topbarOffset = 90;
          const rowTop = rowEl.getBoundingClientRect().top + window.scrollY;

          window.scrollTo({
            top: rowTop - topbarOffset,
            behavior: "smooth",
          });
        }
      }, 80);
    });
  };

  const resetToHome = (): void => {
    setIsResetting(true);

    setTimeout(() => {
      setSearchTerm("");
      setStocks([]);
      setAiQuerySuggestion(null);
      setAiRecommendations(null);
      setCompareData(null);
      setExpandedIdx(null);
      setHasSearched(false);
      setError(null);

      window.scrollTo({ top: 0, behavior: "smooth" });

      setIsResetting(false);
    }, 180); // matches CSS transition
  };

  const saveSearchHistoryItem = (value: string): void => {
    const trimmed = value.trim();
    if (!trimmed) return;

    const item: SearchHistoryItem = {
      id: `${Date.now()}-${trimmed}`,
      mode: queryMode,
      query: trimmed,
      portfolioTickers:
        queryMode === "portfolio"
          ? portfolioTickers.length > 0
            ? portfolioTickers
            : parsePortfolioInput(trimmed)
          : undefined,
      portfolioMode: queryMode === "portfolio" ? portfolioMode : undefined,
      searchMethod: queryMode === "text" ? searchMethod : undefined,
      riskTolerance,
      focus,
      capPreference,
      timestamp: Date.now(),
    };

    setSearchHistory((prev) => {
      const withoutDuplicate = prev.filter(
        (h) =>
          !(
            h.mode === item.mode &&
            h.query.toLowerCase() === item.query.toLowerCase() &&
            h.portfolioMode === item.portfolioMode &&
            h.riskTolerance === item.riskTolerance &&
            h.focus === item.focus &&
            h.capPreference === item.capPreference &&
            h.searchMethod === item.searchMethod
          ),
      );

      const next = [item, ...withoutDuplicate].slice(0, 8);
      localStorage.setItem("stockpuppet-search-history", JSON.stringify(next));
      return next;
    });
  };

  const runHistorySearch = (item: SearchHistoryItem): void => {
    setShowHistory(false);
    setQueryMode(item.mode);
    setRiskTolerance(item.riskTolerance ?? "any");
    setFocus(item.focus ?? "any");
    setCapPreference(item.capPreference ?? "any");

    if (item.mode === "portfolio") {
      setPortfolioMode(item.portfolioMode ?? "similar");
      setPortfolioTickers(item.portfolioTickers ?? parsePortfolioInput(item.query));
      setSearchTerm(item.query);
      handleSearch(item.query);
      return;
    }

    setSearchMethod(item.searchMethod ?? "hybrid");
    setSearchTerm(item.query);
    handleSearch(item.query);
  };

  const runSearch = async (value: string): Promise<void> => {
    const preferences: Preferences = {
      risk_tolerance: riskTolerance,
      focus,
      cap_preference: capPreference,
    };

    if (queryMode === "portfolio") {
      const portfolio =
        portfolioTickers.length > 0
          ? portfolioTickers
          : parsePortfolioInput(value);
      if (portfolio.length === 0) {
        setStocks([]);
        setError("Add at least one ticker to your portfolio.");
        return;
      }
      const result = await fetchRecommend({
        portfolio,
        portfolio_mode: portfolioMode,
        preferences,
      });
      setStocks(result.stocks);
      setAiQuerySuggestion(result.aiQuerySuggestion);
      setAiRecommendations(result.aiRecommendations);
      return;
    }

    if (searchMethod === "compare") {
      const cmp = await fetchCompare(value, 10);
      setStocks(cmp.with_svd);
      setCompareData(cmp);
      return;
    }

    const result = await fetchRecommend({
      query: value,
      method: searchMethod === "tfidf" ? "tfidf" : "hybrid",
      preferences,
    });
    setStocks(result.stocks);
    setAiQuerySuggestion(result.aiQuerySuggestion);
    setAiRecommendations(result.aiRecommendations);
  };

  const handleSearch = async (value: string): Promise<void> => {
    setSearchTerm(value);
    setError(null);
    setCompareData(null);

    if (value.trim() === "") {
      setStocks([]);
      setAiQuerySuggestion(null);
      setAiRecommendations(null);
      setHasSearched(false);
      return;
    }

    // clear old results immediately for any new search
    setStocks([]);
    setAiQuerySuggestion(null);
    setAiRecommendations(null);
    setExpandedIdx(null);

    setLoading(true);
    setHasSearched(true);

    try {
      await runSearch(value);
      saveSearchHistoryItem(value);
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
    if (queryMode === "portfolio" && portfolioTickers.length > 0) {
      handleSearch(portfolioTickers.join(", "));
    } else {
      handleSearch(searchTerm);
    }
  };

  const handlePeerScopeChange = async (
    ticker: string,
    scope: PeerScope,
  ): Promise<void> => {
    setPeerScopeByTicker((prev) => ({ ...prev, [ticker]: scope }));
    if (scope !== "global" || globalPeersByTicker[ticker]) return;

    setGlobalPeersLoading((prev) => ({ ...prev, [ticker]: true }));
    try {
      const peers = await fetchGlobalPeers(ticker, 6);
      setGlobalPeersByTicker((prev) => ({ ...prev, [ticker]: peers }));
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
          <button className="brand-button" onClick={resetToHome}>
            <div className="brand">
              <BrandChartIcon />
              <span className="brand-name">StockPuppet</span>
            </div>
          </button>
          <span className="brand-divider" />
          <span className="brand-sub">Stock Screener</span>
        </div>
        <div className="topbar-right" ref={historyRef}>
          <button
            type="button"
            className="topbar-history-btn"
            onClick={(e) => {
              e.stopPropagation();
              setShowHistory((prev) => !prev);
            }}
            disabled={searchHistory.length === 0}
          >
            <svg
              className="btn-icon"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v15H6.5A2.5 2.5 0 0 0 4 19.5V4.5A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            Search History
          </button>

          {showHistory && searchHistory.length > 0 && (
            <div className="history-popover">
              <div className="history-header">
                <span>Recent Searches</span>
              </div>
              {searchHistory.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="history-item"
                  onClick={() => runHistorySearch(item)}
                >
                  <div className="history-main">
                    <span className="history-mode">
                      {item.mode === "portfolio" ? "Portfolio" : "Theme"}
                    </span>
                    <span className="history-query">{item.query}</span>
                  </div>

                  <span className="history-time">
                    {timeAgo(item.timestamp)}
                  </span>
                </button>
              ))}
              <div className="history-footer">
                <button
                  type="button"
                  className="history-clear"
                  onClick={() => {
                    setSearchHistory([]);
                    localStorage.removeItem("stockpuppet-search-history");
                  }}
                >
                  Clear History
                </button>
              </div>
            </div>
          )}
        </div>
      </nav>
      <div
        className={`hero ${hasSearched ? "hero-compact" : ""}`}
      >
        <div className="hero-logo">
          <HeroMarionette />
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            Theme Search
          </button>
          <button
            className={`tab ${queryMode === "portfolio" ? "active" : ""}`}
            onClick={() => setQueryMode("portfolio")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
        <div className="utility-actions">
          <button className="prefs-toggle" onClick={() => {
            if (showPrefs) {
              setPrefsClosing(true);
              setTimeout(() => {
                setShowPrefs(false);
                setPrefsClosing(false);
              }, 180);
            } else {
              setShowPrefs(true);

              requestAnimationFrame(() => {
                setTimeout(() => {
                  const el = prefsRef.current;
                  if (!el) return;

                  const rect = el.getBoundingClientRect();
                  const bottomOffset = 32;

                  window.scrollTo({
                    top: window.scrollY + rect.bottom - window.innerHeight + bottomOffset,
                    behavior: "smooth",
                  });
                }, 80);
              });
            }
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3v1m0 16v1m-8-9H3m18 0h-1m-2.636-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            {showPrefs ? "Hide Preferences" : "Preferences"}
          </button>
        </div>

        {showPrefs && (
          <div
            ref={prefsRef}
            className={`prefs-panel-wrap ${prefsClosing ? "prefs-closing" : ""}`}
          >
            <PreferencesPanel
              riskTolerance={riskTolerance}
              focus={focus}
              capPreference={capPreference}
              onRiskChange={setRiskTolerance}
              onFocusChange={setFocus}
              onCapChange={setCapPreference}
              queryMode={queryMode}
              searchMethod={searchMethod}
              onSearchMethodChange={setSearchMethod}
              portfolioMode={portfolioMode}
              onPortfolioModeChange={setPortfolioMode}
              portfolioTickers={portfolioTickers}
              onPortfolioTickersChange={setPortfolioTickers}
              tickerInput={tickerInput}
              onTickerInputChange={setTickerInput}
            />
          </div>
        )}
      </div>
      {
        loading && (
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
        )
      }

      {
        error && (
          <div className="state-message error-state">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef5350" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            <span>{error}</span>
          </div>
        )
      }

      {
        !error && hasSearched && !loading && stocks.length === 0 && (
          <div className="state-message empty-state">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#787b86" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
              <path d="M8 11h6" />
            </svg>
            <span>No matching stocks found. Try a different query.</span>
          </div>
        )
      }

      {
        hasSearched && (
          <div className={`content ${isResetting ? "content-fade" : ""}`}>
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
                            onClick={() => expandAndFocusRow(idx)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                expandAndFocusRow(idx);
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
                            <span className="ai-rec-hint">
                              Click to view in results
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

            {compareData && stocks.length > 0 && (
              <CompareSummary data={compareData} />
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
                    const peerScope =
                      peerScopeByTicker[stock.ticker] ?? "result";
                    const resultPeers = stocks
                      .filter((s) => s.ticker !== stock.ticker)
                      .sort((a, b) => b.similarity - a.similarity)
                      .slice(0, 6);
                    const diffEntry = compareData?.diff.find(
                      (d) => d.ticker === stock.ticker,
                    );
                    return (
                      <div
                        key={`${stock.ticker}-${i}`}
                        ref={(el) => {
                          rowRefs.current[stock.ticker] = el;
                        }}
                      >
                        <ResultRow
                          stock={stock}
                          index={i}
                          isExpanded={expandedIdx === i}
                          isCollapsing={collapsingIdx === i}
                          onToggleExpand={() => expandAndFocusRow(i)}
                          diffEntry={diffEntry}
                          peerScope={peerScope}
                          resultPeers={resultPeers}
                          globalPeers={globalPeersByTicker[stock.ticker] ?? []}
                          loadingGlobalPeers={
                            !!globalPeersLoading[stock.ticker]
                          }
                          onPeerScopeChange={(scope) =>
                            handlePeerScopeChange(stock.ticker, scope)
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )
      }
    </div >
  );
}

export default App;
