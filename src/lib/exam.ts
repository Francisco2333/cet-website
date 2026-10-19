export type Level = "cet4" | "cet6";
export type QuestionKind = "listening" | "cloze" | "matching" | "reading" | "translation" | "writing";
export interface Resources { paper?: string; answer?: string; audio?: string }
export interface Question {
  id: string;
  number?: number;
  prompt?: string;
  options?: { id: string; text?: string }[];
  correctAnswer?: string;
  explanation?: string;
  audio?: { start: number; end?: number };
}
export interface ExamSection {
  id: string;
  title: string;
  kind: QuestionKind;
  instructions?: string;
  passage?: string;
  questions: Question[];
}
export interface PracticePaper {
  id: string;
  level: Level;
  year: number;
  title: string;
  revision: number;
  mode: "pdf-card" | "structured" | "download";
  source: string;
  answerSource?: string;
  resources: Resources;
  sections: ExamSection[];
}

export const TEMPLATE_SOURCE = "https://cet.neea.edu.cn/html1/folder/16113/1586-1.htm";
export const letters = (count: number) => Array.from({ length: count }, (_, i) => ({ id: String.fromCharCode(65 + i) }));

export function createTemplate(exam: { level: Level; id: string; year: number; label: string; resources: Resources }): PracticePaper {
  function choices(start: number, count: number, optionCount: number): Question[] {
    return Array.from({ length: count }, (_, i) => ({
      id: String(start + i), number: start + i, options: letters(optionCount),
    }));
  }
  return {
    id: exam.id, level: exam.level, year: exam.year, title: exam.label, revision: 1,
    mode: exam.resources.paper ? "pdf-card" : "download", source: TEMPLATE_SOURCE,
    resources: exam.resources,
    sections: [
      { id: "writing", title: "写作", kind: "writing", questions: [{ id: "writing" }] },
      { id: "listening", title: "听力", kind: "listening", questions: choices(1, 25, 4) },
      { id: "cloze", title: "选词填空", kind: "cloze", questions: choices(26, 10, 15) },
      // 段落数量随卷变化，只记录学习者从 PDF 读到的字母，不虚构段落选项。
      { id: "matching", title: "信息匹配", kind: "matching", questions: Array.from({ length: 10 }, (_, i) => ({ id: String(36 + i), number: 36 + i })) },
      { id: "reading", title: "仔细阅读", kind: "reading", questions: choices(46, 10, 4) },
      { id: "translation", title: "翻译", kind: "translation", questions: [{ id: "translation" }] },
    ],
  };
}

/** 对导入的 JSON 做运行时校验；拒绝不完整结构和无来源的自动评分。 */
export function validatePaper(value: unknown): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== "object") return ["试卷必须是对象"];
  const p = value as Partial<PracticePaper>;
  if (!p.id || !/^[a-zA-Z0-9_-]+$/.test(p.id)) errors.push("试卷 ID 无效");
  if (p.level !== "cet4" && p.level !== "cet6") errors.push("级别无效");
  if (!Number.isInteger(p.year) || !Number.isInteger(p.revision) || typeof p.title !== "string" || !p.title.trim() || typeof p.source !== "string" || !p.source.trim()) errors.push("年份、版本、标题及来源必填");
  if (!["pdf-card", "structured", "download"].includes(p.mode ?? "")) errors.push("模式无效");
  if (!p.resources || typeof p.resources !== "object") errors.push("资源字段必填");
  else for (const url of Object.values(p.resources)) {
    if (typeof url !== "string" || !(/^(https?:\/\/|\/(?!\/))/.test(url))) errors.push("资源 URL 无效");
  }
  if (!Array.isArray(p.sections) || !p.sections.length) return [...errors, "缺少题型"];
  const ids = new Set<string>();
  const numbers = new Set<number>();
  const sectionIds = new Set<string>();
  for (const section of p.sections) {
    if (!section || !section.id || sectionIds.has(section.id)) errors.push("题型 ID 缺失或重复");
    sectionIds.add(section?.id);
    if (!section || !["writing", "translation", "listening", "cloze", "matching", "reading"].includes(section.kind) || !section.title || !Array.isArray(section.questions) || !section.questions.length) {
      errors.push("题型数据不完整"); continue;
    }
    for (const q of section.questions) {
      if (!q || typeof q.id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(q.id)) { errors.push("题号无效"); continue; }
      if (ids.has(q.id) || (q.number !== undefined && numbers.has(q.number))) errors.push(`题号重复：${q.id}`);
      ids.add(q.id);
      if (q.number !== undefined) {
        if (!Number.isInteger(q.number) || q.number < 1) errors.push("题号必须为正整数");
        numbers.add(q.number);
      }
      const subjective = section.kind === "writing" || section.kind === "translation";
      const options = Array.isArray(q.options) ? q.options : [];
      if (p.mode === "structured" && (typeof q.prompt !== "string" || !q.prompt.trim())) errors.push(`题干缺失或类型错误：${q.id}`);
      if (q.explanation !== undefined && typeof q.explanation !== "string") errors.push(`解析须为文本：${q.id}`);
      if (q.options !== undefined && (!Array.isArray(q.options) || options.length < 2 || options.some((o) => !o || typeof o.id !== "string" || !o.id) || new Set(options.map((o) => o?.id)).size !== options.length)) errors.push(`选项无效：${q.id}`);
      if (p.mode === "structured" && !subjective && (!options.length || options.some((o) => typeof o?.text !== "string" || !o.text.trim()))) errors.push(`缺少选项文本：${q.id}`);
      if (q.correctAnswer !== undefined && (subjective || !options.some((o) => o?.id === q.correctAnswer))) errors.push(`标准答案无效：${q.id}`);
      if (q.correctAnswer !== undefined && (p.mode !== "structured" || typeof p.answerSource !== "string" || !p.answerSource.trim())) errors.push("标准答案需要结构化题目和可信来源");
    }
  }
  return errors;
}

export function allQuestions(paper: PracticePaper): Question[] {
  return paper.sections.flatMap((s) => s.questions);
}
