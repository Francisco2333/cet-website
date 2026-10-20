const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validatePaper, createTemplate } = require("../src/lib/exam.ts");
const { newAttempt, saveAttempt, loadAttempt, scoreAttempt } = require("../src/lib/attempt.ts");
const { elapsedMs, remainingMs } = require("../src/lib/timer.ts");
const { requestTranslation } = require("../src/lib/ai.ts");
const { SAMPLE_PAPER } = require("../src/lib/sample-paper.ts");
const { ALL_EXAMS } = require("../src/lib/library.ts");
const { existsSync, readFileSync } = require("node:fs");
const { scoreBand, countEnglishWords, validateReviewResult, requestReview, reviewIsCurrent } = require("../src/lib/review.ts");
const { requestChat } = require("../src/lib/ai.ts");

const reviewInput = { kind: "writing", level: "cet4", source: "Write about a study routine.", answer: "I learn every day. It help me study." };
function reviewFixture(kind = "writing") {
  return {
    kind, score: 8, band: "中等档", reason: "内容切题，语言准确性仍需提高。", strengths: ["观点清楚。"], problems: ["主谓一致需要调整。"],
    corrections: [{ original: "It help me study.", issue: "第三人称单数动词需要变化。", suggestion: "It helps me study.", ...(kind === "translation" ? { sourceQuote: "这帮助我学习。" } : {}) }],
    reference: "I learn every day. It helps me study.", priorities: ["先检查主谓一致。", "再补充支持论点的细节。"],
    ...(kind === "writing" ? { taskFulfillment: "fulfilled" } : { fidelity: "minor-errors", learningPoints: ["help somebody do something"] }),
  };
}

test("15 分档次边界和英文词数不按中文空格误计", () => {
  assert.deepEqual([0, 1, 3, 4, 6, 7, 9, 10, 12, 13, 15].map(scoreBand), ["零分", "低档", "低档", "较低档", "较低档", "中等档", "中等档", "良好档", "良好档", "较高档", "较高档"]);
  assert.equal(countEnglishWords("Don't stop.\nWell-written ideas 帮助我们。"), 4);
});

test("批改结果须完整且原句确实来自用户答案", () => {
  assert.equal(validateReviewResult(reviewFixture(), reviewInput).score, 8);
  const fake = reviewFixture(); fake.corrections[0].original = "A sentence the user never wrote.";
  assert.throws(() => validateReviewResult(fake, reviewInput), /原句/);
  const missing = reviewFixture(); delete missing.reference;
  assert.throws(() => validateReviewResult(missing, reviewInput), /结构|字段|参考/);
});

test("拒绝越界分数、档次矛盾、偏题高分和译意严重错误却高分", () => {
  assert.throws(() => validateReviewResult({ ...reviewFixture(), score: 16 }, reviewInput), /分数/);
  assert.throws(() => validateReviewResult({ ...reviewFixture(), band: "较高档" }, reviewInput), /档次/);
  assert.throws(() => validateReviewResult({ ...reviewFixture(), taskFulfillment: "off-topic" }, reviewInput), /偏题/);
  const input = { ...reviewInput, kind: "translation", source: "我每天学习。这帮助我学习。" };
  assert.throws(() => validateReviewResult({ ...reviewFixture("translation"), score: 14, band: "较高档", fidelity: "major-errors" }, input), /原意|矛盾/);
});

test("批改请求需要配置、原文和答案，不产生空评分", async () => {
  const config = { baseUrl: "https://example.com/v1", model: "demo", apiKey: "test-key" };
  await assert.rejects(() => requestReview({ ...config, apiKey: "" }, reviewInput), /配置/);
  await assert.rejects(() => requestReview(config, { ...reviewInput, source: " " }), /题目|原文/);
  await assert.rejects(() => requestReview(config, { ...reviewInput, answer: " " }), /答案|作答/);
});

test("作文批改携带级别、完整题目和作答，验证兼容接口 JSON 返回", async () => {
  let sent;
  const result = await requestReview({ baseUrl: "https://example.com/v1", model: "demo", apiKey: "test-key" }, reviewInput, undefined, async (_url, init) => {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reviewFixture()) } }] }));
  });
  assert.equal(result.score, 8);
  assert.deepEqual(JSON.parse(sent.messages[1].content), reviewInput);
  assert.match(sent.messages[0].content, /总体印象/);
  assert.match(sent.messages[0].content, /四级/);
  assert.match(sent.messages[0].content, /待评价的数据/);
});

test("非 JSON 和缺失字段不得显示有效得分", async () => {
  const config = { baseUrl: "https://example.com/v1", model: "demo", apiKey: "test-key" };
  for (const content of ["Your score is 15!", '{"score":15}']) {
    await assert.rejects(() => requestReview(config, reviewInput, undefined, async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }))), /JSON|结构|字段/);
  }
});

test("旧存档可恢复，新增题目原文与对应评分沿用同一存储", () => {
  const p = paper(), storage = memoryStorage(), a = newAttempt(p);
  a.sourceTexts = { writing: reviewInput.source, translation: "我每天学习。" };
  a.answers.writing = reviewInput.answer;
  a.reviews = { writing: { ...reviewInput, result: reviewFixture(), createdAt: 100, model: "demo" } };
  saveAttempt(storage, p, a);
  const restored = loadAttempt(storage, p);
  assert.equal(restored.sourceTexts.writing, reviewInput.source);
  assert.equal(restored.reviews.writing.result.score, 8);
  delete a.sourceTexts; delete a.reviews;
  saveAttempt(storage, p, a);
  assert.deepEqual(loadAttempt(storage, p).reviews, {});
  assert.equal(typeof loadAttempt(storage, p).sourceTexts.writing, "string");
});

test("题目或作答有修改时评分过期，快照不改变当前草稿", () => {
  const saved = { ...reviewInput, result: reviewFixture(), createdAt: 100, model: "demo" };
  assert.equal(reviewIsCurrent(saved, reviewInput), true);
  assert.equal(reviewIsCurrent(saved, { ...reviewInput, source: "A different topic" }), false);
  assert.equal(reviewIsCurrent(saved, { ...reviewInput, answer: "A revised essay" }), false);
  assert.equal(reviewIsCurrent(saved, { ...reviewInput, level: "cet6" }), false);
});

test("损坏的评分被丢弃，题目与原答案仍恢复", () => {
  const p = paper(), a = newAttempt(p), storage = memoryStorage();
  a.sourceTexts.writing = reviewInput.source; a.answers.writing = reviewInput.answer;
  a.reviews.writing = { ...reviewInput, createdAt: 100, model: "demo", result: { ...reviewFixture(), score: 90 } };
  saveAttempt(storage, p, a);
  const restored = loadAttempt(storage, p);
  assert.deepEqual(restored.reviews, {});
  assert.equal(restored.sourceTexts.writing, reviewInput.source);
  assert.equal(restored.answers.writing, reviewInput.answer);
});

test("批改文本限额和响应限额不会生成有效评分", async () => {
  const config = { baseUrl: "https://example.com/v1", model: "demo", apiKey: "test-key" };
  await assert.rejects(() => requestReview(config, { ...reviewInput, source: "s".repeat(12001) }), /12000/);
  await assert.rejects(() => requestReview(config, reviewInput, undefined, async () => new Response(JSON.stringify({ choices: [{ message: { content: "x".repeat(24001) } }] }))), /长度/);
});

test("共享 AI 请求支持取消与超时，并限制整个服务响应体", async () => {
  const config = { baseUrl: "https://example.com/v1", model: "demo", apiKey: "test-key" };
  const request = { system: "test", user: "test", maxTokens: 10, maxOutputChars: 100, timeoutMs: 10 };
  const hanging = async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
  await assert.rejects(() => requestChat(config, request, undefined, hanging), /超时/);
  const controller = new AbortController();
  const pending = requestChat(config, { ...request, timeoutMs: 1000 }, controller.signal, hanging);
  controller.abort();
  await assert.rejects(() => pending, /取消/);
  await assert.rejects(() => requestChat(config, request, undefined, async () => new Response("x".repeat(256001))), /长度限制/);
});

const paper = () => createTemplate({ level: "cet4", id: "test", year: 2025, label: "测试", resources: { paper: "/test.pdf" } });
function memoryStorage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

test("导入校验拒绝重复题号和不在选项中的标准答案", () => {
  const paper = createTemplate({ level: "cet4", id: "test", year: 2025, label: "测试", resources: {} });
  paper.sections[1].questions[1].id = paper.sections[1].questions[0].id;
  paper.sections[1].questions[0].correctAnswer = "Z";
  assert.ok(validatePaper(paper).some((e) => e.includes("重复")));
  assert.ok(validatePaper(paper).some((e) => e.includes("标准答案")));
});

test("导入器面对非数组选项和错误字段类型返回错误而不是崩溃", () => {
  const p = JSON.parse(JSON.stringify(SAMPLE_PAPER));
  p.sections[1].questions[0].options = {};
  p.sections[1].questions[1].prompt = { text: "invalid" };
  assert.doesNotThrow(() => validatePaper(p));
  assert.ok(validatePaper(p).length >= 2);
});

test("导入器拒绝缺少来源的标准答案", () => {
  const p = JSON.parse(JSON.stringify(SAMPLE_PAPER));
  delete p.answerSource;
  assert.ok(validatePaper(p).some((e) => e.includes("来源")));
});

test("模板包含完整 55 道客观题及写作翻译，不提供伪造答案", () => {
  const p = paper();
  assert.equal(p.sections.flatMap((s) => s.questions).length, 57);
  assert.equal(p.sections[4].questions[9].number, 55);
  assert.equal(validatePaper(p).length, 0);
  assert.equal(p.sections.some((s) => s.questions.some((q) => q.correctAnswer)), false);
});

test("原创完整示例可校验，55 个客观答案全部正确时只批改这 55 题", () => {
  assert.deepEqual(validatePaper(SAMPLE_PAPER), []);
  const answers = Object.fromEntries(SAMPLE_PAPER.sections.flatMap((s) => s.questions).filter((q) => q.correctAnswer).map((q) => [q.id, q.correctAnswer]));
  const result = scoreAttempt(SAMPLE_PAPER, { ...answers, writing: "An original essay", translation: "Translation" });
  assert.equal(result.answered, 57);
  assert.equal(result.correct, 55);
  assert.equal(result.gradable, 55);
});

test("题库列出的下载文件真实存在，听力标记与本地文件一致", () => {
  for (const p of ALL_EXAMS) {
    for (const url of Object.values(p.resources)) assert.equal(existsSync(`public${url}`), true, `${p.id}: ${url}`);
    assert.equal(p.hasAudio, existsSync(`public/library/${p.level}/${p.id}/listening.mp3`));
    assert.deepEqual(validatePaper(createTemplate(p)), []);
  }
  assert.ok(readFileSync("public/examples/listening.wav").length > 1000, "原创听力应为实际音频");
});

test("答题记录按级别和试卷隔离，刷新后恢复作答、提交及计时状态", () => {
  const storage = memoryStorage();
  const a = newAttempt(paper());
  a.answers = { "1": "A", writing: "My own essay.", translation: "A translated paragraph." };
  a.submittedAt = 1000;
  a.timer = { enabled: true, mode: "countup", accumulatedMs: 2000, startedAt: 3000, durationMs: 60000 };
  assert.equal(saveAttempt(storage, paper(), a), true);
  const restored = loadAttempt(storage, paper());
  assert.deepEqual(restored.answers, a.answers);
  assert.equal(restored.submittedAt, 1000);
  assert.equal(restored.timer.startedAt, 3000);
  assert.equal(loadAttempt(storage, { ...paper(), level: "cet6" }), null);
  assert.equal(loadAttempt(storage, { ...paper(), revision: 2 }), null);
});

test("损坏存档和不可用存储不会使工作台崩溃", () => {
  const storage = { getItem: () => "{broken", setItem: () => { throw new Error("quota"); } };
  assert.equal(loadAttempt(storage, paper()), null);
  assert.equal(saveAttempt(storage, paper(), newAttempt(paper())), false);
});

test("恢复时剔除无效选项、未知题号，保留匹配字母及主观题", () => {
  const storage = memoryStorage();
  const a = newAttempt(paper());
  a.answers = { "1": "Z", "2": "B", "36": "N", writing: "essay", fake: "answer" };
  saveAttempt(storage, paper(), a);
  assert.deepEqual(loadAttempt(storage, paper()).answers, { "2": "B", "36": "N", writing: "essay" });
});

test("真题没有答案键时只统计进度，不评分", () => {
  const result = scoreAttempt(paper(), { "1": "A", writing: "essay" });
  assert.equal(result.answered, 2);
  assert.equal(result.total, 57);
  assert.equal(result.gradable, 0);
  assert.equal(result.correct, 0);
});

test("只批改有来源的客观题，不给主观题或无答案题打分", () => {
  const p = paper();
  p.mode = "structured";
  p.answerSource = "原创题作者答案";
  p.sections[1].questions[0].correctAnswer = "B";
  p.sections[1].questions[1].correctAnswer = "C";
  const result = scoreAttempt(p, { "1": "B", "2": "A", writing: "essay" });
  assert.equal(result.gradable, 2);
  assert.equal(result.correct, 1);
  assert.equal(result.results["1"], "correct");
  assert.equal(result.results["2"], "incorrect");
  assert.equal(result.results.writing, undefined);
});

test("计时使用真实时间差，暂停及后台不产生累计漂移", () => {
  const timer = { enabled: true, mode: "countup", accumulatedMs: 5000, startedAt: 10000, durationMs: 60000 };
  assert.equal(elapsedMs(timer, 70000), 65000);
  assert.equal(elapsedMs({ ...timer, startedAt: null }, 70000), 5000);
  assert.equal(remainingMs({ ...timer, mode: "countdown" }, 70000), 0);
  assert.equal(remainingMs({ ...timer, mode: "countdown" }, 20000), 45000);
});

test("未配置 AI 时拒绝请求", async () => {
  await assert.rejects(() => requestTranslation({ baseUrl: "", model: "", apiKey: "" }, "hello"), /配置/);
});

test("AI 文本超限和不安全 URL 在发出请求前被拒绝", async () => {
  const config = { baseUrl: "https://example.com/v1", model: "demo", apiKey: "session-key" };
  await assert.rejects(() => requestTranslation(config, "a".repeat(2001)), /2000/);
  await assert.rejects(() => requestTranslation({ ...config, baseUrl: "https://user:pass@example.com/v1" }, "hello"), /地址/);
  await assert.rejects(() => requestTranslation({ ...config, baseUrl: "http://example.com/v1" }, "hello"), /HTTPS/);
});

test("兼容 API 返回纯文本翻译，正确构造端点和消息", async () => {
  let request;
  const fakeFetch = async (url, init) => {
    request = { url, init };
    return new Response(JSON.stringify({ choices: [{ message: { content: "你好" } }] }));
  };
  const result = await requestTranslation({ baseUrl: "https://example.com/v1/", model: "test-model", apiKey: "session-key" }, "hello", undefined, fakeFetch);
  assert.equal(result, "你好");
  assert.equal(request.url, "https://example.com/v1/chat/completions");
  assert.equal(JSON.parse(request.init.body).messages[1].content, "hello");
  assert.equal(request.init.headers.Authorization, "Bearer session-key");
});

for (const [status, pattern] of [[400, /Base URL.*Model/], [404, /Base URL.*Model/], [422, /Base URL.*Model/], [401, /认证/], [402, /额度/], [429, /额度|频率/], [500, /服务/]]) {
  test(`API ${status} 提供明确错误而不泄漏响应或密钥`, async () => {
    await assert.rejects(() => requestTranslation({ baseUrl: "https://example.com/v1", model: "demo", apiKey: "secret" }, "hello", undefined, async () => new Response("secret", { status })), pattern);
  });
}

test("网络或 CORS 拒绝时结束加载并提示跨域限制", async () => {
  await assert.rejects(() => requestTranslation({ baseUrl: "https://example.com/v1", model: "demo", apiKey: "secret" }, "hello", undefined, async () => { throw new TypeError("Failed to fetch"); }), /网络.*CORS/);
});

test("v1 作答升级保留草稿，v2 恢复题号和独立 PDF 位置", () => {
  const p = paper(), storage = memoryStorage(), a = newAttempt(p);
  a.answers.writing = "My previous draft.";
  a.navigation = { sectionId: "translation", questionId: "translation" };
  a.pdf = { paper: { mode: "spread", height: 720, page: 3, zoom: 1.25, fraction: 0.4, scrollLeft: 20 } };
  saveAttempt(storage, p, a);
  const restored = loadAttempt(storage, p);
  assert.equal(restored.version, 2);
  assert.equal(restored.navigation.questionId, "translation");
  assert.equal(restored.pdf.paper.page, 3);
  a.version = 1; delete a.navigation; delete a.pdf; delete a.reviewHistory;
  saveAttempt(storage, p, a);
  const migrated = loadAttempt(storage, p);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.answers.writing, "My previous draft.");
  assert.deepEqual(migrated.reviewHistory, {});
});

test("AI 凭据须主动记住；取消记住及清除只删除指定配置", () => {
  const { readAiSettings, writeAiSettings, forgetAiKey, clearAiSettings } = require("../src/lib/ai-credentials.ts");
  const data = new Map(), storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
  const config = { baseUrl: "https://example.com/v1", model: "model", apiKey: "private-test-key" };
  writeAiSettings(storage, config, false);
  assert.equal(readAiSettings(storage).config.apiKey, "");
  writeAiSettings(storage, config, true);
  assert.deepEqual(readAiSettings(storage), { config, remember: true });
  forgetAiKey(storage);
  assert.equal(readAiSettings(storage).config.apiKey, "");
  assert.equal(JSON.stringify([...data.values()]).includes(config.apiKey), false);
  assert.equal(readAiSettings(storage).config.model, "model");
  writeAiSettings(storage, config, true);
  writeAiSettings(storage, config, false);
  assert.equal(readAiSettings(storage).remember, false);
  assert.equal(JSON.stringify([...data.values()]).includes(config.apiKey), false);
  storage.setItem("theme", "dark"); clearAiSettings(storage);
  assert.equal(readAiSettings(storage).config.model, "");
  assert.equal(storage.getItem("theme"), "dark");
});

test("练习备份剔除凭据且旧单卷备份可恢复；拒绝错误版本、字段和体积", () => {
  const { exportPracticeBackup, parsePracticeBackup, makePracticeRecord } = require("../src/lib/practice-data.ts");
  const p = SAMPLE_PAPER, a = newAttempt(p);
  a.answers.writing = "My saved essay."; a.updatedAt = 100;
  a.apiKey = "private-test-key"; a.timer.apiKey = "private-test-key";
  const record = makePracticeRecord(p, a);
  record.apiKey = "private-test-key";
  const backup = exportPracticeBackup([record]);
  assert.equal(backup.includes("private-test-key"), false);
  assert.equal(parsePracticeBackup(backup)[0].attempt.answers.writing, "My saved essay.");
  const legacy = JSON.stringify({ paperId: p.id, level: p.level, ...a, version: 1 });
  assert.equal(parsePracticeBackup(legacy)[0].attempt.version, 2);
  const clearedLegacy = JSON.parse(legacy); clearedLegacy.answers["1"] = "";
  assert.equal(parsePracticeBackup(JSON.stringify(clearedLegacy))[0].attempt.answers["1"], undefined);
  const invalid = JSON.parse(backup); invalid.version = 999;
  assert.throws(() => parsePracticeBackup(JSON.stringify(invalid)), /版本/);
  const invalidAnswer = JSON.parse(backup); invalidAnswer.records[0].attempt.answers["1"] = "Z";
  assert.throws(() => parsePracticeBackup(JSON.stringify(invalidAnswer)), /字段|答案/);
  const invalidTimer = JSON.parse(backup); invalidTimer.records[0].attempt.timer.startedAt = "bad";
  assert.throws(() => parsePracticeBackup(JSON.stringify(invalidTimer)), /计时|字段/);
  const invalidReview = JSON.parse(backup); invalidReview.records[0].attempt.reviewHistory.writing = [{}];
  assert.throws(() => parsePracticeBackup(JSON.stringify(invalidReview)), /批改|字段/);
  assert.throws(() => parsePracticeBackup(" ".repeat(10 * 1024 * 1024 + 1)), /10 MB/);
  assert.throws(() => parsePracticeBackup(JSON.stringify({ version: 1, format: "cet-practice-backup", records: [record, record] })), /重复/);
});
