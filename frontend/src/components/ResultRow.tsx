import { CompareDiffEntry, Stock } from "../types";
import { getTickerColor } from "../utils/colors";
import {
  formatMarketCap,
  getSentimentInfo,
} from "../utils/format";
import { getMatchColor } from "../utils/colors";
import { PeerScope } from "../utils/peers";
import LatentDimensionPanel from "./LatentDimensions";
import PeerNetwork from "./PeerNetwork";
import RankBadge from "./RankBadge";
import ScoreBreakdown from "./ScoreBreakdown";

interface ResultRowProps {
  stock: Stock;
  index: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  diffEntry?: CompareDiffEntry;
  peerScope: PeerScope;
  resultPeers: Stock[];
  globalPeers: Stock[];
  loadingGlobalPeers: boolean;
  onPeerScopeChange: (scope: PeerScope) => void;
}

function RowHeader({
  stock,
  diffEntry,
}: {
  stock: Stock;
  diffEntry?: CompareDiffEntry;
}): JSX.Element {
  return (
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
          {diffEntry && <RankBadge entry={diffEntry} />}
        </div>
        <span className="row-industry">
          {stock.industry ?? stock.sector ?? ""}
        </span>
        <span className="row-desc">{stock.description ?? ""}</span>
        {stock.explanation?.short && (
          <span className="row-explainer">
            Why: {stock.explanation.short}
          </span>
        )}
      </div>
    </div>
  );
}

function RowMetrics({ stock }: { stock: Stock }): JSX.Element {
  const sent =
    stock.sentiment !== undefined ? getSentimentInfo(stock.sentiment) : null;
  return (
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
          style={{ color: getMatchColor(stock.similarity * 100) }}
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
  );
}

function ExpandedMetaGrid({ stock }: { stock: Stock }): JSX.Element {
  return (
    <div className="expanded-grid">
      <div className="expanded-col">
        <span className="expanded-label">Sector</span>
        <span className="expanded-value">{stock.sector ?? "—"}</span>
      </div>
      <div className="expanded-col">
        <span className="expanded-label">Industry</span>
        <span className="expanded-value">{stock.industry ?? "—"}</span>
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
            {stock.website.replace(/^https?:\/\/(www\.)?/, "")}
          </a>
        </div>
      )}
    </div>
  );
}

function ExplanationBlock({ stock }: { stock: Stock }): JSX.Element | null {
  const ex = stock.explanation;
  if (!ex) return null;
  const reasons = (ex.reasons ?? []).filter(
    (r) => !r.toLowerCase().startsWith("evidence:"),
  );
  return (
    <div className="expanded-explanation">
      <span className="expanded-label">Why this was recommended</span>
      {reasons.length > 0 && (
        <ul className="expanded-reason-list">
          {reasons.slice(0, 3).map((reason, idx) => (
            <li key={`${stock.ticker}-reason-${idx}`}>{reason}</li>
          ))}
        </ul>
      )}
      {ex.matched_terms && ex.matched_terms.length > 0 && (
        <div className="term-chip-wrap">
          {ex.matched_terms.slice(0, 3).map((termObj) => (
            <span
              key={`${stock.ticker}-term-${termObj.term}`}
              className={`term-chip ${termObj.match_type ?? ""}`}
            >
              {termObj.term}
            </span>
          ))}
        </div>
      )}
      {ex.semantic_matches && ex.semantic_matches.length > 0 && (
        <div className="related-terms-row">
          <span className="expanded-label">Related terms</span>
          <span className="related-terms-text">
            {ex.semantic_matches.slice(0, 4).join(", ")}
          </span>
        </div>
      )}
      <ScoreBreakdown explanation={ex} ticker={stock.ticker} />
      {ex.latent && ex.latent.dimensions && ex.latent.dimensions.length > 0 && (
        <LatentDimensionPanel
          latent={ex.latent}
          tickerKey={stock.ticker}
          componentScores={stock.component_scores}
        />
      )}
      {ex.snippets && ex.snippets.length > 0 && (
        <div className="explain-snippets">
          <span className="expanded-label">Evidence snippet</span>
          <p>{ex.snippets[0]}</p>
        </div>
      )}
    </div>
  );
}

export default function ResultRow({
  stock,
  isExpanded,
  onToggleExpand,
  diffEntry,
  peerScope,
  resultPeers,
  globalPeers,
  loadingGlobalPeers,
  onPeerScopeChange,
}: ResultRowProps): JSX.Element {
  return (
    <div
      className={`row ${isExpanded ? "row-expanded" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onToggleExpand}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleExpand();
        }
      }}
    >
      <div className="row-top-section">
        <RowHeader stock={stock} diffEntry={diffEntry} />
        <RowMetrics stock={stock} />
      </div>

      {isExpanded && (
        <div className="row-expanded-card">
          <ExpandedMetaGrid stock={stock} />
          {stock.description && (
            <div className="expanded-desc-full">
              <span className="expanded-label">About</span>
              <p>{stock.description}</p>
            </div>
          )}
          <ExplanationBlock stock={stock} />
          <PeerNetwork
            stock={stock}
            peerScope={peerScope}
            resultPeers={resultPeers}
            globalPeers={globalPeers}
            loadingGlobal={loadingGlobalPeers}
            onScopeChange={onPeerScopeChange}
          />
        </div>
      )}
    </div>
  );
}
