"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type View = "jobs" | "channels" | "capabilities" | "profile";
type Filter = "recommended" | "imported" | "examples" | "reference" | "all";
type ChannelSignal =
  | "senior"
  | "early"
  | "transition"
  | "ai"
  | "stateOwned"
  | "startup"
  | "international"
  | "technical";
type SkillKey =
  | "discovery"
  | "delivery"
  | "product"
  | "communication"
  | "documents"
  | "security"
  | "aiPractice"
  | "agent"
  | "coding"
  | "deployment"
  | "evaluation";

type Profile = {
  name: string;
  headline: string;
  years: number;
  location: string;
  targetRoles: string;
  travel: string;
  minSalary: number;
  careerStage: string;
  companyPreference: string;
  story: string;
  strengths: string;
  learning: string;
  skills: Record<SkillKey, number>;
};

type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  source: string;
  sourceUrl: string;
  published: string;
  verified: string;
  category: "fde" | "solutions" | "reference";
  tag: string;
  summary: string;
  requirements: Partial<Record<SkillKey, number>>;
  advantages: string[];
  watchouts: string[];
  action: string;
  hardGate?: string;
  confidencePenalty?: number;
  customScore?: number;
  imported?: boolean;
};

const JOB_DATASET_PUBLISHED_AT = "2026-07-27 23:34";
const JOB_DATASET_LAST_VERIFIED = "2026-07-27";
const AUTO_REFRESH_STATUS = "真实岗位池 · 人工联网核验 · 未接入自动抓取";
const FEEDBACK_EMAIL = "anitaleexiang@126.com";

type Channel = {
  id: string;
  name: string;
  kind: string;
  url: string;
  verified: string;
  baseScore: number;
  weights: Partial<Record<ChannelSignal, number>>;
  reason: string;
  method: string;
  caution: string;
};

type RankedChannel = Channel & {
  score: number;
  band: "主阵地" | "补充渠道" | "条件型";
  personalReason: string;
};

const skillMeta: Record<
  SkillKey,
  { label: string; short: string; description: string }
> = {
  discovery: {
    label: "客户需求洞察",
    short: "洞察",
    description: "理解真实业务、识别隐性需求与价值场景",
  },
  delivery: {
    label: "复杂项目交付",
    short: "交付",
    description: "跨团队推进、现场沟通、把方案落到结果",
  },
  product: {
    label: "产品与流程设计",
    short: "产品",
    description: "把模糊问题拆成流程、工具与可执行方案",
  },
  communication: {
    label: "沟通与倾听",
    short: "沟通",
    description: "访谈、咨询式沟通、培训与高质量表达",
  },
  documents: {
    label: "方案与投标材料",
    short: "方案",
    description: "解决方案、标书、汇报与知识沉淀",
  },
  security: {
    label: "企业安全场景",
    short: "安全",
    description: "网络安全业务、风险意识与企业协作经验",
  },
  aiPractice: {
    label: "AI 工具实践",
    short: "AI实践",
    description: "用 AI 完成真实任务并持续形成案例",
  },
  agent: {
    label: "Agent / RAG",
    short: "Agent",
    description: "工作流、知识库、检索增强与工具调用",
  },
  coding: {
    label: "代码与系统集成",
    short: "代码",
    description: "Python / TypeScript、API、SQL 与调试",
  },
  deployment: {
    label: "生产部署",
    short: "部署",
    description: "Docker、云环境、权限、监控与稳定运行",
  },
  evaluation: {
    label: "评测与迭代",
    short: "评测",
    description: "效果指标、反馈闭环、评测集与持续优化",
  },
};

const defaultProfile: Profile = {
  name: "大想",
  headline: "懂客户、懂业务、正在把 AI 做成企业可用工具的人",
  years: 20,
  location: "北京",
  targetRoles: "企业 AI 落地 / FDE / AI 解决方案 / AI 产品交付",
  travel: "可评估",
  minSalary: 15,
  careerStage: "资深转型（8年以上）",
  companyPreference: "中型 AI 公司 / 大型企业数字化团队 / 央国企数字科技",
  story:
    "拥有长期产品、交互、业务和项目经验；做过心理咨询，擅长倾听与澄清；熟悉网络安全企业场景、投标与复杂材料；正在用真实项目补齐 Agent、集成和部署能力。",
  strengths: "客户访谈、需求澄清、产品设计、跨团队推进、投标方案、咨询式沟通",
  learning: "Python、API、SQL、Agent/RAG、Docker、AI评测",
  skills: {
    discovery: 5,
    delivery: 5,
    product: 5,
    communication: 5,
    documents: 5,
    security: 4,
    aiPractice: 3,
    agent: 2,
    coding: 1,
    deployment: 1,
    evaluation: 2,
  },
};

const emptyProfile: Profile = {
  name: "",
  headline: "",
  years: 0,
  location: "",
  targetRoles: "",
  travel: "可评估",
  minSalary: 0,
  careerStage: "跨行业 / 跨职能转型",
  companyPreference: "不限，先看岗位内容",
  story: "",
  strengths: "",
  learning: "",
  skills: {
    discovery: 2,
    delivery: 2,
    product: 2,
    communication: 2,
    documents: 2,
    security: 2,
    aiPractice: 2,
    agent: 2,
    coding: 2,
    deployment: 2,
    evaluation: 2,
  },
};

const seedJobs: Job[] = [
  {
    id: "cherry-fde",
    title: "FDE 前沿部署工程师（企业 AI 落地交付）",
    company: "Cherry Studio",
    location: "上海",
    salary: "15–30K",
    source: "Bonjour.bio",
    sourceUrl:
      "https://bonjour.bio/jobs-mapping/jobs/cc73c488-ebfe-4414-b883-e25c2aa0bac8",
    published: "招聘页显示：2 个月前",
    verified: "2026-07-27",
    category: "fde",
    tag: "靶心样本",
    summary:
      "面向企业 AI 落地服务，从客户场景诊断、Agent 工作流方案设计到持续陪跑和行业 Playbook 沉淀，强调客户洞察、交付判断和 AI 工具实践。",
    requirements: {
      discovery: 5,
      delivery: 4,
      product: 4,
      communication: 5,
      aiPractice: 3,
      agent: 2,
      documents: 3,
    },
    advantages: [
      "客户洞察、咨询倾听与复杂沟通高度匹配",
      "多年产品与项目经验适合把模糊需求变成落地路径",
      "岗位不以重度编码为唯一门槛，利于发挥复合经验",
    ],
    watchouts: ["岗位在上海，需要确认办公与高频线下拜访安排", "要拿出至少一个可演示的企业 AI 成品"],
    action: "优先做定向作品集，并尝试直接沟通岗位负责人。",
  },
  {
    id: "mobvoi-fde",
    title: "AI 前沿部署工程师（FDE）",
    company: "出门问问",
    location: "北京",
    salary: "20–30K",
    source: "BeBee（来源猎聘）",
    sourceUrl: "https://bebee.com/cn/jobs/aifde--techmap_cn_4422241168",
    published: "招聘页显示：1 个月前；截至 2026-08-12",
    verified: "2026-07-27",
    category: "fde",
    tag: "技术偏差明显",
    summary:
      "深入客户现场访谈、业务与数据建模，设计并交付大模型/Agent 解决方案，同时负责复杂客户环境中的系统集成、部署、调优和业务结果。",
    requirements: {
      discovery: 5,
      delivery: 5,
      product: 5,
      communication: 5,
      aiPractice: 4,
      agent: 4,
      coding: 4,
      deployment: 4,
      evaluation: 4,
    },
    advantages: [
      "业务访谈、客户沟通和产品判断与岗位职责高度相关",
      "适合用真实 AI 项目作品证明从需求到交付的判断力",
      "岗位明确认可咨询、集成或创业公司核心岗位经历",
    ],
    watchouts: [
      "要求实际 Agent 系统设计或完整交付经验",
      "Python、Linux、Docker/K8s 和复杂系统集成是明显门槛",
    ],
    action: "作为高价值目标跟进，先补一页“需求访谈到 Agent 方案”的案例证据。",
    confidencePenalty: 5,
  },
  {
    id: "cmcc-solution",
    title: "大模型解决方案工程师",
    company: "中国移动",
    location: "北京",
    salary: "面议",
    source: "智联招聘",
    sourceUrl:
      "https://www.zhaopin.com/jobdetail/CC000413680J40584253813.htm",
    published: "原页未显示发布时间；2026-07-27 可访问核验",
    verified: "2026-07-27",
    category: "solutions",
    tag: "北京靶样",
    summary:
      "面向政企客户规划大模型方案，承担需求交流、方案编写、集成验证和项目协调，并看重投标与可研经验。",
    requirements: {
      discovery: 4,
      delivery: 4,
      communication: 4,
      documents: 5,
      aiPractice: 3,
      agent: 3,
      coding: 3,
      deployment: 2,
      evaluation: 2,
      security: 2,
    },
    advantages: [
      "北京岗位，地域符合",
      "投标、方案、客户交流和跨团队推进是已有优势",
      "企业安全背景可迁移到政企 AI 场景",
    ],
    watchouts: ["需要核实专业与学历条件", "应补齐大模型集成验证的实操证据"],
    action: "先投递并同步准备一页纸“政企 AI 场景方案”。",
    confidencePenalty: 2,
  },
  {
    id: "paifang-fde",
    title: "前沿部署工程师 FDE",
    company: "湃方科技",
    location: "北京",
    salary: "15–20K",
    source: "智联招聘",
    sourceUrl:
      "https://www.zhaopin.com/jobdetail/CC846299020J40853347811.htm",
    published: "招聘页显示：更新时间 6月15日",
    verified: "2026-07-27",
    category: "fde",
    tag: "技术补齐型",
    summary:
      "深入业务调研后完成 Agent 方案、开发、RAG、系统集成、生产部署与培训，强调端到端技术落地。",
    requirements: {
      discovery: 4,
      delivery: 4,
      communication: 3,
      aiPractice: 4,
      agent: 4,
      coding: 4,
      deployment: 4,
      evaluation: 3,
    },
    advantages: [
      "客户调研、价值判断和培训部分有明显优势",
      "安全企业经历有助于理解生产环境与风险",
    ],
    watchouts: [
      "岗位明确要求后端、API、数据库与容器部署",
      "计算机专业和多年开发经验可能是硬门槛",
    ],
    action: "把它当作 6–12 个月能力标尺，不作为当前唯一目标。",
  },
  {
    id: "huaxin-architect",
    title: "大模型解决方案架构师",
    company: "华信永道",
    location: "北京",
    salary: "60–85K",
    source: "智联招聘",
    sourceUrl:
      "https://www.zhaopin.com/jobdetail/CC214592910J40659652916.htm",
    published: "原页未显示发布时间；2026-07-27 可访问核验",
    verified: "2026-07-27",
    category: "solutions",
    tag: "高阶能力标尺",
    summary:
      "负责大模型解决方案设计、行业痛点洞察、跨部门项目推进和评估体系建设，要求 5 年以上 AI 经验与 2 年以上大模型项目管理经验。",
    requirements: {
      discovery: 5,
      delivery: 5,
      product: 4,
      communication: 4,
      documents: 4,
      aiPractice: 5,
      agent: 4,
      coding: 4,
      evaluation: 3,
      deployment: 3,
    },
    advantages: [
      "行业痛点洞察、方案设计和跨团队推进可迁移",
      "适合倒推作品集中的评估体系和业务价值表达",
    ],
    watchouts: ["薪资和职责对应高阶架构岗位", "要求硕士、AI 经验和较强编程背景"],
    action: "作为能力标尺，不建议作为当前第一投递目标。",
    confidencePenalty: 12,
  },
  {
    id: "guoyan-consultant",
    title: "数智化（大模型）咨询顾问",
    company: "国研科技集团",
    location: "北京",
    salary: "8–10K",
    source: "智联招聘",
    sourceUrl:
      "https://www.zhaopin.com/jobdetail/CC000275200J40878240403.htm",
    published: "原页未显示发布时间；2026-07-27 可访问核验",
    verified: "2026-07-27",
    category: "reference",
    tag: "校招参考",
    summary:
      "面向大模型/小模型需求梳理、方案设计、研发落地和离线部署实施，支撑涉密场景 RAG、文档智能解析与知识库建设。",
    requirements: {
      discovery: 4,
      communication: 4,
      documents: 5,
      delivery: 3,
      aiPractice: 3,
      agent: 3,
      coding: 3,
      security: 3,
    },
    advantages: ["咨询、方案和政企/安全理解可作为迁移能力参考"],
    watchouts: ["校园岗位且要求硕士", "薪资与职业阶段可能不匹配"],
    action: "仅作为能力关键词参考，不作为优先投递。",
    hardGate: "校园岗位，硕士要求",
  },
  {
    id: "ey-fde-campus",
    title: "FDE - AI 前线部署工程师 / AI 应用交付工程师",
    company: "安永（中国）企业咨询",
    location: "上海",
    salary: "未公开",
    source: "牛客",
    sourceUrl: "https://www.nowcoder.com/jobs/detail/456568?urlSource=sitemap",
    published: "投递时间：2026-07-24 至 2026-10-24",
    verified: "2026-07-27",
    category: "reference",
    tag: "校招参考",
    summary:
      "企业级 AI 应用工程化落地岗位，覆盖 Agent、RAG、智能问答、文档审阅、NL2SQL、系统集成、部署、测试和稳定性保障。",
    requirements: {
      discovery: 3,
      communication: 4,
      aiPractice: 4,
      agent: 4,
      coding: 4,
      deployment: 4,
      evaluation: 3,
      security: 3,
    },
    advantages: ["可以作为 Agent/RAG 工程化和企业数据集成的学习清单"],
    watchouts: ["2026 届校招，职业阶段不匹配", "地点在上海"],
    action: "只提取能力关键词，不作为当前投递目标。",
    hardGate: "2026 届校招",
  },
];

const keywordGroups: Record<SkillKey, string[]> = {
  discovery: ["客户", "需求", "业务", "场景", "痛点", "调研"],
  delivery: ["交付", "项目", "现场", "推进", "协调", "落地"],
  product: ["产品", "流程", "方案设计", "原型", "规划"],
  communication: ["沟通", "汇报", "培训", "访谈", "表达"],
  documents: ["方案", "标书", "投标", "文档", "白皮书", "售前"],
  security: ["安全", "合规", "风控", "权限", "政企"],
  aiPractice: ["AI", "大模型", "LLM", "生成式", "智能体"],
  agent: ["Agent", "RAG", "MCP", "向量", "Prompt", "知识库"],
  coding: ["Python", "Java", "TypeScript", "API", "SQL", "开发", "编程"],
  deployment: ["Docker", "K8s", "部署", "云", "生产环境", "运维"],
  evaluation: ["评测", "指标", "监控", "反馈", "迭代", "效果"],
};

const channelCatalog: Channel[] = [
  {
    id: "direct",
    name: "目标公司官网＋直接联系",
    kind: "定向触达",
    url: "https://cn.bing.com/search?q=AI%20%E8%A7%A3%E5%86%B3%E6%96%B9%E6%A1%88%20%E6%8B%9B%E8%81%98%20%E5%AE%98%E7%BD%91",
    verified: "策略渠道",
    baseScore: 66,
    weights: { senior: 18, transition: 16, ai: 8, startup: 8 },
    reason:
      "先选真正想去的公司，再看官网、招聘公众号、创始人或业务负责人公开信息，绕开只看关键词的第一层筛选。",
    method:
      "每周选 5 家公司，附一页针对性方案或一个相关案例，联系招聘负责人、业务负责人或可信内推人。",
    caution: "必须做定向材料；群发同一段自我介绍，效果会迅速下降。",
  },
  {
    id: "liepin",
    name: "猎聘＋垂直猎头",
    kind: "中高端招聘",
    url: "https://www.liepin.com/",
    verified: "2026-07-26",
    baseScore: 58,
    weights: { senior: 25, transition: 8, ai: 6, stateOwned: 4 },
    reason:
      "猎聘官方仍把自己定位为中高端人才招聘平台，连接企业、猎头和职业经理人，适合长期经验需要被重新解释的人。",
    method:
      "简历标题写清可迁移价值；主动维护 5～10 位做 AI、企业软件、数字化或安全行业的猎头。",
    caution: "猎头只会优先处理容易成交的候选人，作品和清晰定位仍然不可少。",
  },
  {
    id: "maimai",
    name: "脉脉高聘＋行业人脉",
    kind: "职场社交",
    url: "https://maimai.cn/",
    verified: "2026-07-26",
    baseScore: 54,
    weights: { senior: 18, transition: 15, ai: 12, startup: 6 },
    reason:
      "适合观察团队动向、识别招聘负责人和建立弱关系；2026 年脉脉仍在持续发布中高端及 AI 人才招聘洞察。",
    method:
      "完善经历和作品链接，关注目标公司员工、招聘 BP、猎头和 AI 业务负责人，用具体项目开启交流。",
    caution: "它不是单纯职位库；只刷匿名讨论、不建立真实连接，求职价值有限。",
  },
  {
    id: "bonjour",
    name: "Bonjour! AI 找工地图",
    kind: "AI 垂直社区",
    url: "https://bonjour.bio/jobs",
    verified: "2026-07-26",
    baseScore: 45,
    weights: { ai: 30, startup: 16, transition: 8, technical: 6 },
    reason:
      "FancyJobs 基于 Bonjour 人才社区连接 AI Startup 与 Builder，职位会展示团队、经验阶段和作品要求，信号比泛平台更集中。",
    method:
      "用作品集、一封针对产品的信和可运行案例投递；优先寻找产品、交付、GTM、FDE 和行业落地岗位。",
    caution: "岗位总量小于综合平台，创业公司稳定性、融资和劳动关系要单独核验。",
  },
  {
    id: "zhaopin",
    name: "智联招聘",
    kind: "综合招聘",
    url: "https://sou.zhaopin.com/",
    verified: "2026-07-26",
    baseScore: 56,
    weights: { stateOwned: 18, senior: 5, transition: 4, ai: 6 },
    reason:
      "2026 年仍有大量大型企业、运营商、国企、行业软件和 AI 解决方案岗位，适合补齐公开职位样本。",
    method:
      "按公司性质、发布日期和经验年限筛选；看到合适岗位后，再去公司官网交叉核验。",
    caution: "注意岗位重复、第三方代招、长期挂岗和更新时间；不要只依赖一键投递。",
  },
  {
    id: "guopin",
    name: "国聘＋国资委招聘",
    kind: "央国企官方",
    url: "https://job.iguopin.com/",
    verified: "2026-07-26",
    baseScore: 38,
    weights: { stateOwned: 42, senior: 8, transition: 4 },
    reason:
      "国聘设有高端、社会招聘等入口；国资委官网也持续发布中央企业社会招聘公告，适合数字科技和产业 AI 岗位。",
    method:
      "同时查看国聘、国资委人事招聘和目标央企官网，重点核验社招、学历、专业与年龄条件。",
    caution: "很多公告是校招或有严格资格条件，必须先过硬门槛再投入准备。",
  },
  {
    id: "boss",
    name: "BOSS 直聘",
    kind: "高活跃综合平台",
    url: "https://www.zhipin.com/",
    verified: "2026-07-26",
    baseScore: 63,
    weights: { early: 16, startup: 16, ai: 8, technical: 5, senior: -5 },
    reason:
      "平台覆盖各类求职者和不同规模企业，优势是活跃岗位多、可与招聘者直接沟通，不只属于年轻人。",
    method:
      "用一句话说清能解决什么问题；优先联系在线的业务负责人或招聘者，先问实际职责和决策链。",
    caution: "资深转型者容易被标题和近期同岗年限筛掉，因此适合作补充，不宜成为唯一主阵地。",
  },
  {
    id: "job51",
    name: "前程无忧 51job",
    kind: "大型企业补充",
    url: "https://www.51job.com/",
    verified: "2026-07-26",
    baseScore: 49,
    weights: { senior: 6, stateOwned: 12, international: 12 },
    reason:
      "仍承接不少大型企业、运营商、国企和企业自建招聘专题，适合发现不在创业社区出现的岗位。",
    method: "搜索后优先进入企业招聘专题或官网入口，建立按公司而不是只按岗位名的清单。",
    caution: "即时沟通感弱于直聊平台，投递后应寻找官网、招聘邮箱或可信内推补充触达。",
  },
  {
    id: "nowcoder",
    name: "牛客＋技术社区",
    kind: "校招 / 技术",
    url: "https://www.nowcoder.com/jobs/",
    verified: "2026-07-26",
    baseScore: 36,
    weights: { early: 28, technical: 18, ai: 8, senior: -18 },
    reason:
      "技术岗位、校招和面试信息密度较高，适合年轻技术候选人或需要研究工程岗位能力要求的人。",
    method: "用于技术岗位检索、面经和能力标尺；先核验招聘对象是否限定应届生。",
    caution: "对资深业务型转型者通常不是主渠道，校招硬门槛会直接排除。",
  },
  {
    id: "global",
    name: "LinkedIn＋Wellfound＋YC Jobs",
    kind: "国际 / 远程",
    url: "https://wellfound.com/jobs",
    verified: "2026-07-26",
    baseScore: 34,
    weights: { international: 40, startup: 18, ai: 10, senior: 4 },
    reason:
      "适合英文工作、出海团队和国际 AI 创业公司；Wellfound 与 YC Jobs 能看到创业公司阶段、远程范围和部分薪资信息。",
    method:
      "准备英文简历、LinkedIn 主页和英文案例；逐条确认远程雇佣地区、签证、时区与合同方式。",
    caution:
      "LinkedIn 已停止中国大陆客户自助发布职位，国内本地职位覆盖有限；很多海外远程岗不接受中国境内雇佣。",
  },
];

function normalizeProfile(input: Partial<Profile>): Profile {
  const years = Number(input.years ?? 0);
  const careerStage =
    input.careerStage ??
    (years >= 8
      ? "资深发展（8年以上）"
      : years <= 3
        ? "职业起步（0～3年）"
        : "稳定成长（3～8年）");

  return {
    ...emptyProfile,
    ...input,
    years,
    careerStage,
    companyPreference: input.companyPreference ?? "不限，先看岗位内容",
    skills: {
      ...emptyProfile.skills,
      ...(input.skills ?? {}),
    },
  };
}

function rankChannels(profile: Profile): RankedChannel[] {
  const profileText = [
    profile.targetRoles,
    profile.companyPreference,
    profile.careerStage,
    profile.story,
    profile.strengths,
    profile.location,
  ].join(" ");
  const signals: Record<ChannelSignal, boolean> = {
    senior: profile.years >= 8 || /资深|管理|负责人/.test(profileText),
    early: profile.years <= 3 || /应届|校招|实习|职业起步/.test(profileText),
    transition: /转型|跨行业|跨职能|重新开始|转向/.test(profileText),
    ai: /AI|人工智能|大模型|LLM|Agent|FDE|智能体/i.test(profileText),
    stateOwned: /央企|国企|事业单位|政企|运营商|研究院/.test(profileText),
    startup: /创业|初创|小团队|AI 公司|中型 AI/.test(profileText),
    international: /海外|国际|出海|外企|英文|英语|远程/.test(profileText),
    technical:
      profile.skills.coding >= 4 ||
      /工程师|开发|算法|技术|架构|Python|Java|TypeScript/i.test(
        profile.targetRoles,
      ),
  };

  const personalReason = (channel: Channel) => {
    if (channel.id === "direct" && (signals.senior || signals.transition)) {
      return "你的价值需要用案例和业务判断解释，定向触达比只过关键词筛选更有利。";
    }
    if (channel.id === "liepin" && signals.senior) {
      return `${profile.years} 年经验更适合进入中高端与猎头渠道。`;
    }
    if (channel.id === "maimai" && signals.transition) {
      return "转型期需要让别人理解迁移能力，职场关系与持续输出比冷投更重要。";
    }
    if (channel.id === "bonjour" && signals.ai) {
      return "你的目标岗位带有 AI / FDE / Agent 信号，垂直社区值得优先检查。";
    }
    if (channel.id === "guopin" && signals.stateOwned) {
      return "你的偏好或经历包含央国企、政企、运营商信号，应加入官方招聘渠道。";
    }
    if (channel.id === "boss" && signals.senior) {
      return "仍可用于直接沟通，但要用清晰价值主张抵消近期同岗年限不足。";
    }
    if (channel.id === "global" && signals.international) {
      return "画像包含国际、出海或远程偏好，可以投入英文渠道。";
    }
    if (channel.id === "nowcoder" && signals.early) {
      return "职业阶段偏早，校招、技术岗位和面经信息的价值更高。";
    }
    return "作为补充来源，用于扩大岗位样本并交叉核验机会。";
  };

  return channelCatalog
    .map((channel) => {
      const score = Math.max(
        20,
        Math.min(
          98,
          channel.baseScore +
            Object.entries(channel.weights).reduce(
              (total, [signal, weight]) =>
                total + (signals[signal as ChannelSignal] ? weight : 0),
              0,
            ),
        ),
      );
      return {
        ...channel,
        score,
        band: score >= 83 ? "主阵地" : score >= 68 ? "补充渠道" : "条件型",
        personalReason: personalReason(channel),
      } as RankedChannel;
    })
    .sort((a, b) => b.score - a.score);
}

function calculateMatch(job: Job, profile: Profile) {
  if (job.hardGate) return 0;
  const entries = Object.entries(job.requirements) as [SkillKey, number][];
  if (!entries.length) return 50;

  const weighted = entries.reduce((total, [key, need]) => {
    const current = profile.skills[key];
    const importance = need >= 4 ? 1.3 : 1;
    return total + Math.min(current / need, 1) * importance;
  }, 0);
  const max = entries.reduce((total, [, need]) => total + (need >= 4 ? 1.3 : 1), 0);
  let score = job.customScore ?? Math.round((weighted / max) * 88);

  const preferredLocations = profile.location
    .split(/[、,/，\s]+/)
    .filter(Boolean);
  if (
    preferredLocations.length &&
    !preferredLocations.some((place) => job.location.includes(place))
  ) {
    score -= 6;
  } else if (preferredLocations.length) {
    score += 4;
  }
  score -= job.confidencePenalty ?? 0;
  return Math.max(0, Math.min(score, 94));
}

function matchBand(score: number, hardGate?: string) {
  if (hardGate) return { label: "不符合硬条件", className: "blocked" };
  if (score >= 80) return { label: "接近靶心", className: "high" };
  if (score >= 65) return { label: "可重点校准", className: "medium" };
  return { label: "能力冲刺", className: "stretch" };
}

function analyzeJD(
  title: string,
  company: string,
  location: string,
  url: string,
  jd: string,
  profile: Profile,
): Job {
  const requirements: Partial<Record<SkillKey, number>> = {};
  (Object.keys(keywordGroups) as SkillKey[]).forEach((key) => {
    const hits = keywordGroups[key].filter((word) =>
      jd.toLowerCase().includes(word.toLowerCase()),
    ).length;
    if (hits) requirements[key] = Math.min(5, 2 + hits);
  });

  const detected = Object.keys(requirements) as SkillKey[];
  const splitProfileTerms = (value: string) =>
    value
      .split(/[、,，/；;\n]+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2);
  const strengthMatches = splitProfileTerms(profile.strengths)
    .filter((term) => jd.toLowerCase().includes(term.toLowerCase()))
    .slice(0, 4);
  const learningMatches = splitProfileTerms(profile.learning)
    .filter((term) => jd.toLowerCase().includes(term.toLowerCase()))
    .slice(0, 4);
  const strong = detected
    .filter((key) => profile.skills[key] >= (requirements[key] ?? 3))
    .slice(0, 3);
  const customScore = Math.max(
    35,
    Math.min(
      88,
      50 +
        strengthMatches.length * 8 -
        learningMatches.length * 2 +
        Math.min(detected.length, 5),
    ),
  );
  const gaps = detected
    .filter((key) => profile.skills[key] < (requirements[key] ?? 3))
    .sort(
      (a, b) =>
        (requirements[b] ?? 0) -
        profile.skills[b] -
        ((requirements[a] ?? 0) - profile.skills[a]),
    )
    .slice(0, 3);

  return {
    id: `imported-${Date.now()}`,
    title: title || "待命名岗位",
    company: company || "待填写公司",
    location: location || "地点待确认",
    salary: "待确认",
    source: "手动导入",
    sourceUrl: url,
    published: "来自你粘贴的 JD，发布时间需打开原页核验",
    verified: new Date().toISOString().slice(0, 10),
    category:
      /FDE|部署工程师|前沿部署/i.test(`${title} ${jd}`)
        ? "fde"
        : "solutions",
    tag: "刚刚分析",
    summary:
      "根据你粘贴的目标 JD 自动识别能力关键词，用来校准你和目标之间的差距。请打开原招聘页面复核薪资、地点、学历和岗位是否仍在招聘。",
    requirements:
      detected.length > 0
        ? requirements
        : { communication: 3, delivery: 3, product: 3 },
    advantages:
      strengthMatches.length > 0 || strong.length > 0
        ? [
            ...strengthMatches.map((term) => `你的“${term}”经历与 JD 直接相关`),
            ...strong.map((key) => `${skillMeta[key].label}已经接近目标要求`),
          ].slice(0, 4)
        : ["JD 信息较少，暂未识别出明确优势，请补充完整岗位描述"],
    watchouts:
      learningMatches.length > 0 || gaps.length > 0
        ? [
            ...learningMatches.map((term) => `你标记为正在补齐：${term}`),
            ...gaps.map((key) => `需要补强：${skillMeta[key].label}`),
          ].slice(0, 4)
        : ["暂未识别明显能力缺口，仍需人工核验硬性条件"],
    action: "先看清差距，再决定补作品、补技能、改简历或投递。",
    customScore,
    imported: true,
  };
}

export default function JobScout() {
  const [view, setView] = useState<View>("jobs");
  const [filter, setFilter] = useState<Filter>("imported");
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [draftProfile, setDraftProfile] = useState<Profile>(defaultProfile);
  const [importedJobs, setImportedJobs] = useState<Job[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string>("");
  const [toast, setToast] = useState("");
  const [usingDemoProfile, setUsingDemoProfile] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const savedProfile = window.localStorage.getItem("daxiang-job-scout-profile");
    const savedJobs = window.localStorage.getItem("daxiang-job-scout-jobs");
    const timer = window.setTimeout(() => {
      if (savedProfile) {
        try {
          const parsed = normalizeProfile(
            JSON.parse(savedProfile) as Partial<Profile>,
          );
          setProfile(parsed);
          setDraftProfile(parsed);
          setUsingDemoProfile(false);
        } catch {
          // Keep the safe default profile if local data is incomplete.
        }
      }
      if (savedJobs) {
        try {
          setImportedJobs(
            (JSON.parse(savedJobs) as Job[]).map((job) => ({
              ...job,
              published: job.published || "本地历史导入，发布时间需打开原页核验",
            })),
          );
        } catch {
          // Ignore invalid local entries.
        }
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const hasTargetJD = importedJobs.length > 0;
  const scoredTargetJobs = useMemo(
    () =>
      importedJobs
        .map((job) => ({ job, score: calculateMatch(job, profile) }))
        .sort((a, b) => b.score - a.score),
    [importedJobs, profile],
  );
  const scoredExampleJobs = useMemo(
    () =>
      seedJobs
        .map((job) => ({ job, score: calculateMatch(job, profile) }))
        .sort((a, b) => b.score - a.score),
    [profile],
  );
  const scoredJobs = useMemo(
    () => [...scoredTargetJobs, ...scoredExampleJobs],
    [scoredTargetJobs, scoredExampleJobs],
  );

  const filteredJobs = scoredJobs.filter(({ job, score }) => {
    if (filter === "all") return true;
    if (filter === "recommended") return Boolean(job.imported) && score >= 65 && !job.hardGate;
    if (filter === "imported") return Boolean(job.imported);
    if (filter === "examples") return !job.imported && !job.hardGate;
    return job.category === "reference";
  });

  const recommendedCount = scoredTargetJobs.filter(
    ({ job, score }) => score >= 65 && !job.hardGate,
  ).length;
  const filterCounts: Record<Filter, number> = {
    recommended: recommendedCount,
    imported: scoredTargetJobs.length,
    examples: scoredExampleJobs.filter(({ job }) => !job.hardGate).length,
    reference: scoredExampleJobs.filter(({ job }) => job.category === "reference").length,
    all: scoredJobs.length,
  };
  const topJob = scoredTargetJobs.find(({ job }) => !job.hardGate);
  const rankedChannels = useMemo(() => rankChannels(profile), [profile]);
  const primaryChannels = rankedChannels.filter(
    (channel) => channel.band === "主阵地",
  );

  const gapDemand = useMemo(() => {
    const demand = {} as Record<SkillKey, number>;
    (Object.keys(skillMeta) as SkillKey[]).forEach((key) => {
      demand[key] = 0;
    });
    scoredTargetJobs
      .filter(({ job }) => !job.hardGate)
      .slice(0, 6)
      .forEach(({ job }) => {
        (Object.entries(job.requirements) as [SkillKey, number][]).forEach(
          ([key, need]) => {
            demand[key] += Math.max(0, need - profile.skills[key]);
          },
        );
      });
    return (Object.entries(demand) as [SkillKey, number][])
      .sort((a, b) => b[1] - a[1])
      .filter(([, value]) => value > 0);
  }, [scoredTargetJobs, profile]);

  function saveProfile(event: FormEvent) {
    event.preventDefault();
    setProfile(draftProfile);
    setUsingDemoProfile(false);
    window.localStorage.setItem(
      "daxiang-job-scout-profile",
      JSON.stringify(draftProfile),
    );
    setProfileOpen(false);
    setToast("画像已保存在当前设备");
  }

  function submitJD(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const job = analyzeJD(
      String(data.get("title") ?? ""),
      String(data.get("company") ?? ""),
      String(data.get("location") ?? ""),
      String(data.get("url") ?? ""),
      String(data.get("jd") ?? ""),
      profile,
    );
    const next = [job, ...importedJobs];
    setImportedJobs(next);
    window.localStorage.setItem("daxiang-job-scout-jobs", JSON.stringify(next));
    setImportOpen(false);
    setFilter("imported");
    setExpandedId(job.id);
    setToast("目标 JD 已分析，差距地图已更新");
    event.currentTarget.reset();
  }

  function refreshJobPool() {
    setToast("当前不会根据画像自动抓取岗位；请粘贴你想分析的目标 JD");
  }

  function clearLocalData() {
    setProfile(defaultProfile);
    setDraftProfile(defaultProfile);
    setImportedJobs([]);
    setUsingDemoProfile(true);
    window.localStorage.removeItem("daxiang-job-scout-profile");
    window.localStorage.removeItem("daxiang-job-scout-jobs");
    setFilter("imported");
    setExpandedId("");
    setToast("已清空这台设备上的画像和目标 JD");
  }

  function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = [
      "职业靶心校准器试用反馈",
      "",
      `称呼：${String(data.get("name") ?? "") || "未填写"}`,
      `联系方式：${String(data.get("contact") ?? "") || "未填写"}`,
      `当前状态：${String(data.get("stage") ?? "") || "未填写"}`,
      `目标方向：${String(data.get("target") ?? "") || "未填写"}`,
      "",
      "试用感受：",
      String(data.get("feedback") ?? "") || "未填写",
      "",
      "哪里不准或看不懂：",
      String(data.get("confusion") ?? "") || "未填写",
    ].join("\n");
    const mailto = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(
      "职业靶心校准器试用反馈",
    )}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    setFeedbackOpen(false);
    setToast("已打开邮件草稿；发送后我就能收到你的反馈");
  }

  function resetProfile() {
    setDraftProfile(defaultProfile);
    setProfile(defaultProfile);
    setUsingDemoProfile(true);
    window.localStorage.removeItem("daxiang-job-scout-profile");
    setToast("已载入示例画像");
  }

  function startMyProfile() {
    setDraftProfile(emptyProfile);
    setProfileOpen(true);
  }

  function navigateTo(nextView: View) {
    setView(nextView);
    window.setTimeout(() => {
      document
        .getElementById("workspace")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function goHome() {
    router.push("/");
  }

  return (
    <main className="career-app">
      <header className="topbar">
        <button className="brand" onClick={goHome}>
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 48 48" role="img">
              <circle className="target-ring outer" cx="22" cy="26" r="15" />
              <circle className="target-ring middle" cx="22" cy="26" r="10" />
              <circle className="target-ring inner" cx="22" cy="26" r="5" />
              <path className="dart-shadow" d="M21 27 35 13" />
              <path className="dart-line" d="M22 26 37 11" />
              <path className="dart-tail" d="M36 12 36 4 44 4 40 8 44 12z" />
              <circle className="dart-point" cx="22" cy="26" r="2.4" />
            </svg>
          </span>
          <span>
            <strong>职业靶心校准器</strong>
            <small>大想的AI实践</small>
          </span>
        </button>
        <nav className="desktop-nav" aria-label="主导航">
          <button
            className={view === "jobs" ? "active" : ""}
            onClick={() => navigateTo("jobs")}
          >
            靶心校准
          </button>
          <button
            className={view === "capabilities" ? "active" : ""}
            onClick={() => navigateTo("capabilities")}
          >
            差距地图
          </button>
          <button
            className={view === "profile" ? "active" : ""}
            onClick={() => navigateTo("profile")}
          >
            我的画像
          </button>
        </nav>
        <div className="top-actions">
          <button className="button ghost profile-action" onClick={() => setProfileOpen(true)}>
            更新画像
          </button>
          <button className="button ghost feedback-action" onClick={() => setFeedbackOpen(true)}>
            试用反馈
          </button>
          <button className="button primary" onClick={() => setImportOpen(true)}>
            ＋ 导入目标 JD
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">CAREER TARGET CALIBRATOR · V1.1</span>
          <h1>
            <span className="hero-title-line">职业靶心校准器</span>
            <span className="hero-title-line">
              AI 帮你<span className="hero-emphasis">看清差距</span>
            </span>
          </h1>
          <p>
            AI 帮你看清：你离目标岗位还差什么。以终为始，先知道靶心在哪，
            才知道下一步该补哪项知识、技能和作品证据。
          </p>
          <div className="fit-note">
            它不会自动猜你的岗位。请粘贴一条你真正想去的 JD，再看你和这个目标之间的差距。
          </div>
          <div className="hero-actions">
            <button className="button primary large" onClick={() => setImportOpen(true)}>
              粘贴目标 JD 开始校准
            </button>
            <button
              className="text-link inline-button"
              onClick={startMyProfile}
            >
              先填写我的画像 ↘
            </button>
          </div>
          <div className="no-login-note">
            <span>无需注册登录</span>
            资料只保存在当前设备；你可以随时一键清空。
          </div>
        </div>
        <div className="scout-note">
          <div className="note-head">
            <span className="live-dot" />
            <span>{hasTargetJD ? "基于目标 JD" : "等待目标 JD"}</span>
            <small>{profile.name || "等待录入"}</small>
          </div>
          <p className="note-quote">
            “先别让系统猜，
            <strong>把你真正想去的岗位贴进来</strong>。”
          </p>
          <div className="note-route">
            <span>目标</span>
            {topJob?.job.title || profile.targetRoles || "请先导入目标 JD"}
          </div>
          <div className="note-route secondary">
            <span>偏差</span>
            {gapDemand[0]
              ? gapDemand
                  .slice(0, 4)
                  .map(([key]) => skillMeta[key].short)
                  .join(" · ")
              : "等待岗位分析"}
          </div>
        </div>
      </section>

      <section className="demo-banner" aria-label="当前画像说明">
        <div>
          <span>{usingDemoProfile ? "当前载入：示例画像" : "当前载入：你的个人画像"}</span>
          <p>
            {usingDemoProfile
              ? "示例用于让你先看懂产品；正式使用时，换成自己的经历和能力等级即可。"
              : "你的资料和目标 JD 只保存在当前浏览器，不需要登录。"}
          </p>
        </div>
        <button
          className="button ghost"
          onClick={usingDemoProfile ? startMyProfile : () => setProfileOpen(true)}
        >
          {usingDemoProfile ? "换成我的资料" : "继续完善画像"}
        </button>
      </section>

      <section className="stat-grid" aria-label="校准摘要">
        <article className="stat-card">
          <span>已导入目标</span>
          <strong>{importedJobs.length}</strong>
          <small>条来自用户自己的目标 JD</small>
        </article>
        <article className="stat-card">
          <span>靶心接近度</span>
          <strong>{topJob ? `${topJob.score}%` : "待校准"}</strong>
          <small>{topJob ? `${topJob.job.company} · ${topJob.job.title}` : "先粘贴目标 JD"}</small>
        </article>
        <article className="stat-card accent">
          <span>当前画像</span>
          <strong>{usingDemoProfile ? "示例画像" : profile.name || "待完善"}</strong>
          <small>{profile.years || 0} 年经验 · {profile.location || "地点待填写"}</small>
        </article>
        <article className="stat-card">
          <span>最大偏差</span>
          <strong>{gapDemand[0] ? skillMeta[gapDemand[0][0]].short : "待分析"}</strong>
          <small>{hasTargetJD ? "来自你导入的目标 JD" : "未导入目标 JD"}</small>
        </article>
      </section>

      <section className="calibration-strip" aria-label="校准报告">
        <div>
          <span className="section-kicker">CALIBRATION REPORT</span>
          <h2>{hasTargetJD ? "你的靶心不是“马上投”，而是知道差距怎么补" : "没有目标 JD，就不做假分析"}</h2>
        </div>
        <div className="calibration-grid">
          <article>
            <span>当前靶心</span>
            <strong>{topJob?.job.title ?? "等待用户导入目标 JD"}</strong>
            <p>{topJob ? `${topJob.job.company} · 靶心接近度 ${topJob.score}%` : "运营、产品、销售、FDE 都可以，但必须先有一条真实 JD。"}</p>
          </article>
          <article>
            <span>最大偏差</span>
            <strong>{gapDemand[0] ? skillMeta[gapDemand[0][0]].label : "等待分析"}</strong>
            <p>{hasTargetJD ? "用作品、项目复盘或真实练习来证明，不只写“了解”。" : "导入目标 JD 后，系统才会拆解岗位要求和能力差距。"}</p>
          </article>
          <article>
            <span>下一步</span>
            <strong>{hasTargetJD ? "补一项关键证据" : "粘贴一条真实目标 JD"}</strong>
            <p>{hasTargetJD ? "先补最大偏差对应的知识、技能或作品证据。" : "不要让系统猜你的方向；你想找运营，就贴运营 JD。"}</p>
          </article>
        </div>
      </section>

      <div id="workspace" className="workspace-anchor" aria-hidden="true" />
      <nav className="mobile-tabs" aria-label="移动端主导航">
        {[
          ["jobs", "靶心校准"],
          ["capabilities", "差距地图"],
          ["profile", "我的画像"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={view === key ? "active" : ""}
            onClick={() => navigateTo(key as View)}
          >
            {label}
          </button>
        ))}
        <button onClick={() => setFeedbackOpen(true)}>反馈</button>
      </nav>

      {view === "jobs" && (
        <section className="content-grid">
          <div className="job-column">
            <div className="section-head">
              <div>
                <span className="section-kicker">TARGET CALIBRATION</span>
                <h2>靶心校准</h2>
              </div>
              <div className="filter-row">
                {[
                  ["imported", "我的目标 JD"],
                  ["examples", "示例靶样"],
                  ["reference", "参考靶样"],
                  ["all", "全部"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    className={filter === key ? "active" : ""}
                    onClick={() => setFilter(key as Filter)}
                  >
                    {label}<small>{filterCounts[key as Filter]}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="data-status">
              <div>
                <span>不会根据画像自动抓取岗位</span>
                <strong>要分析运营、产品、销售或 FDE，请先粘贴对应的真实目标 JD</strong>
                <p>
                  内置 JD 只是演示靶样，不会冒充你的个人目标。当前版本不会自动联网抓取符合你条件的职位；
                  你从招聘页复制一条 JD 进来后，系统才会按你的画像做差距校准。
                </p>
              </div>
              <button className="button ghost" onClick={refreshJobPool}>
                为什么要粘贴 JD？
              </button>
            </div>

            <div className="job-list">
              {filteredJobs.map(({ job, score }, index) => {
                const band = matchBand(score, job.hardGate);
                const isOpen = expandedId === job.id;
                return (
                  <article
                    className={`job-card ${isOpen ? "open" : ""}`}
                    key={job.id}
                  >
                    <button
                      className="job-summary"
                      onClick={() => setExpandedId(isOpen ? "" : job.id)}
                      aria-expanded={isOpen}
                    >
                      <span className="job-rank">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="job-main">
                        <span className="job-flags">
                          <i className={`fit-pill ${band.className}`}>
                            {band.label}
                          </i>
                          <i className="plain-pill">{job.tag}</i>
                          {job.imported && <i className="plain-pill">本地导入</i>}
                        </span>
                        <strong>{job.title}</strong>
                        <span className="job-meta">
                          {job.company} · {job.location} · {job.salary}
                        </span>
                        <span className="job-timing">
                          {job.published} · 核验 {job.verified}
                        </span>
                      </span>
                      <span className="score-block">
                        <strong>{score}</strong>
                        <small>靶心接近</small>
                      </span>
                      <span className="chevron">{isOpen ? "−" : "+"}</span>
                    </button>
                    {isOpen && (
                      <div className="job-detail">
                        <p className="job-description">{job.summary}</p>
                        {job.hardGate && (
                          <div className="hard-gate">
                            硬条件：{job.hardGate}
                          </div>
                        )}
                        <div className="detail-columns">
                          <div>
                            <h3>靠近靶心的部分</h3>
                            <ul className="check-list">
                              {job.advantages.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h3>需要核验 / 补齐</h3>
                            <ul className="gap-list">
                              {job.watchouts.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                        <div className="job-action">
                          <span>
                            <small>建议动作</small>
                            {job.action}
                          </span>
                          {job.sourceUrl ? (
                            <a
                              href={job.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              查看原岗位 ↗
                            </a>
                          ) : (
                            <span className="source-missing">请补充原岗位链接</span>
                          )}
                        </div>
                        <div className="job-foot">
                          来源：{job.source} · 发布时间/更新：{job.published} · 最后核验：
                          {job.verified} ·
                          靶心接近度用于校准方向，不代表录用概率
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
              {filteredJobs.length === 0 && (
                <div className="empty-state">
                  <strong>还不能分析，因为没有你的目标 JD</strong>
                  <p>
                    如果你想找运营，就粘贴一条运营 JD；想找产品，就粘贴产品 JD。
                    没有真实目标，系统不会拿别的岗位样本来假装分析你。
                  </p>
                  <button className="button primary" onClick={() => setImportOpen(true)}>
                    粘贴目标 JD
                  </button>
                </div>
              )}
            </div>
          </div>

          <aside className="side-column">
            <article className="side-card next-step">
              <span className="section-kicker">NEXT BEST ACTION</span>
              <h3>先看偏差，再补证据</h3>
              <strong>
                {usingDemoProfile
                  ? "先换成你的画像，再导入目标 JD"
                  : hasTargetJD
                    ? "补一项关键证据"
                    : "粘贴你真正想去的岗位 JD"}
              </strong>
              <p>
                没有目标 JD，差距分析就没有靶心。真正重要的是：你的当前能力和目标要求之间差哪几块。
              </p>
              <div className="progress-line">
                <span style={{ width: usingDemoProfile ? "35%" : "72%" }} />
              </div>
              <small>
                {hasTargetJD ? "已基于你的目标 JD 计算" : "等待目标 JD，不自动抓取岗位"}
              </small>
            </article>

            <article className="side-card">
              <div className="side-title">
                <h3>最大偏差</h3>
                <button onClick={() => navigateTo("capabilities")}>看差距地图</button>
              </div>
              <div className="gap-stack">
                {gapDemand.slice(0, 4).map(([key, value], index) => (
                  <div className="gap-item" key={key}>
                    <span>{index + 1}</span>
                    <div>
                      <strong>{skillMeta[key].label}</strong>
                      <small>{skillMeta[key].description}</small>
                    </div>
                    <i>{value}</i>
                  </div>
                ))}
              </div>
            </article>

            <article className="side-card feedback-card">
              <span className="section-kicker">BETA FEEDBACK</span>
              <h3>试用后告诉我哪里不准</h3>
              <p>如果判断不符合你的情况，或者你看不懂某个结论，请直接反馈给我。</p>
              <button className="button primary" onClick={() => setFeedbackOpen(true)}>
                发送试用反馈
              </button>
            </article>
          </aside>
        </section>
      )}

      {view === "channels" && (
        <section className="single-view channel-view">
          <div className="view-intro">
            <span className="section-kicker">TARGET PRACTICE FIELD</span>
            <h2>找到能让你靠近靶心的真实练习场</h2>
            <p>
              这些公开来源只用来帮你找到真实 JD 靶样和练习场景。
              核心不是多投递，而是持续校准：目标岗位到底要求什么，你当前还差哪一块。
            </p>
          </div>

          <div className="channel-summary">
            <div>
              <span>当前判断</span>
              <strong>
                {profile.years || 0} 年经验 · {profile.careerStage || "职业阶段待填写"}
              </strong>
              <p>{profile.companyPreference || "组织类型暂未设置"}</p>
            </div>
            <div>
              <span>建议观察场</span>
              <strong>
                {primaryChannels
                  .slice(0, 3)
                  .map((channel) => channel.name)
                  .join(" · ") || "先完善画像"}
              </strong>
              <p>用公开 JD 做靶样，用作品和项目证据一点点靠近目标要求。</p>
            </div>
            <button className="button primary" onClick={() => setProfileOpen(true)}>
              调整职业阶段
            </button>
          </div>

          <div className="channel-grid">
            {rankedChannels.map((channel, index) => (
              <article className={`channel-card band-${channel.band}`} key={channel.id}>
                <div className="channel-card-head">
                  <span className="channel-rank">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <i>{channel.kind}</i>
                    <h3>{channel.name}</h3>
                  </div>
                  <div className="channel-score">
                    <strong>{channel.score}</strong>
                    <span>{channel.band}</span>
                  </div>
                </div>
                <p className="personal-reason">{channel.personalReason}</p>
                <dl>
                  <div>
                    <dt>为什么看</dt>
                    <dd>{channel.reason}</dd>
                  </div>
                  <div>
                    <dt>怎么使用</dt>
                    <dd>{channel.method}</dd>
                  </div>
                  <div>
                    <dt>注意什么</dt>
                    <dd>{channel.caution}</dd>
                  </div>
                </dl>
                <a href={channel.url} target="_blank" rel="noreferrer">
                  查看公开来源 <span>↗</span>
                </a>
                <small>核验：{channel.verified}</small>
              </article>
            ))}
          </div>

          <div className="source-disclosure">
            <div>
              <span className="section-kicker">DATA SOURCE NOTE</span>
              <h2>目前不是自动抓取器</h2>
            </div>
            <div>
              <p>
                当前岗位池来自公开招聘页，由人工检索、阅读 JD 后整理录入，来源包括
                Bonjour.bio、智联招聘、BeBee/猎聘 和牛客。它不是完整招聘市场。
              </p>
              <p>
                网站不会后台登录、批量抓取或绕过招聘平台限制。你可以打开推荐渠道，
                把公开 JD 粘贴回来，在当前浏览器完成差距校准。当前岗位池为
                2026-07-27 人工联网核验版本，岗位是否仍在招聘以原页为准。
              </p>
            </div>
          </div>

          <article className="channel-principle">
            <span>给资深转型者的原则</span>
            <strong>
              公开 JD 负责定义靶心，行业关系负责解释价值，作品负责证明你正在靠近。
            </strong>
            <p>
              如果你的经历复杂、岗位名称发生变化，就更需要先把目标拆清楚，再决定补什么能力证据。
            </p>
          </article>
        </section>
      )}

      {view === "capabilities" && (
        <section className="single-view">
          <div className="view-intro">
            <span className="section-kicker">GAP MAP</span>
            <h2>你和目标岗位之间，差的不是一句“我不会”</h2>
            <p>
              这里把目标岗位拆成能力靶点，再对照你的当前画像：
              哪些已经靠近靶心，哪些需要用知识、技能、项目和作品继续补齐。
            </p>
          </div>
          <div className="capability-grid">
            {(Object.keys(skillMeta) as SkillKey[]).map((key) => {
              const value = profile.skills[key];
              const state =
                value >= 4 ? "已有优势" : value >= 2 ? "正在形成" : "重点补齐";
              return (
                <article className="capability-card" key={key}>
                  <div className="capability-head">
                    <span>{skillMeta[key].short.slice(0, 1)}</span>
                    <i className={`level-${value}`}>{state}</i>
                  </div>
                  <h3>{skillMeta[key].label}</h3>
                  <p>{skillMeta[key].description}</p>
                  <div className="level-dots" aria-label={`五级能力中的 ${value} 级`}>
                    {[1, 2, 3, 4, 5].map((level) => (
                      <span className={level <= value ? "filled" : ""} key={level} />
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
          <article className="roadmap">
            <div>
              <span className="section-kicker">ACTION BRIDGE</span>
              <h2>三步把“我想去”变成“我正在靠近”</h2>
            </div>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <strong>先确定靶心</strong>
                  <p>选一个真实目标 JD，不要同时追十个方向。</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>看清偏差</strong>
                  <p>把岗位要求拆成能力项，找出当前最拖后的 1～2 个靶点。</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>用证据靠近靶心</strong>
                  <p>用一个作品、一页复盘或一次真实练习，把差距补成可展示的证据。</p>
                </div>
              </li>
            </ol>
          </article>
        </section>
      )}

      {view === "profile" && (
        <section className="single-view profile-view">
          <div className="profile-banner">
            <div className="avatar">{profile.name.trim().slice(0, 1) || "你"}</div>
            <div>
              <span className="section-kicker">YOUR WORKING PROFILE</span>
              <h2>{profile.name}的求职画像</h2>
              <p>{profile.headline}</p>
            </div>
            <button className="button primary" onClick={() => setProfileOpen(true)}>
              编辑画像
            </button>
          </div>
          <div className="profile-layout">
            <article className="profile-story">
              <h3>你的主叙事</h3>
              <blockquote>“{profile.headline || "请用一句话说清楚：你是谁，你能解决什么问题。"}”</blockquote>
              <p>{profile.story || "补充你的关键经历、行业背景、代表项目和正在形成的新能力。"}</p>
            </article>
            <article className="profile-facts">
              <h3>筛选条件</h3>
              <dl>
                <div>
                  <dt>工作经验</dt>
                  <dd>{profile.years || 0} 年</dd>
                </div>
                <div>
                  <dt>优先地点</dt>
                  <dd>{profile.location}</dd>
                </div>
                <div>
                  <dt>目标岗位</dt>
                  <dd>{profile.targetRoles}</dd>
                </div>
                <div>
                  <dt>职业阶段</dt>
                  <dd>{profile.careerStage}</dd>
                </div>
                <div>
                  <dt>偏好组织</dt>
                  <dd>{profile.companyPreference}</dd>
                </div>
                <div>
                  <dt>最低月薪</dt>
                  <dd>{profile.minSalary}K 起</dd>
                </div>
                <div>
                  <dt>出差偏好</dt>
                  <dd>{profile.travel}</dd>
                </div>
              </dl>
            </article>
          </div>
          <div className="privacy-strip">
            <span>隐私设计</span>
            <strong>你的编辑内容只保存在当前浏览器，不会自动上传。</strong>
            <p>请勿粘贴客户名称、投标机密、联系方式或公司内部材料。</p>
            <button className="button ghost" onClick={clearLocalData}>
              清空我的本地数据
            </button>
          </div>
        </section>
      )}

      <footer>
        <div>
          <strong>职业靶心校准器</strong>
          <span>大想的AI实践 · 01</span>
        </div>
        <p>以终为始，先瞄准靶心，再一步一步靠近。</p>
      </footer>

      {profileOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-label="编辑求职画像">
            <div className="modal-head">
              <div>
                <span className="section-kicker">EDIT PROFILE</span>
                <h2>更新你的求职画像</h2>
              </div>
              <button className="close-button" onClick={() => setProfileOpen(false)}>
                ×
              </button>
            </div>
            <form onSubmit={saveProfile}>
              <div className="form-grid">
                <label>
                  怎么称呼你
                  <input
                    required
                    value={draftProfile.name}
                    onChange={(event) =>
                      setDraftProfile({ ...draftProfile, name: event.target.value })
                    }
                  />
                </label>
                <label>
                  工作年限
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={draftProfile.years}
                    onChange={(event) =>
                      setDraftProfile({
                        ...draftProfile,
                        years: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  优先地点
                  <input
                    required
                    value={draftProfile.location}
                    onChange={(event) =>
                      setDraftProfile({
                        ...draftProfile,
                        location: event.target.value,
                      })
                    }
                    placeholder="北京、远程"
                  />
                </label>
                <label>
                  可接受最低月薪（K）
                  <input
                    type="number"
                    min="0"
                    value={draftProfile.minSalary}
                    onChange={(event) =>
                      setDraftProfile({
                        ...draftProfile,
                        minSalary: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="full">
                  一句话定位
                  <input
                    required
                    value={draftProfile.headline}
                    onChange={(event) =>
                      setDraftProfile({
                        ...draftProfile,
                        headline: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="full">
                  目标岗位
                  <input
                    required
                    value={draftProfile.targetRoles}
                    onChange={(event) =>
                      setDraftProfile({
                        ...draftProfile,
                        targetRoles: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  出差偏好
                  <select
                    value={draftProfile.travel}
                    onChange={(event) =>
                      setDraftProfile({
                        ...draftProfile,
                        travel: event.target.value,
                      })
                    }
                  >
                    <option>可接受</option>
                    <option>可评估</option>
                    <option>尽量不出差</option>
                  </select>
                </label>
                <label>
                  当前职业阶段
                  <select
                    value={draftProfile.careerStage}
                    onChange={(event) =>
                      setDraftProfile({
                        ...draftProfile,
                        careerStage: event.target.value,
                      })
                    }
                  >
                    <option>职业起步（0～3年）</option>
                    <option>稳定成长（3～8年）</option>
                    <option>资深发展（8年以上）</option>
                    <option>资深转型（8年以上）</option>
                    <option>跨行业 / 跨职能转型</option>
                    <option>自由职业 / 灵活就业</option>
                  </select>
                </label>
                <label className="full">
                  偏好的公司或组织类型
                  <input
                    value={draftProfile.companyPreference}
                    onChange={(event) =>
                      setDraftProfile({
                        ...draftProfile,
                        companyPreference: event.target.value,
                      })
                    }
                    placeholder="例如：AI 创业公司 / 上市公司 / 央国企 / 外企 / 远程团队"
                  />
                </label>
                <label>
                  已有优势
                  <input
                    required
                    value={draftProfile.strengths}
                    onChange={(event) =>
                      setDraftProfile({
                        ...draftProfile,
                        strengths: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="full">
                  正在补齐
                  <input
                    value={draftProfile.learning}
                    onChange={(event) =>
                      setDraftProfile({
                        ...draftProfile,
                        learning: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="full">
                  经历摘要
                  <textarea
                    rows={4}
                    value={draftProfile.story}
                    onChange={(event) =>
                      setDraftProfile({
                        ...draftProfile,
                        story: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
              <div className="skill-editor">
                <div className="skill-editor-head">
                  <div>
                    <span className="section-kicker">SELF ASSESSMENT</span>
                    <h3>给自己的能力打个初始等级</h3>
                  </div>
                  <p>1 是刚起步，3 是能独立完成，5 是可以带别人做。</p>
                </div>
                <div className="skill-editor-grid">
                  {(Object.keys(skillMeta) as SkillKey[]).map((key) => (
                    <label className="skill-range" key={key}>
                      <span>
                        <strong>{skillMeta[key].label}</strong>
                        <i>{draftProfile.skills[key]} / 5</i>
                      </span>
                      <input
                        type="range"
                        min="1"
                        max="5"
                        step="1"
                        value={draftProfile.skills[key]}
                        onChange={(event) =>
                          setDraftProfile({
                            ...draftProfile,
                            skills: {
                              ...draftProfile.skills,
                              [key]: Number(event.target.value),
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
              <div className="modal-note">
                不需要登录。保存后，画像和手动导入的目标 JD 只会留在这台设备的当前浏览器。
              </div>
              <div className="modal-actions">
                <button type="button" className="button ghost" onClick={resetProfile}>
                  载入示例画像
                </button>
                <button type="submit" className="button primary">
                  保存并重新计算
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {importOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal wide" role="dialog" aria-modal="true" aria-label="导入目标 JD">
            <div className="modal-head">
              <div>
                <span className="section-kicker">TARGET JD</span>
                <h2>粘贴目标 JD，看你离靶心差在哪</h2>
                <p>所有分析都在当前浏览器完成。请只粘贴公开招聘信息，不要粘贴隐私或内部资料。</p>
              </div>
              <button className="close-button" onClick={() => setImportOpen(false)}>
                ×
              </button>
            </div>
            <form onSubmit={submitJD}>
              <div className="form-grid">
                <label>
                  目标岗位名称
                  <input name="title" required placeholder="例如：企业 AI 解决方案顾问" />
                </label>
                <label>
                  公司
                  <input name="company" required placeholder="公司名称" />
                </label>
                <label>
                  地点
                  <input name="location" placeholder="北京 / 上海 / 远程" />
                </label>
                <label>
                  原岗位链接
                  <input name="url" type="url" placeholder="https://..." />
                </label>
                <label className="full">
                  目标 JD 描述
                  <textarea
                    name="jd"
                    rows={10}
                    required
                    placeholder="复制岗位职责、任职要求和硬性条件。系统会结合你的画像，帮你找出离目标岗位最近和最偏离的能力点。"
                  />
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" className="button ghost" onClick={() => setImportOpen(false)}>
                  取消
                </button>
                <button type="submit" className="button primary">
                  生成差距分析
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {feedbackOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal wide" role="dialog" aria-modal="true" aria-label="试用反馈">
            <div className="modal-head">
              <div>
                <span className="section-kicker">BETA FEEDBACK</span>
                <h2>告诉我哪里不准，哪里看不懂</h2>
                <p>
                  这会生成一封发给 {FEEDBACK_EMAIL} 的邮件草稿。正式发送前你可以自己再检查一遍。
                </p>
              </div>
              <button className="close-button" onClick={() => setFeedbackOpen(false)}>
                ×
              </button>
            </div>
            <form onSubmit={submitFeedback}>
              <div className="form-grid">
                <label>
                  怎么称呼你
                  <input name="name" placeholder="昵称即可" />
                </label>
                <label>
                  联系方式
                  <input name="contact" placeholder="邮箱 / 微信 / 小红书号，可不填" />
                </label>
                <label>
                  当前状态
                  <select name="stage" defaultValue="正在校准方向">
                    <option>正在校准方向</option>
                    <option>准备投简历</option>
                    <option>正在转型 AI 岗位</option>
                    <option>只是先体验一下</option>
                  </select>
                </label>
                <label>
                  目标方向
                  <input name="target" placeholder="例如：AI 产品 / 解决方案 / 交付 / FDE" />
                </label>
                <label className="full">
                  试用感受
                  <textarea
                    name="feedback"
                    rows={4}
                    required
                    placeholder="哪些地方对你有帮助？你试到哪一步卡住了？"
                  />
                </label>
                <label className="full">
                  哪里不准或看不懂
                  <textarea
                    name="confusion"
                    rows={4}
                    placeholder="比如：岗位不适合我、能力缺口不准、按钮不知道点哪个、数据看起来不像最新..."
                  />
                </label>
              </div>
              <div className="modal-note">
                当前版本不会自动上传你的画像和 JD。反馈内容会通过你的邮件客户端发出。
              </div>
              <div className="modal-actions">
                <button type="button" className="button ghost" onClick={() => setFeedbackOpen(false)}>
                  取消
                </button>
                <button type="submit" className="button primary">
                  生成反馈邮件
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
