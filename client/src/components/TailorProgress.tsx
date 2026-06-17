interface Props {
  stage: "analyzing" | "tailoring";
  progress: number;
  elapsed: number;
}

const STAGES = [
  { key: "analyzing", label: "Reading job" },
  { key: "tailoring", label: "Tailoring CV" },
  { key: "done",      label: "Done" },
] as const;

export function TailorProgress({ stage, progress, elapsed }: Props) {
  const activeIdx = stage === "analyzing" ? 0 : 1;

  return (
    <div className="tailor-progress">
      <div className="progress-bar-wrap">
        <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="stage-crumbs">
        {STAGES.map((s, i) => {
          const done = i < activeIdx;
          const active = i === activeIdx;
          return (
            <span key={s.key} className={`crumb${active ? " crumb-active" : done ? " crumb-done" : ""}`}>
              <span className="crumb-dot">{done ? "✓" : "●"}</span>
              {s.label}
            </span>
          );
        })}
        <span className="elapsed">{elapsed}s</span>
      </div>
    </div>
  );
}
