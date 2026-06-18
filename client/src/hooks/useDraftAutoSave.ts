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
    }
    const { savedAt: _, ...state } = parsed;
    return state;
  } catch {
    return EMPTY;
  }
}

function loadDraftDaysOld(): number | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { savedAt?: string };
    if (!parsed.savedAt) return undefined;
    const days = (Date.now() - new Date(parsed.savedAt).getTime()) / 86_400_000;
    if (days > 7 || days < 1) return undefined;
    return Math.floor(days);
  } catch {
    return undefined;
  }
}

export function useDraftAutoSave() {
  const [draft, setDraftState] = useState<DraftState>(loadDraft);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const daysOldRef = useRef(loadDraftDaysOld());

  useEffect(() => {
    if (daysOldRef.current !== undefined) {
      const d = daysOldRef.current;
      showToast(`Restored a draft from ${d} day${d > 1 ? "s" : ""} ago`, "info");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
