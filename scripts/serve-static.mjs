import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".txt": "text/plain", ".pdf": "application/pdf", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".wasm": "application/wasm", ".webmanifest": "application/manifest+json" };
export function createStaticServer({ basePath = process.env.NEXT_PUBLIC_BASE_PATH || "" } = {}) {
  const root = resolve("out");
  return createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname); }
    catch { res.writeHead(400).end(); return; }
    if (basePath && pathname !== basePath && !pathname.startsWith(`${basePath}/`)) { res.writeHead(404).end(); return; }
    let target = resolve(root, `.${pathname.slice(basePath.length) || "/"}`);
    if (target !== root && !target.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    if (existsSync(target) && statSync(target).isDirectory()) target = resolve(target, "index.html");
    let status = 200;
    if (!existsSync(target) || !statSync(target).isFile()) { target = resolve(root, "404.html"); status = 404; }
    if (!existsSync(target)) { res.writeHead(404).end("请先运行 npm run build"); return; }
    const size = statSync(target).size;
    const headers = { "Content-Type": types[extname(target)] || "application/octet-stream", "Accept-Ranges": "bytes" };
    const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (range && status === 200) {
      const start = Number(range[1]), end = Math.min(Number(range[2] || size - 1), size - 1);
      if (start > end || start >= size) { res.writeHead(416, { "Content-Range": `bytes */${size}` }).end(); return; }
      res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
      if (req.method === "HEAD") res.end(); else createReadStream(target, { start, end }).pipe(res);
    } else {
      res.writeHead(status, { ...headers, "Content-Length": size });
      if (req.method === "HEAD") res.end(); else createReadStream(target).pipe(res);
    }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  createStaticServer().listen(port, "127.0.0.1", () => console.log(`静态预览 PID=${process.pid} http://127.0.0.1:${port}${process.env.NEXT_PUBLIC_BASE_PATH || ""}/`));
}
