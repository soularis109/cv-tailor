import type { TailoredCv } from "../types";

interface Props {
  cv: TailoredCv;
}

export function CvPreview({ cv }: Props) {
  return (
    <article className="cv">
      <header className="cv-head">
        <h2 className="cv-headline">{cv.headline}</h2>
      </header>

      {cv.summary && <p className="cv-summary">{cv.summary}</p>}

      {cv.top_skills.length > 0 && (
        <section className="cv-section">
          <h4 className="cv-h">Skills</h4>
          <div className="tokens">
            {cv.top_skills.map((s, i) => (
              <span key={i} className="token">
                {s}
              </span>
            ))}
          </div>
        </section>
      )}

      {cv.experience.length > 0 && (
        <section className="cv-section">
          <h4 className="cv-h">Experience</h4>
          {cv.experience.map((job, i) => (
            <div key={i} className="cv-job">
              <div className="cv-job-top">
                <span className="cv-role">{job.role}</span>
                <span className="cv-company">{job.company}</span>
                <span className="cv-period">{job.period}</span>
              </div>
              <ul className="cv-bullets">
                {job.bullets.map((b, j) => (
                  <li key={j}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {cv.projects.length > 0 && (
        <section className="cv-section">
          <h4 className="cv-h">Projects</h4>
          {cv.projects.map((p, i) => (
            <div key={i} className="cv-project">
              <div className="cv-project-top">
                <span className="cv-role">{p.name}</span>
                {p.link && (
                  <a href={p.link} target="_blank" rel="noreferrer" className="cv-link">
                    {p.link.replace(/^https?:\/\//, "")}
                  </a>
                )}
              </div>
              <p className="cv-project-desc">{p.description}</p>
              {p.tech.length > 0 && <p className="cv-tech">{p.tech.join(" · ")}</p>}
            </div>
          ))}
        </section>
      )}

      {cv.education.length > 0 && (
        <section className="cv-section">
          <h4 className="cv-h">Education</h4>
          {cv.education.map((e, i) => (
            <p key={i} className="cv-edu">
              <strong>{e.credential}</strong> — {e.institution} · {e.period}
            </p>
          ))}
        </section>
      )}
    </article>
  );
}
