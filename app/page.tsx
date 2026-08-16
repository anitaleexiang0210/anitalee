import {
  aiProjects,
  capabilities,
  careerPhases,
  cases,
  contact,
  credentials,
  evidence,
  navigation,
  profile,
} from "./content";

function SectionIntro({
  label,
  title,
  body,
}: {
  label: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="section-intro">
      <p className="section-label">{label}</p>
      <h2>{title}</h2>
      {body ? <p className="section-description">{body}</p> : null}
    </div>
  );
}

export default function Home() {
  return (
    <main>
      <header className="hero" id="top">
        <nav className="shell topbar" aria-label="主要导航">
          <a className="brand" href="#top" aria-label="回到首页">
            <span className="brand-name">
              <strong>大想</strong>
              <span>{profile.handle}</span>
            </span>
            <span className="brand-tags">
              {profile.tags.map((tag) => (
                <span className="brand-tag" key={tag}>{tag}</span>
              ))}
            </span>
          </a>
          <div className="nav-links">
            {navigation.map((item) => (
              <a href={item.href} key={item.href}>
                {item.label}
              </a>
            ))}
          </div>
        </nav>

        <div className="shell hero-content">
          <div className="identity-line">
            <img className="portrait" src="/portrait.jpg" alt="Anita / 大想" />
            <div>
              <p className="role">{profile.role}</p>
              <h1>{profile.name}</h1>
            </div>
          </div>

          <p className="hero-statement">{profile.statement}</p>
          <p className="hero-introduction">{profile.introduction}</p>

          <div className="hero-actions">
            <a className="primary-link" href="#experience">
              看代表经历 <span aria-hidden="true">↓</span>
            </a>
            <a className="text-link" href="#ai-work">
              看 AI 实践
            </a>
          </div>

          <p className="target-note">
            <strong>机会与合作：</strong>
            {profile.target}
          </p>
        </div>

        <div className="shell evidence-grid" aria-label="职业证据速览">
          {evidence.map((item) => (
            <div className="evidence-item" key={item.label}>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </header>

      <section className="section shell" id="capabilities">
        <SectionIntro
          label="我能带来的能力"
          title="不只做界面，更擅长把问题从模糊带到清楚"
          body="这些能力来自长期的产品实践、客户现场与心理咨询训练，也正是我转向企业 AI 产品和解决方案工作的基础。"
        />
        <div className="capability-list">
          {capabilities.map((item) => (
            <article className="capability-item" key={item.title}>
              <span>{item.index}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section section-tint" id="experience">
        <div className="shell">
          <SectionIntro
            label="代表经历"
            title="先看我做成过什么，再看我准备去哪里"
            body="我没有把所有公司和项目都铺开，只保留最能说明复杂产品、企业交付与客户沟通能力的四段证据。"
          />

          <div className="case-list">
            {cases.map((item, index) => (
              <article className={`case-item case-${item.tone}`} key={item.title}>
                <div className="case-meta">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{item.period}</p>
                  <strong>{item.company}</strong>
                  <small>{item.category}</small>
                </div>
                <div className="case-body">
                  <h3>{item.title}</h3>
                  <p>{item.summary}</p>
                  <ul aria-label={`${item.company}经历要点`}>
                    {item.highlights.map((highlight) => (
                      <li key={highlight}>{highlight}</li>
                    ))}
                  </ul>
                  <p className="case-result">{item.result}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section shell" id="ai-work">
        <SectionIntro
          label="当前 AI 实践"
          title="用真实项目，把转型变成可以检查的证据"
          body="我不把尚未完成的想法包装成成果。这里会持续记录问题、判断、方案、实现、验证与复盘，项目成熟后再补充完整案例。"
        />

        <div className="project-grid">
          {aiProjects.map((project, index) => (
            <article
              className={`project-card ${index === 0 ? "project-featured" : ""}`}
              key={project.title}
            >
              <div
                className={`project-visual ${project.image ? "has-image" : "is-placeholder"}`}
              >
                {project.image ? (
                  <img src={project.image} alt={project.imageAlt} />
                ) : (
                  <div>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <p>{project.imageAlt}</p>
                  </div>
                )}
              </div>
              <div className="project-copy">
                <p className="project-status">{project.status}</p>
                <h3>{project.title}</h3>
                <p>{project.summary}</p>
                <ul aria-label={`${project.title}能力证据`}>
                  {project.proof.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                {project.href ? (
                  <a href={project.href} target="_blank" rel="noreferrer">
                    {project.linkLabel} <span aria-hidden="true">↗</span>
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section section-dark" id="about">
        <div className="shell about-layout">
          <SectionIntro
            label="职业路径"
            title="我的经历不算笔直，但每一段都留下了今天能用的能力"
            body="产品让我会梳理复杂问题，心理咨询训练让我更会倾听，商务与交付让我理解企业现场。现在，这些线索正在企业 AI 产品与解决方案实践中重新汇合。"
          />

          <div className="timeline">
            {careerPhases.map((phase) => (
              <article className="timeline-item" key={phase.period}>
                <p>{phase.period}</p>
                <div>
                  <h3>{phase.title}</h3>
                  <span>{phase.detail}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section shell education-section">
        <SectionIntro
          label="教育与训练"
          title="跨学科背景，服务于理解人和解决问题"
        />
        <ul className="credential-list">
          {credentials.map((credential) => (
            <li key={credential}>{credential}</li>
          ))}
        </ul>
      </section>

      <footer className="contact-section" id="contact">
        <div className="shell contact-layout">
          <div>
            <p className="section-label">联系我</p>
            <h2>关于企业 AI 产品、解决方案与交付，我们可以聊聊</h2>
          </div>
          <div className="contact-details">
            <p className="contact-item">
              <a href={`mailto:${contact.email}`}>邮件联系</a>
            </p>
            <p className="contact-item">
              <a href={contact.resumeHref} download="李想-企业AI产品与解决方案-一页简历-2026-08-16.pdf">获取 PDF 简历</a>
            </p>
            <p className="contact-item">
              <a href={contact.xiaohongshu} target="_blank" rel="noreferrer">小红书</a>
            </p>
          </div>
        </div>
        <div className="shell footer-line">
          <span>Anita / 大想</span>
          <a href="#top">回到顶部 ↑</a>
        </div>
      </footer>
    </main>
  );
}
