"use client";

import { useEffect, useState } from "react";
import { Timer, X } from "lucide-react";
import { elapsedMs, remainingMs, formatTime, newTimer, type StudyTimer as TimerState } from "@/lib/timer";

export function StudyTimer({ value, onChange }: { value: TimerState; onChange: (timer: TimerState) => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!value.enabled) return;
    const update = () => setNow(Date.now());
    const id = setInterval(update, 500);
    document.addEventListener("visibilitychange", update);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", update); };
  }, [value.enabled]);
  if (!value.enabled) return <button className="tool-button" onClick={() => onChange({ ...value, enabled: true })}><Timer size={16} />计时器</button>;
  const finished = value.mode === "countdown" && remainingMs(value, now) === 0;
  function toggle() {
    const time = Date.now();
    setNow(time);
    onChange(value.startedAt === null ? { ...value, startedAt: time } : { ...value, accumulatedMs: elapsedMs(value, time), startedAt: null });
  }
  return <div className="timer-controls">
    <select aria-label="计时模式" disabled={value.startedAt !== null || value.accumulatedMs > 0} value={value.mode} onChange={(e) => onChange({ ...value, mode: e.target.value as TimerState["mode"] })}>
      <option value="countup">正向</option><option value="countdown">倒计时</option>
    </select>
    {value.mode === "countdown" && value.startedAt === null && value.accumulatedMs === 0 && <label className="flex items-center gap-1"><input className="timer-minutes" aria-label="倒计时分钟数" type="number" min="1" max="600" value={value.durationMs / 60000} onChange={(e) => { const n = Number(e.target.value); if (n >= 1 && n <= 600) onChange({ ...value, durationMs: n * 60000 }); }} />分</label>}
    <span className="font-mono tabular-nums text-sm" aria-label="计时读数">{formatTime(value.mode === "countdown" ? remainingMs(value, now) : elapsedMs(value, now))}</span>
    <button className="tool-button" disabled={finished} onClick={toggle}>{value.startedAt !== null ? "暂停" : value.accumulatedMs ? "继续" : "开始"}</button>
    <button className="tool-button" onClick={() => { setNow(Date.now()); onChange({ ...newTimer(), enabled: true, mode: value.mode, durationMs: value.durationMs }); }}>重置</button>
    <button className="tool-button" aria-label="关闭计时器" onClick={() => onChange({ ...value, enabled: false, startedAt: null, accumulatedMs: elapsedMs(value, Date.now()) })}><X size={15} /></button>
    {finished && <p className="w-full text-xs text-primary" role="status">时间到，可以继续作答，不会自动交卷。</p>}
  </div>;
}
