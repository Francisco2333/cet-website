const { readFileSync } = require("node:fs");
const { validatePaper } = require("../src/lib/exam.ts");
const path = process.argv[2];
if (!path) { console.error("用法：npm run validate:paper -- path/to/paper.json"); process.exitCode = 1; }
else {
  try {
    const paper = JSON.parse(readFileSync(path, "utf8"));
    const errors = validatePaper(paper);
    if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
    else console.log("试卷结构校验通过。来源、版权和答案正确性仍须人工核验；此命令不抓取或发布资源。");
  } catch { console.error("文件读取或 JSON 解析失败。"); process.exitCode = 1; }
}
