import type { CoverageItem, CoverageStatus } from "../types";

const STATUS_LABEL: Record<CoverageStatus, string> = {
  strong: "Strong",
  partial: "Partial",
  missing: "Gap",
};

interface Props {
  coverage: CoverageItem[];
}

export function Coverage({ coverage }: Props) {
  if (!coverage.length) return null;
  const counts = coverage.reduce(
    (acc, c) => ((acc[c.status] = (acc[c.status] ?? 0) + 1), acc),
    {} as Record<CoverageStatus, number>,
  );

  return (
    <section className="coverage">
      <div className="coverage-head">
        <h3>Requirement coverage</h3>
        <div className="coverage-tally">
          <span className="tally strong">{counts.strong ?? 0} strong</span>
          <span className="tally partial">{counts.partial ?? 0} partial</span>
          <span className="tally missing">{counts.missing ?? 0} gaps</span>
        </div>
      </div>
      <ul className="thread">
        {coverage.map((c, i) => (
          <li key={i} className={`thread-item ${c.status}`}>
            <span className="thread-node" aria-hidden="true" />
            <div className="thread-body">
              <div className="thread-top">
                <span className="thread-req">{c.requirement}</span>
                <span className={`thread-badge ${c.status}`}>{STATUS_LABEL[c.status]}</span>
              </div>
              {c.evidence && <p className="thread-evidence">{c.evidence}</p>}
              {!c.evidence && c.status === "missing" && (
                <p className="thread-evidence muted">Nothing in your CV backs this yet.</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
