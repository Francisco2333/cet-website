"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Settings2, X } from "lucide-react";
import { requestTranslation, type AiConfig } from "@/lib/ai";

const emptyConfig: AiConfig = { baseUrl: "", model: "", apiKey: "" };
const AiContext = createContext({ config: emptyConfig, openSettings: () => {} });
export const useAi = () => useContext(AiContext);

export function AiProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AiConfig>(emptyConfig);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const task = setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem("cet:ai-preferences") || "{}");
        setConfig({ baseUrl: typeof saved.baseUrl === "string" ? saved.baseUrl : "", model: typeof saved.model === "string" ? saved.model : "", apiKey: "" });
      } catch { /* 本地偏好损坏不影响普通功能。 */ }
    }, 0);
    return () => clearTimeout(task);
  }, []);
  return (
    <AiContext.Provider value={{ config, openSettings: () => setOpen(true) }}>
      {children}
      {open && <AiSettings config={config} onSave={setConfig} onClose={() => setOpen(false)} />}
    </AiContext.Provider>
  );
}

export function AiSettingsButton() {
  const { openSettings } = useAi();
  return <button className="tool-button" onClick={openSettings}><Settings2 size={16} />AI 设置</button>;
}

function AiSettings({ config, onSave, onClose }: { config: AiConfig; onSave: (config: AiConfig) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [draft, setDraft] = useState(config);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    return () => { controller.current?.abort(); };
  }, []);
  async function testConnection() {
    if (controller.current) return;
    controller.current = new AbortController();
    setBusy(true); setStatus("正在发送一条简短翻译请求…");
    try {
      await requestTranslation(draft, "Hello.", controller.current.signal);
      setStatus("连接成功，服务已返回翻译文本。");
    } catch (error) { setStatus(error instanceof Error ? error.message : "连接失败。"); }
    finally { controller.current = null; setBusy(false); }
  }
  function save() {
    onSave({ baseUrl: draft.baseUrl.trim(), model: draft.model.trim(), apiKey: draft.apiKey.trim() });
    try { localStorage.setItem("cet:ai-preferences", JSON.stringify({ baseUrl: draft.baseUrl.trim(), model: draft.model.trim() })); }
    catch { setStatus("配置已用于当前页面，但浏览器不允许保存偏好。"); return; }
    onClose();
  }
  return (
    <dialog ref={dialog} className="app-dialog" aria-labelledby="ai-settings-title" onCancel={onClose} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex items-center justify-between gap-4 mb-5">
        <h2 id="ai-settings-title" className="text-xl font-semibold">AI 设置</h2>
        <button className="tool-button" onClick={onClose} aria-label="关闭 AI 设置"><X size={18} /></button>
      </div>
      <p className="text-sm text-muted mb-5">翻译选区，或批改的题目与答案，将发送到你配置的第三方服务，可能产生费用。普通练习无需配置 AI。</p>
      <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4">
        <label className="field-label">API Base URL<input autoFocus className="text-field" type="url" placeholder="https://你的服务地址/v1" value={draft.baseUrl} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} /></label>
        <label className="field-label">API Key<input className="text-field" type="password" autoComplete="off" spellCheck={false} placeholder="仅保存在当前页面内存" value={draft.apiKey} onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })} /></label>
        <label className="field-label">Model<input className="text-field" placeholder="填写提供商支持的模型名称" value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} /></label>
        <p className="text-xs text-muted leading-6">密钥不写入本地存储，刷新页面后清除。仅保存地址和模型。提供商必须允许浏览器 CORS 跨域请求；不支持时需使用你信任的自建后端，静态站点无法绕过限制。</p>
        <p className="text-sm leading-6" role="status">{status}</p>
        <div className="flex flex-wrap gap-2 justify-between">
          <button type="button" className="tool-button text-danger" onClick={() => { controller.current?.abort(); setDraft({ ...draft, apiKey: "" }); onSave({ ...config, apiKey: "" }); setStatus("内存中的密钥已清除。"); }}>清除密钥</button>
          <div className="flex gap-2"><button type="button" disabled={busy} className="tool-button" onClick={testConnection}>{busy ? "连接中…" : "测试连接"}</button><button type="submit" className="primary-button" disabled={busy}>保存设置</button></div>
        </div>
      </form>
    </dialog>
  );
}
