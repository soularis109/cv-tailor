import { useEffect, useState } from "react";
import { api, type MasterCv } from "./api";
import type { Application, TailorResponse } from "./types";
import { FitGauge } from "./components/FitGauge";
import { Coverage } from "./components/Coverage";
import { CvPreview } from "./components/CvPreview";
import { Pipeline } from "./components/Pipeline";
import { MasterCvDrawer } from "./components/MasterCvDrawer";

type Tab = "tailor" | "pipeline";

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

export default function App() {
  const [tab, setTab] = useState<Tab>("tailor");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [master, setMaster] = useState<MasterCv | null>(null);
  const [masterError, setMasterError] = useState<string | null>(null);

  const [jobText, setJobText] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TailorResponse | null>(null);

  const [apps, setApps] = useState<Application[]>([]);

  useEffect(() => {
    api
      .getMasterCv()
      .then(setMaster)
      .catch((e) => setMasterError(e.message));
    api.getApplications().then(setApps).catch(() => {});
  }, []);

  async function runTailor() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.tailor(jobText, jobUrl, source);
      setResult(res);
      setApps((prev) => [res.application, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function patchApp(id: string, patch: Partial<Application>) {
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    api.patchApplication(id, patch).catch(() => api.getApplications().then(setApps));
  }

  function removeApp(id: string) {
    setApps((prev) => prev.filter((a) => a.id !== id));
    api.deleteApplication(id).catch(() => api.getApplications().then(setApps));
  }

  const { analysis, tailored } = result ?? {};

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
          {master ? (
            <>
              <span className="master-dot" />
              <span className="master-name">{master.name ?? "Master CV"}</span>
            </>
          ) : (
            <span className="master-name warn">Set up master CV</span>
          )}
        </button>
      </header>

      {masterError && (
        <div className="banner warn">
          Could not load your master CV ({masterError}). Open the master CV panel to add one.
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
              onChange={(e) => setJobText(e.target.value)}
            />
            <div className="field-row">
              <input
                className="text-input"
                placeholder="Job URL (optional)"
                value={jobUrl}
                onChange={(e) => setJobUrl(e.target.value)}
              />
              <input
                className="text-input"
                placeholder="Source (LinkedIn, referral…)"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </div>
            <button
              className="btn btn-primary btn-block"
              onClick={runTailor}
              disabled={loading || jobText.trim().length < 30}
            >
              {loading ? "Tailoring…" : "Tailor for this role"}
            </button>
            {error && <div className="form-error">{error}</div>}
            <p className="hint">
              The agent reads the posting, then rewrites your master CV for it — using only
              what is truly in your CV. A row is added to your pipeline automatically.
            </p>
          </section>

          <section className="result-col">
            {!result ? (
              <div className="placeholder">
                <span className="placeholder-mark" aria-hidden="true" />
                <p>Your tailored CV and fit analysis will appear here.</p>
              </div>
            ) : (
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
                    <button
                      className="btn btn-primary"
                      onClick={() => api.downloadDocx(tailored!)}
                    >
                      Download .docx
                    </button>
                  </div>
                </div>

                <div className="card">
                  <h3>What the role wants</h3>
                  <div className="want-grid">
                    <div>
                      <h5>Must have</h5>
                      <Tokens items={analysis!.must_have} kind="hard" />
                    </div>
                    <div>
                      <h5>Nice to have</h5>
                      <Tokens items={analysis!.nice_to_have} />
                    </div>
                    <div>
                      <h5>Core tech</h5>
                      <Tokens items={analysis!.core_technologies} kind="mono" />
                    </div>
                    <div>
                      <h5>ATS keywords</h5>
                      <Tokens items={analysis!.ats_keywords} kind="mono" />
                    </div>
                  </div>
                  {analysis!.red_flags.length > 0 && (
                    <div className="redflags">
                      <h5>Worth a second look</h5>
                      <ul>
                        {analysis!.red_flags.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

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
                    <button
                      className="btn btn-ghost"
                      onClick={() => api.downloadDocx(tailored!)}
                    >
                      Download .docx
                    </button>
                  </div>
                  <CvPreview cv={tailored!} />
                </div>
              </>
            )}
          </section>
        </main>
      ) : (
        <main className="pipeline-page">
          <Pipeline applications={apps} onPatch={patchApp} onDelete={removeApp} />
        </main>
      )}

      <MasterCvDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={(cv) => {
          setMaster(cv);
          setMasterError(null);
        }}
      />
    </div>
  );
}
