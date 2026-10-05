import JSZip from "jszip";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/package/2006/relationships";
const CT = "http://schemas.openxmlformats.org/package/2006/content-types";
const MAX_BYTES = 30 * 1024 * 1024;

export type FormatMode = "business" | "standard";
export type NumberScheme = 1 | 2 | 3;

export type BidParagraph = {
  index: number;
  text: string;
  styleId: string;
  inferredLevel: number;
  manualNumber: boolean;
  protectedReason: string | null;
};

export type BidInspection = {
  paragraphs: BidParagraph[];
  tableCount: number;
  graphicCount: number;
  sectionCount: number;
  hasToc: boolean;
  warnings: string[];
};

export type BidOptions = {
  boundaryIndex: number;
  technicalEndIndex: number;
  mode: FormatMode;
  formatBusiness: boolean;
  scheme: NumberScheme;
  tocDepth: 3 | 4;
  tocBeforeIndex: number | null;
  applyPageLayout: boolean;
  levels: Record<number, number>;
  protectedIndices: number[];
};

export type BidResult = {
  zip: Blob;
  report: string[];
  formattedParagraphs: number;
  numberedHeadings: number;
};

type StyleSpec = { font: string; size: number; bold: boolean; align: string; line: number; styleId?: string };
type ResolvedBusinessSpec = { spec: StyleSpec; item: BidParagraph | null; source: "business" | "inherited" | "standard" | "adjusted" };

const STANDARD: StyleSpec[] = [
  { font: "宋体", size: 24, bold: false, align: "both", line: 360 },
  { font: "宋体", size: 44, bold: true, align: "center", line: 360 },
  { font: "宋体", size: 36, bold: true, align: "left", line: 360 },
  { font: "宋体", size: 32, bold: true, align: "left", line: 360 },
  { font: "宋体", size: 30, bold: true, align: "left", line: 360 },
  { font: "宋体", size: 28, bold: true, align: "left", line: 360 },
  { font: "宋体", size: 28, bold: true, align: "left", line: 360 },
];

function parseXml(source: string, label: string): XMLDocument {
  const doc = new DOMParser().parseFromString(source, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error(`${label} 无法解析，文件可能已损坏。`);
  return doc;
}

function childElements(parent: Element): Element[] {
  return Array.from(parent.childNodes).filter((node): node is Element => node.nodeType === 1);
}

function direct(parent: Element, name: string): Element | null {
  return childElements(parent).find((child) => child.namespaceURI === W && child.localName === name) ?? null;
}

function descendants(parent: Element | Document, name: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS(W, name));
}

function value(node: Element | null, name = "val"): string {
  return node?.getAttributeNS(W, name) ?? "";
}

function setValue(node: Element, valueText: string, name = "val") {
  node.setAttributeNS(W, `w:${name}`, valueText);
}

function make(doc: Document, name: string): Element {
  return doc.createElementNS(W, `w:${name}`);
}

function ensure(parent: Element, name: string): Element {
  const existing = direct(parent, name);
  if (existing) return existing;
  const node = make(parent.ownerDocument, name);
  parent.appendChild(node);
  return node;
}

function remove(node: Element | null | undefined) {
  if (node?.parentNode) node.parentNode.removeChild(node);
}

function getParagraphs(documentXml: XMLDocument): Element[] {
  const body = descendants(documentXml, "body")[0];
  if (!body) throw new Error("DOCX 缺少正文结构。 ");
  return childElements(body).filter((node) => node.namespaceURI === W && node.localName === "p");
}

function textOf(paragraph: Element): string {
  return descendants(paragraph, "t").map((node) => node.textContent ?? "").join("");
}

function manualPrefix(text: string): { yes: boolean; depth: number } {
  const numeric = text.match(/^\s*\d+(?:[.．]\d+){1,}/);
  if (numeric) return { yes: true, depth: Math.min(99, (numeric[0].match(/[.．]/g) ?? []).length + 1) };
  if (/^\s*第[一二三四五六七八九十百千\d]+[章节篇部分]/.test(text)) return { yes: true, depth: 1 };
  if (/^\s*[一二三四五六七八九十百千]+[、.．]/.test(text)) return { yes: true, depth: 1 };
  if (/^\s*[（(][一二三四五六七八九十\d]+[）)]/.test(text)) return { yes: true, depth: 2 };
  if (/^\s*\d+[.．、）)]/.test(text)) return { yes: true, depth: 2 };
  if (/^\s*[①②③④⑤⑥⑦⑧⑨⑩]/.test(text)) return { yes: true, depth: 5 };
  return { yes: false, depth: 0 };
}

function headingLevel(paragraph: Element, text: string): number {
  const pPr = direct(paragraph, "pPr");
  const style = value(pPr ? direct(pPr, "pStyle") : null);
  const styleMatch = style.match(/(?:Heading|标题|head)[\s_-]*([1-9])$/i);
  if (styleMatch) return Number(styleMatch[1]);
  const outline = value(pPr ? direct(pPr, "outlineLvl") : null);
  if (/^[0-8]$/.test(outline)) return Number(outline) + 1;
  const prefix = manualPrefix(text);
  if (prefix.yes && text.trim().length < 95) return prefix.depth;
  return 0;
}

function protectedReason(paragraph: Element, text: string, index: number): string | null {
  if (["drawing", "pict", "object", "fldChar", "fldSimple", "instrText", "sdt", "hyperlink"].some((tag) => descendants(paragraph, tag).length)) {
    return "含图片、签章、域或特殊对象";
  }
  if (index < 12 && /^(?:\s*(?:正本|副本|封面|投标文件|项目名称|项目编号|招标编号|投标人|投标单位|投标日期|法定代表人|授权代表))/.test(text)) {
    return "疑似封面或固定信息";
  }
  if (index < 20 && text.trim() === "目录") return "原有目录标题";
  const pPr = direct(paragraph, "pPr");
  const explicitHeading = /(?:Heading|标题|head)[\s_-]*[1-9]$/i.test(value(pPr ? direct(pPr, "pStyle") : null)) ||
    /^[0-8]$/.test(value(pPr ? direct(pPr, "outlineLvl") : null));
  if (descendants(paragraph, "numPr").length && !explicitHeading) return "已有自动列表";
  if (/^\s*[^。！？]{1,30}[：:][^。！？]{0,70}\s*$/.test(text) || /_{4,}|＿{4,}/.test(text)) return "疑似固定表单";
  return null;
}

async function openDocx(file: File) {
  if (!file.name.toLowerCase().endsWith(".docx")) throw new Error("请上传 DOCX 文件。旧版 .doc 请先在 Word/WPS 中另存为 DOCX。");
  if (file.size > MAX_BYTES) throw new Error("第一版暂支持 30 MB 以内的 DOCX。");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const source = zip.file("word/document.xml");
  if (!source) throw new Error("文件不是有效的 DOCX：缺少正文。 ");
  return { zip, documentXml: parseXml(await source.async("string"), "DOCX 正文") };
}

export async function inspectBidDocx(file: File): Promise<BidInspection> {
  const { documentXml } = await openDocx(file);
  const paragraphs = getParagraphs(documentXml).map((paragraph, index) => {
    const text = textOf(paragraph);
    const styleId = value(direct(direct(paragraph, "pPr") ?? paragraph, "pStyle"));
    return {
      index,
      text,
      styleId,
      inferredLevel: headingLevel(paragraph, text),
      manualNumber: manualPrefix(text).yes || descendants(paragraph, "numPr").length > 0,
      protectedReason: protectedReason(paragraph, text, index),
    };
  });
  const sectionCount = descendants(documentXml, "sectPr").length;
  const hasToc = descendants(documentXml, "instrText").some((node) => /\bTOC\b/i.test(node.textContent ?? "")) ||
    descendants(documentXml, "fldSimple").some((node) => /\bTOC\b/i.test(value(node, "instr")));
  const warnings: string[] = [];
  if (sectionCount > 1) warnings.push("文档含多个节，页面边距将保持原样；请检查横向页和页眉页脚。");
  if (paragraphs.some((p) => p.inferredLevel > 9)) warnings.push("发现超过 9 级的标题编号；深层可见编号将保留，但不能保证进入 Word/WPS 自动大纲。");
  if (!paragraphs.some((p) => p.inferredLevel > 0)) warnings.push("未可靠识别标题，请在下方手工标记标题层级后再导出。");
  return {
    paragraphs,
    tableCount: descendants(documentXml, "tbl").length,
    graphicCount: descendants(documentXml, "drawing").length + descendants(documentXml, "pict").length,
    sectionCount,
    hasToc,
    warnings,
  };
}

export async function inspectBusinessFormats(file: File, inspection: BidInspection, boundaryIndex: number): Promise<Array<{ level: number; example: string; font: string; size: number; align: string; source: ResolvedBusinessSpec["source"] }>> {
  const { zip, documentXml } = await openDocx(file);
  const paragraphs = getParagraphs(documentXml);
  const stylesFile = zip.file("word/styles.xml");
  const styles = stylesFile ? parseXml(await stylesFile.async("string"), "样式配置") : null;
  return resolveBusinessSpecs(paragraphs, inspection, boundaryIndex, styles).map(({ spec, item, source }, level) => {
    return { level, example: item?.text.slice(0, 38) ?? "", font: spec.font,
      size: spec.size / 2, align: spec.align, source };
  });
}

function businessSample(paragraphs: Element[], inspection: BidInspection, boundaryIndex: number, styles: XMLDocument | null, level: number,
  levels: Record<number, number> = {}): { item: BidParagraph; spec: StyleSpec } | null {
  const candidates = inspection.paragraphs.filter((item) => item.index < boundaryIndex &&
    (levels[item.index] ?? item.inferredLevel) === level && !item.protectedReason &&
    item.text.trim().length >= (level === 0 ? 25 : 2));
  if (!candidates.length) return null;
  if (level > 0) return { item: candidates[0], spec: firstRunSpec(paragraphs[candidates[0].index], styles, level) };
  const bodyCandidates = candidates.filter((item) => item.index >= 20);
  const samples = (bodyCandidates.length ? bodyCandidates : candidates).map((item) => ({
    item, spec: firstRunSpec(paragraphs[item.index], styles, level),
  }));
  const counts = new Map<string, number>();
  for (const { spec } of samples) {
    const key = `${spec.font}|${spec.size}|${spec.align}|${spec.line}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return samples.reduce((best, sample) => {
    const key = (spec: StyleSpec) => `${spec.font}|${spec.size}|${spec.align}|${spec.line}`;
    return counts.get(key(sample.spec))! > counts.get(key(best.spec))! ? sample : best;
  });
}

function firstRunSpec(paragraph: Element, styles: XMLDocument | null, level: number): StyleSpec {
  const pPr = direct(paragraph, "pPr");
  const styleId = value(pPr ? direct(pPr, "pStyle") : null);
  const style = styles ? descendants(styles, "style").find((node) => value(node, "styleId") === styleId) : null;
  const run = descendants(paragraph, "r").find((node) => descendants(node, "t").length > 0);
  const runPr = run ? direct(run, "rPr") : null;
  const styleRunPr = style ? direct(style, "rPr") : null;
  const runFonts = runPr ? direct(runPr, "rFonts") : null;
  const styleFonts = styleRunPr ? direct(styleRunPr, "rFonts") : null;
  const font = value(runFonts, "eastAsia") || value(styleFonts, "eastAsia") || STANDARD[Math.min(level, 6)].font;
  const size = Number(value(runPr ? direct(runPr, "sz") : null) || value(styleRunPr ? direct(styleRunPr, "sz") : null)) || STANDARD[Math.min(level, 6)].size;
  const runBold = runPr ? direct(runPr, "b") : null;
  const styleBold = styleRunPr ? direct(styleRunPr, "b") : null;
  const bold = [runBold, styleBold].some((node) => node && !["0", "false", "off"].includes(value(node)));
  const alignment = value(pPr ? direct(pPr, "jc") : null) || value(style && direct(style, "pPr") ? direct(direct(style, "pPr")!, "jc") : null) || STANDARD[Math.min(level, 6)].align;
  const spacing = pPr ? direct(pPr, "spacing") : null;
  const styleSpacing = style ? direct(direct(style, "pPr") ?? style, "spacing") : null;
  const line = Number(value(spacing, "line") || value(styleSpacing, "line")) || 360;
  return { font, size, bold, align: alignment, line, styleId };
}

function resolveBusinessSpecs(paragraphs: Element[], inspection: BidInspection, boundaryIndex: number, styles: XMLDocument | null,
  levels: Record<number, number> = {}): ResolvedBusinessSpec[] {
  const resolved: ResolvedBusinessSpec[] = [];
  for (let level = 0; level < STANDARD.length; level++) {
    const sample = businessSample(paragraphs, inspection, boundaryIndex, styles, level, levels);
    const previous = resolved[level - 1]?.spec;
    if (sample) {
      const size = level > 1 && previous ? Math.min(sample.spec.size, previous.size) : sample.spec.size;
      resolved.push({ spec: { ...sample.spec, size }, item: sample.item,
        source: size < sample.spec.size ? "adjusted" : "business" });
    } else if (level > 1 && previous) {
      resolved.push({ spec: { ...previous, styleId: undefined }, item: null, source: "inherited" });
    } else {
      resolved.push({ spec: STANDARD[level], item: null, source: "standard" });
    }
  }
  return resolved;
}

function businessSpecs(paragraphs: Element[], inspection: BidInspection, options: BidOptions, styles: XMLDocument | null): StyleSpec[] {
  return resolveBusinessSpecs(paragraphs, inspection, options.boundaryIndex, styles, options.levels).map(({ spec }) => spec);
}

function upsertProperty(parent: Element, name: string, order: string[]): Element {
  const existing = direct(parent, name);
  if (existing) return existing;
  const node = make(parent.ownerDocument, name);
  const position = order.indexOf(name);
  const next = childElements(parent).find((child) => order.indexOf(child.localName) > position && order.indexOf(child.localName) >= 0);
  parent.insertBefore(node, next ?? null);
  return node;
}

function clearHeadingIndent(paragraph: Element) {
  const pPr = direct(paragraph, "pPr") ?? paragraph.insertBefore(make(paragraph.ownerDocument, "pPr"), paragraph.firstChild);
  const ind = upsertProperty(pPr, "ind", ["pStyle", "keepNext", "numPr", "spacing", "ind", "jc", "outlineLvl", "rPr"]);
  for (const name of ["hanging", "hangingChars"]) ind.removeAttributeNS(W, name);
  for (const name of ["left", "leftChars", "start", "startChars", "firstLine", "firstLineChars"]) setValue(ind, "0", name);
}

function applySpec(paragraph: Element, level: number, spec: StyleSpec, useBusinessStyle: boolean) {
  const pPr = direct(paragraph, "pPr") ?? paragraph.insertBefore(make(paragraph.ownerDocument, "pPr"), paragraph.firstChild);
  const pOrder = ["pStyle", "keepNext", "numPr", "spacing", "ind", "jc", "outlineLvl", "rPr"];
  if (level > 0 && level <= 9) {
    if (useBusinessStyle && spec.styleId) setValue(upsertProperty(pPr, "pStyle", pOrder), spec.styleId);
    setValue(upsertProperty(pPr, "outlineLvl", pOrder), String(level - 1));
    upsertProperty(pPr, "keepNext", pOrder);
  } else if (level === 0) {
    const style = direct(pPr, "pStyle");
    if (/(?:Heading|标题|head)[\s_-]*[1-9]$/i.test(value(style))) remove(style);
    remove(direct(pPr, "outlineLvl"));
    remove(direct(pPr, "keepNext"));
  }
  const spacing = upsertProperty(pPr, "spacing", pOrder);
  setValue(spacing, String(spec.line), "line");
  setValue(spacing, "auto", "lineRule");
  setValue(upsertProperty(pPr, "jc", pOrder), spec.align);
  if (level === 0) {
    const ind = upsertProperty(pPr, "ind", pOrder);
    setValue(ind, "200", "firstLineChars");
  } else {
    clearHeadingIndent(paragraph);
  }
  const applyRunProperties = (rPr: Element) => {
    const rOrder = ["rStyle", "rFonts", "b", "bCs", "i", "iCs", "color", "sz", "szCs", "highlight", "u"];
    const font = upsertProperty(rPr, "rFonts", rOrder);
    for (const slot of ["ascii", "hAnsi", "eastAsia", "cs"]) setValue(font, spec.font, slot);
    setValue(upsertProperty(rPr, "sz", rOrder), String(spec.size));
    setValue(upsertProperty(rPr, "szCs", rOrder), String(spec.size));
    if (level > 0) setValue(upsertProperty(rPr, "b", rOrder), spec.bold ? "1" : "0");
  };
  if (level > 0) {
    const paragraphMark = direct(pPr, "rPr");
    if (paragraphMark) applyRunProperties(paragraphMark);
  }
  for (const run of descendants(paragraph, "r")) {
    if (descendants(run, "t").length === 0) continue;
    applyRunProperties(direct(run, "rPr") ?? run.insertBefore(make(run.ownerDocument, "rPr"), run.firstChild));
  }
}

function numberingLevels(scheme: NumberScheme) {
  if (scheme === 1) return [
    ["chineseCounting", "%1、"], ["decimal", "%2."], ["decimal", "%2.%3"],
    ["decimal", "%2.%3.%4"], ["decimal", "（%5）"], ["decimalEnclosedCircle", "%6"],
  ];
  if (scheme === 2) return [
    ["chineseCounting", "%1、"], ["chineseCounting", "（%2）"], ["decimal", "%3."],
    ["decimal", "（%4）"], ["decimalEnclosedCircle", "%5"], ["decimal", "%6）"],
  ];
  return [
    ["chineseCounting", "第%1章"], ["chineseCounting", "第%2节"], ["chineseCounting", "%3"],
    ["chineseCounting", "（%4）"], ["decimal", "%5."], ["decimal", "（%6）"],
  ];
}

async function addNumbering(zip: JSZip, scheme: NumberScheme, specs: StyleSpec[]): Promise<number> {
  const path = "word/numbering.xml";
  const existing = zip.file(path);
  const doc = existing ? parseXml(await existing.async("string"), "编号配置") : parseXml(`<w:numbering xmlns:w="${W}"/>`, "编号配置");
  const root = doc.documentElement;
  const abstractId = Math.max(-1, ...descendants(doc, "abstractNum").map((node) => Number(value(node, "abstractNumId")) || 0)) + 1;
  const numId = Math.max(0, ...descendants(doc, "num").map((node) => Number(value(node, "numId")) || 0)) + 1;
  const abstract = make(doc, "abstractNum");
  setValue(abstract, String(abstractId), "abstractNumId");
  setValue(ensure(abstract, "multiLevelType"), "multilevel");
  numberingLevels(scheme).forEach(([format, template], index) => {
    const lvl = make(doc, "lvl");
    setValue(lvl, String(index), "ilvl");
    setValue(ensure(lvl, "start"), "1");
    setValue(ensure(lvl, "numFmt"), format);
    setValue(ensure(lvl, "suff"), "space");
    setValue(ensure(lvl, "lvlText"), template);
    setValue(ensure(lvl, "lvlJc"), "left");
    const ind = ensure(ensure(lvl, "pPr"), "ind");
    setValue(ind, "0", "left");
    setValue(ind, "0", "firstLine");
    const spec = specs[index + 1];
    const rPr = ensure(lvl, "rPr");
    const font = ensure(rPr, "rFonts");
    for (const slot of ["ascii", "hAnsi", "eastAsia", "cs"]) setValue(font, spec.font, slot);
    setValue(ensure(rPr, "b"), spec.bold ? "1" : "0");
    setValue(ensure(rPr, "sz"), String(spec.size));
    setValue(ensure(rPr, "szCs"), String(spec.size));
    abstract.appendChild(lvl);
  });
  const firstNum = descendants(doc, "num")[0];
  root.insertBefore(abstract, firstNum ?? null);
  const num = make(doc, "num");
  setValue(num, String(numId), "numId");
  setValue(ensure(num, "abstractNumId"), String(abstractId));
  root.appendChild(num);
  zip.file(path, new XMLSerializer().serializeToString(doc));
  if (!existing) {
    const relPath = "word/_rels/document.xml.rels";
    const relDoc = zip.file(relPath)
      ? parseXml(await zip.file(relPath)!.async("string"), "文档关系")
      : parseXml(`<Relationships xmlns="${R}"/>`, "文档关系");
    const ids = childElements(relDoc.documentElement).map((node) => node.getAttribute("Id") ?? "");
    let nextId = 1;
    while (ids.includes(`rId${nextId}`)) nextId++;
    const rel = relDoc.createElementNS(R, "Relationship");
    rel.setAttribute("Id", `rId${nextId}`);
    rel.setAttribute("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering");
    rel.setAttribute("Target", "numbering.xml");
    relDoc.documentElement.appendChild(rel);
    zip.file(relPath, new XMLSerializer().serializeToString(relDoc));
    const contentTypes = zip.file("[Content_Types].xml");
    if (contentTypes) {
      const ctDoc = parseXml(await contentTypes.async("string"), "内容类型");
      const override = ctDoc.createElementNS(CT, "Override");
      override.setAttribute("PartName", "/word/numbering.xml");
      override.setAttribute("ContentType", "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml");
      ctDoc.documentElement.appendChild(override);
      zip.file("[Content_Types].xml", new XMLSerializer().serializeToString(ctDoc));
    }
  }
  return numId;
}

function applyNumber(paragraph: Element, level: number, numId: number) {
  const pPr = direct(paragraph, "pPr")!;
  const numPr = upsertProperty(pPr, "numPr", ["pStyle", "keepNext", "numPr", "spacing", "ind", "jc", "outlineLvl", "rPr"]);
  setValue(ensure(numPr, "ilvl"), String(level - 1));
  setValue(ensure(numPr, "numId"), String(numId));
}

function applyPageLayout(documentXml: XMLDocument): boolean {
  const sections = descendants(documentXml, "sectPr");
  if (sections.length !== 1) return false;
  const section = sections[0];
  const pageSize = direct(section, "pgSz");
  if (value(pageSize, "orient") === "landscape") return false;
  const size = upsertProperty(section, "pgSz", ["headerReference", "footerReference", "pgSz", "pgMar"]);
  setValue(size, "11906", "w");
  setValue(size, "16838", "h");
  const margin = upsertProperty(section, "pgMar", ["headerReference", "footerReference", "pgSz", "pgMar"]);
  for (const [name, amount] of Object.entries({ top: "1417", bottom: "1417", left: "1701", right: "1417", header: "1134", footer: "850" })) {
    setValue(margin, amount, name);
  }
  return true;
}

function insertToc(documentXml: XMLDocument, beforeIndex: number, depth: number, paragraphs: Element[]) {
  const body = descendants(documentXml, "body")[0];
  const heading = make(documentXml, "p");
  const headingRun = make(documentXml, "r");
  const headingText = make(documentXml, "t");
  headingText.textContent = "目录";
  headingRun.appendChild(headingText);
  heading.appendChild(headingRun);
  const fieldParagraph = make(documentXml, "p");
  const field = make(documentXml, "fldSimple");
  setValue(field, `TOC \\o "1-${depth}" \\h \\z \\u`, "instr");
  setValue(field, "true", "dirty");
  const fieldRun = make(documentXml, "r");
  const fieldText = make(documentXml, "t");
  fieldText.textContent = "请在 Word/WPS 中更新目录域";
  fieldRun.appendChild(fieldText);
  field.appendChild(fieldRun);
  fieldParagraph.appendChild(field);
  const anchor = paragraphs[beforeIndex] ?? direct(body, "sectPr");
  body.insertBefore(heading, anchor ?? null);
  body.insertBefore(fieldParagraph, anchor ?? null);
}

function markTocDirty(documentXml: XMLDocument) {
  for (const field of descendants(documentXml, "fldSimple")) {
    if (/\bTOC\b/i.test(value(field, "instr"))) setValue(field, "true", "dirty");
  }
  for (const field of descendants(documentXml, "instrText")) {
    if (/\bTOC\b/i.test(field.textContent ?? "")) {
      let parent = field.parentNode;
      while (parent?.nodeType === 1 && (parent as Element).localName !== "p") parent = parent.parentNode;
      if (parent?.nodeType !== 1) continue;
      const start = descendants(parent as Element, "fldChar").find((node) => value(node, "fldCharType") === "begin");
      if (start) setValue(start, "true", "dirty");
    }
  }
}

function guideText(fileName: string, inspection: BidInspection, options: BidOptions, report: string[]): string {
  return [
    "顷刻投标排版工具｜使用与人工检查说明",
    `原文件：${fileName}`,
    "",
    "本文件仅辅助排版。原始标题和正文文字不应被改写；请以招标文件实际要求和原件为准。",
    "",
    "一、打开后先更新目录和页码",
    "在 Word/WPS 中打开排版后的 DOCX，选中目录并更新整个目录；必要时全选文档后更新域。核对目录标题、页码与正文。浏览器无法计算最终 Word/WPS 页码。",
    inspection.hasToc
      ? "原有目录保持原设置；如需只展示 3 或 4 级，请在 Word/WPS 的目录选项中调整。"
      : `本次新建目录最多显示 ${options.tocDepth} 级。`,
    "超过 9 级的标题不能保证进入 Word/WPS 自动大纲；深层可见编号会保留并提示人工核对。",
    "",
    "二、逐项人工检查",
    `1. 对照原件检查标题文字、正文、编号与技术范围（原第 ${options.boundaryIndex + 1} 段至第 ${options.technicalEndIndex} 段）。`,
    "2. 检查招标方固定封面、表单、承诺函、落款、签章、图片和文字框。",
    "3. 检查表格宽度、跨页、合并单元格、横向页、页眉页脚和页码起算。",
    "4. 对照招标文件要求复核字体字号、页边距、目录深度及专用格式。",
    "5. 如发现内容缺失或版式异常，使用原文件回退，勿直接提交生成稿。",
    "",
    `检测到表格 ${inspection.tableCount} 个、图形 ${inspection.graphicCount} 个；这些对象在本版中保持原样，仍需逐一核对。`,
    "",
    "三、本次处理记录",
    ...report.map((line) => `- ${line}`),
  ].join("\r\n");
}

export async function formatBidDocx(file: File, inspection: BidInspection, options: BidOptions): Promise<BidResult> {
  const { zip, documentXml } = await openDocx(file);
  const paragraphs = getParagraphs(documentXml);
  const originalTextNodes = descendants(documentXml, "t").map((node) => node.textContent ?? "");
  if (paragraphs.length !== inspection.paragraphs.length || paragraphs.some((p, i) => textOf(p) !== inspection.paragraphs[i].text)) {
    throw new Error("文件内容与预览时不一致，请重新上传并检查。 ");
  }
  if (options.boundaryIndex < 0 || options.boundaryIndex >= paragraphs.length) throw new Error("请先选择准确的商务/技术分界。 ");
  if (options.technicalEndIndex <= options.boundaryIndex || options.technicalEndIndex > paragraphs.length) {
    throw new Error("请确认技术部分的结束位置。 ");
  }
  const stylesFile = zip.file("word/styles.xml");
  const styles = stylesFile ? parseXml(await stylesFile.async("string"), "样式配置") : null;
  const specs = options.mode === "business" ? businessSpecs(paragraphs, inspection, options, styles) : STANDARD;
  const report: string[] = [];
  const protectedSet = new Set(options.protectedIndices);
  let formattedParagraphs = 0;
  let numberedHeadings = 0;
  const numberTargets: Array<{ paragraph: Element; level: number }> = [];
  for (const item of inspection.paragraphs) {
    const paragraph = paragraphs[item.index];
    const level = options.levels[item.index] ?? item.inferredLevel;
    if (!item.text.trim()) continue;
    if (protectedSet.has(item.index) || item.protectedReason) {
      if (level > 0) report.push(`第 ${item.index + 1} 段「${item.text.slice(0, 36)}」已保护，未改格式。`);
      continue;
    }
    const isTechnical = item.index >= options.boundaryIndex && item.index < options.technicalEndIndex;
    if (options.mode === "business" && !isTechnical && !options.formatBusiness) continue;
    if (level > 9) {
      clearHeadingIndent(paragraph);
      report.push(`第 ${item.index + 1} 段超过 Word/WPS 9 级自动大纲范围，保留可见编号和原样式，仅取消标题缩进。`);
      continue;
    }
    applySpec(paragraph, level, specs[Math.min(level, 6)], options.mode === "business");
    formattedParagraphs++;
    if (level > 0 && level <= 6) {
      if (item.manualNumber) {
        report.push(`第 ${item.index + 1} 段已有手工或自动编号，已保留原编号；请核对与所选方案是否一致。`);
      } else {
        numberTargets.push({ paragraph, level });
      }
    } else if (level > 6) {
      report.push(`第 ${item.index + 1} 段为 ${level} 级标题，已设置大纲层级；内置编号仅覆盖 1–6 级，请人工检查其编号。`);
    }
  }
  if (numberTargets.length) {
    const numId = await addNumbering(zip, options.scheme, specs);
    for (const target of numberTargets) {
      applyNumber(target.paragraph, target.level, numId);
      numberedHeadings++;
    }
  }
  if (options.mode === "standard" && options.applyPageLayout) {
    if (applyPageLayout(documentXml)) report.push("已对单节纵向文档设置 A4 和内置页边距；请检查封面。 ");
    else report.push("文档含多节或横向页，未统一页面尺寸和边距；请在 Word/WPS 中逐节检查。 ");
  }
  if (inspection.hasToc) {
    markTocDirty(documentXml);
    report.push("已保留原有目录及其深度设置，并标记需更新；请在 Word/WPS 中更新整个目录。若要限定 3/4 级，需人工调整目录选项。 ");
  } else if (options.tocBeforeIndex !== null) {
    insertToc(documentXml, options.tocBeforeIndex, options.tocDepth, paragraphs);
    report.push(`已在原第 ${options.tocBeforeIndex + 1} 段前建立自动目录字段；页码须在 Word/WPS 中更新。`);
  } else {
    report.push("未插入新目录；标题 1–9 已尽可能设置大纲层级，可在 Word/WPS 中插入自动目录。 ");
  }
  if (inspection.tableCount) report.push(`${inspection.tableCount} 个表格原样保留，未自动调整行高或列宽。`);
  if (inspection.graphicCount) report.push(`${inspection.graphicCount} 个图片/图形原样保留，需检查签章位置和环绕方式。`);
  if (options.mode === "business") report.push("参照商务部分模式：缺失的深层标题样式沿用上一级，标题字号不会随层级变深而增大；缺失的首级标题使用内置值。技术范围以外的商务段按用户选项保留或整理。 ");
  report.push("可处理的标题已取消逐级缩进；需要居中的标题仍按所选样式居中，受保护段落保持原样。 ");
  const outputXml = new XMLSerializer().serializeToString(documentXml);
  const outputDoc = parseXml(outputXml, "处理后正文");
  const outputParagraphs = getParagraphs(outputDoc);
  const sourceTexts = inspection.paragraphs.map((item) => item.text);
  const resultingTexts = outputParagraphs.map(textOf);
  if (!inspection.hasToc && options.tocBeforeIndex !== null) resultingTexts.splice(options.tocBeforeIndex, 2);
  if (sourceTexts.length !== resultingTexts.length || sourceTexts.some((text, index) => text !== resultingTexts[index])) {
    throw new Error("文字完整性校验未通过，已停止导出。 ");
  }
  if (!inspection.hasToc && options.tocBeforeIndex !== null) {
    remove(outputParagraphs[options.tocBeforeIndex]);
    remove(outputParagraphs[options.tocBeforeIndex + 1]);
  }
  const finalTextNodes = descendants(outputDoc, "t").map((node) => node.textContent ?? "");
  if (originalTextNodes.length !== finalTextNodes.length || originalTextNodes.some((text, index) => text !== finalTextNodes[index])) {
    throw new Error("表格或特殊区域的文字完整性校验未通过，已停止导出。 ");
  }
  zip.file("word/document.xml", outputXml);
  const documentBytes = await zip.generateAsync({ type: "uint8array" });
  const output = new JSZip();
  const stem = file.name.replace(/\.docx$/i, "");
  output.file(`${stem}_顷刻排版.docx`, documentBytes);
  output.file("使用与人工检查说明.txt", guideText(file.name, inspection, options, report));
  const bundle = await output.generateAsync({ type: "blob", mimeType: "application/zip" });
  return { zip: bundle, report, formattedParagraphs, numberedHeadings };
}
