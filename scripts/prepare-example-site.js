#!/usr/bin/env node
/**
 * Prepare static deployment assets for Cloudflare Workers.
 * Copies example/index.html and rewrites dev import to use the built UMD bundle.
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

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
  const importRe = /^\s*import\s+(?:\{\s*DrawKeyboard\s*\}|DrawKeyboard)\s+from\s+['"][^'"]+['"];?\s*$/m;
  const transformed = dev.replace(importRe, 'const DrawKeyboard = window.DrawKeyboard;');
  return `<script src="/${distUmd}"></script>\n<script>\n${transformed}\n</script>`;
}

function transformToESM(dev) {
  // Replace the dev import with an import from built ESM bundle
  const importRe = /^\s*import\s+(?:\{\s*DrawKeyboard\s*\}|DrawKeyboard)\s+from\s+['"][^'"]+['"];?\s*$/m;
  const transformed = dev.replace(importRe, `import DrawKeyboard from '/${distEsmDir}/index.js';`);
  return `<script type="module">\n${transformed}\n</script>`;
}

const htmlUmd = html.replace(/<script type="module">[\s\S]*?<\/script>/, transformToUMD(devScript));
const htmlEsm = html.replace(/<script type="module">[\s\S]*?<\/script>/, transformToESM(devScript));

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
