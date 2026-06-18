import { useEffect, useState } from "react";
import { api, type MasterCv } from "../api";
import { PdfImportModal } from "./PdfImportModal";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (cv: MasterCv) => void;
  profile?: string;
  onProfilesChange?: (profiles: string[]) => void;
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

export function MasterCvDrawer({ open, onClose, onSaved, profile = "default", onProfilesChange }: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [showRawEditor, setShowRawEditor] = useState(false);

  useEffect(() => {
    if (!open) {
      setShowRawEditor(false);
      return;
    }
    setLoading(true);
    setError(null);
    api
      .getMasterCv(profile)
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
  }, [open, profile]);

  if (!open) return null;

  const isFirstRun =
    !loading &&
    (() => {
      try {
        const parsed = JSON.parse(text);
        return !parsed.name || parsed.name === "";
      } catch {
        return true;
      }
    })();

  function handleClose() {
    setShowRawEditor(false);
    onClose();
  }

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
      await api.putMasterCv(parsed, profile);
      onSaved(parsed);
      handleClose();
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
      <div className="drawer-scrim" onClick={handleClose}>
        <aside
          className="drawer"
          onClick={(e) => e.stopPropagation()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrawerDrop}
        >
          <div className="drawer-head">
            <div>
              <h3>Master CV {profile !== "default" && <span className="pill ghost">{profile}</span>}</h3>
              <p className="muted small">
                Your full, truthful record. The agent only ever uses what is in here — nothing
                is invented. Keep more detail than fits one page.
              </p>
            </div>
            <button className="icon-btn" onClick={handleClose} aria-label="Close">
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
            <div className="drawer-profile-actions">
              <button
                className="btn btn-ghost btn-sm"
                onClick={async () => {
                  const name = window.prompt("Profile name (letters, numbers, dash, underscore):");
                  if (!name?.trim()) return;
                  try {
                    const cv = text ? (JSON.parse(text) as MasterCv) : ({} as MasterCv);
                    const res = await api.createCvProfile(name.trim(), cv);
                    const profiles = await api.getCvProfiles();
                    onProfilesChange?.(profiles);
                    window.alert(`Profile "${res.name}" created. Select it from the header dropdown.`);
                  } catch {
                    window.alert("Could not create profile.");
                  }
                }}
              >
                + New Profile
              </button>
              <button
                className="btn btn-ghost btn-sm"
                disabled={profile === "default"}
                title={profile === "default" ? "Cannot delete default profile" : undefined}
                onClick={async () => {
                  if (!window.confirm(`Delete profile "${profile}"?`)) return;
                  try {
                    await api.deleteCvProfile(profile);
                    const profiles = await api.getCvProfiles();
                    onProfilesChange?.(profiles);
                    handleClose();
                  } catch {
                    window.alert("Could not delete profile.");
                  }
                }}
              >
                Delete Profile
              </button>
            </div>
          </div>
          {loading ? (
            <div className="drawer-loading">Loading…</div>
          ) : isFirstRun && !showRawEditor ? (
            <div className="drawer-onboarding">
              <div className="onboarding-icon" aria-hidden="true" />
              <div>
                <h3 style={{ marginBottom: "0.35rem" }}>Import your CV to get started</h3>
                <p className="muted small">
                  Upload your existing PDF and we'll extract all sections automatically.
                </p>
              </div>
              <button
                className="btn btn-primary btn-block"
                onClick={() => {
                  setDroppedFile(null);
                  setPdfModalOpen(true);
                }}
              >
                Import from PDF
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowRawEditor(true)}>
                Edit JSON manually instead
              </button>
            </div>
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
            <button className="btn btn-ghost" onClick={handleClose}>
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
