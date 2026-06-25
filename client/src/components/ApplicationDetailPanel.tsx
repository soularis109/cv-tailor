import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Application, ApplicationData, AtsCheckResult, CoverageItem, ExperienceVerificationResult, TailoredCv } from "../types";
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
  const [isManual, setIsManual] = useState(false);
  const [activeSection, setActiveSection] = useState<"overview" | "cv" | "prep" | "followup" | "interview" | "ats" | "level">("overview");
  const [notes, setNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [atsResult, setAtsResult] = useState<AtsCheckResult | null>(null);
  const [atsLoading, setAtsLoading] = useState(false);
  const [prevAtsScore, setPrevAtsScore] = useState<number | null>(null);
  const [expResult, setExpResult] = useState<ExperienceVerificationResult | null>(null);
  const [expLoading, setExpLoading] = useState(false);
  const [prevExpScore, setPrevExpScore] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [cvSaving, setCvSaving] = useState(false);
  const [reTailorOpen, setReTailorOpen] = useState(false);
  const [reTailorInstructions, setReTailorInstructions] = useState("");
  const [reTailorLoading, setReTailorLoading] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const [refineInstructions, setRefineInstructions] = useState("");
  const [refineLoading, setRefineLoading] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Sync atsResult when data loads (cached result from server)
  useEffect(() => {
    if (data?.ats_check) setAtsResult(data.ats_check);
  }, [data?.ats_check]);

  // Sync expResult when data loads (cached result from server)
  useEffect(() => {
    if (data?.experience_check) setExpResult(data.experience_check);
  }, [data?.experience_check]);

  // Auto-trigger ATS check when tab is opened and no result yet
  useEffect(() => {
    if (activeSection !== "ats" || atsResult || atsLoading || !application) return;
    handleRunAtsCheck();
  }, [activeSection, atsResult, atsLoading]);

  // Auto-trigger experience check when tab is opened and no result yet
  useEffect(() => {
    if (activeSection !== "level" || expResult || expLoading || !application) return;
    handleRunExperienceCheck();
  }, [activeSection, expResult, expLoading]);

  useEffect(() => {
    if (!application) {
      setData(null);
      setLoadError(null);
      setIsManual(false);
      return;
    }
    setData(null);
    setLoadError(null);
    setIsManual(false);
    setAtsResult(null);
    setAtsLoading(false);
    setExpResult(null);
    setExpLoading(false);
    setNotes(application.notes ?? "");
    setActiveSection("overview");
    setEditMode(false);
    setReTailorOpen(false);
    setReTailorInstructions("");
    setRefineOpen(false);
    setRefineInstructions("");

    api
      .getApplicationData(application.id)
      .then(setData)
      .catch((e: Error) => {
        const msg = e.message ?? "";
        if (msg.toLowerCase().includes("not found") || msg.includes("404")) {
          setIsManual(true);
        } else {
          setLoadError(msg || "Could not load application data.");
        }
      });
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
    setPrevAtsScore(null);
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

  async function handleEnhanceForAts() {
    if (!application || atsLoading || !atsResult) return;
    setPrevAtsScore(atsResult.ats_score);
    setAtsLoading(true);
    try {
      const res = await api.enhanceForAts(application.id);
      setAtsResult(res.ats_check);
      // Also update the local data so the CV tab shows the enhanced version
      setData(prev => prev ? { ...prev, tailored: res.tailored } : prev);
    } catch {
      // silent
    } finally {
      setAtsLoading(false);
    }
  }

  async function handleRunExperienceCheck() {
    if (!application || expLoading) return;
    setExpLoading(true);
    try {
      const result = await api.runExperienceVerification(application.id);
      setExpResult(result);
    } catch {
      // silent fail — user can retry
    } finally {
      setExpLoading(false);
    }
  }

  async function handleEnhanceCvForExperience() {
    if (!expResult || !application || expLoading) return;
    setPrevExpScore(expResult.overall_score);
    setExpLoading(true);
    try {
      const { tailored, experience_check } = await api.enhanceCvForExperience(application.id);
      setExpResult(experience_check);
      setData((prev) => prev ? { ...prev, tailored, experience_check } : prev);
    } catch {
      // silent fail
    } finally {
      setExpLoading(false);
    }
  }

  async function handleDocx() {
    if (!data) return;
    try {
      await api.downloadDocx(data.tailored, application?.company);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not download .docx.", "error");
    }
  }

  async function handlePdf() {
    if (!data || !application) return;
    try {
      if (data.customPdf) {
        await api.downloadCustomPdf(application.id);
      } else {
        await api.downloadPdf(data.tailored, application.company);
      }
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

  async function handleReTailor() {
    if (!application || reTailorLoading) return;
    setReTailorLoading(true);
    try {
      const tailored = await api.reTailor(application.id, {
        customInstructions: reTailorInstructions.trim() || undefined,
      });
      setData((prev) => prev ? { ...prev, tailored } : prev);
      setReTailorOpen(false);
      setReTailorInstructions("");
      showToast("CV перегенеровано", "success");
      setAtsResult(null);
      setExpResult(null);
      api.runAtsCheck(application.id).catch(() => {});
      api.runExperienceVerification(application.id).catch(() => {});
    } catch {
      showToast("Не вдалось перегенерувати", "error");
    } finally {
      setReTailorLoading(false);
    }
  }

  async function handleRefine() {
    if (!application || refineLoading) return;
    setRefineLoading(true);
    try {
      const tailored = await api.refineTailor(application.id, {
        customInstructions: refineInstructions.trim() || undefined,
      });
      setData((prev) => prev ? { ...prev, tailored } : prev);
      setRefineOpen(false);
      setRefineInstructions("");
      showToast("CV доопрацьовано", "success");
      setAtsResult(null);
      setExpResult(null);
      api.runAtsCheck(application.id).catch(() => {});
      api.runExperienceVerification(application.id).catch(() => {});
    } catch {
      showToast("Не вдалось доопрацювати", "error");
    } finally {
      setRefineLoading(false);
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
            <button
              className={`detail-tab ${activeSection === "level" ? "on" : ""}`}
              onClick={() => setActiveSection("level")}
            >
              Level Check
            </button>
          </div>

          {/* Body */}
          <div className="detail-body">
            {loadError && (
              <div className="form-error">{loadError}</div>
            )}

            {isManual && (
              <div className="empty" style={{ padding: "1.5rem 0" }}>
                <p className="muted">No tailored CV for this application.</p>
                <p className="small muted">
                  Added manually. Go to the Tailor tab to generate a tailored CV, or track it here as-is.
                </p>
              </div>
            )}

            {!data && !loadError && !isManual && activeSection !== "followup" && activeSection !== "interview" && activeSection !== "ats" && activeSection !== "level" && (
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
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setReTailorOpen((v) => !v); setRefineOpen(false); setEditMode(false); }}
                    disabled={reTailorLoading || refineLoading}
                  >
                    {reTailorOpen ? "Закрити" : "↺ Перегенерувати"}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setRefineOpen((v) => !v); setReTailorOpen(false); setEditMode(false); }}
                    disabled={refineLoading || reTailorLoading}
                  >
                    {refineOpen ? "Закрити" : "✏ Доопрацювати"}
                  </button>
                  {/* Custom PDF controls */}
                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept=".pdf"
                    style={{ display: "none" }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        await api.uploadCustomPdf(application.id, file);
                        setData(d => d ? { ...d, customPdf: true } : d);
                      } catch (err) {
                        console.error(err);
                      }
                      e.target.value = "";
                    }}
                  />
                  {data.customPdf ? (
                    <span className="custom-pdf-badge">
                      ✓ Власний PDF
                      <button
                        className="custom-pdf-remove"
                        onClick={async () => {
                          await api.deleteCustomPdf(application.id);
                          setData(d => d ? { ...d, customPdf: false } : d);
                        }}
                      >
                        Видалити
                      </button>
                    </span>
                  ) : (
                    <button
                      className="cv-action-btn"
                      onClick={() => pdfInputRef.current?.click()}
                    >
                      Завантажити PDF
                    </button>
                  )}
                </div>
                {reTailorOpen && (
                  <div className="retailor-panel">
                    <p className="notes small">
                      Додаткові інструкції для AI (опціонально). Залиш порожнім — просто перегенерує з тими ж налаштуваннями.
                    </p>
                    <textarea
                      className="retailor-textarea"
                      rows={4}
                      placeholder={"Приклади:\n• Зроби більший акцент на лідерстві і менторстві\n• Мова резюме — тільки англійська\n• Прибери проекти не пов'язані зі стеком вакансії"}
                      value={reTailorInstructions}
                      onChange={(e) => setReTailorInstructions(e.target.value)}
                      disabled={reTailorLoading}
                    />
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleReTailor}
                      disabled={reTailorLoading}
                    >
                      {reTailorLoading ? "Генерую CV…" : "↺ Перегенерувати CV"}
                    </button>
                  </div>
                )}
                {refineOpen && (
                  <div className="retailor-panel">
                    <p className="notes small">
                      Вкажи що потрібно покращити у поточному CV (опціонально). AI доопрацює існуючу версію, не генеруючи з нуля.
                    </p>
                    <textarea
                      className="retailor-textarea"
                      rows={3}
                      placeholder="Напр.: Додай більше метрик у bullets, підкресли leadership..."
                      value={refineInstructions}
                      onChange={(e) => setRefineInstructions(e.target.value)}
                      disabled={refineLoading}
                    />
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleRefine}
                      disabled={refineLoading}
                    >
                      {refineLoading ? "Доопрацьовую CV…" : "Доопрацювати CV"}
                    </button>
                  </div>
                )}
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

            {activeSection === "followup" && !isManual && (
              <FollowUpSection key={application.id} application={application} daysWaited={daysSince(application.dateAdded)} />
            )}
            {activeSection === "followup" && isManual && (
              <p className="muted small" style={{ padding: "1rem 0" }}>Follow-up drafting requires a tailored CV.</p>
            )}

            {activeSection === "interview" && !isManual && (
              <MockInterview key={application.id} applicationId={application.id} />
            )}
            {activeSection === "interview" && isManual && (
              <p className="muted small" style={{ padding: "1rem 0" }}>Mock interview requires a tailored CV.</p>
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
                        {prevAtsScore !== null && (
                          <span
                            className="ats-score-delta"
                            style={{ display: "block", color: "var(--thread)", fontSize: "0.75rem", marginTop: 4 }}
                          >
                            {prevAtsScore} → {atsResult.ats_score}
                          </span>
                        )}
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

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {atsResult.ats_score < 90 && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={handleEnhanceForAts}
                          disabled={atsLoading}
                        >
                          {atsLoading ? "Boosting…" : "✦ Boost ATS Score"}
                        </button>
                      )}
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

            {activeSection === "level" && (
              <div className="ats-check">
                {expLoading && !expResult && (
                  <div className="drawer-loading">Analyzing experience & seniority…</div>
                )}
                {!expLoading && !expResult && (
                  <p className="muted small">Level Check will run automatically</p>
                )}
                {expResult && (
                  <>
                    <div className="detail-fit-row">
                      <div style={{ textAlign: "center", flex: "none", width: 130 }}>
                        <span
                          className="gauge-score"
                          style={{
                            color:
                              expResult.overall_score >= 70
                                ? "var(--thread)"
                                : expResult.overall_score >= 50
                                  ? "var(--partial)"
                                  : "var(--gap)",
                          }}
                        >
                          {expResult.overall_score}
                        </span>
                        <span className="gauge-label" style={{ display: "block" }}>Level Score</span>
                        <span className="muted small" style={{ display: "block", marginTop: 4 }}>
                          Level: {expResult.level_score} · Stack: {expResult.stack_score}
                        </span>
                        {prevExpScore !== null && (
                          <span
                            className="ats-score-delta"
                            style={{ display: "block", color: "var(--thread)", fontSize: "0.75rem", marginTop: 4 }}
                          >
                            {prevExpScore} → {expResult.overall_score}
                          </span>
                        )}
                      </div>
                      <p className="notes small">{expResult.verdict}</p>
                    </div>

                    <div className="prep-section">
                      <h5>Seniority Issues</h5>
                      {expResult.level_checks.filter((lc) => lc.issue !== "ok").length === 0 ? (
                        <p className="muted small">✓ Seniority language is well-aligned</p>
                      ) : (
                        <ul className="prep-list">
                          {expResult.level_checks
                            .filter((lc) => lc.issue !== "ok")
                            .map((lc, i) => (
                              <li key={i} className="prep-list-gap">
                                <span className="muted small" style={{ display: "block" }}>{lc.location}</span>
                                <span style={{ fontStyle: "italic" }}>{lc.current_text}</span>
                                <span
                                  className="pill"
                                  style={{
                                    marginLeft: 6,
                                    background: "var(--gap-bg)",
                                    color: "var(--gap)",
                                    fontSize: "0.7rem",
                                  }}
                                >
                                  {lc.issue === "too_junior" ? "too junior" : "too senior"}
                                </span>
                                {lc.explanation && (
                                  <span className="notes small" style={{ display: "block", marginTop: 2 }}>
                                    {lc.explanation}
                                  </span>
                                )}
                                {lc.suggestion && (
                                  <span className="notes small" style={{ display: "block", marginTop: 2, color: "var(--thread)" }}>
                                    → {lc.suggestion}
                                  </span>
                                )}
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>

                    {(expResult.stack_checks?.length ?? 0) > 0 && (
                      <div className="prep-section">
                        <h5>Stack Alignment</h5>
                        <ul className="prep-list">
                          {expResult.stack_checks.map((sc, i) => {
                            const isDemonstrated = sc.status === "demonstrated";
                            const isMentioned = sc.status === "mentioned_only";
                            const isMissing = sc.status === "missing";
                            return (
                              <li
                                key={i}
                                className={isMissing ? "prep-list-gap" : isMentioned ? "prep-list-partial" : ""}
                              >
                                <span style={{ marginRight: 6 }}>
                                  {isDemonstrated ? "✓" : isMentioned ? "⚡" : "✗"}
                                </span>
                                <strong>{sc.technology}</strong>
                                <span className="muted small" style={{ marginLeft: 6 }}>
                                  {isDemonstrated ? "demonstrated" : isMentioned ? "mentioned only" : "missing"}
                                </span>
                                {sc.location && (
                                  <span className="muted small" style={{ display: "block", marginTop: 1 }}>
                                    {sc.location}
                                  </span>
                                )}
                                {sc.suggestion && (
                                  <span className="notes small" style={{ display: "block", marginTop: 2, color: "var(--thread)" }}>
                                    → {sc.suggestion}
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    {(expResult.recommendations?.length ?? 0) > 0 && (
                      <div className="prep-section">
                        <h5>Recommendations</h5>
                        <ul className="prep-list">
                          {[...expResult.recommendations]
                            .sort((a, b) => {
                              const order = { high: 0, medium: 1, low: 2 };
                              return order[a.priority] - order[b.priority];
                            })
                            .map((r, i) => (
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

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {expResult.overall_score < 90 && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={handleEnhanceCvForExperience}
                          disabled={expLoading}
                        >
                          {expLoading ? "Fixing…" : "✦ Fix Level & Stack"}
                        </button>
                      )}
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={handleRunExperienceCheck}
                        disabled={expLoading}
                      >
                        {expLoading ? "Re-checking…" : "Re-check"}
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
