import { useEffect, useState } from "react";
import type { TailoredCv, TailoredExperience, TailoredProject, TailoredEducation } from "../types";

interface Props {
  cv: TailoredCv;
  onSave: (updated: TailoredCv) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

export function CvEditor({ cv, onSave, onCancel, saving }: Props) {
  const [draft, setDraft] = useState<TailoredCv>(cv);
  const [skillsText, setSkillsText] = useState(cv.top_skills.join(", "));
  const [projectTechTexts, setProjectTechTexts] = useState<string[]>(
    cv.projects.map((p) => p.tech.join(", "))
  );

  useEffect(() => {
    setDraft(cv);
    setSkillsText(cv.top_skills.join(", "));
    setProjectTechTexts(cv.projects.map((p) => p.tech.join(", ")));
  }, [cv]);

  async function handleSave() {
    const updated: TailoredCv = {
      ...draft,
      top_skills: skillsText.split(",").map((s) => s.trim()).filter(Boolean),
      projects: draft.projects.map((p, pi) => ({
        ...p,
        tech: projectTechTexts[pi].split(",").map((s) => s.trim()).filter(Boolean),
      })),
    };
    await onSave(updated);
  }

  function updateExp(expIdx: number, field: keyof TailoredExperience, value: string) {
    setDraft((prev) => ({
      ...prev,
      experience: prev.experience.map((exp, ei) =>
        ei === expIdx ? { ...exp, [field]: value } : exp
      ),
    }));
  }

  function updateBullet(expIdx: number, bulletIdx: number, value: string) {
    setDraft((prev) => ({
      ...prev,
      experience: prev.experience.map((exp, ei) => {
        if (ei !== expIdx) return exp;
        return { ...exp, bullets: exp.bullets.map((b, bi) => (bi === bulletIdx ? value : b)) };
      }),
    }));
  }

  function removeBullet(expIdx: number, bulletIdx: number) {
    setDraft((prev) => ({
      ...prev,
      experience: prev.experience.map((exp, ei) => {
        if (ei !== expIdx) return exp;
        return { ...exp, bullets: exp.bullets.filter((_, bi) => bi !== bulletIdx) };
      }),
    }));
  }

  function addBullet(expIdx: number) {
    setDraft((prev) => ({
      ...prev,
      experience: prev.experience.map((exp, ei) =>
        ei === expIdx ? { ...exp, bullets: [...exp.bullets, ""] } : exp
      ),
    }));
  }

  function updateProject(pi: number, field: keyof TailoredProject, value: string) {
    setDraft((prev) => ({
      ...prev,
      projects: prev.projects.map((p, i) => (i === pi ? { ...p, [field]: value } : p)),
    }));
  }

  function updateProjectTech(pi: number, value: string) {
    setProjectTechTexts((prev) => prev.map((t, i) => (i === pi ? value : t)));
  }

  function updateEdu(eduIdx: number, field: keyof TailoredEducation, value: string) {
    setDraft((prev) => ({
      ...prev,
      education: prev.education.map((e, i) => (i === eduIdx ? { ...e, [field]: value } : e)),
    }));
  }

  return (
    <div className="cv-editor">
      <div className="cv-editor-section">
        <label htmlFor="cv-editor-headline">Headline</label>
        <input
          id="cv-editor-headline"
          type="text"
          value={draft.headline}
          onChange={(e) => setDraft((prev) => ({ ...prev, headline: e.target.value }))}
        />
      </div>

      <div className="cv-editor-section">
        <label htmlFor="cv-editor-summary">Summary</label>
        <textarea
          id="cv-editor-summary"
          rows={4}
          value={draft.summary}
          onChange={(e) => setDraft((prev) => ({ ...prev, summary: e.target.value }))}
        />
      </div>

      <div className="cv-editor-section">
        <label htmlFor="cv-editor-skills">Top Skills (через кому)</label>
        <textarea
          id="cv-editor-skills"
          rows={3}
          value={skillsText}
          onChange={(e) => setSkillsText(e.target.value)}
        />
      </div>

      {draft.experience.map((exp, ei) => (
        <div key={ei} className="cv-editor-section">
          <label>Досвід {ei + 1}</label>
          <div className="cv-editor-inline-row">
            <input
              placeholder="Посада"
              value={exp.role}
              onChange={(e) => updateExp(ei, "role", e.target.value)}
            />
            <input
              placeholder="Компанія"
              value={exp.company}
              onChange={(e) => updateExp(ei, "company", e.target.value)}
            />
            <input
              placeholder="Період"
              value={exp.period}
              onChange={(e) => updateExp(ei, "period", e.target.value)}
            />
          </div>
          {exp.bullets.map((bullet, bi) => (
            <div key={bi} className="cv-editor-bullet">
              <textarea
                rows={2}
                value={bullet}
                onChange={(e) => updateBullet(ei, bi, e.target.value)}
              />
              <button
                className="cv-editor-bullet-remove"
                onClick={() => removeBullet(ei, bi)}
                title="Видалити"
              >
                ✕
              </button>
            </div>
          ))}
          <button className="cv-editor-add-bullet" onClick={() => addBullet(ei)}>
            + Додати bullet
          </button>
        </div>
      ))}

      {draft.projects.length > 0 && (
        <>
          {draft.projects.map((proj, pi) => (
            <div key={pi} className="cv-editor-section">
              <label>Проект {pi + 1}</label>
              <input
                placeholder="Назва"
                value={proj.name}
                onChange={(e) => updateProject(pi, "name", e.target.value)}
              />
              <textarea
                rows={2}
                placeholder="Опис"
                value={proj.description}
                onChange={(e) => updateProject(pi, "description", e.target.value)}
              />
              <input
                placeholder="Технології (через кому)"
                value={projectTechTexts[pi] ?? ""}
                onChange={(e) => updateProjectTech(pi, e.target.value)}
              />
              <input
                placeholder="Посилання (необов'язково)"
                value={proj.link ?? ""}
                onChange={(e) => updateProject(pi, "link", e.target.value)}
              />
            </div>
          ))}
        </>
      )}

      {draft.education.length > 0 && (
        <>
          {draft.education.map((edu, ei) => (
            <div key={ei} className="cv-editor-section">
              <label>Освіта {ei + 1}</label>
              <div className="cv-editor-inline-row">
                <input
                  placeholder="Заклад"
                  value={edu.institution}
                  onChange={(e) => updateEdu(ei, "institution", e.target.value)}
                />
                <input
                  placeholder="Ступінь / спеціальність"
                  value={edu.credential}
                  onChange={(e) => updateEdu(ei, "credential", e.target.value)}
                />
                <input
                  placeholder="Роки"
                  value={edu.period}
                  onChange={(e) => updateEdu(ei, "period", e.target.value)}
                />
              </div>
            </div>
          ))}
        </>
      )}

      <div className="cv-editor-actions">
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
          {saving ? "Зберігаємо…" : "Зберегти"}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>
          Скасувати
        </button>
      </div>
    </div>
  );
}
