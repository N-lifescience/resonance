#!/usr/bin/env node
/**
 * Node 22+, no npm dependencies. Markdown is always the source of truth.
 *
 * Automatic figure placement (edit these hooks if a revised heading changes):
 * | Markdown file | H2 contains | Position | Figure |
 * | 기획의도.md   | 핵심 기능   | After heading, before text | 2 × 2 feature cards |
 * | 사용방법.md   | 만들기      | End of section, after its three H3 steps | Before / after |
 *
 * node tools/print.mjs [--out <PDF directory>] [--html-only]
 * HTML is always written beside its Markdown; --out only changes PDF output.
 * Chrome 131+ supports the CSS page-margin boxes used for numbered footers.
 */
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PRINT_DIR = path.join(ROOT, 'docs/print');
const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FONT_URL = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css';
const DOCUMENTS = [
  { name: '기획의도', hook: '핵심 기능', position: 'after-heading', figure: 'features' },
  { name: '사용방법', hook: '만들기', position: 'section-end', figure: 'comparison' },
];
const FEATURES = [
  ['create', 'HTML 자동 생성 및 편집'],
  ['explore', '익스플로라그램 탑재'],
  ['live', '실시간 수업'],
  ['board', '전자칠판 기능 탑재'],
];
const ASSETS = [
  ...FEATURES.map(([slug]) => `site/assets/video/feature-${slug}-poster.webp`),
  'site/assets/img/sci-before.png',
  'site/assets/img/sci-after.png',
];

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

// Only the requested inline syntax is enabled; raw HTML is rendered as text.
export function renderInline(source) {
  let html = '';
  for (let i = 0; i < source.length;) {
    if (source[i] === '\\' && /[\\`*|]/.test(source[i + 1] ?? '')) {
      html += escapeHtml(source[i + 1]);
      i += 2;
    } else if (source[i] === '`') {
      const marker = source.slice(i).match(/^`+/)[0];
      const end = source.indexOf(marker, i + marker.length);
      if (end < 0) { html += marker; i += marker.length; continue; }
      html += `<code>${escapeHtml(source.slice(i + marker.length, end))}</code>`;
      i = end + marker.length;
    } else if (source.startsWith('**', i)) {
      const end = source.indexOf('**', i + 2);
      if (end < 0) { html += '**'; i += 2; continue; }
      html += `<strong>${renderInline(source.slice(i + 2, end))}</strong>`;
      i = end + 2;
    } else {
      html += escapeHtml(source[i++]);
    }
  }
  return html;
}

function tableCells(line) {
  const cells = [];
  let cell = '', codeMarker = '';
  const text = line.trim();
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && text[i + 1] === '|') { cell += '|'; i++; continue; }
    if (text[i] === '`') {
      const marker = text.slice(i).match(/^`+/)[0];
      codeMarker = codeMarker === marker ? '' : codeMarker || marker;
      cell += marker;
      i += marker.length - 1;
    } else if (text[i] === '|' && !codeMarker) {
      cells.push(cell.trim()); cell = '';
    } else cell += text[i];
  }
  cells.push(cell.trim());
  if (text.startsWith('|')) cells.shift();
  if (text.endsWith('|') && cells.at(-1) === '') cells.pop();
  return cells;
}

const listMatch = (line) => line.match(/^( *)([-+*]|\d+[.)])\s+(.+)$/);
const isTable = (lines, index) => Boolean(lines[index]?.includes('|') &&
  lines[index + 1]?.includes('|') && tableCells(lines[index + 1]).every((cell) => /^:?-{3,}:?$/.test(cell)));

export function parseMarkdown(markdown) {
  const lines = markdown.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].replace(/\s+#+\s*$/, '') });
      i++; continue;
    }
    if (/^\s*>/.test(line)) {
      const quote = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*> ?/, ''));
      blocks.push({ type: 'quote', blocks: parseMarkdown(quote.join('\n')) });
      continue;
    }
    if (isTable(lines, i)) {
      const head = tableCells(lines[i]);
      const alignment = tableCells(lines[i + 1]).map((cell) => cell.endsWith(':') ? (cell.startsWith(':') ? 'center' : 'right') : 'left');
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) rows.push(tableCells(lines[i++]));
      blocks.push({ type: 'table', head, alignment, rows });
      continue;
    }
    const firstItem = listMatch(line);
    if (firstItem) {
      const indent = firstItem[1].length, ordered = /^\d/.test(firstItem[2]), items = [];
      while (i < lines.length) {
        const item = listMatch(lines[i]);
        if (!item || item[1].length !== indent || /^\d/.test(item[2]) !== ordered) break;
        const contentIndent = lines[i].length - item[3].length;
        const body = [item[3]];
        i++;
        while (i < lines.length) {
          if (!lines[i].trim()) {
            if (listMatch(lines[i + 1] ?? '') || /^ +\S/.test(lines[i + 1] ?? '')) { i++; continue; }
            break;
          }
          const nextIndent = lines[i].match(/^ */)[0].length;
          if (nextIndent <= indent) break;
          body.push(lines[i++].slice(Math.min(contentIndent, nextIndent)));
        }
        items.push(parseMarkdown(body.join('\n')));
      }
      blocks.push({ type: 'list', ordered, start: ordered ? parseInt(firstItem[2], 10) : 1, items });
      continue;
    }
    const paragraph = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,3})\s|^\s*>/.test(lines[i]) && !listMatch(lines[i]) && !isTable(lines, i)) paragraph.push(lines[i++].trim());
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
  }
  return blocks;
}

function renderBlock(block) {
  switch (block.type) {
    case 'heading': return `<h${block.level}>${renderInline(block.text)}</h${block.level}>`;
    case 'paragraph': return `<p>${renderInline(block.text)}</p>`;
    case 'quote': return `<blockquote>${block.blocks.map(renderBlock).join('\n')}</blockquote>`;
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul';
      return `<${tag}${block.ordered && block.start !== 1 ? ` start="${block.start}"` : ''}>${block.items.map((item) => `<li>${item.map(renderBlock).join('\n')}</li>`).join('\n')}</${tag}>`;
    }
    case 'table': {
      const row = (cells, tag) => `<tr>${block.head.map((_, i) => `<${tag} class="align-${block.alignment[i] ?? 'left'}"${tag === 'th' ? ' scope="col"' : ''}>${renderInline(cells[i] ?? '')}</${tag}>`).join('')}</tr>`;
      return `<div class="table-wrap"><table><thead>${row(block.head, 'th')}</thead><tbody>${block.rows.map((cells) => row(cells, 'td')).join('\n')}</tbody></table></div>`;
    }
    default: throw new Error(`Unknown Markdown block: ${block.type}`);
  }
}

function renderFigure(kind) {
  if (kind === 'features') return `<div class="feature-grid" role="group" aria-label="공명의 핵심 기능 네 가지">
${FEATURES.map(([slug, title], i) => `<figure class="feature-card feature-${slug}">
  <img src="../../site/assets/video/feature-${slug}-poster.webp" alt="${escapeHtml(title)} 화면" width="1600" height="900">
  <figcaption><span class="feature-number">0${i + 1}</span><strong>${escapeHtml(title)}</strong></figcaption>
</figure>`).join('\n')}
</div>`;
  return `<figure class="comparison" aria-label="PPT와 공명 수업 화면 비교">
  <div class="comparison-panel"><img src="../../site/assets/img/sci-before.png" alt="변환 전 PPT 수업 화면" width="1280" height="720"><p class="image-label">변환 전 <strong>PPT</strong></p></div>
  <span class="comparison-arrow" aria-hidden="true">→</span>
  <div class="comparison-panel"><img src="../../site/assets/img/sci-after.png" alt="변환 후 공명 수업 화면" width="1280" height="720"><p class="image-label">변환 후 <strong>공명</strong></p></div>
  <figcaption class="sr-only">PPT에서 공명 수업 화면으로</figcaption>
</figure>`;
}

export function renderDocument(markdown, document) {
  const blocks = parseMarkdown(markdown);
  const firstHeading = blocks[0]?.type === 'heading' && blocks[0].level === 1 ? blocks.shift() : null;
  const title = firstHeading?.text ?? document.name;
  // Exact one-hook validation makes future manuscript changes visible instead
  // of silently losing a figure or inserting it more than once.
  const matches = blocks.filter((block) => block.type === 'heading' && block.level === 2 && block.text.includes(document.hook));
  if (matches.length !== 1) throw new Error(`${document.name}.md: H2 containing “${document.hook}” must occur exactly once (found ${matches.length}). Update the placement table / DOCUMENTS if the heading changed.`);
  let inTarget = false;
  const body = [];
  for (const block of blocks) {
    if (block.type === 'heading' && block.level <= 2) {
      if (inTarget && document.position === 'section-end') body.push(renderFigure(document.figure));
      inTarget = block === matches[0];
    }
    body.push(renderBlock(block));
    if (block === matches[0] && document.position === 'after-heading') body.push(renderFigure(document.figure));
  }
  if (inTarget && document.position === 'section-end') body.push(renderFigure(document.figure));
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="generator" content="tools/print.mjs — generated from ${escapeHtml(document.name)}.md">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${FONT_URL}">
  <link rel="stylesheet" href="print.css">
</head>
<body class="document-${document.name === '기획의도' ? 'intent' : 'guide'}">
  <!-- Generated file. Edit the Markdown source and rerun tools/print.mjs. -->
  <header class="masthead">
    <div class="brand-row">
      <div class="brand"><svg class="brand-wave" viewBox="0 0 64 32" fill="none" aria-hidden="true"><path d="M2 16h8c5 0 5-12 10-12s5 24 10 24S35 4 40 4s5 12 10 12h12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><span>공명</span></div>
      <span class="site-address">n-lifescience.github.io/resonance</span>
    </div>
    <p class="tagline">교실의 진동수를 맞추다</p>
    <h1>${renderInline(title)}</h1>
  </header>
  <main>
${body.join('\n')}
  </main>
  <footer class="screen-footer">Made by 엔의 생명과학</footer>
</body>
</html>
`;
}

function parseArgs(args) {
  const options = { out: path.join(PRINT_DIR, 'out'), htmlOnly: false, help: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--html-only') options.htmlOnly = true;
    else if (args[i] === '--help' || args[i] === '-h') options.help = true;
    else if (args[i] === '--out') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('--out requires a directory.');
      options.out = path.resolve(args[++i]);
    } else throw new Error(`Unknown option: ${args[i]}`);
  }
  return options;
}

async function printPdf(chrome, htmlPath, pdfPath, profile) {
  // Remove a stale output so a failed print cannot appear to have succeeded.
  await rm(pdfPath, { force: true });
  await new Promise((resolve, reject) => {
    const child = spawn(chrome, [
      '--headless', '--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`,
      `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
      '--allow-file-access-from-files', '--disable-background-networking',
      '--timeout=20000', '--virtual-time-budget=5000', pathToFileURL(htmlPath).href,
    ], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 60000 });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-6000); });
    child.once('error', reject);
    child.once('close', (code, signal) => code === 0 ? resolve() : reject(new Error(`Chrome failed (${signal ?? code}).\n${stderr}`)));
  });
  if (!(await stat(pdfPath)).size) throw new Error(`Chrome wrote an empty PDF: ${pdfPath}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node tools/print.mjs [--out <PDF directory>] [--html-only]\nHTML: docs/print/<name>.html\nPDF default: docs/print/out/<name>.pdf\nChrome: CHROME_PATH or /Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    return;
  }
  await access(path.join(PRINT_DIR, 'print.css'), constants.R_OK);
  await Promise.all(ASSETS.map(async (asset) => {
    try { await access(path.join(ROOT, asset), constants.R_OK); }
    catch { throw new Error(`Required figure is missing: ${asset}`); }
  }));
  // Build both documents in memory before writing, so a missing hook cannot
  // leave only one of the documents regenerated.
  const documents = await Promise.all(DOCUMENTS.map(async (document) => ({
    ...document,
    html: renderDocument(await readFile(path.join(PRINT_DIR, `${document.name}.md`), 'utf8'), document),
    htmlPath: path.join(PRINT_DIR, `${document.name}.html`),
  })));
  for (const document of documents) {
    await writeFile(document.htmlPath, document.html, 'utf8');
    console.log(`HTML: ${path.relative(ROOT, document.htmlPath)}`);
  }
  if (options.htmlOnly) return;
  const chrome = process.env.CHROME_PATH || DEFAULT_CHROME;
  try { await access(chrome, constants.X_OK); }
  catch { throw new Error(`Chrome is not executable: ${chrome}\nSet CHROME_PATH to a Chrome executable, or use --html-only.`); }
  await mkdir(options.out, { recursive: true });
  const profile = await mkdtemp(path.join(tmpdir(), 'resonance-print-'));
  try {
    for (const document of documents) {
      const pdfPath = path.join(options.out, `${document.name}.pdf`);
      await printPdf(chrome, document.htmlPath, pdfPath, profile);
      console.log(`PDF: ${pdfPath}`);
    }
  } finally {
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`print: ${error.message}`); process.exitCode = 1; });
}
