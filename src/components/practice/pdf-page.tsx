"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask, TextLayer } from "pdfjs-dist";

export interface PdfPageState { loading: boolean; hasText: boolean | null; error: boolean }
interface Props {
  document: PDFDocumentProxy;
  page: number;
  width: number;
  defaultRatio: number;
  root: RefObject<HTMLDivElement | null>;
  single: boolean;
  title: string;
  onState: (page: number, state: PdfPageState) => void;
}

export function PdfPage({ document, page, width, defaultRatio, root, single, title, onState }: Props) {
  const slot = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [ratio, setRatio] = useState(defaultRatio);
  const [state, setState] = useState<PdfPageState>({ loading: true, hasText: null, error: false });
  const [retry, setRetry] = useState(0);
  const active = single || near;

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { root: root.current, rootMargin: "350px 0px" });
    if (slot.current) observer.observe(slot.current);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let render: RenderTask | undefined;
    let layer: TextLayer | undefined;
    let proxy: PDFPageProxy | undefined;
    const target = surface.current;
    async function draw() {
      try {
        proxy = await document.getPage(page);
        if (cancelled || !target) { proxy.cleanup(); return; }
        const original = proxy.getViewport({ scale: 1 });
        const scale = width / original.width;
        const viewport = proxy.getViewport({ scale });
        setRatio(original.height / original.width);
        setState({ loading: true, hasText: null, error: false });
        onState(page, { loading: true, hasText: null, error: false });
        const canvas = window.document.createElement("canvas");
        // 每页限制像素预算；高缩放或大屏下避免单个 canvas 过度占用内存。
        const density = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(6000000 / (viewport.width * viewport.height)));
        canvas.width = Math.max(1, Math.floor(viewport.width * density));
        canvas.height = Math.max(1, Math.floor(viewport.height * density));
        canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
        canvas.setAttribute("aria-label", `${title} 第 ${page} 页`);
        const textContainer = window.document.createElement("div");
        textContainer.className = "textLayer"; textContainer.dataset.translatable = "true";
        target.style.setProperty("--total-scale-factor", String(scale));
        target.replaceChildren(canvas, textContainer);
        render = proxy.render({ canvas, viewport, transform: [density, 0, 0, density, 0, 0] });
        await render.promise;
        const text = await proxy.getTextContent();
        if (cancelled) return;
        const { TextLayer } = await import("pdfjs-dist");
        layer = new TextLayer({ textContentSource: text, container: textContainer, viewport });
        await layer.render();
        if (!cancelled) {
          const next = { loading: false, hasText: text.items.some((item) => "str" in item && !!item.str.trim()), error: false };
          setState(next); onState(page, next);
        }
      } catch (e) {
        if (!cancelled && !(e instanceof Error && e.name === "RenderingCancelledException")) {
          const next = { loading: false, hasText: null, error: true };
          setState(next); onState(page, next);
        }
      }
    }
    void draw();
    return () => {
      cancelled = true; render?.cancel(); layer?.cancel();
      // 只保留轻量占位高度；离开预加载区域即释放 canvas 像素和文字节点。
      target?.querySelectorAll("canvas").forEach((canvas) => { canvas.width = 0; canvas.height = 0; });
      target?.replaceChildren();
      if (render) void render.promise.catch(() => {}).finally(() => proxy?.cleanup());
      else proxy?.cleanup();
    };
  }, [active, document, page, width, title, retry, onState]);

  return <div ref={slot} className="pdf-page-slot" data-page={page} style={{ width, height: width * ratio }} aria-label={`PDF 第 ${page} 页`}>
    <div className="pdf-surface" ref={surface} style={{ width, height: width * ratio }} />
    {!active && <span className="pdf-placeholder">第 {page} 页 · 滚动到此处加载</span>}
    {active && state.loading && <span className="pdf-placeholder" role="status">正在加载第 {page} 页…</span>}
    {active && state.error && <div className="pdf-page-error" role="alert">第 {page} 页渲染失败。<button className="tool-button" onClick={() => setRetry(retry + 1)}>重试本页</button></div>}
  </div>;
}
