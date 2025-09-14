#!/usr/bin/env node
/**
 * Prepare static deployment assets for Cloudflare Workers.
 * Copies example/index.html and rewrites dev import to use the built UMD bundle.
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import * as cheerio from 'cheerio';
import Prism from 'prismjs';
import loadLanguages from 'prismjs/components/index.js';
loadLanguages(['markup', 'javascript']);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');
const exampleHtmlPath = resolve(root, 'example', 'index.html');
const distUmd = 'dist/umd/drawpiano.min.js';
const distEsmDir = 'dist/esm';
const outDir = resolve(root, 'site');
const outHtmlPath = resolve(outDir, 'index.html');
const outHtmlEsmPath = resolve(outDir, 'index.esm.html');

mkdirSync(outDir, { recursive: true });

let html = readFileSync(exampleHtmlPath, 'utf8');

// Preserve the dev script and only rewrite the import for UMD/ESM outputs
const scriptMatch = html.match(/<script type="module">([\s\S]*?)<\/script>/);
const devScript = scriptMatch ? scriptMatch[1] : '';

function transformToUMD(dev) {
  // Replace the dev import with a UMD global reference
  const importRe = /^\s*import\s+(?:\{\s*DrawPiano\s*\}|DrawPiano)\s+from\s+['"][^'"]+['"];?\s*$/m;
  const transformed = dev.replace(importRe, 'const DrawPiano = window.DrawPiano;');
  return `<script src="/${distUmd}"></script>\n<script>\n${transformed}\n</script>`;
}

function transformToESM(dev) {
  // Replace the dev import with an import from built ESM bundle
  const importRe = /^\s*import\s+(?:\{\s*DrawPiano\s*\}|DrawPiano)\s+from\s+['"][^'"]+['"];?\s*$/m;
  const transformed = dev.replace(importRe, `import DrawPiano from '/${distEsmDir}/index.js';`);
  return `<script type="module">\n${transformed}\n</script>`;
}

function highlightHtml(sourceHtml) {
  const $ = cheerio.load(sourceHtml);

  // Inject Prism CSS theme (Nord palette) without per-token or block backgrounds
  const prismCss = `/* PrismJS Nord Theme (no backgrounds) */\n:root {\n  --nord0: #2E3440; --nord1: #3B4252; --nord2: #434C5E; --nord3: #4C566A;\n  --nord4: #D8DEE9; --nord5: #E5E9F0; --nord6: #ECEFF4;\n  --nord7: #8FBCBB; --nord8: #88C0D0; --nord9: #81A1C1; --nord10: #5E81AC;\n  --nord11: #BF616A; --nord12: #D08770; --nord13: #EBCB8B; --nord14: #A3BE8C; --nord15: #B48EAD;\n}\ncode[class*="language-"], pre[class*="language-"] {\n  color: var(--nord4); background: transparent;\n  text-shadow: none;\n  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;\n  direction: ltr; text-align: left; white-space: pre; word-spacing: normal; word-break: normal; line-height: 1.5;\n  -moz-tab-size: 2; -o-tab-size: 2; tab-size: 2;\n  -webkit-hyphens: none; -ms-hyphens: none; hyphens: none;\n}\n.token { background: transparent !important; }\n.token.comment,.token.prolog,.token.doctype,.token.cdata{color: var(--nord3);}\n.token.punctuation{color: var(--nord5);}\n.token.property,.token.tag,.token.constant,.token.symbol,.token.deleted{color: var(--nord11);}\n.token.boolean,.token.number{color: var(--nord15);}\n.token.selector,.token.attr-name,.token.string,.token.char,.token.builtin,.token.inserted{color: var(--nord14);}\n.token.operator,.token.entity,.language-css .token.string,.style .token.string{color: var(--nord13);}\n.token.atrule,.token.attr-value,.token.keyword{color: var(--nord9);}\n.token.function{color: var(--nord8);}\n.token.class-name{color: var(--nord7);}\n.token.regex,.token.important,.token.variable{color: var(--nord12);}\n.token.bold{font-weight:bold;}\n.token.italic{font-style:italic;}\n.token.entity{cursor:help;}\n`;
  $('head').append(`<style id="prism-theme">${prismCss}</style>`);

  $('pre > code').each((_, el) => {
    const $code = $(el);
    const className = ($code.attr('class') || '').toLowerCase();
    // Only highlight code blocks that already declare a language class
    if (!className.includes('language-')) {
      return; // leave plain blocks (e.g., npm install) untouched
    }
    // Determine language from class
    let lang = 'markup';
    if (className.includes('language-js') || className.includes('language-javascript')) {
      lang = 'javascript';
    } else if (className.includes('language-html') || className.includes('language-markup')) {
      lang = 'markup';
    }

    const raw = $code.text();
    try {
      const grammar = Prism.languages[lang] || Prism.languages.markup;
      const highlighted = Prism.highlight(raw, grammar, lang);
      $code.html(highlighted);
    } catch (e) {
      // Leave as-is on error
    }
  });

  return $.html();
}

const htmlUmd = highlightHtml(
  html.replace(/<script type="module">[\s\S]*?<\/script>/, transformToUMD(devScript))
);
const htmlEsm = highlightHtml(
  html.replace(/<script type="module">[\s\S]*?<\/script>/, transformToESM(devScript))
);

writeFileSync(outHtmlPath, htmlUmd, 'utf8');
writeFileSync(outHtmlEsmPath, htmlEsm, 'utf8');

// Copy built assets (user must have run build already). We'll just rely on wrangler to serve dist separately if needed.
// Optionally copy dist into site/dist to keep assets self-contained.
const siteDistUmd = resolve(outDir, 'dist', 'umd');
mkdirSync(siteDistUmd, { recursive: true });
copyFileSync(resolve(root, distUmd), resolve(siteDistUmd, 'drawpiano.min.js'));

// Copy ESM output
const siteDistEsm = resolve(outDir, 'dist', 'esm');
mkdirSync(siteDistEsm, { recursive: true });
copyFileSync(resolve(root, distEsmDir, 'index.js'), resolve(siteDistEsm, 'index.js'));
// Sourcemap is optional; copy if present
try {
  copyFileSync(resolve(root, distEsmDir, 'index.js.map'), resolve(siteDistEsm, 'index.js.map'));
} catch (e) {
  // Optional sourcemap may not exist; ignore
}

console.log('Site prepared at', outDir, '(UMD + ESM)');
