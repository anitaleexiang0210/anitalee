import {
  aiProjects,
  contact,
  navigation,
} from "./content";
import "./home.css";

const focusItems = [
  {
    title: "AI 协同工作流",
    body: "把 AI 放入信息整理与方案输出的关键链路，减少无效反复。",
  },
  {
    title: "复杂业务理解",
    body: "用 AI 帮助拆解复杂问题，建立清晰的结构与可复用的方法。",
  },
  {
    title: "沟通与交付提效",
    body: "在真实沟通场景中，让 AI 提升表达、协作与交付的确定性。",
  },
];

const shareItems = [
  "我如何用 AI 帮助写好一份会议文档",
  "让 AI 陪你做调研，而不是替你判断",
  "和 AI 一起做项目：更快看清本质",
];

const shareThumbPositions = ["left center", "center center", "right center"];

function SectionRule({ label, tone = "sage" }: { label: string; tone?: "sage" | "rose" }) {
  return (
    <div className={`home-section-rule is-${tone}`}>
      <span aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export default function Home() {
  const project = aiProjects[0];

  return (
    <main className="home-page">
      <header className="home-masthead" id="top">
        <div className="home-shell home-masthead-inner">
          <a className="home-wordmark" href="#top" aria-label="回到首页">
            <strong>大想</strong>
            <span>/ Anita</span>
          </a>
          <nav className="home-nav" aria-label="主要导航">
            {navigation.map((item) => (
              <a href={item.href} key={item.href}>
                {item.label}
              </a>
            ))}
          </nav>
          <p className="home-header-note"><span aria-hidden="true" /> 在真实工作中用好 AI</p>
        </div>
      </header>

      <section className="home-hero home-shell" aria-labelledby="home-title">
        <div className="home-hero-copy">
          <h1 id="home-title">
            <span>把 AI 用进真实工作</span>
            <span>再把方法讲给普通人</span>
          </h1>
          <p className="home-introduction">产品、复杂业务、客户沟通和交付现场，是我把 AI 工具放进真实工作时依靠的背景，而不是一份需要反复投递的简历。</p>
          <a className="home-primary-link" href="#work">了解我的实践 <span aria-hidden="true">→</span></a>
        </div>
        <figure className="home-hero-art">
          <img src="/home-hero-stationery.png" alt="米白纸张上的笔记本、粉色纸张与干花" />
        </figure>
      </section>

      <section className="home-focus" id="now">
        <div className="home-shell">
          <SectionRule label="当前关注" tone="rose" />
          <h2>我正在探索的实践方向</h2>
          <div className="home-focus-grid">
            {focusItems.map((item, index) => (
              <article className="home-focus-item" key={item.title}>
                <span className="home-focus-mark">0{index + 1}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="home-section home-practice" id="work">
        <div className="home-shell">
          <SectionRule label="真实实践" />
          <div className="home-practice-heading">
            <h2>一个近期的真实实践</h2>
          </div>
          <div className="home-practice-grid">
            <div className="home-practice-copy">
              <h3>把一份零散需求，变成可落地的交付方案</h3>
              <p>面对需求不完整、信息分散的场景，我用 AI 协助梳理背景与目标，补全关键约束，拆解执行路径，并产出可讨论的方案初稿。</p>
              <ol className="home-practice-steps">
                <li><strong>信息梳理</strong><span>AI 帮助归拢关键点，与暗含的约束对齐</span></li>
                <li><strong>结构搭建</strong><span>拆解问题，搭建方案骨架</span></li>
                <li><strong>方案输出</strong><span>形成可讨论的初稿，推动沟通与决策</span></li>
              </ol>
              <a className="home-text-link" href={project.href}>{project.linkLabel} <span aria-hidden="true">→</span></a>
            </div>
            <figure className="home-practice-visual">
              <img src={project.image} alt={project.imageAlt} />
            </figure>
          </div>
        </div>
      </section>

      <section className="home-section home-sharing" id="share">
        <div className="home-shell">
          <SectionRule label="分享与笔记" tone="rose" />
          <div className="home-sharing-grid">
            <div className="home-share-list">
              <h2>最近分享</h2>
              {shareItems.map((item, index) => (
                <a className="home-share-item" href="#contact" key={item}>
                  <img src="/home-practice-notebook.png" alt="" aria-hidden="true" style={{ objectPosition: shareThumbPositions[index] }} />
                  <span><strong>{item}</strong><small>从真实工作场景出发，记录可复用的方法</small></span>
                  <span className="home-share-arrow" aria-hidden="true">→</span>
                </a>
              ))}
              <a className="home-text-link" href="#contact">查看全部分享 <span aria-hidden="true">→</span></a>
            </div>
            <article className="home-note" id="notes">
              <span>随手笔记</span>
              <p>AI 不会替代你，<br />但会放大你的思考方式和执行力。<br />关键不是会不会用，<br />而是从哪里开始。</p>
              <strong>— 大想</strong>
              <a className="home-text-link" href="#contact">阅读更多笔记 <span aria-hidden="true">→</span></a>
            </article>
          </div>
        </div>
      </section>

      <section className="home-section home-about" id="about">
        <div className="home-shell home-about-grid">
          <div className="home-about-portrait">
            <img src="/home-about-lineart.png" alt="一位手捧杯子的女性线稿插画" />
          </div>
          <div className="home-about-copy">
            <SectionRule label="关于我" />
            <h2>在真实工作里，和 AI 一起把事做好。</h2>
            <p>我更关心如何把 AI 用在真实问题上，让复杂的工作少一些反复，让协作与交付更清晰。这是我长期的实践，也是我正在分享的方法。</p>
            <p>我把产品、复杂业务、客户沟通和交付现场的积累，带进 AI 工具与 Agent 实践中。</p>
            <a className="home-text-link" href="#contact">了解更多关于我 <span aria-hidden="true">→</span></a>
          </div>
        </div>
      </section>

      <footer className="home-contact" id="contact">
        <div className="home-shell home-contact-grid">
          <div className="home-contact-main">
            <p className="home-contact-label">联系我 / CONTACT</p>
            <h2>一起交流真实的工作与 AI 实践</h2>
            <p>如果你也在探索如何把 AI 用进工作，欢迎来聊聊你的问题、方法和想法。</p>
            <div className="home-contact-links">
              <a href={`mailto:${contact.email}`}>邮件联系 <span aria-hidden="true">↗</span></a>
              <a href={contact.xiaohongshu} target="_blank" rel="noreferrer">小红书 <span aria-hidden="true">↗</span></a>
            </div>
          </div>
          <aside className="home-wechat" aria-label="微信联系">
            <div className="home-wechat-copy">
              <span>微信交流</span>
              <strong>加我微信</strong>
              <p>欢迎添加，备注“AI 实践”<br />一起交流真实工作中的 AI 用法。</p>
            </div>
            <div className="home-wechat-qr">
              <span className="home-wechat-qr-window">
                <img src={contact.wechatImage} alt="添加大想工作微信的二维码" />
              </span>
            </div>
          </aside>
        </div>
        <div className="home-shell home-footer-line">
          <span>大想 / Anita · 在真实工作中用好 AI</span>
          <a href="#top">回到顶部 ↑</a>
        </div>
      </footer>
    </main>
  );
}
