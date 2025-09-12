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
const outDir = resolve(root, 'site');
const outHtmlPath = resolve(outDir, 'index.html');

mkdirSync(outDir, { recursive: true });

let html = readFileSync(exampleHtmlPath, 'utf8');

// Replace the module script block with a UMD based script for production site.
html = html.replace(
  /<script type="module">[\s\S]*?<\/script>/,
  `<script src="/${distUmd}"></script>\n<script>\n  // UMD attaches an export namespace object to window.DrawKeyboard\n  // The class is at window.DrawKeyboard.DrawKeyboard\n  (function init() {\n    const ns = window.DrawKeyboard;\n    if (!ns || !ns.DrawKeyboard) {\n      console.error('DrawKeyboard UMD namespace not found');\n      return;\n    }\n    const DrawKeyboard = ns.DrawKeyboard;\n    const keyboard = new DrawKeyboard({\n      canvas: document.getElementById('keyboardCanvas'),\n      onNoteOn: (n,v)=>console.log('NoteOn',n,v),\n      onNoteOff:(n)=>console.log('NoteOff',n)\n    });\n    window.keyboard = keyboard;\n  })();\n</script>`
);

writeFileSync(outHtmlPath, html, 'utf8');

// Copy built assets (user must have run build already). We'll just rely on wrangler to serve dist separately if needed.
// Optionally copy dist into site/dist to keep assets self-contained.
const siteDist = resolve(outDir, 'dist', 'umd');
mkdirSync(siteDist, { recursive: true });
copyFileSync(resolve(root, distUmd), resolve(siteDist, 'drawpiano.min.js'));

console.log('Site prepared at', outDir);
