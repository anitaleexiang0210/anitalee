import { cpSync, copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
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

for (const name of ["_next", "favicon.svg", "og.png"]) {
  const item = join(source, name);
  if (existsSync(item)) cpSync(item, join(destination, name), { recursive: true });
}

if (target === "front") {
  for (const name of ["qingke-contact.png", "qingke.html", "qingke.txt"]) {
    copyFileSync(join(source, name), join(destination, name));
  }
  cpSync(join(source, "qingke"), join(destination, "qingke"), { recursive: true });
  copyFileSync(join(source, "qingke.html"), join(destination, "index.html"));
  copyFileSync(join(source, "qingke", "account.html"), join(destination, "account.html"));
} else {
  copyFileSync(join(source, "qingke-admin.html"), join(destination, "qingke-admin.html"));
  if (existsSync(join(source, "qingke-admin.txt"))) copyFileSync(join(source, "qingke-admin.txt"), join(destination, "qingke-admin.txt"));
  copyFileSync(join(source, "qingke-admin.html"), join(destination, "index.html"));
}

console.log(`已准备 ${target === "front" ? "前台" : "管理后台"}静态文件：${destination}`);
