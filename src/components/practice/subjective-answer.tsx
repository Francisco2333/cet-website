"use client";

import { useEffect, useRef, useState } from "react";
import { useAi } from "@/components/ai-provider";
import type { Level } from "@/lib/exam";
import { countEnglishWords, requestReview, reviewIsCurrent, type ReviewKind, type SavedReview } from "@/lib/review";

interface Props {
  kind: ReviewKind;
  level: Level;
  source: string;
  answer: string;
  review?: SavedReview;
  readOnly: boolean;
  onSource: (text: string) => void;
  onAnswer: (text: string) => void;
  onReview: (review: SavedReview) => void;
}

export function SubjectiveAnswer({ kind, level, source, answer, review, readOnly, onSource, onAnswer, onReview }: Props) {
  const { config, openSettings } = useAi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const request = useRef<AbortController | null>(null);
  const writing = kind === "writing";
  const input = { kind, level, source, answer };
  const stale = review && !reviewIsCurrent(review, input);
  const configured = !!(config.apiKey.trim() && config.baseUrl.trim() && config.model.trim());
  const validInput = !!source.trim() && !!answer.trim() && /[A-Za-z]/.test(answer);
  const words = countEnglishWords(answer);
  const minimum = level === "cet4" ? 120 : 150;

  useEffect(() => () => { request.current?.abort(); }, []);

  async function grade() {
    if (request.current || !configured || !validInput) return;
    const controller = new AbortController();
    request.current = controller; setBusy(true); setError("");
    try {
      const result = await requestReview(config, input, controller.signal);
      if (!controller.signal.aborted) onReview({ ...input, result, createdAt: Date.now(), model: config.model });
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "批改失败，原文和答案已保留。");
    } finally {
      if (request.current === controller) { request.current = null; setBusy(false); }
    }
  }
  function cancel() {
    request.current?.abort(); request.current = null;
    setBusy(false); setError("本次批改已取消，题目和作答保持不变。");
  }
  async function copyReference() {
    if (!review) return;
    try { await navigator.clipboard.writeText(review.result.reference); setCopied("已复制参考文本，原答案未改动。"); }
    catch { setCopied("复制失败，可展开参考文本后手动选择复制。"); }
  }
  return <div className="subjective-answer">
    <label className="field-label" htmlFor={`${kind}-source`}>{writing ? "作文要求" : "翻译原文"}</label>
    <textarea id={`${kind}-source`} className="text-field source-input" value={source} readOnly={readOnly} placeholder={writing ? "粘贴或输入 PDF 中的作文题目与要求，不确定时请核对原卷。" : "粘贴或输入需要翻译的完整中文原文。"} onChange={(e) => onSource(e.target.value)} />
    <p className="text-xs text-muted mt-2 mb-5">可手动编辑，或在 PDF 文字层选择文本后填入。扫描页需手动输入，不进行 OCR。</p>
    <label className="field-label" htmlFor={`${kind}-answer`}>{writing ? "英文作文" : "英文译文"}</label>
    <textarea id={`${kind}-answer`} aria-label={writing ? "作文答案" : "翻译答案"} className="text-field essay-input" lang="en" spellCheck value={answer} readOnly={readOnly} placeholder={writing ? "在这里写下你的英文作文，支持分段与换行…" : "在这里写下你的英文译文…"} onChange={(e) => onAnswer(e.target.value)} />
    <p className="text-xs text-muted mt-2" aria-live="polite">英文词数（参考）：{words}{writing ? ` · ${level === "cet4" ? "四级" : "六级"}参考不少于 ${minimum} 词，以具体题目要求为准${words < minimum ? "；当前字数偏少，可继续完善" : ""}` : ""} · 自动保存</p>
    <div className="review-actions">
      <div className="flex flex-wrap items-center gap-2">
        <button className="primary-button" onClick={grade} disabled={!configured || !validInput || busy}>{busy ? "正在批改…" : error ? "重试 AI 批改" : writing ? "AI 批改与修改建议" : "AI 翻译批改"}</button>
        {busy && <button className="tool-button" onClick={cancel}>取消批改</button>}
        {!configured && <button className="tool-button" onClick={openSettings}>配置 AI</button>}
      </div>
      <p className="text-xs text-muted leading-6">AI 模拟评分，非官方成绩。仅在点击时将完整题目和答案发送至你配置的第三方 API，可能产生费用。</p>
      {!configured && <p className="text-xs text-muted">尚未配置 API，输入和保存仍可正常使用。</p>}
      {!validInput && <p className="text-xs text-muted">请填写完整{writing ? "作文要求和英文作文" : "翻译原文和英文译文"}后再批改。</p>}
      {busy && <p className="text-sm text-muted" role="status">正在评价本次题目和答案，最长等待 60 秒；可取消，也可继续编辑。</p>}
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </div>
    {review && <section className={`review-feedback ${stale ? "stale" : ""}`} aria-label={writing ? "作文批改反馈" : "翻译批改反馈"}>
      <div className="review-score"><h3 className="font-semibold">{stale ? "已过期的模拟评分" : "AI 模拟评分"}</h3><span className="font-semibold tabular-nums">{review.result.score}<span className="font-normal text-sm text-muted"> / 15 · {review.result.band}</span></span></div>
      <p className="text-xs text-muted mb-3">上次批改：{new Date(review.createdAt).toLocaleString("zh-CN")} · {review.model} · 非官方成绩</p>
      {stale && <p className="notice-box text-sm mb-4" role="status">题目或答案已修改，以下反馈仅对应旧版本，请重新批改。</p>}
      <h4>评分理由</h4><p>{review.result.reason}</p>
      <h4>{writing ? "优点" : "正确或优秀的表达"}</h4><ul>{review.result.strengths.length ? review.result.strengths.map((text, i) => <li key={i}>{text}</li>) : <li>本次反馈未列出明确优点。</li>}</ul>
      <h4>{writing ? "主要问题" : "遗漏、误译和语言问题"}</h4><ul>{review.result.problems.length ? review.result.problems.map((text, i) => <li key={i}>{text}</li>) : <li>本次反馈未列出主要问题，请仍自行核对。</li>}</ul>
      <h4>具体修改建议</h4>
      {review.result.corrections.length ? review.result.corrections.map((correction, i) => <div className="review-correction" key={i}>
        {correction.sourceQuote && <p><span className="text-muted">中文原文：</span>{correction.sourceQuote}</p>}
        <p><span className="text-muted">原句：</span><q>{correction.original}</q></p>
        <p><span className="text-muted">问题：</span>{correction.issue}</p>
        <p><span className="text-muted">建议表达：</span>{correction.suggestion}</p>
      </div>) : <p>本次未提供逐句修改，参考总体建议。</p>}
      <details className="reference-details"><summary>展开优化参考{writing ? "作文" : "译文"}</summary><p className="whitespace-pre-wrap english-passage mt-3">{review.result.reference}</p><button className="tool-button mt-3" onClick={copyReference}>复制参考{writing ? "作文" : "译文"}</button><p role="status" className="text-xs text-muted">{copied}</p></details>
      <h4>{writing ? "优先提升方向" : "优先改进方向"}</h4><ol>{review.result.priorities.map((text, i) => <li key={i}>{text}</li>)}</ol>
      {review.result.learningPoints && <><h4>可学习的词组与句型</h4><ul>{review.result.learningPoints.map((text, i) => <li key={i}>{text}</li>)}</ul></>}
    </section>}
  </div>;
}
