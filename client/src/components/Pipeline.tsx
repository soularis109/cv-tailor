import { api } from "../api";
import { STATUSES, type Application, type Status } from "../types";

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
      <div className="pipeline-head">
        <span className="pipeline-count">
          {applications.length} application{applications.length === 1 ? "" : "s"}
        </span>
        <a className="btn btn-ghost" href={api.xlsxUrl} download>
          Open Excel
        </a>
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
            {applications.map((a) => (
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
                <td className="mono fit">{a.fitScore}</td>
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
