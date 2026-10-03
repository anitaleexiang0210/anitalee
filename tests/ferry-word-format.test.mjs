import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import JSZip from "jszip";
import ts from "typescript";
import xml from "@xmldom/xmldom";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
globalThis.DOMParser = xml.DOMParser;
globalThis.XMLSerializer = xml.XMLSerializer;

const prototype = new xml.DOMParser().parseFromString("<a><b/></a>", "text/xml").documentElement.constructor.prototype;
Object.defineProperty(prototype, "parentElement", {
  get() {
    let node = this.parentNode;
    while (node && node.nodeType !== 1) node = node.parentNode;
    return node;
  },
});

const sourceCode = readFileSync(new URL("../app/ferry/converter.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(sourceCode, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
const converterModule = { exports: {} };
new Function("require", "module", "exports", compiled)(createRequire(import.meta.url), converterModule, converterModule.exports);
const { optimizeWord } = converterModule.exports;

test("one-click formatting changes ordinary text but preserves table and list structure", async () => {
  const source = `<w:document xmlns:w="${WORD_NS}"><w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>第一章 引言</w:t></w:r></w:p>
    <w:p><w:r><w:t>这是中文正文。</w:t></w:r></w:p>
    <w:p><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>列表示例</w:t></w:r></w:p>
    <w:tbl><w:tr><w:tc><w:p><w:r><w:t>表格内容</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    <w:p><w:r><w:drawing/></w:r></w:p>
  </w:body></w:document>`;
  const zip = new JSZip();
  zip.file("word/document.xml", source);
  const file = new File([await zip.generateAsync({ type: "uint8array" })], "sample.docx");

  const result = await optimizeWord(file, { formatDocument: true });
  const output = await JSZip.loadAsync(await result.blob.arrayBuffer());
  const documentNode = new xml.DOMParser().parseFromString(await output.file("word/document.xml").async("string"), "text/xml");
  const paragraphs = Array.from(documentNode.getElementsByTagNameNS(WORD_NS, "p"));
  const property = (element, name) => element.getElementsByTagNameNS(WORD_NS, name).item(0);

  assert.equal(property(paragraphs[0], "sz")?.getAttributeNS(WORD_NS, "val"), "32");
  assert.ok(property(paragraphs[0], "b"));
  assert.equal(property(paragraphs[1], "ind")?.getAttributeNS(WORD_NS, "firstLine"), "420");
  assert.equal(property(paragraphs[1], "spacing")?.getAttributeNS(WORD_NS, "line"), "288");
  assert.equal(property(paragraphs[1], "sz")?.getAttributeNS(WORD_NS, "val"), "24");
  assert.equal(property(paragraphs[1], "rFonts")?.getAttributeNS(WORD_NS, "eastAsia"), "SimSun");
  assert.equal(property(paragraphs[2], "spacing"), null);
  assert.equal(property(paragraphs[3], "rFonts"), null);
  assert.equal(result.meta.formatReport.headingCount, 1);
  assert.equal(result.meta.formatReport.tableCount, 1);
  assert.equal(result.meta.formatReport.graphicCount, 1);
});

test("formatted covers, form paragraphs and page breaks stay intact while plain headings are recognized", async () => {
  const styles = `<w:styles xmlns:w="${WORD_NS}">
    <w:style w:type="paragraph" w:default="1" w:styleId="1"><w:name w:val="Normal"/></w:style>
    <w:style w:type="paragraph" w:styleId="7"><w:name w:val="Body Text"/></w:style>
  </w:styles>`;
  const source = `<w:document xmlns:w="${WORD_NS}"><w:body>
    <w:p><w:pPr><w:pStyle w:val="1"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="44"/></w:rPr><w:t>投标响应文件</w:t></w:r></w:p>
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="7"/><w:spacing w:line="360"/></w:pPr><w:r><w:t>供应商：示例公司</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="1"/><w:ind w:hanging="420"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>总体技术方案</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="1"/><w:ind w:firstLine="480"/><w:spacing w:line="360"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:eastAsia="宋体"/><w:sz w:val="24"/></w:rPr><w:t>已有格式的正文段落。</w:t></w:r></w:p>
    <w:p><w:r><w:t>缺少格式的中文正文。</w:t></w:r></w:p>
    <w:tbl><w:tr><w:tc><w:p><w:r><w:t>原样保留表格</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
  </w:body></w:document>`;
  const zip = new JSZip();
  zip.file("word/document.xml", source);
  zip.file("word/styles.xml", styles);
  const file = new File([await zip.generateAsync({ type: "uint8array" })], "bid-sample.docx");
  const result = await optimizeWord(file, { formatDocument: true });
  const output = await JSZip.loadAsync(await result.blob.arrayBuffer());
  const documentNode = new xml.DOMParser().parseFromString(await output.file("word/document.xml").async("string"), "text/xml");
  const paragraphs = Array.from(documentNode.getElementsByTagNameNS(WORD_NS, "p"));
  const property = (element, name) => element.getElementsByTagNameNS(WORD_NS, name).item(0);

  assert.equal(paragraphs.length, 7);
  assert.equal(property(paragraphs[0], "sz")?.getAttributeNS(WORD_NS, "val"), "44");
  assert.equal(property(paragraphs[0], "ind"), null);
  assert.equal(property(paragraphs[1], "br")?.getAttributeNS(WORD_NS, "type"), "page");
  assert.equal(property(paragraphs[2], "spacing")?.getAttributeNS(WORD_NS, "line"), "360");
  assert.equal(property(paragraphs[2], "spacing")?.hasAttributeNS(WORD_NS, "before"), false);
  assert.equal(property(paragraphs[2], "ind"), null);
  assert.equal(property(paragraphs[3], "ind")?.getAttributeNS(WORD_NS, "hanging"), "420");
  assert.equal(property(paragraphs[3], "keepNext") !== null, true);
  assert.equal(property(paragraphs[3], "sz")?.getAttributeNS(WORD_NS, "val"), "28");
  assert.equal(property(paragraphs[4], "ind")?.getAttributeNS(WORD_NS, "firstLine"), "480");
  assert.equal(property(paragraphs[4], "spacing")?.getAttributeNS(WORD_NS, "line"), "360");
  assert.equal(property(paragraphs[4], "spacing")?.hasAttributeNS(WORD_NS, "after"), false);
  assert.equal(property(paragraphs[4], "rFonts")?.getAttributeNS(WORD_NS, "eastAsia"), "宋体");
  assert.equal(property(paragraphs[5], "ind")?.getAttributeNS(WORD_NS, "firstLine"), "420");
  assert.equal(result.meta.formatReport.headingCount, 1);
});

test("image captions with underscored resource names are not mistaken for formulas", async () => {
  const source = `<w:document xmlns:w="${WORD_NS}"><w:body>
    <w:p><w:r><w:t>图：aliyun_gp9a_full（来源官网）</w:t></w:r></w:p>
    <w:p><w:r><w:t>Q_e = 5</w:t></w:r></w:p>
  </w:body></w:document>`;
  const zip = new JSZip();
  zip.file("word/document.xml", source);
  const file = new File([await zip.generateAsync({ type: "uint8array" })], "caption.docx");
  const result = await optimizeWord(file);
  const output = await JSZip.loadAsync(await result.blob.arrayBuffer());
  const documentNode = new xml.DOMParser().parseFromString(await output.file("word/document.xml").async("string"), "text/xml");
  const paragraphs = Array.from(documentNode.getElementsByTagNameNS(WORD_NS, "p"));

  assert.equal(paragraphs[0].textContent, "图：aliyun_gp9a_full（来源官网）");
  assert.ok(paragraphs[1].getElementsByTagNameNS("http://schemas.openxmlformats.org/officeDocument/2006/math", "oMath").length > 0);
});

test("short form fields keep their existing formatting", async () => {
  const source = `<w:document xmlns:w="${WORD_NS}"><w:body>
    <w:p><w:pPr><w:spacing w:line="336" w:after="120"/></w:pPr><w:r><w:t>电话：12345678</w:t></w:r></w:p>
    <w:p><w:pPr><w:ind w:firstLine="480"/><w:spacing w:line="360"/></w:pPr><w:r><w:t>这是一段已经排过版的正式承诺文字，原有的缩进、行距和字号都应当保持不变。</w:t></w:r></w:p>
  </w:body></w:document>`;
  const zip = new JSZip();
  zip.file("word/document.xml", source);
  const file = new File([await zip.generateAsync({ type: "uint8array" })], "form.docx");
  const result = await optimizeWord(file, { formatDocument: true });
  const output = await JSZip.loadAsync(await result.blob.arrayBuffer());
  const documentNode = new xml.DOMParser().parseFromString(await output.file("word/document.xml").async("string"), "text/xml");
  const paragraphs = Array.from(documentNode.getElementsByTagNameNS(WORD_NS, "p"));

  assert.equal(paragraphs[0].getElementsByTagNameNS(WORD_NS, "sz").length, 0);
  assert.equal(paragraphs[0].getElementsByTagNameNS(WORD_NS, "ind").length, 0);
  assert.equal(paragraphs[1].getElementsByTagNameNS(WORD_NS, "sz").length, 0);
  assert.equal(paragraphs[1].getElementsByTagNameNS(WORD_NS, "spacing").item(0)?.getAttributeNS(WORD_NS, "line"), "360");
});

if (process.env.FERRY_REAL_SAMPLE) {
  test("a real Word sample keeps its tables and drawings", async () => {
    const source = readFileSync(process.env.FERRY_REAL_SAMPLE);
    const file = new File([source], "real-sample.docx");
    const inputZip = await JSZip.loadAsync(source);
    const originalXml = await inputZip.file("word/document.xml").async("string");
    const result = await optimizeWord(file, { formatDocument: true });
    if (process.env.FERRY_TEST_OUTPUT) {
      writeFileSync(process.env.FERRY_TEST_OUTPUT, new Uint8Array(await result.blob.arrayBuffer()));
    }
    const outputZip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const outputXml = await outputZip.file("word/document.xml").async("string");
    const count = (value, tag) => (value.match(new RegExp(`<w:${tag}(?:\\s|>)`, "g")) ?? []).length;
    assert.equal(count(outputXml, "tbl"), count(originalXml, "tbl"));
    assert.equal(count(outputXml, "drawing"), count(originalXml, "drawing"));
    assert.equal(outputXml.includes("<parsererror"), false);
    assert.ok(result.meta.formatReport.chineseParagraphCount >= 0);
  });
}
