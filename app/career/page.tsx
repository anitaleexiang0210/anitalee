import type { Metadata } from "next";
import "./nextpiece.css";

export const metadata: Metadata = {
  title: "NextPiece｜职业拼图",
  description:
    "把经历、目标方向与真实岗位要求拼在一起，找到下一个最值得补齐的职业拼图。",
};

export default function CareerPage() {
  const pieces = [
    {
      index: "01",
      title: "已有拼图",
      body: "已经被经历和成果证明，可以直接支持目标岗位的能力。",
      tone: "sage",
    },
    {
      index: "02",
      title: "可迁移拼图",
      body: "能力已经存在，只是还需要换一种表达或补上证据。",
      tone: "rose",
    },
    {
      index: "03",
      title: "待补拼图",
      body: "真正需要通过学习、实践、作品或协作机会补齐的部分。",
      tone: "amber",
    },
    {
      index: "04",
      title: "行动拼图",
      body: "把判断变成接下来 30 天可以完成、可以验证的具体行动。",
      tone: "ink",
    },
  ];

  return (
    <main className="nextpiece-page">
      <header className="nextpiece-topbar">
        <a href="/" aria-label="返回大想的个人站">
          <strong>大想</strong>
          <span>anitalee</span>
        </a>
        <p>新品预告</p>
      </header>

      <section className="nextpiece-hero">
        <div className="nextpiece-copy">
          <p className="nextpiece-eyebrow">NextPiece / 职业拼图</p>
          <h1>把经历拼成下一个机会</h1>
          <p className="nextpiece-lead">
            它会把你的经历、目标方向和真实岗位要求放在一起，帮你看清已经拥有的、可以迁移的、真正需要补齐的拼图，以及下一步最值得做什么。
          </p>
          <div className="nextpiece-actions">
            <a className="nextpiece-primary" href="#product-preview">
              看看它会做什么
            </a>
            <a className="nextpiece-secondary" href="/">
              返回个人站
            </a>
          </div>
          <p className="nextpiece-status">
            <strong>当前进度：</strong>
            产品流程、AI 分析边界与首版原型设计中，尚未开放正式使用。
          </p>
        </div>

        <div className="nextpiece-mark" aria-hidden="true">
          <span>Next</span>
          <strong>Piece</strong>
          <small>职业拼图</small>
        </div>
      </section>

      <section className="nextpiece-preview" id="product-preview">
        <div className="nextpiece-section-heading">
          <p>你会拿走什么</p>
          <h2>不是一个模糊的匹配分，而是一张可以行动的职业拼图</h2>
        </div>

        <div className="nextpiece-grid">
          {pieces.map((piece) => (
            <article className={`nextpiece-piece piece-${piece.tone}`} key={piece.title}>
              <span>{piece.index}</span>
              <h3>{piece.title}</h3>
              <p>{piece.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="nextpiece-flow">
        <div className="nextpiece-section-heading">
          <p>首版设想</p>
          <h2>从一份经历，到一份 30 天行动计划</h2>
        </div>
        <ol>
          <li>
            <span>1</span>
            <div>
              <h3>导入你的情况</h3>
              <p>描述目标方向，手动填写经历，或上传简历和简历截图。</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <h3>确认 AI 的理解</h3>
              <p>先检查 AI 提取出的经历、能力和限制，确认后再继续分析。</p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <h3>拿到下一步</h3>
              <p>对照真实岗位要求，生成职业拼图和具体的 30 天行动计划。</p>
            </div>
          </li>
        </ol>
      </section>

      <section className="nextpiece-privacy">
        <div>
          <p>关于隐私</p>
          <h2>由你决定，资料是否交给云端 AI 分析</h2>
        </div>
        <p>
          首版会区分本地快速分析和云端深度分析。只有在你明确同意后，必要资料才会发送给云端模型；不同意时仍可使用基础分析。
        </p>
      </section>

      <footer className="nextpiece-footer">
        <span>NextPiece｜职业拼图</span>
        <a href="mailto:anitaleexiang@gmail.com?subject=NextPiece%20首轮试用">关注首轮试用</a>
      </footer>
    </main>
  );
}
