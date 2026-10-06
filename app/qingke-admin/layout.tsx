import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "顷刻管理后台",
  robots: { index: false, follow: false },
  icons: { icon: "/qingke-logo-qk.png", shortcut: "/qingke-logo-qk.png" },
};

export default function QingkeAdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
