import { cpSync, mkdirSync } from "node:fs";
const target = new URL("../public/pdfjs/", import.meta.url);
const source = new URL("../node_modules/pdfjs-dist/", import.meta.url);
mkdirSync(target, { recursive: true });
for (const path of ["build/pdf.worker.min.mjs", "cmaps", "standard_fonts", "wasm", "LICENSE"]) {
  cpSync(new URL(path, source), new URL(path === "build/pdf.worker.min.mjs" ? "pdf.worker.min.mjs" : path, target), { recursive: true });
}
console.log("PDF worker、字体、CMap 和解码资源已同步到 public/pdfjs/");
