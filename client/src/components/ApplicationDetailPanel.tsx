import { useEffect, useState } from "react";
import { api } from "../api";
import type { Application, ApplicationData, AtsCheckResult, CoverageItem, TailoredCv } from "../types";
import { STATUSES, type Status } from "../types";
import { FitGauge } from "./FitGauge";
import { Coverage } from "./Coverage";
import { CvPreview } from "./CvPreview";
import { CvEditor } from "./CvEditor";
import { MockInterview } from "./MockInterview";
import { showToast } from "../utils/toast";
import { daysSince } from "../utils/dates";

interface Props {
  application: Application | null;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<Application>) => void;
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

function PrepChecklist({ data }: { data: ApplicationData }) {
  const { analysis, tailored } = data;

  const gaps = tailored.coverage.filter((c: CoverageItem) => c.status === "missing");
  const partials = tailored.coverage.filter((c: CoverageItem) => c.status === "partial");

  return (
    <div className="prep-checklist">
      {analysis.red_flags.length > 0 && (
        <div className="prep-section">
          <h5>Red flags to address</h5>
          <ul className="prep-list prep-list-gap">
            {analysis.red_flags.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {gaps.length > 0 && (
        <div className="prep-section">
          <h5>Gaps to explain</h5>
          <ul className="prep-list prep-list-gap">
            {gaps.map((g, i) => (
              <li key={i}>
                <strong>{g.requirement}</strong>
                {g.evidence && <span className="prep-evidence"> — {g.evidence}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {partials.length > 0 && (
        <div className="prep-section">
          <h5>Partial matches — prepare examples</h5>
          <ul className="prep-list prep-list-partial">
            {partials.map((p, i) => (
              <li key={i}>
                <strong>{p.requirement}</strong>
                {p.evidence && <span className="prep-evidence"> — {p.evidence}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {analysis.responsibilities.length > 0 && (
        <div className="prep-section">
          <h5>Expected responsibilities</h5>
          <ul className="prep-list">
            {analysis.responsibilities.slice(0, 6).map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {gaps.length === 0 && partials.length === 0 && analysis.red_flags.length === 0 && (
        <p className="muted small">Strong match — no major gaps to prepare for.</p>
      )}
    </div>
  );
}

function FollowUpSection({
  application,
  daysWaited,
}: {
  application: Application;
  daysWaited: number;
}) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function draft() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.draftFollowupEmail(application.id);
      setEmail(res.email);
    } catch {
      setError("Generation failed — try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="followup-section">
      {daysWaited < 5 && (
        <p className="hint">Usually best to follow up after 7 days. Applied {daysWaited}d ago.</p>
      )}
      {!email && (
        <button className="btn btn-secondary" onClick={draft} disabled={loading}>
          {loading ? "Drafting…" : "Draft follow-up email with AI"}
        </button>
      )}
      {error && <p className="error">{error}</p>}
      {email && (
        <>
          <textarea
            className="email-textarea"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            rows={8}
          />
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => navigator.clipboard.writeText(email)}
            >
              Copy to clipboard
            </button>
            <button className="btn btn-ghost btn-sm" onClick={draft} disabled={loading}>
              Regenerate
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function ApplicationDetailPanel({ application, onClose, onPatch }: Props) {
  const [data, setData] = useState<ApplicationData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"overview" | "cv" | "prep" | "followup" | "interview" | "ats">("overview");
  const [notes, setNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [atsResult, setAtsResult] = useState<AtsCheckResult | null>(null);
  const [atsLoading, setAtsLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [cvSaving, setCvSaving] = useState(false);

  // Sync atsResult when data loads (cached result from server)
  useEffect(() => {
    if (data?.ats_check) setAtsResult(data.ats_check);
  }, [data?.ats_check]);

  // Auto-trigger ATS check when tab is opened and no result yet
  useEffect(() => {
    if (activeSection !== "ats" || atsResult || atsLoading || !application) return;
    handleRunAtsCheck();
  }, [activeSection, atsResult, atsLoading]);

  useEffect(() => {
    if (!application) {
      setData(null);
      setLoadError(null);
      return;
    }
    setData(null);
    setLoadError(null);
    setAtsResult(null);
    setAtsLoading(false);
    setNotes(application.notes ?? "");
    setActiveSection("overview");
    setEditMode(false);

    api
      .getApplicationData(application.id)
      .then(setData)
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Could not load application data."));
  }, [application?.id]);

  if (!application) return null;

  async function saveNotes() {
    if (!application || notes === application.notes) return;
    setNotesSaving(true);
    try {
      await api.patchApplication(application.id, { notes });
      onPatch(application.id, { notes });
    } catch {
      showToast("Could not save notes.", "error");
    } finally {
      setNotesSaving(false);
    }
  }

  async function handleRunAtsCheck() {
    if (!application || atsLoading) return;
    setAtsLoading(true);
    try {
      const res = await api.runAtsCheck(application.id);
      setAtsResult(res);
    } catch {
      // silent — user can retry with Re-check button
    } finally {
      setAtsLoading(false);
    }
  }

  async function handleDocx() {
    if (!data) return;
    try {
      await api.downloadDocx(data.tailored);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not download .docx.", "error");
    }
  }

  async function handlePdf() {
    if (!data) return;
    try {
      await api.downloadPdf(data.tailored);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not download PDF.", "error");
    }
  }

  async function handleSaveTailored(updated: TailoredCv) {
    if (!application) return;
    setCvSaving(true);
    try {
      const saved = await api.patchTailored(application.id, updated);
      setData((prev) => (prev ? { ...prev, tailored: saved } : prev));
      setEditMode(false);
      showToast("CV збережено", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Не вдалось зберегти CV", "error");
    } finally {
      setCvSaving(false);
    }
  }

  return (
    <>
      <div className="drawer-scrim" onClick={onClose}>
        <aside
          className="drawer detail-panel"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        >
          {/* Header */}
          <div className="detail-header">
            <div className="detail-header-meta">
              <div className="detail-company">{application.company}</div>
              <h2 className="detail-role">{application.role}</h2>
              <div className="detail-tags">
                <span className="pill ghost">{application.seniority}</span>
                <span className="pill ghost">fit: {application.fitScore}%</span>
                <span className="pill ghost">{application.dateAdded}</span>
                {application.jobUrl && (
                  <a href={application.jobUrl} target="_blank" rel="noreferrer" className="pill ghost detail-link">
                    job posting ↗
                  </a>
                )}
              </div>
              <div className="detail-status-row">
                <select
                  className={`status-select ${statusClass(application.status)}`}
                  value={application.status}
                  onChange={(e) => onPatch(application.id, { status: e.target.value as Status })}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
          </div>

          {/* Download buttons */}
          {data && (
            <div className="detail-downloads">
              <button className="btn btn-primary btn-sm" onClick={handleDocx}>
                Download .docx
              </button>
              <button className="btn btn-ghost btn-sm" onClick={handlePdf}>
                Download PDF
              </button>
            </div>
          )}

          {/* Section tabs */}
          <div className="detail-tabs">
            {(["overview", "cv", "prep"] as const).map((s) => (
              <button
                key={s}
                className={`detail-tab ${activeSection === s ? "on" : ""}`}
                onClick={() => setActiveSection(s)}
              >
                {s === "overview" ? "Overview" : s === "cv" ? "Tailored CV" : "Interview Prep"}
              </button>
            ))}
            <button
              className={`detail-tab ${activeSection === "followup" ? "on" : ""}`}
              onClick={() => setActiveSection("followup")}
            >
              Follow-up
            </button>
            <button
              className={`detail-tab ${activeSection === "interview" ? "on" : ""}`}
              onClick={() => setActiveSection("interview")}
            >
              Mock Interview
            </button>
            <button
              className={`detail-tab ${activeSection === "ats" ? "on" : ""}`}
              onClick={() => setActiveSection("ats")}
            >
              ATS Check
            </button>
          </div>

          {/* Body */}
          <div className="detail-body">
            {loadError && (
              <div className="form-error">{loadError}</div>
            )}

            {!data && !loadError && activeSection !== "followup" && activeSection !== "interview" && activeSection !== "ats" && (
              <div className="drawer-loading">Loading…</div>
            )}

            {data && activeSection === "overview" && (
              <>
                <div className="detail-fit-row">
                  <FitGauge score={data.tailored.fit_score} />
                  <div className="detail-fit-meta">
                    <h3>{data.analysis.role_title}</h3>
                    <div className="meta-line">
                      <span className="pill">{data.analysis.seniority}</span>
                      <span className="pill ghost">lang: {data.analysis.language}</span>
                    </div>
                    {data.tailored.match_notes && (
                      <p className="notes small">{data.tailored.match_notes}</p>
                    )}
                  </div>
                </div>
                <Coverage coverage={data.tailored.coverage} />
              </>
            )}

            {data && activeSection === "cv" && (
              <div className="cv-tab-container">
                <div className="cv-tab-actions">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setEditMode((v) => !v)}
                  >
                    {editMode ? "Закрити редактор" : "✏️ Редагувати"}
                  </button>
                </div>
                <div className={`cv-tab-body${editMode ? " cv-tab-split" : ""}`}>
                  <div className="cv-tab-preview">
                    <CvPreview cv={data.tailored} />
                  </div>
                  {editMode && (
                    <div className="cv-tab-editor">
                      <CvEditor
                        cv={data.tailored}
                        onSave={handleSaveTailored}
                        onCancel={() => setEditMode(false)}
                        saving={cvSaving}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {data && activeSection === "prep" && (
              <div>
                <PrepChecklist data={data} />
                <div className="prep-notes">
                  <h5>Your notes</h5>
                  <textarea
                    className="prep-notes-input"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    onBlur={saveNotes}
                    placeholder="Interview notes, questions to ask, things to remember…"
                    rows={6}
                  />
                  {notesSaving && <span className="muted small">Saving…</span>}
                </div>
              </div>
            )}

            {activeSection === "followup" && (
              <FollowUpSection key={application.id} application={application} daysWaited={daysSince(application.dateAdded)} />
            )}

            {activeSection === "interview" && (
              <MockInterview key={application.id} applicationId={application.id} />
            )}

            {activeSection === "ats" && (
              <div className="ats-check">
                {atsLoading && !atsResult && (
                  <div className="drawer-loading">Analyzing ATS compatibility…</div>
                )}
                {!atsLoading && !atsResult && (
                  <p className="muted small">ATS check not yet run for this application.</p>
                )}
                {atsResult && (
                  <>
                    <div className="detail-fit-row">
                      <div style={{ textAlign: "center", flex: "none", width: 130 }}>
                        <span
                          className="gauge-score"
                          style={{
                            color:
                              atsResult.ats_score >= 70
                                ? "var(--thread)"
                                : atsResult.ats_score >= 50
                                  ? "var(--partial)"
                                  : "var(--gap)",
                          }}
                        >
                          {atsResult.ats_score}
                        </span>
                        <span className="gauge-label" style={{ display: "block" }}>ATS Score</span>
                      </div>
                      <p className="notes small">{atsResult.verdict}</p>
                    </div>

                    {(atsResult.recommendations?.length ?? 0) > 0 && (
                      <div className="prep-section">
                        <h5>Recommendations</h5>
                        <ul className="prep-list">
                          {atsResult.recommendations.map((r, i) => (
                            <li
                              key={i}
                              className={
                                r.priority === "high"
                                  ? "prep-list-gap"
                                  : r.priority === "medium"
                                    ? "prep-list-partial"
                                    : ""
                              }
                            >
                              {r.text}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {(atsResult.format_checks?.length ?? 0) > 0 && (
                      <div className="prep-section">
                        <h5>Format Checks</h5>
                        <ul className="prep-list">
                          {atsResult.format_checks.map((fc, i) => (
                            <li key={i} className={fc.passed ? "" : "prep-list-gap"}>
                              {fc.passed ? "✓" : "✗"} {fc.rule}
                              {!fc.passed && fc.note && (
                                <span className="notes small" style={{ display: "block", marginTop: 2 }}>
                                  {fc.note}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {(atsResult.keyword_coverage?.length ?? 0) > 0 && (
                      <div className="prep-section">
                        <h5>
                          Keyword Coverage (
                          {atsResult.keyword_coverage.filter((k) => k.found).length}/
                          {atsResult.keyword_coverage.length})
                        </h5>
                        <div className="tokens">
                          {atsResult.keyword_coverage.map((k, i) => (
                            <span key={i} className={`token${k.found ? " hard" : ""}`} title={k.location}>
                              {k.keyword}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={handleRunAtsCheck}
                        disabled={atsLoading}
                      >
                        {atsLoading ? "Re-checking…" : "Re-check ATS"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
