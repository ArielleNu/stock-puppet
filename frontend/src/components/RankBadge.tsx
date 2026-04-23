import { CompareDiffEntry } from "../types";

export default function RankBadge({
  entry,
}: {
  entry: CompareDiffEntry;
}): JSX.Element | null {
  if (entry.status === "new") {
    return (
      <span className="rank-badge new" title="Surfaced only by SVD ranking">
        new via SVD
      </span>
    );
  }
  if (entry.status === "dropped") {
    return (
      <span
        className="rank-badge dropped"
        title="Dropped from top results when SVD is applied"
      >
        dropped
      </span>
    );
  }
  if (entry.delta === null || entry.delta === 0) {
    return (
      <span className="rank-badge same" title="Same rank with and without SVD">
        same rank
      </span>
    );
  }
  const up = entry.delta > 0;
  return (
    <span
      className={`rank-badge ${up ? "up" : "down"}`}
      title={`Rank without SVD: #${entry.rank_without_svd ?? "?"} → with SVD: #${entry.rank_with_svd ?? "?"}`}
    >
      {up ? "▲" : "▼"} {Math.abs(entry.delta)} {up ? "via SVD" : "without SVD"}
    </span>
  );
}
