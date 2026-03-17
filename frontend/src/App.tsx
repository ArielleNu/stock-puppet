import { useState, useEffect } from 'react'
import './App.css'
import SearchIcon from './assets/mag.png'
import { Stock, QueryMode } from './types'
import Chat from './Chat'

const TICKER_COLORS: Record<string, string> = {
  AAPL: '#555555', MSFT: '#00a4ef', NVDA: '#76b900', AVGO: '#cc0000',
  GOOGL: '#4285f4', AMZN: '#ff9900', META: '#0668e1', TSLA: '#cc0000',
  NEE: '#0072ce', JPM: '#003087', V: '#1a1f71', UNH: '#002677',
}

function getTickerColor(ticker: string): string {
  return TICKER_COLORS[ticker] || `hsl(${[...ticker].reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 50%, 45%)`
}

function formatMarketCap(cap: number | string | undefined): string {
  if (cap === undefined || cap === null) return '—'
  if (typeof cap === 'string') return cap
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(1)}T`
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(0)}M`
  return `$${cap.toLocaleString()}`
}

function App(): JSX.Element {
  const [useLlm, setUseLlm] = useState<boolean | null>(null)
  const [queryMode, setQueryMode] = useState<QueryMode>('text')
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [stocks, setStocks] = useState<Stock[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState<boolean>(false)

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(data => setUseLlm(data.use_llm))
      .catch(() => setUseLlm(false))
  }, [])

  const handleSearch = async (value: string): Promise<void> => {
    setSearchTerm(value)
    setError(null)
    if (value.trim() === '') { setStocks([]); setHasSearched(false); return }
    setLoading(true)
    setHasSearched(true)
    try {
      const res = await fetch(
        `/api/search?query=${encodeURIComponent(value)}&mode=${queryMode}`
      )
      if (!res.ok) throw new Error(`Server returned ${res.status}`)
      const data: Stock[] = await res.json()
      setStocks(data)
    } catch (err) {
      setStocks([])
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    handleSearch(searchTerm)
  }

  const getSentimentInfo = (score: number) => {
    if (score >= 0.3) return { label: 'Bullish', cls: 'bullish' }
    if (score <= -0.3) return { label: 'Bearish', cls: 'bearish' }
    return { label: 'Neutral', cls: 'neutral' }
  }

  if (useLlm === null) return <></>

  return (
    <div className={`app ${useLlm ? 'llm-mode' : ''}`}>
      <nav className="topbar">
        <div className="topbar-left">
          <div className="brand">
            <svg className="brand-chart-icon" width="20" height="16" viewBox="0 0 20 16" fill="none">
              <polyline points="1,14 5,9 9,11 13,4 17,7 19,2" stroke="#2962ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="brand-name">StockPuppet</span>
          </div>
          <span className="brand-divider" />
          <span className="brand-sub">Stock Screener</span>
        </div>
      </nav>

      <div className="hero">
        <div className="hero-logo">
          <svg className="logo-marionette" width="120" height="150" viewBox="0 0 120 150" fill="none">
            {/* control bar */}
            <line x1="30" y1="6" x2="90" y2="26" stroke="#d1d4dc" strokeWidth="4" strokeLinecap="round"/>
            <line x1="90" y1="6" x2="30" y2="26" stroke="#d1d4dc" strokeWidth="4" strokeLinecap="round"/>
            {/* strings */}
            <line x1="35" y1="9"  x2="48" y2="68"  stroke="#2962ff" strokeWidth="1.2" opacity="0.55"/>
            <line x1="85" y1="9"  x2="72" y2="68"  stroke="#2962ff" strokeWidth="1.2" opacity="0.55"/>
            <line x1="60" y1="16" x2="60" y2="46"  stroke="#2962ff" strokeWidth="1.2" opacity="0.55"/>
            <line x1="38" y1="23" x2="40" y2="108" stroke="#2962ff" strokeWidth="1.2" opacity="0.55"/>
            <line x1="82" y1="23" x2="80" y2="108" stroke="#2962ff" strokeWidth="1.2" opacity="0.55"/>
            {/* body */}
            <circle cx="60" cy="52" r="12" fill="#d1d4dc"/>
            <ellipse cx="60" cy="82" rx="14" ry="18" fill="#d1d4dc"/>
            <path d="M46 74 Q34 62 30 68 Q26 74 38 78" fill="#d1d4dc"/>
            <circle cx="30" cy="68" r="4" fill="#d1d4dc"/>
            <path d="M74 74 Q86 68 90 74 Q94 80 82 80" fill="#d1d4dc"/>
            <circle cx="90" cy="74" r="4" fill="#d1d4dc"/>
            <path d="M52 97 L42 126 Q40 130 44 130 L50 130 Q54 130 52 126 Z" fill="#d1d4dc"/>
            <path d="M68 97 L78 126 Q80 130 76 130 L70 130 Q66 130 68 126 Z" fill="#d1d4dc"/>
            {/* chart on torso */}
            <polyline points="48,88 52,82 56,85 60,76 64,80 68,74 72,78" stroke="#2962ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="68" cy="74" r="2.5" fill="#2962ff"/>
          </svg>
        </div>

        <h1 className="hero-title">
          Stock<span className="hero-highlight">Puppet</span>
        </h1>
        <p className="hero-sub">Discover stocks that match your investment strategy</p>

        <div className="mode-tabs">
          <button className={`tab ${queryMode === 'text' ? 'active' : ''}`} onClick={() => setQueryMode('text')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            Theme Search
          </button>
          <button className={`tab ${queryMode === 'portfolio' ? 'active' : ''}`} onClick={() => setQueryMode('portfolio')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
            Portfolio Match
          </button>
        </div>

        <form className="search-form" onSubmit={handleSubmit}>
          <div className="search-input-wrap">
            <img src={SearchIcon} alt="" className="search-mag" />
            <input
              id="search-input"
              placeholder={
                queryMode === 'text'
                  ? 'Search by theme... "high dividend tech" or "AI chip makers"'
                  : 'Enter tickers... AAPL, MSFT, NVDA, TSLA'
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoComplete="off"
            />
          </div>
          <button type="submit" className="search-submit" disabled={loading}>
            {loading
              ? <span className="spinner" />
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            }
          </button>
        </form>
      </div>

      {error && (
        <div className="state-message error-state">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef5350" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          <span>{error}</span>
        </div>
      )}

      {!error && hasSearched && !loading && stocks.length === 0 && (
        <div className="state-message empty-state">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#787b86" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><path d="M8 11h6"/></svg>
          <span>No matching stocks found. Try a different query.</span>
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
              const sent = stock.sentiment !== undefined ? getSentimentInfo(stock.sentiment) : null
              return (
                <div key={i} className="row">
                  <div className="row-main">
                    <div className="ticker-badge" style={{ backgroundColor: getTickerColor(stock.ticker) }}>
                      {stock.ticker.slice(0, 2)}
                    </div>
                    <div className="row-info">
                      <div className="row-top">
                        <span className="row-ticker">{stock.ticker}</span>
                        <span className="row-name">{stock.name}</span>
                      </div>
                      <div className="row-bottom">
                        <span className="row-industry">{stock.industry ?? stock.sector ?? ''}</span>
                        <span className="row-desc">{stock.description ?? ''}</span>
                      </div>
                    </div>
                  </div>
                  <div className="row-data">
                    <span className="cell col-match">
                      <span className="match-bar-bg">
                        <span className="match-bar-fill" style={{ width: `${stock.similarity * 100}%` }} />
                      </span>
                      <span className="match-pct">{(stock.similarity * 100).toFixed(0)}%</span>
                    </span>
                    <span className="cell col-cap mono">{formatMarketCap(stock.market_cap)}</span>
                    <span className="cell col-div mono">
                      {stock.dividend_yield !== undefined ? `${stock.dividend_yield.toFixed(2)}%` : '—'}
                    </span>
                    <span className={`cell col-sent ${sent?.cls ?? ''}`}>
                      {sent ? sent.label : '—'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {useLlm && <Chat onSearchTerm={handleSearch} />}
    </div>
  )
}

export default App
