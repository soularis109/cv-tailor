import { useEffect, useState } from "react";
import { api, type MasterCv } from "../api";
import { PdfImportModal } from "./PdfImportModal";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (cv: MasterCv) => void;
}

const EMPTY_TEMPLATE = {
  name: "",
  title: "",
  location: "",
  email: "",
  phone: "",
  links: { github: "", linkedin: "" },
  summary: "",
  skills: {},
  experience: [],
  projects: [],
  education: [],
  certifications: [],
};

export function MasterCvDrawer({ open, onClose, onSaved }: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    api
      .getMasterCv()
      .then((cv) => setText(JSON.stringify(cv, null, 2)))
      .catch((e: Error) => {
        const msg = e?.message ?? "";
        if (msg.includes("404") || msg.includes("ENOENT") || msg.includes("not found")) {
          setText(JSON.stringify(EMPTY_TEMPLATE, null, 2));
        } else {
          setError(`Could not load master CV: ${msg}`);
        }
      })
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

  function handleDrawerDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const f = e.dataTransfer.files[0];
    if (f?.type === "application/pdf") {
      setDroppedFile(f);
      setPdfModalOpen(true);
    }
  }

  return (
    <>
      <div className="drawer-scrim" onClick={onClose}>
        <aside
          className="drawer"
          onClick={(e) => e.stopPropagation()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrawerDrop}
        >
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
          <div className="drawer-toolbar">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setDroppedFile(null);
                setPdfModalOpen(true);
              }}
              disabled={loading}
            >
              Import from PDF
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
      <PdfImportModal
        open={pdfModalOpen}
        initialFile={droppedFile}
        onClose={() => {
          setPdfModalOpen(false);
          setDroppedFile(null);
        }}
        onImported={(cv) => {
          setText(JSON.stringify(cv, null, 2));
          setPdfModalOpen(false);
          setDroppedFile(null);
        }}
      />
    </>
  );
}
