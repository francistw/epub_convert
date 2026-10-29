import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import OpenCC from "opencc-wasm";

import {
    EpubConversionError,
    convertOpenCcText,
    convertTaiwanPunctuation,
    isAcceptedEpubMimetype,
    updateVerticalWriting,
} from "../static/epub-converter.js";
import { outputLanguage } from "../static/opencc-config.js";

const utf8Encoder = new TextEncoder();

test("EPUB mimetype validation tolerates whitespace and ASCII case", () => {
    assert.equal(isAcceptedEpubMimetype("application/epub+zip"), true);
    assert.equal(isAcceptedEpubMimetype("\uFEFF  Application/EPUB+ZIP\r\n"), true);
    assert.equal(isAcceptedEpubMimetype("application/zip"), false);
    assert.equal(isAcceptedEpubMimetype(""), false);
});

test("Taiwan OpenCC modes use zh-tw package language", () => {
    assert.equal(outputLanguage("s2tw"), "zh-tw");
    assert.equal(outputLanguage("s2twp"), "zh-tw");
    assert.equal(outputLanguage("s2twp_jieba"), "zh-tw");
    assert.equal(outputLanguage("t2tw"), "zh-tw");
});

test("Taiwan punctuation conversion replaces curly quotation marks", () => {
    assert.equal(
        convertTaiwanPunctuation("“外層 ‘內層’ 外層”"),
        "「外層 『內層』 外層」",
    );
});

test("vertical writing metadata is added while existing spine attributes are preserved", () => {
    const input = `<?xml version="1.0"?>
<package>
  <metadata><dc:title>書名</dc:title></metadata>
  <spine toc="ncx"><itemref idref="chapter1" /></spine>
</package>`;
    const output = updateVerticalWriting(input);

    assert.match(output, /<meta name="primary-writing-mode" content="vertical-rl" \/>/u);
    assert.match(output, /<spine\s+page-progression-direction="rtl"\s+toc="ncx">/u);
    assert.match(output, /<itemref idref="chapter1" \/>/u);
});

test("vertical writing metadata updates existing values without duplicates", () => {
    const input = `<package>
<metadata><meta name="primary-writing-mode" content="horizontal-tb" /></metadata>
<spine toc="ncx" page-progression-direction="ltr"></spine>
</package>`;
    const output = updateVerticalWriting(input);

    assert.equal((output.match(/primary-writing-mode/gu) || []).length, 1);
    assert.match(output, /content="vertical-rl"/u);
    assert.equal((output.match(/page-progression-direction/gu) || []).length, 1);
    assert.match(output, /page-progression-direction="rtl"/u);
    assert.match(output, /toc="ncx"/u);
});

test("large OpenCC input is converted in safe UTF-8 chunks", async () => {
    const input = `${"简体中文🙂，软件转换。".repeat(8_000)}结尾`;
    const chunks = [];
    const converter = async (chunk) => {
        chunks.push(chunk);
        return chunk;
    };

    const output = await convertOpenCcText(converter, input, "OEBPS/chapter.xhtml");

    assert.equal(output, input);
    assert.ok(chunks.length > 1);
    for (const chunk of chunks) {
        assert.ok(utf8Encoder.encode(chunk).byteLength <= 16 * 1024);
        assert.doesNotMatch(chunk[0] || "", /[\uDC00-\uDFFF]/u);
        assert.doesNotMatch(chunk.at(-1) || "", /[\uD800-\uDBFF]/u);
    }
});

test("OpenCC failures include the EPUB entry and chunk diagnostics", async () => {
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
        await assert.rejects(
            convertOpenCcText(
                async () => {
                    throw new WebAssembly.RuntimeError("index out of bounds");
                },
                "简体内容".repeat(10_000),
                "OEBPS/large.xhtml",
            ),
            (error) => {
                assert.ok(error instanceof EpubConversionError);
                assert.equal(error.code, "opencc-conversion");
                assert.equal(error.messageKey, "epub.error.openCC");
                assert.deepEqual(error.messageParameters, { entryName: "OEBPS/large.xhtml" });
                assert.equal(error.entryName, "OEBPS/large.xhtml");
                assert.ok(error.diagnostics.chunkCount > 1);
                assert.ok(error.diagnostics.chunkBytes <= 16 * 1024);
                return true;
            },
        );
    } finally {
        console.error = originalConsoleError;
    }
});

test("conversion workers and shared runtime do not depend on UI translations", () => {
    for (const filename of [
        "static/convert-worker.js",
        "static/conversion-runtime.js",
        "static/epub-converter.js",
        "scripts/node-convert-worker.mjs",
    ]) {
        const source = readFileSync(filename, "utf8");
        assert.doesNotMatch(source, /i18n\.js/u, filename);
        assert.doesNotMatch(source, /\bt\s*\(/u, filename);
    }
});

test("browser worker installs its message listener before loading conversion modules", () => {
    const worker = readFileSync("static/convert-worker.js", "utf8");
    const runtime = readFileSync("static/conversion-runtime.js", "utf8");
    const converter = readFileSync("static/epub-converter.js", "utf8");

    assert.doesNotMatch(worker, /^import\s/u);
    assert.match(worker, /import\("\.\/epub-converter\.js"\)/u);
    assert.match(worker, /import\("\.\/conversion-runtime\.js"\)/u);
    assert.doesNotMatch(runtime, /import\(["']opencc-wasm["']\)/u);
    assert.doesNotMatch(converter, /^const zip = .*await import/mu);
    assert.match(converter, /async function loadZip\(\)/u);
});

test("large input completes with the pinned OpenCC WASM converter", async () => {
    const converter = OpenCC.Converter({ config: "s2t" });
    const input = "简体中文软件转换。".repeat(12_000);

    const output = await convertOpenCcText(converter, input, "OEBPS/large.xhtml");

    assert.ok(output.startsWith("簡體中文軟件轉換。"));
    assert.equal(output.length, input.length);
});
