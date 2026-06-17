export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  action?: { label: string; onAction: () => void };
}

type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l([...toasts]));
}

export function dismiss(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}

export function showToast(
  message: string,
  type: ToastType = "info",
  opts?: { duration?: number; action?: Toast["action"] },
): string {
  const id = Math.random().toString(36).slice(2);
  toasts = [...toasts, { id, message, type, action: opts?.action }];
  notify();
  const duration = opts?.duration ?? 4500;
  setTimeout(() => dismiss(id), duration);
  return id;
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener([...toasts]);
  return () => listeners.delete(listener);
}
