# markdown-render-speed-02

A dependency-free Markdown renderer written from scratch for the [make.fun bounty](https://make.fun/bounty/markdown-render-speed-02), producing byte-identical HTML to marked 18.1.3 defaults across all 720 conformance cases with far lower CPU time. A custom block lexer, inline tokenizer, and HTML renderer keep parsing fast, with fresh document state on every call.

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

## MIT License

Released under the [MIT License](LICENSE). See the license file for the full terms and copyright notice.
