"use client";

import { ChangeEvent, DragEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { marked } from "marked";
import {
  inspectWordOptimization,
  markdownToWord,
  optimizeWord,
  readMarkdownFile,
  splitMarkdownMath,
  wordToMarkdown,
} from "./converter";
import type { ConversionMeta } from "./converter";
import type { WordRepairReport } from "./converter";
import type { WordFormatReport } from "./converter";
import { hasFerryLicense, saveFerryLicense } from "./license";

type Direction = "md-to-word" | "word-to-md" | "word-optimize";
type ToolMode = "convert" | "word-optimize";
type Message = { kind: "success" | "error"; text: string } | null;
type Preview = {
  loading: boolean;
  html: string;
  note?: string;
  repairReport?: WordRepairReport;
  formatReport?: WordFormatReport;
  reportPhase?: "inspection" | "result";
} | null;

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const STORE_URL = "https://www.xiaohongshu.com/goods-detail/6a720574cef22500012e26d7?t=1790769098456&xsec_token=ABanroGn9UZRgsTrG03vHEv5AVI9qRuGh4sYlTZ9LbD8M%3D&xsec_source=app_arkselfshare";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function detectDirection(file: File | null, mode: ToolMode): Direction | null {
  if (!file) return null;
  const name = file.name.toLowerCase();
  if (name.endsWith(".md") || name.endsWith(".markdown")) return mode === "convert" ? "md-to-word" : null;
  if (name.endsWith(".docx")) return mode === "convert" ? "word-to-md" : "word-optimize";
  return null;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function metaNote(meta: ConversionMeta): string {
  const notes: string[] = [];
  if (meta.encoding && meta.encoding !== "DOCX / UTF-8") notes.push(`检测编码：${meta.encoding}`);
  if (meta.formulaCount > 0) notes.push(`识别公式：${meta.formulaCount} 个`);
  if ((meta.normalizedFormulaCount ?? 0) > 0) notes.push(`自动整理：${meta.normalizedFormulaCount} 个`);
  if ((meta.plainTextCleanupCount ?? 0) > 0) notes.push(`清理文本转义：${meta.plainTextCleanupCount} 处`);
  if ((meta.comparisonCleanupCount ?? 0) > 0) notes.push(`清理原句对照：${meta.comparisonCleanupCount} 组，保留修改后内容`);
  if (meta.repairedCount > 0) notes.push(`修复疑似乱码：${meta.repairedCount} 处`);
  if ((meta.formulaResidualCount ?? 0) > 0) notes.push(`有 ${meta.formulaResidualCount} 个公式需要人工检查`);
  if (meta.formatReport?.enabled) {
    notes.push(`基础格式整理：中文段落 ${meta.formatReport.chineseParagraphCount} 段、英文段落 ${meta.formatReport.englishParagraphCount} 段`);
  }
  return notes.join(" · ");
}

function RepairReport({ report, phase }: { report: WordRepairReport; phase: "inspection" | "result" }) {
  const complete = phase === "result" && report.remainingCount === 0;
  const empty = report.detectedCount === 0;
  const status = empty
    ? "未发现待修复公式"
    : complete
      ? "修复完成，未发现源码残留"
      : report.remainingCount > 0
        ? `${report.remainingCount} 处需要人工检查`
        : `${report.repairableCount} 处可自动修复`;

  return (
    <section className="ferry-tool-report" aria-label={phase === "result" ? "Word 修复结果" : "Word 修复诊断"}>
      <div className="ferry-tool-report-head">
        <div>
          <span>{phase === "result" ? "修复结果" : "上传前诊断"}</span>
          <strong>{status}</strong>
        </div>
        <span className={`ferry-tool-report-state ${complete ? "complete" : report.remainingCount > 0 ? "attention" : "ready"}`}>
          {complete ? "已通过检查" : report.remainingCount > 0 ? "需复核" : empty ? "无需修复" : "可开始"}
        </span>
      </div>
      <dl className="ferry-tool-report-stats">
        <div>
          <dt>发现源码</dt>
          <dd>{report.detectedCount}</dd>
        </div>
        <div>
          <dt>{phase === "result" ? "修复成功" : "可自动修复"}</dt>
          <dd>{phase === "result" ? report.repairedCount : report.repairableCount}</dd>
        </div>
        <div>
          <dt>需人工检查</dt>
          <dd>{report.remainingCount}</dd>
        </div>
      </dl>
      {report.issues.length > 0 ? (
        <div className="ferry-tool-report-issues">
          <h4>请重点检查以下位置</h4>
          <ol>
            {report.issues.slice(0, 8).map((issue, index) => (
              <li key={`${issue.location}-${index}`}>
                <strong>{issue.location}</strong>
                <code>{issue.excerpt}</code>
                <p>{issue.reason}{issue.count > 1 ? `（涉及 ${issue.count} 处）` : ""}</p>
              </li>
            ))}
          </ol>
          {report.issues.length > 8 && <p className="ferry-tool-report-more">另有 {report.issues.length - 8} 个位置未在页面展开，请优先检查复杂公式段落。</p>}
        </div>
      ) : (
        <p className="ferry-tool-report-clear">
          {empty ? "文档中没有检测到当前版本可处理的公式源码。" : "当前检测范围内没有发现需要人工检查的源码，下载后仍建议抽查复杂公式。"}
        </p>
      )}
    </section>
  );
}

function FormatReport({ report }: { report: WordFormatReport }) {
  if (!report.enabled) return null;
  return (
    <section className="ferry-tool-format-report" aria-label="基础论文格式整理结果">
      <div>
        <span>基础论文格式整理</span>
        <strong>已写入下载文件</strong>
      </div>
      <p>正文宋体 / Times New Roman、12 磅、1.2 倍行距；规范可识别标题。表格和图形保持原样，下载后请复核。</p>
      <dl>
        <div><dt>中文段落</dt><dd>{report.chineseParagraphCount}</dd></div>
        <div><dt>英文段落</dt><dd>{report.englishParagraphCount}</dd></div>
        <div><dt>标题</dt><dd>{report.headingCount}</dd></div>
        <div><dt>文字样式</dt><dd>{report.fontRunCount} 处</dd></div>
        <div><dt>需复核表格</dt><dd>{report.tableCount}</dd></div>
        <div><dt>需复核图形</dt><dd>{report.graphicCount}</dd></div>
      </dl>
    </section>
  );
}

export default function FerryPage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const licenseInput = useRef<HTMLInputElement>(null);
  const [direction, setDirection] = useState<Direction>("md-to-word");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [preview, setPreview] = useState<Preview>(null);
  const [repairMojibake, setRepairMojibake] = useState(true);
  const [formatDocument, setFormatDocument] = useState(true);
  const [licenseCode, setLicenseCode] = useState("");
  const [licensed, setLicensed] = useState(false);
  const [checkingLicense, setCheckingLicense] = useState(false);
  const [licenseMessage, setLicenseMessage] = useState("");
  const [pageCount, setPageCount] = useState(1637);

  useEffect(() => {
    hasFerryLicense().then(setLicensed);
  }, []);

  useEffect(() => {
    const key = "ferry_page_visits";
    try {
      const raw = localStorage.getItem(key);
      let previous = 1637;
      if (raw) {
        if (raw.startsWith("{")) {
          try {
            previous = JSON.parse(raw)?.count ?? 1637;
          } catch {
            previous = 1637;
          }
        } else {
          previous = Number(raw) || 1637;
        }
      }
      const next = previous + 1;
      localStorage.setItem(key, String(next));
      setPageCount(next);
    } catch {
      setPageCount(1637);
    }
  }, []);

  const mode: ToolMode = direction === "word-optimize" ? "word-optimize" : "convert";
  const accept = mode === "convert" ? ".md,.markdown,.docx" : ".docx";
  const fileTag = direction === "md-to-word" ? "MD" : "DOCX";

  async function loadPreview(
    candidate: File,
    selectedDirection: Direction,
    repair = repairMojibake,
    format = formatDocument,
  ) {
    setPreview({ loading: true, html: "" });
    try {
      if (selectedDirection === "md-to-word") {
        const decoded = await readMarkdownFile(candidate, repair);
        const formulaCount = splitMarkdownMath(decoded.text).filter((segment) => segment.type === "math").length;
        const html = await marked.parse(decoded.text);
        const lines = html.split("\n");
        const truncated = lines.slice(0, 300);
        const suffix = lines.length > 300
          ? '<p class="ferry-tool-preview-cut">… 预览已截断（前 300 行）</p>'
          : "";
        setPreview({
          loading: false,
          html: truncated.join("\n") + suffix,
          note: metaNote({
            encoding: decoded.encoding,
            repairedCount: decoded.repairedCount,
            formulaCount,
            normalizedFormulaCount: decoded.normalizedFormulaCount,
          }),
        });
      } else if (selectedDirection === "word-to-md") {
        const converted = await wordToMarkdown(candidate, repair);
        const html = await marked.parse(converted.text ?? "");
        const truncated = html.substring(0, 16000);
        const suffix = html.length > 16000
          ? '<p class="ferry-tool-preview-cut">… 预览已截断</p>'
          : "";
        setPreview({ loading: false, html: truncated + suffix, note: metaNote(converted.meta) });
      } else {
        const meta = await inspectWordOptimization(candidate, { formatDocument: format });
        const repairableCount = meta.repairReport?.repairableCount ?? meta.formulaCount;
        const remainingCount = meta.repairReport?.remainingCount ?? 0;
        const formulaMessage = meta.formulaCount > 0
          ? `共发现 ${meta.formulaCount} 处公式源码，其中 ${repairableCount} 处可自动修复${remainingCount > 0 ? `，${remainingCount} 处需要人工检查` : ""}。`
          : "没有检测到可自动修复的公式源码。";
        const comparisonMessage = (meta.comparisonCleanupCount ?? 0) > 0
          ? `检测到 ${meta.comparisonCleanupCount} 组“原句/修改后句子”对照内容，优化时会删除原句并保留修改后内容。`
          : "未检测到明确标记的“原句/修改后句子”对照内容。";
        setPreview({
          loading: false,
          html: `<p>${formulaMessage}</p><p>${comparisonMessage}</p><p>${format ? "同时会整理普通正文的字体、字号、缩进与行距，以及可识别标题。" : "已关闭基础格式整理，仅处理公式修复。"}</p><p>表格与图形尽量保留，下载后仍需检查。</p>`,
          note: metaNote(meta),
          repairReport: meta.repairReport,
          formatReport: meta.formatReport,
          reportPhase: "inspection",
        });
      }
    } catch (error) {
      console.error(error);
      setPreview({ loading: false, html: "" });
    }
  }

  function validateFile(candidate: File): Direction | null {
    const name = candidate.name.toLowerCase();
    if (name.endsWith(".doc") && !name.endsWith(".docx")) {
      setMessage({ kind: "error", text: "不支持旧版 .doc 格式。请用 Word 或 WPS 打开后，另存为 .docx 再丢入。" });
      return null;
    }
    const detected = detectDirection(candidate, mode);
    if (!detected) {
      setMessage({
        kind: "error",
        text: mode === "word-optimize" ? "Word 优化支持 .docx 文件；如需互转，请切换到“Markdown ↔ Word”。" : "请选择 .md、.markdown 或 .docx 文件。",
      });
      return null;
    }
    if (candidate.size > MAX_FILE_SIZE) {
      setMessage({ kind: "error", text: "文件不能超过 25 MB。" });
      return null;
    }
    return detected;
  }

  function chooseFile(candidate?: File) {
    if (!candidate) return;
    const selectedDirection = validateFile(candidate);
    if (!selectedDirection) return;
    setDirection(selectedDirection);
    setFile(candidate);
    setMessage(null);
    loadPreview(candidate, selectedDirection);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    chooseFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files?.[0]);
  }

  function onDropKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput.current?.click();
    }
  }

  function switchDirection(next: ToolMode) {
    setDirection(next === "word-optimize" ? "word-optimize" : "md-to-word");
    setFile(null);
    setPreview(null);
    setMessage(null);
  }

  function toggleRepair(next: boolean) {
    setRepairMojibake(next);
    if (file) loadPreview(file, direction, next);
  }

  function toggleFormat(next: boolean) {
    setFormatDocument(next);
    if (file && direction === "word-optimize") loadPreview(file, direction, repairMojibake, next);
  }

  async function activateLicense() {
    setCheckingLicense(true);
    setLicenseMessage("");
    try {
      if (!await saveFerryLicense(licenseCode)) {
        setLicenseMessage("兑换码无效，请核对完整内容后重试。");
        return;
      }
      setLicensed(true);
      setLicenseCode("");
      setLicenseMessage("");
    } catch {
      setLicenseMessage("此浏览器未能保存兑换码，请检查是否禁用了本地存储。");
    } finally {
      setCheckingLicense(false);
    }
  }

  async function convert() {
    if (!file || busy) return;
    if (direction === "word-optimize" && !await hasFerryLicense()) {
      setLicensed(false);
      setLicenseMessage("先购买并输入兑换码，即可使用 Word 优化。");
      licenseInput.current?.focus();
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = direction === "md-to-word"
        ? await markdownToWord(file, repairMojibake)
        : direction === "word-to-md"
          ? await wordToMarkdown(file, repairMojibake)
          : await optimizeWord(file, { formatDocument });
      triggerDownload(result.blob, result.filename);
      const detail = metaNote(result.meta);
      if (direction === "word-optimize" && result.meta.repairReport) {
        setPreview((current) => ({
          loading: false,
          html: current?.html ?? "",
          note: metaNote(result.meta),
          repairReport: result.meta.repairReport,
          formatReport: result.meta.formatReport,
          reportPhase: "result",
        }));
      }
      setMessage({
        kind: direction === "word-optimize" && (result.meta.formulaResidualCount ?? 0) > 0 ? "error" : "success",
        text: direction === "word-optimize" && (result.meta.formulaResidualCount ?? 0) > 0
          ? `已生成并下载 ${result.filename}，但仍有 ${result.meta.formulaResidualCount} 处需要人工检查，不能视为修复完成${detail ? `。${detail}` : ""}`
          : `${direction === "word-optimize" ? "优化" : "转换"}完成，已下载 ${result.filename}${detail ? `。${detail}` : ""}`,
      });
    } catch (error) {
      console.error(error);
      setMessage({ kind: "error", text: "转换失败，请检查文件内容或换一个简单文档再试。" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="ferry-tool">
      <div className="ferry-tool-shell">
        <header className="ferry-tool-topbar">
          <a className="ferry-tool-brand" href="/ferry" aria-label="回到文档渡口首页">
            <img className="ferry-tool-brand-mark" src="/ferry-logo.png" alt="文档渡口" />
            <span>文档渡口</span>
          </a>
          <div className="ferry-tool-state" aria-live="polite">
            <span className="ferry-tool-state-dot" aria-hidden="true" />
            <span>文件始终留在本机</span>
          </div>
        </header>

        <section className="ferry-tool-hero">
          <div className="ferry-tool-copy">
            <p className="ferry-tool-eyebrow">AI 文档交付的最后一步</p>
            <h1>
              从 AI 生成，
              <span>到文档可交付。</span>
            </h1>
            <p>
              文档渡口帮你收好最后一步：Markdown 与 Word 免费互转；Word 优化增强版一键修复常见异常公式、整理通用基础格式，减少反复手工调整。AI 生成或其他来源的 Word 都能用。
            </p>
            <ul className="ferry-tool-promise">
              <li>全程本地处理</li>
              <li>Markdown ↔ Word 免费互转，自动识别方向</li>
              <li>Word 优化增强版：19.9 元兑换码解锁</li>
              <li>异常公式修复 + 通用基础格式整理</li>
              <li>处理结果提示复核位置</li>
            </ul>
          </div>

          <section className="ferry-tool-card" aria-label="文档转换工具">
            <div className="ferry-tool-card-head">
              <span className="ferry-tool-step">选择功能</span>
              <div className="ferry-tool-switch" role="group" aria-label="选择处理功能">
                <button
                  className={mode === "convert" ? "active" : ""}
                  onClick={() => switchDirection("convert")}
                  type="button"
                >
                  <span>Markdown ↔ Word</span>
                  <small>免费 · 自动识别方向</small>
                </button>
                <button
                  className={direction === "word-optimize" ? "active" : ""}
                  onClick={() => switchDirection("word-optimize")}
                  type="button"
                >
                  Word 优化
                  <small>增强版 · 19.9 元</small>
                </button>
              </div>
            </div>

            <div className="ferry-tool-card-body">
              <input
                ref={fileInput}
                className="ferry-tool-sr-only"
                type="file"
                accept={accept}
                onChange={onFileChange}
                aria-label="选择需要转换的文件"
              />
              <div
                className={`ferry-tool-drop ${dragging ? "dragging" : ""} ${file ? "has-file" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => fileInput.current?.click()}
                onKeyDown={onDropKey}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                {file ? (
                  <div className="ferry-tool-selected">
                    <span className="ferry-tool-file-glyph" aria-hidden="true">{fileTag}</span>
                    <div className="ferry-tool-file-meta">
                      <p className="ferry-tool-file-name">{file.name}</p>
                      <p className="ferry-tool-file-size">
                        {formatBytes(file.size)} · {direction === "word-to-md" ? "自动转为 Markdown .md" : direction === "word-optimize" ? "将输出优化后的 Word .docx" : "自动转为 Word .docx"}
                      </p>
                    </div>
                    <span className="ferry-tool-change">更换文件</span>
                  </div>
                ) : (
                  <div>
                    <span className="ferry-tool-file-glyph" aria-hidden="true">{fileTag}</span>
                    <p className="ferry-tool-drop-title">
                      {mode === "convert" ? "拖入 .md 或 .docx 文件" : "拖入需要优化的 .docx"}
                    </p>
                    <p className="ferry-tool-drop-note">
                      {mode === "convert" ? "自动识别方向：.md → Word · .docx → Markdown" : "修复常见异常公式、整理基础格式；不限 Word 来源"} · 最大 25 MB
                    </p>
                  </div>
                )}
              </div>

              {direction === "word-optimize" ? (
                <>
                  <div className="ferry-tool-repair ferry-tool-repair-static">
                    <span className="ferry-tool-repair-icon" aria-hidden="true">✓</span>
                    <span>
                      <strong>修复 Word 中的异常公式</strong>
                      <small>支持裸露源码和旧版函数结构异常；复杂公式仍需下载后检查</small>
                    </span>
                  </div>
                  <label className="ferry-tool-repair">
                    <input
                      type="checkbox"
                      checked={formatDocument}
                      onChange={(event) => toggleFormat(event.target.checked)}
                    />
                    <span>
                      <strong>一键整理通用基础格式</strong>
                      <small>正文宋体 / Times New Roman、12 磅与统一行距；可识别标题，表格和图形不强行重排</small>
                    </span>
                  </label>
                </>
              ) : (
                <label className="ferry-tool-repair">
                  <input
                    type="checkbox"
                    checked={repairMojibake}
                    onChange={(event) => toggleRepair(event.target.checked)}
                  />
                  <span>
                    <strong>修复常见中文乱码</strong>
                    <small>仅处理能够可靠还原的典型乱码，原文已损坏时可能无法恢复</small>
                  </span>
                </label>
              )}

              {direction === "word-optimize" && (
                <div className="ferry-tool-license">
                  <div className="ferry-tool-license-head">
                    <div>
                      <strong>Word 优化增强版</strong>
                      <p>{licensed ? "已解锁，公式修复与基础格式整理均可使用。" : "19.9 元购买后输入兑换码，解锁完整 Word 优化：异常公式修复 + 通用基础格式整理。"}</p>
                    </div>
                    {!licensed && <a href={STORE_URL} target="_blank" rel="noopener noreferrer">前往小红书店铺购买</a>}
                  </div>
                  {!licensed && (
                    <div className="ferry-tool-license-form">
                      <input
                        ref={licenseInput}
                        type="text"
                        value={licenseCode}
                        onChange={(event) => setLicenseCode(event.target.value)}
                        onKeyDown={(event) => { if (event.key === "Enter") activateLicense(); }}
                        placeholder="粘贴购买后收到的兑换码"
                        aria-label="Word 优化兑换码"
                        autoComplete="off"
                      />
                      <button type="button" onClick={activateLicense} disabled={!licenseCode.trim() || checkingLicense}>
                        {checkingLicense ? "验证中…" : "兑换"}
                      </button>
                    </div>
                  )}
                  {licenseMessage && <p className="ferry-tool-license-message" role="status">{licenseMessage}</p>}
                  <small>每单一枚，请保存原码。换设备或清除站点数据后，重新输入原码即可；个人遗失不重新签发。</small>
                </div>
              )}

              {preview && (preview.loading || preview.html) && (
                <div className="ferry-tool-preview">
                  <h3>文件预览</h3>
                  {preview.note && <p className="ferry-tool-preview-note">{preview.note}</p>}
                  {preview.loading ? (
                    <p className="ferry-tool-preview-loading">正在加载预览…</p>
                  ) : (
                    <>
                      {preview.repairReport && preview.reportPhase && (
                        <RepairReport report={preview.repairReport} phase={preview.reportPhase} />
                      )}
                      {preview.formatReport && <FormatReport report={preview.formatReport} />}
                      {preview.html && <div className="ferry-tool-preview-box" dangerouslySetInnerHTML={{ __html: preview.html }} />}
                    </>
                  )}
                </div>
              )}

              <div className="ferry-tool-actions">
                <button className="ferry-tool-primary" type="button" onClick={convert} disabled={!file || busy}>
                  {busy ? "正在处理..." : direction === "word-to-md" ? "转换并下载 Markdown" : direction === "word-optimize" ? licensed ? "优化并下载 Word" : "兑换码解锁完整 Word 优化" : "转换并下载 Word"}
                </button>
                <p className="ferry-tool-privacy">0 字节上传 · 不保留文件</p>
              </div>

              {message && (
                <div className={`ferry-tool-notice ${message.kind}`} role="status">
                  <strong>{message.kind === "success" ? "完成" : "需要检查"}</strong>
                  <span>{message.text}</span>
                </div>
              )}
            </div>
          </section>
        </section>

        <section className="ferry-tool-release" aria-labelledby="ferry-release-title">
          <header className="ferry-tool-release-head">
            <div>
              <p>PRODUCT STATUS</p>
              <h2 id="ferry-release-title">免费互转与 Word 优化</h2>
              <span>互转按文件类型自动识别方向；Word 优化增强版由兑换码解锁。</span>
            </div>
            <div className="ferry-tool-version" aria-label="当前版本 v0.20">
              <span>当前版本</span>
              <strong>v0.20</strong>
              <small>更新于 2026.09.30</small>
            </div>
          </header>

          <div className="ferry-tool-release-grid">
            <article className="available">
              <p className="ferry-tool-release-state"><span aria-hidden="true" />免费 + 19.9 元兑换码</p>
              <h3>互转免费，Word 优化解锁增强版</h3>
              <ul>
                <li>免费互转：Markdown ↔ Word，按文件格式自动识别方向</li>
                <li>免费转换：常见论文公式转为可编辑 Word 公式，并处理典型转义与中文乱码</li>
                <li>Word 优化增强版：修复异常公式、提供诊断与需复核位置提示</li>
                <li>一键整理通用正文格式与可识别标题；清理明确标记的“原句 / 修改后句子”对照稿</li>
                <li>AI 生成或其他来源的 .docx 均可使用；当前不按文档次数扣费</li>
                <li>浏览器本地处理，文件不上传、不留存</li>
              </ul>
            </article>

            <article className="coming">
              <p className="ferry-tool-release-state"><span aria-hidden="true" />正在验证</p>
              <h3>后续计划上线</h3>
              <ul>
                <li>更多异常 Word 公式对象的识别与修复</li>
                <li>更多标题格式和文档模板参数</li>
                <li>处理报告复制、示例文件与更清楚的使用说明</li>
                <li>更多真实样本回归与稳定性改进</li>
              </ul>
            </article>

            <article className="limited">
              <p className="ferry-tool-release-state"><span aria-hidden="true" />暂不支持</p>
              <h3>请勿直接尝试</h3>
              <ul>
                <li>旧版 .doc、PDF 及图片公式识别</li>
                <li>自定义 LaTeX 宏、TikZ 和完整 LaTeX 文档编译</li>
                <li>复杂矩阵、分段函数和多行对齐公式的完整修复</li>
                <li>一键套用整篇论文模板或保证复杂版式完全无损</li>
                <li>恢复已经变成乱码符号、且原文信息丢失的内容</li>
              </ul>
            </article>
          </div>

          <p className="ferry-tool-release-note">
            Word 优化会尽量保留原有表格与图形，不保证复杂版式完全不变。复杂公式和正式论文请下载后人工抽查。
          </p>
        </section>

        <p className="ferry-tool-footer-ctr">
          已有 <strong>{pageCount.toLocaleString()}</strong> 次使用过文档渡口
        </p>
      </div>
    </main>
  );
}
