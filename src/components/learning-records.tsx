"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { deletePractices, listPractices, savePractice } from "@/lib/local-store";
import { downloadPracticeBackup, MAX_BACKUP_BYTES, parsePracticeBackup, type PracticeRecord } from "@/lib/practice-data";

export function LearningRecords() {
  const [records, setRecords] = useState<PracticeRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [warning, setWarning] = useState("");
  const [pending, setPending] = useState<{ records: PracticeRecord[]; conflicts: number } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const refresh = useCallback(async () => {
    const result = await listPractices();
    setRecords(result.records); setWarning(result.warning); setReady(true);
    return result.records;
  }, []);
  useEffect(() => {
    void Promise.resolve().then(refresh);
    const focus = () => { void refresh(); };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [refresh]);

  async function remove(record?: PracticeRecord) {
    if (!window.confirm(record ? `删除“${record.title}”的练习、草稿、计时与全部 AI 批改记录？其他试卷不受影响。` : "清除当前浏览器的全部练习、草稿、计时与 AI 批改记录？此操作不可撤销，建议先导出备份。AI 配置和主题会保留。")) return;
    setBusy(true); setMessage("");
    try { await deletePractices(record ? [record] : undefined); await refresh(); setMessage(record ? "已删除此卷记录。" : "已清除全部练习记录。"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "删除失败，请重试。"); await refresh(); }
    finally { setBusy(false); }
  }
  async function prepareImport(selected: File | undefined) {
    if (!selected) return;
    setBusy(true); setMessage(""); setPending(null);
    try {
      if (selected.size > MAX_BACKUP_BYTES) throw new Error("备份不能超过 10 MB。");
      const incoming = parsePracticeBackup(await selected.text());
      if (!incoming.length) throw new Error("备份中没有练习记录。");
      const existing = await refresh();
      setPending({ records: incoming, conflicts: incoming.filter((record) => existing.some((item) => item.key === record.key)).length });
    } catch (error) { setMessage(error instanceof Error ? error.message : "无法读取备份文件。"); }
    finally { setBusy(false); if (file.current) file.current.value = ""; }
  }
  async function importRecords(overwrite: boolean) {
    if (!pending) return;
    setBusy(true); setMessage("");
    let imported = 0;
    try {
      const current = await listPractices();
      if (current.warning) throw new Error("部分现有数据无法读取，为避免未经确认覆盖，暂未导入。请先解决存储问题。");
      const conflicts = pending.records.filter((record) => current.records.some((item) => item.key === record.key));
      if (overwrite && conflicts.length > pending.conflicts) { setPending({ ...pending, conflicts: conflicts.length }); throw new Error("现有记录已变化，请检查冲突数量并重新确认。"); }
      const warnings = new Set<string>();
      for (const record of pending.records) {
        if (!overwrite && conflicts.some((item) => item.key === record.key)) continue;
        const result = await savePractice(record);
        if (!result.saved) throw new Error(result.warning);
        if (result.warning) warnings.add(result.warning);
        imported++;
      }
      setPending(null); setMessage(`已导入 ${imported} 套试卷${!overwrite && conflicts.length ? `，跳过 ${conflicts.length} 套已有记录` : ""}。${[...warnings].join(" ")}`);
    } catch (error) { setMessage(`${imported ? `已保存 ${imported} 套；其余未导入。` : ""}${error instanceof Error ? error.message : "导入失败，请重试。"}`); }
    finally { await refresh(); setBusy(false); }
  }
  return <div className="max-w-5xl mx-auto px-4 py-10">
    <p className="eyebrow">保存在此浏览器</p><h1 className="text-3xl font-semibold mb-4">学习记录</h1>
    <p className="text-sm text-muted leading-7 mb-6">无需账号。记录只保存在当前浏览器；清理站点数据、无痕模式、更换浏览器或设备可能使记录无法访问，也不会自动同步。建议定期导出备份。本站不控制浏览器自身的同步机制或扩展对本地数据的访问。</p>
    <div className="flex flex-wrap gap-2 mb-5">
      <button className="tool-button" disabled={!ready || busy || !records.length} onClick={() => { try { downloadPracticeBackup(records); } catch { setMessage("导出失败，请重试。"); } }}><Download size={16} />导出练习备份</button>
      <button className="tool-button" disabled={!ready || busy} onClick={() => file.current?.click()}><Upload size={16} />导入 JSON 备份</button>
      <input className="sr-only" aria-label="选择练习备份文件" ref={file} type="file" accept=".json,application/json" onChange={(e) => { void prepareImport(e.target.files?.[0]); }} />
      <button className="tool-button text-danger" disabled={!ready || busy || (!records.length && !warning)} onClick={() => { void remove(); }}>清除全部练习记录</button>
    </div>
    <p className="text-xs text-muted mb-6">备份包含作答、草稿、批改、计时和阅读位置，不包含 API Key 或 AI 配置。支持本网站旧版单卷作答备份，文件上限 10 MB。</p>
    {warning && <p className="notice-box text-sm mb-5" role="alert">{warning}</p>}
    {message && <p className="notice-box text-sm mb-5" role="status">{message}</p>}
    {pending && <section className="notice-box mb-5 space-y-3" aria-label="确认导入">
      <p className="text-sm">已验证 {pending.records.length} 套试卷，其中 {pending.conflicts} 套已有记录。覆盖将替换这些试卷的答案、草稿和批改历史。</p>
      <ul className="text-xs text-muted space-y-1">{pending.records.map((record) => <li key={record.key}>{record.level === "cet4" ? "四级" : "六级"} · {record.title} · {new Date(record.updatedAt).toLocaleString("zh-CN")}</li>)}</ul>
      <div className="flex flex-wrap gap-2"><button className="primary-button" disabled={busy} onClick={() => { void importRecords(false); }}>{pending.conflicts ? "仅导入新试卷" : "确认导入"}</button>{pending.conflicts > 0 && <button className="tool-button text-danger" disabled={busy} onClick={() => { void importRecords(true); }}>确认覆盖 {pending.conflicts} 套已有记录并导入</button>}<button className="tool-button" disabled={busy} onClick={() => setPending(null)}>取消导入</button></div>
    </section>}
    {!ready ? <p role="status" className="text-muted">正在读取本地学习记录…</p> : records.length ? <ul className="grid gap-4">
      {records.map((record) => <li className="panel p-5 flex flex-wrap items-center justify-between gap-4" key={record.key}>
        <div className="min-w-0"><p className="text-xs text-primary mb-2">{record.level === "cet4" ? "四级" : "六级"} · {record.attempt.submittedAt !== null ? "已提交" : "练习中"}</p><h2 className="font-semibold">{record.title}</h2><p className="text-xs text-muted mt-2 leading-6">已答 {record.answered} / {record.total} · 上次练习：{record.updatedAt ? new Date(record.updatedAt).toLocaleString("zh-CN") : "旧版记录未保存时间"}</p></div>
        <div className="flex gap-2"><Link className="primary-button" href={record.paperId === "original-complete" ? "/practice/sample" : `/library/${record.level}/${record.paperId}`}>继续练习</Link><button className="tool-button text-danger" disabled={busy} aria-label={`删除${record.title}记录`} onClick={() => { void remove(record); }}>删除</button></div>
      </li>)}
    </ul> : <div className="panel p-8 text-sm text-muted">此浏览器暂无练习记录。<Link href="/library/cet4" className="text-primary underline ml-2">前往题库</Link></div>}
  </div>;
}
