import { restoreAttempt, scoreAttempt, type Attempt } from "./attempt";
import { createTemplate, type Level, type PracticePaper } from "./exam";
import { ALL_EXAMS } from "./library";
import { SAMPLE_PAPER } from "./sample-paper";

export interface PracticeRecord {
  version: 1;
  key: string;
  level: Level;
  paperId: string;
  title: string;
  answered: number;
  total: number;
  updatedAt: number;
  attempt: Attempt;
}
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
export const practiceKey = (paper: Pick<PracticePaper, "level" | "id">) => `${paper.level}:${paper.id}`;
export const practicePapers = () => [SAMPLE_PAPER, ...ALL_EXAMS.map(createTemplate)];
export function practicePaper(level: string, id: string): PracticePaper {
  if (level === SAMPLE_PAPER.level && id === SAMPLE_PAPER.id) return SAMPLE_PAPER;
  const exam = ALL_EXAMS.find((p) => p.level === level && p.id === id);
  if (!exam) throw new Error("备份包含未收录的试卷，未导入。");
  return createTemplate(exam);
}

export function makePracticeRecord(paper: PracticePaper, attempt: Attempt): PracticeRecord {
  const safe = restoreAttempt(attempt, paper);
  const progress = scoreAttempt(paper, safe.answers);
  return { version: 1, key: practiceKey(paper), level: paper.level, paperId: paper.id, title: paper.title, answered: progress.answered, total: progress.total, updatedAt: safe.updatedAt, attempt: safe };
}

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const timestamp = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 8640000000000000;

function validateImportedAttempt(raw: unknown, paper: PracticePaper): Attempt {
  if (!object(raw) || !object(raw.answers)) throw new Error("备份作答字段无效。");
  const attempt = restoreAttempt(raw, paper);
  const questionIds = new Set(paper.sections.flatMap((section) => section.questions.map((question) => question.id)));
  for (const [id, answer] of Object.entries(raw.answers)) if (!questionIds.has(id) || typeof answer !== "string" || answer.length > 500000 || (answer !== "" && attempt.answers[id] !== answer)) throw new Error("备份包含无效题号或答案字段。");
  if (raw.sourceTexts !== undefined) {
    if (!object(raw.sourceTexts)) throw new Error("备份题目字段无效。");
    for (const [id, text] of Object.entries(raw.sourceTexts)) if (typeof text !== "string" || text.length > 500000 || attempt.sourceTexts[id] !== text) throw new Error("备份题目字段无效。");
  }
  if (!timestamp(raw.updatedAt) || (raw.submittedAt !== null && !timestamp(raw.submittedAt)) || typeof raw.confirmedTemplate !== "boolean") throw new Error("备份时间或提交字段无效。");
  const timer = raw.timer;
  if (!object(timer) || Object.keys(attempt.timer).some((key) => timer[key] !== attempt.timer[key as keyof Attempt["timer"]])) throw new Error("备份计时字段无效。");
  for (const field of ["reviews", "reviewHistory"] as const) {
    if (raw[field] === undefined) continue;
    if (!object(raw[field])) throw new Error("备份批改字段无效。");
    for (const [id, value] of Object.entries(raw[field])) {
      const reviews = field === "reviews" ? [value] : value;
      if (!Array.isArray(reviews) || !reviews.every((review) => object(review) && attempt.reviewHistory[id]?.some((item) => item.createdAt === review.createdAt && item.source === review.source && item.answer === review.answer && JSON.stringify(item.result) === JSON.stringify(review.result)))) throw new Error("备份批改字段无效。");
    }
  }
  if (raw.navigation !== undefined && (!object(raw.navigation) || raw.navigation.sectionId !== attempt.navigation.sectionId || raw.navigation.questionId !== attempt.navigation.questionId)) throw new Error("备份当前题号字段无效。");
  if (raw.pdf !== undefined) {
    if (!object(raw.pdf)) throw new Error("备份 PDF 字段无效。");
    for (const [key, value] of Object.entries(raw.pdf)) if (!object(value) || !attempt.pdf[key as "paper" | "answer"] || Object.entries(attempt.pdf[key as "paper" | "answer"]!).some(([field, expected]) => value[field] !== expected)) throw new Error("备份 PDF 字段无效。");
  }
  if (raw.pdfType !== undefined && raw.pdfType !== "paper" && raw.pdfType !== "answer") throw new Error("备份 PDF 类型字段无效。");
  return attempt;
}

export function exportPracticeBackup(records: PracticeRecord[]): string {
  return JSON.stringify({ format: "cet-practice-backup", version: 1, exportedAt: Date.now(), records: records.map((record) => makePracticeRecord(practicePaper(record.level, record.paperId), record.attempt)) }, null, 2);
}

export function parsePracticeBackup(text: string): PracticeRecord[] {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) throw new Error("备份不能超过 10 MB。");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("备份不是有效 JSON。"); }
  if (!object(value)) throw new Error("备份格式无效。");
  let records: unknown[];
  if (value.format === "cet-practice-backup") {
    if (value.version !== 1) throw new Error("不支持此备份版本。");
    if (!Array.isArray(value.records) || value.records.length > practicePapers().length) throw new Error("备份记录字段无效或数量超限。");
    records = value.records;
  } else if (typeof value.paperId === "string" && [1, 2].includes(Number(value.version))) {
    // 兼容工作台此前导出的单卷 answers.json。
    records = [{ version: 1, paperId: value.paperId, level: value.level, attempt: value }];
  } else throw new Error("备份格式或版本无效。");
  const keys = new Set<string>();
  return records.map((record) => {
    if (!object(record) || record.version !== 1 || typeof record.level !== "string" || typeof record.paperId !== "string") throw new Error("备份记录版本或字段无效。");
    const paper = practicePaper(record.level, record.paperId);
    const result = makePracticeRecord(paper, validateImportedAttempt(record.attempt, paper));
    if (keys.has(result.key)) throw new Error("备份包含重复试卷。");
    keys.add(result.key);
    return result;
  });
}

export function downloadPracticeBackup(records: PracticeRecord[]): void {
  const url = URL.createObjectURL(new Blob([exportPracticeBackup(records)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = "cet-practice-backup.json"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
