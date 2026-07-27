import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const output = join(root, "static-site");
const client = join(root, "dist", "client");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(client, output, { recursive: true, force: true });
for (const unused of ["og.png", "favicon.svg", "file.svg", "globe.svg", "window.svg", ".DS_Store", ".assetsignore", "_headers"]) {
  await rm(join(output, unused), { force: true });
}

const { default: worker } = await import(join(root, "dist", "server", "index.js"));
const response = await worker.fetch(
  new Request("http://localhost/", { headers: { accept: "text/html", host: "localhost" } }),
  { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
  { waitUntil() {}, passThroughOnException() {} },
);

if (!response.ok) throw new Error(`静态首页生成失败：HTTP ${response.status}`);

let html = await response.text();
html = html.replaceAll("http://localhost/og.png", "/og.png");
await writeFile(join(output, "index.html"), html, "utf8");
console.log(`静态页面已生成：${output}`);
