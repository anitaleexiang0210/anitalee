import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "顷刻投标排版工具",
  description: "整理已合并投标 DOCX 的标题层级、编号、正文样式与目录。标书在浏览器本地处理，导出后请在 Word/WPS 中复核。",
  icons: { icon: "/qingke-logo-qk.png", shortcut: "/qingke-logo-qk.png" },
};

export default function QingkeLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
