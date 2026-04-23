import { CompareResponse } from "../types";

export default function CompareSummary({
  data,
}: {
  data: CompareResponse;
}): JSX.Element {
  const moved = data.diff.filter(
    (d) => d.status === "moved" && d.delta !== null,
  );
  const newOnly = data.diff.filter((d) => d.status === "new");
  const dropped = data.diff.filter((d) => d.status === "dropped");
  const sameCount = data.diff.filter((d) => d.status === "same").length;

  return (
    <div className="compare-card">
      <div className="compare-header">
        <span className="expanded-label">SVD impact (with vs without)</span>
        <span className="compare-meta">
          {data.with_svd.length} with · {data.without_svd.length} without ·{" "}
          {sameCount} unchanged · {newOnly.length} new · {dropped.length}{" "}
          dropped · {moved.length} moved
        </span>
      </div>
      <p className="compare-help">
        Each row shows how the SVD layer changed the ranking compared to
        TF‑IDF only. <strong>▲</strong> means SVD pushed the company up the
        list; <strong>new via SVD</strong> means it would not have appeared
        without latent concepts.
      </p>
      <div className="compare-table">
        <div className="compare-table-head">
          <span>Ticker</span>
          <span>With SVD</span>
          <span>Without SVD</span>
          <span>Δ rank</span>
          <span>Status</span>
        </div>
        {data.diff.slice(0, 12).map((d) => (
          <div key={`cmp-${d.ticker}`} className="compare-table-row">
            <span className="compare-ticker">{d.ticker}</span>
            <span>{d.rank_with_svd ?? "—"}</span>
            <span>{d.rank_without_svd ?? "—"}</span>
            <span
              className={
                d.delta === null
                  ? "compare-delta neutral"
                  : d.delta > 0
                    ? "compare-delta up"
                    : d.delta < 0
                      ? "compare-delta down"
                      : "compare-delta neutral"
              }
            >
              {d.delta === null ? "—" : d.delta > 0 ? `+${d.delta}` : d.delta}
            </span>
            <span className={`compare-status ${d.status}`}>{d.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
