import { marked } from "marked";
import JSZip from "jszip";
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Math as WordMath,
  MathFraction,
  MathRadical,
  MathRun,
  MathSubScript,
  MathSubSuperScript,
  MathSuperScript,
  NumberFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { MathComponent, ParagraphChild } from "docx";

type InlineToken = {
  type: string;
  text?: string;
  href?: string;
  title?: string;
  tokens?: InlineToken[];
};

export type ConversionMeta = {
  encoding?: string;
  formulaCount: number;
  repairedCount: number;
  normalizedFormulaCount?: number;
};

export type ConversionResult = {
  blob: Blob;
  filename: string;
  meta: ConversionMeta;
  text?: string;
};

export type MarkdownDecodeResult = {
  text: string;
  encoding: string;
  repairedCount: number;
};

const MATH_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

const LATEX_SYMBOLS: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  theta: "θ",
  lambda: "λ",
  mu: "μ",
  pi: "π",
  rho: "ρ",
  sigma: "σ",
  tau: "τ",
  phi: "φ",
  omega: "ω",
  Gamma: "Γ",
  Delta: "Δ",
  Theta: "Θ",
  Lambda: "Λ",
  Pi: "Π",
  Sigma: "Σ",
  Phi: "Φ",
  Omega: "Ω",
  times: "×",
  cdot: "·",
  div: "÷",
  pm: "±",
  mp: "∓",
  le: "≤",
  leq: "≤",
  ge: "≥",
  geq: "≥",
  ne: "≠",
  neq: "≠",
  approx: "≈",
  infty: "∞",
  to: "→",
  rightarrow: "→",
  leftarrow: "←",
  leftrightarrow: "↔",
  partial: "∂",
  nabla: "∇",
  sum: "∑",
  prod: "∏",
  int: "∫",
  in: "∈",
  notin: "∉",
  subset: "⊂",
  supset: "⊃",
  cup: "∪",
  cap: "∩",
  forall: "∀",
  exists: "∃",
};

const WORD_SYMBOLS: Record<string, string> = Object.fromEntries(
  Object.entries(LATEX_SYMBOLS).map(([name, symbol]) => [symbol, `\\${name}`]),
);

const FUNCTION_NAMES = new Set(["sin", "cos", "tan", "log", "ln", "exp", "lim", "max", "min"]);
const TEXT_STYLE_COMMANDS = new Set(["text", "mathrm", "mathbf", "mathit", "mathsf", "mathtt", "mathcal", "mathbb", "operatorname"]);

function safeStem(name: string) {
  return name.replace(/\.(md|markdown|docx)$/i, "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").trim() || "document";
}

function cleanText(value: string): string {
  return (value ?? "").replace(/^[`*\s]+|[`*\s]+$/g, "").replace(/`/g, "");
}

function flattenText(tokens: InlineToken[] | undefined): string {
  if (!tokens) return "";
  return tokens.filter((token) => token.type !== "escape").map((token) => token.text ?? "").join("");
}

class LatexMathParser {
  private position = 0;

  constructor(private readonly source: string) {}

  parse(): MathComponent[] {
    return this.parseSequence();
  }

  private parseSequence(stop?: string): MathComponent[] {
    const components: MathComponent[] = [];
    while (this.position < this.source.length) {
      if (stop && this.source[this.position] === stop) {
        this.position += 1;
        break;
      }
      if (/\s/.test(this.source[this.position])) {
        this.position += 1;
        continue;
      }

      let atom = this.parseAtom();
      if (!atom) continue;

      let subScript: MathComponent[] | undefined;
      let superScript: MathComponent[] | undefined;
      while (this.source[this.position] === "_" || this.source[this.position] === "^") {
        const marker = this.source[this.position];
        this.position += 1;
        const argument = this.parseArgument();
        if (marker === "_") subScript = argument;
        if (marker === "^") superScript = argument;
      }

      if (subScript && superScript) {
        atom = new MathSubSuperScript({ children: [atom], subScript, superScript });
      } else if (subScript) {
        atom = new MathSubScript({ children: [atom], subScript });
      } else if (superScript) {
        atom = new MathSuperScript({ children: [atom], superScript });
      }
      components.push(atom);
    }
    return components;
  }

  private parseAtom(): MathComponent | null {
    const current = this.source[this.position];
    if (!current) return null;

    if (current === "{") {
      return new MathRun(this.readRawGroup());
    }

    if (current === "\\") return this.parseCommand();

    if (current === "}") {
      this.position += 1;
      return null;
    }

    this.position += 1;
    return new MathRun(current);
  }

  private parseCommand(): MathComponent {
    this.position += 1;
    const start = this.position;
    while (/[A-Za-z]/.test(this.source[this.position] ?? "")) this.position += 1;
    const command = this.source.slice(start, this.position) || this.source[this.position++] || "";

    if (command === "frac" || command === "dfrac" || command === "tfrac") {
      return new MathFraction({ numerator: this.parseArgument(), denominator: this.parseArgument() });
    }

    if (command === "sqrt") {
      let degree: MathComponent[] | undefined;
      if (this.source[this.position] === "[") {
        this.position += 1;
        degree = this.parseSequence("]");
      }
      return new MathRadical({ children: this.parseArgument(), degree });
    }

    if (TEXT_STYLE_COMMANDS.has(command)) {
      return new MathRun(this.readRawGroup());
    }

    if (command === "left" || command === "right") {
      const delimiter = this.source[this.position] === "\\"
        ? this.readEscapedDelimiter()
        : this.source[this.position++] || "";
      return new MathRun(delimiter === "." ? "" : delimiter);
    }

    if (FUNCTION_NAMES.has(command)) return new MathRun(command);
    if (LATEX_SYMBOLS[command]) return new MathRun(LATEX_SYMBOLS[command]);
    if (command === "{" || command === "}") return new MathRun(command);
    if (command === "vert" || command === "mid") return new MathRun("|");
    if (command === "Vert" || command === "parallel") return new MathRun("‖");
    if (command === "setminus") return new MathRun("∖");
    if ([",", ";", "!", " ", "quad", "qquad"].includes(command)) return new MathRun(" ");
    return new MathRun(command ? `\\${command}` : "\\");
  }

  private parseArgument(): MathComponent[] {
    while (/\s/.test(this.source[this.position] ?? "")) this.position += 1;
    if (this.source[this.position] === "{") {
      this.position += 1;
      return this.parseSequence("}");
    }
    const atom = this.parseAtom();
    return atom ? [atom] : [new MathRun("")];
  }

  private readRawGroup(): string {
    while (/\s/.test(this.source[this.position] ?? "")) this.position += 1;
    if (this.source[this.position] !== "{") return "";
    this.position += 1;
    let depth = 1;
    let value = "";
    while (this.position < this.source.length && depth > 0) {
      const character = this.source[this.position++];
      if (character === "{") depth += 1;
      if (character === "}") depth -= 1;
      if (depth > 0) value += character;
    }
    return value;
  }

  private readEscapedDelimiter(): string {
    this.position += 1;
    const character = this.source[this.position++] || "";
    return character === "{" || character === "}" ? character : `\\${character}`;
  }

}

export function latexToWordMath(latex: string): WordMath {
  const children = new LatexMathParser(latex.trim()).parse();
  return new WordMath({ children: children.length ? children : [new MathRun(latex.trim())] });
}

type MathSegment = { type: "text" | "math"; value: string; display?: boolean };

export function splitMarkdownMath(value: string): MathSegment[] {
  const segments: MathSegment[] = [];
  let cursor = 0;
  let textStart = 0;

  while (cursor < value.length) {
    if (value[cursor] !== "$" || (cursor > 0 && value[cursor - 1] === "\\")) {
      cursor += 1;
      continue;
    }

    const display = value[cursor + 1] === "$";
    const markerLength = display ? 2 : 1;
    const formulaStart = cursor + markerLength;
    if (!display && /\s/.test(value[formulaStart] ?? "")) {
      cursor += 1;
      continue;
    }

    let end = formulaStart;
    while (end < value.length) {
      if (value[end] === "\n" && !display) break;
      if (value[end] === "$" && value[end - 1] !== "\\") {
        if (!display || value[end + 1] === "$") break;
      }
      end += 1;
    }

    const closed = end < value.length && (!display || value[end + 1] === "$");
    if (!closed || end === formulaStart) {
      cursor += markerLength;
      continue;
    }

    if (textStart < cursor) segments.push({ type: "text", value: value.slice(textStart, cursor) });
    segments.push({ type: "math", value: value.slice(formulaStart, end), display });
    cursor = end + markerLength;
    textStart = cursor;
  }

  if (textStart < value.length) segments.push({ type: "text", value: value.slice(textStart) });
  return segments.length ? segments : [{ type: "text", value }];
}

function textAndMathRuns(value: string, options: { bold?: boolean; italics?: boolean; strike?: boolean } = {}): ParagraphChild[] {
  return splitMarkdownMath(value).map((segment) =>
    segment.type === "math"
      ? latexToWordMath(segment.value)
      : new TextRun({ text: segment.value.replace(/`/g, ""), ...options }),
  );
}

function inlineRuns(tokens: InlineToken[]): ParagraphChild[] {
  const runs: ParagraphChild[] = [];
  for (const token of tokens) {
    if (!token) continue;
    switch (token.type) {
      case "text":
        runs.push(...textAndMathRuns(token.text ?? ""));
        break;
      case "escape":
        if (token.text) runs.push(new TextRun({ text: token.text }));
        break;
      case "strong":
        runs.push(...textAndMathRuns(flattenText(token.tokens) || token.text || "", { bold: true }));
        break;
      case "em":
        runs.push(...textAndMathRuns(flattenText(token.tokens) || token.text || "", { italics: true }));
        break;
      case "del":
        runs.push(...textAndMathRuns(flattenText(token.tokens) || token.text || "", { strike: true }));
        break;
      case "codespan":
        runs.push(new TextRun({ text: cleanText(token.text ?? ""), font: "Consolas" }));
        break;
      case "link":
        runs.push(
          new ExternalHyperlink({
            children: [
              new TextRun({
                text: cleanText(flattenText(token.tokens) || token.text || token.href || ""),
                color: "0563C1",
                underline: {},
              }),
            ],
            link: token.href || "",
          }),
        );
        break;
      case "image":
        runs.push(new TextRun({ text: token.text || token.title || "", italics: true, color: "77736B" }));
        break;
      case "br":
        runs.push(new TextRun({ break: 1 }));
        break;
      default:
        break;
    }
  }
  return runs;
}

function countMarkdownFormulas(text: string): number {
  return splitMarkdownMath(text).filter((segment) => segment.type === "math").length;
}

function isHighConfidenceFormulaLine(line: string): boolean {
  const value = line.trim().replace(/\s{2,}$/, "");
  if (!value || value.length > 800) return false;
  if (/^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||```|~~~)/.test(value)) return false;

  const startsLikeFormula = /^(?:[A-Za-z](?:\\+_[A-Za-z{]|_[A-Za-z{]|\^)|\\{1,}[A-Za-z]+(?:\{|\\+_))/.test(value);
  const hasEquation = /(?:^|[^\\])=|\\+=/.test(value);
  const latexSignals = value.match(/\\{1,}(?:frac|sum|sqrt|text|mathcal|mathbb|sigma|alpha|lambda|Theta|left|right|in|mid|exists|ln|cdot|parallel|setminus|vert)|\\+_|_[A-Za-z{]|\^\{?/g)?.length ?? 0;
  return startsLikeFormula && hasEquation && latexSignals >= 2;
}

function normalizeEscapedLatex(value: string): string {
  return value
    .trim()
    .replace(/\s{2,}$/, "")
    .replace(/\\{2,}(?=[A-Za-z])/g, "\\")
    .replace(/\\{2,}(?=[{}])/g, "\\")
    .replace(/\\+([_=+\-*\[\]])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeUnmarkedFormulas(text: string): { text: string; count: number } {
  const output: string[] = [];
  let count = 0;
  let inCodeFence = false;

  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(?:```|~~~)/.test(line)) {
      inCodeFence = !inCodeFence;
      output.push(line);
      continue;
    }

    if (!inCodeFence && isHighConfidenceFormulaLine(line)) {
      while (output.length > 0 && output[output.length - 1].trim() === "") output.pop();
      output.push("", "$$", normalizeEscapedLatex(line), "$$", "");
      count += 1;
      continue;
    }
    output.push(line);
  }

  return { text: output.join("\n").replace(/\n{4,}/g, "\n\n\n"), count };
}

function blockChildren(blocks: any[]): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [];
  for (const block of blocks) {
    if (!block) continue;
    switch (block.type) {
      case "heading": {
        const level = Math.min(block.depth, 6) as 1 | 2 | 3 | 4 | 5 | 6;
        const heading = `Heading${level}` as keyof typeof HeadingLevel;
        children.push(new Paragraph({
          heading: HeadingLevel[heading],
          spacing: { before: 260, after: 120 },
          children: inlineRuns(block.tokens ?? []),
        }));
        break;
      }
      case "paragraph": {
        const raw = String(block.raw ?? block.text ?? "").trim();
        const displayMatch = /^\$\$([\s\S]+)\$\$$/.exec(raw);
        children.push(new Paragraph({
          alignment: displayMatch ? AlignmentType.CENTER : undefined,
          spacing: { after: 120 },
          children: displayMatch ? [latexToWordMath(displayMatch[1])] : inlineRuns(block.tokens ?? []),
        }));
        break;
      }
      case "list":
        for (const item of block.items ?? []) {
          const itemTokens = (item.tokens ?? []).filter((token: any) => token.type !== "list");
          children.push(new Paragraph({
            ...(block.ordered
              ? { numbering: { reference: "ordered-list", level: 0 } }
              : { bullet: { level: 0 } }),
            spacing: { after: 60 },
            children: inlineRuns(itemTokens),
          }));
        }
        break;
      case "code":
        children.push(new Paragraph({
          spacing: { before: 120, after: 120 },
          children: String(block.text ?? "").split("\n").map((line, index) =>
            new TextRun({ text: line, font: "Consolas", size: 18, break: index > 0 ? 1 : 0 }),
          ),
        }));
        break;
      case "blockquote":
        children.push(new Paragraph({
          spacing: { after: 120 },
          indent: { left: 360 },
          border: { left: { style: "single", size: 12, color: "DEDBD4" } },
          children: inlineRuns(block.tokens ?? []),
        }));
        break;
      case "table": {
        const cellsToRow = (cells: any[], header = false) => new TableRow({
          tableHeader: header || undefined,
          children: cells.map((cell) => new TableCell({
            shading: header ? { type: "clear", fill: "F3F0E9" } : undefined,
            children: [new Paragraph({
              children: textAndMathRuns(typeof cell === "string" ? cell : cell.text ?? "", { bold: header }),
            })],
          })),
        });
        children.push(new Table({
          rows: [cellsToRow(block.header ?? [], true), ...(block.rows ?? []).map((row: any[]) => cellsToRow(row))],
          width: { size: 100, type: WidthType.PERCENTAGE },
        }));
        children.push(new Paragraph({ spacing: { after: 120 } }));
        break;
      }
      case "hr":
        children.push(new Paragraph({
          spacing: { before: 120, after: 240 },
          border: { bottom: { style: "single", size: 6, color: "DEDBD4" } },
        }));
        break;
      case "space":
        children.push(new Paragraph({ spacing: { after: 120 } }));
        break;
      default:
        break;
    }
  }
  return children;
}

function decode(bytes: Uint8Array, encoding: string, fatal = false): string {
  return new TextDecoder(encoding, { fatal }).decode(bytes);
}

function looksLikeUtf16(bytes: Uint8Array): "utf-16le" | "utf-16be" | null {
  const sampleLength = Math.min(bytes.length, 200);
  let evenZeros = 0;
  let oddZeros = 0;
  for (let index = 0; index < sampleLength; index += 1) {
    if (bytes[index] !== 0) continue;
    if (index % 2 === 0) evenZeros += 1;
    else oddZeros += 1;
  }
  if (oddZeros > sampleLength / 8 && evenZeros === 0) return "utf-16le";
  if (evenZeros > sampleLength / 8 && oddZeros === 0) return "utf-16be";
  return null;
}

function suspiciousMojibakeScore(text: string): number {
  const markers = text.match(/[ÃÂäåæçéèïð¤¥½¼º»]/g)?.length ?? 0;
  const controls = text.match(/[\u0080-\u009f]/g)?.length ?? 0;
  const cjk = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  return markers * 2 + controls * 3 - Math.min(cjk, 6);
}

function latin1Bytes(value: string): Uint8Array | null {
  const bytes: number[] = [];
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code > 255) return null;
    bytes.push(code);
  }
  return Uint8Array.from(bytes);
}

export function repairCommonMojibake(text: string): { text: string; count: number } {
  let count = 0;
  const repaired = text.replace(/[\u0080-\u00ff]{3,}/g, (segment) => {
    const bytes = latin1Bytes(segment);
    if (!bytes) return segment;
    try {
      const candidate = decode(bytes, "utf-8", true);
      const improves = suspiciousMojibakeScore(candidate) + 2 < suspiciousMojibakeScore(segment);
      const addsChinese = /[\u3400-\u9fff]/.test(candidate) && !/[\u3400-\u9fff]/.test(segment);
      if (improves || addsChinese) {
        count += 1;
        return candidate;
      }
    } catch {
      return segment;
    }
    return segment;
  });
  return { text: repaired, count };
}

export function decodeMarkdownBytes(input: ArrayBuffer | Uint8Array, repair = true): MarkdownDecodeResult {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let encoding = "UTF-8";
  let text = "";

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    text = decode(bytes.slice(3), "utf-8");
    encoding = "UTF-8 BOM";
  } else if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    text = decode(bytes.slice(2), "utf-16le");
    encoding = "UTF-16 LE";
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    text = decode(bytes.slice(2), "utf-16be");
    encoding = "UTF-16 BE";
  } else {
    const utf16 = looksLikeUtf16(bytes);
    if (utf16) {
      text = decode(bytes, utf16);
      encoding = utf16 === "utf-16le" ? "UTF-16 LE" : "UTF-16 BE";
    } else {
      try {
        text = decode(bytes, "utf-8", true);
      } catch {
        text = decode(bytes, "gb18030");
        encoding = "GBK / GB18030";
      }
    }
  }

  const repaired = repair ? repairCommonMojibake(text) : { text, count: 0 };
  return { text: repaired.text, encoding, repairedCount: repaired.count };
}

export async function readMarkdownFile(file: File, repair = true): Promise<MarkdownDecodeResult & { normalizedFormulaCount: number }> {
  const decoded = decodeMarkdownBytes(await file.arrayBuffer(), repair);
  const normalized = normalizeUnmarkedFormulas(decoded.text);
  return { ...decoded, text: normalized.text, normalizedFormulaCount: normalized.count };
}

export async function markdownToWord(file: File, repair = true): Promise<ConversionResult> {
  const decoded = await readMarkdownFile(file, repair);
  const blocks = marked.lexer(decoded.text);
  const doc = new Document({
    creator: "文档渡口",
    title: safeStem(file.name),
    numbering: {
      config: [{
        reference: "ordered-list",
        levels: [{ level: 0, format: NumberFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT }],
      }],
    },
    sections: [{
      properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
      children: blockChildren(blocks),
    }],
  });
  return {
    blob: await Packer.toBlob(doc),
    filename: `${safeStem(file.name)}.docx`,
    meta: {
      encoding: decoded.encoding,
      formulaCount: countMarkdownFormulas(decoded.text),
      repairedCount: decoded.repairedCount,
      normalizedFormulaCount: decoded.normalizedFormulaCount,
    },
  };
}

function childElements(element: Element): Element[] {
  return Array.from(element.childNodes).filter((node): node is Element => node.nodeType === 1);
}

function namedChildren(element: Element, name: string): Element[] {
  return childElements(element).filter((child) => child.localName === name);
}

function namedChild(element: Element, name: string): Element | undefined {
  return namedChildren(element, name)[0];
}

function mathTextToLatex(value: string): string {
  return Array.from(value)
    .map((character) => WORD_SYMBOLS[character] ? `${WORD_SYMBOLS[character]} ` : character)
    .join("")
    .trim();
}

function ommlChildrenToLatex(element: Element): string {
  return childElements(element).map(ommlToLatex).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export function ommlToLatex(element: Element): string {
  const name = element.localName;
  if (["oMath", "oMathPara", "e", "num", "den", "sub", "sup", "deg", "fName"].includes(name)) {
    return ommlChildrenToLatex(element);
  }
  if (name === "r") return mathTextToLatex(element.textContent ?? "");
  if (name === "f") {
    return `\\frac{${namedChild(element, "num") ? ommlToLatex(namedChild(element, "num")!) : ""}}{${namedChild(element, "den") ? ommlToLatex(namedChild(element, "den")!) : ""}}`;
  }
  if (name === "rad") {
    const degree = namedChild(element, "deg");
    const content = namedChild(element, "e");
    return `\\sqrt${degree && degree.textContent?.trim() ? `[${ommlToLatex(degree)}]` : ""}{${content ? ommlToLatex(content) : ""}}`;
  }
  if (name === "sSup") {
    const base = namedChild(element, "e");
    const sup = namedChild(element, "sup");
    return `{${base ? ommlToLatex(base) : ""}}^{${sup ? ommlToLatex(sup) : ""}}`;
  }
  if (name === "sSub") {
    const base = namedChild(element, "e");
    const sub = namedChild(element, "sub");
    return `{${base ? ommlToLatex(base) : ""}}_{${sub ? ommlToLatex(sub) : ""}}`;
  }
  if (name === "sSubSup") {
    const base = namedChild(element, "e");
    const sub = namedChild(element, "sub");
    const sup = namedChild(element, "sup");
    return `{${base ? ommlToLatex(base) : ""}}_{${sub ? ommlToLatex(sub) : ""}}^{${sup ? ommlToLatex(sup) : ""}}`;
  }
  if (name === "nary") {
    const properties = namedChild(element, "naryPr");
    const character = properties ? Array.from(properties.getElementsByTagNameNS(MATH_NS, "chr"))[0] : undefined;
    const symbol = character?.getAttributeNS(MATH_NS, "val") || character?.getAttribute("m:val") || "∑";
    const command = WORD_SYMBOLS[symbol] || symbol;
    const sub = namedChild(element, "sub");
    const sup = namedChild(element, "sup");
    const content = namedChild(element, "e");
    return `${command}${sub ? `_{${ommlToLatex(sub)}}` : ""}${sup ? `^{${ommlToLatex(sup)}}` : ""}${content ? ` ${ommlToLatex(content)}` : ""}`;
  }
  if (name === "func") {
    const functionName = namedChild(element, "fName");
    const content = namedChild(element, "e");
    return `${functionName ? ommlToLatex(functionName) : ""}\\left(${content ? ommlToLatex(content) : ""}\\right)`;
  }
  if (name === "limLow" || name === "limUpp") {
    const content = namedChild(element, "e");
    const limit = namedChild(element, "lim");
    return `{${content ? ommlToLatex(content) : ""}}${name === "limLow" ? "_" : "^"}{${limit ? ommlToLatex(limit) : ""}}`;
  }
  if (name === "m") {
    const rows = namedChildren(element, "mr").map((row) => namedChildren(row, "e").map(ommlToLatex).join(" & "));
    return `\\begin{matrix}${rows.join(" \\\\ ")}\\end{matrix}`;
  }
  if (name.endsWith("Pr") || ["ctrlPr", "lim", "mr"].includes(name)) return "";
  return ommlChildrenToLatex(element);
}

type FormulaMarker = { marker: string; latex: string; display: boolean };

function rewriteOmmlWithMarkers(xml: string): { xml: string; formulas: FormulaMarker[] } {
  const documentNode = new DOMParser().parseFromString(xml, "application/xml");
  const serializer = new XMLSerializer();
  const formulas: FormulaMarker[] = [];
  const displayNodes = Array.from(documentNode.getElementsByTagNameNS(MATH_NS, "oMathPara"));
  const inlineNodes = Array.from(documentNode.getElementsByTagNameNS(MATH_NS, "oMath"))
    .filter((node) => (node.parentNode as Element | null)?.localName !== "oMathPara");

  const isStandaloneFormula = (node: Element) => {
    const paragraph = (node.parentNode as Element | null)?.localName === "p"
      ? node.parentNode as Element
      : null;
    if (!paragraph) return false;
    const content = childElements(paragraph).filter((child) => child.localName !== "pPr");
    return content.length === 1 && content[0] === node;
  };

  for (const [defaultDisplay, nodes] of [[true, displayNodes], [false, inlineNodes]] as const) {
    for (const node of nodes) {
      const display = defaultDisplay || isStandaloneFormula(node);
      const marker = `FERRYFORMULA${formulas.length}TOKEN`;
      formulas.push({ marker, latex: ommlToLatex(node).trim(), display });
      const run = documentNode.createElementNS(WORD_NS, "w:r");
      const text = documentNode.createElementNS(WORD_NS, "w:t");
      text.appendChild(documentNode.createTextNode(marker));
      run.appendChild(text);
      node.parentNode?.replaceChild(run, node);
    }
  }

  return { xml: serializer.serializeToString(documentNode), formulas };
}

function restoreFormulaMarkers(markdown: string, formulas: FormulaMarker[]): string {
  let output = markdown;
  for (const formula of formulas) {
    const replacement = formula.display
      ? `\n\n$$\n${formula.latex}\n$$\n\n`
      : `$${formula.latex}$`;
    output = output.replaceAll(formula.marker, () => replacement);
  }
  return output.replace(/\n{3,}/g, "\n\n").trim();
}

export async function wordArrayBufferToMarkdown(arrayBuffer: ArrayBuffer, repair = true): Promise<{ text: string; meta: ConversionMeta }> {
  const mammoth = await import("mammoth");
  const TurndownService = (await import("turndown")).default;
  const zip = await JSZip.loadAsync(arrayBuffer);
  const documentFile = zip.file("word/document.xml");
  let formulas: FormulaMarker[] = [];

  if (documentFile) {
    const rewritten = rewriteOmmlWithMarkers(await documentFile.async("string"));
    formulas = rewritten.formulas;
    zip.file("word/document.xml", rewritten.xml);
  }

  const preparedBuffer = await zip.generateAsync({ type: "arraybuffer" });
  const NodeBuffer = (globalThis as typeof globalThis & {
    Buffer?: { from(value: ArrayBuffer): Uint8Array };
  }).Buffer;
  const mammothInput = NodeBuffer
    ? { buffer: NodeBuffer.from(preparedBuffer) }
    : { arrayBuffer: preparedBuffer };
  const result = await mammoth.convertToHtml(
    mammothInput,
    {
      convertImage: mammoth.images.imgElement(async (image) => ({
        src: `data:${image.contentType};base64,${await image.read("base64")}`,
      })),
    },
  );
  const turndown = new TurndownService({ codeBlockStyle: "fenced", headingStyle: "atx" });
  const withFormulas = restoreFormulaMarkers(turndown.turndown(result.value), formulas);
  const repaired = repair ? repairCommonMojibake(withFormulas) : { text: withFormulas, count: 0 };
  return {
    text: repaired.text,
    meta: { encoding: "DOCX / UTF-8", formulaCount: formulas.length, repairedCount: repaired.count, normalizedFormulaCount: 0 },
  };
}

export async function wordToMarkdown(file: File, repair = true): Promise<ConversionResult> {
  const converted = await wordArrayBufferToMarkdown(await file.arrayBuffer(), repair);
  return {
    blob: new Blob([converted.text], { type: "text/markdown;charset=utf-8" }),
    filename: `${safeStem(file.name)}.md`,
    text: converted.text,
    meta: converted.meta,
  };
}
