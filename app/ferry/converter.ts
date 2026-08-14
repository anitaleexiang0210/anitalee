import { marked } from "marked";
import JSZip from "jszip";
import {
  AlignmentType,
  Document as WordDocument,
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
  LineRuleType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import type { MathComponent, ParagraphChild } from "docx";

type InlineToken = {
  type: string;
  text?: string;
  raw?: string;
  href?: string;
  title?: string;
  tokens?: InlineToken[];
};

export type ConversionMeta = {
  encoding?: string;
  formulaCount: number;
  repairedCount: number;
  normalizedFormulaCount?: number;
  formulaResidualCount?: number;
  repairReport?: WordRepairReport;
  formatReport?: WordFormatReport;
};

export type WordRepairIssue = {
  location: string;
  excerpt: string;
  reason: string;
  count: number;
};

export type WordRepairReport = {
  detectedCount: number;
  repairableCount: number;
  repairedCount: number;
  remainingCount: number;
  issues: WordRepairIssue[];
};

export type WordFormatReport = {
  enabled: boolean;
  fontRunCount: number;
  chineseRunCount: number;
  englishRunCount: number;
  chineseParagraphCount: number;
  englishParagraphCount: number;
};

export type WordOptimizationOptions = {
  formatDocument?: boolean;
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
  varepsilon: "ε",
  eta: "η",
  theta: "θ",
  vartheta: "ϑ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  omicron: "ο",
  pi: "π",
  varpi: "ϖ",
  rho: "ρ",
  varrho: "ϱ",
  sigma: "σ",
  varsigma: "ς",
  tau: "τ",
  upsilon: "υ",
  phi: "φ",
  varphi: "ϕ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
  Gamma: "Γ",
  Delta: "Δ",
  Theta: "Θ",
  Lambda: "Λ",
  Pi: "Π",
  Sigma: "Σ",
  Upsilon: "Υ",
  Phi: "Φ",
  Psi: "Ψ",
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
  rightleftharpoons: "⇌",
  leftrightharpoons: "⇋",
  longrightarrow: "⟶",
  longleftarrow: "⟵",
  longleftrightarrow: "⟷",
  mapsto: "↦",
  hookrightarrow: "↪",
  hookleftarrow: "↩",
  circ: "°",
  degree: "°",
  prime: "′",
  partial: "∂",
  nabla: "∇",
  sum: "∑",
  prod: "∏",
  int: "∫",
  in: "∈",
  notin: "∉",
  subset: "⊂",
  subseteq: "⊆",
  supset: "⊃",
  supseteq: "⊇",
  cup: "∪",
  cap: "∩",
  forall: "∀",
  exists: "∃",
  propto: "∝",
  equiv: "≡",
  sim: "∼",
  simeq: "≃",
  ll: "≪",
  gg: "≫",
  cdots: "⋯",
  ldots: "…",
  ellipsis: "…",
};

const WORD_SYMBOLS: Record<string, string> = Object.fromEntries(
  Object.entries(LATEX_SYMBOLS).map(([name, symbol]) => [symbol, `\\${name}`]),
);

const FUNCTION_NAMES = new Set(["sin", "cos", "tan", "log", "ln", "exp", "lim", "max", "min"]);
const TEXT_STYLE_COMMANDS = new Set(["text", "mathrm", "mathbf", "mathit", "mathsf", "mathtt", "mathcal", "mathbb", "mathscr", "operatorname"]);

const ESCAPED_MATH_PUNCTUATION: Record<string, string> = {
  "_": "_",
  "^": "^",
  "=": "=",
  "+": "+",
  "-": "-",
  "*": "*",
  "[": "[",
  "]": "]",
  "(": "(",
  ")": ")",
  "{": "{",
  "}": "}",
  "%": "%",
  "#": "#",
  "&": "&",
};

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

      const atomParts = this.parseAtom();
      if (!atomParts.length) continue;

      let subScript: MathComponent[] | undefined;
      let superScript: MathComponent[] | undefined;
      while (this.source[this.position] === "_" || this.source[this.position] === "^") {
        const marker = this.source[this.position];
        this.position += 1;
        const argument = this.parseArgument();
        if (marker === "_") subScript = argument;
        if (marker === "^") superScript = argument;
      }

      let atom: MathComponent = atomParts[0];
      if (subScript && superScript) {
        atom = new MathSubSuperScript({ children: atomParts, subScript, superScript });
      } else if (subScript) {
        atom = new MathSubScript({ children: atomParts, subScript });
      } else if (superScript) {
        atom = new MathSuperScript({ children: atomParts, superScript });
      }
      if (subScript || superScript || atomParts.length === 1) components.push(atom);
      else components.push(...atomParts);
    }
    return components;
  }

  private parseAtom(): MathComponent[] {
    const current = this.source[this.position];
    if (!current) return [];

    if (current === "{") {
      this.position += 1;
      return this.parseSequence("}");
    }

    if (current === "\\") return [this.parseCommand()];

    if (current === "}") {
      this.position += 1;
      return [];
    }

    this.position += 1;
    return [new MathRun(current)];
  }

  private parseCommand(): MathComponent {
    this.position += 1;
    const start = this.position;
    while (/[A-Za-z]/.test(this.source[this.position] ?? "")) this.position += 1;
    const command = this.source.slice(start, this.position) || this.source[this.position++] || "";

    if (ESCAPED_MATH_PUNCTUATION[command]) return new MathRun(ESCAPED_MATH_PUNCTUATION[command]);

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
      const raw = this.readRawGroup();
      const parsed = new LatexMathParser(raw).parse();
      return parsed.length === 1 ? parsed[0] : new MathRun(raw);
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
    if ([",", ";", ":", "!", " ", "quad", "qquad", "thinspace", "medspace", "thickspace"].includes(command)) return new MathRun(" ");
    return new MathRun(command ? `\\${command}` : "\\");
  }

  private parseArgument(): MathComponent[] {
    while (/\s/.test(this.source[this.position] ?? "")) this.position += 1;
    if (this.source[this.position] === "{") {
      this.position += 1;
      return this.parseSequence("}");
    }
    const atom = this.parseAtom();
    return atom.length ? atom : [new MathRun("")];
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
  const normalized = normalizeLatexSource(latex);
  const children = new LatexMathParser(normalized).parse();
  return new WordMath({ children: children.length ? children : [new MathRun(normalized)] });
}

/**
 * Normalize the forms most often produced when an AI response is copied
 * through Markdown, JSON, or a Word formula object. This deliberately stays
 * smaller than a LaTeX compiler: the output is consumed by the lightweight
 * WordMath parser below, so predictable repair is preferable to guessing.
 */
export function normalizeLatexSource(value: string): string {
  let source = String(value ?? "")
    .replace(/\r?\n/g, " ")
    .trim();

  const wrappers: Array<[RegExp, string]> = [
    [/^\\{1,3}\(([\s\S]*)\\{1,3}\)$/, "$1"],
    [/^\\{1,3}\[([\s\S]*)\\{1,3}\]$/, "$1"],
    [/^\$\$([\s\S]*)\$\$$/, "$1"],
    [/^\$([\s\S]*)\$$/, "$1"],
  ];
  for (const [pattern, replacement] of wrappers) {
    if (pattern.test(source)) {
      source = source.replace(pattern, replacement).trim();
      break;
    }
  }

  // Markdown escapes punctuation such as `\_` and `\=`. Inside a formula
  // these are structural characters, so restore them before parsing.
  source = source
    .replace(/\$\$?/g, "")
    .replace(/\\{1,}(?=\s)/g, " ")
    .replace(/\\([_^=+\-*%<>])/g, "$1");

  // AI exports commonly double every backslash. Collapse only before a
  // command or a math delimiter so genuine TeX line-breaks are preserved.
  for (let pass = 0; pass < 3; pass += 1) {
    const next = source
      .replace(/\\{2,}(?=[A-Za-z])/g, "\\")
      .replace(/\\{2,}(?=[{}_[\]^=+\-*%&#])/g, "\\");
    if (next === source) break;
    source = next;
  }

  // Some AI-to-Word exports turn `q_e` into `q\e` and `k_2` into
  // `k\2`. Restore this narrow one-character subscript form only when
  // the escaped character is a complete token.
  source = source.replace(/([A-Za-z])\\([A-Za-z0-9])(?=[^A-Za-z0-9]|$)/g, "$1_$2");

  return source
    .replace(/\\(vert|Vert|mid|parallel)\{\}/g, "\\$1")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDelimitedFormulas(text: string): { text: string; count: number } {
  const segments = splitMarkdownMath(text);
  let count = 0;
  const normalized = segments.map((segment) => {
    if (segment.type !== "math") return segment.value;
    const value = normalizeLatexSource(segment.value);
    if (value !== segment.value) count += 1;
    const marker = segment.display ? `$$${value}$$` : `$${value}$`;
    return marker;
  });
  return { text: normalized.join(""), count };
}

function normalizeDelimitedChunks(text: string): { text: string; count: number } {
  const output: string[] = [];
  let chunk: string[] = [];
  let inCodeFence = false;
  let count = 0;

  const flush = () => {
    if (!chunk.length) return;
    const normalized = normalizeDelimitedFormulas(chunk.join("\n"));
    output.push(normalized.text);
    count += normalized.count;
    chunk = [];
  };

  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(?:```|~~~)/.test(line)) {
      flush();
      output.push(line);
      inCodeFence = !inCodeFence;
    } else if (inCodeFence) {
      output.push(line);
    } else {
      chunk.push(line);
    }
  }
  flush();
  return { text: output.join("\n"), count };
}

type MathSegment = { type: "text" | "math"; value: string; display?: boolean };

export function splitMarkdownMath(value: string): MathSegment[] {
  const segments: MathSegment[] = [];
  let cursor = 0;
  let textStart = 0;

  while (cursor < value.length) {
    const isDisplayDollar = value.startsWith("$$", cursor);
    const isInlineDollar = value[cursor] === "$" && !isDisplayDollar;
    const bracketPrefix = /^(\\+)(\[|\()/.exec(value.slice(cursor));
    const isDisplayBracket = bracketPrefix?.[2] === "[";
    const isInlineBracket = bracketPrefix?.[2] === "(";
    if (!isDisplayDollar && !isInlineDollar && !isDisplayBracket && !isInlineBracket) {
      cursor += 1;
      continue;
    }

    if (value[cursor] === "$" && cursor > 0 && value[cursor - 1] === "\\") {
      cursor += 1;
      continue;
    }

    const display = isDisplayDollar || isDisplayBracket;
    const bracketSlashes = bracketPrefix?.[1] ?? "";
    const opening = isDisplayDollar ? "$$" : isInlineDollar ? "$" : `${bracketSlashes}${isDisplayBracket ? "[" : "("}`;
    const closing = isDisplayDollar ? "$$" : isInlineDollar ? "$" : `${bracketSlashes}${isDisplayBracket ? "]" : ")"}`;
    const markerLength = opening.length;
    const formulaStart = cursor + markerLength;
    if (!display && /\s/.test(value[formulaStart] ?? "")) {
      cursor += 1;
      continue;
    }

    let end = value.indexOf(closing, formulaStart);
    if (end < 0 && (isDisplayBracket || isInlineBracket)) {
      const closingCharacter = isDisplayBracket ? "]" : ")";
      let closingStart = -1;
      let closingEnd = -1;
      for (let index = formulaStart; index < value.length; index += 1) {
        if (value[index] !== closingCharacter || index === 0 || value[index - 1] !== "\\") continue;
        let slashStart = index - 1;
        while (slashStart > formulaStart && value[slashStart - 1] === "\\") slashStart -= 1;
        closingStart = slashStart;
        closingEnd = index + 1;
        break;
      }
      if (closingStart >= 0) {
        end = closingStart;
        const actualClosing = value.slice(closingStart, closingEnd);
        if (textStart < cursor) segments.push({ type: "text", value: value.slice(textStart, cursor) });
        segments.push({ type: "math", value: value.slice(formulaStart, end), display });
        cursor = end + actualClosing.length;
        textStart = cursor;
        continue;
      }
    }
    while (isInlineDollar && end >= 0 && end > formulaStart && value[end - 1] === "\\") {
      end = value.indexOf(closing, end + closing.length);
    }

    if (end < 0 || end === formulaStart) {
      cursor += markerLength;
      continue;
    }

    if (textStart < cursor) segments.push({ type: "text", value: value.slice(textStart, cursor) });
    segments.push({ type: "math", value: value.slice(formulaStart, end), display });
    cursor = end + closing.length;
    textStart = cursor;
  }

  if (textStart < value.length) segments.push({ type: "text", value: value.slice(textStart) });
  return segments.length ? segments : [{ type: "text", value }];
}

function formulaMarker(value: string, display: boolean): string {
  const hex = Array.from(new TextEncoder().encode(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `FERRY${display ? "DISPLAY" : "INLINE"}${hex}TOKEN`;
}

function protectMarkdownMath(value: string): string {
  return splitMarkdownMath(value)
    .map((segment) => segment.type === "math" ? formulaMarker(segment.value, Boolean(segment.display)) : segment.value)
    .join("");
}

const FORMULA_MARKER_PATTERN = /FERRY(INLINE|DISPLAY)([0-9a-f]+)TOKEN/g;

function decodeFormulaHex(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16);
  return new TextDecoder().decode(bytes);
}

function markerFormula(value: string): { latex: string; display: boolean } | null {
  const match = /^FERRY(INLINE|DISPLAY)([0-9a-f]+)TOKEN$/.exec(value.trim());
  return match ? { latex: decodeFormulaHex(match[2]), display: match[1] === "DISPLAY" } : null;
}

type InlineStyleOptions = {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  size?: number;
  font?: string;
  color?: string;
  underline?: {};
};

const BODY_FONT = { ascii: "Times New Roman", hAnsi: "Times New Roman", eastAsia: "Songti SC", cs: "Times New Roman" } as const;
const CODE_FONT = { ascii: "Consolas", hAnsi: "Consolas", eastAsia: "Songti SC", cs: "Consolas" } as const;

function hasCjk(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}

function textRun(value: string, options: InlineStyleOptions = {}): TextRun {
  return new TextRun({
    text: value,
    font: hasCjk(value) ? BODY_FONT : { ascii: "Times New Roman", hAnsi: "Times New Roman", eastAsia: "Times New Roman", cs: "Times New Roman" },
    ...options,
  });
}

function textAndMathRuns(value: string, options: InlineStyleOptions = {}): ParagraphChild[] {
  const runs: ParagraphChild[] = [];
  let cursor = 0;
  const markerPattern = new RegExp(FORMULA_MARKER_PATTERN.source, "g");
  let match: RegExpExecArray | null;
  while ((match = markerPattern.exec(value))) {
    if (match.index > cursor) runs.push(...textAndMathRuns(value.slice(cursor, match.index), options));
    runs.push(latexToWordMath(decodeFormulaHex(match[2])));
    cursor = match.index + match[0].length;
  }
  if (cursor > 0) {
    if (cursor < value.length) runs.push(...textAndMathRuns(value.slice(cursor), options));
    return runs;
  }
  return splitMarkdownMath(value).map((segment) => segment.type === "math"
    ? latexToWordMath(segment.value)
    : textRun(segment.value.replace(/`/g, ""), options));
}

function inlineRuns(tokens: InlineToken[], options: InlineStyleOptions = {}): ParagraphChild[] {
  const runs: ParagraphChild[] = [];
  for (const token of tokens) {
    if (!token) continue;
    switch (token.type) {
      case "text":
        runs.push(...(token.tokens?.length
          ? inlineRuns(token.tokens, options)
          : textAndMathRuns(token.text ?? "", options)));
        break;
      case "escape":
        if (token.text) runs.push(textRun(token.text, options));
        break;
      case "strong":
        runs.push(...(token.tokens?.length
          ? inlineRuns(token.tokens, { ...options, bold: true })
          : textAndMathRuns(token.text || "", { ...options, bold: true })));
        break;
      case "em":
        runs.push(...(token.tokens?.length
          ? inlineRuns(token.tokens, { ...options, italics: true })
          : textAndMathRuns(token.text || "", { ...options, italics: true })));
        break;
      case "del":
        runs.push(...(token.tokens?.length
          ? inlineRuns(token.tokens, { ...options, strike: true })
          : textAndMathRuns(token.text || "", { ...options, strike: true })));
        break;
      case "codespan":
        runs.push(new TextRun({ text: cleanText(token.text ?? ""), ...options, font: CODE_FONT }));
        break;
      case "link":
        runs.push(
          new ExternalHyperlink({
            children: [
              textRun(cleanText(flattenText(token.tokens) || token.text || token.href || ""), {
                ...options,
                color: "0563C1",
                underline: {},
              }),
            ],
            link: token.href || "",
          }),
        );
        break;
      case "image":
        runs.push(textRun(token.text || token.title || "", { ...options, italics: true, color: "77736B" }));
        break;
      case "br":
        runs.push(new TextRun({ break: 1, ...options }));
        break;
      default:
        break;
    }
  }
  return runs;
}

function tableCellRuns(cell: any, options: InlineStyleOptions = {}): ParagraphChild[] {
  const text = typeof cell === "string" ? cell : String(cell?.text ?? "");
  // Marked may keep a table cell's formula marker inside the cell text token.
  // Prefer that source so the formula cannot fall back to a plain TextRun.
  if (FORMULA_MARKER_PATTERN.test(text)) {
    FORMULA_MARKER_PATTERN.lastIndex = 0;
    return textAndMathRuns(text, options);
  }
  FORMULA_MARKER_PATTERN.lastIndex = 0;
  if (cell?.tokens?.length) {
    const tokenText = cell.tokens.map((token: InlineToken) => token.text ?? token.raw ?? "").join("");
    if (FORMULA_MARKER_PATTERN.test(tokenText)) {
      FORMULA_MARKER_PATTERN.lastIndex = 0;
      return textAndMathRuns(tokenText, options);
    }
    FORMULA_MARKER_PATTERN.lastIndex = 0;
    return inlineRuns(cell.tokens, options);
  }
  return textAndMathRuns(text, options);
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
  return normalizeLatexSource(value);
}

type FormulaWord = {
  start: number;
  end: number;
  coreStart: number;
  coreEnd: number;
  math: boolean;
  relation: boolean;
  atom: boolean;
  connector: boolean;
};

function formulaWord(line: string, match: RegExpExecArray): FormulaWord {
  const raw = match[0];
  let coreStart = 0;
  let coreEnd = raw.length;
  if (raw.startsWith("**")) coreStart = 2;
  if (raw.endsWith("**") && coreEnd - coreStart > 4) coreEnd -= 2;
  while (/[.,;:]/.test(raw[coreEnd - 1] ?? "")) coreEnd -= 1;
  const candidate = raw.slice(coreStart, coreEnd);
  if (candidate.startsWith("(") && !candidate.includes(")")) coreStart += 1;
  if (raw.slice(coreStart, coreEnd).endsWith(")") && !raw.slice(coreStart, coreEnd).includes("(")) coreEnd -= 1;

  const core = raw.slice(coreStart, coreEnd);
  const command = /\\{1,}[A-Za-z]+/.test(core);
  const subOrSuper = /(?:[A-Za-z)}\]])(?:\\?_(?:\{|[A-Za-z0-9])|\^)/.test(core);
  const equation = /=/.test(core) && /^[A-Za-z0-9Θ{}()[\],._^*+\-=|\\]+$/.test(core);
  const relation = /^\\{1,}(?:in|notin|mid|times|cdot|subset|subseteq|supset|supseteq|rightarrow|leftarrow|parallel)$/.test(core);
  const connector = /^(?:\\?[=+\-*/]|\\(?:quad|qquad))$/.test(core);
  const atomCore = core.replace(/^[([{]+|[)\]},]+$/g, "");
  const atom = /^[A-Za-zΘ](?:,[A-Za-zΘ])*$/.test(atomCore) || subOrSuper || equation;

  return {
    start: match.index,
    end: match.index + raw.length,
    coreStart: match.index + coreStart,
    coreEnd: match.index + coreEnd,
    math: command || subOrSuper || equation,
    relation,
    atom,
    connector,
  };
}

function normalizeInlineFormulas(line: string): { text: string; count: number } {
  if (!/(?:\\{1,}[A-Za-z]+|[A-Za-z)}\]]\\?_(?:\{|[A-Za-z0-9])|[A-Za-z)}\]]\^)/.test(line) || line.includes("$")) {
    return { text: line, count: 0 };
  }

  const words: FormulaWord[] = [];
  const wordPattern = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = wordPattern.exec(line))) words.push(formulaWord(line, match));

  const selected = words.map((word) => word.math);
  for (let index = 0; index < words.length; index += 1) {
    if (!words[index].relation) continue;
    selected[index] = true;
    if (index > 0 && words[index - 1].atom) selected[index - 1] = true;
    if (index + 1 < words.length && words[index + 1].atom) selected[index + 1] = true;
  }
  for (let index = 1; index + 1 < words.length; index += 1) {
    if (words[index].connector && selected[index - 1] && selected[index + 1]) selected[index] = true;
  }

  const ranges: Array<{ start: number; end: number }> = [];
  for (let index = 0; index < words.length; index += 1) {
    if (!selected[index]) continue;
    const start = words[index].coreStart;
    let end = words[index].coreEnd;
    while (index + 1 < words.length && selected[index + 1]) {
      index += 1;
      end = words[index].coreEnd;
    }
    if (end > start) ranges.push({ start, end });
  }

  if (!ranges.length) return { text: line, count: 0 };
  let output = "";
  let cursor = 0;
  for (const range of ranges) {
    output += line.slice(cursor, range.start);
    output += `$${normalizeEscapedLatex(line.slice(range.start, range.end))}$`;
    cursor = range.end;
  }
  output += line.slice(cursor);
  return { text: output, count: ranges.length };
}

function stripCommonAiPreamble(text: string): string {
  const lines = text.split(/\r?\n/);
  const firstContent = lines.findIndex((line) => line.trim());
  if (firstContent < 0) return text;
  const first = lines[firstContent].trim();
  const next = lines.slice(firstContent + 1).find((line) => line.trim())?.trim() ?? "";
  const isTranslationPreamble = /^Here is (?:the )?.{0,100}(?:translation|translated document).{0,100}(?:journal|format|requirements).*:$/i.test(first);
  if (!isTranslationPreamble || !/^#{1,6}\s/.test(next)) return text;
  lines.splice(firstContent, 1);
  return lines.join("\n").replace(/^\s*\n/, "");
}

export function normalizeUnmarkedFormulas(text: string): { text: string; count: number } {
  const delimited = normalizeDelimitedChunks(text);
  const output: string[] = [];
  let count = delimited.count;
  let inCodeFence = false;

  for (const line of delimited.text.split(/\r?\n/)) {
    if (/^\s*(?:```|~~~)/.test(line)) {
      inCodeFence = !inCodeFence;
      output.push(line);
      continue;
    }

    if (!inCodeFence && isHighConfidenceFormulaLine(line)) {
      while (output.length > 0 && output[output.length - 1].trim() === "") output.pop();
      output.push("", "$$", normalizeLatexSource(line), "$$", "");
      count += 1;
      continue;
    }
    if (!inCodeFence) {
      const normalized = normalizeInlineFormulas(line);
      output.push(normalized.text);
      count += normalized.count;
    } else {
      output.push(line);
    }
  }

  return { text: output.join("\n").replace(/\n{4,}/g, "\n\n\n"), count };
}

const BODY_SPACING = { before: 0, after: 0, line: 276, lineRule: LineRuleType.AUTO } as const;

function splitAtBreaks(tokens: InlineToken[]): InlineToken[][] {
  const groups: InlineToken[][] = [[]];
  for (const token of tokens) {
    if (token.type === "br") groups.push([]);
    else groups[groups.length - 1].push(token);
  }
  return groups.filter((group) => group.length > 0);
}

function containsFormulaMarker(tokens: InlineToken[]): boolean {
  return tokens.some((token) => {
    if (!token) return false;
    if (FORMULA_MARKER_PATTERN.test(token.text ?? "")) {
      FORMULA_MARKER_PATTERN.lastIndex = 0;
      return true;
    }
    FORMULA_MARKER_PATTERN.lastIndex = 0;
    return token.tokens ? containsFormulaMarker(token.tokens) : false;
  });
}

function listParagraphs(block: any, level = 0): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  for (const item of block.items ?? []) {
    const itemTokens = (item.tokens ?? []).filter((token: any) => token.type !== "list");
    paragraphs.push(new Paragraph({
      ...(block.ordered
        ? { numbering: { reference: "ordered-list", level: Math.min(level, 2) } }
        : { bullet: { level: Math.min(level, 8) } }),
      alignment: AlignmentType.JUSTIFIED,
      spacing: BODY_SPACING,
      children: inlineRuns(itemTokens),
    }));
    for (const nested of (item.tokens ?? []).filter((token: any) => token.type === "list")) {
      paragraphs.push(...listParagraphs(nested, level + 1));
    }
  }
  return paragraphs;
}

function blockChildren(blocks: any[]): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [];
  let foundTitle = false;
  for (const block of blocks) {
    if (!block) continue;
    switch (block.type) {
      case "heading": {
        const level = Math.min(block.depth, 6) as 1 | 2 | 3 | 4 | 5 | 6;
        const heading = `Heading${level}` as keyof typeof HeadingLevel;
        const isTitle = !foundTitle;
        foundTitle = true;
        children.push(new Paragraph({
          heading: HeadingLevel[heading],
          alignment: isTitle ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
          keepNext: true,
          spacing: BODY_SPACING,
          children: inlineRuns(block.tokens ?? [], isTitle ? { bold: true, size: 28 } : { bold: true }),
        }));
        break;
      }
      case "paragraph": {
        const raw = String(block.raw ?? block.text ?? "").trim();
        const displayMatch = /^\$\$([\s\S]+)\$\$$/.exec(raw);
        const protectedFormula = markerFormula(raw);
        if (displayMatch || protectedFormula?.display) {
          children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: BODY_SPACING,
            children: [latexToWordMath(displayMatch?.[1] ?? protectedFormula?.latex ?? "")],
          }));
        } else {
          const isCaption = /^\*\*Table\s+\d+\s*:/i.test(raw);
          for (const tokens of splitAtBreaks(block.tokens ?? [])) {
            children.push(new Paragraph({
              alignment: isCaption
                ? AlignmentType.CENTER
                : containsFormulaMarker(tokens) ? AlignmentType.LEFT : AlignmentType.JUSTIFIED,
              keepNext: isCaption || undefined,
              spacing: BODY_SPACING,
              children: inlineRuns(tokens),
            }));
          }
        }
        break;
      }
      case "list":
        children.push(...listParagraphs(block));
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
        if ((block.tokens ?? []).some((token: any) => token.type === "list")) {
          for (const token of block.tokens ?? []) {
            if (token.type === "list") children.push(...listParagraphs(token));
          }
        } else {
          children.push(new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: BODY_SPACING,
            indent: { left: 360 },
            border: { left: { style: "single", size: 12, color: "DEDBD4" } },
            children: inlineRuns(block.tokens ?? []),
          }));
        }
        break;
      case "table": {
        const headerLabel = String(block.header?.[0]?.text ?? "");
        const isModelParameterTable = headerLabel === "模型类型";
        const columnCount = Math.max(block.header?.length ?? 0, 1);
        const columnWidths = isModelParameterTable
          ? [1100, 1400, 4300, 1000, 1560]
          : Array.from({ length: columnCount }, () => Math.floor(9360 / columnCount));
        const cellsToRow = (cells: any[], header = false) => new TableRow({
          tableHeader: header || undefined,
          cantSplit: true,
          children: cells.map((cell, index) => new TableCell({
            verticalAlign: VerticalAlign.CENTER,
            width: { size: columnWidths[index] ?? columnWidths[columnWidths.length - 1], type: WidthType.DXA },
            margins: { top: 60, bottom: 60, left: 60, right: 60 },
            shading: header ? { type: "clear", fill: "F3F0E9" } : undefined,
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: BODY_SPACING,
              children: typeof cell === "string"
                ? tableCellRuns(cell, { bold: header })
                : tableCellRuns(cell, { bold: header }),
            })],
          })),
        });
        children.push(new Table({
          rows: [cellsToRow(block.header ?? [], true), ...(block.rows ?? []).map((row: any[]) => cellsToRow(row))],
          width: { size: 100, type: WidthType.PERCENTAGE },
          columnWidths,
          alignment: AlignmentType.CENTER,
          layout: TableLayoutType.FIXED,
          margins: { top: 60, bottom: 60, left: 80, right: 80 },
        }));
        break;
      }
      case "hr":
        children.push(new Paragraph({
          spacing: { before: 120, after: 240 },
          border: { bottom: { style: "single", size: 6, color: "DEDBD4" } },
        }));
        break;
      case "space":
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
  const normalized = normalizeUnmarkedFormulas(stripCommonAiPreamble(decoded.text));
  return { ...decoded, text: normalized.text, normalizedFormulaCount: normalized.count };
}

export async function markdownToWord(file: File, repair = true): Promise<ConversionResult> {
  const decoded = await readMarkdownFile(file, repair);
  const blocks = marked.lexer(protectMarkdownMath(decoded.text));
  const doc = new WordDocument({
    creator: "文档渡口",
    title: safeStem(file.name),
    styles: {
      default: {
        document: {
          run: { font: BODY_FONT, size: 20 },
          paragraph: { spacing: BODY_SPACING },
        },
        heading1: { run: { font: BODY_FONT, size: 20, bold: true }, paragraph: { spacing: BODY_SPACING } },
        heading2: { run: { font: BODY_FONT, size: 20, bold: true }, paragraph: { spacing: BODY_SPACING } },
        heading3: { run: { font: BODY_FONT, size: 20, bold: true }, paragraph: { spacing: BODY_SPACING } },
        heading4: { run: { font: BODY_FONT, size: 20, bold: true }, paragraph: { spacing: BODY_SPACING } },
        heading5: { run: { font: BODY_FONT, size: 20, bold: true }, paragraph: { spacing: BODY_SPACING } },
        heading6: { run: { font: BODY_FONT, size: 20, bold: true }, paragraph: { spacing: BODY_SPACING } },
      },
    },
    numbering: {
      config: [{
        reference: "ordered-list",
        levels: [{ level: 0, format: NumberFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT }],
      }],
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
        },
      },
      children: blockChildren(blocks),
    }],
  });
  const blob = await Packer.toBlob(doc);
  const formulaResidualCount = await auditWordFormulaSource(blob);
  return {
    blob,
    filename: `${safeStem(file.name)}.docx`,
    meta: {
      encoding: decoded.encoding,
      formulaCount: countMarkdownFormulas(decoded.text),
      repairedCount: decoded.repairedCount,
      normalizedFormulaCount: decoded.normalizedFormulaCount,
      formulaResidualCount,
    },
  };
}

async function auditWordFormulaSource(blob: Blob): Promise<number> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) return 0;
  const xml = await documentFile.async("string");
  const documentNode = new DOMParser().parseFromString(xml, "application/xml");
  const formulas = Array.from(documentNode.getElementsByTagNameNS(MATH_NS, "oMath"));
  return formulas.filter((formula) => /\\[A-Za-z]+|\$\$?/.test(formula.textContent ?? "")).length;
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

type WordFormulaCandidate = {
  paragraph: Element;
  sourceRun: Element;
  text: string;
  segments: MathSegment[];
};

const BARE_LATEX_SOURCE = /\\(?:frac|dfrac|tfrac|text|mathrm|mathbf|mathit|mathcal|mathbb|sqrt|cdot|times|ln|log|sum|prod|int|left|right|begin|end|multicolumn)\b/;
const AI_PLAINTEXT_LABEL = /^\s*Plaintext(?:\s+|$)/i;

function paragraphSourceText(paragraph: Element): string {
  const parts: string[] = [];
  for (const child of childElements(paragraph)) {
    if (child.localName !== "r") continue;
    for (const runChild of childElements(child)) {
      if (runChild.localName === "t") parts.push(runChild.textContent ?? "");
      if (runChild.localName === "br" || runChild.localName === "cr") parts.push("\n");
      if (runChild.localName === "tab") parts.push("\t");
    }
  }
  return parts.join("");
}

function wordTextFormulaCandidates(documentNode: globalThis.Document): WordFormulaCandidate[] {
  const candidates: WordFormulaCandidate[] = [];
  const paragraphs = Array.from(documentNode.getElementsByTagNameNS(WORD_NS, "p"));

  for (const paragraph of paragraphs) {
    const directChildren = childElements(paragraph);
    if (directChildren.some((child) => !["pPr", "r"].includes(child.localName))) continue;
    const runs = directChildren.filter((child) => child.localName === "r");
    if (!runs.length) continue;
    const hasUnsupportedRun = runs.some((run) => childElements(run)
      .some((child) => !["rPr", "t", "br", "cr", "tab"].includes(child.localName)));
    if (hasUnsupportedRun) continue;

    const text = paragraphSourceText(paragraph);
    const segments = splitMarkdownMath(text);
    if (!segments.some((segment) => segment.type === "math")) continue;
    candidates.push({ paragraph, sourceRun: runs[0], text, segments });
  }

  return candidates;
}

function closestWordElement(node: Element | null, localName: string): Element | null {
  let current = node;
  while (current) {
    if (current.namespaceURI === WORD_NS && current.localName === localName) return current;
    current = current.parentElement;
  }
  return null;
}

function paragraphText(paragraph: Element): string {
  return Array.from(paragraph.getElementsByTagNameNS(WORD_NS, "t"))
    .map((node) => node.textContent ?? "")
    .join("");
}

function issueExcerpt(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return "未能读取原文片段";
  return compact.length > 96 ? `${compact.slice(0, 93)}...` : compact;
}

function paragraphLocations(documentNode: globalThis.Document): Map<Element, string> {
  const locations = new Map<Element, string>();
  const tables = Array.from(documentNode.getElementsByTagNameNS(WORD_NS, "tbl"));
  const paragraphs = Array.from(documentNode.getElementsByTagNameNS(WORD_NS, "p"));
  let bodyParagraphIndex = 0;

  for (const paragraph of paragraphs) {
    const table = closestWordElement(paragraph.parentElement, "tbl");
    if (!table) {
      bodyParagraphIndex += 1;
      locations.set(paragraph, `正文第 ${bodyParagraphIndex} 段`);
      continue;
    }

    const row = closestWordElement(paragraph.parentElement, "tr");
    const cell = closestWordElement(paragraph.parentElement, "tc");
    const tableIndex = Math.max(0, tables.indexOf(table)) + 1;
    const rows = namedChildren(table, "tr");
    const rowIndex = row ? Math.max(0, rows.indexOf(row)) + 1 : 1;
    const cells = row ? namedChildren(row, "tc") : [];
    const cellIndex = cell ? Math.max(0, cells.indexOf(cell)) + 1 : 1;
    const cellParagraphs = cell
      ? Array.from(cell.getElementsByTagNameNS(WORD_NS, "p")).filter((item) => closestWordElement(item.parentElement, "tc") === cell)
      : [];
    const cellParagraphIndex = Math.max(0, cellParagraphs.indexOf(paragraph)) + 1;
    locations.set(
      paragraph,
      `表格 ${tableIndex}·第 ${rowIndex} 行第 ${cellIndex} 列${cellParagraphs.length > 1 ? `·第 ${cellParagraphIndex} 段` : ""}`,
    );
  }

  return locations;
}

function countUnescapedDollars(value: string): number {
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "$") continue;
    let slashes = 0;
    for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) slashes += 1;
    if (slashes % 2 === 0) count += 1;
  }
  return count;
}

function inspectWordRepairReport(documentNode: globalThis.Document): WordRepairReport {
  const candidates = wordTextFormulaCandidates(documentNode);
  const locations = paragraphLocations(documentNode);
  const candidateCounts = new Map<Element, number>();
  let repairableCount = 0;

  for (const candidate of candidates) {
    const count = candidate.segments.filter((segment) => segment.type === "math").length;
    repairableCount += count;
    candidateCounts.set(candidate.paragraph, count);
  }

  const issues: WordRepairIssue[] = [];
  const paragraphs = Array.from(documentNode.getElementsByTagNameNS(WORD_NS, "p"));
  for (const paragraph of paragraphs) {
    const text = paragraphText(paragraph);
    if (!text) continue;
    const segments = splitMarkdownMath(text);
    const delimitedCount = segments.filter((segment) => segment.type === "math").length;
    const repairableHere = candidateCounts.get(paragraph) ?? 0;
    const splitAcrossRuns = Math.max(0, delimitedCount - repairableHere);
    const location = locations.get(paragraph) ?? "正文";

    if (splitAcrossRuns > 0) {
      issues.push({
        location,
        excerpt: issueExcerpt(text),
        reason: "公式被 Word 拆成了多个文本片段，当前版本不自动合并，以免破坏原文。",
        count: splitAcrossRuns,
      });
    }

    const plainText = segments.filter((segment) => segment.type === "text").map((segment) => segment.value).join("");
    const simpleMulticolumn = /^\\{1,2}multicolumn\{\d+\}\{c\s*$/.test(plainText.trim());
    if (BARE_LATEX_SOURCE.test(plainText) && !simpleMulticolumn) {
      issues.push({
        location,
        excerpt: issueExcerpt(plainText),
        reason: "发现没有完整公式标记的 LaTeX 源码，无法可靠判断公式边界。",
        count: 1,
      });
    }

    if (delimitedCount === 0 && countUnescapedDollars(text) % 2 === 1) {
      issues.push({
        location,
        excerpt: issueExcerpt(text),
        reason: "公式标记不完整，缺少开始或结束符号。",
        count: 1,
      });
    }
  }

  const formulaObjects = Array.from(documentNode.getElementsByTagNameNS(MATH_NS, "oMath"));
  for (const formula of formulaObjects) {
    const source = formula.textContent ?? "";
    if (!/[\\$]/.test(source)) continue;
    const paragraph = closestWordElement(formula.parentElement, "p");
    issues.push({
      location: paragraph ? locations.get(paragraph) ?? "Word 公式对象" : "Word 公式对象",
      excerpt: issueExcerpt(source),
      reason: "Word 公式对象内仍包含 LaTeX 源码，当前版本暂不重建已有公式对象。",
      count: 1,
    });
  }

  const remainingCount = issues.reduce((count, issue) => count + issue.count, 0);
  return {
    detectedCount: repairableCount + remainingCount,
    repairableCount,
    repairedCount: 0,
    remainingCount,
    issues,
  };
}

async function buildWordMathNodes(latexSources: string[]): Promise<Element[]> {
  if (!latexSources.length) return [];
  const formulaDocument = new WordDocument({
    sections: [{
      children: latexSources.map((latex) => new Paragraph({ children: [latexToWordMath(latex)] })),
    }],
  });
  const formulaBlob = await Packer.toBlob(formulaDocument);
  const formulaZip = await JSZip.loadAsync(await formulaBlob.arrayBuffer());
  const formulaXml = await formulaZip.file("word/document.xml")?.async("string");
  if (!formulaXml) throw new Error("无法生成 Word 公式结构");
  const formulaNode = new DOMParser().parseFromString(formulaXml, "application/xml");
  return Array.from(formulaNode.getElementsByTagNameNS(MATH_NS, "oMath"));
}

function cloneTextRun(documentNode: globalThis.Document, sourceRun: Element, text: string): Element {
  const run = documentNode.createElementNS(WORD_NS, "w:r");
  const runProperties = childElements(sourceRun).find((child) => child.localName === "rPr");
  if (runProperties) run.appendChild(documentNode.importNode(runProperties, true));
  const textNode = documentNode.createElementNS(WORD_NS, "w:t");
  if (/^\s|\s$/.test(text)) {
    textNode.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
  }
  textNode.textContent = text;
  run.appendChild(textNode);
  return run;
}

function appendCandidateSegments(
  documentNode: globalThis.Document,
  candidate: WordFormulaCandidate,
  formulaNodes: Element[],
  formulaIndex: { value: number },
): number {
  let repairedCount = 0;
  const properties = childElements(candidate.paragraph).find((child) => child.localName === "pPr");
  for (const child of childElements(candidate.paragraph)) {
    if (child !== properties) candidate.paragraph.removeChild(child);
  }

  for (const segment of candidate.segments) {
    if (segment.type === "text") {
      const chunks = segment.value.split("\n");
      chunks.forEach((chunk, index) => {
        if (chunk) candidate.paragraph.appendChild(cloneTextRun(documentNode, candidate.sourceRun, chunk));
        if (index < chunks.length - 1) {
          const breakRun = cloneTextRun(documentNode, candidate.sourceRun, "");
          breakRun.appendChild(documentNode.createElementNS(WORD_NS, "w:br"));
          candidate.paragraph.appendChild(breakRun);
        }
      });
      continue;
    }
    const formulaNode = formulaNodes[formulaIndex.value++];
    if (!formulaNode) continue;
    candidate.paragraph.appendChild(documentNode.importNode(formulaNode, true));
    repairedCount += 1;
  }
  return repairedCount;
}

function setRunBold(documentNode: globalThis.Document, run: Element): void {
  const properties = ensureChildElement(documentNode, run, "rPr");
  if (!childElements(properties).some((child) => child.localName === "b")) {
    properties.appendChild(documentNode.createElementNS(WORD_NS, "w:b"));
  }
  if (!childElements(properties).some((child) => child.localName === "bCs")) {
    properties.appendChild(documentNode.createElementNS(WORD_NS, "w:bCs"));
  }
}

function cleanWordMarkdownArtifacts(documentNode: globalThis.Document): number {
  let cleanedCount = 0;
  const paragraphs = Array.from(documentNode.getElementsByTagNameNS(WORD_NS, "p"));
  for (const paragraph of paragraphs) {
    const text = paragraphSourceText(paragraph);
    const boldMatch = /^\s*\*\*([\s\S]*?)\*\*\s*$/.exec(text);
    if (!boldMatch) continue;
    const runs = childElements(paragraph).filter((child) => child.localName === "r");
    if (!runs.length) continue;
    const properties = childElements(paragraph).find((child) => child.localName === "pPr");
    for (const child of childElements(paragraph)) {
      if (child !== properties) paragraph.removeChild(child);
    }
    const replacement = cloneTextRun(documentNode, runs[0], boldMatch[1]);
    setRunBold(documentNode, replacement);
    paragraph.appendChild(replacement);
    cleanedCount += 1;
  }

  for (const paragraph of paragraphs) {
    const text = paragraphSourceText(paragraph);
    if (!AI_PLAINTEXT_LABEL.test(text)) continue;
    const runs = childElements(paragraph).filter((child) => child.localName === "r");
    if (!runs.length) continue;
    const cleanedText = text.replace(AI_PLAINTEXT_LABEL, "").trimStart();
    const properties = childElements(paragraph).find((child) => child.localName === "pPr");
    for (const child of childElements(paragraph)) {
      if (child !== properties) paragraph.removeChild(child);
    }
    if (cleanedText) paragraph.appendChild(cloneTextRun(documentNode, runs[0], cleanedText));
    cleanedCount += 1;
  }
  return cleanedCount;
}

function setParagraphText(documentNode: globalThis.Document, paragraph: Element, text: string): boolean {
  const runs = childElements(paragraph).filter((child) => child.localName === "r");
  if (!runs.length) return false;
  const properties = childElements(paragraph).find((child) => child.localName === "pPr");
  for (const child of childElements(paragraph)) {
    if (child !== properties) paragraph.removeChild(child);
  }
  if (text) paragraph.appendChild(cloneTextRun(documentNode, runs[0], text));
  return true;
}

function repairSimpleMulticolumnRows(documentNode: globalThis.Document): number {
  let repairedCount = 0;
  const rows = Array.from(documentNode.getElementsByTagNameNS(WORD_NS, "tr"));
  for (const row of rows) {
    const cells = namedChildren(row, "tc");
    for (let index = 0; index < cells.length - 1; index += 1) {
      const markerParagraph = Array.from(cells[index].getElementsByTagNameNS(WORD_NS, "p"))[0];
      const valueParagraph = Array.from(cells[index + 1].getElementsByTagNameNS(WORD_NS, "p"))[0];
      if (!markerParagraph || !valueParagraph) continue;
      const marker = paragraphText(markerParagraph).trim();
      const value = paragraphText(valueParagraph).trim();
      const markerMatch = /^\\{1,2}multicolumn\{(\d+)\}\{c$/.exec(marker);
      const valueMatch = /^\}\{([\s\S]+)\}$/.exec(value);
      if (!markerMatch || !valueMatch) continue;
      const span = Number(markerMatch[1]);
      if (!Number.isInteger(span) || span < 1 || span > cells.length - index) continue;
      if (!setParagraphText(documentNode, markerParagraph, valueMatch[1])) continue;
      setParagraphText(documentNode, valueParagraph, "");
      repairedCount += 1;
    }
  }
  return repairedCount;
}

function ensureChildElement(documentNode: globalThis.Document, parent: Element, localName: string): Element {
  const existing = childElements(parent).find((child) => child.localName === localName);
  if (existing) return existing;
  const created = documentNode.createElementNS(WORD_NS, `w:${localName}`);
  if (localName === "rPr" || localName === "pPr" || localName === "rFonts") {
    parent.insertBefore(created, parent.firstChild);
  } else {
    parent.appendChild(created);
  }
  return created;
}

function setWordFont(documentNode: globalThis.Document, run: Element, asciiFont: string, eastAsiaFont = asciiFont): void {
  const properties = ensureChildElement(documentNode, run, "rPr");
  const fonts = ensureChildElement(documentNode, properties, "rFonts");
  fonts.setAttributeNS(WORD_NS, "w:ascii", asciiFont);
  fonts.setAttributeNS(WORD_NS, "w:hAnsi", asciiFont);
  fonts.setAttributeNS(WORD_NS, "w:eastAsia", eastAsiaFont);
  fonts.setAttributeNS(WORD_NS, "w:cs", asciiFont);
}

function setFirstLineIndent(documentNode: globalThis.Document, paragraph: Element, twips: string): void {
  const properties = ensureChildElement(documentNode, paragraph, "pPr");
  const indent = ensureChildElement(documentNode, properties, "ind");
  indent.setAttributeNS(WORD_NS, "w:firstLine", twips);
  indent.removeAttributeNS(WORD_NS, "w:hanging");
}

function clearFirstLineIndent(documentNode: globalThis.Document, paragraph: Element): void {
  const properties = childElements(paragraph).find((child) => child.localName === "pPr");
  if (!properties) return;
  const indent = childElements(properties).find((child) => child.localName === "ind");
  if (!indent) return;
  indent.removeAttributeNS(WORD_NS, "w:firstLine");
  indent.removeAttributeNS(WORD_NS, "w:hanging");
}

function paragraphHasCjkText(paragraph: Element): boolean {
  return /[\u3400-\u9fff]/.test(paragraphText(paragraph));
}

function paragraphHasLatinText(paragraph: Element): boolean {
  return /[A-Za-z]/.test(paragraphText(paragraph));
}

function isWordHeading(paragraph: Element, text: string): boolean {
  const properties = childElements(paragraph).find((child) => child.localName === "pPr");
  const style = properties && childElements(properties).find((child) => child.localName === "pStyle");
  const styleValue = style?.getAttributeNS(WORD_NS, "val") ?? "";
  return styleValue.toLowerCase().includes("heading")
    || /^\s*(?:\d+(?:\.\d+)*[\s、.]|摘要\s*$|引言\s*$|结论\s*$|参考文献\s*$)/.test(text);
}

function isInsideWordTable(paragraph: Element): boolean {
  return Boolean(closestWordElement(paragraph.parentElement, "tbl"));
}

function emptyWordFormatReport(enabled = false): WordFormatReport {
  return {
    enabled,
    fontRunCount: 0,
    chineseRunCount: 0,
    englishRunCount: 0,
    chineseParagraphCount: 0,
    englishParagraphCount: 0,
  };
}

function formatWordDocument(documentNode: globalThis.Document): WordFormatReport {
  const paragraphs = Array.from(documentNode.getElementsByTagNameNS(WORD_NS, "p"));
  let fontRunCount = 0;
  let chineseRunCount = 0;
  let englishRunCount = 0;
  let chineseParagraphCount = 0;
  let englishParagraphCount = 0;

  for (const paragraph of paragraphs) {
    const text = paragraphText(paragraph);
    if (!text) continue;
    const hasCjk = paragraphHasCjkText(paragraph);
    const hasLatin = paragraphHasLatinText(paragraph);
    const insideTable = isInsideWordTable(paragraph);
    const heading = isWordHeading(paragraph, text);
    if (hasCjk && !insideTable && !heading) {
      chineseParagraphCount += 1;
      setFirstLineIndent(documentNode, paragraph, "420");
    } else if (!insideTable) {
      clearFirstLineIndent(documentNode, paragraph);
    }
    if (hasLatin && !insideTable && !heading) englishParagraphCount += 1;

    const runs = Array.from(paragraph.getElementsByTagNameNS(WORD_NS, "r"));
    for (const run of runs) {
      if (run.getElementsByTagNameNS(MATH_NS, "oMath").length > 0) continue;
      const runText = Array.from(run.getElementsByTagNameNS(WORD_NS, "t"))
        .map((node) => node.textContent ?? "")
        .join("");
      if (!runText) continue;
      const runHasCjk = /[\u3400-\u9fff]/.test(runText);
      const runHasLatin = /[A-Za-z]/.test(runText);
      setWordFont(documentNode, run, "Times New Roman", runHasCjk ? "SimSun" : "Times New Roman");
      fontRunCount += 1;
      if (runHasCjk) chineseRunCount += 1;
      if (runHasLatin) englishRunCount += 1;
    }
  }

  return {
    enabled: true,
    fontRunCount,
    chineseRunCount,
    englishRunCount,
    chineseParagraphCount,
    englishParagraphCount,
  };
}

export async function inspectWordOptimization(file: File, options: WordOptimizationOptions = {}): Promise<ConversionMeta> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new Error("不是可读取的 Word 文档");
  const documentNode = new DOMParser().parseFromString(await documentFile.async("string"), "application/xml");
  const repairReport = inspectWordRepairReport(documentNode);
  const formatReport = options.formatDocument ? formatWordDocument(documentNode) : emptyWordFormatReport();
  return {
    encoding: "DOCX / UTF-8",
    formulaCount: repairReport.detectedCount,
    repairedCount: 0,
    normalizedFormulaCount: 0,
    formulaResidualCount: repairReport.remainingCount,
    repairReport,
    formatReport,
  };
}

export async function optimizeWord(file: File, options: WordOptimizationOptions = {}): Promise<ConversionResult> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new Error("不是可读取的 Word 文档");

  const xml = await documentFile.async("string");
  const documentNode = new DOMParser().parseFromString(xml, "application/xml");
  const inputReport = inspectWordRepairReport(documentNode);
  cleanWordMarkdownArtifacts(documentNode);
  repairSimpleMulticolumnRows(documentNode);
  const candidates = wordTextFormulaCandidates(documentNode);
  const latexSources = candidates.flatMap((candidate) => candidate.segments
    .filter((segment): segment is MathSegment & { type: "math" } => segment.type === "math")
    .map((segment) => normalizeLatexSource(segment.value)));
  const formulaNodes = await buildWordMathNodes(latexSources);
  const formulaIndex = { value: 0 };
  let repairedCount = 0;

  for (const candidate of candidates) {
    repairedCount += appendCandidateSegments(documentNode, candidate, formulaNodes, formulaIndex);
  }

  const serialized = new XMLSerializer().serializeToString(documentNode);
  const outputDocument = new DOMParser().parseFromString(serialized, "application/xml");
  const formatReport = options.formatDocument ? formatWordDocument(outputDocument) : emptyWordFormatReport();
  const finalSerialized = options.formatDocument ? new XMLSerializer().serializeToString(outputDocument) : serialized;
  zip.file("word/document.xml", finalSerialized);
  const finalBlob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const outputReport = inspectWordRepairReport(outputDocument);
  const repairReport: WordRepairReport = {
    detectedCount: inputReport.detectedCount,
    repairableCount: inputReport.repairableCount,
    repairedCount,
    remainingCount: outputReport.remainingCount,
    issues: outputReport.issues,
  };

  return {
    blob: finalBlob,
    filename: `${safeStem(file.name)}-优化后.docx`,
    meta: {
      encoding: "DOCX / UTF-8",
      formulaCount: repairReport.detectedCount,
      repairedCount: 0,
      normalizedFormulaCount: repairedCount,
      formulaResidualCount: repairReport.remainingCount,
      repairReport,
      formatReport,
    },
  };
}
