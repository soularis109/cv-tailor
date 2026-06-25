import { useEffect, useState } from "react";
import { api } from "../api";
import { STATUSES, type Application, type Status } from "../types";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (app: Application) => void;
}

interface FormData {
  company: string;
  role: string;
  status: Status;
  source: string;
  jobUrl: string;
  salary: string;
  notes: string;
}

const INITIAL_FORM: FormData = {
  company: "",
  role: "",
  status: "Applied",
  source: "",
  jobUrl: "",
  salary: "",
  notes: "",
};

export function AddApplicationModal({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(INITIAL_FORM);
      setError(null);
    }
  }, [open]);

  function set(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit() {
    const company = form.company.trim();
    const role = form.role.trim();
    if (!company || !role) {
      setError("Company and role are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const app = await api.createApplication({
        company,
        role,
        status: form.status,
        source: form.source.trim(),
        jobUrl: form.jobUrl.trim(),
        salary: form.salary.trim(),
        notes: form.notes.trim(),
      });
      onCreated(app);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save application.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="modal-scrim" onClick={!saving ? onClose : undefined}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>Add application</h3>
            <p className="muted small" style={{ margin: "0.15rem 0 0" }}>
              Track a job you applied to without tailoring your CV.
            </p>
          </div>
          {!saving && (
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              ×
            </button>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", padding: "0 0 0.25rem" }}>
          <div className="form-field">
            <label className="form-label">
              Company <span style={{ color: "var(--gap)" }}>*</span>
            </label>
            <input
              className="text-input"
              placeholder="e.g. Acme Corp"
              value={form.company}
              onChange={(e) => set("company", e.target.value)}
              autoFocus
            />
          </div>

          <div className="form-field">
            <label className="form-label">
              Role <span style={{ color: "var(--gap)" }}>*</span>
            </label>
            <input
              className="text-input"
              placeholder="e.g. Senior Frontend Engineer"
              value={form.role}
              onChange={(e) => set("role", e.target.value)}
            />
          </div>

          <div className="form-field">
            <label className="form-label">Status</label>
            <select
              className="text-input"
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label className="form-label">Source</label>
            <input
              className="text-input"
              placeholder="e.g. LinkedIn, referral, Blind"
              value={form.source}
              onChange={(e) => set("source", e.target.value)}
            />
          </div>

          <div className="form-field">
            <label className="form-label">Job URL</label>
            <input
              className="text-input"
              placeholder="https://…"
              value={form.jobUrl}
              onChange={(e) => set("jobUrl", e.target.value)}
            />
          </div>

          <div className="form-field">
            <label className="form-label">Salary</label>
            <input
              className="text-input"
              placeholder="e.g. $120k, €5k/mo"
              value={form.salary}
              onChange={(e) => set("salary", e.target.value)}
            />
          </div>

          <div className="form-field">
            <label className="form-label">Notes</label>
            <textarea
              className="ci-textarea"
              placeholder="Any notes about this application…"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={3}
            />
          </div>

          {error && <div className="form-error">{error}</div>}
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : "Add application"}
          </button>
        </div>
      </div>
    </div>
  );
}
