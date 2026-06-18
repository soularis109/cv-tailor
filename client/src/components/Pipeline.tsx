import { useMemo, useState } from "react";
import { api } from "../api";
import { STATUSES, type Application, type Status } from "../types";
import { PipelineStats } from "./PipelineStats";
import { daysSince, needsFollowUp } from "../utils/dates";

interface Props {
  applications: Application[];
  onPatch: (id: string, patch: Partial<Application>) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
  loadError: string | null;
  loading: boolean;
}

function statusClass(status: Status): string {
  switch (status) {
    case "Offer": return "st-offer";
    case "Interview":
    case "Take-home": return "st-interview";
    case "Screening":
    case "Applied": return "st-active";
    case "Rejected":
    case "Withdrawn": return "st-closed";
    default: return "st-draft";
  }
}

export function Pipeline({ applications, onPatch, onDelete, onOpen, loadError, loading }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "All">("All");
  const [sortKey, setSortKey] = useState<"dateAdded" | "fitScore" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const visibleApplications = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = applications.filter((a) => {
      const matchesSearch =
        !q || a.company.toLowerCase().includes(q) || a.role.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "All" || a.status === statusFilter;
      return matchesSearch && matchesStatus;
    });

    if (!sortKey) return filtered;

    return [...filtered].sort((a, b) => {
      const comparison =
        sortKey === "dateAdded"
          ? a.dateAdded.localeCompare(b.dateAdded)
          : a.fitScore - b.fitScore;
      return sortDir === "asc" ? comparison : -comparison;
    });
  }, [applications, search, sortDir, sortKey, statusFilter]);

  if (loading) {
    return (
      <div className="pipeline-loading">
        <div className="pipeline-skeleton" />
        <div className="pipeline-skeleton" />
        <div className="pipeline-skeleton" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="empty">
        <p className="muted">Could not load your pipeline.</p>
        <p className="small" style={{ color: "var(--gap)" }}>{loadError}</p>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: "0.75rem" }} onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  if (!applications.length) {
    return (
      <div className="empty">
        <p>No applications yet.</p>
        <p className="muted">
          Tailor your CV for a posting and it lands here, ready to track.
        </p>
      </div>
    );
  }

  const blurPatch =
    (id: string, field: keyof Application, current: string) =>
    (e: React.FocusEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (value !== current) onPatch(id, { [field]: value } as Partial<Application>);
    };

  return (
    <div className="pipeline">
      <PipelineStats applications={applications} />
      <div className="pipeline-head">
        <span className="pipeline-count">
          {visibleApplications.length} application{visibleApplications.length === 1 ? "" : "s"}
        </span>
        <a className="btn btn-ghost" href={api.xlsxUrl} download>
          Open Excel
        </a>
      </div>

      <div className="pipeline-toolbar">
        <input
          className="pipeline-search"
          placeholder="Search company or role…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="pipeline-filter-status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as Status | "All")}
        >
          <option value="All">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          className={`sort-btn ${sortKey === "dateAdded" ? "active" : ""}`}
          onClick={() => {
            if (sortKey === "dateAdded") setSortDir((d) => (d === "asc" ? "desc" : "asc"));
            else {
              setSortKey("dateAdded");
              setSortDir("desc");
            }
          }}
        >
          Date {sortKey === "dateAdded" ? (sortDir === "desc" ? "↓" : "↑") : "↕"}
        </button>
        <button
          className={`sort-btn ${sortKey === "fitScore" ? "active" : ""}`}
          onClick={() => {
            if (sortKey === "fitScore") setSortDir((d) => (d === "asc" ? "desc" : "asc"));
            else {
              setSortKey("fitScore");
              setSortDir("desc");
            }
          }}
        >
          Fit {sortKey === "fitScore" ? (sortDir === "desc" ? "↓" : "↑") : "↕"}
        </button>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Company</th>
              <th>Role</th>
              <th>Level</th>
              <th>Fit</th>
              <th>Status</th>
              <th>Salary</th>
              <th>Link</th>
              <th>Notes</th>
              <th aria-label="actions" />
            </tr>
          </thead>
          <tbody>
            {visibleApplications.map((a) => (
              <tr
                key={a.id}
                className="table-row-clickable"
                onClick={() => onOpen(a.id)}
              >
                <td className="mono nowrap">{a.dateAdded}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <input
                    className="cell-input"
                    defaultValue={a.company}
                    onBlur={blurPatch(a.id, "company", a.company)}
                  />
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <input
                    className="cell-input role-cell-input"
                    defaultValue={a.role}
                    onBlur={blurPatch(a.id, "role", a.role)}
                  />
                </td>
                <td className="mono">{a.seniority}</td>
                <td className="mono fit">
                  {a.fitScore}
                  {(a.redFlagsCount ?? 0) > 0 && (
                    <span
                      className="risk-badge"
                      title={`${a.redFlagsCount} red flag${a.redFlagsCount === 1 ? "" : "s"} — check Interview Prep tab`}
                    >
                      ⚠ {a.redFlagsCount}
                    </span>
                  )}
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <select
                    className={`status-select ${statusClass(a.status)}`}
                    value={a.status}
                    onChange={(e) => onPatch(a.id, { status: e.target.value as Status })}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  {needsFollowUp(a) && (
                    <span
                      className="followup-badge"
                      title={`Applied ${daysSince(a.dateAdded)} days ago — consider sending a follow-up`}
                    >
                      ⏱ {daysSince(a.dateAdded)}d
                    </span>
                  )}
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <input
                    className="cell-input narrow"
                    defaultValue={a.salary}
                    placeholder="—"
                    onBlur={blurPatch(a.id, "salary", a.salary)}
                  />
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  {a.jobUrl ? (
                    <a href={a.jobUrl} target="_blank" rel="noreferrer" className="cell-link">
                      open
                    </a>
                  ) : (
                    <input
                      className="cell-input narrow"
                      placeholder="url"
                      defaultValue=""
                      onBlur={blurPatch(a.id, "jobUrl", "")}
                    />
                  )}
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <input
                    className="cell-input wide"
                    defaultValue={a.notes}
                    placeholder="—"
                    onBlur={blurPatch(a.id, "notes", a.notes)}
                  />
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <button
                    className="row-del"
                    onClick={() => onDelete(a.id)}
                    aria-label="Remove application"
                    title="Remove"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
