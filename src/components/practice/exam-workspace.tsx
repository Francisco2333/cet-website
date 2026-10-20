"use client";

import Link from "next/link";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { AiSettingsButton } from "@/components/ai-provider";
import { allQuestions, type PracticePaper } from "@/lib/exam";
import { newAttempt, scoreAttempt, type Attempt } from "@/lib/attempt";
import { elapsedMs } from "@/lib/timer";
import { assetUrl } from "@/lib/paths";
import { PdfViewer } from "./pdf-viewer";
import { ListeningPlayer } from "./listening-player";
import { StudyTimer } from "./study-timer";
import { SelectionTranslator } from "./selection-translator";
import { SubjectiveAnswer } from "./subjective-answer";
import type { ReviewKind, SavedReview } from "@/lib/review";
import { usePersistedAttempt } from "./use-persisted-attempt";
import { downloadPracticeBackup, makePracticeRecord } from "@/lib/practice-data";

const subscribe = () => () => {};

export function ExamWorkspace({ paper }: { paper: PracticePaper }) {
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  return <div className="workspace-shell">{ready ? <Workspace key={`${paper.level}:${paper.id}`} paper={paper} /> : <p className="p-8 text-muted" role="status">正在恢复练习记录…</p>}</div>;
}

function Workspace({ paper }: { paper: PracticePaper }) {
  const persistence = usePersistedAttempt(paper);
  if (!persistence.attempt) return <div className="p-8 space-y-3">
    <p role={persistence.loadError ? "alert" : "status"}>{persistence.loadError || "正在恢复练习记录…"}</p>
    {persistence.loadError && <div className="flex flex-wrap gap-2"><button className="tool-button" onClick={persistence.retryLoad}>重试读取</button><button className="tool-button" onClick={persistence.startSession}>仅在当前页面练习</button></div>}
  </div>;
  return <RestoredWorkspace paper={paper} attempt={persistence.attempt} onUpdate={persistence.update} status={persistence.status} warning={persistence.warning} />;
}

function RestoredWorkspace({ paper, attempt, onUpdate, status, warning }: { paper: PracticePaper; attempt: Attempt; onUpdate: (value: Attempt, immediate?: boolean) => void; status: string; warning: string }) {
  const sectionId = attempt.navigation.sectionId;
  const activeQuestion = attempt.navigation.questionId;
  const pdfType = attempt.pdfType;
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submittedNow, setSubmittedNow] = useState(false);
  const [restart, setRestart] = useState(0);
  const scope = useRef<HTMLDivElement>(null);
  const currentAttempt = useRef(attempt);
  const contentPane = useRef<HTMLElement>(null);
  const section = paper.sections.find((s) => s.id === sectionId) ?? paper.sections[0];
  const score = scoreAttempt(paper, attempt.answers);
  const questions = allQuestions(paper);
  const submitted = attempt.submittedAt !== null;
  const canAnswer = paper.mode === "structured" || attempt.confirmedTemplate;
  const sourcePdf = paper.resources[pdfType];
  const activeIndex = questions.findIndex((q) => q.id === activeQuestion);

  const handleUpdate = useCallback((next: Attempt, immediate = false) => {
    currentAttempt.current = next; onUpdate(next, immediate);
  }, [onUpdate]);
  function setPdfType(pdfType: "paper" | "answer") { handleUpdate({ ...currentAttempt.current, pdfType }, true); }
  function handleAnswer(id: string, text: string) {
    const current = currentAttempt.current;
    handleUpdate({ ...current, answers: { ...current.answers, [id]: text } }); setConfirmSubmit(false);
  }
  function handleSource(id: string, text: string) {
    const current = currentAttempt.current;
    handleUpdate({ ...current, sourceTexts: { ...current.sourceTexts, [id]: text } });
  }
  function handleReview(id: string, review: SavedReview) {
    const current = currentAttempt.current;
    handleUpdate({ ...current, reviews: { ...current.reviews, [id]: review }, reviewHistory: { ...current.reviewHistory, [id]: [...(current.reviewHistory[id] ?? []), review] } }, true);
  }
  function navigate(section: string, question?: string) {
    const next = question ?? paper.sections.find((s) => s.id === section)?.questions[0]?.id;
    if (next) {
      handleUpdate({ ...currentAttempt.current, navigation: { sectionId: section, questionId: next } }, true);
      requestAnimationFrame(() => document.getElementById(`question-${next}`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
    }
  }
  function moveQuestion(direction: number) {
    const next = questions[activeIndex + direction];
    const targetSection = paper.sections.find((s) => s.questions.some((q) => q.id === next?.id));
    if (next && targetSection) navigate(targetSection.id, next.id);
  }
  function showPdf() { contentPane.current?.scrollIntoView({ block: "start", behavior: "smooth" }); }
  function handleSelectedSource(kind: ReviewKind, text: string) {
    if (submitted) return;
    const target = paper.sections.find((s) => s.kind === kind);
    if (!target) return;
    const question = target.questions[0];
    handleSource(question.id, text); navigate(target.id, question.id);
  }
  const handleSubmit = useCallback(() => {
    const missing = score.total - score.answered;
    if (missing && !confirmSubmit) { setConfirmSubmit(true); return; }
    const now = Date.now();
    handleUpdate({ ...attempt, submittedAt: now, timer: { ...attempt.timer, accumulatedMs: elapsedMs(attempt.timer, now), startedAt: null } }, true);
    setConfirmSubmit(false); setSubmittedNow(true);
    requestAnimationFrame(() => document.getElementById("practice-result")?.scrollIntoView({ block: "nearest" }));
  }, [attempt, confirmSubmit, handleUpdate, score.answered, score.total]);
  function exportAnswers() {
    downloadPracticeBackup([makePracticeRecord(paper, currentAttempt.current)]);
  }

  return <div ref={scope}>
    <Link className="inline-flex items-center gap-1 text-sm text-muted hover:text-primary mb-5" href={`/library/${paper.level}`}><ArrowLeft size={15} />返回{paper.level === "cet4" ? "四级" : "六级"}题库</Link>
    <header className="workspace-heading">
      <div className="min-w-0"><p className="eyebrow">{paper.level.toUpperCase()} · {paper.mode === "structured" ? "原创结构化练习" : "PDF 配合答题卡"}</p><h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{paper.title}</h1><p className="text-xs text-muted mt-2" role="status">已答 {score.answered} / {score.total} · {status}</p></div>
      <div className="flex flex-wrap gap-2 items-center"><StudyTimer value={attempt.timer} onChange={(timer) => handleUpdate({ ...currentAttempt.current, timer }, true)} /><AiSettingsButton /><Link className="tool-button" href="/records">学习记录</Link></div>
    </header>
    <div className="resource-bar" aria-label="试卷资源下载">
      {([ ["paper", "试卷 PDF"], ["answer", "答案 PDF"], ["audio", "听力音频"] ] as const).map(([key, title]) => paper.resources[key] ? <a className="tool-button text-xs" key={key} href={assetUrl(paper.resources[key]!)} download={`${paper.level}_${paper.id}_${key}.${key === "audio" ? paper.resources.audio?.split(".").pop() : "pdf"}`}><Download size={14} />{title}</a> : paper.mode === "structured" ? null : <span key={key} className="text-xs text-muted px-2">未收录{title}</span>)}
      <span className="ml-auto text-xs text-muted">{paper.mode === "structured" ? "客观题可核对 · 主观题可选 AI 模拟批改" : "可预览 · 可在线作答 · 客观题暂无自动评分"}</span>
    </div>
    {paper.mode === "pdf-card" && !attempt.confirmedTemplate && <div className="notice-box mb-4">
      <p className="font-medium text-sm mb-2">核对题号后开始练习</p>
      <p className="text-sm text-muted leading-6">此卷未导入题干及标准答案。答题卡按 <a className="text-primary underline" href={paper.source} target="_blank" rel="noopener noreferrer">CET 通用结构</a>提供听力 1–25、选词 26–35、匹配 36–45、阅读 46–55，以及写作和翻译。请先核对 PDF；合卷及缺页以原卷为准。匹配题填写原卷的段落字母。</p>
      <button className="primary-button mt-3" onClick={() => { handleUpdate({ ...attempt, confirmedTemplate: true }); navigate(section.id); }}>已核对题号，开始作答</button>
    </div>}
    {paper.mode === "download" && <p className="notice-box mb-4">此卷缺少试卷内容，目前仅支持下载已收录资源。</p>}
    {warning && <p className="notice-box mb-4 text-sm" role="alert">{warning} <button className="underline" onClick={exportAnswers}>导出作答备份</button></p>}

    <ListeningPlayer src={paper.resources.audio ? assetUrl(paper.resources.audio) : undefined} />
    <div className="workspace-grid">
      <section ref={contentPane} className="content-pane" aria-label="试卷内容">
        <div className="pane-heading"><h2 className="font-semibold">{paper.mode === "structured" ? "题目与原文" : "试卷阅读"}</h2><button className="tool-button text-xs" onClick={() => navigate(sectionId, activeQuestion)}>回到作答位置</button></div>
        {paper.mode !== "structured" ? <>
          <div className="flex flex-wrap gap-2 p-3 border-b border-border"><button className="tool-button" aria-pressed={pdfType === "paper"} disabled={!paper.resources.paper} onClick={() => setPdfType("paper")}>试卷</button><button className="tool-button" aria-pressed={pdfType === "answer"} disabled={!paper.resources.answer} onClick={() => setPdfType("answer")}>答案解析</button></div>
          {sourcePdf ? <PdfViewer key={`${sourcePdf}:${restart}`} url={assetUrl(sourcePdf)} title={pdfType === "paper" ? "试卷" : "答案解析"} initialState={attempt.pdf[pdfType]} onStateChange={(state) => handleUpdate({ ...currentAttempt.current, pdf: { ...currentAttempt.current.pdf, [pdfType]: state } })} /> : <p className="p-6 text-muted">未收录此文件。</p>}
        </> : <div className="structured-content" data-translatable>
          <p className="eyebrow">{section.title} · 原创示例</p>
          <h2 className="text-xl font-semibold mb-5">{section.instructions || section.title}</h2>
          {section.passage && <div className="english-passage whitespace-pre-line">{section.passage}</div>}
          {section.questions.map((q) => <div key={q.id} className="mt-6"><p className="english-passage"><span className="text-primary font-semibold mr-2">{q.number ?? section.title}.</span>{q.prompt}</p>{q.options && <ul className="grid gap-1 mt-2 text-sm text-muted">{q.options.map((o) => <li key={o.id}>{o.id}. {o.text}</li>)}</ul>}</div>)}
        </div>}
      </section>

      <section className="answer-pane" aria-label="交互答题区">
        <div className="pane-heading"><h2 className="font-semibold">整卷答题</h2><div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted">{submitted ? "已提交" : "练习中"} · 已答 {score.answered}/{score.total}</span><button className="tool-button text-xs" onClick={showPdf}>返回试卷查看原题</button></div></div>
        <div className="px-4 pt-3"><div className="progress-track" role="progressbar" aria-label="作答进度" aria-valuenow={score.answered} aria-valuemin={0} aria-valuemax={score.total}><div style={{ width: `${score.total ? score.answered / score.total * 100 : 0}%` }} /></div>
          <nav className="section-tabs" aria-label="试卷部分">{paper.sections.map((s) => <button key={s.id} aria-current={sectionId === s.id ? "step" : undefined} className={sectionId === s.id ? "section-tab active" : "section-tab"} onClick={() => { navigate(s.id); setConfirmSubmit(false); }}>{s.title}<span className="ml-1 text-xs opacity-60">{s.questions.filter((q) => attempt.answers[q.id]?.trim()).length}/{s.questions.length}</span></button>)}</nav>
          <div className="question-controls"><h3 className="text-sm font-medium">{section.title}答题区</h3><div className="flex gap-2"><button className="tool-button text-xs" disabled={activeIndex <= 0} onClick={() => moveQuestion(-1)}><ChevronLeft size={14} />上一题</button><button className="tool-button text-xs" disabled={activeIndex >= questions.length - 1} onClick={() => moveQuestion(1)}>下一题<ChevronRight size={14} /></button></div></div>
        </div>
        <div className="answer-fields">
          {section.questions.map((q) => <div key={q.id} id={`question-${q.id}`} data-question-id={q.id} className={`question-field ${activeQuestion === q.id ? "current" : ""}`} onFocusCapture={() => { if (currentAttempt.current.navigation.questionId !== q.id) handleUpdate({ ...currentAttempt.current, navigation: { sectionId, questionId: q.id } }, true); }}>
            <h4 className="text-sm font-medium mb-3">{q.number ? `第 ${q.number} 题` : section.title}<span className="text-muted text-xs font-normal ml-2">{attempt.answers[q.id]?.trim() ? "已答" : "未答"}</span></h4>
            {section.kind === "writing" || section.kind === "translation" ? <SubjectiveAnswer kind={section.kind} level={paper.level} source={attempt.sourceTexts[q.id] ?? ""} answer={attempt.answers[q.id] || ""} review={attempt.reviews[q.id]} history={attempt.reviewHistory[q.id]} readOnly={!canAnswer || submitted || paper.mode === "download"} onSource={(text) => handleSource(q.id, text)} onAnswer={(text) => handleAnswer(q.id, text)} onReview={(review) => handleReview(q.id, review)} /> : <fieldset disabled={!canAnswer || submitted || paper.mode === "download"}>
              <legend className="sr-only">第 {q.number} 题作答</legend>
              {paper.mode === "structured" && q.prompt && <p className="text-sm leading-6 mb-3" data-translatable>{q.prompt}</p>}
              {q.options ? <div className={q.options.length > 4 ? "options-grid many" : "options-grid"}>{q.options.map((o) => <label key={o.id} className={`answer-option ${attempt.answers[q.id] === o.id ? "selected" : ""}`} title={o.text}><input type="radio" name={`answer-${q.id}`} value={o.id} checked={attempt.answers[q.id] === o.id} onChange={() => handleAnswer(q.id, o.id)} aria-label={`第 ${q.number} 题 ${o.id}`} /><span>{o.id}</span>{paper.mode === "structured" && <span className="option-text">{o.text}</span>}</label>)}</div> : <label className="text-sm text-muted">段落字母<input className="text-field mt-1 max-w-24 uppercase" aria-label={`第 ${q.number} 题段落字母`} maxLength={1} value={attempt.answers[q.id] || ""} onChange={(e) => handleAnswer(q.id, e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase())} /></label>}
              {submitted && score.results[q.id] && <p className={`text-sm mt-2 ${score.results[q.id] === "correct" ? "text-success" : "text-danger"}`}>{score.results[q.id] === "correct" ? "正确" : `标准答案：${q.correctAnswer}`} {q.explanation}</p>}
              {!submitted && attempt.answers[q.id] && <button className="text-xs text-muted underline mt-2" onClick={() => handleAnswer(q.id, "")}>清除此题</button>}
            </fieldset>}
          </div>)}
          {!canAnswer && <p className="text-sm text-muted py-4">先核对试卷题号，再点击上方“开始作答”。</p>}
        </div>
        <details className="question-nav" open><summary className="text-sm font-medium cursor-pointer">题号导航 · {score.total - score.answered} 项未答</summary><div className="nav-grid mt-3">{paper.sections.flatMap((s) => s.questions.map((q) => <button className={`question-number ${attempt.answers[q.id]?.trim() ? "answered" : ""} ${score.results[q.id] && submitted ? score.results[q.id] : ""}`} key={q.id} aria-label={`跳到${q.number ? `第 ${q.number} 题` : s.title}${attempt.answers[q.id]?.trim() ? "，已答" : "，未答"}`} onClick={() => navigate(s.id, q.id)}>{q.number ?? s.title}</button>))}</div></details>
        <div className="p-4 border-t border-border space-y-3">
          {confirmSubmit && <p className="text-sm text-danger" role="alert">还有 {score.total - score.answered} 项未答。再次点击提交将保留空题并结束本次练习。</p>}
          {submitted ? <button className="tool-button justify-center" onClick={() => { handleUpdate({ ...attempt, submittedAt: null }); setSubmittedNow(false); }}>继续修改作答</button> : <button className="primary-button justify-center" disabled={!canAnswer || paper.mode === "download"} onClick={handleSubmit}>{confirmSubmit ? "确认提交（含未答题）" : "提交并检查答案"}</button>}
          <button className="tool-button justify-center text-xs ml-2" onClick={exportAnswers}>导出我的作答</button>
          <button className="tool-button text-xs text-danger ml-2" onClick={() => { if (window.confirm("重新开始会清除此卷的答案、草稿、计时和全部 AI 批改记录。确定重新开始？")) { handleUpdate(newAttempt(paper), true); setRestart((n) => n + 1); setConfirmSubmit(false); setSubmittedNow(false); } }}>重新开始练习</button>
        </div>
      </section>
    </div>
    {submitted && <section id="practice-result" className="result-panel mt-5" role={submittedNow ? "status" : undefined}>
      <h2 className="text-lg font-semibold mb-2">练习记录已提交</h2><p className="text-sm">已答 {score.answered} / {questions.length}，未答 {score.total - score.answered}。</p>
      {score.gradable ? <p className="mt-2 text-sm">可批改客观题：答对 {score.correct} / {score.gradable}。这是原创示例的正确数，不是 CET 官方分数。主观题的可选 AI 模拟评分单独显示，不计入本结果。</p> : <p className="mt-2 text-sm text-muted">此卷没有可信的结构化答案键，不提供客观题自动评分。可在预览区切换答案解析自行核对；写作和翻译的可选 AI 模拟评分单独显示。</p>}
      <div className="flex flex-wrap gap-2 mt-3"><button className="tool-button" onClick={() => { setPdfType("answer"); showPdf(); }} disabled={!paper.resources.answer}>查看答案 PDF</button><button className="tool-button" onClick={() => navigate(paper.sections.find((s) => s.questions.some((q) => !attempt.answers[q.id]?.trim()))?.id ?? paper.sections[0].id)}>检查作答</button></div>
    </section>}
    <SelectionTranslator scope={scope} onUseSource={submitted ? undefined : handleSelectedSource} />
  </div>;
}
