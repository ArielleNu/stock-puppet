interface Option {
  value: string;
  label: string;
}

const RISK_OPTIONS: Option[] = [
  { value: "any", label: "Any" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const FOCUS_OPTIONS: Option[] = [
  { value: "any", label: "Any" },
  { value: "dividend", label: "Dividend" },
  { value: "growth", label: "Growth" },
];

const CAP_OPTIONS: Option[] = [
  { value: "any", label: "Any" },
  { value: "large", label: "Large" },
  { value: "mid", label: "Mid" },
  { value: "small", label: "Small" },
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
}

export default function PreferencesPanel({
  riskTolerance,
  focus,
  capPreference,
  onRiskChange,
  onFocusChange,
  onCapChange,
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
    </div>
  );
}
