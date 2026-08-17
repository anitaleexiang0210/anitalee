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

type Direction = "md-to-word" | "word-to-md" | "word-optimize";
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

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function detectDirection(file: File | null): Direction | null {
  if (!file) return null;
  const name = file.name.toLowerCase();
  if (name.endsWith(".md") || name.endsWith(".markdown")) return "md-to-word";
  if (name.endsWith(".docx")) return "word-optimize";
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
      <p>中文正文宋体并首行缩进，英文正文不缩进；标题和表格不强行套用正文格式。</p>
      <dl>
        <div><dt>中文段落</dt><dd>{report.chineseParagraphCount}</dd></div>
        <div><dt>英文段落</dt><dd>{report.englishParagraphCount}</dd></div>
        <div><dt>文字样式</dt><dd>{report.fontRunCount} 处</dd></div>
      </dl>
    </section>
  );
}

export default function FerryPage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [direction, setDirection] = useState<Direction>("md-to-word");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [preview, setPreview] = useState<Preview>(null);
  const [repairMojibake, setRepairMojibake] = useState(true);
  const [formatDocument, setFormatDocument] = useState(true);
  const [pageCount, setPageCount] = useState(1637);

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

  const accept = direction === "md-to-word" ? ".md,.markdown" : ".docx";
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
        setPreview({
          loading: false,
          html: `<p>${formulaMessage}</p><p>${format ? "同时会整理中文正文的宋体与首行缩进，并保留英文正文不缩进。" : "已关闭基础论文格式整理，仅处理公式修复。"}</p><p>原有正文、表格、图片和样式会尽量保留。</p>`,
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

  function validateFile(candidate: File) {
    const name = candidate.name.toLowerCase();
    if (name.endsWith(".doc") && !name.endsWith(".docx")) {
      setMessage({ kind: "error", text: "不支持旧版 .doc 格式。请用 Word 或 WPS 打开后，另存为 .docx 再丢入。" });
      return false;
    }
    const detected = detectDirection(candidate);
    if (!detected) {
      setMessage({ kind: "error", text: "请选择 .md、.markdown 或 .docx 文件。" });
      return false;
    }
    if (candidate.size > MAX_FILE_SIZE) {
      setMessage({ kind: "error", text: "文件不能超过 25 MB。" });
      return false;
    }
    if (direction === "md-to-word" && detected === "word-optimize") setDirection("word-optimize");
    if (direction !== "md-to-word" && detected === "md-to-word") setDirection("md-to-word");
    return true;
  }

  function chooseFile(candidate?: File) {
    if (!candidate || !validateFile(candidate)) return;
    const detected = detectDirection(candidate);
    const selectedDirection = detected === "md-to-word"
      ? "md-to-word"
      : direction === "md-to-word" ? "word-optimize" : direction;
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

  function switchDirection(next: Direction) {
    setDirection(next);
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

  async function convert() {
    if (!file || busy) return;
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
          <a className="ferry-tool-brand" href="/" aria-label="回到大想个人站首页">
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
            <p className="ferry-tool-eyebrow">Local AI document converter & repair</p>
            <h1>
              文档转得好，
              <span>公式修得好。</span>
            </h1>
            <p>
              不上传云端。完成 Markdown 与 Word 双向转换，也能修复 AI 导出 Word 中裸露或结构异常的常见论文公式，并做基础论文格式整理。
            </p>
            <ul className="ferry-tool-promise">
              <li>全程本地处理</li>
              <li>打开即用</li>
              <li>基础结构与图片打包</li>
              <li>常见论文公式与表格公式</li>
              <li>AI 双重转义与典型中文乱码</li>
              <li>Word 公式修复与基础格式整理</li>
            </ul>
          </div>

          <section className="ferry-tool-card" aria-label="文档转换工具">
            <div className="ferry-tool-card-head">
              <span className="ferry-tool-step">选择处理方式</span>
              <div className="ferry-tool-switch" aria-label="转换方向">
                <button
                  className={direction === "md-to-word" ? "active" : ""}
                  onClick={() => switchDirection("md-to-word")}
                  type="button"
                >
                  MD → Word
                </button>
                <button
                  className={direction === "word-to-md" ? "active" : ""}
                  onClick={() => switchDirection("word-to-md")}
                  type="button"
                >
                  Word → MD
                </button>
                <button
                  className={direction === "word-optimize" ? "active" : ""}
                  onClick={() => switchDirection("word-optimize")}
                  type="button"
                >
                  Word 优化
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
                        {formatBytes(file.size)} · {direction === "word-to-md" ? "将输出 Markdown .md" : direction === "word-optimize" ? "将输出优化后的 Word .docx" : "将输出 Word .docx"}
                      </p>
                    </div>
                    <span className="ferry-tool-change">更换文件</span>
                  </div>
                ) : (
                  <div>
                    <span className="ferry-tool-file-glyph" aria-hidden="true">{fileTag}</span>
                    <p className="ferry-tool-drop-title">
                      {direction === "md-to-word" ? "拖入 .md 文件" : direction === "word-optimize" ? "拖入需要优化的 .docx" : "拖入 .docx 文件"}
                    </p>
                    <p className="ferry-tool-drop-note">
                      {direction === "md-to-word" ? "支持 .md、.markdown" : "支持 .docx"} · 最大 25 MB
                    </p>
                  </div>
                )}
              </div>

              {direction === "word-optimize" ? (
                <>
                  <div className="ferry-tool-repair ferry-tool-repair-static">
                    <span className="ferry-tool-repair-icon" aria-hidden="true">✓</span>
                    <span>
                      <strong>修复 Word 中异常公式</strong>
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
                      <strong>基础论文格式整理</strong>
                      <small>中文正文宋体并首行缩进，英文正文不缩进；标题和表格不强行套用</small>
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
                  {busy ? "正在处理..." : direction === "word-to-md" ? "转换并下载 Markdown" : direction === "word-optimize" ? "优化并下载 Word" : "转换并下载 Word"}
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
              <h2 id="ferry-release-title">当前版本与能力</h2>
              <span>先确认支持范围，再开始处理文件。</span>
            </div>
            <div className="ferry-tool-version" aria-label="当前公开版本 v0.16">
              <span>当前公开测试版</span>
              <strong>v0.16</strong>
              <small>更新于 2026.08.17</small>
            </div>
          </header>

          <div className="ferry-tool-release-grid">
            <article className="available">
              <p className="ferry-tool-release-state"><span aria-hidden="true" />已上线</p>
              <h3>现在可以使用</h3>
              <ul>
                <li>Markdown 与 Word 双向转换</li>
                <li>常见论文公式转为可编辑 Word 公式</li>
                <li>AI 双重转义、裸露公式源码与典型中文乱码修复</li>
                <li>Word 公式诊断、残留位置提示与基础论文格式整理</li>
                <li>浏览器本地处理，文件不上传、不留存</li>
              </ul>
            </article>

            <article className="coming">
              <p className="ferry-tool-release-state"><span aria-hidden="true" />正在验证</p>
              <h3>后续计划上线</h3>
              <ul>
                <li>更多复杂矩阵、分段函数和多行公式</li>
                <li>更多异常 Word 公式对象的识别与修复</li>
                <li>字号、行距、页边距和标题层级等可选参数</li>
                <li>常见毕业论文格式模板与更多真实样本回归</li>
              </ul>
            </article>

            <article className="limited">
              <p className="ferry-tool-release-state"><span aria-hidden="true" />暂不支持</p>
              <h3>请勿直接尝试</h3>
              <ul>
                <li>旧版 .doc、PDF 及图片公式识别</li>
                <li>自定义 LaTeX 宏、TikZ 和完整 LaTeX 文档编译</li>
                <li>一键套用整篇论文模板或保证复杂版式完全无损</li>
                <li>恢复已经变成乱码符号、且原文信息丢失的内容</li>
              </ul>
            </article>
          </div>

          <p className="ferry-tool-release-note">
            当前版本优先保证支持范围内的结果可编辑、可检查。复杂公式和正式论文仍建议下载后人工抽查。
          </p>
        </section>

        <section className="ferry-tool-details" aria-label="转换能力说明">
          <article>
            <header>
              <span>01</span>
              <h2>公式规范化</h2>
            </header>
            <p>标题、段落、列表、表格和图片会尽量保持结构；常见分式、上下标、单位、化学式和 AI 双重转义公式会转为 Word 可编辑公式。</p>
          </article>
          <article>
            <header>
              <span>02</span>
              <h2>结果可检查</h2>
            </header>
            <p>文件只在浏览器里读取和生成，不上传到服务器，也不保存历史记录。Markdown 长论文样本识别 51 个公式；最新真实 Word 样本修复 71 个公式，源码残留均为 0。</p>
          </article>
          <article>
            <header>
              <span>03</span>
              <h2>边界清楚</h2>
            </header>
            <p>Word 优化会修复高置信度公式源码和部分异常 Word 公式结构，并可选整理中文正文宋体、首行缩进和英文正文不缩进；不会自动统一字号、行距、页边距和整篇论文模板，复杂公式和布局仍需人工检查。</p>
          </article>
        </section>

        <p className="ferry-tool-footer-ctr">
          已有 <strong>{pageCount.toLocaleString()}</strong> 次使用过文档渡口
        </p>
      </div>
    </main>
  );
}
