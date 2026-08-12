"use client";

import { ChangeEvent, DragEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { marked } from "marked";
import {
  markdownToWord,
  readMarkdownFile,
  splitMarkdownMath,
  wordToMarkdown,
} from "./converter";
import type { ConversionMeta } from "./converter";

type Direction = "md-to-word" | "word-to-md";
type Message = { kind: "success" | "error"; text: string } | null;
type Preview = { loading: boolean; html: string; note?: string } | null;

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
  if (name.endsWith(".docx")) return "word-to-md";
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
  if (meta.repairedCount > 0) notes.push(`修复疑似乱码：${meta.repairedCount} 处`);
  if ((meta.formulaResidualCount ?? 0) > 0) notes.push(`有 ${meta.formulaResidualCount} 个公式需要人工检查`);
  return notes.join(" · ");
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

  const accept = direction === "word-to-md" ? ".docx" : ".md,.markdown";
  const fileTag = direction === "word-to-md" ? "DOCX" : "MD";

  async function loadPreview(candidate: File, selectedDirection: Direction, repair = repairMojibake) {
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
      } else {
        const converted = await wordToMarkdown(candidate, repair);
        const html = await marked.parse(converted.text ?? "");
        const truncated = html.substring(0, 16000);
        const suffix = html.length > 16000
          ? '<p class="ferry-tool-preview-cut">… 预览已截断</p>'
          : "";
        setPreview({ loading: false, html: truncated + suffix, note: metaNote(converted.meta) });
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
    if (direction !== detected) setDirection(detected);
    return true;
  }

  function chooseFile(candidate?: File) {
    if (!candidate || !validateFile(candidate)) return;
    const detected = detectDirection(candidate) || direction;
    setFile(candidate);
    setMessage(null);
    loadPreview(candidate, detected);
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
    if (file) loadPreview(file, detectDirection(file) || direction, next);
  }

  async function convert() {
    if (!file || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = direction === "md-to-word"
        ? await markdownToWord(file, repairMojibake)
        : await wordToMarkdown(file, repairMojibake);
      triggerDownload(result.blob, result.filename);
      const detail = metaNote(result.meta);
      setMessage({
        kind: "success",
        text: `转换完成，已下载 ${result.filename}${detail ? `。${detail}` : ""}`,
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
            <span className="ferry-tool-brand-mark">M/W</span>
            <span>文档渡口</span>
          </a>
          <div className="ferry-tool-state" aria-live="polite">
            <span className="ferry-tool-state-dot" aria-hidden="true" />
            <span>浏览器本地处理</span>
          </div>
        </header>

        <section className="ferry-tool-hero">
          <div className="ferry-tool-copy">
            <p className="ferry-tool-eyebrow">Local document converter</p>
            <h1>
              Markdown 与 Word，
              <span>来回都顺手。</span>
            </h1>
            <p>
              不上传云端，不打乱内容结构。拖入文件，一次完成正文、标题、列表、链接、代码块和简单表格的双向转换。
            </p>
            <ul className="ferry-tool-promise">
              <li>全程本地处理</li>
              <li>打开即用</li>
              <li>适合文档整理和内容流转</li>
              <li>支持常见 LaTeX 公式与多种中文编码</li>
            </ul>
          </div>

          <section className="ferry-tool-card" aria-label="文档转换工具">
            <div className="ferry-tool-card-head">
              <span className="ferry-tool-step">选择转换方向</span>
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
                        {formatBytes(file.size)} · {direction === "word-to-md" ? "将输出 Markdown .md" : "将输出 Word .docx"}
                      </p>
                    </div>
                    <span className="ferry-tool-change">更换文件</span>
                  </div>
                ) : (
                  <div>
                    <span className="ferry-tool-file-glyph" aria-hidden="true">{fileTag}</span>
                    <p className="ferry-tool-drop-title">
                      {direction === "md-to-word" ? "拖入 .md 文件" : "拖入 .docx 文件"}
                    </p>
                    <p className="ferry-tool-drop-note">
                      {direction === "md-to-word" ? "支持 .md、.markdown" : "支持 .docx"} · 最大 25 MB
                    </p>
                  </div>
                )}
              </div>

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

              {preview && (preview.loading || preview.html) && (
                <div className="ferry-tool-preview">
                  <h3>文件预览</h3>
                  {preview.note && <p className="ferry-tool-preview-note">{preview.note}</p>}
                  {preview.loading ? (
                    <p className="ferry-tool-preview-loading">正在加载预览…</p>
                  ) : (
                    <div className="ferry-tool-preview-box" dangerouslySetInnerHTML={{ __html: preview.html }} />
                  )}
                </div>
              )}

              <div className="ferry-tool-actions">
                <button className="ferry-tool-primary" type="button" onClick={convert} disabled={!file || busy}>
                  {busy ? "正在转换..." : direction === "word-to-md" ? "转换并下载 Markdown" : "转换并下载 Word"}
                </button>
                <p className="ferry-tool-privacy">文件不离开浏览器，适合内容流转</p>
              </div>

              {message && (
                <div className={`ferry-tool-notice ${message.kind}`} role="status">
                  <strong>{message.kind === "success" ? "完成" : "提示"}</strong>
                  <span>{message.text}</span>
                </div>
              )}
            </div>
          </section>
        </section>

        <section className="ferry-tool-details" aria-label="转换能力说明">
          <article>
            <header>
              <span>01</span>
              <h2>结构优先</h2>
            </header>
            <p>标题、段落和列表会尽量保持结构；标准 LaTeX 与高置信度的未标记公式行会转为 Word 可编辑公式。</p>
          </article>
          <article>
            <header>
              <span>02</span>
              <h2>本地处理</h2>
            </header>
            <p>文件只在浏览器里读取和生成，不上传到服务器，也不保存历史记录。已损坏的乱码无法凭空恢复。</p>
          </article>
          <article>
            <header>
              <span>03</span>
              <h2>边界清楚</h2>
            </header>
            <p>文本框、SmartArt、多栏、复杂表格、复杂公式和精确分页不保证无损还原。</p>
          </article>
        </section>

        <p className="ferry-tool-footer-ctr">
          已有 <strong>{pageCount.toLocaleString()}</strong> 次使用过文档渡口
        </p>
      </div>
    </main>
  );
}
