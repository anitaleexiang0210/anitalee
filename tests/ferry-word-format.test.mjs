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
