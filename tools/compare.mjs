// Usage: node tools/compare.mjs <results-directory> [--out site/assets/comparison]
// Node 22+, Chrome/CHROME_PATH and ffmpeg. No npm packages.
// Audit uses a temporary copy with the pinned @2 engine mapped to local engine/;
// the published HTML remains a byte-for-byte copy of the submitted result.
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, run, temporary } from './rec-lib.mjs';

const ENGINE_BASE = 'https://cdn.jsdelivr.net/gh/N-lifescience/exploragram@2/engine/';
// Exploratory components from references/components.md. Quizzes, answer blanks,
// sorting exercises and classroom tools do not themselves count as exploragrams.
const EXPLORATORY = new Set(['calc', 'particles', 'plot', 'map-reveal', 'yearline', 'reveal', 'switch']);

function attributes(source) {
  const attrs = new Map();
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const match of source.matchAll(re)) {
    const name = match[1].toLowerCase();
    if (!attrs.has(name)) attrs.set(name, match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

function inspect(html) {
  // A small HTML tokenizer, rather than counting text with regex: comments,
  // CSS, JS strings, templates and quoted '>' must never become phantom slides.
  const tokens = /<!--[\s\S]*?(?:-->|$)|<![^>]*>|<\/?([A-Za-z][\w:-]*)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
  const slides = [], stack = [];
  let css = false, js = false, skipUntil = 0, templateDepth = 0;
  for (const match of html.matchAll(tokens)) {
    if (match.index < skipUntil || !match[1]) continue;
    const tag = match[1].toLowerCase(), closing = match[0].startsWith('</');
    const attrs = attributes(match[2]);
    if (tag === 'template') { templateDepth += closing ? -1 : 1; templateDepth = Math.max(0, templateDepth); continue; }
    if (['script', 'style', 'textarea', 'title', 'xmp'].includes(tag) && !closing) {
      if (!templateDepth && tag === 'script' && attrs.get('src') === `${ENGINE_BASE}exploragram.js`) js = true;
      const end = new RegExp(`</${tag}\\s*>`, 'ig'); end.lastIndex = match.index + match[0].length;
      const close = end.exec(html); skipUntil = close ? close.index + close[0].length : html.length;
      continue;
    }
    if (templateDepth) continue;
    if (!closing && tag === 'link' && (attrs.get('rel') || '').toLowerCase().split(/\s+/).includes('stylesheet') && attrs.get('href') === `${ENGINE_BASE}exploragram.css`) css = true;
    if (tag === 'section') {
      if (closing) stack.pop();
      else {
        const classes = (attrs.get('class') || '').split(/\s+/);
        if (classes.includes('slide')) { const slide = { exploragram: false }; slides.push(slide); stack.push(slide); }
        else stack.push(stack.at(-1) || null);
      }
    }
    if (closing) continue;
    const active = stack.at(-1);
    if (active && (attrs.has('data-activity') || attrs.has('data-ai') || attrs.has('data-play') || (attrs.get('class') || '').split(/\s+/).some((name) => EXPLORATORY.has(name)))) active.exploragram = true;
  }
  return { engine: css && js, slides: slides.length, exploragrams: slides.filter((slide) => slide.exploragram).length, first: slides.findIndex((slide) => slide.exploragram) + 1 };
}

function parseAudit(output, stateName) {
  const errors = new Set(), exceptions = [];
  for (const line of output.split(/\r?\n/)) {
    if (!/^ERR\s/.test(line)) continue;
    if (line.includes('스크립트 예외:')) exceptions.push(line.split('스크립트 예외:')[1].trim());
    else errors.add(line.replace(new RegExp(`^(ERR\\s+\\S+쪽) ${stateName} `), '$1 ').trim());
  }
  const summary = output.match(/^slides\s+\d+\s+·\s+errors\s+(\d+)/m);
  // The summary is a floor; baseline and screenshot-state duplicates count once.
  return { total: Math.max(Number(summary?.[1] || 0), errors.size) + exceptions.length, exceptions: exceptions.length, completed: !!summary };
}

function auditSource(html, file) {
  let source = html;
  for (const name of ['exploragram.css', 'exploragram.js']) {
    const local = join(ROOT, 'engine', name);
    if (!existsSync(local) && source.includes(`${ENGINE_BASE}${name}`)) throw new Error(`Missing engine/${name}; build the local engine before comparing.`);
    source = source.split(`${ENGINE_BASE}${name}`).join(pathToFileURL(local).href);
  }
  // Keep the submitted document's relative images, scripts and styles resolvable.
  // An explicit existing base already defines the submitter's intended location.
  if (!/<base\b/i.test(source)) {
    const base = `<base href="${pathToFileURL(dirname(file) + sep).href}">`;
    if (/<head\b[^>]*>/i.test(source)) source = source.replace(/<head\b[^>]*>/i, (head) => head + base);
    else source = base + source;
  }
  return source;
}

function argumentsFor(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  let directory, out = join(ROOT, 'site/assets/comparison');
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('--out needs a directory');
      out = resolve(args[++i]);
    } else if (args[i].startsWith('--out=')) out = resolve(args[i].slice(6));
    else if (args[i].startsWith('-') || directory) throw new Error(`Unexpected argument: ${args[i]}`);
    else directory = resolve(args[i]);
  }
  if (!directory) throw new Error('Usage: node tools/compare.mjs <results-directory> [--out site/assets/comparison]');
  return { directory, out };
}

async function main() {
  const config = argumentsFor(process.argv.slice(2));
  if (config.help) {
    console.log('Usage: node tools/compare.mjs <results-directory> [--out site/assets/comparison]\nInput: runs.json and <id>.html files. Requires Chrome (CHROME_PATH) and ffmpeg.\nCounts exploragrams once per slide; auditErrors includes unique audit errors and script exceptions.\nPinned @2 engine URLs use local engine/ for offline auditing; copied result HTML is unchanged.\nPublic links are site-relative, or use the output folder name when --out is outside site/.');
    return;
  }
  const runs = JSON.parse(readFileSync(join(config.directory, 'runs.json'), 'utf8'));
  if (!Array.isArray(runs)) throw new Error('runs.json must be an array.');
  const ids = new Set();
  // Validate every input before creating outputs or launching Chrome.
  for (const entry of runs) {
    if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(entry.id)) throw new Error('Each run needs a safe, unique id (ASCII letters, digits, _ or -).');
    if (ids.has(entry.id)) throw new Error(`Duplicate run id: ${entry.id}`);
    ids.add(entry.id);
    if (!existsSync(join(config.directory, `${entry.id}.html`))) throw new Error(`Missing ${entry.id}.html`);
    if (entry.minutes != null && (typeof entry.minutes !== 'number' || !Number.isFinite(entry.minutes) || entry.minutes < 0)) throw new Error(`${entry.id}: minutes must be a non-negative number or null.`);
    if (entry.note != null && typeof entry.note !== 'string') throw new Error(`${entry.id}: note must be a string.`);
  }
  const states = join(ROOT, 'skills/exploragram/scripts/states.mjs');
  if (!existsSync(states)) throw new Error('Missing skills/exploragram/scripts/states.mjs');
  mkdirSync(config.out, { recursive: true });
  const relativeOut = relative(join(ROOT, 'site'), config.out);
  const publicPrefix = relativeOut === '' ? '' : relativeOut !== '..' && !relativeOut.startsWith(`..${sep}`) && !isAbsolute(relativeOut) ? relativeOut.split(sep).join('/') : basename(config.out);
  const publicFile = (name) => publicPrefix ? `${publicPrefix}/${name}` : name;
  const results = [];
  for (const entry of runs) {
    const { id } = entry;
    const file = join(config.directory, `${id}.html`), html = readFileSync(file, 'utf8'), metrics = inspect(html);
    const notes = entry.note ? [entry.note] : [];
    if (!metrics.engine) notes.push('엔진 없음');
    if (!metrics.exploragrams) notes.push('익스플로라그램 없음');
    const temp = temporary(`exploragram-compare-${id}-`);
    let auditErrors = null, shot = null;
    try {
      const auditFile = join(temp, `${id}.html`), stateFile = join(temp, 'states.json'), screenshots = join(temp, 'shots');
      const stateName = metrics.first ? 'exploragram' : 'overview';
      writeFileSync(auditFile, auditSource(html, file));
      const state = { slide: metrics.first || 1, name: stateName };
      if (metrics.first) {
        // Open the first meaningful state, rather than photographing a zero-state veil.
        state.js = `for (const input of document.querySelectorAll('section.slide.is-active input[type="range"]')) { input.value = String((Number(input.min || 0) + Number(input.max || 100)) / 2); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); }`;
        state.wait = 900;
      }
      writeFileSync(stateFile, JSON.stringify([state]));
      const audit = await run(process.execPath, [states, auditFile, screenshots, stateFile], { timeout: 120000, allowFailure: true });
      const log = `${audit.stdout}\n${audit.stderr}`, report = parseAudit(log, stateName);
      // Exit 1 means findings. Exit 2, signal or a missing summary means infrastructure failure.
      if ((audit.code === 0 || audit.code === 1) && report.completed) {
        auditErrors = report.total;
        if (report.exceptions) notes.push(`스크립트 예외 ${report.exceptions}건`);
      } else {
        notes.push(`자동 점검 실패${audit.code == null ? ` (${audit.signal || '중단'})` : ` (종료 코드 ${audit.code})`}`);
        console.error(`[${id}] ${log.trim().slice(-2000)}`);
      }
      const png = join(screenshots, `${String(state.slide).padStart(2, '0')}-${stateName}.png`);
      if (existsSync(png)) {
        const target = join(config.out, `${id}.webp`);
        await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-vf', 'scale=960:-2:flags=lanczos', '-frames:v', '1', '-c:v', 'libwebp', '-quality', '85', target]);
        shot = publicFile(`${id}.webp`);
      } else notes.push('미리보기 없음');
    } catch (error) {
      notes.push(`점검 또는 미리보기 생성 실패: ${error.message.split('\n')[0]}`);
      console.error(`[${id}] ${error.message}`);
    } finally { rmSync(temp, { recursive: true, force: true }); }
    const target = join(config.out, `${id}.html`);
    if (resolve(file) !== resolve(target)) copyFileSync(file, target);
    if (!shot) rmSync(join(config.out, `${id}.webp`), { force: true }); // Do not leave a stale successful screenshot.
    results.push({
      id, platform: entry.platform ?? '', mode: entry.mode ?? '', model: entry.model ?? '', date: entry.date ?? '',
      file: publicFile(`${id}.html`), shot,
      metrics: { engine: metrics.engine, exploragrams: metrics.exploragrams, auditErrors, slides: metrics.slides, minutes: entry.minutes ?? null },
      note: notes.join(' / '),
    });
    console.log(`${id}: engine=${metrics.engine}, exploragrams=${metrics.exploragrams}, auditErrors=${auditErrors ?? 'null'}, slides=${metrics.slides}, shot=${shot ?? 'null'}`);
  }
  const pending = join(config.out, `.compare-${process.pid}.json.tmp`), output = join(config.out, 'compare.json');
  try { writeFileSync(pending, `${JSON.stringify(results, null, 2)}\n`); renameSync(pending, output); }
  finally { rmSync(pending, { force: true }); }
  console.log(`Wrote ${output} (${results.length} runs)`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
