import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const target = process.argv[2];
if (target !== "front" && target !== "admin") {
  throw new Error("用法：node scripts/prepare-qingke-host.mjs front|admin");
}

const source = resolve("out");
if (!existsSync(join(source, "qingke.html")) || !existsSync(join(source, "qingke-admin.html"))) {
  throw new Error("请先执行 Next.js 静态构建。 ");
}
const destination = resolve("dist", target === "front" ? "qingke-front" : "qingke-admin");
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });

const assetPrefix = readFileSync(join(source, "qingke.html"), "utf8").match(/(\/qingke-assets-[a-f0-9]+)\/_next\//)?.[1] ?? "";
if (assetPrefix) mkdirSync(join(destination, assetPrefix), { recursive: true });

for (const name of ["_next", "favicon.svg", "og.png", "_headers", "qingke-logo-qk.png"]) {
  const item = join(source, name);
  if (existsSync(item)) cpSync(item, join(destination, name === "_next" ? assetPrefix + "/_next" : name), { recursive: true });
}

function copyHtml(from, to) {
  copyFileSync(join(source, from), join(destination, to));
}

if (target === "front") {
  for (const name of ["qingke-contact.png", "qingke.txt"]) {
    copyFileSync(join(source, name), join(destination, name));
  }
  cpSync(join(source, "qingke"), join(destination, "qingke"), { recursive: true });
  copyHtml("qingke.html", "qingke.html");
  copyHtml("qingke.html", "index.html");
  copyHtml("qingke/account.html", "qingke/account.html");
  copyHtml("qingke/account.html", "account.html");
} else {
  copyHtml("qingke-admin.html", "qingke-admin.html");
  if (existsSync(join(source, "qingke-admin.txt"))) copyFileSync(join(source, "qingke-admin.txt"), join(destination, "qingke-admin.txt"));
  copyHtml("qingke-admin.html", "index.html");
}

console.log(`已准备 ${target === "front" ? "前台" : "管理后台"}静态文件：${destination}`);
