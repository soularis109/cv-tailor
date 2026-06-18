import type { Application } from "../types";
import { needsFollowUp } from "../utils/dates";

interface Props {
  applications: Application[];
}

export function PipelineStats({ applications }: Props) {
  const total = applications.length;
  const inProgress = applications.filter((a) => ["Applied", "Screening"].includes(a.status)).length;
  const interviewing = applications.filter((a) => ["Interview", "Take-home"].includes(a.status)).length;
  const offers = applications.filter((a) => a.status === "Offer").length;
  const avgFit =
    total > 0 ? Math.round(applications.reduce((sum, a) => sum + a.fitScore, 0) / total) : 0;

  const followUpCount = applications.filter(needsFollowUp).length;
  const responded = applications.filter((a) =>
    ["Screening", "Interview", "Take-home", "Offer", "Rejected"].includes(a.status)
  ).length;
  const appliedTotal = applications.filter((a) =>
    ["Applied", "Screening", "Interview", "Take-home", "Offer", "Rejected"].includes(a.status)
  ).length;
  const responseRate = appliedTotal >= 3 ? Math.round((responded / appliedTotal) * 100) : null;

  return (
    <div className="pipeline-stats">
      <div className="stat-chip">
        <span className="stat-label">Total</span>
        <span className="stat-value">{total}</span>
      </div>
      <div className="stat-chip">
        <span className="stat-label">Applied</span>
        <span className="stat-value">{inProgress}</span>
      </div>
      <div className="stat-chip">
        <span className="stat-label">Interview</span>
        <span className="stat-value">{interviewing}</span>
      </div>
      <div className="stat-chip">
        <span className="stat-label">Offers</span>
        <span className="stat-value offers">{offers}</span>
      </div>
      <div className="stat-chip">
        <span className="stat-label">Avg Fit</span>
        <span className="stat-value">{avgFit}%</span>
      </div>
      {followUpCount > 0 && (
        <div className="stat-chip">
          <span className="stat-label" style={{ color: "#d97706" }}>Follow-up</span>
          <span className="stat-value" style={{ color: "#d97706" }}>{followUpCount}</span>
        </div>
      )}
      {responseRate !== null && (
        <div className="stat-chip">
          <span className="stat-label">Response rate</span>
          <span className="stat-value">{responseRate}%</span>
        </div>
      )}
    </div>
  );
}
