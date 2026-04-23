export function BrandChartIcon(): JSX.Element {
  return (
    <svg
      className="brand-chart-icon"
      width="20"
      height="16"
      viewBox="0 0 20 16"
      fill="none"
    >
      <polyline
        points="1,14 5,9 9,11 13,4 17,7 19,2"
        stroke="#2962ff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HeroMarionette(): JSX.Element {
  return (
    <svg
      className="logo-marionette"
      width="120"
      height="150"
      viewBox="0 0 120 150"
      fill="none"
    >
      {/* control bar */}
      <line x1="30" y1="6" x2="90" y2="26" stroke="#d1d4dc" strokeWidth="4" strokeLinecap="round" />
      <line x1="90" y1="6" x2="30" y2="26" stroke="#d1d4dc" strokeWidth="4" strokeLinecap="round" />
      {/* strings */}
      <line x1="35" y1="9" x2="48" y2="68" stroke="#2962ff" strokeWidth="1.2" opacity="0.55" />
      <line x1="85" y1="9" x2="72" y2="68" stroke="#2962ff" strokeWidth="1.2" opacity="0.55" />
      <line x1="60" y1="16" x2="60" y2="46" stroke="#2962ff" strokeWidth="1.2" opacity="0.55" />
      <line x1="38" y1="23" x2="40" y2="108" stroke="#2962ff" strokeWidth="1.2" opacity="0.55" />
      <line x1="82" y1="23" x2="80" y2="108" stroke="#2962ff" strokeWidth="1.2" opacity="0.55" />
      {/* body */}
      <circle cx="60" cy="52" r="12" fill="#d1d4dc" />
      <ellipse cx="60" cy="82" rx="14" ry="18" fill="#d1d4dc" />
      <path d="M46 74 Q34 62 30 68 Q26 74 38 78" fill="#d1d4dc" />
      <circle cx="30" cy="68" r="4" fill="#d1d4dc" />
      <path d="M74 74 Q86 68 90 74 Q94 80 82 80" fill="#d1d4dc" />
      <circle cx="90" cy="74" r="4" fill="#d1d4dc" />
      <path d="M52 97 L42 126 Q40 130 44 130 L50 130 Q54 130 52 126 Z" fill="#d1d4dc" />
      <path d="M68 97 L78 126 Q80 130 76 130 L70 130 Q66 130 68 126 Z" fill="#d1d4dc" />
      {/* chart on torso */}
      <polyline
        points="48,88 52,82 56,85 60,76 64,80 68,74 72,78"
        stroke="#2962ff"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="68" cy="74" r="2.5" fill="#2962ff" />
    </svg>
  );
}
