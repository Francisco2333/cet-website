import { allQuestions, type PracticePaper } from "./exam";
import { newTimer, type StudyTimer } from "./timer";
import { validateReviewResult, type SavedReview } from "./review";

export interface Attempt {
  version: 2;
  paperRevision: number;
  answers: Record<string, string>;
  sourceTexts: Record<string, string>;
  reviews: Record<string, SavedReview>;
  reviewHistory: Record<string, SavedReview[]>;
  navigation: { sectionId: string; questionId: string };
  pdf: Partial<Record<"paper" | "answer", PdfReadingState>>;
  pdfType: "paper" | "answer";
  confirmedTemplate: boolean;
  submittedAt: number | null;
  updatedAt: number;
  timer: StudyTimer;
}
export interface PdfReadingState {
  mode: "single" | "continuous" | "spread";
  height: number;
  page: number;
  zoom: number;
  fraction: number;
  scrollLeft: number;
}
type StorageLike = Pick<Storage, "getItem" | "setItem">;
export const storageKey = (paper: Pick<PracticePaper, "level" | "id">) => `cet:attempt:${paper.level}:${paper.id}`;

export function newAttempt(paper: PracticePaper): Attempt {
  const sourceTexts: Record<string, string> = {};
  for (const s of paper.sections) if (s.kind === "writing" || s.kind === "translation") for (const q of s.questions) {
    sourceTexts[q.id] = paper.mode === "structured" ? [s.instructions, q.prompt].filter(Boolean).join("\n\n") : "";
  }
  return { version: 2, paperRevision: paper.revision, answers: {}, sourceTexts, reviews: {}, reviewHistory: {}, navigation: { sectionId: paper.sections[0]?.id ?? "", questionId: paper.sections[0]?.questions[0]?.id ?? "" }, pdf: {}, pdfType: "paper", confirmedTemplate: false, submittedAt: null, updatedAt: 0, timer: newTimer() };
}
export function saveAttempt(storage: StorageLike, paper: PracticePaper, attempt: Attempt): boolean {
  try { storage.setItem(storageKey(paper), JSON.stringify(attempt)); return true; }
  catch { return false; }
}
export function loadAttempt(storage: StorageLike, paper: PracticePaper): Attempt | null {
  try {
    const raw = storage.getItem(storageKey(paper));
    if (!raw) return null;
    return restoreAttempt(JSON.parse(raw), paper);
  } catch { return null; }
}

export function restoreAttempt(raw: unknown, paper: PracticePaper): Attempt {
    const value = raw as Partial<Omit<Attempt, "version">> & { version?: number };
    if (!value || ![1, 2].includes(value.version ?? 0) || value.paperRevision !== paper.revision || !value.answers || typeof value.answers !== "object" || Array.isArray(value.answers)) throw new Error("练习数据版本或试卷版本不兼容，原记录已保留，请先导出备份。");
    const result = newAttempt(paper);
    for (const section of paper.sections) for (const q of section.questions) {
      if (section.kind === "writing" || section.kind === "translation") {
        if (typeof value.sourceTexts?.[q.id] === "string") result.sourceTexts[q.id] = value.sourceTexts[q.id];
        const candidates = [...(Array.isArray(value.reviewHistory?.[q.id]) ? value.reviewHistory[q.id] : []), ...(value.reviews?.[q.id] ? [value.reviews[q.id]] : [])];
        for (const review of candidates) if (review && review.kind === section.kind && review.level === paper.level && typeof review.source === "string" && typeof review.answer === "string" && typeof review.model === "string" && Number.isFinite(review.createdAt)) {
          try {
            const validated = validateReviewResult(review.result, review);
            const safe = { kind: review.kind, level: review.level, source: review.source, answer: review.answer, model: review.model, createdAt: review.createdAt, result: validated };
            const history = result.reviewHistory[q.id] ?? [];
            if (!history.some((item) => item.createdAt === safe.createdAt && item.source === safe.source && item.answer === safe.answer)) history.push(safe);
            result.reviewHistory[q.id] = history;
            result.reviews[q.id] = safe;
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
    if (t && ["countup", "countdown"].includes(t.mode) && typeof t.enabled === "boolean" && Number.isFinite(t.accumulatedMs) && t.accumulatedMs >= 0 && Number.isFinite(t.durationMs) && t.durationMs > 0 && (t.startedAt === null || (typeof t.startedAt === "number" && Number.isFinite(t.startedAt) && t.startedAt >= 0))) result.timer = { enabled: t.enabled, mode: t.mode, accumulatedMs: t.accumulatedMs, durationMs: t.durationMs, startedAt: t.enabled ? t.startedAt : null };
    const section = paper.sections.find((s) => s.id === value.navigation?.sectionId);
    if (section) result.navigation = { sectionId: section.id, questionId: section.questions.find((q) => q.id === value.navigation?.questionId)?.id ?? section.questions[0]?.id ?? "" };
    for (const kind of ["paper", "answer"] as const) {
      const pdf = value.pdf?.[kind];
      if (pdf && ["single", "continuous", "spread"].includes(pdf.mode) && [400, 560, 720].includes(pdf.height) && Number.isInteger(pdf.page) && pdf.page >= 1 && pdf.page <= 10000 && Number.isFinite(pdf.zoom) && pdf.zoom >= 0.75 && pdf.zoom <= 2.5 && Number.isFinite(pdf.fraction) && Math.abs(pdf.fraction) <= 10 && Number.isFinite(pdf.scrollLeft) && pdf.scrollLeft >= 0) result.pdf[kind] = { mode: pdf.mode, height: pdf.height, page: pdf.page, zoom: pdf.zoom, fraction: pdf.fraction, scrollLeft: pdf.scrollLeft };
    }
    if (value.pdfType === "answer") result.pdfType = "answer";
    return result;
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
