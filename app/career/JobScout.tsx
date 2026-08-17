"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Step = 1 | 2 | 3;
type SkillKey =
  | "discovery"
  | "product"
  | "delivery"
  | "communication"
  | "business"
  | "technical";
type GateKey = "education" | "experience" | "location" | "credential";
type GateStatus = "met" | "unsure" | "unmet";
type VerdictTone = "ready" | "prepare" | "pause";

type Profile = {
  name: string;
  years: number;
  location: string;
  story: string;
  strengths: string;
  skills: Record<SkillKey, number>;
};

type TargetJob = {
  title: string;
  company: string;
  location: string;
  url: string;
  jd: string;
  gates: Record<GateKey, GateStatus>;
};

type SkillFinding = {
  key: SkillKey;
  label: string;
  current: number;
  need: number;
  gap: number;
};

type Analysis = {
  tone: VerdictTone;
  verdict: string;
  explanation: string;
  advantages: string[];
  gaps: string[];
  actionTitle: string;
  actionDetail: string;
  findings: SkillFinding[];
  gateNotes: string[];
};

const PROFILE_STORAGE_KEY = "career-calibrator-profile-v2";
const FEEDBACK_EMAIL = "anitaleexiang@126.com";

const skillMeta: Record<
  SkillKey,
  {
    label: string;
    short: string;
    description: string;
    keywords: string[];
    action: string;
  }
> = {
  discovery: {
    label: "需求理解",
    short: "需求",
    description: "调研、访谈、理解客户与真实场景",
    keywords: ["需求", "调研", "洞察", "客户", "用户", "访谈", "场景", "痛点"],
    action:
      "找一个你做过的项目，补写清楚：谁遇到了什么问题、你怎么确认它是真问题、最后怎样验证。",
  },
  product: {
    label: "产品设计",
    short: "产品",
    description: "产品规划、流程、原型与方案设计",
    keywords: ["产品", "原型", "PRD", "流程", "交互", "规划", "设计", "迭代"],
    action:
      "选一个最相关的项目，整理成一页案例：问题、约束、方案、取舍和结果各写一句。",
  },
  delivery: {
    label: "项目推进",
    short: "交付",
    description: "跨团队推进、实施、交付与落地",
    keywords: ["项目", "交付", "落地", "实施", "推进", "协调", "上线", "验收"],
    action:
      "补一段交付证据：你协调过哪些人、处理了什么阻力、把事情推进到了哪个可验证节点。",
  },
  communication: {
    label: "沟通协作",
    short: "沟通",
    description: "倾听、汇报、培训与多方协作",
    keywords: ["沟通", "汇报", "培训", "协作", "倾听", "表达", "跨部门", "关系"],
    action:
      "准备一个两分钟沟通案例，说明你如何听懂分歧、拉齐目标，并让不同角色继续往前走。",
  },
  business: {
    label: "业务方案",
    short: "业务",
    description: "行业理解、商务、售前与解决方案",
    keywords: [
      "业务",
      "行业",
      "商务",
      "投标",
      "合同",
      "方案",
      "售前",
      "销售",
      "CRM",
      "SaaS",
    ],
    action:
      "从目标公司的业务出发，写一页“我理解的问题与可能方案”，先证明你能把岗位放回真实业务里。",
  },
  technical: {
    label: "技术与 AI",
    short: "技术",
    description: "AI、数据、接口、实现与评测能力",
    keywords: [
      "AI",
      "人工智能",
      "大模型",
      "Agent",
      "RAG",
      "API",
      "Python",
      "SQL",
      "数据",
      "部署",
      "评测",
      "技术",
    ],
    action:
      "做一个能打开、能演示的小样，并记录输入、输出、失败情况和人工兜底，不必先做成大系统。",
  },
};

const gateMeta: Record<GateKey, { label: string; question: string }> = {
  education: { label: "学历", question: "学历要求满足吗？" },
  experience: { label: "年限", question: "工作年限满足吗？" },
  location: { label: "地点", question: "地点与出差可接受吗？" },
  credential: { label: "资格", question: "证书、身份等条件满足吗？" },
};

const emptyProfile: Profile = {
  name: "",
  years: 0,
  location: "",
  story: "",
  strengths: "",
  skills: {
    discovery: 3,
    product: 3,
    delivery: 3,
    communication: 3,
    business: 3,
    technical: 2,
  },
};

const emptyTarget: TargetJob = {
  title: "",
  company: "",
  location: "",
  url: "",
  jd: "",
  gates: {
    education: "unsure",
    experience: "unsure",
    location: "unsure",
    credential: "unsure",
  },
};

const steps: Array<{ id: Step; label: string; hint: string }> = [
  { id: 1, label: "说说你现在有什么", hint: "确认起点" },
  { id: 2, label: "放入一份真实 JD", hint: "瞄准目标" },
  { id: 3, label: "拿走一个下一步", hint: "完成校准" },
];

function splitTerms(value: string) {
  return value
    .split(/[、,，/；;。\n]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

function requirementLevel(hits: number) {
  if (hits >= 5) return 5;
  if (hits >= 3) return 4;
  return 3;
}

function analyze(profile: Profile, target: TargetJob): Analysis {
  const source = `${target.title}\n${target.jd}`.toLowerCase();
  const findings = (Object.keys(skillMeta) as SkillKey[])
    .map((key) => {
      const hits = skillMeta[key].keywords.filter((word) =>
        source.includes(word.toLowerCase()),
      ).length;
      if (!hits) return null;
      const need = requirementLevel(hits);
      return {
        key,
        label: skillMeta[key].label,
        current: profile.skills[key],
        need,
        gap: Math.max(0, need - profile.skills[key]),
      };
    })
    .filter((item): item is SkillFinding => Boolean(item));

  if (!findings.length) {
    (["product", "delivery", "communication"] as SkillKey[]).forEach((key) => {
      findings.push({
        key,
        label: skillMeta[key].label,
        current: profile.skills[key],
        need: 3,
        gap: Math.max(0, 3 - profile.skills[key]),
      });
    });
  }

  const evidenceTerms = splitTerms(`${profile.strengths}、${profile.story}`);
  const directMatches = evidenceTerms
    .filter((term) => source.includes(term.toLowerCase()))
    .slice(0, 3);
  const strongSkills = findings
    .filter((item) => item.current >= item.need)
    .sort((a, b) => b.current - a.current)
    .slice(0, 3);
  const gapSkills = findings
    .filter((item) => item.gap > 0)
    .sort((a, b) => b.gap - a.gap || b.need - a.need)
    .slice(0, 2);

  const advantages = [
    ...directMatches.map((term) => `你提供的“${term}”与这份 JD 直接相关`),
    ...strongSkills.map((item) => `${item.label}达到这份 JD 当前识别出的要求`),
  ].slice(0, 3);

  if (!advantages.length) {
    advantages.push("暂未找到直接对应的证据，需要把相关经历写得更具体");
  }

  const gaps = gapSkills.map(
    (item) => `${item.label}：需要补强，当前自评 ${item.current}，岗位要求约 ${item.need}`,
  );
  if (!gaps.length) {
    gaps.push("能力结构未见明显缺口，重点转为证明已有经验");
  }

  const unmetGates = (Object.keys(target.gates) as GateKey[]).filter(
    (key) => target.gates[key] === "unmet",
  );
  const unsureGates = (Object.keys(target.gates) as GateKey[]).filter(
    (key) => target.gates[key] === "unsure",
  );
  const gateNotes = [
    ...unmetGates.map((key) => `${gateMeta[key].label}：目前不满足`),
    ...unsureGates.map((key) => `${gateMeta[key].label}：还没有确认`),
  ];

  if (unmetGates.length) {
    const labels = unmetGates.map((key) => gateMeta[key].label).join("、");
    return {
      tone: "pause",
      verdict: "暂不建议投入",
      explanation: `这份岗位存在目前不满足的硬条件：${labels}。先确认是否有替代路径，再决定是否投入准备。`,
      advantages,
      gaps,
      actionTitle: `先确认 ${labels} 是否可以放宽`,
      actionDetail:
        "打开原招聘页面或直接询问招聘方，只确认这一件事。硬条件没有空间时，及时换靶心。",
      findings,
      gateNotes,
    };
  }

  if (unsureGates.length) {
    const labels = unsureGates.map((key) => gateMeta[key].label).join("、");
    return {
      tone: "pause",
      verdict: "先核验再决定",
      explanation: `能力分析可以继续参考，但 ${labels} 尚未确认。硬条件不清楚时，接近度没有意义。`,
      advantages,
      gaps,
      actionTitle: `今天先核验 ${labels}`,
      actionDetail:
        "查看原岗位说明，仍不明确就直接问招聘方。确认后再回来做一次校准。",
      findings,
      gateNotes,
    };
  }

  const maxGap = gapSkills[0]?.gap ?? 0;
  if (maxGap >= 2 || gapSkills.length >= 2 || directMatches.length === 0) {
    const key = gapSkills[0]?.key ?? findings[0]?.key ?? "product";
    return {
      tone: "prepare",
      verdict: "补证据后尝试",
      explanation:
        "硬条件没有明显阻碍，但现有材料还不足以让招聘方快速看见你的匹配点。先补一项关键证据，再去投更划算。",
      advantages,
      gaps,
      actionTitle: `先补一份“${skillMeta[key].short}”证据`,
      actionDetail: skillMeta[key].action,
      findings,
      gateNotes,
    };
  }

  return {
    tone: "ready",
    verdict: "可以尝试",
    explanation:
      "硬条件已经确认，主要能力也能对应。这不代表一定录用，但已经值得进行一次定向投递。",
    advantages,
    gaps,
    actionTitle: "做一次定向投递",
    actionDetail:
      "把最相关的一段经历放到简历前部，并在招呼语里直接回应这份 JD 最看重的问题。",
    findings,
    gateNotes,
  };
}

function gateHint(key: GateKey, target: TargetJob) {
  if (key === "location") {
    return target.location ? `岗位地点：${target.location}` : "请结合办公地点和出差要求判断";
  }
  const jd = target.jd;
  if (key === "education") {
    return jd.match(/(博士|硕士|本科|大专)[^，。；;\n]{0,16}/)?.[0] ?? "未识别到明确学历描述，仍请人工核验";
  }
  if (key === "experience") {
    return jd.match(/\d+\s*[年以上]{1,2}[^，。；;\n]{0,16}/)?.[0] ?? "未识别到明确年限描述，仍请人工核验";
  }
  return jd.match(/[^，。；;\n]{0,10}(证书|资格|应届|校招|党员|CET|驾照)[^，。；;\n]{0,16}/i)?.[0] ?? "检查证书、身份、语言等必要条件";
}

export default function JobScout() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [target, setTarget] = useState<TargetJob>(emptyTarget);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as Profile;
      setProfile({
        ...emptyProfile,
        ...parsed,
        skills: { ...emptyProfile.skills, ...(parsed.skills ?? {}) },
      });
    } catch {
      window.localStorage.removeItem(PROFILE_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const currentStep = useMemo(
    () => steps.find((item) => item.id === step) ?? steps[0],
    [step],
  );

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile.story.trim() || !profile.strengths.trim()) {
      setError("请至少写下经历概况和你能拿出的证据。写得简单也可以。");
      return;
    }
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    setError("");
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function runCalibration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target.title.trim() || target.jd.trim().length < 80) {
      setError("请粘贴一份相对完整的岗位描述，至少包含职责和任职要求。");
      return;
    }
    setAnalysis(analyze(profile, target));
    setError("");
    setStep(3);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function copyResult() {
    if (!analysis) return;
    const text = [
      "职业靶心校准结果",
      `${target.company || "目标公司"} · ${target.title}`,
      "",
      `判断：${analysis.verdict}`,
      analysis.explanation,
      "",
      "已有优势：",
      ...analysis.advantages.map((item) => `- ${item}`),
      "",
      "需要补齐：",
      ...analysis.gaps.map((item) => `- ${item}`),
      "",
      `下一步：${analysis.actionTitle}`,
      analysis.actionDetail,
      "",
      "说明：这是一份岗位校准参考，不是录用概率或职业结论。",
    ].join("\n");
    await navigator.clipboard.writeText(text);
    setToast("校准结果已复制");
  }

  function chooseGate(key: GateKey, value: GateStatus) {
    setTarget((current) => ({
      ...current,
      gates: { ...current.gates, [key]: value },
    }));
  }

  function restartWithNewJD() {
    setTarget(emptyTarget);
    setAnalysis(null);
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="career-app">
      <header className="career-header">
        <button className="career-brand" onClick={() => router.push("/")}>
          <span className="brand-target" aria-hidden="true">◎</span>
          <span>
            <strong>职业靶心校准器</strong>
            <small>大想的 AI 实践</small>
          </span>
        </button>
        <div className="header-note">
          <span className="local-dot" />
          本地分析 · 无需登录
        </div>
        <button className="back-home" onClick={() => router.push("/")}>
          返回个人站
        </button>
      </header>

      <section className="career-intro">
        <div className="intro-stamp">V1 · 一个岗位，一次校准</div>
        <Image
          className="target-illustration"
          src="/career-target-handdrawn.png"
          width={1254}
          height={1254}
          priority
          alt="手绘靶心、便签和铅笔"
        />
        <div className="intro-copy">
          <p className="intro-kicker">CAREER TARGET CALIBRATOR</p>
          <h1>贴一份真实 JD，<br />看清你最该补什么</h1>
          <p>
            不猜你适合什么，也不预测录用概率。只把你的现状和一个具体岗位放在一起，
            找到优势、硬条件和最值得先做的一步。
          </p>
        </div>
      </section>

      <nav className="stepper" aria-label="校准步骤">
        {steps.map((item) => (
          <button
            key={item.id}
            className={`${step === item.id ? "active" : ""} ${step > item.id ? "done" : ""}`}
            onClick={() => {
              if (item.id < step || (item.id === 2 && step === 3)) setStep(item.id);
            }}
            disabled={item.id > step}
          >
            <span>{step > item.id ? "✓" : item.id}</span>
            <strong>{item.label}</strong>
            <small>{item.hint}</small>
          </button>
        ))}
      </nav>

      <section className={`worksheet step-${step}`}>
        <div className="worksheet-heading">
          <div>
            <span className="step-label">STEP {step} / 3</span>
            <h2>{currentStep.label}</h2>
          </div>
          <p>
            {step === 1 && "不用写完整简历，只提供这次判断需要的起点。"}
            {step === 2 && "只分析你真正考虑过的岗位，别用泛泛的职位名称。"}
            {step === 3 && "结果只回答两件事：值不值得试，以及先做什么。"}
          </p>
        </div>

        {step === 1 && (
          <form className="profile-form" onSubmit={saveProfile}>
            <div className="field-row three-columns">
              <label>
                怎么称呼你 <small>可不填</small>
                <input
                  value={profile.name}
                  onChange={(event) => setProfile({ ...profile, name: event.target.value })}
                  placeholder="例如：大想"
                />
              </label>
              <label>
                工作年限 <small>约数即可</small>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={profile.years || ""}
                  onChange={(event) =>
                    setProfile({ ...profile, years: Number(event.target.value) })
                  }
                  placeholder="例如：10"
                />
              </label>
              <label>
                当前城市 <small>可不填</small>
                <input
                  value={profile.location}
                  onChange={(event) => setProfile({ ...profile, location: event.target.value })}
                  placeholder="例如：北京"
                />
              </label>
            </div>

            <label className="wide-field">
              你的经历概况
              <textarea
                rows={5}
                value={profile.story}
                onChange={(event) => setProfile({ ...profile, story: event.target.value })}
                placeholder="不用包装。简单写做过什么、熟悉什么业务、最近在做什么。"
              />
            </label>

            <label className="wide-field">
              你能拿出的经验或证据
              <textarea
                rows={4}
                value={profile.strengths}
                onChange={(event) => setProfile({ ...profile, strengths: event.target.value })}
                placeholder="用逗号隔开，例如：客户访谈、CRM 产品设计、项目交付、投标方案、AI 小工具"
              />
            </label>

            <fieldset className="skill-fieldset">
              <legend>
                六项快速自评
                <small>1 是刚接触，5 是有项目证据</small>
              </legend>
              <div className="skill-sliders">
                {(Object.keys(skillMeta) as SkillKey[]).map((key) => (
                  <label className="skill-slider" key={key}>
                    <span>
                      <strong>{skillMeta[key].label}</strong>
                      <small>{skillMeta[key].description}</small>
                    </span>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      step="1"
                      value={profile.skills[key]}
                      onChange={(event) =>
                        setProfile({
                          ...profile,
                          skills: {
                            ...profile.skills,
                            [key]: Number(event.target.value),
                          },
                        })
                      }
                      aria-label={`${skillMeta[key].label}自评`}
                    />
                    <b>{profile.skills[key]}</b>
                  </label>
                ))}
              </div>
            </fieldset>

            {error && <p className="form-error">{error}</p>}
            <div className="form-actions">
              <small>资料只保存在当前浏览器，可随时修改。</small>
              <button className="primary-button" type="submit">
                下一步：放入目标 JD
              </button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form className="target-form" onSubmit={runCalibration}>
            <div className="profile-recap">
              <span>你的起点</span>
              <strong>{profile.name || "未填写姓名"} · {profile.years || "?"} 年经验</strong>
              <button type="button" onClick={() => setStep(1)}>修改</button>
            </div>

            <div className="field-row two-columns">
              <label>
                目标岗位名称
                <input
                  required
                  value={target.title}
                  onChange={(event) => setTarget({ ...target, title: event.target.value })}
                  placeholder="例如：企业 AI 产品经理"
                />
              </label>
              <label>
                公司
                <input
                  value={target.company}
                  onChange={(event) => setTarget({ ...target, company: event.target.value })}
                  placeholder="公司名称，可不填"
                />
              </label>
              <label>
                岗位地点
                <input
                  value={target.location}
                  onChange={(event) => setTarget({ ...target, location: event.target.value })}
                  placeholder="例如：北京 / 远程"
                />
              </label>
              <label>
                原岗位链接 <small>可不填</small>
                <input
                  type="url"
                  value={target.url}
                  onChange={(event) => setTarget({ ...target, url: event.target.value })}
                  placeholder="https://..."
                />
              </label>
            </div>

            <label className="wide-field">
              完整 JD
              <textarea
                required
                rows={12}
                value={target.jd}
                onChange={(event) => setTarget({ ...target, jd: event.target.value })}
                placeholder="复制岗位职责和任职要求。请只粘贴公开招聘信息，不要粘贴隐私或内部资料。"
              />
            </label>

            <fieldset className="gate-fieldset">
              <legend>
                先过硬条件
                <small>这些条件不能只靠关键词替你判断</small>
              </legend>
              <div className="gate-list">
                {(Object.keys(gateMeta) as GateKey[]).map((key) => (
                  <article className="gate-item" key={key}>
                    <div>
                      <span>{gateMeta[key].label}</span>
                      <strong>{gateMeta[key].question}</strong>
                      <small>{gateHint(key, target)}</small>
                    </div>
                    <div className="segmented-control" aria-label={gateMeta[key].question}>
                      {([
                        ["met", "满足"],
                        ["unsure", "不确定"],
                        ["unmet", "不满足"],
                      ] as Array<[GateStatus, string]>).map(([value, label]) => (
                        <button
                          type="button"
                          key={value}
                          className={target.gates[key] === value ? "active" : ""}
                          onClick={() => chooseGate(key, value)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </fieldset>

            {error && <p className="form-error">{error}</p>}
            <div className="form-actions">
              <button className="secondary-button" type="button" onClick={() => setStep(1)}>
                上一步
              </button>
              <button className="primary-button" type="submit">
                生成校准结果
              </button>
            </div>
          </form>
        )}

        {step === 3 && analysis && (
          <div className="result-view">
            <section className={`verdict verdict-${analysis.tone}`}>
              <div className="verdict-mark" aria-hidden="true">
                {analysis.tone === "ready" ? "✓" : analysis.tone === "prepare" ? "↗" : "!"}
              </div>
              <div>
                <span>{target.company || "目标公司"} · {target.title}</span>
                <h2>{analysis.verdict}</h2>
                <p>{analysis.explanation}</p>
              </div>
              <small>这是岗位校准参考，不是录用概率</small>
            </section>

            <section className="result-columns">
              <div className="result-block advantage-block">
                <span className="result-number">01</span>
                <h3>你已经有的</h3>
                <ul>
                  {analysis.advantages.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div className="result-block gap-block">
                <span className="result-number">02</span>
                <h3>这次要留意的</h3>
                <ul>
                  {[...analysis.gateNotes, ...analysis.gaps].slice(0, 4).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="next-action">
              <span className="action-label">只做这一步</span>
              <div>
                <h3>{analysis.actionTitle}</h3>
                <p>{analysis.actionDetail}</p>
              </div>
              <span className="hand-arrow" aria-hidden="true">↝</span>
            </section>

            <details className="evidence-details">
              <summary>查看这次判断依据</summary>
              <div className="evidence-table">
                {analysis.findings.map((item) => (
                  <div key={item.key}>
                    <strong>{item.label}</strong>
                    <span>你的自评 {item.current}</span>
                    <span>岗位要求约 {item.need}</span>
                    <i className={item.gap ? "has-gap" : ""}>
                      {item.gap ? `差 ${item.gap}` : "已覆盖"}
                    </i>
                  </div>
                ))}
              </div>
            </details>

            <div className="result-actions">
              <button className="primary-button" type="button" onClick={copyResult}>
                复制校准结果
              </button>
              <button className="secondary-button" type="button" onClick={restartWithNewJD}>
                换一份 JD 再校准
              </button>
              {target.url && (
                <a className="source-link" href={target.url} target="_blank" rel="noreferrer">
                  回到原岗位核验
                </a>
              )}
              <a
                className="feedback-link"
                href={`mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent("职业靶心校准器试用反馈")}`}
              >
                结果不准？告诉我
              </a>
            </div>
          </div>
        )}
      </section>

      <footer className="career-footer">
        <p>你的资料与 JD 都在当前浏览器处理，不会上传到服务器。</p>
        <button
          onClick={() => {
            window.localStorage.removeItem(PROFILE_STORAGE_KEY);
            setProfile(emptyProfile);
            setTarget(emptyTarget);
            setAnalysis(null);
            setStep(1);
            setToast("本地画像已清空");
          }}
        >
          清空本地画像
        </button>
      </footer>

      {toast && <div className="career-toast" role="status">{toast}</div>}
    </main>
  );
}
