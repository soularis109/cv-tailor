import { useEffect, useRef, useState } from "react";
import { api, type MasterCv } from "./api";
import type { Application, JobAnalysis, TailorResponse } from "./types";
import { FitGauge } from "./components/FitGauge";
import { Coverage } from "./components/Coverage";
import { CvPreview } from "./components/CvPreview";
import { Pipeline } from "./components/Pipeline";
import { MasterCvDrawer } from "./components/MasterCvDrawer";
import { TailorProgress } from "./components/TailorProgress";
import { ApplicationDetailPanel } from "./components/ApplicationDetailPanel";
import { CoverLetterModal } from "./components/CoverLetterModal";
import { ToastStack } from "./components/Toast";
import { showToast } from "./utils/toast";
import { playDoneChime, notifyDone, requestNotificationPermission } from "./utils/notify";
import { useDraftAutoSave } from "./hooks/useDraftAutoSave";

type Tab = "tailor" | "pipeline";
type Stage = null | "analyzing" | "tailoring";


function Tokens({ items, kind = "" }: { items: string[]; kind?: string }) {
  if (!items.length) return <span className="muted small">—</span>;
  return (
    <div className="tokens">
      {items.map((t, i) => (
        <span key={i} className={`token ${kind}`}>
          {t}
        </span>
      ))}
    </div>
  );
}

function AnalysisCard({ analysis }: { analysis: JobAnalysis }) {
  return (
    <div className="card">
      <h3>What the role wants</h3>
      <div className="want-grid">
        <div>
          <h5>Must have</h5>
          <Tokens items={analysis.must_have} kind="hard" />
        </div>
        <div>
          <h5>Nice to have</h5>
          <Tokens items={analysis.nice_to_have} />
        </div>
        <div>
          <h5>Core tech</h5>
          <Tokens items={analysis.core_technologies} kind="mono" />
        </div>
        <div>
          <h5>ATS keywords</h5>
          <Tokens items={analysis.ats_keywords} kind="mono" />
        </div>
      </div>
      {analysis.red_flags.length > 0 && (
        <div className="redflags">
          <h5>Worth a second look</h5>
          <ul>
            {analysis.red_flags.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const SENIORITY_TEMPLATES: Record<string, string> = {
  intern:
    "Write as an intern/entry-level candidate. Use verbs: Built, Developed, Implemented, Assisted, Contributed. Focus on technologies used and concrete learning outcomes. Keep bullets to 1 line. Avoid leadership or ownership language.",
  junior:
    "Write as a junior developer. Use: Built, Developed, Implemented, Contributed. Show technical depth and ability to own features end-to-end. 1-2 line bullets. Quantify small wins where possible.",
  middle:
    "Write as a mid-level engineer. Use: Designed, Led, Owned, Drove, Delivered. Show feature or system ownership end-to-end, quantify impact (%, latency, user count). Mention cross-team collaboration. 1-2 line bullets.",
  senior:
    "Write as a senior engineer. Use: Architected, Spearheaded, Mentored, Scaled, Defined. Quantify: team size, DAU, RPS, latency improvements. Emphasize business impact and technical leadership. Always lead with scale or outcome.",
  lead:
    "Write as a tech lead. Use: Led, Defined, Established, Drove, Championed. Emphasize team leadership, technical direction, cross-functional collaboration, and org-wide influence. Show scope: team headcount, company impact.",
  staff:
    "Write as a staff engineer. Use: Architected, Drove org-wide adoption, Defined strategy, Established standards. Show company-wide technical impact and influence across multiple teams and orgs.",
  principal:
    "Write as a principal engineer. Use: Defined technical vision, Architected at org scale, Pioneered. Show multi-year strategic impact, cross-org influence, and transformation of how engineering is done.",
};

export default function App() {
  const [tab, setTab] = useState<Tab>("tailor");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [master, setMaster] = useState<MasterCv | null>(null);
  const [masterLoading, setMasterLoading] = useState(true);
  const [masterError, setMasterError] = useState<string | null>(null);
  const [cvProfiles, setCvProfiles] = useState<string[]>(["default"]);
  const [activeProfile, setActiveProfile] = useState("default");

  const { draft, setDraft, clearDraft } = useDraftAutoSave();
  const { jobText, jobUrl, source, customInstructions, showCustom } = draft;

  const [userLevel, setUserLevel] = useState<"junior" | "middle" | "senior">("middle");

  const [stage, setStage] = useState<Stage>(null);
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [cachedAnalysis, setCachedAnalysis] = useState<JobAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TailorResponse | null>(null);
  const [companyBrief, setCompanyBrief] = useState<string | null>(null);
  const [analyzeOnlyDone, setAnalyzeOnlyDone] = useState(false);
  const [coverLetterOpen, setCoverLetterOpen] = useState(false);

  const [apps, setApps] = useState<Application[]>([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [appsError, setAppsError] = useState<string | null>(null);

  const [detailAppId, setDetailAppId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Load profiles on mount; fallback to ["default"] on error
    api.getCvProfiles()
      .then(setCvProfiles)
      .catch(() => { /* fallback to ["default"] already set */ });

    setAppsLoading(true);
    api
      .getApplications()
      .then((data) => {
        setApps(data);
        setAppsError(null);
      })
      .catch((e) => setAppsError(e instanceof Error ? e.message : "Could not load applications."))
      .finally(() => setAppsLoading(false));
  }, []);

  useEffect(() => {
    setMasterLoading(true);
    setMaster(null);
    setMasterError(null);
    api
      .getMasterCv(activeProfile)
      .then((cv) => {
        setMaster(cv);
        setMasterError(null);
      })
      .catch((e: Error) => {
        const msg = e?.message ?? "unknown error";
        if (msg.includes("404") || msg.includes("not found")) {
          setMaster(null);
        } else {
          setMasterError(msg);
        }
      })
      .finally(() => setMasterLoading(false));
  }, [activeProfile]);

  useEffect(() => {
    if (stage) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [stage]);

  useEffect(() => {
    if (analyzeOnlyDone) {
      setAnalyzeOnlyDone(false);
      setCachedAnalysis(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobText]);

  async function runTailor() {
    // Guard: master CV must exist before spending tokens
    if (!masterLoading && !master) {
      setDrawerOpen(true);
      showToast("Set up your master CV first, then tailor for this role.", "info");
      return;
    }

    await requestNotificationPermission();
    setStage("analyzing");
    setProgress(0);
    setError(null);
    setCompanyBrief(null);
    setCachedAnalysis(null);
    setAnalyzeOnlyDone(false);

    try {
      const { analysis } = await api.analyzeJob(jobText);
      setCachedAnalysis(analysis);
      setProgress(50);
      setStage("tailoring");

      const res = await api.tailor(jobText, jobUrl, source, analysis, customInstructions || undefined, activeProfile, userLevel);
      setProgress(100);
      setResult(res);
      clearDraft();
      setApps((prev) => [res.application, ...prev]);
      // Fire-and-forget ATS check
      api.runAtsCheck(res.application.id).catch(() => { /* silent fail */ });
      // Auto-fetch company brief if URL is available
      if (jobUrl.trim() && res.application.company && res.application.company !== "—") {
        api.getCompanyBrief(jobUrl, res.application.company)
          .then((r) => setCompanyBrief(r.brief))
          .catch(() => { /* silent fail — brief is optional */ });
      }

      playDoneChime();
      await notifyDone(res.analysis.role_title);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setStage(null);
      setProgress(0);
    }
  }

  async function runAnalyzeOnly() {
    if (!jobText.trim() || jobText.trim().length < 30) return;
    setStage("analyzing");
    setError(null);
    setCompanyBrief(null);
    setAnalyzeOnlyDone(false);
    try {
      const { analysis } = await api.analyzeJob(jobText);
      setCachedAnalysis(analysis);
      setAnalyzeOnlyDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setStage(null);
    }
  }

  async function retryTailor() {
    if (!cachedAnalysis) return;
    setStage("tailoring");
    setProgress(50);
    setError(null);
    setCompanyBrief(null);
    try {
      const res = await api.tailor(jobText, jobUrl, source, cachedAnalysis, customInstructions || undefined, activeProfile, userLevel);
      setProgress(100);
      setResult(res);
      clearDraft();
      setApps((prev) => [res.application, ...prev]);
      // Fire-and-forget ATS check
      api.runAtsCheck(res.application.id).catch(() => { /* silent fail */ });
      // Auto-fetch company brief if URL is available
      if (jobUrl.trim() && res.application.company && res.application.company !== "—") {
        api.getCompanyBrief(jobUrl, res.application.company)
          .then((r) => setCompanyBrief(r.brief))
          .catch(() => { /* silent fail — brief is optional */ });
      }
      playDoneChime();
      await notifyDone(res.analysis.role_title);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setStage(null);
      setProgress(0);
    }
  }

  function patchApp(id: string, patch: Partial<Application>) {
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    api.patchApplication(id, patch).catch(() => {
      showToast("Could not save changes — reverted.", "error");
      api.getApplications().then(setApps).catch(() => {});
    });
  }

  async function removeApp(id: string) {
    const app = apps.find((a) => a.id === id);
    if (!app) return;

    setApps((prev) => prev.filter((a) => a.id !== id));

    try {
      await api.deleteApplication(id);
      showToast(`Removed ${app.company} — ${app.role}`, "info");
    } catch {
      showToast("Could not delete — restored.", "error");
      setApps((prev) => {
        const exists = prev.find((a) => a.id === id);
        return exists ? prev : [app, ...prev];
      });
    }
  }

  const detailApp = detailAppId ? apps.find((a) => a.id === detailAppId) ?? null : null;

  const { analysis, tailored } = result ?? {};
  const isRunning = stage !== null;
  const showPartialAnalysis = stage === "tailoring" && cachedAnalysis && !result;

  async function handleDownloadDocx() {
    if (!tailored) return;
    try {
      await api.downloadDocx(tailored);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not download .docx.", "error");
    }
  }

  async function handleDownloadPdf() {
    if (!tailored) return;
    try {
      await api.downloadPdf(tailored);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not download PDF.", "error");
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">CV&nbsp;Tailor</span>
          <span className="brand-sub">job-hunt workbench</span>
        </div>

        <nav className="tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === "tailor"}
            className={tab === "tailor" ? "tab on" : "tab"}
            onClick={() => setTab("tailor")}
          >
            Tailor
          </button>
          <button
            role="tab"
            aria-selected={tab === "pipeline"}
            className={tab === "pipeline" ? "tab on" : "tab"}
            onClick={() => setTab("pipeline")}
          >
            Pipeline
            {apps.length > 0 && <span className="tab-badge">{apps.length}</span>}
          </button>
        </nav>

        <button className="master-chip" onClick={() => setDrawerOpen(true)}>
          {masterLoading ? (
            <span className="master-name muted">Loading…</span>
          ) : master ? (
            <>
              <span className="master-dot" />
              <span className="master-name">{master.name ?? "Master CV"}</span>
            </>
          ) : (
            <span className="master-name warn">Set up master CV</span>
          )}
        </button>
        {cvProfiles.length > 1 && (
          <select
            className="profile-select"
            value={activeProfile}
            onChange={(e) => setActiveProfile(e.target.value)}
            title="CV Profile"
          >
            {cvProfiles.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        )}
      </header>

      {masterError && (
        <div className="banner warn">
          Could not load your master CV ({masterError}). Open the master CV panel to fix this.
        </div>
      )}

      {tab === "tailor" ? (
        <main className="workbench">
          <section className="input-col">
            <label className="field-label" htmlFor="job">
              Job posting
            </label>
            <textarea
              id="job"
              className="job-input"
              placeholder="Paste the full job description here — requirements, responsibilities, the lot."
              value={jobText}
              onChange={(e) => setDraft({ jobText: e.target.value })}
            />
            <div className="field-row">
              <div style={{ display: "flex", gap: "6px", flex: 1 }}>
                <input
                  className="text-input"
                  style={{ flex: 1 }}
                  placeholder="Job URL (optional)"
                  value={jobUrl}
                  onChange={(e) => setDraft({ jobUrl: e.target.value })}
                />
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={!jobUrl.trim() || fetchingUrl}
                  onClick={async () => {
                    setFetchingUrl(true);
                    try {
                      const text = await api.fetchJobFromUrl(jobUrl);
                      setDraft({ jobText: text });
                      showToast("Job description fetched!", "success");
                    } catch {
                      showToast("Couldn't fetch — try pasting manually", "error");
                    } finally {
                      setFetchingUrl(false);
                    }
                  }}
                >
                  {fetchingUrl ? "Fetching…" : "Fetch"}
                </button>
              </div>
              <input
                className="text-input"
                placeholder="Source (LinkedIn, referral…)"
                value={source}
                onChange={(e) => setDraft({ source: e.target.value })}
              />
            </div>
            <div className="level-row">
              <span className="level-label">My Level</span>
              <div className="level-seg" role="group" aria-label="My Level">
                {(["junior", "middle", "senior"] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    className={`level-seg-btn${userLevel === lvl ? " level-seg-btn-on" : ""}`}
                    onClick={() => setUserLevel(lvl)}
                    aria-pressed={userLevel === lvl}
                  >
                    {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="custom-instructions">
              <button
                className="custom-instructions-toggle"
                type="button"
                onClick={() => setDraft({ showCustom: !showCustom })}
                aria-expanded={showCustom}
              >
                <span className={`ci-arrow ${showCustom ? "ci-arrow-open" : ""}`}>▶</span>
                Custom instructions
                {customInstructions.trim() && <span className="ci-dot" />}
              </button>
              {showCustom && (
                <div className="ci-body">
                  <div className="ci-levels">
                    <span className="ci-levels-label">Quick-fill:</span>
                    {Object.keys(SENIORITY_TEMPLATES).map((level) => (
                      <button
                        key={level}
                        type="button"
                        className="ci-level-btn"
                        onClick={() => setDraft({ customInstructions: SENIORITY_TEMPLATES[level] })}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                  <div className="ci-textarea-wrap">
                    <textarea
                      id="custom-instructions"
                      className="ci-textarea"
                      rows={5}
                      placeholder="Add any instructions for the AI… emphasize specific skills, avoid topics, adjust tone, etc. (optional)"
                      value={customInstructions}
                      onChange={(e) => setDraft({ customInstructions: e.target.value })}
                    />
                    {customInstructions && (
                      <button
                        type="button"
                        className="ci-clear"
                        onClick={() => setDraft({ customInstructions: "" })}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
            <button
              className="btn btn-primary btn-block"
              onClick={runTailor}
              disabled={isRunning || jobText.trim().length < 30}
            >
              {isRunning ? "Working…" : "Tailor for this role"}
            </button>
            <button
              className="btn btn-ghost btn-block"
              onClick={runAnalyzeOnly}
              disabled={isRunning || jobText.trim().length < 30}
            >
              {stage === "analyzing" && !analyzeOnlyDone ? "Analyzing…" : "Quick Analyze"}
            </button>
            {error && (
              <div className="form-error">
                {error}
                {cachedAnalysis && (
                  <button className="btn btn-ghost btn-sm retry-btn" onClick={retryTailor}>
                    Retry tailoring
                  </button>
                )}
              </div>
            )}
            <p className="hint">
              The agent reads the posting, then rewrites your master CV for it — using only
              what is truly in your CV. A row is added to your pipeline automatically.
            </p>
          </section>

          <section className="result-col">
            {isRunning && (
              <TailorProgress stage={stage} progress={progress} elapsed={elapsed} />
            )}
            {showPartialAnalysis && <AnalysisCard analysis={cachedAnalysis!} />}
            {cachedAnalysis && analyzeOnlyDone && !result && (
              <>
                <AnalysisCard analysis={cachedAnalysis} />
                <div className="analyze-only-cta">
                  <p>Looks interesting? Tailor your CV for this role.</p>
                  <button className="btn btn-primary" onClick={runTailor}>
                    Tailor CV →
                  </button>
                </div>
              </>
            )}
            {!result && !isRunning && !showPartialAnalysis && !(cachedAnalysis && analyzeOnlyDone) && (
              <div className="placeholder">
                <span className="placeholder-mark" aria-hidden="true" />
                <p>Your tailored CV and fit analysis will appear here.</p>
              </div>
            )}
            {result && (
              <>
                <div className="result-summary card">
                  <FitGauge score={tailored!.fit_score} />
                  <div className="summary-meta">
                    <h2>{analysis!.role_title}</h2>
                    <div className="meta-line">
                      <span className="pill">{analysis!.seniority}</span>
                      <span className="pill ghost">lang: {analysis!.language}</span>
                      {analysis!.domains.slice(0, 2).map((d, i) => (
                        <span key={i} className="pill ghost">
                          {d}
                        </span>
                      ))}
                    </div>
                    <div className="result-download-row">
                      <button className="btn btn-primary" onClick={handleDownloadDocx}>
                        Download .docx
                      </button>
                      <button className="btn btn-ghost" onClick={handleDownloadPdf}>
                        Download PDF
                      </button>
                      <button
                        className="btn btn-ghost"
                        onClick={() => setCoverLetterOpen(true)}
                      >
                        Cover Letter
                      </button>
                    </div>
                    {result && cachedAnalysis && stage === null && (
                      <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setDraft({ showCustom: true });
                            setTimeout(() => {
                              document.getElementById("custom-instructions")?.scrollIntoView({
                                behavior: "smooth",
                                block: "center",
                              });
                            }, 100);
                          }}
                        >
                          Adjust &amp; Re-tailor
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <AnalysisCard analysis={analysis!} />

                {companyBrief && (
                  <div className="card company-brief-card">
                    <h4>About {result!.application.company}</h4>
                    <p className="notes">{companyBrief}</p>
                  </div>
                )}

                <div className="card">
                  <Coverage coverage={tailored!.coverage} />
                </div>

                {(tailored!.match_notes || tailored!.keywords_to_weave_in.length > 0) && (
                  <div className="card notes-card">
                    <h3>Honest read</h3>
                    {tailored!.match_notes && <p className="notes">{tailored!.match_notes}</p>}
                    {tailored!.keywords_to_weave_in.length > 0 && (
                      <>
                        <h5>Keywords you have but under-use</h5>
                        <Tokens items={tailored!.keywords_to_weave_in} kind="mono" />
                      </>
                    )}
                  </div>
                )}

                <div className="card cv-card">
                  <div className="cv-card-head">
                    <h3>Tailored CV</h3>
                    <div className="result-download-row">
                      <button className="btn btn-ghost" onClick={handleDownloadDocx}>
                        Download .docx
                      </button>
                      <button className="btn btn-ghost" onClick={handleDownloadPdf}>
                        Download PDF
                      </button>
                    </div>
                  </div>
                  <CvPreview cv={tailored!} />
                </div>
              </>
            )}
          </section>
        </main>
      ) : (
        <main className="pipeline-page">
          <Pipeline
            applications={apps}
            onPatch={patchApp}
            onDelete={removeApp}
            onOpen={(id) => setDetailAppId(id)}
            loadError={appsError}
            loading={appsLoading}
          />
        </main>
      )}

      <MasterCvDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={(cv) => {
          setMaster(cv);
          setMasterError(null);
        }}
        profile={activeProfile}
        onProfilesChange={(profiles) => {
          setCvProfiles(profiles);
          if (!profiles.includes(activeProfile)) setActiveProfile("default");
        }}
      />

      <ApplicationDetailPanel
        application={detailApp}
        onClose={() => setDetailAppId(null)}
        onPatch={patchApp}
      />

      {result && (
        <CoverLetterModal
          applicationId={result.application.id}
          isOpen={coverLetterOpen}
          onClose={() => setCoverLetterOpen(false)}
        />
      )}

      <ToastStack />
    </div>
  );
}
