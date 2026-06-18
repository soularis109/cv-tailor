import type { Application } from "../types";

export function daysSince(dateStr: string): number {
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

export function needsFollowUp(app: Application): boolean {
  return app.status === "Applied" && daysSince(app.dateAdded) >= 7;
}
