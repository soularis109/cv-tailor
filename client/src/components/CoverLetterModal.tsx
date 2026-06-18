import { useState } from "react";
import { api } from "../api";

interface Props {
  applicationId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function CoverLetterModal({ applicationId, isOpen, onClose }: Props) {
  const [letter, setLetter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.generateCoverLetter(applicationId);
      setLetter(res.letter);
    } catch {
      setError("Generation failed — try again");
    } finally {
      setLoading(false);
    }
  }

  function downloadTxt() {
    const blob = new Blob([letter], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cover-letter.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Cover Letter</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {!letter && !loading && (
            <button className="btn btn-primary" onClick={generate}>
              Generate with AI
            </button>
          )}
          {loading && <p className="hint">Generating… (15-20 sec)</p>}
          {error && <p className="error">{error}</p>}
          {letter && (
            <>
              <textarea
                className="email-textarea"
                value={letter}
                onChange={(e) => setLetter(e.target.value)}
                rows={15}
              />
              <div className="modal-footer">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => navigator.clipboard.writeText(letter)}
                >
                  Copy
                </button>
                <button className="btn btn-ghost btn-sm" onClick={downloadTxt}>
                  Download .txt
                </button>
                <button className="btn btn-ghost btn-sm" onClick={generate} disabled={loading}>
                  Regenerate
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
