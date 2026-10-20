"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { newAttempt, type Attempt } from "@/lib/attempt";
import type { PracticePaper } from "@/lib/exam";
import { loadPractice, savePractice, stagePractice } from "@/lib/local-store";
import { makePracticeRecord } from "@/lib/practice-data";

export function usePersistedAttempt(paper: PracticePaper) {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [status, setStatus] = useState("正在恢复练习记录…");
  const [warning, setWarning] = useState("");
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const currentAttempt = useRef<Attempt | null>(null);
  const dirty = useRef(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);
  const sessionOnly = useRef(false);

  const flush = useCallback(async () => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!dirty.current || !currentAttempt.current) return;
    const value = currentAttempt.current;
    const record = makePracticeRecord(paper, value);
    if (sessionOnly.current) return;
    const result = await savePractice(record);
    if (mounted.current && currentAttempt.current === value) {
      dirty.current = !result.saved;
      setStatus(result.saved ? "已自动保存" : "自动保存失败");
      setWarning(result.warning);
    }
  }, [paper]);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    void loadPractice(paper).then(({ record, warning }) => {
      if (cancelled) return;
      const value = record?.attempt ?? newAttempt(paper);
      currentAttempt.current = value; setAttempt(value);
      setStatus(record ? "已恢复本地记录" : "作答后自动保存在此浏览器");
      setWarning(warning); setLoadError("");
    }).catch((error) => { if (!cancelled) setLoadError(error instanceof Error ? error.message : "无法读取本地记录，未覆盖原数据。"); });
    const hide = () => {
      if (dirty.current && currentAttempt.current && !sessionOnly.current) stagePractice(makePracticeRecord(paper, currentAttempt.current));
      void flush();
    };
    const visibility = () => { if (document.visibilityState === "hidden") hide(); };
    window.addEventListener("pagehide", hide);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide(); cancelled = true; mounted.current = false;
      window.removeEventListener("pagehide", hide);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [paper, retry, flush]);

  const update = useCallback((next: Attempt, immediate = false) => {
    const value = { ...next, updatedAt: Date.now() };
    currentAttempt.current = value; dirty.current = true; setAttempt(value);
    setStatus(sessionOnly.current ? "仅保存在当前页面，请导出备份" : "正在保存…");
    if (debounce.current) clearTimeout(debounce.current);
    if (immediate) void flush();
    else debounce.current = setTimeout(() => { void flush(); }, 400);
  }, [flush]);

  function startSession() {
    sessionOnly.current = true;
    const value = newAttempt(paper); currentAttempt.current = value; setAttempt(value); setLoadError("");
    setStatus("仅保存在当前页面，请导出备份");
    setWarning("存储不可用：本次练习仅在页面内存中，关闭前请导出备份。原有存储未被覆盖。");
  }
  return { attempt, currentAttempt, update, status, warning, loadError, flush, retryLoad: () => setRetry((n) => n + 1), startSession };
}
