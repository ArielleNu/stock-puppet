import { QueryMode } from "../types";
import { SearchMethod } from "../utils/api";

interface Option {
  value: string;
  label: string;
}

const RISK_OPTIONS: Option[] = [
  { value: "any", label: "Any" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Mid" },
  { value: "high", label: "High" },
];

const FOCUS_OPTIONS: Option[] = [
  { value: "any", label: "Any" },
  { value: "dividend", label: "Dividend" },
  { value: "growth", label: "Growth" },
];

const CAP_OPTIONS: Option[] = [
  { value: "any", label: "Any" },
  { value: "small", label: "Low" },
  { value: "mid", label: "Mid" },
  { value: "large", label: "High" },
];

function PrefGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option[];
  value: string;
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <div className="pref-group">
      <span className="pref-label">{label}</span>
      <div className="pref-options">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`pref-btn ${value === o.value ? "active" : ""}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface PreferencesPanelProps {
  riskTolerance: string;
  focus: string;
  capPreference: string;
  onRiskChange: (v: string) => void;
  onFocusChange: (v: string) => void;
  onCapChange: (v: string) => void;

  queryMode: QueryMode;

  searchMethod: SearchMethod;
  onSearchMethodChange: (v: SearchMethod) => void;

  portfolioMode: "similar" | "diversify";
  onPortfolioModeChange: (v: "similar" | "diversify") => void;

  portfolioTickers: string[];
  onPortfolioTickersChange: (tickers: string[]) => void;

  tickerInput: string;
  onTickerInputChange: (v: string) => void;
}

export default function PreferencesPanel({
  riskTolerance,
  focus,
  capPreference,
  onRiskChange,
  onFocusChange,
  onCapChange,
  queryMode,
  searchMethod,
  onSearchMethodChange,
  portfolioMode,
  onPortfolioModeChange,
  portfolioTickers,
  onPortfolioTickersChange,
  tickerInput,
  onTickerInputChange,
}: PreferencesPanelProps): JSX.Element {
  return (
    <div className="prefs-panel">
      <PrefGroup
        label="Risk Tolerance"
        options={RISK_OPTIONS}
        value={riskTolerance}
        onChange={onRiskChange}
      />
      <PrefGroup
        label="Investment Focus"
        options={FOCUS_OPTIONS}
        value={focus}
        onChange={onFocusChange}
      />
      <PrefGroup
        label="Market Cap"
        options={CAP_OPTIONS}
        value={capPreference}
        onChange={onCapChange}
      />
      {queryMode === "text" && (
        <div className="pref-group pref-group-wide">
          <span className="pref-label">Ranking Method</span>
          <div className="method-tabs in-prefs">
            <button
              type="button"
              className={`method-tab ${searchMethod === "hybrid" ? "active" : ""}`}
              onClick={() => onSearchMethodChange("hybrid")}
            >
              With SVD <span className="method-tab-sub">(hybrid)</span>
            </button>
            <button
              type="button"
              className={`method-tab ${searchMethod === "tfidf" ? "active" : ""}`}
              onClick={() => onSearchMethodChange("tfidf")}
            >
              Without SVD <span className="method-tab-sub">(TF-IDF)</span>
            </button>
            <button
              type="button"
              className={`method-tab ${searchMethod === "compare" ? "active" : ""}`}
              onClick={() => onSearchMethodChange("compare")}
            >
              Compare
            </button>
          </div>
        </div>
      )}

      {queryMode === "portfolio" && (
        <div className="pref-group pref-group-wide">
          <span className="pref-label">Portfolio Controls</span>

          <div className="portfolio-builder in-prefs">
            <div className="portfolio-mode-tabs">
              <button
                type="button"
                className={`pref-btn ${portfolioMode === "similar" ? "active" : ""}`}
                onClick={() => onPortfolioModeChange("similar")}
              >
                Find Similar
              </button>
              <button
                type="button"
                className={`pref-btn ${portfolioMode === "diversify" ? "active" : ""}`}
                onClick={() => onPortfolioModeChange("diversify")}
              >
                Diversify
              </button>
            </div>
            <div className="portfolio-current-label">Current Portfolio</div>
            {portfolioTickers.length > 0 && (
              <div className="ticker-chips">
                {portfolioTickers.map((t) => (
                  <span key={t} className="ticker-chip">
                    {t}
                    <button
                      type="button"
                      className="ticker-chip-x"
                      onClick={() =>
                        onPortfolioTickersChange(
                          portfolioTickers.filter((x) => x !== t),
                        )
                      }
                    >
                      &times;
                    </button>
                  </span>
                ))}
                <div className="ticker-clear-row">

                  <button
                    type="button"
                    className="ticker-clear-btn"
                    onClick={() => onPortfolioTickersChange([])}
                  >
                    Clear all
                  </button>
                </div>
              </div>
            )}

            <div className="ticker-input-row">
              <input
                className="ticker-add-input"
                placeholder="Add ticker (e.g. NVDA)"
                value={tickerInput}
                onChange={(e) => onTickerInputChange(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const t = tickerInput.trim().toUpperCase();
                    if (t && !portfolioTickers.includes(t)) {
                      onPortfolioTickersChange([...portfolioTickers, t]);
                    }
                    onTickerInputChange("");
                  }
                }}
              />
              <button
                type="button"
                className="ticker-add-btn"
                onClick={() => {
                  const t = tickerInput.trim().toUpperCase();
                  if (t && !portfolioTickers.includes(t)) {
                    onPortfolioTickersChange([...portfolioTickers, t]);
                  }
                  onTickerInputChange("");
                }}
              >
                Add
              </button>
            </div>


          </div>
        </div>
      )}
    </div>
  );
}




// {
//   queryMode === "portfolio" && (
//     <div className="portfolio-builder">
//       <div className="portfolio-mode-tabs">
//         <button
//           className={`pref-btn ${portfolioMode === "similar" ? "active" : ""}`}
//           onClick={() => setPortfolioMode("similar")}
//         >
//           Find Similar
//         </button>
//         <button
//           className={`pref-btn ${portfolioMode === "diversify" ? "active" : ""}`}
//           onClick={() => setPortfolioMode("diversify")}
//         >
//           Diversify
//         </button>
//       </div>

//       <div className="ticker-input-row">
//         <input
//           className="ticker-add-input"
//           placeholder="Add ticker (e.g. NVDA)"
//           value={tickerInput}
//           onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
//           onKeyDown={(e) => {
//             if (e.key === "Enter") {
//               e.preventDefault();
//               const t = tickerInput.trim().toUpperCase();
//               if (t && !portfolioTickers.includes(t)) {
//                 setPortfolioTickers([...portfolioTickers, t]);
//               }
//               setTickerInput("");
//             }
//           }}
//         />
//         <button
//           type="button"
//           className="ticker-add-btn"
//           onClick={() => {
//             const t = tickerInput.trim().toUpperCase();
//             if (t && !portfolioTickers.includes(t)) {
//               setPortfolioTickers([...portfolioTickers, t]);
//             }
//             setTickerInput("");
//           }}
//         >
//           Add
//         </button>
//       </div>

//       {portfolioTickers.length > 0 && (
//         <div className="ticker-chips">
//           {portfolioTickers.map((t) => (
//             <span key={t} className="ticker-chip">
//               {t}
//               <button
//                 className="ticker-chip-x"
//                 onClick={() =>
//                   setPortfolioTickers(
//                     portfolioTickers.filter((x) => x !== t),
//                   )
//                 }
//               >
//                 &times;
//               </button>
//             </span>
//           ))}
//           <button
//             className="ticker-clear-btn"
//             onClick={() => setPortfolioTickers([])}
//           >
//             Clear all
//           </button>
//         </div>
//       )}
//     </div>
//   )
// } */}

// {
//   queryMode === "text" && (
//     <div className="method-tabs" title="Choose how rankings are computed">
//       <span className="method-tabs-label">Ranking</span>
//       <button
//         type="button"
//         className={`method-tab ${searchMethod === "hybrid" ? "active" : ""}`}
//         onClick={() => setSearchMethod("hybrid")}
//       >
//         With SVD <span className="method-tab-sub">(hybrid)</span>
//       </button>
//       <button
//         type="button"
//         className={`method-tab ${searchMethod === "tfidf" ? "active" : ""}`}
//         onClick={() => setSearchMethod("tfidf")}
//       >
//         Without SVD <span className="method-tab-sub">(TF‑IDF)</span>
//       </button>
//       <button
//         type="button"
//         className={`method-tab ${searchMethod === "compare" ? "active" : ""}`}
//         onClick={() => setSearchMethod("compare")}
//       >
//         Compare
//       </button>
//     </div>
//   )
// }