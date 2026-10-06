import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import JSZip from "jszip";
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from "docx";
import mammoth from "mammoth";
import ts from "typescript";
import xml from "@xmldom/xmldom";

globalThis.DOMParser = xml.DOMParser;
globalThis.XMLSerializer = xml.XMLSerializer;
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const source = readFileSync(new URL("../app/qingke/engine.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
const module = { exports: {} };
new Function("require", "module", "exports", compiled)(createRequire(import.meta.url), module, module.exports);
const { inspectBidDocx, inspectBusinessFormats, formatBidDocx } = module.exports;

function paragraphs(documentXml) {
  const document = new xml.DOMParser().parseFromString(documentXml, "text/xml");
  const body = document.getElementsByTagNameNS(W, "body").item(0);
  return Array.from(body.childNodes).filter((node) => node.nodeType === 1 && node.localName === "p");
}

async function sampleDocx() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/document.xml", `<w:document xmlns:w="${W}"><w:body>
    <w:p><w:r><w:t>投标文件封面</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:rFonts w:eastAsia="仿宋"/><w:sz w:val="36"/></w:rPr><w:t>一、商务响应</w:t></w:r></w:p>
    <w:p><w:r><w:t>这里是商务部分的正文，已经按招标方要求完成，需要保留文字和原有的排版样式。</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/><w:rPr><w:sz w:val="28"/></w:rPr></w:pPr><w:r><w:t>技术方案</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading2"/><w:ind w:left="720" w:hanging="360"/></w:pPr><w:r><w:t>实施计划</w:t></w:r></w:p>
    <w:p><w:r><w:t>技术正文段落。无论采用哪种格式，都不能自动改写这些文字。</w:t></w:r></w:p>
    <w:p><w:pPr><w:ind w:left="2600" w:firstLine="0"/></w:pPr><w:r><w:t>1.1.1.1.1.1.1.1.1.1.1 超深标题</w:t></w:r></w:p>
    <w:tbl><w:tr><w:tc><w:p><w:r><w:t>固定表格</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    <w:p><w:r><w:t>九、其他资料</w:t></w:r></w:p>
    <w:p><w:r><w:t>商务部分后续正文</w:t></w:r></w:p>
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>
  </w:body></w:document>`);
  return new File([await zip.generateAsync({ type: "uint8array" })], "已合并样本.docx");
}

test("business mode preserves commercial paragraphs and all original text while writing a guide", async () => {
  const file = await sampleDocx();
  const beforeZip = await JSZip.loadAsync(await file.arrayBuffer());
  const originalXml = await beforeZip.file("word/document.xml").async("string");
  const inspection = await inspectBidDocx(file);
  assert.equal(inspection.paragraphs.length, 9);
  assert.equal(inspection.tableCount, 1);
  assert.equal(inspection.paragraphs[6].inferredLevel, 11);
  assert.match(inspection.paragraphs[0].protectedReason, /封面/);
  const result = await formatBidDocx(file, inspection, {
    boundaryIndex: 3,
    technicalEndIndex: 7,
    mode: "business",
    formatBusiness: false,
    scheme: 2,
    tocDepth: 3,
    tocBeforeIndex: 1,
    applyPageLayout: false,
    levels: {},
    protectedIndices: [],
  });
  const bundle = await JSZip.loadAsync(await result.zip.arrayBuffer());
  const guide = await bundle.file("使用与人工检查说明.txt").async("string");
  assert.match(guide, /Word\/WPS 中打开排版后的 DOCX/);
  const docx = await JSZip.loadAsync(await bundle.file("已合并样本_顷刻排版.docx").async("uint8array"));
  const outputXml = await docx.file("word/document.xml").async("string");
  const before = paragraphs(originalXml);
  const after = paragraphs(outputXml);
  const texts = (items) => items.map((node) => Array.from(node.getElementsByTagNameNS(W, "t")).map((t) => t.textContent).join(""));
  assert.deepEqual(texts(after).filter((_, index) => index !== 1 && index !== 2), texts(before));
  assert.equal(new xml.XMLSerializer().serializeToString(before[0]), new xml.XMLSerializer().serializeToString(after[0]));
  assert.equal(new xml.XMLSerializer().serializeToString(before[1]), new xml.XMLSerializer().serializeToString(after[3]));
  assert.equal(new xml.XMLSerializer().serializeToString(before[7]), new xml.XMLSerializer().serializeToString(after[9]));
  assert.equal(new xml.XMLSerializer().serializeToString(before[8]), new xml.XMLSerializer().serializeToString(after[10]));
  assert.match(outputXml, /TOC \\o &quot;1-3&quot;/);
  const headingMark = Array.from(after[5].getElementsByTagNameNS(W, "pPr"))[0]
    .getElementsByTagNameNS(W, "rPr").item(0).getElementsByTagNameNS(W, "sz").item(0);
  assert.equal(headingMark.getAttributeNS(W, "val"), "36");
  assert.ok(docx.file("word/numbering.xml"));
  assert.ok(docx.file("word/_rels/document.xml.rels"));
  assert.match(result.report.join(" "), /超过 Word\/WPS 9 级/);
  for (const index of [5, 6, 8]) {
    const indent = after[index].getElementsByTagNameNS(W, "ind").item(0);
    assert.equal(indent.getAttributeNS(W, "left"), "0");
    assert.equal(indent.getAttributeNS(W, "firstLine"), "0");
    assert.equal(indent.hasAttributeNS(W, "hanging"), false);
  }
  const numbering = new xml.DOMParser().parseFromString(await docx.file("word/numbering.xml").async("string"), "text/xml");
  for (const level of Array.from(numbering.getElementsByTagNameNS(W, "lvl"))) {
    const indent = level.getElementsByTagNameNS(W, "ind").item(0);
    assert.equal(indent.getAttributeNS(W, "left"), "0");
    assert.equal(indent.getAttributeNS(W, "firstLine"), "0");
    assert.equal(level.getElementsByTagNameNS(W, "suff").item(0).getAttributeNS(W, "val"), "space");
  }
});

test("standard mode keeps a real DOCX readable after adding heading numbering", async () => {
  const document = new Document({ sections: [{ children: [
    new Paragraph({ text: "商务部分", heading: HeadingLevel.HEADING_1 }),
    new Paragraph("这是已完成的商务正文，不应改写。"),
    new Paragraph({ text: "技术方案", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: "实施步骤", heading: HeadingLevel.HEADING_2 }),
    new Paragraph("这是需要统一样式的技术正文，不应改写。"),
    new Table({ rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph("固定表单内容") ] })] })] }),
  ] }] });
  const file = new File([await Packer.toBuffer(document)], "真实结构样本.docx");
  const inspection = await inspectBidDocx(file);
  const result = await formatBidDocx(file, inspection, {
    boundaryIndex: 2, technicalEndIndex: 5, mode: "standard", formatBusiness: true, scheme: 3, tocDepth: 4,
    tocBeforeIndex: null, applyPageLayout: true, levels: { 3: 0 }, protectedIndices: [],
  });
  const bundle = await JSZip.loadAsync(await result.zip.arrayBuffer());
  const bytes = await bundle.file("真实结构样本_顷刻排版.docx").async("uint8array");
  const rawText = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
  assert.match(rawText, /商务部分/);
  assert.match(rawText, /固定表单内容/);
  assert.match(rawText, /这是需要统一样式的技术正文，不应改写。/);
  const output = await JSZip.loadAsync(bytes);
  assert.ok(output.file("word/numbering.xml"));
  assert.equal(result.numberedHeadings >= 2, true);
  const outputParagraphs = paragraphs(await output.file("word/document.xml").async("string"));
  assert.equal(outputParagraphs[3].getElementsByTagNameNS(W, "outlineLvl").length, 0);
});

test("ordinary numbered clauses stay editable while suggested formatting can be corrected and embedded objects stay intact", async () => {
  const sourceFile = await sampleDocx();
  const zip = await JSZip.loadAsync(await sourceFile.arrayBuffer());
  const sourceXml = await zip.file("word/document.xml").async("string");
  zip.file("word/document.xml", sourceXml.replace("<w:sectPr", `
    <w:p><w:r><w:t>5.如我方成交，我方承诺：</w:t></w:r></w:p>
    <w:p><w:r><w:t>项目名称：________</w:t></w:r></w:p>
    <w:p><w:r><w:drawing/></w:r><w:r><w:t>签章位置</w:t></w:r></w:p>
    <w:sectPr`));
  const file = new File([await zip.generateAsync({ type: "uint8array" })], "保护纠错样本.docx");
  const inspection = await inspectBidDocx(file);
  assert.equal(inspection.paragraphs[9].protectedReason, null);
  assert.equal(inspection.paragraphs[10].protectionKind, "suggested");
  assert.equal(inspection.paragraphs[11].protectionKind, "fixed-object");

  const options = {
    boundaryIndex: 3, technicalEndIndex: 12, mode: "standard", formatBusiness: true,
    scheme: 1, tocDepth: 3, tocBeforeIndex: null, applyPageLayout: false,
    levels: { 9: 0, 10: 0, 11: 0 }, protectedIndices: [], unprotectedIndices: [],
  };
  const getOutput = async (result) => {
    const bundle = await JSZip.loadAsync(await result.zip.arrayBuffer());
    const docx = await JSZip.loadAsync(await bundle.file("保护纠错样本_顷刻排版.docx").async("uint8array"));
    return paragraphs(await docx.file("word/document.xml").async("string"));
  };
  const original = paragraphs(await zip.file("word/document.xml").async("string"));
  const defaultOutput = await getOutput(await formatBidDocx(file, inspection, options));
  assert.notEqual(new xml.XMLSerializer().serializeToString(defaultOutput[9]), new xml.XMLSerializer().serializeToString(original[9]));
  assert.equal(defaultOutput[9].getElementsByTagNameNS(W, "outlineLvl").length, 0);
  assert.equal(new xml.XMLSerializer().serializeToString(defaultOutput[10]), new xml.XMLSerializer().serializeToString(original[10]));
  const correctedOutput = await getOutput(await formatBidDocx(file, inspection, { ...options, unprotectedIndices: [10, 11] }));
  assert.notEqual(new xml.XMLSerializer().serializeToString(correctedOutput[10]), new xml.XMLSerializer().serializeToString(original[10]));
  assert.equal(new xml.XMLSerializer().serializeToString(correctedOutput[11]), new xml.XMLSerializer().serializeToString(original[11]));
  assert.equal(correctedOutput[9].getElementsByTagNameNS(W, "t").item(0).textContent, "5.如我方成交，我方承诺：");
});

test("business mode uses the recurring body size instead of a front-page size", async () => {
  const document = new Document({ sections: [{ children: [
    new Paragraph({ children: [new TextRun({ text: "这是一段用于首页说明的较长文字，不能代表商务正文的实际字号。", size: 30 })] }),
    new Paragraph({ children: [new TextRun({ text: "这是第一段商务正文，内容足够长，使用商务部分常见的正文字号。", size: 24 })] }),
    new Paragraph({ children: [new TextRun({ text: "这是第二段商务正文，内容同样足够长，并保持相同的正文字号。", size: 24 })] }),
    new Paragraph({ children: [new TextRun({ text: "这是一段需要根据商务正文样式整理的技术部分文字。", size: 20 })] }),
  ] }] });
  const file = new File([await Packer.toBuffer(document)], "商务样式样本.docx");
  const inspection = await inspectBidDocx(file);
  const formats = await inspectBusinessFormats(file, inspection, 3);
  assert.equal(formats[0].size, 12);
  const result = await formatBidDocx(file, inspection, {
    boundaryIndex: 3, technicalEndIndex: 4, mode: "business", formatBusiness: false, scheme: 1, tocDepth: 3,
    tocBeforeIndex: null, applyPageLayout: false, levels: {}, protectedIndices: [],
  });
  const bundle = await JSZip.loadAsync(await result.zip.arrayBuffer());
  const docx = await JSZip.loadAsync(await bundle.file("商务样式样本_顷刻排版.docx").async("uint8array"));
  const outputParagraphs = paragraphs(await docx.file("word/document.xml").async("string"));
  const size = outputParagraphs[3].getElementsByTagNameNS(W, "sz").item(0);
  assert.equal(size.getAttributeNS(W, "val"), "24");
});

test("missing business heading levels inherit the preceding size and numbering matches text", async () => {
  const heading = (text, level, size) => new Paragraph({ heading: level,
    children: [new TextRun({ text, size, bold: true })] });
  const document = new Document({ sections: [{ children: [
    heading("商务一级", HeadingLevel.HEADING_1, 32),
    heading("商务二级", HeadingLevel.HEADING_2, 24),
    heading("商务三级", HeadingLevel.HEADING_3, 24),
    heading("商务五级", HeadingLevel.HEADING_5, 24),
    heading("技术二级", HeadingLevel.HEADING_2, 20),
    heading("技术三级", HeadingLevel.HEADING_3, 20),
    heading("技术四级", HeadingLevel.HEADING_4, 20),
    heading("技术五级", HeadingLevel.HEADING_5, 20),
    heading("技术六级", HeadingLevel.HEADING_6, 20),
  ] }] });
  const file = new File([await Packer.toBuffer(document)], "缺级样本.docx");
  const inspection = await inspectBidDocx(file);
  const formats = await inspectBusinessFormats(file, inspection, 4);
  assert.deepEqual(formats.slice(1).map((item) => item.size), [16, 12, 12, 12, 12, 12]);
  assert.equal(formats[4].source, "inherited");
  assert.equal(formats[6].source, "inherited");
  const result = await formatBidDocx(file, inspection, {
    boundaryIndex: 4, technicalEndIndex: 9, mode: "business", formatBusiness: false,
    scheme: 1, tocDepth: 3, tocBeforeIndex: null, applyPageLayout: false,
    levels: {}, protectedIndices: [],
  });
  assert.equal(result.numberedHeadings, 5);
  const bundle = await JSZip.loadAsync(await result.zip.arrayBuffer());
  const docx = await JSZip.loadAsync(await bundle.file("缺级样本_顷刻排版.docx").async("uint8array"));
  const outputParagraphs = paragraphs(await docx.file("word/document.xml").async("string"));
  for (const paragraph of outputParagraphs.slice(4, 9)) {
    assert.equal(paragraph.getElementsByTagNameNS(W, "sz").item(0).getAttributeNS(W, "val"), "24");
  }
  const numbering = new xml.DOMParser().parseFromString(await docx.file("word/numbering.xml").async("string"), "text/xml");
  const addedLevels = Array.from(numbering.getElementsByTagNameNS(W, "lvl")).filter((level) =>
    level.getElementsByTagNameNS(W, "suff").item(0)?.getAttributeNS(W, "val") === "space");
  assert.deepEqual(addedLevels.map((level) => level.getElementsByTagNameNS(W, "sz").item(0).getAttributeNS(W, "val")),
    ["32", "24", "24", "24", "24", "24"]);
});
