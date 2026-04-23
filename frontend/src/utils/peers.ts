import { Stock } from "../types";

export type PeerScope = "result" | "global";

export interface PeerNode {
  ticker: string;
  similarity: number;
  x: number;
  y: number;
  isCenter: boolean;
  sector?: string;
  marketCap?: number | string;
}

export function getPeerNodes(center: Stock, peers: Stock[]): PeerNode[] {
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
