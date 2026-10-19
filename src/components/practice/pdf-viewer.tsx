"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ChevronLeft, ChevronRight, ExternalLink, Minus, Plus } from "lucide-react";
import { assetUrl } from "@/lib/paths";
import { PdfPage, type PdfPageState } from "./pdf-page";

type ReadingMode = "single" | "continuous" | "spread";
function preferences(): { mode: ReadingMode; height: number } {
  try {
    const saved = JSON.parse(localStorage.getItem("cet:pdf-preferences") || "{}");
    return { mode: ["single", "continuous", "spread"].includes(saved.mode) ? saved.mode : "continuous", height: [400, 560, 720].includes(saved.height) ? saved.height : 560 };
  } catch { return { mode: "continuous", height: 560 }; }
}

export function PdfViewer({ url, title }: { url: string; title: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [settings, setSettings] = useState(preferences);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(600);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [wideScreen, setWideScreen] = useState(false);
  const [ratio, setRatio] = useState(Math.SQRT2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [pageStates, setPageStates] = useState<Record<number, PdfPageState>>({});
  const currentPage = useRef(1);
  const inputFocused = useRef(false);
  const focusColumn = useRef(0);
  const anchor = useRef<{ page: number; fraction: number } | null>(null);
  const frame = useRef(0);
  const columns = settings.mode === "spread" && wideScreen && width >= 560 ? 2 : 1;
  const availableWidth = Math.max(120, (width - 24 - (columns - 1) * 16) / columns);
  const pageWidth = (columns === 2 ? Math.min(availableWidth, Math.max(120, (viewportHeight - 24) / ratio)) : availableWidth) * zoom;

  const preservePosition = useCallback(() => {
    const root = container.current;
    const node = root?.querySelector<HTMLElement>(`[data-page="${currentPage.current}"]`);
    if (!root || !node || !node.offsetHeight) return;
    anchor.current = { page: currentPage.current, fraction: (root.getBoundingClientRect().top + 12 - node.getBoundingClientRect().top) / node.offsetHeight };
  }, []);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) {
        preservePosition(); setWidth(entry.contentRect.width); setViewportHeight(entry.contentRect.height);
        setWideScreen(window.innerWidth >= 900);
      }
    });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, [preservePosition]);

  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<typeof import("pdfjs-dist")["getDocument"]> | undefined;
    async function load() {
      try {
        const pdf = await import("pdfjs-dist");
        if (cancelled) return;
        setLoading(true); setError("");
        pdf.GlobalWorkerOptions.workerSrc = assetUrl("/pdfjs/pdf.worker.min.mjs");
        task = pdf.getDocument({ url, cMapUrl: assetUrl("/pdfjs/cmaps/"), cMapPacked: true, standardFontDataUrl: assetUrl("/pdfjs/standard_fonts/"), wasmUrl: assetUrl("/pdfjs/wasm/"), isEvalSupported: false });
        const loaded = await task.promise;
        const first = await loaded.getPage(1);
        const viewport = first.getViewport({ scale: 1 });
        first.cleanup();
        if (!cancelled) {
          setRatio(viewport.height / viewport.width); setDocument(loaded); setPage(1); setPageInput("1");
          currentPage.current = 1; setPageStates({}); setLoading(false);
        }
      } catch { if (!cancelled) { setLoading(false); setError("PDF 加载失败，可能是文件不存在、网络问题或跨域限制。可重试，或打开/下载原文件。"); } }
    }
    void load();
    return () => { cancelled = true; void task?.destroy(); };
  }, [url, retry]);

  useLayoutEffect(() => {
    const position = anchor.current;
    const root = container.current;
    if (!position || !root || collapsed) return;
    const node = root.querySelector<HTMLElement>(`[data-page="${position.page}"]`);
    if (node) {
      root.scrollTop += node.getBoundingClientRect().top - root.getBoundingClientRect().top - 12 + position.fraction * node.offsetHeight;
      focusColumn.current = (position.page - 1) % columns;
      anchor.current = null;
    }
  }, [settings, zoom, width, viewportHeight, collapsed, columns]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  function saveSettings(next: typeof settings) {
    preservePosition(); setSettings(next);
    try { localStorage.setItem("cet:pdf-preferences", JSON.stringify(next)); } catch { /* 当前页面仍可使用阅读设置。 */ }
  }
  function jump(next: number) {
    if (!document || !Number.isInteger(next) || next < 1 || next > document.numPages) { setPageInput(String(page)); return; }
    currentPage.current = next; focusColumn.current = (next - 1) % columns;
    setPage(next); setPageInput(String(next));
    if (settings.mode !== "single") {
      const root = container.current;
      const node = root?.querySelector<HTMLElement>(`[data-page="${next}"]`);
      if (root && node) root.scrollTop += node.getBoundingClientRect().top - root.getBoundingClientRect().top - 12;
    } else if (container.current) container.current.scrollTop = 0;
  }
  function trackPage() {
    if (settings.mode === "single") return;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const root = container.current;
      if (!root) return;
      const bounds = root.getBoundingClientRect();
      const top = bounds.top + 14;
      const visible = Array.from(root.querySelectorAll<HTMLElement>("[data-page]")).map((node) => {
        const rect = node.getBoundingClientRect();
        return { node, coverage: Math.max(0, Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, top)) / rect.height };
      }).filter((entry) => entry.coverage > 0);
      if (!visible.length) return;
      // 阅读区加高后末行可能无法贴顶，按可见比例选页，避免跳至末页又退回前一行。
      const best = visible.reduce((a, b) => b.coverage > a.coverage || (b.coverage === a.coverage && Number(b.node.dataset.page) === currentPage.current) ? b : a);
      const row = visible.filter((entry) => Math.abs(entry.node.offsetTop - best.node.offsetTop) < 2);
      const next = Number((row[focusColumn.current] || row[0]).node.dataset.page);
      currentPage.current = next; setPage(next);
      if (!inputFocused.current) setPageInput(String(next));
    });
  }
  const onPageState = useCallback((number: number, state: PdfPageState) => {
    setPageStates((previous) => ({ ...previous, [number]: state }));
  }, []);
  const pages = document ? settings.mode === "single" ? [page] : Array.from({ length: document.numPages }, (_, i) => i + 1) : [];
  const state = pageStates[page];

  return <section className="pdf-viewer" aria-label={`${title}在线预览`}>
    <div className="pdf-toolbar">
      <div className="flex items-center flex-wrap gap-2">
        <select className="reading-mode" aria-label="PDF 阅读模式" value={settings.mode} onChange={(e) => saveSettings({ ...settings, mode: e.target.value as ReadingMode })}>
          <option value="single">单页翻页</option><option value="continuous">单列连续</option><option value="spread">双页连续</option>
        </select>
        <div className="flex items-center gap-1">
          <button className="tool-button" aria-label="上一页" disabled={!document || page <= 1 || collapsed} onClick={() => jump(page - 1)}><ChevronLeft size={17} /></button>
          <label className="flex items-center gap-1 text-xs"><input className="page-number" aria-label="PDF 页码" type="number" min="1" max={document?.numPages || 1} value={pageInput} onFocus={() => { inputFocused.current = true; }} onChange={(e) => setPageInput(e.target.value)} onBlur={() => { inputFocused.current = false; jump(Number(pageInput)); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); jump(Number(pageInput)); e.currentTarget.blur(); } }} /><span>/ {document?.numPages ?? "—"}</span></label>
          <button className="tool-button" aria-label="下一页" disabled={!document || page >= document.numPages || collapsed} onClick={() => jump(page + 1)}><ChevronRight size={17} /></button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <button className="tool-button" aria-label="缩小" disabled={zoom <= 0.75 || collapsed} onClick={() => { preservePosition(); setZoom(Math.max(0.75, zoom - 0.25)); }}><Minus size={16} /></button>
        <button className="tool-button text-xs" onClick={() => { preservePosition(); setZoom(1); }} aria-label="适合宽度">{Math.round(zoom * 100)}%</button>
        <button className="tool-button" aria-label="放大" disabled={zoom >= 2.5 || collapsed} onClick={() => { preservePosition(); setZoom(Math.min(2.5, zoom + 0.25)); }}><Plus size={16} /></button>
        <select className="reading-mode" aria-label="预览高度" value={settings.height} onChange={(e) => saveSettings({ ...settings, height: Number(e.target.value) })}><option value={400}>紧凑</option><option value={560}>标准高度</option><option value={720}>加高</option></select>
        <button className="tool-button text-xs" aria-expanded={!collapsed} onClick={() => { preservePosition(); setCollapsed(!collapsed); }}>{collapsed ? "展开预览" : "折叠预览"}</button>
        <a className="tool-button" aria-label="新窗口打开 PDF" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /></a>
        <a className="tool-button text-xs" href={url} download>下载 PDF</a>
      </div>
    </div>
    {error && <div className="p-5 space-y-3 text-sm" role="alert"><p>{error}</p><div className="flex flex-wrap gap-2"><button className="tool-button" onClick={() => setRetry(retry + 1)}>重试加载</button><a className="tool-button" href={url} target="_blank" rel="noopener noreferrer">打开原文件</a><a className="tool-button" href={url} download>下载 PDF</a></div></div>}
    <div ref={container} className="pdf-scroll" data-height={settings.height} hidden={collapsed} onScroll={trackPage} tabIndex={0} role="region" aria-label="PDF 独立滚动阅读区" aria-busy={loading || state?.loading}>
      {loading && !error && <p role="status" className="pdf-loading">正在加载 PDF 页面…</p>}
      <div className="pdf-pages" data-columns={columns} style={{ gridTemplateColumns: `repeat(${columns}, ${pageWidth}px)` }}>
        {document && pages.map((number) => <PdfPage key={number} document={document} page={number} width={pageWidth} defaultRatio={ratio} root={container} single={settings.mode === "single" && !collapsed} title={title} onState={onPageState} />)}
      </div>
    </div>
    <p className="px-4 py-2 text-xs text-muted border-t border-border" role="status">当前第 {page} 页。{settings.mode === "spread" && columns === 1 ? "窄屏已使用单列。" : ""}{state?.hasText === false ? "本页无可选文字（可能为扫描件），无法划词翻译；未执行 OCR。" : "可选文字支持划词翻译和填入主观题原文；扫描页需手动输入。"}</p>
  </section>;
}
