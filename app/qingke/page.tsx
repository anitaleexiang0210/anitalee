"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { accountServiceReady, currentSession, myAccount } from "./auth";
import {
  formatBidDocx,
  inspectBidDocx,
  inspectBusinessFormats,
  type BidInspection,
  type FormatMode,
  type NumberScheme,
} from "./engine";
import "./qingke.css";

const schemes: Array<{ id: NumberScheme; name: string; rows: string[] }> = [
  { id: 1, name: "数字递进", rows: ["一、项目概况", "1. 实施方案", "1.1 工作安排", "1.1.1 质量控制"] },
  { id: 2, name: "中文分级", rows: ["一、项目概况", "（一）实施方案", "1. 工作安排", "（1）质量控制"] },
  { id: 3, name: "章节式", rows: ["第一章 项目概况", "第一节 实施方案", "一 工作安排", "（一）质量控制"] },
];

type BusinessFormat = Awaited<ReturnType<typeof inspectBusinessFormats>>[number];

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function trim(text: string, length = 72) {
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

function nearbyParagraph(inspection: BidInspection, from: number, step: -1 | 1) {
  for (let index = from; index >= 0 && index < inspection.paragraphs.length; index += step) {
    if (inspection.paragraphs[index].text.trim()) return inspection.paragraphs[index];
  }
  return null;
}

export default function QingkePage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<FormatMode | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<BidInspection | null>(null);
  const [boundary, setBoundary] = useState<number | null>(null);
  const [technicalEnd, setTechnicalEnd] = useState<number | null>(null);
  const [boundaryQuery, setBoundaryQuery] = useState("");
  const [endQuery, setEndQuery] = useState("");
  const [headingQuery, setHeadingQuery] = useState("");
  const [showAllParagraphs, setShowAllParagraphs] = useState(false);
  const [levelChanges, setLevelChanges] = useState<Record<number, number>>({});
  const [protectedIndices, setProtectedIndices] = useState<number[]>([]);
  const [formatBusiness, setFormatBusiness] = useState(false);
  const [businessFormats, setBusinessFormats] = useState<BusinessFormat[]>([]);
  const [scheme, setScheme] = useState<NumberScheme>(1);
  const [tocDepth, setTocDepth] = useState<3 | 4>(3);
  const [tocBefore, setTocBefore] = useState<number | null>(null);
  const [applyPageLayout, setApplyPageLayout] = useState(false);
  const [busy, setBusy] = useState<"reading" | "writing" | null>(null);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{ formatted: number; numbered: number; report: string[] } | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [accountActive, setAccountActive] = useState(false);

  useEffect(() => {
    (async () => {
      try { if (await currentSession()) setAccountActive((await myAccount()).active); }
      catch { setAccountActive(false); }
    })();
  }, []);

  useEffect(() => {
    if (mode !== "business" || !file || !inspection || boundary === null) return;
    let cancelled = false;
    inspectBusinessFormats(file, inspection, boundary)
      .then((formats) => { if (!cancelled) setBusinessFormats(formats); })
      .catch(() => { if (!cancelled) setMessage("商务样式读取不完整；导出时将对缺失的样式使用内置标准。"); });
    return () => { cancelled = true; };
  }, [mode, file, inspection, boundary]);

  const boundaryCandidates = useMemo(() => {
    if (!inspection) return [];
    const query = boundaryQuery.trim().toLowerCase();
    const all = inspection.paragraphs.filter((p) => p.text.trim());
    if (query) return all.filter((p) => p.text.toLowerCase().includes(query) || String(p.index + 1) === query).slice(0, 16);
    const technical = all.filter((p) => /技术服务方案|技术方案|技术标|技术文件|技术部分|技术响应/.test(p.text));
    const majorHeadings = all.filter((p) => p.inferredLevel === 1 && !technical.includes(p));
    return [...technical, ...majorHeadings].slice(0, 16);
  }, [inspection, boundaryQuery]);

  const endCandidates = useMemo(() => {
    if (!inspection || boundary === null) return [];
    const query = endQuery.trim().toLowerCase();
    const later = inspection.paragraphs.filter((p) => p.index > boundary && p.text.trim());
    if (query) return later.filter((p) => p.text.toLowerCase().includes(query) || String(p.index + 1) === query).slice(0, 16);
    const startLevel = inspection.paragraphs[boundary].inferredLevel || 1;
    return later.filter((p) => /其他资料|商务部分|商务标/.test(p.text) || (p.inferredLevel > 0 && p.inferredLevel <= startLevel)).slice(0, 16);
  }, [inspection, boundary, endQuery]);

  const headingCandidates = useMemo(() => {
    if (!inspection) return [];
    const query = headingQuery.trim().toLowerCase();
    return inspection.paragraphs.filter((p) => p.text.trim() &&
      (query ? p.text.toLowerCase().includes(query) || String(p.index + 1) === query
        : showAllParagraphs || p.inferredLevel > 0 || p.protectedReason || levelChanges[p.index] !== undefined))
      .slice(0, 80);
  }, [inspection, headingQuery, showAllParagraphs, levelChanges]);

  const beforeBoundary = inspection && boundary !== null ? nearbyParagraph(inspection, boundary - 1, -1) : null;
  const afterBoundary = inspection && boundary !== null ? nearbyParagraph(inspection, boundary + 1, 1) : null;
  const beforeEnd = inspection && technicalEnd !== null ? nearbyParagraph(inspection, technicalEnd - 1, -1) : null;

  async function readFile(chosen: File | null) {
    if (!chosen) return;
    setBusy("reading");
    setMessage("");
    setResult(null);
    setInspection(null);
    setBoundary(null);
    setTechnicalEnd(null);
    setEndQuery("");
    setBusinessFormats([]);
    setLevelChanges({});
    setProtectedIndices([]);
    setTocBefore(null);
    try {
      const info = await inspectBidDocx(chosen);
      setFile(chosen);
      setInspection(info);
      setMessage("文件已在浏览器内读取。请选择技术部分的起点和结束位置，再核对标题识别结果。");
    } catch (error) {
      setFile(null);
      setMessage(error instanceof Error ? error.message : "读取失败，请换一份 DOCX 再试。");
    } finally {
      setBusy(null);
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    void readFile(event.target.files?.[0] ?? null);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    if (mode) void readFile(event.dataTransfer.files?.[0] ?? null);
  }

  function chooseBoundary(index: number) {
    setBoundary(index);
    setTechnicalEnd(null);
    setBoundaryQuery("");
    setEndQuery("");
    setBusinessFormats([]);
  }

  function toggleProtected(index: number) {
    setProtectedIndices((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index]);
  }

  async function exportResult() {
    if (!file || !inspection || !mode || boundary === null || technicalEnd === null) return;
    setBusy("writing");
    setMessage("");
    setResult(null);
    try {
      if (!accountServiceReady()) throw new Error("账号服务尚未接入，暂不能下载正式结果。 ");
      const entitlement = await myAccount();
      setAccountActive(entitlement.active);
      if (!entitlement.active) throw new Error("请先登录并绑定兑换码，再下载排版结果。 ");
      const output = await formatBidDocx(file, inspection, {
        boundaryIndex: boundary,
        technicalEndIndex: technicalEnd,
        mode,
        formatBusiness,
        scheme,
        tocDepth,
        tocBeforeIndex: inspection.hasToc ? null : tocBefore,
        applyPageLayout,
        levels: levelChanges,
        protectedIndices,
      });
      download(output.zip, `${file.name.replace(/\.docx$/i, "")}_顷刻排版与检查说明.zip`);
      setResult({ formatted: output.formattedParagraphs, numbered: output.numberedHeadings, report: output.report });
      setMessage("已下载 ZIP，内含 DOCX 和《使用与人工检查说明》。请在 Word/WPS 中更新目录并逐项检查。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "处理失败；原文件没有被修改。 ");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="qingke-app">
      <header className="qingke-header">
        <a className="qingke-brand" href="/qingke" aria-label="顷刻投标排版工具首页">
          <span className="qingke-brand-mark">顷</span>
          <span><strong>顷刻</strong><small>投标排版工具</small></span>
        </a>
        <nav aria-label="页内导航">
          <a href="#workflow">排版工作台</a>
          <a href="#boundary">处理边界</a>
          <a href="/qingke/account">{accountActive ? "我的账号" : "登录 / 激活"}</a>
          <button type="button" onClick={() => setSupportOpen(true)}>联系客服</button>
        </nav>
      </header>

      <main>
        <section className="qingke-hero">
          <div className="qingke-hero-copy">
            <p className="qingke-eyebrow">专为标书最后一公里而做</p>
            <h1>把时间留给投标内容，<br /><em>把排版交给顷刻。</em></h1>
            <p className="qingke-lead">针对已合并的商务标与技术标，梳理标题层级、编号、正文样式与目录。标题和正文文字始终不改；固定表单与签章优先保护，结果由你在 Word/WPS 中复核。</p>
            <div className="qingke-hero-actions">
              <a className="qingke-primary" href="#workflow">开始整理 DOCX <span aria-hidden="true">↗</span></a>
              <span>文件在浏览器本地处理 · 不上传标书</span>
            </div>
          </div>
          <div className="qingke-paper-preview" aria-hidden="true">
            <div className="qingke-paper-label">整理前 → 整理后</div>
            <div className="qingke-paper-sheet">
              <div className="qingke-paper-lines"><i /><i /><i /></div>
              <div className="qingke-paper-title">一、项目实施方案</div>
              <div className="qingke-paper-subtitle">1. 工作安排</div>
              <div className="qingke-paper-text"><i /><i /><i /><i /></div>
              <div className="qingke-paper-subtitle small">1.1 进度与质量控制</div>
              <div className="qingke-paper-text short"><i /><i /><i /></div>
              <div className="qingke-paper-stamp">文字不改<br />格式可查</div>
            </div>
          </div>
        </section>

        <section id="workflow" className="qingke-workspace">
          <div className="qingke-section-heading">
            <span className="qingke-kicker">排版工作台 / 01 — 04</span>
            <h2>四步整理一份已合并的标书</h2>
            <p>先由你决定排版依据，再指定分界、检查识别结果，最后下载可继续编辑的 DOCX。</p>
          </div>

          <section className="qingke-panel" aria-labelledby="mode-title">
            <div className="qingke-step-title"><span>01</span><div><h3 id="mode-title">先选排版依据</h3><p>这一步由你决定；选择后才进入文件处理。</p></div></div>
            <div className="qingke-mode-grid">
              <button type="button" className={`qingke-mode-card ${mode === "business" ? "selected" : ""}`} onClick={() => { setMode("business"); setBusinessFormats([]); setFormatBusiness(false); }}>
                <span className="qingke-mode-icon">商</span><span className="qingke-mode-name">参照商务部分</span>
                <span className="qingke-mode-desc">提取已完成商务标的标题、正文样式，让技术标与其协调；商务文字始终不改，商务格式可由你选择是否整理。</span>
                <span className="qingke-mode-tag">适合已有招标方模板</span>
              </button>
              <button type="button" className={`qingke-mode-card ${mode === "standard" ? "selected" : ""}`} onClick={() => { setMode("standard"); setBusinessFormats([]); }}>
                <span className="qingke-mode-icon">标</span><span className="qingke-mode-name">使用内置标准</span>
                <span className="qingke-mode-desc">按内置投标文件规范整理商务与技术部分的可安全处理区域。</span>
                <span className="qingke-mode-tag">适合整篇统一排版</span>
              </button>
            </div>
          </section>

          <section className={`qingke-panel ${!mode ? "disabled" : ""}`} aria-labelledby="upload-title">
            <div className="qingke-step-title"><span>02</span><div><h3 id="upload-title">上传已合并的 DOCX</h3><p>第一版请先在 Word/WPS 中把商务与技术内容放进同一份文件。</p></div></div>
            <input ref={fileInput} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={onFileChange} hidden />
            <button type="button" disabled={!mode || busy !== null} className={`qingke-dropzone ${dragging ? "dragging" : ""}`} onClick={() => fileInput.current?.click()}
              onDragOver={(event) => { event.preventDefault(); if (mode) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
              <span className="qingke-upload-symbol">↥</span>
              <strong>{file ? file.name : "选择文件，或拖入这里"}</strong>
              <small>{file ? "点击可更换文件" : "仅支持 .docx · 单份最多 30 MB"}</small>
            </button>
            <div className="qingke-inline-note"><span>↳</span> 上传后只在浏览器内分析，不会立即排版；你确认处理范围后才会生成文件。原文件不会被覆盖。</div>
            {inspection && <div className="qingke-file-stats"><span>正文段落 <b>{inspection.paragraphs.length}</b></span><span>识别标题 <b>{inspection.paragraphs.filter((p) => p.inferredLevel > 0).length}</b></span><span>表格 <b>{inspection.tableCount}</b></span><span>图形 <b>{inspection.graphicCount}</b></span></div>}
          </section>

          {inspection && (
            <section className="qingke-panel" aria-labelledby="review-title">
              <div className="qingke-step-title"><span>03</span><div><h3 id="review-title">确认技术范围与标题层级</h3><p>选择技术部分的起点和结束位置；你也可以调整层级，或把某段标为原样保留。</p></div></div>
              <div className="qingke-review-grid">
                <div className="qingke-review-main">
                  <h4>技术部分起点</h4>
                  <p className="qingke-help">选择技术内容的第一段；它之前的内容视为商务部分。</p>
                  <input className="qingke-search" value={boundaryQuery} onChange={(event) => setBoundaryQuery(event.target.value)} placeholder="搜索“技术标”“技术方案”，或输入段落序号" aria-label="搜索商务技术分界" />
                  <div className="qingke-candidate-list">
                    {boundaryCandidates.map((p) => <button type="button" key={p.index} className={boundary === p.index ? "selected" : ""} onClick={() => chooseBoundary(p.index)}><span>第 {p.index + 1} 段</span><strong>{trim(p.text)}</strong></button>)}
                    {boundaryCandidates.length === 0 && <p>没有匹配段落，请换一个关键词搜索。</p>}
                  </div>
                  {boundary !== null && <div className="qingke-context-preview">
                    <strong>核对起点附近</strong>
                    {beforeBoundary && <p><span>起点前 · 拟归商务</span>{trim(beforeBoundary.text, 65)}</p>}
                    <p className="selected"><span>第 {boundary + 1} 段 · 技术起点</span>{trim(inspection.paragraphs[boundary].text, 65)}</p>
                    {afterBoundary && <p><span>起点后</span>{trim(afterBoundary.text, 65)}</p>}
                  </div>}
                  {boundary !== null && <div className="qingke-range-end">
                    <h4>技术部分结束位置</h4>
                    <p className="qingke-help">选择技术内容之后的第一段商务内容；该段本身会按商务部分处理。如果技术内容延续到文末，选「直到文末」。</p>
                    <input className="qingke-search" value={endQuery} onChange={(event) => setEndQuery(event.target.value)} placeholder="搜索“其他资料”，或输入段落序号" aria-label="搜索技术部分结束位置" />
                    <div className="qingke-candidate-list">
                      <button type="button" className={technicalEnd === inspection.paragraphs.length ? "selected" : ""} onClick={() => setTechnicalEnd(inspection.paragraphs.length)}><span>文末</span><strong>技术部分直到文末</strong></button>
                      {endCandidates.map((p) => <button type="button" key={p.index} className={technicalEnd === p.index ? "selected" : ""} onClick={() => setTechnicalEnd(p.index)}><span>第 {p.index + 1} 段</span><strong>{trim(p.text)}</strong></button>)}
                    </div>
                    {technicalEnd !== null && <div className="qingke-context-preview">
                      <strong>核对结束位置</strong>
                      {beforeEnd && <p><span>结束前 · 拟归技术</span>{trim(beforeEnd.text, 65)}</p>}
                      {technicalEnd < inspection.paragraphs.length
                        ? <p className="selected"><span>第 {technicalEnd + 1} 段起 · 商务</span>{trim(inspection.paragraphs[technicalEnd].text, 65)}</p>
                        : <p className="selected"><span>文末</span>技术部分延续到最后一段</p>}
                    </div>}
                  </div>}
                  {boundary !== null && technicalEnd !== null && <div className="qingke-confirmed">已选技术范围：第 {boundary + 1}–{technicalEnd} 段，共 {technicalEnd - boundary} 段。请确认起点前和结束后的内容归属正确。</div>}
                </div>
                <aside className="qingke-review-side">
                  <h4>默认保护</h4>
                  <p>表格、图片、签章、域和疑似固定表单会原样保留。复杂节与横向页请下载后检查。</p>
                  <div><b>{inspection.paragraphs.filter((p) => p.protectedReason).length}</b><span>段自动保护</span></div>
                  {inspection.warnings.map((warning) => <small key={warning}>{warning}</small>)}
                </aside>
              </div>

              {mode === "business" && boundary !== null && <div className="qingke-business-box">
                <div className="qingke-box-head"><div><h4>读取到的商务样式</h4><p>技术部分按同级样式处理；缺失的深层级沿用上一级，字号不会随层级变深而增大。</p></div><label><input type="checkbox" checked={formatBusiness} onChange={(event) => setFormatBusiness(event.target.checked)} /> 也整理商务格式</label></div>
                <div className="qingke-format-list">{businessFormats.map((item) => <div key={item.level}><span>{item.level ? `标题 ${item.level}` : "正文"}</span><strong>{item.font} · {item.size} 磅</strong><small>{item.source === "business" ? trim(item.example, 24) : item.source === "inherited" ? "沿用上一级商务标题" : item.source === "adjusted" ? "按上一级字号协调" : "内置补足"}</small></div>)}</div>
              </div>}

              <div className="qingke-heading-box">
                <div className="qingke-box-head"><div><h4>标题与保护区检查</h4><p>搜索可找到自动识别遗漏的段落；每段文字保持原样。</p></div><label><input type="checkbox" checked={showAllParagraphs} onChange={(event) => setShowAllParagraphs(event.target.checked)} /> 显示全部</label></div>
                <input className="qingke-search" value={headingQuery} onChange={(event) => setHeadingQuery(event.target.value)} placeholder="搜索标题文字或段落序号" aria-label="搜索标题段落" />
                <div className="qingke-heading-list">
                  {headingCandidates.map((p) => {
                    const currentLevel = levelChanges[p.index] ?? p.inferredLevel;
                    const isProtected = protectedIndices.includes(p.index) || !!p.protectedReason;
                    return <div className="qingke-heading-row" key={p.index}>
                      <div className="qingke-heading-text"><small>第 {p.index + 1} 段 {boundary !== null && technicalEnd !== null ? (p.index >= boundary && p.index < technicalEnd ? "· 技术" : "· 商务") : ""}</small><span>{trim(p.text, 108)}</span>{p.manualNumber && <em>已有编号</em>}{p.protectedReason && <em>{p.protectedReason}</em>}</div>
                      <select value={currentLevel > 9 ? 10 : currentLevel} disabled={!!p.protectedReason} onChange={(event) => setLevelChanges((current) => ({ ...current, [p.index]: Number(event.target.value) }))} aria-label={`第 ${p.index + 1} 段层级`}>
                        <option value={0}>正文</option>{Array.from({ length: 9 }, (_, i) => <option key={i + 1} value={i + 1}>标题 {i + 1}</option>)}{currentLevel > 9 && <option value={10}>深层 · 原样</option>}
                      </select>
                      <label><input type="checkbox" checked={isProtected} disabled={!!p.protectedReason} onChange={() => toggleProtected(p.index)} /> 原样</label>
                      {!inspection.hasToc && <button type="button" className="qingke-inline-action" onClick={() => setTocBefore(p.index)} title="在该段前建立目录">目录放此处</button>}
                    </div>;
                  })}
                  {headingCandidates.length === 0 && <p className="qingke-empty">没有匹配段落。试试“显示全部”或搜索文字。</p>}
                </div>
                {headingCandidates.length === 80 && <p className="qingke-help">当前只显示前 80 条，请输入文字或段落序号继续定位。</p>}
              </div>
            </section>
          )}

          {inspection && (
            <section className="qingke-panel" aria-labelledby="export-title">
              <div className="qingke-step-title"><span>04</span><div><h3 id="export-title">选择编号与目录，下载检查</h3><p>标题编号不随层级逐级缩进；需要居中的标题仍按所选样式居中。编号方案用于没有现成编号的标题；现成编号会保留并列入检查说明。</p></div></div>
              <h4 className="qingke-control-title">编号方案</h4>
              <div className="qingke-scheme-grid">{schemes.map((item) => <button type="button" key={item.id} className={`qingke-scheme ${scheme === item.id ? "selected" : ""}`} onClick={() => setScheme(item.id)}><span>方案 0{item.id}</span><strong>{item.name}</strong><ol>{item.rows.map((row) => <li key={row}>{row}</li>)}</ol></button>)}</div>
              <div className="qingke-options-grid">
                <div><h4>自动目录</h4><p>新建目录默认展示 3 级，最多展示 4 级。页码由 Word/WPS 更新后确定。</p><div className="qingke-segmented"><button type="button" className={tocDepth === 3 ? "active" : ""} disabled={inspection.hasToc} onClick={() => setTocDepth(3)}>3 级</button><button type="button" className={tocDepth === 4 ? "active" : ""} disabled={inspection.hasToc} onClick={() => setTocDepth(4)}>4 级</button></div>
                  {inspection.hasToc ? <small>检测到原有目录：保留原设置并标记更新。若要改成 3/4 级，请在 Word/WPS 中调整目录选项。</small> : <small>{tocBefore === null ? "尚未选择新目录位置：将只建立标题大纲；可在上方段落旁选择“目录放此处”。" : `将在原第 ${tocBefore + 1} 段前插入自动目录字段。`}</small>}</div>
                <div><h4>页面设置</h4><p>{mode === "business" ? "参照商务模式保留原有页面设置。" : "内置 A4：上下 2.5 cm、左 3 cm、右 2.5 cm。多节或横向页自动跳过。"}</p>{mode === "standard" && <label className="qingke-check"><input type="checkbox" checked={applyPageLayout} onChange={(event) => setApplyPageLayout(event.target.checked)} /> 对单节纵向文档应用内置页面设置</label>}</div>
              </div>
              <div className="qingke-export-bar"><div><strong>导出 DOCX + 人工检查说明</strong><span>打包为 ZIP，说明与文件一起下载。</span></div><button type="button" disabled={busy !== null || boundary === null || technicalEnd === null} onClick={() => void exportResult()}>{busy === "writing" ? "正在整理…" : "开始排版并下载"} <span aria-hidden="true">→</span></button></div>
              {(boundary === null || technicalEnd === null) && <p className="qingke-help">请先在第 03 步确认技术部分的起点和结束位置。</p>}
              {!accountActive && <p className="qingke-help">下载需要先<a href="/qingke/account" className="qingke-account-link">注册或登录账号并绑定兑换码 →</a></p>}
              {message && <p className="qingke-message" role="status">{message}</p>}
              {result && <div className="qingke-result"><strong>本次处理：{result.formatted} 段已整理，{result.numbered} 个无编号标题已设置自动编号。</strong><p>表格和图形原样保留；检查说明中列出了需人工确认的位置。</p><details><summary>查看处理记录</summary><ul>{result.report.map((line, index) => <li key={index}>{line}</li>)}</ul></details></div>}
            </section>
          )}
        </section>

        <section id="boundary" className="qingke-boundary"><div><span className="qingke-kicker">清楚的能力边界</span><h2>整理格式，<br />保留你的判断。</h2></div><div className="qingke-boundary-list"><p><b>文字始终由你掌握</b><span>不改写标题或正文，不自动生成技术内容。</span></p><p><b>复杂对象优先保护</b><span>固定表单、图片、签章与特殊域原样保留并提示检查。</span></p><p><b>最终文件仍需复核</b><span>不做合规判断或 PDF 定稿，不承诺任意标书一键提交。</span></p></div></section>
      </main>
      <footer className="qingke-footer"><span>顷刻投标排版工具</span><p>辅助整理已合并的 DOCX · 请依据招标文件要求复核</p><button type="button" onClick={() => setSupportOpen(true)}>联系客服 ↗</button></footer>
      {supportOpen && <div className="qingke-modal-backdrop" onClick={() => setSupportOpen(false)}><div className="qingke-modal" role="dialog" aria-modal="true" aria-label="联系客服" onClick={(event) => event.stopPropagation()}><button type="button" className="qingke-modal-close" onClick={() => setSupportOpen(false)} aria-label="关闭">×</button><span className="qingke-kicker">需要帮助？</span><h3>联系顷刻客服</h3><p>注册、兑换码或排版问题，可扫码联系。请先对标书和截图脱敏。</p><img src="/qingke-contact.png" alt="顷刻客服微信二维码" /><small>微信扫码添加客服</small></div></div>}
    </div>
  );
}
