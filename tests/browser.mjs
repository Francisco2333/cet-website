import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { createStaticServer } from "../scripts/serve-static.mjs";
import { runIterationTwoChecks, makeReviewReply } from "./iteration-two-browser.mjs";
import { runTranslationChecks } from "./translation-browser.mjs";

const require = createRequire(import.meta.url);
mkdirSync("test-results", { recursive: true });
let chromium;
try { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright")); }
catch { throw new Error("请通过 PLAYWRIGHT_MODULE 指定已安装的 playwright 或 playwright-core 模块路径。测试不自动下载依赖。 "); }
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const site = createStaticServer({ basePath });
await new Promise((resolve) => site.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${site.address().port}${basePath}`;
let requestCount = 0;
const translationInputs = [];
const api = createServer((req, res) => {
  if (!req.url.startsWith("/blocked/")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    requestCount++;
    assert.equal(req.headers.authorization, "Bearer local-fixture-key");
    assert.equal(JSON.parse(body).model, "fixture-model");
    res.setHeader("Content-Type", "application/json");
    if (req.url.startsWith("/unauthorized/")) { res.writeHead(401).end("{}"); return; }
    if (req.url.startsWith("/quota/")) { res.writeHead(429).end("{}"); return; }
    if (req.url.startsWith("/translation-address/")) { res.writeHead(404).end("{}"); return; }
    if (req.url.startsWith("/translation-model/")) { res.writeHead(400).end("{}"); return; }
    if (req.url.startsWith("/translation-credit/")) { res.writeHead(402).end("{}"); return; }
    const payload = JSON.parse(body);
    let reviewInput;
    try { reviewInput = JSON.parse(payload.messages[1].content); } catch { /* 划词请求是普通文本。 */ }
    if (["writing", "translation"].includes(reviewInput?.kind)) {
      let content = JSON.stringify(makeReviewReply(reviewInput));
      if (req.url.startsWith("/review-format/")) content = "not JSON";
      if (req.url.startsWith("/review-range/")) content = JSON.stringify({ ...makeReviewReply(reviewInput), score: 18 });
      if (req.url.startsWith("/review-fake/")) { const data = makeReviewReply(reviewInput); data.corrections[0].original = "An invented sentence."; content = JSON.stringify(data); }
      const reply = () => { if (!res.destroyed) res.end(JSON.stringify({ choices: [{ message: { content } }] })); };
      if (req.url.startsWith("/review-slow/")) setTimeout(reply, 1800); else reply();
      return;
    }
    if (req.url.startsWith("/translation-")) {
      const selected = payload.messages[1].content;
      translationInputs.push(selected);
      if (req.url.startsWith("/translation-timeout/")) return;
      if (req.url.startsWith("/translation-format/")) { res.end("not JSON"); return; }
      const reply = () => { if (!res.destroyed) res.end(JSON.stringify({ choices: [{ message: { content: `测试译文：${selected.slice(0, 80)}\n${"这是一段用于验证浮层滚动的中文反馈。".repeat(40)}` } }] })); };
      setTimeout(reply, 600);
      return;
    }
    res.end(JSON.stringify({ choices: [{ message: { content: "你好，这是本机兼容接口的测试译文。<img src=x onerror=alert(1)>" } }] }));
  });
});
await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
const apiOrigin = `http://127.0.0.1:${api.address().port}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(12000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const logs = [];
function record(text) { console.log(`通过：${text}`); logs.push(text); }
async function visible(locator) { await locator.waitFor({ state: "visible" }); }
async function selectEnglish() {
  await page.locator(".english-passage").first().evaluate((node) => {
    const range = document.createRange(); range.selectNodeContents(node);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await visible(page.getByRole("region", { name: "划词翻译" }));
}
async function openSettings() { await page.getByRole("button", { name: "AI 设置", exact: true }).first().click(); await visible(page.getByRole("dialog")); }
async function configure(path) {
  await openSettings();
  await page.getByLabel("API Base URL", { exact: true }).fill(`${apiOrigin}/${path}`);
  await page.getByLabel("API Key", { exact: true }).fill("local-fixture-key");
  await page.getByLabel("Model", { exact: true }).fill("fixture-model");
}
try {
  await page.goto(`${origin}/`);
  assert.equal(await page.getByRole("link", { name: "whoamiARC/cet-website", exact: true }).count(), 1);
  assert.equal(await page.locator('script[src*="google"], meta[name="google-adsense-account"]').count(), 0);
  await page.getByRole("link", { name: "进入四级题库", exact: true }).click();
  await visible(page.getByRole("heading", { name: "英语四级题库" }));
  await page.getByRole("link").filter({ hasText: "2025年12月 第1套" }).click();
  await visible(page.getByLabel("PDF 页码", { exact: true }));
  await page.getByLabel("PDF 阅读模式").selectOption("single");
  await page.waitForFunction(() => document.querySelector(".pdf-surface canvas")?.height > 0 && document.querySelector(".textLayer span"));
  assert.equal(await page.getByLabel("计时读数").count(), 0);
  const firstCanvas = await page.locator(".pdf-surface canvas").getAttribute("aria-label");
  await page.locator(".textLayer span").filter({ hasText: "Directions" }).first().evaluate((node) => {
    const range = document.createRange(); range.selectNodeContents(node);
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await visible(page.getByRole("region", { name: "划词翻译" }));
  await page.getByRole("button", { name: "翻译", exact: true }).click();
  await visible(page.getByText("请先在 AI 设置中配置 API", { exact: false }));
  await page.getByRole("button", { name: "关闭翻译" }).click();
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".pdf-surface canvas")?.getAttribute("aria-label")?.includes("第 2 页"));
  assert.notEqual(await page.locator(".pdf-surface canvas").getAttribute("aria-label"), firstCanvas);
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await visible(page.getByRole("button", { name: "适合宽度" }).filter({ hasText: "125%" }));
  for (const title of ["试卷 PDF", "答案 PDF", "听力音频"]) {
    const link = page.getByRole("link", { name: title, exact: true });
    assert.equal((await fetch(await link.getAttribute("href").then((url) => new URL(url, origin)), { method: "HEAD" })).status, 200);
  }
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "试卷 PDF", exact: true }).click();
  assert.match((await downloadPromise).suggestedFilename(), /\.pdf$/);
  record("真实 PDF 在站内渲染、翻页、缩放与文本层；原文件下载有效；计时默认关闭");
  await page.getByRole("button", { name: "已核对题号，开始作答" }).click();
  await page.getByRole("button", { name: /^听力\d/ }).click();
  await page.getByLabel("第 1 题 A", { exact: true }).check();
  await page.getByLabel("试卷听力", { exact: true }).evaluate(async (audio) => { window.__audioUnderTest = audio; await audio.play(); });
  await page.waitForFunction(() => window.__audioUnderTest.currentTime > .3);
  await page.getByLabel("第 2 题 B", { exact: true }).check();
  await page.getByRole("button", { name: /^选词填空\d/ }).click();
  await page.getByLabel("第 26 题 C", { exact: true }).check();
  assert.equal(await page.getByLabel("试卷听力", { exact: true }).evaluate((audio) => audio === window.__audioUnderTest && !audio.paused), true);
  await page.waitForFunction(() => window.__audioUnderTest.currentTime > 1);
  await page.getByLabel("试卷听力", { exact: true }).evaluate((audio) => audio.pause());
  await page.getByRole("button", { name: /^写作\d/ }).click();
  await page.getByLabel("作文答案").fill("I keep a clear record of my daily practice.");
  await page.getByRole("button", { name: /^翻译\d/ }).click();
  await page.getByLabel("翻译答案").fill("Students can learn together.");
  await page.getByRole("button", { name: /^信息匹配\d/ }).click();
  await page.getByLabel("第 36 题段落字母").fill("N");
  await page.getByRole("button", { name: "计时器", exact: true }).click();
  await page.getByRole("button", { name: "开始", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="计时读数"]')?.textContent !== "00:00:00");
  await page.reload();
  await page.getByRole("button", { name: /^写作\d/ }).click();
  assert.equal(await page.getByLabel("作文答案").inputValue(), "I keep a clear record of my daily practice.");
  await visible(page.getByRole("button", { name: "暂停", exact: true }));
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  const paused = await page.getByLabel("计时读数").textContent();
  await page.getByRole("button", { name: /^听力\d/ }).click();
  assert.equal(await page.getByLabel("第 1 题 A", { exact: true }).isChecked(), true);
  await page.waitForTimeout(1100);
  assert.equal(await page.getByLabel("计时读数").textContent(), paused);
  await page.getByRole("button", { name: "提交并检查答案" }).click();
  await visible(page.getByRole("alert").filter({ hasText: "未答" }));
  await page.getByRole("button", { name: "确认提交（含未答题）" }).click();
  await visible(page.getByText("此卷没有可信的结构化答案键", { exact: false }));
  await page.screenshot({ path: "test-results/desktop-light.png", fullPage: true, animations: "disabled" });
  record("真实试卷边听边答不中断；选择、作文、翻译、匹配和运行中的计时可刷新恢复；未答提醒与无伪分数提交");

  await page.goto(`${origin}/practice/sample/`);
  await visible(page.getByLabel("作文答案"));
  await selectEnglish();
  await page.getByRole("button", { name: "翻译", exact: true }).click();
  await visible(page.getByText("请先在 AI 设置中配置 API", { exact: false }));
  assert.equal(requestCount, 0);
  await page.getByRole("button", { name: "关闭翻译" }).click();
  await configure("v1");
  await page.getByRole("button", { name: "测试连接" }).click();
  await visible(page.getByText("连接成功，服务已返回翻译文本。", { exact: true }));
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await selectEnglish();
  await page.getByRole("button", { name: "翻译", exact: true }).click();
  await visible(page.getByText("你好，这是本机兼容接口的测试译文。", { exact: false }));
  assert.equal(await page.locator(".translation-result img").count(), 0);
  assert.ok(requestCount >= 2);
  const before = requestCount;
  await page.getByRole("button", { name: "翻译", exact: true }).click();
  assert.equal(requestCount, before);
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage).includes("local-fixture-key")), false);
  await page.getByRole("button", { name: "关闭翻译" }).click();
  await configure("unauthorized");
  await page.getByRole("button", { name: "测试连接" }).click();
  await visible(page.getByRole("status").filter({ hasText: "认证失败" }));
  await page.getByRole("button", { name: "关闭 AI 设置" }).click();
  await configure("quota"); await page.getByRole("button", { name: "测试连接" }).click();
  await visible(page.getByRole("status").filter({ hasText: "额度不足" }));
  await page.getByRole("button", { name: "关闭 AI 设置" }).click();
  await configure("blocked"); await page.getByRole("button", { name: "测试连接" }).click();
  await visible(page.getByRole("status").filter({ hasText: "CORS" }));
  await page.getByRole("button", { name: "关闭 AI 设置" }).click();
  await page.reload(); await openSettings();
  assert.equal(await page.getByLabel("API Key", { exact: true }).inputValue(), "");
  assert.equal(await page.getByLabel("Model", { exact: true }).inputValue(), "fixture-model");
  await page.getByRole("button", { name: "关闭 AI 设置" }).click();
  record("AI 未配置不发请求；本机兼容 HTTP 服务真实跨域请求、翻译、安全文本渲染、缓存、认证/额度/CORS 失败及密钥刷新清除");

  const sample = require("./register.cjs"); void sample;
  const { SAMPLE_PAPER } = require("../src/lib/sample-paper.ts");
  for (const section of SAMPLE_PAPER.sections) {
    await page.getByRole("button", { name: new RegExp(`^${section.title}\\d`) }).click();
    for (const q of section.questions) {
      if (q.options) await page.getByLabel(`第 ${q.number} 题 ${q.correctAnswer}`, { exact: true }).check();
      else await page.getByLabel(section.kind === "writing" ? "作文答案" : "翻译答案").fill(section.kind === "writing" ? "I learn more by explaining ideas in my own words." : "Clear rules make sharing easier.");
    }
  }
  await page.getByRole("button", { name: "提交并检查答案" }).click();
  await visible(page.getByText("可批改客观题：答对 55 / 55。", { exact: false }));
  await page.reload();
  await visible(page.getByText("可批改客观题：答对 55 / 55。", { exact: false }));
  record("原创 57 项整卷真实填写、55 道客观题批改及提交结果刷新恢复；主观题模拟评分不混入客观题结果");

  await page.getByRole("button", { name: "切换明暗主题" }).click();
  await page.screenshot({ path: "test-results/desktop-dark.png", fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "继续修改作答" }).click();
  await page.getByRole("button", { name: "计时器", exact: true }).click();
  await page.getByLabel("计时模式").selectOption("countdown");
  await page.getByLabel("倒计时分钟数").fill("1");
  await page.getByRole("button", { name: "开始", exact: true }).click();
  await page.evaluate(() => {
    const key = "cet:attempt:cet4:original-complete";
    const data = JSON.parse(localStorage.getItem(key)); data.timer.startedAt = Date.now() - 61000;
    localStorage.setItem(key, JSON.stringify(data));
  });
  await page.reload(); await visible(page.getByText("时间到，可以继续作答，不会自动交卷。"));
  await visible(page.getByRole("button", { name: "提交并检查答案" }));
  await page.getByRole("button", { name: "重置", exact: true }).click();
  assert.equal(await page.getByLabel("计时读数").textContent(), "00:01:00");
  await page.getByRole("button", { name: "关闭计时器" }).click();
  assert.equal(await page.getByLabel("计时读数").count(), 0);
  record("倒计时结束仅提醒、不强制交卷；重置与关闭有效");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /^听力\d/ }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: "test-results/mobile-dark.png", fullPage: false, animations: "disabled" });
  await page.getByRole("button", { name: "切换明暗主题" }).click();
  await page.getByRole("button", { name: "返回试卷查看原题", exact: true }).click();
  await page.screenshot({ path: "test-results/mobile-light.png", fullPage: false, animations: "disabled" });
  await page.goto(`${origin}/library/cet6/2025_12_3/`);
  await visible(page.getByText("此卷未收录听力音频", { exact: false }));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  record("桌面/390px 移动上下布局、明暗主题、返回试卷与缺失音频提示");

  await page.route("**/test.pdf", (route) => route.fulfill({ status: 404, body: "missing" }));
  await page.goto(`${origin}/library/cet4/2025_06_1/`);
  await visible(page.getByRole("alert").filter({ hasText: "PDF 加载失败" }));
  await visible(page.getByRole("link", { name: "打开原文件", exact: true }));
  await page.unroute("**/test.pdf");
  assert.equal((await page.goto(`${origin}/library/cet4/does-not-exist/`)).status(), 404);
  assert.equal((await fetch(`${origin}/ads.txt`)).status, 404);
  assert.equal((await fetch(`${origin}/CNAME`)).status, 404);
  assert.deepEqual(errors, []);
  record("PDF 404 降级可操作、未知试卷返回 404、旧广告文件与域名移除；无页面运行时异常");
  await runIterationTwoChecks({ page, origin, apiOrigin, record, requests: () => requestCount });
  await runTranslationChecks({ page, origin, apiOrigin, record, requests: () => requestCount, inputs: () => translationInputs });
  assert.deepEqual(errors, []);
  writeFileSync("test-results/browser-results.json", JSON.stringify({ basePath, checks: logs, errors, note: "AI 使用本机 HTTP 兼容测试服务，未调用外部真实模型。" }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ url: page.url(), pageErrors: errors, mainText: (await page.locator("main").innerText().catch(() => "")).slice(0, 500) }));
  await page.screenshot({ path: "test-results/failure.png", fullPage: true });
  throw error;
} finally {
  await browser.close(); site.closeAllConnections(); api.closeAllConnections();
  await Promise.all([new Promise((resolve) => site.close(resolve)), new Promise((resolve) => api.close(resolve))]);
}
