import { Stock } from "../types";
import { clamp01 } from "../utils/format";

export default function ScoreBreakdown({
  explanation,
  ticker,
}: {
  explanation: NonNullable<Stock["explanation"]>;
  ticker: string;
}): JSX.Element | null {
  if (!explanation.score_breakdown) return null;

  const textScore = explanation.score_breakdown?.text_similarity ?? 0;
  const sentimentImpact = explanation.score_breakdown?.sentiment_impact ?? 0;
  const finalScore = explanation.score_breakdown?.final_score ?? 0;
  const maxVal = Math.max(
    0.01,
    textScore,
    finalScore,
    Math.abs(sentimentImpact),
  );
  const textWidth = clamp01(textScore / maxVal) * 100;
  const sentimentWidth = clamp01(Math.abs(sentimentImpact) / maxVal) * 100;
  const finalWidth = clamp01(finalScore / maxVal) * 100;
  const matchedTerms = explanation.matched_terms?.slice(0, 4) ?? [];
  const relatedDetails = explanation.semantic_match_details?.slice(0, 4) ?? [];
  const queryTerms = explanation.query_terms ?? [];
  const matchedQueryCount = queryTerms.filter((qt) =>
    matchedTerms.some((mt) => mt.term === qt),
  ).length;

  return (
    <div className="score-breakdown-card">
      <span className="expanded-label">Score Breakdown</span>
      <div className="score-breakdown-bars">
        <div className="score-breakdown-row">
          <span className="score-breakdown-name">Text similarity</span>
          <div className="score-breakdown-track">
            <span
              className="score-breakdown-fill text"
              style={{ width: `${textWidth}%` }}
            />
          </div>
          <span className="score-breakdown-value">{textScore.toFixed(3)}</span>
        </div>
        <div className="score-breakdown-row">
          <span className="score-breakdown-name">Sentiment adj.</span>
          <div className="score-breakdown-track">
            <span
              className={`score-breakdown-fill ${
                sentimentImpact >= 0 ? "positive" : "negative"
              }`}
              style={{ width: `${sentimentWidth}%` }}
            />
          </div>
          <span className="score-breakdown-value">
            {sentimentImpact >= 0 ? "+" : ""}
            {sentimentImpact.toFixed(3)}
          </span>
        </div>
        <div className="score-breakdown-row">
          <span className="score-breakdown-name">Final score</span>
          <div className="score-breakdown-track">
            <span
              className="score-breakdown-fill final"
              style={{ width: `${finalWidth}%` }}
            />
          </div>
          <span className="score-breakdown-value">{finalScore.toFixed(3)}</span>
        </div>

        {matchedTerms.length > 0 && (
          <div className="text-contrib-block">
            <span className="score-breakdown-subtitle">
              Text similarity contributors
            </span>
            {queryTerms.length > 0 && (
              <span className="score-breakdown-coverage">
                Query coverage: {matchedQueryCount}/{queryTerms.length} terms
              </span>
            )}
            {matchedTerms.map((termObj) => {
              const sharePct = clamp01(termObj.share ?? 0) * 100;
              return (
                <div
                  className="score-breakdown-row term"
                  key={`${ticker}-text-contrib-${termObj.term}`}
                >
                  <span className="score-breakdown-name term-name">
                    {termObj.term}
                  </span>
                  <div className="score-breakdown-track">
                    <span
                      className="score-breakdown-fill term"
                      style={{ width: `${sharePct}%` }}
                    />
                  </div>
                  <span className="score-breakdown-value">
                    {sharePct.toFixed(0)}%
                  </span>
                </div>
              );
            })}
            {relatedDetails.length > 0 && (
              <>
                <span className="score-breakdown-subtitle">
                  Related concept strength
                </span>
                {relatedDetails.map((termObj) => {
                  const sharePct = clamp01(termObj.share) * 100;
                  return (
                    <div
                      className="score-breakdown-row term"
                      key={`${ticker}-related-contrib-${termObj.term}`}
                    >
                      <span className="score-breakdown-name term-name">
                        {termObj.term}
                      </span>
                      <div className="score-breakdown-track">
                        <span
                          className="score-breakdown-fill related"
                          style={{ width: `${sharePct}%` }}
                        />
                      </div>
                      <span className="score-breakdown-value">
                        {sharePct.toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
