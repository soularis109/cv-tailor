interface Props {
  score: number;
}

function band(score: number): { label: string; varName: string } {
  if (score >= 75) return { label: "Strong match", varName: "--thread" };
  if (score >= 50) return { label: "Worth a shot", varName: "--partial" };
  return { label: "Long shot", varName: "--gap" };
}

export function FitGauge({ score }: Props) {
  const clamped = Math.max(0, Math.min(100, score));
  const { label, varName } = band(clamped);
  const radius = 52;
  const circumference = Math.PI * radius; // semicircle
  const dash = (clamped / 100) * circumference;

  return (
    <div className="gauge">
      <svg viewBox="0 0 130 78" width="130" height="78" aria-hidden="true">
        <path
          d="M 13 70 A 52 52 0 0 1 117 70"
          fill="none"
          stroke="var(--line)"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <path
          d="M 13 70 A 52 52 0 0 1 117 70"
          fill="none"
          stroke={`var(${varName})`}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          className="gauge-arc"
        />
      </svg>
      <div className="gauge-readout">
        <span className="gauge-score" style={{ color: `var(${varName})` }}>
          {clamped}
        </span>
        <span className="gauge-label">{label}</span>
      </div>
    </div>
  );
}
