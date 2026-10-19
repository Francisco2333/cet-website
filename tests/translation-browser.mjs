import assert from "node:assert/strict";

export async function runTranslationChecks({ page, origin, apiOrigin, record, requests, inputs }) {
  const visible = (locator) => locator.waitFor({ state: "visible" });
  const popup = page.getByRole("region", { name: "划词翻译" });
  async function configure(path) {
    await page.getByRole("button", { name: "AI 设置", exact: true }).first().click();
    await page.getByLabel("API Base URL", { exact: true }).fill(`${apiOrigin}/${path}`);
    await page.getByLabel("API Key", { exact: true }).fill("local-fixture-key");
    await page.getByLabel("Model", { exact: true }).fill("fixture-model");
    await page.getByRole("button", { name: "保存设置", exact: true }).click();
  }
  async function select(kind = "word") {
    await page.getByRole("button", { name: "返回试卷查看原题", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-page="1"] .textLayer span'));
    const text = await page.locator('[data-page="1"] .textLayer').evaluate((layer, type) => {
      const spans = Array.from(layer.querySelectorAll("span")).filter((span) => span.textContent.trim());
      const index = spans.findIndex((span) => span.textContent.includes("Directions"));
      const first = spans[index];
      const range = document.createRange();
      if (type === "word") {
        const node = first.firstChild, match = node.textContent.match(/[A-Za-z]+/);
        range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length);
      } else {
        const last = spans[Math.min(index + 3, spans.length - 1)];
        range.setStart(first.firstChild, 0); range.setEnd(last.lastChild, last.lastChild.textContent.length);
      }
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
      return selection.toString().trim();
    }, kind);
    await visible(popup);
    return text;
  }
  async function clickTranslate() { await popup.getByRole("button", { name: /^(翻译|重试翻译)$/ }).click(); }
  async function close() { await page.getByRole("button", { name: "关闭翻译", exact: true }).click(); }

  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto(`${origin}/library/cet4/2025_12_1/`);
  await page.getByLabel("PDF 阅读模式").selectOption("single");
  const draftBefore = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((key) => key.startsWith("cet:attempt:")).map((key) => [key, localStorage.getItem(key)])));
  const initialRequests = requests();
  await select(); await clickTranslate();
  await visible(popup.getByRole("alert").filter({ hasText: "请先在 AI 设置中配置 API 信息。" }));
  await page.waitForTimeout(400);
  assert.equal(await popup.getByRole("alert").isVisible(), true);
  assert.equal(requests(), initialRequests);
  await popup.getByRole("button", { name: "打开 AI 设置", exact: true }).click();
  await visible(page.getByRole("dialog"));
  await page.getByRole("button", { name: "关闭 AI 设置", exact: true }).click();
  record("PDF 划词未配置 API 时即时提示、400ms 后仍保留、不发请求，且设置入口可用");

  await configure("translation-slow");
  await page.getByLabel("试卷听力", { exact: true }).evaluate(async (audio) => { window.__translationAudio = audio; await audio.play(); });
  for (const kind of ["word", "sentence"]) {
    const selected = await select(kind);
    assert.ok(kind === "word" ? /^[A-Za-z]+$/.test(selected) : selected.length > 40);
    const before = requests();
    await clickTranslate();
    assert.equal(await page.evaluate(() => window.getSelection().toString().trim()), selected);
    await visible(popup.getByRole("status"));
    await page.waitForTimeout(250);
    assert.equal(await popup.getByRole("status").isVisible(), true);
    await visible(popup.getByText(`测试译文：${selected.slice(0, 80)}`, { exact: false }));
    assert.equal(requests(), before + 1);
    assert.equal(inputs().at(-1), selected);
    await popup.locator(".translation-result").evaluate((node) => { node.scrollTop = 80; });
    await page.waitForTimeout(200);
    assert.equal(await popup.isVisible(), true);
    await page.screenshot({ path: `test-results/translation-${kind}-desktop.png`, animations: "disabled" });
    await close();
  }
  record("PDF 英文单词及跨行句子真实 POST；600ms 延迟请求保留加载状态并展示真实响应，按钮点击不丢选区、滚动译文不关闭浮层");

  await page.route(`${apiOrigin}/translation-network/**`, (route) => route.abort("failed"));
  for (const [path, message] of [["unauthorized", "认证失败"], ["translation-address", "Base URL"], ["translation-model", "Model"], ["translation-credit", "额度不足"], ["quota", "额度不足"], ["translation-network", "网络"], ["blocked", "CORS"], ["translation-format", "JSON"]]) {
    await configure(path); await select(); await clickTranslate();
    await visible(popup.getByRole("alert").filter({ hasText: message }));
    await page.waitForTimeout(300);
    assert.equal(await popup.getByRole("alert").isVisible(), true);
    assert.equal(await popup.getByText("测试译文：", { exact: false }).count(), 0);
    assert.equal(await popup.getByRole("button", { name: "重试翻译", exact: true }).isEnabled(), true);
    await close();
  }
  await page.unroute(`${apiOrigin}/translation-network/**`);
  record("划词翻译认证、地址/模型、额度/频率、网络、CORS 和异常返回均有持久错误及重试按钮，不显示伪造译文");

  await configure("translation-timeout");
  await select();
  // 推进浏览器时间触发真实请求层的 25 秒超时，不修改生产超时参数。
  await page.clock.install();
  await clickTranslate();
  await visible(popup.getByRole("status"));
  await page.clock.fastForward(25100);
  await visible(popup.getByRole("alert").filter({ hasText: "超时" }));
  await page.clock.resume(); await close();
  assert.equal(await page.getByLabel("试卷听力", { exact: true }).evaluate((audio) => audio === window.__translationAudio && !audio.paused), true);
  await page.getByLabel("试卷听力", { exact: true }).evaluate((audio) => audio.pause());
  const draftAfter = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((key) => key.startsWith("cet:attempt:")).map((key) => [key, localStorage.getItem(key)])));
  assert.deepEqual(draftAfter, draftBefore);
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage).includes("local-fixture-key")), false);
  record("真实翻译请求的 25 秒超时错误（浏览器时钟推进）；全过程听力不中断、原作答存档和内存密钥边界不变");

  // 左右滚动不连带移动另一栏或整页，三种模式共用相同自适应高度。
  await page.getByLabel("预览高度").selectOption("560");
  const readingHeights = [];
  for (const mode of ["single", "continuous", "spread"]) {
    await page.getByLabel("PDF 阅读模式").selectOption(mode);
    await page.waitForFunction(() => document.querySelector(".pdf-surface canvas")?.height > 0);
    readingHeights.push(await page.getByLabel("PDF 独立滚动阅读区").evaluate((node) => node.clientHeight));
  }
  assert.ok(Math.max(...readingHeights) - Math.min(...readingHeights) <= 1);
  const scrolling = await page.evaluate(() => {
    const pdf = document.querySelector(".pdf-scroll"), answers = document.querySelector(".answer-pane");
    const pageTop = scrollY, answerTop = answers.scrollTop;
    pdf.scrollTop = Math.min(100, pdf.scrollHeight - pdf.clientHeight);
    const pdfMovedAlone = answers.scrollTop === answerTop && scrollY === pageTop;
    const pdfTop = pdf.scrollTop;
    answers.scrollTop = Math.min(150, answers.scrollHeight - answers.clientHeight);
    return { pdfMovedAlone, answerMovedAlone: pdf.scrollTop === pdfTop && scrollY === pageTop, answersScrollable: answers.scrollHeight > answers.clientHeight, readingHeight: pdf.clientHeight, viewportHeight: innerHeight };
  });
  assert.equal(scrolling.pdfMovedAlone, true); assert.equal(scrolling.answerMovedAlone, true); assert.equal(scrolling.answersScrollable, true);
  await page.evaluate(() => { document.querySelector(".pdf-scroll").scrollTop = 0; document.querySelector(".answer-pane").scrollTop = 0; });
  await page.locator(".workspace-grid").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/workspace-columns-desktop.png", animations: "disabled" });
  record(`桌面左右独立滚动；三模式预览高度一致 ${readingHeights[0]}px（视口1050px）`);
  await page.setViewportSize({ width: 1440, height: 1440 });
  const lastPage = page.getByLabel("PDF 页码", { exact: true });
  await lastPage.fill("8"); await lastPage.press("Enter");
  await page.waitForTimeout(250);
  assert.equal(await lastPage.inputValue(), "8");
  await page.getByLabel("PDF 阅读模式").selectOption("single");
  await page.waitForFunction(() => document.querySelectorAll(".pdf-page-slot").length === 1 && document.querySelector(".pdf-page-slot").dataset.page === "8");
  await page.getByLabel("PDF 阅读模式").selectOption("spread");
  record("1440px 高视口的多行完整可见场景仍保留指定末页，切换模式不退回前一行");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "返回试卷查看原题", exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.locator(".pdf-pages").getAttribute("data-columns"), "1");
  const mobileLayout = await page.evaluate(() => ({ bottom: document.querySelector(".content-pane").getBoundingClientRect().bottom, top: document.querySelector(".answer-pane").getBoundingClientRect().top }));
  assert.ok(mobileLayout.top > mobileLayout.bottom);
  await page.screenshot({ path: "test-results/workspace-columns-mobile.png", animations: "disabled" });
  record("手机自动上下布局、双页降为单列、无页面横向溢出");
}
