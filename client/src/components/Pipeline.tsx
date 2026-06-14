import { api } from "../api";
import { STATUSES, type Application, type Status } from "../types";

interface Props {
  applications: Application[];
  onPatch: (id: string, patch: Partial<Application>) => void;
  onDelete: (id: string) => void;
}

function statusClass(status: Status): string {
  switch (status) {
    case "Offer":
      return "st-offer";
    case "Interview":
    case "Take-home":
      return "st-interview";
    case "Screening":
    case "Applied":
      return "st-active";
    case "Rejected":
    case "Withdrawn":
      return "st-closed";
    default:
      return "st-draft";
  }
}

export function Pipeline({ applications, onPatch, onDelete }: Props) {
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
              <tr key={a.id}>
                <td className="mono nowrap">{a.dateAdded}</td>
                <td>
                  <input
                    className="cell-input"
                    defaultValue={a.company}
                    onBlur={blurPatch(a.id, "company", a.company)}
                  />
                </td>
                <td className="role-cell">{a.role}</td>
                <td className="mono">{a.seniority}</td>
                <td className="mono fit">{a.fitScore}</td>
                <td>
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
                <td>
                  <input
                    className="cell-input narrow"
                    defaultValue={a.salary}
                    placeholder="—"
                    onBlur={blurPatch(a.id, "salary", a.salary)}
                  />
                </td>
                <td>
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
                <td>
                  <input
                    className="cell-input wide"
                    defaultValue={a.notes}
                    placeholder="—"
                    onBlur={blurPatch(a.id, "notes", a.notes)}
                  />
                </td>
                <td>
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
