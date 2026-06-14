import { useEffect, useState } from "react";
import { api, type MasterCv } from "../api";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (cv: MasterCv) => void;
}

export function MasterCvDrawer({ open, onClose, onSaved }: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    api
      .getMasterCv()
      .then((cv) => setText(JSON.stringify(cv, null, 2)))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  async function save() {
    let parsed: MasterCv;
    try {
      parsed = JSON.parse(text);
    } catch {
      setError("That is not valid JSON. Fix the highlighted area and try again.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.putMasterCv(parsed);
      onSaved(parsed);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <h3>Master CV</h3>
            <p className="muted small">
              Your full, truthful record. The agent only ever uses what is in here — nothing
              is invented. Keep more detail than fits one page.
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {loading ? (
          <div className="drawer-loading">Loading…</div>
        ) : (
          <textarea
            className="cv-editor mono"
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        )}
        {error && <div className="form-error">{error}</div>}
        <div className="drawer-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving || loading}>
            {saving ? "Saving…" : "Save master CV"}
          </button>
        </div>
      </aside>
    </div>
  );
}
