import { useEffect, useRef, useState } from "react";
import { api, type MasterCv } from "../api";

type ImportStage = "idle" | "selected" | "importing" | "done" | "error";

function formatBytes(bytes: number | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  open: boolean;
  initialFile?: File | null;
  onClose: () => void;
  onImported: (cv: MasterCv) => void;
}

export function PdfImportModal({ open, initialFile, onClose, onImported }: Props) {
  const [stage, setStage] = useState<ImportStage>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (open && initialFile) {
      setFile(initialFile);
      setStage("selected");
      setError(null);
    }
  }, [open, initialFile]);

  useEffect(() => {
    if (!open) {
      setStage("idle");
      setFile(null);
      setError(null);
      setElapsed(0);
      setDragOver(false);
    }
  }, [open]);

  useEffect(() => {
    if (stage === "importing") {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [stage]);

  function handleFile(f: File) {
    if (f.type !== "application/pdf") {
      setError("Only PDF files are accepted.");
      setStage("error");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("File is too large. Maximum size is 10 MB.");
      setStage("error");
      return;
    }
    setFile(f);
    setStage("selected");
    setError(null);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  async function startImport() {
    if (!file) return;
    setStage("importing");
    setError(null);
    try {
      const cv = await api.importPdf(file);
      setStage("done");
      setTimeout(() => {
        onImported(cv);
        onClose();
      }, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse PDF.");
      setStage("error");
    }
  }

  if (!open) return null;

  return (
    <div className="modal-scrim" onClick={stage !== "importing" ? onClose : undefined}>
      <div className="modal pdf-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>Import CV from PDF</h3>
            <p className="muted small" style={{ margin: "0.15rem 0 0" }}>
              Claude will extract your data automatically.
            </p>
          </div>
          {stage !== "importing" && (
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              ×
            </button>
          )}
        </div>

        {(stage === "idle" || stage === "error") && (
          <>
            <div
              className={`drop-zone${dragOver ? " drag-over" : ""}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
            >
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M8 10l4-4 4 4M12 6v10"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <p style={{ margin: 0, fontWeight: 500 }}>Drag &amp; drop your CV here</p>
              <p className="muted small" style={{ margin: 0 }}>
                or click to browse
              </p>
              <span style={{ fontSize: "0.74rem", color: "var(--muted)" }}>
                PDF only · up to 10 MB
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            {error && <div className="form-error">{error}</div>}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}

        {stage === "selected" && file && (
          <>
            <div className="file-card">
              <div className="file-card-icon">
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path
                    d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <polyline
                    points="14,2 14,8 20,8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="file-card-info">
                <div className="file-card-name">{file.name}</div>
                <div className="file-card-size">{formatBytes(file.size)}</div>
              </div>
              <button
                className="icon-btn"
                onClick={() => {
                  setFile(null);
                  setStage("idle");
                }}
                aria-label="Remove file"
              >
                ×
              </button>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={startImport}>
                Import CV
              </button>
            </div>
          </>
        )}

        {stage === "importing" && (
          <div className="import-progress">
            <svg className="spinner-svg" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="var(--line)" strokeWidth="2.5" />
              <path
                d="M12 3a9 9 0 019 9"
                stroke="var(--thread)"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
            <p style={{ margin: 0, fontWeight: 500 }}>Claude is reading your CV…</p>
            <p className="muted small" style={{ margin: 0 }}>
              Extracting name, experience, skills and more
            </p>
            <span className="import-elapsed">{elapsed}s</span>
          </div>
        )}

        {stage === "done" && (
          <div className="import-progress">
            <div className="done-mark">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path
                  d="M5 13l4 4L19 7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p style={{ margin: 0, fontWeight: 500 }}>CV imported!</p>
            <p className="muted small" style={{ margin: 0 }}>
              Review and save in the editor
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
