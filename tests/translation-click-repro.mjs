import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { createStaticServer } from "../scripts/serve-static.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const site = createStaticServer();
let requests = 0, aborted = 0;
const api = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }
  requests++;
  req.resume();
  res.on("close", () => { if (!res.writableEnded) aborted++; });
  setTimeout(() => { if (!res.destroyed) res.end(JSON.stringify({ choices: [{ message: { content: "这是延迟接口返回的中文译文。" } }] })); }, 600);
});
await Promise.all([new Promise((resolve) => site.listen(0, "127.0.0.1", resolve)), new Promise((resolve) => api.listen(0, "127.0.0.1", resolve))]);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const origin = `http://127.0.0.1:${site.address().port}${process.env.NEXT_PUBLIC_BASE_PATH || ""}`;
async function select() {
  await page.locator(".english-passage").first().evaluate((node) => {
    const range = document.createRange(); range.selectNodeContents(node);
    const selected = window.getSelection(); selected.removeAllRanges(); selected.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.getByRole("region", { name: "划词翻译" }).waitFor();
}
try {
  await page.goto(`${origin}/practice/sample/`);
  await select();
  await page.getByRole("region", { name: "划词翻译" }).getByRole("button", { name: /^(AI )?翻译$/ }).click();
  await page.waitForTimeout(400);
  const unconfiguredFeedback = await page.locator(".translation-result").isVisible();
  await page.getByRole("button", { name: "关闭翻译" }).click();
  await page.getByRole("button", { name: "AI 设置", exact: true }).first().click();
  await page.getByLabel("API Base URL", { exact: true }).fill(`http://127.0.0.1:${api.address().port}/v1`);
  await page.getByLabel("API Key", { exact: true }).fill("local-fixture-key");
  await page.getByLabel("Model", { exact: true }).fill("fixture-model");
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await select();
  await page.getByRole("region", { name: "划词翻译" }).getByRole("button", { name: /^(AI )?翻译$/ }).click();
  await page.waitForTimeout(1000);
  const resultVisible = await page.getByText("这是延迟接口返回的中文译文。", { exact: true }).isVisible();
  const observation = { unconfiguredFeedback, requests, aborted, resultVisible };
  console.log(JSON.stringify(observation));
  assert.deepEqual(observation, { unconfiguredFeedback: true, requests: 1, aborted: 0, resultVisible: true });
} finally {
  await browser.close(); site.closeAllConnections(); api.closeAllConnections();
  await Promise.all([new Promise((resolve) => site.close(resolve)), new Promise((resolve) => api.close(resolve))]);
}
