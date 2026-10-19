import { readdirSync, existsSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../public/library/", import.meta.url);
const result = {};
for (const level of ["cet4", "cet6"]) {
  const dir = new URL(`${level}/`, root);
  for (const id of readdirSync(dir)) {
    if (!statSync(new URL(`${id}/`, dir)).isDirectory()) continue;
    const flags = {};
    for (const [key, file] of Object.entries({ paper: "test.pdf", answer: "answer.pdf", audio: "listening.mp3" })) {
      const path = new URL(`${id}/${file}`, dir);
      flags[key] = existsSync(path) && statSync(path).size > 0;
      if (flags[key] && file.endsWith(".pdf") && readFileSync(path).subarray(0, 5).toString() !== "%PDF-") throw new Error(`非 PDF 文件：${level}/${id}/${file}`);
    }
    result[`${level}/${id}`] = flags;
  }
}
const target = join(process.cwd(), "src/lib/library-resources.json");
const content = `${JSON.stringify(result, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if (!existsSync(target) || readFileSync(target, "utf8") !== content) throw new Error("资源清单已过期，请运行 npm run inventory");
} else writeFileSync(target, content);
console.log(`本地资源清单：${Object.keys(result).length} 套，${Object.values(result).filter((v) => v.paper).length} 试卷，${Object.values(result).filter((v) => v.answer).length} 答案，${Object.values(result).filter((v) => v.audio).length} 音频`);
