import { LatentDimension, Stock } from "../types";

function LatentDimensionRow({
  dim,
  tickerKey,
}: {
  dim: LatentDimension;
  tickerKey: string;
}): JSX.Element {
  // Map activation in approximately [-1, 1] to a width 0..50% on each side.
  const qPct = Math.min(50, Math.abs(dim.query_activation) * 50);
  const rPct = Math.min(50, Math.abs(dim.result_activation) * 50);
  const qSign = dim.query_activation >= 0 ? "pos" : "neg";
  const rSign = dim.result_activation >= 0 ? "pos" : "neg";
  const sharePct = Math.min(100, Math.max(0, dim.abs_share * 100));
  const topPosWords = dim.top_positive
    .slice(0, 4)
    .map((t) => t.term)
    .join(", ");
  const topNegWords = dim.top_negative
    .slice(0, 3)
    .map((t) => t.term)
    .join(", ");

  return (
    <div className={`latent-dim-row ${dim.alignment}`}>
      <div className="latent-dim-row-head">
        <span className="latent-dim-name">
          <span className="latent-dim-index">#{dim.index}</span>
          <span className="latent-dim-label">{dim.label}</span>
        </span>
        <span className="latent-dim-share" title="Share of |contribution|">
          {sharePct.toFixed(0)}%
        </span>
      </div>

      <div className="latent-activation-row">
        <span className="latent-side-label">Query</span>
        <div className="latent-bipolar-track">
          <span
            className={`latent-bipolar-fill ${qSign}`}
            style={{
              width: `${qPct}%`,
              [qSign === "pos" ? "left" : "right"]: "50%",
            } as React.CSSProperties}
          />
          <span className="latent-bipolar-axis" />
        </div>
        <span className="latent-activation-value">
          {dim.query_activation >= 0 ? "+" : ""}
          {dim.query_activation.toFixed(2)}
        </span>
      </div>
      <div className="latent-activation-row">
        <span className="latent-side-label">Result</span>
        <div className="latent-bipolar-track">
          <span
            className={`latent-bipolar-fill ${rSign}`}
            style={{
              width: `${rPct}%`,
              [rSign === "pos" ? "left" : "right"]: "50%",
            } as React.CSSProperties}
          />
          <span className="latent-bipolar-axis" />
        </div>
        <span className="latent-activation-value">
          {dim.result_activation >= 0 ? "+" : ""}
          {dim.result_activation.toFixed(2)}
        </span>
      </div>

      <div className="latent-driver-grid">
        <div className="latent-driver-col">
          <span className="latent-driver-label">
            Defines this concept (loading words)
          </span>
          <span className="latent-driver-text">
            <span className="latent-driver-pos">+ {topPosWords || "—"}</span>
            {topNegWords && (
              <span className="latent-driver-neg"> · − {topNegWords}</span>
            )}
          </span>
        </div>
        {dim.query_drivers && dim.query_drivers.length > 0 && (
          <div className="latent-driver-col">
            <span className="latent-driver-label">
              Your query activates it through
            </span>
            <span className="latent-driver-text">
              {dim.query_drivers.map((q, i) => (
                <span
                  key={`${tickerKey}-qd-${dim.index}-${i}`}
                  className={`latent-driver-chip ${(q.contribution ?? 0) >= 0 ? "pos" : "neg"}`}
                  title={`contribution ${(q.contribution ?? 0).toFixed(3)}`}
                >
                  {q.term}
                </span>
              ))}
            </span>
          </div>
        )}
        {dim.result_drivers && dim.result_drivers.length > 0 && (
          <div className="latent-driver-col">
            <span className="latent-driver-label">
              Company expresses it through
            </span>
            <span className="latent-driver-text">
              {dim.result_drivers.map((r, i) => (
                <span
                  key={`${tickerKey}-rd-${dim.index}-${i}`}
                  className={`latent-driver-chip ${(r.contribution ?? 0) >= 0 ? "pos" : "neg"}`}
                  title={`contribution ${(r.contribution ?? 0).toFixed(3)}`}
                >
                  {r.term}
                </span>
              ))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LatentDimensionPanel({
  latent,
  tickerKey,
  componentScores,
}: {
  latent: NonNullable<Stock["explanation"]>["latent"];
  tickerKey: string;
  componentScores?: Stock["component_scores"];
}): JSX.Element | null {
  if (!latent || !latent.dimensions || latent.dimensions.length === 0) {
    return null;
  }

  const positive = latent.dimensions.filter((d) => d.contribution > 0);
  const dims =
    positive.length > 0 ? positive.slice(0, 4) : latent.dimensions.slice(0, 4);

  return (
    <div className="latent-card">
      <div className="latent-header">
        <span className="expanded-label">Latent dimensions (SVD)</span>
        <span className="latent-meta">
          {latent.n_components ? `${latent.n_components} concepts` : ""}
          {typeof latent.cosine_similarity === "number"
            ? ` · embedding cos = ${latent.cosine_similarity.toFixed(3)}`
            : ""}
        </span>
      </div>

      <p className="latent-help">
        Each row is a latent concept the SVD model learned from company
        descriptions. The bars show how strongly your <em>query</em> and the{" "}
        <em>company</em> activate that concept; together they explain the
        semantic match.
      </p>

      {latent.top_concepts && latent.top_concepts.length > 0 && (
        <div className="latent-concept-chips">
          {latent.top_concepts.slice(0, 3).map((c, i) => (
            <span
              key={`${tickerKey}-concept-${i}`}
              className="latent-concept-chip"
              title="Top shared latent concept"
            >
              {c}
            </span>
          ))}
        </div>
      )}

      {componentScores &&
        (componentScores.svd !== undefined ||
          componentScores.tfidf !== undefined) && (
          <div className="latent-composition">
            <span className="latent-composition-label">
              Hybrid score = {componentScores.svd_weight ?? 0.6} × SVD (
              {(componentScores.svd ?? 0).toFixed(3)}) +{" "}
              {componentScores.tfidf_weight ?? 0.4} × TF‑IDF (
              {(componentScores.tfidf ?? 0).toFixed(3)})
            </span>
          </div>
        )}

      <div className="latent-dim-list">
        {dims.map((d) => (
          <LatentDimensionRow
            key={`${tickerKey}-dim-${d.index}`}
            dim={d}
            tickerKey={tickerKey}
          />
        ))}
      </div>
    </div>
  );
}
