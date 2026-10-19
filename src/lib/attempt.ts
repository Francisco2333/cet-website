import { allQuestions, type PracticePaper } from "./exam";
import { newTimer, type StudyTimer } from "./timer";
import { validateReviewResult, type SavedReview } from "./review";

export interface Attempt {
  version: 1;
  paperRevision: number;
  answers: Record<string, string>;
  sourceTexts: Record<string, string>;
  reviews: Record<string, SavedReview>;
  confirmedTemplate: boolean;
  submittedAt: number | null;
  updatedAt: number;
  timer: StudyTimer;
}
type StorageLike = Pick<Storage, "getItem" | "setItem">;
const storageKey = (paper: PracticePaper) => `cet:attempt:${paper.level}:${paper.id}`;

export function newAttempt(paper: PracticePaper): Attempt {
  const sourceTexts: Record<string, string> = {};
  for (const s of paper.sections) if (s.kind === "writing" || s.kind === "translation") for (const q of s.questions) {
    sourceTexts[q.id] = paper.mode === "structured" ? [s.instructions, q.prompt].filter(Boolean).join("\n\n") : "";
  }
  return { version: 1, paperRevision: paper.revision, answers: {}, sourceTexts, reviews: {}, confirmedTemplate: false, submittedAt: null, updatedAt: 0, timer: newTimer() };
}
export function saveAttempt(storage: StorageLike, paper: PracticePaper, attempt: Attempt): boolean {
  try { storage.setItem(storageKey(paper), JSON.stringify(attempt)); return true; }
  catch { return false; }
}
export function loadAttempt(storage: StorageLike, paper: PracticePaper): Attempt | null {
  try {
    const raw = storage.getItem(storageKey(paper));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Attempt>;
    if (!value || value.version !== 1 || value.paperRevision !== paper.revision || !value.answers || typeof value.answers !== "object") return null;
    const result = newAttempt(paper);
    for (const section of paper.sections) for (const q of section.questions) {
      if (section.kind === "writing" || section.kind === "translation") {
        if (typeof value.sourceTexts?.[q.id] === "string") result.sourceTexts[q.id] = value.sourceTexts[q.id];
        const review = value.reviews?.[q.id];
        if (review && review.kind === section.kind && review.level === paper.level && typeof review.source === "string" && typeof review.answer === "string" && typeof review.model === "string" && Number.isFinite(review.createdAt)) {
          try {
            const validated = validateReviewResult(review.result, review);
            result.reviews[q.id] = { kind: review.kind, level: review.level, source: review.source, answer: review.answer, model: review.model, createdAt: review.createdAt, result: validated };
          } catch { /* 不可信或损坏的评分不影响原文和作答恢复。 */ }
        }
      }
      const answer = value.answers[q.id];
      if (typeof answer !== "string") continue;
      const valid = q.options ? q.options.some((o) => o.id === answer) : section.kind === "matching" ? /^[A-Z]$/.test(answer) : true;
      if (valid) result.answers[q.id] = answer;
    }
    result.confirmedTemplate = value.confirmedTemplate === true;
    result.submittedAt = typeof value.submittedAt === "number" && Number.isFinite(value.submittedAt) ? value.submittedAt : null;
    result.updatedAt = typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt) ? value.updatedAt : 0;
    const t = value.timer;
    if (t && ["countup", "countdown"].includes(t.mode) && typeof t.enabled === "boolean" && Number.isFinite(t.accumulatedMs) && t.accumulatedMs >= 0 && Number.isFinite(t.durationMs) && t.durationMs > 0 && (t.startedAt === null || (typeof t.startedAt === "number" && Number.isFinite(t.startedAt) && t.startedAt >= 0))) result.timer = t;
    return result;
  } catch { return null; }
}

export function scoreAttempt(paper: PracticePaper, answers: Record<string, string>) {
  const questions = allQuestions(paper);
  const gradable = paper.mode === "structured" && paper.answerSource ? questions.filter((q) => q.correctAnswer && q.options) : [];
  const results: Record<string, "correct" | "incorrect" | "unanswered"> = {};
  for (const q of gradable) results[q.id] = !answers[q.id]?.trim() ? "unanswered" : answers[q.id] === q.correctAnswer ? "correct" : "incorrect";
  return {
    total: questions.length,
    answered: questions.filter((q) => answers[q.id]?.trim()).length,
    gradable: gradable.length,
    correct: Object.values(results).filter((r) => r === "correct").length,
    results,
  };
}
