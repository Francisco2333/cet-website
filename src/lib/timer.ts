export interface StudyTimer {
  enabled: boolean;
  mode: "countup" | "countdown";
  accumulatedMs: number;
  startedAt: number | null;
  durationMs: number;
}
export function newTimer(): StudyTimer {
  return { enabled: false, mode: "countup", accumulatedMs: 0, startedAt: null, durationMs: 30 * 60000 };
}
export function elapsedMs(timer: StudyTimer, now: number): number {
  return timer.accumulatedMs + (timer.startedAt === null ? 0 : Math.max(0, now - timer.startedAt));
}
export function remainingMs(timer: StudyTimer, now: number): number {
  return Math.max(0, timer.durationMs - elapsedMs(timer, now));
}
export function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 3600).toString().padStart(2, "0")}:${Math.floor((seconds % 3600) / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
