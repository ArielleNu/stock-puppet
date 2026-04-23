import { Stock } from "../types";
import { getSectorColor, getTickerColor } from "../utils/colors";
import { formatMarketCap } from "../utils/format";
import { PeerNode, PeerScope, getPeerNodes } from "../utils/peers";

interface PeerNetworkProps {
  stock: Stock;
  peerScope: PeerScope;
  resultPeers: Stock[];
  globalPeers: Stock[];
  loadingGlobal: boolean;
  onScopeChange: (scope: PeerScope) => void;
}

export default function PeerNetwork({
  stock,
  peerScope,
  resultPeers,
  globalPeers,
  loadingGlobal,
  onScopeChange,
}: PeerNetworkProps): JSX.Element {
  const selectedPeers = peerScope === "global" ? globalPeers : resultPeers;
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

  const metaText = loadingGlobal
    ? "Loading global peers..."
    : peerCount > 0
      ? peerScope === "global"
        ? `${peerCount} global TF-IDF peers`
        : `${peerCount} nearby peers from this result set`
      : "No peers available";

  return (
    <div className="peer-network-card">
      <div className="peer-network-header">
        <span className="expanded-label">Peer Network Graph</span>
        <div
          className="peer-scope-tabs"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className={`peer-scope-tab ${peerScope === "result" ? "active" : ""}`}
            onClick={() => onScopeChange("result")}
          >
            Result Set
          </button>
          <button
            type="button"
            className={`peer-scope-tab ${peerScope === "global" ? "active" : ""}`}
            onClick={() => onScopeChange("global")}
          >
            Global
          </button>
        </div>
        <span className="peer-network-meta">{metaText}</span>
      </div>

      <svg
        className="peer-network-svg"
        viewBox="0 0 100 100"
        role="img"
        aria-label={`Peer network for ${stock.ticker}`}
      >
        <circle cx="50" cy="50" r="14" className="peer-ring" />
        <circle cx="50" cy="50" r="28" className="peer-ring" />
        <circle cx="50" cy="50" r="42" className="peer-ring" />

        {centerNode &&
          peerOnlyNodes.map((node) => (
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

        {peerNodes.map((node: PeerNode) => (
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
                style={{ backgroundColor: getSectorColor(node.sector) }}
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
                <span className="peer-table-ticker">{node.ticker}</span>
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
  );
}
