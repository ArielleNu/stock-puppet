import { useState } from "react";
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
  isCollapsing?: boolean;
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

function SectionCard({
  title,
  meta,
  children,
  className,
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <section className={`expanded-section ${className ?? ""}`.trim()}>
      <header className="expanded-section-head">
        <span className="expanded-section-title">{title}</span>
        {meta && <span className="expanded-section-meta">{meta}</span>}
      </header>
      <div className="expanded-section-body">{children}</div>
    </section>
  );
}

function StatTile({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="stat-tile">
      <span className="stat-tile-label">{label}</span>
      <span className="stat-tile-value">{children}</span>
    </div>
  );
}

function SnapshotCard({ stock }: { stock: Stock }): JSX.Element {
  const hq = [stock.city, stock.state, stock.country]
    .filter(Boolean)
    .join(", ");
  return (
    <SectionCard title="Snapshot" className="snapshot-card">
      <div className="stat-tile-grid">
        <StatTile label="Sector">{stock.sector ?? "—"}</StatTile>
        <StatTile label="Industry">{stock.industry ?? "—"}</StatTile>
        <StatTile label="Market Cap">
          {formatMarketCap(stock.market_cap)}
        </StatTile>
        <StatTile label="Dividend Yield">
          {stock.dividend_yield !== undefined
            ? `${stock.dividend_yield.toFixed(2)}%`
            : "—"}
        </StatTile>
        {hq && <StatTile label="Headquarters">{hq}</StatTile>}
        {stock.website && (
          <StatTile label="Website">
            <a
              className="expanded-link"
              href={stock.website}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              {stock.website.replace(/^https?:\/\/(www\.)?/, "")}
            </a>
          </StatTile>
        )}
      </div>
    </SectionCard>
  );
}

function AboutCard({ stock }: { stock: Stock }): JSX.Element | null {
  const [open, setOpen] = useState(false);
  if (!stock.description) return null;
  const isLong = stock.description.length > 480;

  return (
    <section className={`expanded-section about-card ${open ? "about-open" : ""}`}>
      <header className="expanded-section-head">
        <span className="expanded-section-title">About</span>
        {isLong && (
          <button
            type="button"
            className="about-toggle"
            aria-expanded={open}
            aria-label={open ? "Show less" : "Show more"}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
          >
            <span>{open ? "Show less" : "Show more"}</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              className={`about-chevron ${open ? "open" : ""}`}
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}
      </header>
      <div className="expanded-section-body">
        <p
          className={`expanded-about-text ${
            isLong && !open ? "about-clamped" : ""
          }`}
        >
          {stock.description}
        </p>
      </div>
    </section>
  );
}

function WhyMatchedCard({ stock }: { stock: Stock }): JSX.Element | null {
  const ex = stock.explanation;
  if (!ex) return null;
  const reasons = (ex.reasons ?? []).filter(
    (r) => !r.toLowerCase().startsWith("evidence:"),
  );
  const matchedTerms = ex.matched_terms ?? [];
  const relatedTerms = ex.semantic_matches ?? [];

  if (
    reasons.length === 0 &&
    matchedTerms.length === 0 &&
    relatedTerms.length === 0
  ) {
    return null;
  }

  return (
    <SectionCard title="Why this matched" className="why-card">
      {reasons.length > 0 && (
        <ul className="expanded-reason-list">
          {reasons.slice(0, 3).map((reason, idx) => (
            <li key={`${stock.ticker}-reason-${idx}`}>{reason}</li>
          ))}
        </ul>
      )}
      {(matchedTerms.length > 0 || relatedTerms.length > 0) && (
        <div className="why-tags">
          {matchedTerms.length > 0 && (
            <div className="why-tag-row">
              <span className="why-tag-label">Matched</span>
              <div className="term-chip-wrap">
                {matchedTerms.slice(0, 4).map((termObj) => (
                  <span
                    key={`${stock.ticker}-term-${termObj.term}`}
                    className={`term-chip ${termObj.match_type ?? ""}`}
                  >
                    {termObj.term}
                  </span>
                ))}
              </div>
            </div>
          )}
          {relatedTerms.length > 0 && (
            <div className="why-tag-row">
              <span className="why-tag-label">Related</span>
              <div className="term-chip-wrap">
                {relatedTerms.slice(0, 5).map((term, idx) => (
                  <span
                    key={`${stock.ticker}-related-${idx}`}
                    className="term-chip related"
                  >
                    {term}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function EvidenceCard({ stock }: { stock: Stock }): JSX.Element | null {
  const snippet = stock.explanation?.snippets?.[0];
  if (!snippet) return null;
  return (
    <SectionCard title="Evidence" className="evidence-card">
      <blockquote className="evidence-quote">{snippet}</blockquote>
    </SectionCard>
  );
}

function ScoringCard({ stock }: { stock: Stock }): JSX.Element | null {
  const ex = stock.explanation;
  if (!ex || !ex.score_breakdown) return null;
  return (
    <SectionCard title="Score breakdown" className="scoring-card">
      <ScoreBreakdown explanation={ex} ticker={stock.ticker} />
    </SectionCard>
  );
}

function LatentCard({ stock }: { stock: Stock }): JSX.Element | null {
  const ex = stock.explanation;
  if (!ex?.latent || !ex.latent.dimensions || ex.latent.dimensions.length === 0)
    return null;
  return (
    <SectionCard title="Semantic concepts" className="latent-card-wrap">
      <LatentDimensionPanel
        latent={ex.latent}
        tickerKey={stock.ticker}
        componentScores={stock.component_scores}
      />
    </SectionCard>
  );
}

export default function ResultRow({
  stock,
  isExpanded,
  isCollapsing,
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
        <div className={`row-expanded-card ${isCollapsing ? "row-collapsing" : ""}`}>
          <div className="expanded-top-row">
            <SnapshotCard stock={stock} />
            <AboutCard stock={stock} />
          </div>

          <WhyMatchedCard stock={stock} />

          <div className="expanded-analysis-row">
            <ScoringCard stock={stock} />
            <LatentCard stock={stock} />
          </div>

          <EvidenceCard stock={stock} />

          <SectionCard title="Peer network" className="peers-card-wrap">
            <PeerNetwork
              stock={stock}
              peerScope={peerScope}
              resultPeers={resultPeers}
              globalPeers={globalPeers}
              loadingGlobal={loadingGlobalPeers}
              onScopeChange={onPeerScopeChange}
            />
          </SectionCard>
        </div>
      )}
    </div>
  );
}
