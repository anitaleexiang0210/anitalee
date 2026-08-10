export const profile = {
  name: "Anita / 大想",
  handle: "anitalee",
  role: "企业 AI 产品与解决方案 / 产品型 FDE",
  tags: ["产品型 FDE", "需求诊断", "AI 落地"],
  statement: "把复杂需求听明白，把落地方案做出来",
  introduction:
    "近 20 年，我从用户研究、交互与产品设计，一路走到企业服务、商务和集成交付，经历覆盖消费互联网、CRM / SaaS 与央企数字化。现在，我专注企业 AI 落地：从真实业务问题出发，协同客户、业务与技术团队，把需求变成可验证、可交付的产品和解决方案。",
  target:
    "目前关注企业内部 AI 提效、AI 产品与解决方案及产品型 FDE 机会，也欢迎围绕企业 AI 落地、工具共创与小型交流联系我。北京优先，可远程。",
};

export const contact = {
  email: "anitaleexiang@gmail.com",
  xiaohongshu: "https://xhslink.cn/m/4MP1RrEDtWQ",
  resumeLabel: "获取 PDF 简历",
  resumeHref: "/%E5%A4%A7%E6%83%B3-%E4%BC%81%E4%B8%9AAI%E5%AE%9E%E8%B7%B5-%E7%AE%80%E5%8E%86.pdf",
};

export const evidence = [
  {
    value: "约 20 年",
    label: "产品、用研与企业服务经验",
  },
  {
    value: "150+",
    label: "在销售易亲自完成的产品设计",
  },
  {
    value: "2 封",
    label: "昆仑数智期间获得的集团感谢信",
  },
  {
    value: "73 个",
    label: "政务集成项目中亲自沟通的终端客户",
  },
];

export const capabilities = [
  {
    index: "01",
    title: "需求调研与场景诊断",
    body: "通过访谈、观察、追问和资料分析，找到客户真正要解决的问题、约束条件和判断标准。",
  },
  {
    index: "02",
    title: "复杂业务产品化",
    body: "把业务规则整理成流程、原型、需求规格和可讨论的方案，让抽象问题变得可执行。",
  },
  {
    index: "03",
    title: "多方协同与企业交付",
    body: "能在客户、业务、研发、厂商与管理者之间推进共识，跟进设计、验收、培训和汇报。",
  },
  {
    index: "04",
    title: "倾听、风险与验证",
    body: "心理咨询训练让我更善于倾听、追问和建立信任；投标、合同与网络安全经历让我对风险、边界和可验证结果保持敏感。",
  },
];

export const cases = [
  {
    period: "2019—2021",
    company: "昆仑数智",
    category: "央企数字化 / 产品交付",
    title: "从集团任务到试点培训，走完整个产品交付闭环",
    summary:
      "在研究院平台技术部担任产品设计师，参与综合办公管理平台、石油办公 APP 与移动办公产品。工作覆盖项目计划、客户调研、需求规格、原型设计、厂商质量验证、试点培训和集团汇报。",
    highlights: [
      "综合办公管理平台 1.0",
      "石油办公 APP 智能交互助手",
      "需求、设计、验收、培训全流程",
    ],
    result: "2020 年两获集团感谢信：一次因防疫技术支持，一次因综合办公管理平台 1.0 顺利上线。",
    tone: "sage",
  },
  {
    period: "2015—2019",
    company: "销售易",
    category: "企业 SaaS / CRM",
    title: "在复杂 CRM 业务中，持续把需求变成可落地设计",
    summary:
      "在销售云组担任资深设计经理。三年多时间亲自完成 150 余项设计，既承担复杂产品设计，也负责方案把控、对外联络、人员分配和工作协调。",
    highlights: [
      "商机流程、权限与审批",
      "BI 1.0 与电销平台",
      "移动端详情页与关系可视化",
    ],
    result: "获得 2015 年度最佳新人奖、2016 年度能量之星。",
    tone: "rose",
  },
  {
    period: "2025—现在",
    company: "企业商务与集成交付",
    category: "政务项目 / 商务协同",
    title: "从产品设计走到客户与合同现场，补齐企业交付视角",
    summary:
      "近年在商务岗位接触招投标、合同、采购、集成与项目沟通。参与约 680 万元市级政务集成项目，亲自对接 73 个终端客户；也参与国产算力服务器集成与北京市级科研课题项目。",
    highlights: [
      "招投标与合同协同",
      "73 个终端客户沟通",
      "服务器集成与科研课题",
    ],
    result: "进一步理解企业采购链条、交付约束与多方协作现场。",
    tone: "amber",
  },
];

export const aiProjects = [
  {
    status: "已上线，验证中",
    title: "职业靶心校准器",
    summary:
      "转型时发现和理想岗位之间的差距不透明，于是做了这个工具。对照真实招聘要求，输出能力差距和下一步行动。从给自己用到抽象成通用流程，克制了接入 AI 动态抓取的冲动，先跑通静态闭环。我负责需求、规则和判断，AI 辅助前端实现。这是第一个 AI 协作完成的全流程产品，下一阶段计划收集用户反馈并接入动态数据。",
    proof: ["需求判断", "规则设计", "AI 协作实现", "公开部署"],
    image: "/career-calibrator.png",
    imageAlt: "职业靶心校准器已上线页面截图",
    href: "/career",
    linkLabel: "打开在线版本",
  },
  {
    status: "已上线",
    title: "文档渡口 · Markdown 与 Word 互转",
    summary:
      "浏览器本地完成 Markdown 与 Word (.docx) 双向转换，不上传云端，不破坏结构。支持标题、列表、链接、代码块、表格与图片打包；并尝试处理常见 LaTeX 公式、UTF-8 / UTF-16 / GBK 中文编码与可逆的典型乱码。适合经常在编辑器和 Word 之间切换的内容与产品同事。",
    proof: ["本地处理", "图片打包", "公式与编码", "双向转换"],
    image: "/ferry-tool.png",
    imageAlt: "文档渡口在线工具界面截图",
    href: "https://anitalee.cn/ferry",
    linkLabel: "打开在线版本",
  },
  {
    status: "建设中",
    title: "企业 AI 需求访谈与场景诊断助手",
    summary:
      "把企业“想用 AI”的模糊愿望，拆成业务问题、使用者、数据条件、风险边界、价值判断与验证计划。",
    proof: ["访谈框架", "场景评分", "方案建议", "风险边界"],
    imageAlt: "项目界面与访谈资料待补充",
  },
  {
    status: "规划中",
    title: "企业知识与投标辅助场景",
    summary:
      "探索在严格脱敏和人工复核条件下，用 AI 辅助企业资料查找、投标检查与交付准备。",
    proof: ["企业文档", "人工复核", "安全意识", "交付辅助"],
    imageAlt: "项目方案与验证结果待补充",
  },
];

export const careerPhases = [
  {
    period: "2006—2015",
    title: "从软件测试到用户研究与交互设计",
    detail:
      "在飞图科技、中国数码、悠易互通与安世亚太工作，积累用户访谈、可用性研究、交互设计与售前原型经验。",
  },
  {
    period: "2015—2023",
    title: "深耕企业 SaaS 与央企数字化产品",
    detail:
      "先后在销售易、纷享销客、昆仑数智与和创科技工作，覆盖 CRM、协同办公和工程数字化等复杂企业场景。",
  },
  {
    period: "2023—2025",
    title: "学习心理咨询技术",
    detail:
      "系统学习倾听、澄清和关系建立，并尝试家庭教育与内容实践。这段经历成为理解客户与使用者的另一种底层能力。",
  },
  {
    period: "2025—现在",
    title: "走进商务、投标、合同与集成交付现场",
    detail:
      "在国企及网络安全企业从事商务工作，补充企业采购、项目协同、客户沟通与交付约束经验，同时转向企业 AI 实践。",
  },
];

export const credentials = [
  "自动化专业 大学本科",
  "CISP-AISS（注册信息安全专业人员 — 人工智能安全）",
  "中科院心理所心理咨询师证书",
  "北京大学儿童青少年心理咨询长程培训结业证书",
];

export const navigation = [
  { label: "能力", href: "#capabilities" },
  { label: "经历", href: "#experience" },
  { label: "AI 实践", href: "#ai-work" },
  { label: "关于我", href: "#about" },
  { label: "联系我", href: "#contact" },
];
