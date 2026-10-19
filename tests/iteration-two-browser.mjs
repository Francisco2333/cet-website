import assert from "node:assert/strict";

export function makeReviewReply(input) {
  return {
    kind: input.kind, score: 8, band: "中等档", reason: "基本表达了学习习惯，需要改进主谓一致并补充细节。",
    strengths: ["明确表达了每天学习的习惯。"], problems: ["单数主语后的动词形式需检查。"],
    corrections: [{ original: input.answer.split("\n").at(-1), issue: "检查第三人称单数动词。", suggestion: "It helps me study.", ...(input.kind === "translation" ? { sourceQuote: input.source.slice(0, 5) } : {}) }],
    reference: "I learn every day. It helps me study.", priorities: ["先检查主语与谓语的一致。", "再补充具体学习细节。"],
    ...(input.kind === "writing" ? { taskFulfillment: "fulfilled" } : { fidelity: "minor-errors", learningPoints: ["help somebody do something"] }),
  };
}

// 原创无文字测试 PDF，用于长文档资源释放和扫描页降级分支，不写入题库。
function blankPdf(pageCount) {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${pageCount} >>`];
  for (let i = 0; i < pageCount; i++) objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 420] /Resources << >> /Contents ${4 + i * 2} 0 R >>`, "<< /Length 0 >>\nstream\n\nendstream");
  let content = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(content)); content += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = Buffer.byteLength(content);
  content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(content);
}

export async function runIterationTwoChecks({ page, origin, apiOrigin, record, requests }) {
  const visible = (locator) => locator.waitFor({ state: "visible" });
  async function configure(path) {
    await page.getByRole("button", { name: "AI 设置", exact: true }).first().click();
    await page.getByLabel("API Base URL", { exact: true }).fill(`${apiOrigin}/${path}`);
    await page.getByLabel("API Key", { exact: true }).fill("local-fixture-key");
    await page.getByLabel("Model", { exact: true }).fill("fixture-model");
    await page.getByRole("button", { name: "保存设置", exact: true }).click();
  }
  async function jump(number) {
    const input = page.getByLabel("PDF 页码", { exact: true });
    await input.fill(String(number)); await input.press("Enter");
    await page.waitForFunction((n) => document.querySelector(`[data-page="${n}"] canvas`)?.height > 0, number);
  }
  const writingSource = "Write about a study routine that helps you learn. Explain its benefits.";
  const writingAnswer = "I learn every day.\nIt help me study.";
  const translationSource = "我每天学习英语。这个习惯帮助我理解新的知识。";
  const translationAnswer = "I learn English every day.\nThis help me learn.";

  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.evaluate(() => localStorage.removeItem("cet:pdf-preferences"));
  await page.goto(`${origin}/library/cet4/2019_06_1/`);
  await visible(page.getByLabel("PDF 阅读模式"));
  assert.equal(await page.getByLabel("PDF 阅读模式").inputValue(), "continuous");
  await page.waitForFunction(() => document.querySelectorAll(".pdf-page-slot").length === 7);
  assert.equal(await page.locator(".pdf-page-slot").count(), 7);
  await page.waitForFunction(() => document.querySelector('[data-page="1"] canvas')?.height > 0);
  const layout = await page.evaluate(() => ({ contentRight: document.querySelector(".content-pane").getBoundingClientRect().right, answerLeft: document.querySelector(".answer-pane").getBoundingClientRect().left, leftWidth: document.querySelector(".content-pane").clientWidth, rightWidth: document.querySelector(".answer-pane").clientWidth }));
  assert.ok(layout.answerLeft > layout.contentRight);
  assert.ok(layout.leftWidth / (layout.leftWidth + layout.rightWidth) >= .55 && layout.leftWidth / (layout.leftWidth + layout.rightWidth) <= .60);
  assert.ok(await page.getByLabel("PDF 独立滚动阅读区").evaluate((node) => node.scrollHeight > node.clientHeight && node.clientHeight >= innerHeight * .75 && node.clientHeight <= innerHeight * .85));
  await jump(5);
  await page.waitForFunction(() => !document.querySelector('[data-page="1"] canvas'));
  await page.getByLabel("PDF 独立滚动阅读区").evaluate((root) => { root.scrollTop = root.querySelector('[data-page="6"]').offsetTop + 50; });
  await page.waitForFunction(() => document.querySelector('[aria-label="PDF 页码"]').value === "6");
  await page.getByLabel("PDF 阅读模式").selectOption("spread");
  await page.waitForFunction(() => document.querySelector(".pdf-pages").dataset.columns === "2");
  assert.equal(await page.getByLabel("PDF 页码", { exact: true }).inputValue(), "6");
  const spread = await page.locator(".pdf-page-slot").evaluateAll((nodes) => nodes.map((n) => ({ page: n.dataset.page, top: n.offsetTop, left: n.offsetLeft, width: n.offsetWidth, height: n.offsetHeight })));
  assert.equal(spread[0].top, spread[1].top); assert.ok(spread[0].left < spread[1].left);
  assert.equal(spread[2].top, spread[3].top); assert.ok(spread[6].top > spread[5].top);
  await page.waitForFunction(() => document.querySelector('[data-page="6"] canvas')?.height > 0);
  await page.locator(".content-pane").screenshot({ path: "test-results/round-two-pdf-desktop.png", animations: "disabled" });
  await jump(7);
  await page.getByLabel("PDF 阅读模式").selectOption("single");
  await page.waitForFunction(() => document.querySelectorAll(".pdf-page-slot").length === 1 && document.querySelector('.pdf-page-slot').dataset.page === "7");
  await page.getByRole("button", { name: "放大", exact: true }).click();
  assert.equal(await page.getByLabel("PDF 页码", { exact: true }).inputValue(), "7");
  await page.getByRole("button", { name: "适合宽度" }).click();
  await page.getByLabel("PDF 阅读模式").selectOption("spread");
  await page.getByRole("button", { name: "折叠预览" }).click();
  assert.equal(await page.getByLabel("PDF 独立滚动阅读区").isVisible(), false);
  await page.getByRole("button", { name: "展开预览" }).click();
  await visible(page.getByLabel("PDF 独立滚动阅读区"));
  assert.equal(await page.getByLabel("PDF 页码", { exact: true }).inputValue(), "7");
  await page.getByLabel("预览高度").selectOption("400");
  assert.ok(await page.getByLabel("PDF 独立滚动阅读区").evaluate((root) => Math.abs(root.clientHeight - innerHeight * .75) < 2));
  await page.reload(); await visible(page.getByLabel("PDF 阅读模式"));
  assert.equal(await page.getByLabel("PDF 阅读模式").inputValue(), "spread");
  record("真实 7 页 PDF 的连续、单页和双页阅读；跨页/跳页/缩放/模式切换位置、奇数末页、独立滚动、高度与折叠、偏好恢复和桌面双栏布局");

  await page.getByRole("button", { name: "已核对题号，开始作答" }).click();
  await page.getByLabel("试卷听力", { exact: true }).evaluate(async (audio) => { window.__readingAudio = audio; await audio.play(); });
  await page.getByRole("button", { name: /^听力\d/ }).click();
  await page.getByLabel("第 1 题 A", { exact: true }).check();
  await page.getByRole("button", { name: "下一题", exact: true }).click();
  await visible(page.getByLabel("第 2 题 B", { exact: true }));
  await page.getByRole("button", { name: "返回试卷查看原题", exact: true }).click();
  for (const mode of ["continuous", "single", "spread"]) await page.getByLabel("PDF 阅读模式").selectOption(mode);
  await page.getByRole("button", { name: "放大", exact: true }).click();
  assert.equal(await page.getByLabel("试卷听力", { exact: true }).evaluate((audio) => audio === window.__readingAudio && !audio.paused), true);
  await page.getByLabel("试卷听力", { exact: true }).evaluate((audio) => audio.pause());
  await page.getByRole("button", { name: "适合宽度" }).click(); await jump(1);
  await page.locator('[data-page="1"] .textLayer span').filter({ hasText: "Directions" }).first().evaluate((node) => {
    const range = document.createRange(); range.selectNodeContents(node); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); document.dispatchEvent(new Event("selectionchange"));
  });
  await page.getByRole("button", { name: "填入作文要求" }).click();
  assert.ok((await page.getByLabel("作文要求", { exact: true }).inputValue()).length > 5);
  await page.getByLabel("作文要求", { exact: true }).fill(writingSource);
  await page.getByLabel("作文答案", { exact: true }).fill(writingAnswer);
  assert.equal(await page.getByRole("button", { name: "AI 批改与修改建议", exact: true }).isDisabled(), true);
  await page.getByRole("button", { name: /^翻译\d/ }).click();
  await page.getByLabel("翻译原文", { exact: true }).fill(translationSource);
  await page.getByLabel("翻译答案", { exact: true }).fill(translationAnswer);
  await page.reload();
  await page.getByRole("button", { name: /^写作\d/ }).click();
  assert.equal(await page.getByLabel("作文要求", { exact: true }).inputValue(), writingSource);
  assert.equal(await page.getByLabel("作文答案", { exact: true }).inputValue(), writingAnswer);
  await page.getByRole("button", { name: /^翻译\d/ }).click();
  assert.equal(await page.getByLabel("翻译原文", { exact: true }).inputValue(), translationSource);
  assert.equal(await page.getByLabel("翻译答案", { exact: true }).inputValue(), translationAnswer);
  record("阅读模式与答题导航不打断同一个播放器；PDF 选区填入作文要求；作文/翻译原文和多段答案粘贴、编辑、刷新恢复，未配置 AI 仍可作答");

  await configure("v1");
  await page.getByRole("button", { name: "AI 翻译批改", exact: true }).click();
  await visible(page.getByRole("region", { name: "翻译批改反馈" }));
  await visible(page.getByRole("heading", { name: "可学习的词组与句型" }));
  assert.equal(await page.getByLabel("翻译答案", { exact: true }).inputValue(), translationAnswer);
  await page.getByLabel("翻译答案", { exact: true }).fill(translationAnswer + " I will improve it.");
  await visible(page.getByText("题目或答案已修改，以下反馈仅对应旧版本，请重新批改。"));
  await page.getByRole("button", { name: /^写作\d/ }).click();
  await page.getByLabel("作文要求", { exact: true }).fill("");
  const beforeEmpty = requests();
  assert.equal(await page.getByRole("button", { name: "AI 批改与修改建议", exact: true }).isDisabled(), true);
  assert.equal(requests(), beforeEmpty);
  await page.getByLabel("作文要求", { exact: true }).fill(writingSource);
  await page.getByRole("button", { name: "AI 批改与修改建议", exact: true }).click();
  await visible(page.getByRole("region", { name: "作文批改反馈" }));
  await visible(page.getByText("It help me study.", { exact: false }).first());
  await page.getByText("展开优化参考作文", { exact: true }).click();
  assert.equal(await page.getByLabel("作文答案", { exact: true }).inputValue(), writingAnswer);
  await page.getByLabel("作文要求", { exact: true }).fill(writingSource + " Add an example.");
  await visible(page.getByRole("heading", { name: "已过期的模拟评分" }));
  await page.reload(); await page.getByRole("button", { name: /^写作\d/ }).click();
  await visible(page.getByRole("heading", { name: "已过期的模拟评分" }));
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage).includes("local-fixture-key")), false);
  record("作文和翻译独立批改的真实 HTTP 请求、15 分结构化反馈及参考文本；不覆盖原答案；编辑题目/答案后的旧评分过期并随存档恢复；密钥不入存档");

  // 新试卷不带旧结果，用无有效评分的页面验证失败时不会显示分数。
  await page.goto(`${origin}/library/cet6/2019_06_1/`);
  await page.getByRole("button", { name: "已核对题号，开始作答" }).click();
  await page.getByLabel("作文要求", { exact: true }).fill(writingSource);
  await page.getByLabel("作文答案", { exact: true }).fill(writingAnswer);
  for (const [path, message] of [["review-format", "JSON"], ["review-range", "分数"], ["review-fake", "原句"], ["unauthorized", "认证失败"], ["blocked", "CORS"]]) {
    await configure(path);
    await page.getByRole("button", { name: /AI 批改与修改建议|重试 AI 批改/ }).click();
    await visible(page.getByRole("alert").filter({ hasText: message }));
    assert.equal(await page.getByRole("region", { name: "作文批改反馈" }).count(), 0);
    assert.equal(await page.getByLabel("作文答案", { exact: true }).inputValue(), writingAnswer);
  }
  await configure("review-slow");
  const beforeCancel = requests();
  await page.getByRole("button", { name: /AI 批改与修改建议|重试 AI 批改/ }).evaluate((button) => { button.click(); button.click(); });
  await visible(page.getByRole("button", { name: "取消批改", exact: true }));
  await page.getByRole("button", { name: "取消批改", exact: true }).click();
  await visible(page.getByRole("alert").filter({ hasText: "已取消" }));
  assert.ok(requests() - beforeCancel <= 1);
  assert.equal(await page.getByRole("region", { name: "作文批改反馈" }).count(), 0);
  await page.getByRole("button", { name: "重试 AI 批改", exact: true }).click();
  await page.getByLabel("作文答案", { exact: true }).fill(writingAnswer + " Changed while waiting.");
  await visible(page.getByRole("heading", { name: "已过期的模拟评分" }));
  record("无题目不发请求；非 JSON、越界分数、虚构原句、认证/CORS 失败不显示假分数；取消、重试、连续点击防重和请求期间编辑的版本关联");

  await page.getByRole("heading", { name: "已过期的模拟评分" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/round-two-review-desktop-light.png", animations: "disabled" });
  await page.getByRole("button", { name: "切换明暗主题" }).click();
  await page.getByRole("heading", { name: "已过期的模拟评分" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/round-two-review-desktop-dark.png", animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByLabel("作文要求", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/round-two-writing-mobile.png", animations: "disabled" });
  await page.getByRole("button", { name: "返回试卷查看原题", exact: true }).click();
  await page.getByLabel("PDF 阅读模式").selectOption("spread");
  await page.waitForFunction(() => document.querySelector(".pdf-pages").dataset.columns === "1");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: "test-results/round-two-pdf-mobile.png", animations: "disabled" });
  record("桌面与移动端、明暗主题的上下布局和主观题反馈；窄屏双页模式自动单列且页面无横向溢出");

  await page.route("**/test.pdf", (route) => route.fulfill({ status: 200, contentType: "application/pdf", body: blankPdf(60) }));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto(`${origin}/library/cet4/2020_07_1/`);
  await visible(page.getByLabel("PDF 阅读模式"));
  await page.getByLabel("PDF 阅读模式").selectOption("continuous");
  await jump(1);
  await visible(page.getByRole("status").filter({ hasText: "本页无可选文字" }));
  await jump(50);
  await page.waitForFunction(() => !document.querySelector('[data-page="1"] canvas'));
  assert.ok(await page.locator(".pdf-surface canvas").count() <= 6);
  await page.unroute("**/test.pdf");
  record("60 页原创空白 PDF 按需渲染与远页 canvas 释放；无文字页明确降级，不宣称 OCR 或划词可用");
}
