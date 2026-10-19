"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Languages, X } from "lucide-react";
import { useAi } from "@/components/ai-provider";
import { requestTranslation, MAX_TRANSLATION_LENGTH } from "@/lib/ai";
import type { ReviewKind } from "@/lib/review";

export function SelectionTranslator({ scope, onUseSource }: { scope: RefObject<HTMLDivElement | null>; onUseSource?: (kind: ReviewKind, text: string) => void }) {
  const { config, openSettings } = useAi();
  const [selection, setSelection] = useState<{ text: string; x: number; y: number; pdf: boolean } | null>(null);
  const selectedText = useRef("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const cache = useRef(new Map<string, string>());
  const popup = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let task: ReturnType<typeof setTimeout>;
    function inspect(event: Event) {
      // 弹窗内部点击/选字不属于新的题目选区，不能清除状态或取消当前请求。
      if (event.target instanceof Node && popup.current?.contains(event.target)) return;
      clearTimeout(task);
      task = setTimeout(() => {
        const selected = window.getSelection();
        if (!selected || selected.isCollapsed || !selected.rangeCount) return;
        const node = selected.anchorNode?.parentElement;
        const end = selected.focusNode?.parentElement;
        if (!node || !end || !scope.current?.contains(node) || !scope.current.contains(end) || !node.closest("[data-translatable]") || !end.closest("[data-translatable]")) return;
        const text = selected.toString().trim();
        if (!text || !/[a-zA-Z\u3400-\u9fff]/.test(text)) return;
        const rect = selected.getRangeAt(0).getBoundingClientRect();
        if (selectedText.current !== text) {
          controller.current?.abort(); controller.current = null;
          setBusy(false); setResult(""); setError("");
        }
        selectedText.current = text;
        setSelection({ text, pdf: !!node.closest(".textLayer") && !!end.closest(".textLayer"), x: Math.max(12, Math.min(rect.left, window.innerWidth - 344)), y: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 420)) });
      }, 150);
    }
    function outside(e: PointerEvent) {
      if (popup.current?.contains(e.target as Node)) return;
      controller.current?.abort(); controller.current = null;
      selectedText.current = ""; setBusy(false); setSelection(null);
    }
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { controller.current?.abort(); controller.current = null; selectedText.current = ""; setBusy(false); setSelection(null); } };
    const reposition = () => setSelection((previous) => previous ? { ...previous, x: Math.max(12, Math.min(previous.x, window.innerWidth - 344)), y: Math.max(12, Math.min(previous.y, window.innerHeight - 420)) } : null);
    document.addEventListener("selectionchange", inspect);
    document.addEventListener("pointerup", inspect);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", reposition);
    return () => {
      clearTimeout(task); controller.current?.abort();
      document.removeEventListener("selectionchange", inspect); document.removeEventListener("pointerup", inspect);
      document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", reposition);
    };
  }, [scope]);

  async function translate() {
    const text = selectedText.current;
    if (!text || controller.current) return;
    if (!config.apiKey.trim() || !config.baseUrl.trim() || !config.model.trim()) { setError("请先在 AI 设置中配置 API 信息。"); return; }
    if (text.length > MAX_TRANSLATION_LENGTH) { setError("一次最多翻译 2000 个字符，请缩短选区。"); return; }
    const key = `${config.baseUrl}:${config.model}:${text}`;
    if (cache.current.has(key)) { setResult(cache.current.get(key)!); setError(""); return; }
    const current = new AbortController();
    controller.current = current;
    setBusy(true); setError("");
    try {
      const translated = await requestTranslation(config, text, current.signal);
      if (current.signal.aborted) return;
      cache.current.set(key, translated); setResult(translated);
    } catch (e) { if (!current.signal.aborted) setError(e instanceof Error ? e.message : "翻译失败。"); }
    finally { if (controller.current === current) { controller.current = null; setBusy(false); } }
  }
  if (!selection) return null;
  function fillSource(kind: ReviewKind) {
    if (!selection || !onUseSource) return;
    onUseSource(kind, selection.text); selectedText.current = ""; setSelection(null); window.getSelection()?.removeAllRanges();
  }
  return <div ref={popup} role="region" aria-label="划词翻译" className="translation-popover" style={{ left: selection.x, top: selection.y }}>
    <div className="flex items-center justify-between gap-2">
      <button className="tool-button text-primary" disabled={busy} onPointerDown={(e) => e.preventDefault()} onClick={translate}><Languages size={15} />{busy ? "翻译中…" : error ? "重试翻译" : "翻译"}</button>
      <button className="tool-button" aria-label="关闭翻译" onClick={() => { controller.current?.abort(); controller.current = null; selectedText.current = ""; setBusy(false); setSelection(null); window.getSelection()?.removeAllRanges(); }}><X size={16} /></button>
    </div>
    {selection.pdf && onUseSource && <div className="selection-source-actions"><button className="tool-button text-xs" onPointerDown={(e) => e.preventDefault()} onClick={() => fillSource("writing")}>填入作文要求</button><button className="tool-button text-xs" onPointerDown={(e) => e.preventDefault()} onClick={() => fillSource("translation")}>填入翻译原文</button></div>}
    {(busy || error || result) && <div className="translation-result" aria-live="polite">
      {busy && <p className="text-muted" role="status">正在请求你的 AI 服务…</p>}
      {error && <p className="text-danger" role="alert">{error}</p>}
      {(!config.apiKey.trim() || !config.baseUrl.trim() || !config.model.trim()) && error && <button className="tool-button mt-2" onClick={openSettings}>打开 AI 设置</button>}
      {result && <p className="whitespace-pre-wrap">{result}</p>}
    </div>}
  </div>;
}
