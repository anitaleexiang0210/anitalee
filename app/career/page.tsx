import type { Metadata } from "next";
import JobScout from "./JobScout";
import "./career.css";

export const metadata: Metadata = {
  title: "职业靶心校准器｜大想的 AI 实践",
  description:
    "贴一份真实 JD，对照自己的经历与硬条件，找到优势、缺口和最值得先做的一步。",
};

export default function CareerPage() {
  return <JobScout />;
}
