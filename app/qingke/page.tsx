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

function HelpTip({ text }: { text: string }) {
  return <span className="qingke-tip"><button type="button" aria-label={`说明：${text}`}>?</button><span role="tooltip">{text}</span></span>;
}

export default function QingkePage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const reviewPanel = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<FormatMode | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [inspection, setInspection] = useState<BidInspection | null>(null);
  const [boundary, setBoundary] = useState<number | null>(null);
  const [technicalEnd, setTechnicalEnd] = useState<number | null>(null);
  const [previewQuery, setPreviewQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [pickMode, setPickMode] = useState<"start" | "end" | "inspect">("start");
  const [confirmedIndices, setConfirmedIndices] = useState<number[]>([]);
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
    inspectBusinessFormats(file, inspection, boundary, levelChanges)
      .then((formats) => { if (!cancelled) setBusinessFormats(formats); })
      .catch(() => { if (!cancelled) setMessage("商务样式读取不完整；导出时将对缺失的样式使用内置标准。"); });
    return () => { cancelled = true; };
  }, [mode, file, inspection, boundary, levelChanges]);

  const searchResults = useMemo(() => {
    const query = previewQuery.trim().toLowerCase();
    if (!inspection || !query) return [];
    return inspection.paragraphs.filter((p) => p.text.toLowerCase().includes(query) || String(p.index + 1) === query).slice(0, 12);
  }, [inspection, previewQuery]);

  const suggestedStarts = useMemo(() => inspection?.paragraphs.filter((p) => /技术服务方案|技术方案|技术标|技术文件|技术部分|技术响应/.test(p.text)).slice(0, 4) ?? [], [inspection]);
  const suggestedEnds = useMemo(() => inspection && boundary !== null ? inspection.paragraphs.filter((p) => p.index > boundary && !p.protectedReason && /其他资料|商务部分|商务标/.test(p.text)).slice(0, 4) : [], [inspection, boundary]);
  const reviewCandidates = useMemo(() => {
    if (!inspection || boundary === null || technicalEnd === null) return [];
    return inspection.paragraphs.filter((p) => p.inferredLevel > 0 && !p.protectedReason && p.manualNumber &&
      p.text.trim().length >= 18 && /[。；;]$/.test(p.text.trim()) &&
      p.index >= boundary && p.index < technicalEnd &&
      !confirmedIndices.includes(p.index));
  }, [inspection, boundary, technicalEnd, confirmedIndices]);

  const selected = inspection && selectedIndex !== null ? inspection.paragraphs[selectedIndex] : null;
  const selectedLevel = selected ? levelChanges[selected.index] ?? selected.inferredLevel : 0;
  const selectedProtected = selected ? protectedIndices.includes(selected.index) || !!selected.protectedReason : false;
  const selectedInTechnical = selected && boundary !== null && technicalEnd !== null && selected.index >= boundary && selected.index < technicalEnd;
  const selectedAfterTechnical = selected && technicalEnd !== null && selected.index >= technicalEnd;
  const selectedIsUnchangedBusiness = mode === "business" && !formatBusiness && selectedAfterTechnical;

  async function readFile(chosen: File | null) {
    if (!chosen) return;
    setBusy("reading");
    setMessage("");
    setResult(null);
    setInspection(null);
    setBoundary(null);
    setTechnicalEnd(null);
    setPreviewQuery("");
    setSelectedIndex(null);
    setPickMode("start");
    setConfirmedIndices([]);
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
    setSelectedIndex(index);
    setPickMode("end");
    setBusinessFormats([]);
    setMessage("技术部分开头已选好，请继续选择后面的第一段商务内容。");
  }

  function chooseEnd(index: number) {
    if (boundary === null || index <= boundary) return;
    setTechnicalEnd(index);
    setSelectedIndex(boundary);
    setPickMode("inspect");
    setMessage("技术范围已选好。你可以点预览中的文字检查标题，确认后再下载。");
    window.setTimeout(() => document.getElementById(`qingke-preview-${boundary}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 30);
  }

  function chooseParagraph(index: number) {
    if (pickMode === "start") chooseBoundary(index);
    else if (pickMode === "end") {
      if (boundary !== null && index > boundary) chooseEnd(index);
      else setMessage("结束位置要在技术部分起点之后，请在文档中往下选择。 ");
    } else setSelectedIndex(index);
    if (window.innerWidth < 800) window.setTimeout(() => reviewPanel.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function jumpToParagraph(index: number) {
    setSelectedIndex(index);
    window.setTimeout(() => document.getElementById(`qingke-preview-${index}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 30);
  }

  function confirmLevel(index: number, level: number) {
    setLevelChanges((current) => ({ ...current, [index]: level }));
    setConfirmedIndices((current) => current.includes(index) ? current : [...current, index]);
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
            <section className="qingke-panel qingke-review-panel" aria-labelledby="review-title">
              <div className="qingke-step-title"><span>03</span><div><h3 id="review-title">看着文件，点选要调整的地方</h3><p>先在左侧点出技术部分的范围，再核对工具可能认错的标题。标题和正文的文字始终不改。</p></div></div>
              <div className="qingke-review-overview"><strong>{boundary === null ? "先找技术部分的第一段" : technicalEnd === null ? "再找技术部分后面的第一段商务内容" : reviewCandidates.length ? `已标出技术范围；建议核对 ${reviewCandidates.length} 处` : "已标出技术范围，可以继续"}</strong><span>表格及 {inspection.paragraphs.filter((p) => p.protectedReason).length} 处特殊内容自动保护</span></div>
              <div className="qingke-preview-layout">
                <div className="qingke-preview-column">
                  <div className="qingke-preview-head"><div><h4>原文件内容预览</h4><p>按原文顺序显示。点一段文字，在右边选择怎么处理。</p></div><HelpTip text="这里按原文顺序显示内容，方便点选位置，不模拟 Word/WPS 的最终字体和分页。表格可展开查看，图片等特殊内容用标记显示。" /></div>
                  <input className="qingke-search" value={previewQuery} onChange={(event) => setPreviewQuery(event.target.value)} placeholder="搜索标题或正文中的文字" aria-label="搜索文档内容" />
                  {previewQuery.trim() && <div className="qingke-preview-results" aria-label="搜索结果">
                    {searchResults.map((p) => <button type="button" key={p.index} onClick={() => { chooseParagraph(p.index); if (pickMode !== "end") jumpToParagraph(p.index); setPreviewQuery(""); }}>{trim(p.text || p.protectedReason || "空白内容", 72)}</button>)}
                    {searchResults.length === 0 && <p>没有找到，请换几个字试试。</p>}
                  </div>}
                  <div className="qingke-preview-document" aria-label="可点击的文档内容">
                    {inspection.previewBlocks.map((block, blockIndex) => {
                      if (block.kind === "table") return <details className="qingke-preview-table" key={`table-${blockIndex}`}><summary>表格 · {block.rows.length} 行 · 格式保持不变</summary><div><table><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell || "　"}</td>)}</tr>)}</tbody></table></div></details>;
                      const p = inspection.paragraphs[block.paragraphIndex];
                      if (!p.text.trim() && !p.protectedReason) return <div className="qingke-preview-blank" key={p.index} aria-hidden="true" />;
                      const level = levelChanges[p.index] ?? p.inferredLevel;
                      const region = boundary !== null && p.index >= boundary && (technicalEnd === null || p.index < technicalEnd) ? "technical" : "business";
                      return <button type="button" id={`qingke-preview-${p.index}`} key={p.index}
                        className={`qingke-preview-paragraph ${selectedIndex === p.index ? "selected" : ""} ${region} ${level > 0 ? "heading" : ""} ${p.protectedReason ? "protected" : ""}`}
                        onClick={() => chooseParagraph(p.index)} aria-label={`选择${trim(p.text || p.protectedReason || "特殊内容", 42)}`}>
                        <span className="qingke-preview-marker">{p.index === boundary ? "技术从这里开始" : p.index === technicalEnd ? "之后为商务" : p.protectedReason ? "自动保护" : ""}</span>
                        <span className="qingke-preview-copy">{p.text || "图片、签章或特殊内容（保持原样）"}</span>
                      </button>;
                    })}
                  </div>
                </div>
                <aside className="qingke-decision-column" ref={reviewPanel}>
                  <div className="qingke-decision-card">
                    <h4>① 告诉我们技术部分在哪</h4>
                    <p>直接在左边点文字，不用找页数或段落号。</p>
                    <div className="qingke-boundary-choice"><span>从哪段开始？</span><strong>{boundary === null ? "还没选" : trim(inspection.paragraphs[boundary].text, 35)}</strong><button type="button" className={pickMode === "start" ? "active" : ""} onClick={() => setPickMode("start")}>{boundary === null ? "点文中第一段" : "重新选择"}</button></div>
                    {boundary === null && suggestedStarts.length > 0 && <div className="qingke-quick-picks"><small>可能是这里：</small>{suggestedStarts.map((p) => <button type="button" key={p.index} onClick={() => { chooseBoundary(p.index); jumpToParagraph(p.index); }}>{trim(p.text, 30)}</button>)}</div>}
                    <div className="qingke-boundary-choice"><span>到哪里结束？ <HelpTip text="请选择技术内容后面的第一段商务内容；选中的这段会算作商务。" /></span><strong>{technicalEnd === null ? "还没选" : technicalEnd === inspection.paragraphs.length ? "技术内容直到文末" : trim(inspection.paragraphs[technicalEnd].text, 35)}</strong><div><button type="button" disabled={boundary === null} className={pickMode === "end" ? "active" : ""} onClick={() => setPickMode("end")}>{technicalEnd === null ? "点文中下一段商务" : "重新选择"}</button><button type="button" disabled={boundary === null} onClick={() => chooseEnd(inspection.paragraphs.length)}>直到文末</button></div></div>
                    {boundary !== null && technicalEnd === null && suggestedEnds.length > 0 && <div className="qingke-quick-picks"><small>可能是这里：</small>{suggestedEnds.map((p) => <button type="button" key={p.index} onClick={() => chooseEnd(p.index)}>{trim(p.text, 30)}</button>)}</div>}
                    {boundary !== null && technicalEnd !== null && <p className="qingke-range-confirm">已选好范围。左侧蓝色标记的部分是技术内容；需要修改可点“重新选择”。</p>}
                  </div>

                  {boundary !== null && technicalEnd !== null && <div className="qingke-decision-card">
                    <div className="qingke-decision-head"><h4>② 这段怎么处理？</h4><HelpTip text="只调整标题层级、编号和格式，不会改动任何标题或正文文字。" /></div>
                    {!selected && <p>在左边点一段文字，就能看到它的处理方式。</p>}
                    {selected && <>
                      <div className="qingke-selected-text"><small>{selectedInTechnical ? "技术部分" : "商务部分"} · 原文</small><strong>{selected.text || "图片、签章或特殊内容"}</strong></div>
                      {selected.manualNumber && <p className="qingke-selected-note">这段已有编号，工具会保留原编号。 <HelpTip text="例如“一、”“1.”等已有编号，不会再自动加一个。" /></p>}
                      {selected.protectedReason ? <p className="qingke-safe-note">这段已自动保护：{selected.protectedReason}。格式和内容都保持原样。</p>
                        : selectedIsUnchangedBusiness ? <p className="qingke-safe-note">你选择了参照商务格式，且没有勾选整理商务部分；这段无需调整。</p>
                          : <>
                            {mode === "business" && !formatBusiness && !selectedInTechnical && <p className="qingke-safe-note">商务部分的格式保持原样；这里更正“标题或正文”的判断，会帮助工具选对技术部分的参考样式。</p>}
                            <p className="qingke-question">这是小标题，还是普通内容？</p>
                            <div className="qingke-answer-buttons"><button type="button" className={selectedLevel === 0 ? "active" : ""} disabled={selectedProtected} onClick={() => confirmLevel(selected.index, 0)}>普通内容，不进目录</button><button type="button" className={selectedLevel > 0 ? "active" : ""} disabled={selectedProtected} onClick={() => confirmLevel(selected.index, selectedLevel > 0 && selectedLevel <= 9 ? selectedLevel : 1)}>这是标题</button></div>
                            {selectedLevel > 0 && selectedLevel <= 9 && <label className="qingke-level-choice">它属于哪一级？ <HelpTip text="一级通常是大章节，二级是章节中的小节；目录默认只展示前 3 级，可选 4 级。" /><select value={selectedLevel} disabled={selectedProtected} onChange={(event) => confirmLevel(selected.index, Number(event.target.value))}>{Array.from({ length: 9 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} 级标题{i === 0 ? "（大章节）" : i === 1 ? "（小节）" : ""}</option>)}</select></label>}
                            {selectedLevel > 9 && <p className="qingke-safe-note">这是很深的编号，原编号会保留；超过 9 级的内容无法保证进入 Word/WPS 自动大纲。</p>}
                            <label className="qingke-preserve-choice"><input type="checkbox" checked={selectedProtected} onChange={() => { toggleProtected(selected.index); setConfirmedIndices((current) => current.includes(selected.index) ? current : [...current, selected.index]); }} /> 不调整这段的格式 <HelpTip text="适合固定表单或你已经排好的段落。勾选后，这一段的字体、字号、编号都不再自动调整。" /></label>
                          </>}
                      {!inspection.hasToc && <button type="button" className="qingke-toc-choice" onClick={() => setTocBefore(selected.index)}>{tocBefore === selected.index ? "✓ 将在这段前建立目录" : "在这段前建立目录"}</button>}
                    </>}
                  </div>}

                  {boundary !== null && technicalEnd !== null && reviewCandidates.length > 0 && <div className="qingke-decision-card qingke-suspect-card"><h4>建议优先看 {reviewCandidates.length} 处</h4><p>这些带编号的长句可能是普通条款，也可能是标题，由你判断。</p>{reviewCandidates.slice(0, 3).map((p) => <button type="button" key={p.index} onClick={() => { setPickMode("inspect"); jumpToParagraph(p.index); }}>{trim(p.text, 54)} <span>查看 →</span></button>)}</div>}
                </aside>
              </div>

              {mode === "business" && boundary !== null && <details className="qingke-review-details"><summary>商务部分的格式参考与整理选项</summary><label className="qingke-preserve-choice"><input type="checkbox" checked={formatBusiness} onChange={(event) => setFormatBusiness(event.target.checked)} /> 同时整理商务部分格式 <HelpTip text="默认只整理技术部分；勾选后，商务部分中未保护的文字和标题也会按提取到的样式整理。" /></label><div className="qingke-format-list">{businessFormats.map((item) => <div key={item.level}><span>{item.level ? `${item.level} 级标题` : "正文"}</span><strong>{item.font} · {item.size} 磅</strong><small>{item.source === "business" ? `参考：${trim(item.example, 22)}` : item.source === "inherited" ? "沿用上一级商务标题" : item.source === "adjusted" ? "按上一级字号协调" : "内置格式补足"}</small></div>)}</div></details>}
              <details className="qingke-review-details"><summary>查看已识别的标题与自动保护内容</summary><p>平时不用逐条检查；找不到的段落可用上方搜索框定位。</p><div className="qingke-review-jumps">{inspection.paragraphs.filter((p) => p.inferredLevel > 0 || p.protectedReason).slice(0, 80).map((p) => <button type="button" key={p.index} onClick={() => jumpToParagraph(p.index)}><span>{p.protectedReason ? "已保护" : `${p.inferredLevel} 级标题`}</span>{trim(p.text || p.protectedReason || "特殊内容", 60)}</button>)}</div></details>
              {inspection.warnings.map((warning) => <p className="qingke-review-warning" key={warning}>{warning}</p>)}
            </section>
          )}

          {inspection && (
            <section className="qingke-panel" aria-labelledby="export-title">
              <div className="qingke-step-title"><span>04</span><div><h3 id="export-title">选择编号与目录，下载检查</h3><p>标题编号不随层级逐级缩进；需要居中的标题仍按所选样式居中。编号方案用于没有现成编号的标题；现成编号会保留并列入检查说明。</p></div></div>
              <h4 className="qingke-control-title">编号方案</h4>
              <div className="qingke-scheme-grid">{schemes.map((item) => <button type="button" key={item.id} className={`qingke-scheme ${scheme === item.id ? "selected" : ""}`} onClick={() => setScheme(item.id)}><span>方案 0{item.id}</span><strong>{item.name}</strong><ol>{item.rows.map((row) => <li key={row}>{row}</li>)}</ol></button>)}</div>
              <div className="qingke-options-grid">
                <div><h4>自动目录</h4><p>新建目录默认展示 3 级，最多展示 4 级。页码由 Word/WPS 更新后确定。</p><div className="qingke-segmented"><button type="button" className={tocDepth === 3 ? "active" : ""} disabled={inspection.hasToc} onClick={() => setTocDepth(3)}>3 级</button><button type="button" className={tocDepth === 4 ? "active" : ""} disabled={inspection.hasToc} onClick={() => setTocDepth(4)}>4 级</button></div>
                  {inspection.hasToc ? <small>检测到原有目录：保留原设置并标记更新。若要改成 3/4 级，请在 Word/WPS 中调整目录选项。</small> : <small>{tocBefore === null ? "尚未选择新目录位置：将只建立标题大纲；可在上方预览中点选段落，再选择“在这段前建立目录”。" : `将在选中的段落前插入自动目录字段。`}</small>}</div>
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
