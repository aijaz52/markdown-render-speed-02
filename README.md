# markdown-render-speed-02

A dependency-free Markdown renderer for the [make.fun bounty](https://make.fun/bounty/markdown-render-speed-02), targeting byte-identical HTML to marked 18.1.3 with its default options (GFM enabled, breaks and pedantic disabled). The implementation passes all 720 practice cases: 680 specification examples and 40 generated documents. That check covers the practice corpus; it does not establish equivalence for every possible Markdown string.

[![markdown-render-speed-02](https://make.fun/badge/markdown-render-speed-02.svg)](https://make.fun/bounty/markdown-render-speed-02)
[![rank](https://make.fun/badge/markdown-render-speed-02/aijaz52/markdown-render-speed-02/rank.svg)](https://make.fun/bounty/markdown-render-speed-02)
[![reward](https://make.fun/badge/markdown-render-speed-02/aijaz52/markdown-render-speed-02/reward.svg)](https://make.fun/bounty/markdown-render-speed-02)

## Usage

```js
import { parse } from './parse.js';

const html = parse('# Hello, world!');
console.log(html);
```

Run the batch entry with Node.js 22.18 or newer:

```sh
node main.ts
```

The driver reads an array of objects containing `markdown` from `/input/cases.json` and writes an array of HTML strings to `/output/html.json`. The output directory must exist. Set `MAKEFUN_INPUT_DIR` and `MAKEFUN_OUTPUT_DIR` to override these directories:

```sh
mkdir -p /tmp/mo2
MAKEFUN_INPUT_DIR=dev/data MAKEFUN_OUTPUT_DIR=/tmp/mo2 node main.ts
```

## Design

`parse.js` exports a synchronous `parse(markdown)` function. It normalizes CRLF and bare CR to LF, creates a fresh lexer for the document, builds block tokens, and renders those tokens to HTML. The block lexer handles headings, code blocks, quotes, lists, raw HTML, reference definitions, paragraphs, and GFM tables and tasks.

Inline parsing is queued until block parsing finishes so that links can resolve definitions appearing later in the document. The inline tokenizer handles escapes, HTML, links and images, emphasis, code spans, line breaks, strikethrough, and autolinks. Emphasis matching uses delimiter flanking rules and a lazily prepared masked source to account for code, escapes, HTML, and links. Rendering walks the token tree, applies context-specific escaping and URL encoding, and preserves the target's HTML formatting.

Hot paths use character checks to skip irrelevant block and inline rules, boundary scans to consume plain text in chunks, precompiled list patterns, and early rejection before the full setext-heading grammar. Emphasis flanking checks share a helper and classify each neighboring character once. HTML is accumulated with string concatenation. Reference definitions, tokens, and parsing state belong to a single call; no parsed content is cached across documents.

`main.ts` uses only Node's built-in filesystem module and `parse.js`. The vendored marked source is retained as a local reference, with its license and notice; the entrypoint and parser do not import it. Runtime performance depends on the machine and Node version, so the practice comparison should be rerun after parser changes.

## MIT License

Released under the [MIT License](LICENSE). See the license file for the full terms and copyright notice.
