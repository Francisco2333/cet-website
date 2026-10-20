import { restoreAttempt, storageKey } from "./attempt";
import type { PracticePaper } from "./exam";
import { makePracticeRecord, practiceKey, practicePapers, type PracticeRecord } from "./practice-data";

const databaseName = "cet-local-data";
const storeName = "practices";
const pendingPrefix = "cet:practice-pending:v1:";
let database: Promise<IDBDatabase> | undefined;
export interface SaveResult { saved: boolean; warning: string }

function openDatabase(): Promise<IDBDatabase> {
  if (database) return database;
  database = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB 不可用")); return; }
    const request = indexedDB.open(databaseName, 1);
    let settled = false;
    const fail = () => { if (!settled) { settled = true; reject(new Error("本地数据库不可用、被阻止或空间不足。")); } };
    const timeout = setTimeout(fail, 3000);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath: "key" }); };
    request.onerror = request.onblocked = () => { clearTimeout(timeout); fail(); };
    request.onsuccess = () => {
      clearTimeout(timeout);
      if (settled) { request.result.close(); return; }
      settled = true;
      const db = request.result;
      db.onversionchange = () => { db.close(); database = undefined; };
      resolve(db);
    };
  }).catch((error) => { database = undefined; throw error; });
  return database;
}

async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = run(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(new Error("本地数据库操作失败，可能是空间不足或浏览器限制。"));
  });
}

function normalizeRecord(raw: unknown, paper: PracticePaper): PracticeRecord {
  const record = raw as Partial<PracticeRecord> | null;
  if (!record || record.version !== 1 || record.key !== practiceKey(paper) || record.paperId !== paper.id || record.level !== paper.level) throw new Error("本地记录格式或版本无法读取，原记录已保留。");
  return makePracticeRecord(paper, restoreAttempt(record.attempt, paper));
}

// 同步恢复副本用于 pagehide/切页，不依赖关闭页面时异步事务能否完成。
export function stagePractice(record: PracticeRecord): boolean {
  try { localStorage.setItem(pendingPrefix + record.key, JSON.stringify(record)); return true; }
  catch { return false; }
}

export async function savePractice(record: PracticeRecord): Promise<SaveResult> {
  const staged = stagePractice(record);
  try {
    await transaction("readwrite", (store) => store.put(record));
    let warning = staged ? "" : "已保存到本地数据库；localStorage 恢复副本无法写入，请等待自动保存完成再关闭页面。";
    try {
      const key = pendingPrefix + record.key;
      if (localStorage.getItem(key) === JSON.stringify(record)) localStorage.removeItem(key);
      localStorage.removeItem(storageKey({ level: record.level, id: record.paperId }));
    } catch { warning = "已保存到本地数据库；浏览器无法更新关闭时的恢复副本，请勿在“正在保存”时关闭页面。"; }
    return { saved: true, warning };
  } catch {
    return { saved: staged, warning: staged ? "IndexedDB 不可用或空间不足，已保存到此浏览器的 localStorage 恢复副本。请导出备份。" : "自动保存失败：本地数据库和恢复副本均无法写入，可能空间不足或浏览器禁止存储。请立即导出备份，关闭页面会丢失未保存内容。" };
  }
}

export async function loadPractice(paper: PracticePaper): Promise<{ record: PracticeRecord | null; warning: string }> {
  let pending: PracticeRecord | null = null;
  let legacy: string | null = null;
  let localUnavailable = false;
  try {
    const raw = localStorage.getItem(pendingPrefix + practiceKey(paper));
    if (raw) pending = normalizeRecord(JSON.parse(raw), paper);
    legacy = localStorage.getItem(storageKey(paper));
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && error.message.includes("版本"))) throw new Error("本地恢复副本无法读取，未覆盖原记录。请在学习记录中导出可读取的数据，或重试。");
    localUnavailable = true;
  }
  let stored: PracticeRecord | null = null;
  let databaseUnavailable = false;
  try {
    const raw = await transaction("readonly", (store) => store.get(practiceKey(paper)));
    if (raw) stored = normalizeRecord(raw, paper);
  } catch (error) {
    if (error instanceof Error && error.message.includes("版本")) throw error;
    databaseUnavailable = true;
  }
  let record = pending && (!stored || pending.updatedAt >= stored.updatedAt) ? pending : stored;
  if (!record && legacy) {
    let parsed: unknown;
    try { parsed = JSON.parse(legacy); } catch { throw new Error("旧版练习数据无法解析，原始记录已保留，未覆盖。请重试或在学习记录中管理。"); }
    record = makePracticeRecord(paper, restoreAttempt(parsed, paper));
  }
  if (databaseUnavailable && !record) throw new Error("无法读取 IndexedDB，且没有可用恢复副本。为避免覆盖旧记录，请重试；也可主动选择仅在当前页面练习并导出备份。");
  let warning = localUnavailable ? "本地数据库可用，但浏览器禁止访问 localStorage，关闭时的恢复副本无法保证，请等待自动保存完成。" : "";
  if (record && (pending || legacy) && !databaseUnavailable) {
    const saved = await savePractice(record);
    warning = saved.warning;
  }
  if (databaseUnavailable) warning = "IndexedDB 不可用，已从此浏览器的恢复副本读取。请导出备份。";
  return { record, warning };
}

export async function listPractices(): Promise<{ records: PracticeRecord[]; warning: string }> {
  const records = new Map<string, PracticeRecord>();
  const warnings: string[] = [];
  try {
    const raw = await transaction("readonly", (store) => store.getAll());
    for (const item of raw) {
      const paper = practicePapers().find((p) => practiceKey(p) === item.key);
      if (!paper) { warnings.push("存在未知试卷记录，已保留原数据。"); continue; }
      try { records.set(item.key, normalizeRecord(item, paper)); }
      catch { warnings.push(`${paper.title} 的本地记录无法读取，原数据已保留。`); }
    }
  } catch { warnings.push("无法读取 IndexedDB，以下仅显示可读取的恢复副本。请勿清理站点数据。"); }
  for (const paper of practicePapers()) {
    try {
      if (!localStorage.getItem(pendingPrefix + practiceKey(paper)) && !localStorage.getItem(storageKey(paper))) continue;
      const loaded = await loadPractice(paper);
      if (loaded.record) records.set(loaded.record.key, loaded.record);
      if (loaded.warning) warnings.push(loaded.warning);
    } catch { warnings.push(`${paper.title} 的旧记录或恢复副本无法读取，原数据已保留。`); }
  }
  return { records: [...records.values()].sort((a, b) => b.updatedAt - a.updatedAt), warning: [...new Set(warnings)].join(" ") };
}

export async function deletePractices(records?: PracticeRecord[]): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    if (records) for (const record of records) tx.objectStore(storeName).delete(record.key);
    else tx.objectStore(storeName).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(new Error("删除失败，原记录可能仍保留，请重试。"));
  });
  try {
    if (!records) {
      const keys = Object.keys(localStorage).filter((key) => key.startsWith(pendingPrefix) || key.startsWith("cet:attempt:"));
      for (const key of keys) localStorage.removeItem(key);
    }
    for (const record of records ?? []) {
      localStorage.removeItem(pendingPrefix + record.key);
      localStorage.removeItem(storageKey({ level: record.level, id: record.paperId }));
    }
  } catch { throw new Error("数据库记录已删除，但浏览器未允许删除旧副本，请重试清除，避免下次恢复旧数据。"); }
}
