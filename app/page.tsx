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
import "./home.css";

function SectionHeading({
  index,
  label,
  title,
  body,
}: {
  index: string;
  label: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="home-section-heading">
      <p className="home-section-index">{index}</p>
      <div>
        <p className="home-section-label">{label}</p>
        <h2>{title}</h2>
        {body ? <p className="home-section-body">{body}</p> : null}
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="home-page">
      <header className="home-masthead" id="top">
        <div className="home-shell home-masthead-inner">
          <a className="home-wordmark" href="#top" aria-label="回到首页">
            <strong>大想</strong>
            <span>{profile.handle}</span>
          </a>
          <nav className="home-nav" aria-label="主要导航">
            {navigation.map((item) => (
              <a href={item.href} key={item.href}>
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <section className="home-opening home-shell" aria-labelledby="home-title">
        <div className="home-identity">
          <img className="home-portrait" src="/portrait.jpg" alt="Anita / 大想" />
          <div>
            <p className="home-presence"><span aria-hidden="true" /> 现在在北京</p>
            <p className="home-role">{profile.role}</p>
          </div>
        </div>

        <h1 id="home-title">{profile.statement}</h1>
        <p className="home-introduction">{profile.introduction}</p>

        <div className="home-opening-links" aria-label="快速入口">
          <a href="#work">看正在做的产品 <span aria-hidden="true">↓</span></a>
          <a href={contact.resumeHref} download="李想-企业AI产品与解决方案-一页简历-2026-08-16.pdf">
            PDF 简历 <span aria-hidden="true">↗</span>
          </a>
          <a href={contact.xiaohongshu} target="_blank" rel="noreferrer">
            大想的 AI 实践 <span aria-hidden="true">↗</span>
          </a>
        </div>
      </section>

      <section className="home-now" id="now">
        <div className="home-shell home-now-layout">
          <div className="home-now-mark" aria-hidden="true">
            <span>NOW</span>
            <strong>2026</strong>
          </div>
          <div className="home-now-copy">
            <p>我最近在认真做的事</p>
            <h2>把过去二十年的产品与企业现场经验，重新放进 AI 时代。</h2>
            <p>
              先从真实的小问题开始，做出能被使用、能被验证的产品；也把判断、失败和迭代过程公开记录下来。
            </p>
          </div>
          <div className="home-now-note">
            <p><strong>机会与合作</strong></p>
            <p>{profile.target}</p>
            <a href={`mailto:${contact.email}`}>和我聊聊 <span aria-hidden="true">→</span></a>
          </div>
        </div>
      </section>

      <div className="home-evidence home-shell" aria-label="职业证据速览">
        {evidence.map((item) => (
          <div className="home-evidence-item" key={item.label}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      <section className="home-section home-shell" id="work">
        <SectionHeading
          index="01"
          label="正在做的产品"
          title="不是作品陈列，是还在继续发生的实践"
          body="每个产品都从一个真实问题开始。这里保留它现在的状态、能用的入口和已经获得的证据。"
        />

        <div className="home-projects">
          {aiProjects.map((project, index) => (
            <article className="home-project" key={project.title}>
              <div className="home-project-head">
                <span className="home-project-number">{String(index + 1).padStart(2, "0")}</span>
                <p className="home-project-status">{project.status}</p>
                <h3>{project.title}</h3>
              </div>

              <div className="home-project-layout">
                <div className="home-project-copy">
                  <p>{project.summary}</p>
                  <ul aria-label={`${project.title}能力证据`}>
                    {project.proof.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  {project.href ? (
                    <a href={project.href}>
                      {project.linkLabel} <span aria-hidden="true">→</span>
                    </a>
                  ) : null}
                </div>

                <div className={`home-project-visual ${project.image ? "has-image" : "is-nextpiece"}`}>
                  {project.image ? (
                    <img src={project.image} alt={project.imageAlt} />
                  ) : (
                    <div className="home-piece-board" aria-label="NextPiece 四类职业拼图示意">
                      <span>已有</span>
                      <span>可迁移</span>
                      <span>待补</span>
                      <span>硬门槛</span>
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section home-method" id="capabilities">
        <div className="home-shell">
          <SectionHeading
            index="02"
            label="我怎样推进一件事"
            title="从听懂问题，到把它推到可以使用"
            body="技术会继续变化，但理解业务、做出判断、推动协作和验证结果，是我长期积累下来的工作方式。"
          />
          <div className="home-method-list">
            {capabilities.map((item) => (
              <article className="home-method-item" key={item.title}>
                <span>{item.index}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="home-section home-shell" id="experience">
        <SectionHeading
          index="03"
          label="代表经历"
          title="一些真正改变了我工作方式的现场"
          body="不把所有公司铺成一张长简历，只留下最能说明产品判断、复杂业务与企业交付的几段经历。"
        />

        <div className="home-case-list">
          {cases.map((item) => (
            <article className="home-case" key={`${item.company}-${item.period}`}>
              <div className="home-case-meta">
                <p>{item.period}</p>
                <strong>{item.company}</strong>
                <span>{item.category}</span>
              </div>
              <div className="home-case-main">
                <h3>{item.title}</h3>
                <p>{item.summary}</p>
                <ul aria-label={`${item.company}经历要点`}>
                  {item.highlights.map((highlight) => (
                    <li key={highlight}>{highlight}</li>
                  ))}
                </ul>
                <p className="home-case-result">{item.result}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section home-story" id="about">
        <div className="home-shell">
          <SectionHeading
            index="04"
            label="走过的路"
            title="经历不算笔直，但它们最后汇到了一起"
            body="产品让我会梳理复杂问题，心理咨询训练让我更会倾听，商务与交付让我理解企业现场。"
          />

          <div className="home-story-grid">
            <div className="home-timeline">
              {careerPhases.map((phase) => (
                <article className="home-timeline-item" key={phase.period}>
                  <p>{phase.period}</p>
                  <div>
                    <h3>{phase.title}</h3>
                    <span>{phase.detail}</span>
                  </div>
                </article>
              ))}
            </div>

            <aside className="home-credentials" aria-labelledby="credentials-title">
              <p id="credentials-title">教育与训练</p>
              <ul>
                {credentials.map((credential) => (
                  <li key={credential}>{credential}</li>
                ))}
              </ul>
            </aside>
          </div>
        </div>
      </section>

      <footer className="home-contact" id="contact">
        <div className="home-shell home-contact-main">
          <p className="home-contact-label">联系我 / CONTACT</p>
          <h2>有合适的岗位、项目，或者一个值得一起验证的问题，我们可以聊聊。</h2>
          <div className="home-contact-links">
            <a href={`mailto:${contact.email}`}>邮件联系 <span aria-hidden="true">↗</span></a>
            <a href={contact.resumeHref} download="李想-企业AI产品与解决方案-一页简历-2026-08-16.pdf">
              获取 PDF 简历 <span aria-hidden="true">↓</span>
            </a>
            <a href={contact.xiaohongshu} target="_blank" rel="noreferrer">
              小红书 <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
        <div className="home-shell home-footer-line">
          <span>Anita / 大想 · Beijing</span>
          <a href="#top">回到顶部 ↑</a>
        </div>
      </footer>
    </main>
  );
}
