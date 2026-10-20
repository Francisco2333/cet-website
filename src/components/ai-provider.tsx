"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Settings2, X } from "lucide-react";
import { requestTranslation, type AiConfig } from "@/lib/ai";
import { clearAiSettings, emptyAiConfig, forgetAiKey, readAiSettings, writeAiSettings } from "@/lib/ai-credentials";

const AiContext = createContext({ config: emptyAiConfig, ready: false, openSettings: () => {} });
export const useAi = () => useContext(AiContext);

export function AiProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AiConfig>(emptyAiConfig);
  const [remember, setRemember] = useState(false);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        const saved = readAiSettings(localStorage);
        setConfig(saved.config); setRemember(saved.remember);
      } catch { setStorageError("无法读取本地 AI 配置。普通练习仍可使用；可重新输入配置用于当前页面，或清除已保存配置。"); }
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);
  return <AiContext.Provider value={{ config, ready, openSettings: () => setOpen(true) }}>
    {children}
    {open && ready && <AiSettings config={config} remember={remember} initialError={storageError} onSave={(next, remember) => { setConfig(next); setRemember(remember); setStorageError(""); }} onClose={() => setOpen(false)} />}
  </AiContext.Provider>;
}

export function AiSettingsButton() {
  const { openSettings, ready } = useAi();
  return <button className="tool-button" disabled={!ready} onClick={openSettings}><Settings2 size={16} />AI 设置</button>;
}

function AiSettings({ config, remember, initialError, onSave, onClose }: { config: AiConfig; remember: boolean; initialError: string; onSave: (config: AiConfig, remember: boolean) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [draft, setDraft] = useState(config);
  const [rememberDevice, setRememberDevice] = useState(remember);
  const [status, setStatus] = useState(initialError);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    return () => { controller.current?.abort(); };
  }, []);
  async function testConnection() {
    if (controller.current) return;
    controller.current = new AbortController();
    setBusy(true); setStatus("正在发送一条简短翻译请求…");
    try { await requestTranslation(draft, "Hello.", controller.current.signal); setStatus("连接成功，服务已返回翻译文本。"); }
    catch (error) { setStatus(error instanceof Error ? error.message : "连接失败。"); }
    finally { controller.current = null; setBusy(false); }
  }
  function save() {
    const next = { baseUrl: draft.baseUrl.trim(), model: draft.model.trim(), apiKey: draft.apiKey.trim() };
    try { writeAiSettings(localStorage, next, rememberDevice); }
    catch {
      onSave(next, false);
      setStatus("配置已用于当前页面，但本地保存失败。请检查地址格式、浏览器存储权限或剩余空间；关闭页面后可能需要重新输入。");
      return;
    }
    onSave(next, rememberDevice); onClose();
  }
  function toggleRemember(checked: boolean) {
    if (!checked) {
      try { forgetAiKey(localStorage); }
      catch { setStatus("未能确认清除已保存的 Key，请重试或在浏览器中清除此站点的数据。"); return; }
      onSave(config, false);
      setStatus("已删除持久化 Key；当前页面仍可使用已输入的配置。");
    } else setStatus("点击保存设置后，API 配置将记住在此浏览器。");
    setRememberDevice(checked);
  }
  function clear(keyOnly: boolean) {
    controller.current?.abort();
    try { if (keyOnly) forgetAiKey(localStorage); else clearAiSettings(localStorage); }
    catch { setStatus("清除本地配置失败，请重试或在浏览器中清除此站点的数据。"); return; }
    const next = keyOnly ? { ...draft, apiKey: "" } : { ...emptyAiConfig };
    setDraft(next); setRememberDevice(false); onSave(keyOnly ? { ...config, apiKey: "" } : next, false);
    setStatus(keyOnly ? "已清除持久化和当前页面的 API Key，地址和模型保留。" : "已清除全部 AI 配置，练习记录不受影响。");
  }
  return <dialog ref={dialog} className="app-dialog" aria-labelledby="ai-settings-title" onCancel={onClose} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="flex items-center justify-between gap-4 mb-5"><h2 id="ai-settings-title" className="text-xl font-semibold">AI 设置</h2><button className="tool-button" onClick={onClose} aria-label="关闭 AI 设置"><X size={18} /></button></div>
    <p className="text-sm text-muted mb-5">仅在主动翻译、批改或测试连接时，必要文本与 Key 才会发送至你指定的 API 服务，可能产生费用。普通练习无需配置 AI。</p>
    <p className="text-xs text-muted mb-4">{remember && config.apiKey ? "已保存到此浏览器 · API Key 已记住" : "API Key 仅用于当前页面 · 地址和模型可本地保存"}</p>
    <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4">
      <label className="field-label">API Base URL<input autoFocus className="text-field" type="url" placeholder="https://你的服务地址/v1" value={draft.baseUrl} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} /></label>
      <label className="field-label">API Key<input className="text-field" type="password" autoComplete="off" spellCheck={false} placeholder="填写服务商提供的 API Key" value={draft.apiKey} onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })} /></label>
      <label className="field-label">Model<input className="text-field" placeholder="填写提供商支持的模型名称" value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} /></label>
      <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={rememberDevice} onChange={(e) => toggleRemember(e.target.checked)} />记住此设备上的 API 配置</label>
      <p className="text-xs text-muted leading-6">Key 保存在当前浏览器的独立本地凭据中，不会上传到本网站开发者的服务器，也不包含在练习备份中。浏览器存储不是安全密钥保险库，无法防止 XSS、恶意扩展或共用设备上的他人读取；公共设备不宜启用记住功能。</p>
      <p className="text-xs text-muted leading-6">关闭记住后立即删除持久化 Key，当前页面仍可使用。不同浏览器和设备不共享配置；无痕模式或清理站点数据可能使配置丢失。提供商需允许浏览器 CORS 跨域请求。</p>
      <p className="text-sm leading-6" role="status">{status}</p>
      <div className="flex flex-wrap gap-2"><button type="button" className="tool-button text-danger" onClick={() => clear(true)}>清除已保存的 API Key</button><button type="button" className="tool-button text-danger" onClick={() => clear(false)}>清除全部 AI 配置</button></div>
      <div className="flex gap-2 justify-end"><button type="button" disabled={busy} className="tool-button" onClick={testConnection}>{busy ? "连接中…" : "测试连接"}</button><button type="submit" className="primary-button" disabled={busy}>保存设置</button></div>
    </form>
  </dialog>;
}
