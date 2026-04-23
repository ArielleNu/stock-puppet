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
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    fetchConfig()
      .then((data) => setUseLlm(Boolean(data.use_llm)))
      .catch(() => setUseLlm(false));
  }, []);

  const focusStockRow = (idx: number): void => {
    const stock = stocks[idx];
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

  const expandAndFocusRow = (idx: number): void => {
    const stock = stocks[idx];
    if (!stock) return;

    const wasExpanded = expandedIdx === idx;
    const nextExpanded = wasExpanded ? null : idx;

    setExpandedIdx(nextExpanded);

    if (nextExpanded === null) return;

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
        {queryMode === "portfolio" && (
          <div className="portfolio-builder">
            <div className="portfolio-mode-tabs">
              <button
                className={`pref-btn ${portfolioMode === "similar" ? "active" : ""}`}
                onClick={() => setPortfolioMode("similar")}
              >
                Find Similar
              </button>
              <button
                className={`pref-btn ${portfolioMode === "diversify" ? "active" : ""}`}
                onClick={() => setPortfolioMode("diversify")}
              >
                Diversify
              </button>
            </div>

            <div className="ticker-input-row">
              <input
                className="ticker-add-input"
                placeholder="Add ticker (e.g. NVDA)"
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const t = tickerInput.trim().toUpperCase();
                    if (t && !portfolioTickers.includes(t)) {
                      setPortfolioTickers([...portfolioTickers, t]);
                    }
                    setTickerInput("");
                  }
                }}
              />
              <button
                type="button"
                className="ticker-add-btn"
                onClick={() => {
                  const t = tickerInput.trim().toUpperCase();
                  if (t && !portfolioTickers.includes(t)) {
                    setPortfolioTickers([...portfolioTickers, t]);
                  }
                  setTickerInput("");
                }}
              >
                Add
              </button>
            </div>

            {portfolioTickers.length > 0 && (
              <div className="ticker-chips">
                {portfolioTickers.map((t) => (
                  <span key={t} className="ticker-chip">
                    {t}
                    <button
                      className="ticker-chip-x"
                      onClick={() =>
                        setPortfolioTickers(
                          portfolioTickers.filter((x) => x !== t),
                        )
                      }
                    >
                      &times;
                    </button>
                  </span>
                ))}
                <button
                  className="ticker-clear-btn"
                  onClick={() => setPortfolioTickers([])}
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        )}

        {queryMode === "text" && (
          <div className="method-tabs" title="Choose how rankings are computed">
            <span className="method-tabs-label">Ranking</span>
            <button
              type="button"
              className={`method-tab ${searchMethod === "hybrid" ? "active" : ""}`}
              onClick={() => setSearchMethod("hybrid")}
            >
              With SVD <span className="method-tab-sub">(hybrid)</span>
            </button>
            <button
              type="button"
              className={`method-tab ${searchMethod === "tfidf" ? "active" : ""}`}
              onClick={() => setSearchMethod("tfidf")}
            >
              Without SVD <span className="method-tab-sub">(TF‑IDF)</span>
            </button>
            <button
              type="button"
              className={`method-tab ${searchMethod === "compare" ? "active" : ""}`}
              onClick={() => setSearchMethod("compare")}
            >
              Compare
            </button>
          </div>
        )}

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

        <button className="prefs-toggle" onClick={() => setShowPrefs(!showPrefs)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3v1m0 16v1m-8-9H3m18 0h-1m-2.636-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          {showPrefs ? "Hide Preferences" : "Preferences"}
        </button>

        {showPrefs && (
          <PreferencesPanel
            riskTolerance={riskTolerance}
            focus={focus}
            capPreference={capPreference}
            onRiskChange={setRiskTolerance}
            onFocusChange={setFocus}
            onCapChange={setCapPreference}
          />
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
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef5350" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {!error && hasSearched && !loading && stocks.length === 0 && (
        <div className="state-message empty-state">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#787b86" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
            <path d="M8 11h6" />
          </svg>
          <span>No matching stocks found. Try a different query.</span>
        </div>
      )}

      {hasSearched && (
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
      )}
    </div>
  );
}

export default App;
