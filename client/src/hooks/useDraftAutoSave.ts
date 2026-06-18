import { useState, useEffect, useRef } from "react";
import { showToast } from "../utils/toast";

export interface DraftState {
  jobText: string;
  jobUrl: string;
  source: string;
  customInstructions: string;
  showCustom: boolean;
}

const STORAGE_KEY = "cv-tailor:draft";
const EMPTY: DraftState = {
  jobText: "",
  jobUrl: "",
  source: "",
  customInstructions: "",
  showCustom: false,
};

function loadDraft(): DraftState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as DraftState & { savedAt?: string };
    if (parsed.savedAt) {
      const days = (Date.now() - new Date(parsed.savedAt).getTime()) / 86_400_000;
      if (days > 7) return EMPTY;
      if (days >= 1) {
        showToast(
          `Restored a draft from ${Math.floor(days)} day${Math.floor(days) > 1 ? "s" : ""} ago`,
          "info"
        );
      }
    }
    const { savedAt: _, ...state } = parsed;
    return state;
  } catch {
    return EMPTY;
  }
}

export function useDraftAutoSave() {
  const [draft, setDraftState] = useState<DraftState>(loadDraft);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...draft, savedAt: new Date().toISOString() })
      );
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [draft]);

  function setDraft(updates: Partial<DraftState>) {
    setDraftState((prev) => ({ ...prev, ...updates }));
  }

  function clearDraft() {
    localStorage.removeItem(STORAGE_KEY);
    setDraftState(EMPTY);
  }

  return { draft, setDraft, clearDraft };
}
