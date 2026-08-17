import type { Metadata } from "next";
import JobScout from "./JobScout";
import "./career.css";

export const metadata: Metadata = {
  title: "职业靶心校准器｜大想的AI实践",
  description:
    "AI 帮你看清：你离目标岗位还差什么。以终为始，先瞄准靶心，再一步一步靠近。",
};

export default function CareerPage() {
  return <JobScout />;
}
