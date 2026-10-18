// Usage: node tools/record-features.mjs [--only create,explore,live,board]
//        [--live-cuts 3-8,20-26,41-45] [--classroom-selector '...']
// Build _site first: node tools/build.mjs && node tools/site.mjs
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, HumanInput, encodeCapture, encodeCompanions, launchChrome, normaliseVideo, printSizes, run, screencast, serveSite, sleep, temporary, waitFor } from './rec-lib.mjs';

const ALL = ['create', 'explore', 'live', 'board'];
function options(args) {
  const result = { only: ALL, liveCuts: '3-8,20-26,41-45', classroomSelector: null };
  for (let i = 0; i < args.length; i++) {
    const [name, inline] = args[i].split(/=(.*)/s);
    if (name === '--help' || name === '-h') { result.help = true; continue; }
    if (!['--only', '--live-cuts', '--classroom-selector'].includes(name)) throw new Error(`Unknown option: ${name}`);
    const value = inline ?? args[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
    if (name === '--only') result.only = [...new Set(value.split(',').map((id) => id.trim()))];
    if (name === '--live-cuts') result.liveCuts = value;
    if (name === '--classroom-selector') result.classroomSelector = value;
  }
  if (result.only.some((id) => !ALL.includes(id))) throw new Error(`--only accepts ${ALL.join(',')}`);
  return result;
}

function lessonScenes(html) {
  const slides = [...html.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section\s*>/gi)]
    .filter((match) => /\bclass\s*=\s*["'][^"']*\bslide\b/.test(match[1]));
  const time = slides.findIndex((match) => /<input\b[^>]*\bdata-play\b/i.test(match[2]));
  const temperature = slides.findIndex((match) => /<input\b[^>]*aria-label=["'][^"']*온도/.test(match[2]));
  const inputId = (slide, test) => {
    const input = [...slide[2].matchAll(/<input\b[^>]*>/gi)].find((match) => test.test(match[0]))?.[0];
    const id = input?.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!id || !/^[\w-]+$/.test(id)) throw new Error('Expected a stable slider id in sci-diffusion.html.');
    return `#${id}`;
  };
  if (time < 0 || temperature < 0) throw new Error('Time/temperature scenes were not found in sci-diffusion.html.');
  return { time, temperature, timeSelector: inputId(slides[time], /\bdata-play\b/), tempSelector: inputId(slides[temperature], /온도/) };
}

async function openLesson(browser, base) {
  await browser.send('Page.navigate', { url: `${base}/lessons/sci-diffusion.html` });
  await waitFor(browser, '!!window.Exploragram && !!document.querySelector(\'.ch-toolbar [data-name="next"]\')', 'lesson engine');
  await browser.evaluate('Exploragram.ready.then(() => document.fonts.ready).then(() => true)');
  await sleep(350);
}
async function nextTo(browser, input, target, viaToolbar = false) {
  for (let i = 0; i < 60; i++) {
    const current = await browser.evaluate('Exploragram._internal.Nav.state.slide');
    if (current === target) { await sleep(300); return; }
    if (current > target) throw new Error(`Cannot advance from ${current + 1} to ${target + 1}`);
    if (viaToolbar) await input.click('.ch-toolbar [data-name="next"]');
    else { await input.key('ArrowRight'); await sleep(150); }
  }
  throw new Error(`Could not reach slide ${target + 1}`);
}

async function explore(browser, input, scenes, poster) {
  await sleep(450);
  await input.range(scenes.timeSelector, .48, 2700);
  await sleep(450);
  await input.click('section.slide.is-active .ch-play-run');
  await sleep(2200);
  await nextTo(browser, input, scenes.temperature);
  await input.range(scenes.tempSelector, .9, 2500);
  await sleep(650); await poster();
}

function circle(cx, cy, rx, ry) {
  return Array.from({ length: 73 }, (_, i) => {
    const a = i / 72 * Math.PI * 2, wobble = Math.sin(a * 5) * 2.5;
    return [cx + Math.cos(a) * (rx + wobble), cy + Math.sin(a) * (ry + wobble)];
  });
}
function line(x1, y1, x2, y2) {
  return Array.from({ length: 24 }, (_, i) => {
    const t = i / 23;
    return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t + Math.sin(t * Math.PI) * 5];
  });
}
// eslint-disable-next-line no-unused-vars
const CLASSROOM = '.ch-toolbar [data-name="classroom"], .ch-toolbar [data-name="class-tools"], .ch-toolbar [data-name="timer"], .ch-toolbar [aria-label*="교실 도구"], .ch-toolbar [aria-label*="타이머"]';
async function board(browser, input, scenes, classroomSelector, poster) {
  await input.click('.ch-toolbar [data-name="pen"]');
  const r = await input.box('section.slide.is-active');
  const at = (x, y) => [r.x + x * r.width, r.y + y * r.height];
  const [cx, cy] = at(.37, .45);
  await input.stroke(circle(cx, cy, r.width * .11, r.height * .16), 1250);
  const a = at(.44, .63), b = at(.63, .53);
  await input.stroke(line(...a, ...b), 650);
  await input.stroke([at(.60, .53), b, at(.615, .57)], 300);
  await nextTo(browser, input, scenes.time + 1, true);
  if (!(await browser.evaluate('document.body.dataset.tool === "pen"'))) throw new Error('Pen did not remain selected after advancing.');
  await input.click('.ch-toolbar [data-name="board"]');
  await waitFor(browser, 'document.body.classList.contains("ch-board-on")', 'blackboard');
  await input.stroke(circle(...at(.35, .43), r.width * .07, r.height * .11), 850);
  await input.stroke(line(...at(.46, .32), ...at(.46, .57)), 500);
  await input.stroke(line(...at(.43, .43), ...at(.52, .43)), 450);
  await input.stroke(line(...at(.30, .64), ...at(.59, .64)), 600);
  if (!classroomSelector) { await sleep(700); await poster(); return; }
  await input.click(classroomSelector);
  // New classroom toolbars may open a menu first; a direct timer button needs no second click.
  const timer = await browser.evaluate(`(() => {
    const buttons=[...document.querySelectorAll('.ch-pop button, [role="dialog"] button, .ch-classroom button')];
    const b=buttons.find(e=>/타이머/.test(e.textContent+' '+e.getAttribute('aria-label'))&&e.getBoundingClientRect().width>0);
    if(!b)return null;b.setAttribute('data-record-timer','');return '[data-record-timer]';
  })()`);
  if (timer) await input.click(timer);
  await sleep(700); await poster();
}

async function create(browser, input, poster) {
  const evaluate = browser.evaluate;
  await input.type('https://github.com/N-lifescience/resonance 지침대로 이 자료를 수업 HTML로 바꿔줘', 9);
  await input.click('#send'); await sleep(250);
  await evaluate('window.interview.reply("features", 7)');
  await sleep(450);
  await input.click('#prompt'); await input.type('1, 2, 4', 85); await input.click('#send');
  await evaluate('window.interview.reply("plan", 10)');
  await sleep(650);
  await input.click('#prompt'); await input.type('네', 110); await input.click('#send');
  await sleep(350);
  await evaluate('window.interview.showLesson()');
  await sleep(450);
  await input.click('.ch-toolbar [data-name="edit"]', '#lesson');
  await input.click('section.slide.is-active h1', '#lesson', { double: true });
  await waitFor(browser, '!!document.querySelector("#lesson").contentDocument.querySelector(\'h1[contenteditable="true"]\')', 'editable lesson title', 2500);
  await evaluate(`(() => {
    const d=document.querySelector('#lesson').contentDocument;
    const h=d.querySelector('h1[contenteditable="true"]');
    const range=d.createRange();range.selectNodeContents(h);
    const selection=d.defaultView.getSelection();selection.removeAllRanges();selection.addRange(range);
  })()`);
  await input.type('온도를 바꾸면 확산은 얼마나 빨라질까?', 55);
  await input.key('Escape');
  await sleep(500); await poster();
}

function parseCuts(value) {
  const cuts = value.split(',').map((item) => {
    const match = item.trim().match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
    if (!match || +match[2] - +match[1] <= .3) throw new Error(`Invalid live cut: ${item} (use start-end seconds, longer than 0.3s).`);
    return [+match[1], +match[2]];
  });
  const seconds = cuts.reduce((total, [start, end]) => total + end - start, 0) - .3 * (cuts.length - 1);
  if (seconds < 12 || seconds > 18) throw new Error(`Live cuts produce ${seconds.toFixed(1)}s; choose 12–18s after 0.3s overlaps.`);
  return { cuts, seconds };
}
async function live(value, stem) {
  const source = ['site/assets/video/live.mp4', 'site/media/live.mp4'].map((file) => join(ROOT, file)).find(existsSync);
  if (!source) throw new Error('No existing live.mp4 found in site/assets/video/ or site/media/.');
  const { cuts, seconds } = parseCuts(value);
  const info = await run('ffmpeg', ['-hide_banner', '-i', source], { allowFailure: true });
  const duration = info.stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!duration) throw new Error('Could not read live.mp4 duration with ffmpeg.');
  const length = +duration[1] * 3600 + +duration[2] * 60 + +duration[3];
  if (cuts.some(([, end]) => end > length)) throw new Error(`A live cut exceeds the ${length.toFixed(1)}s source. Set --live-cuts.`);
  const filters = [`[0:v]${normaliseVideo()},settb=AVTB,split=${cuts.length}${cuts.map((_, i) => `[src${i}]`).join('')}`];
  cuts.forEach(([start, end], i) => filters.push(`[src${i}]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${i}]`));
  let previous = 'v0', accumulated = cuts[0][1] - cuts[0][0];
  for (let i = 1; i < cuts.length; i++) {
    const output = `cross${i}`;
    filters.push(`[${previous}][v${i}]xfade=transition=fade:duration=0.3:offset=${(accumulated - .3).toFixed(6)}[${output}]`);
    previous = output; accumulated += cuts[i][1] - cuts[i][0] - .3;
  }
  filters.push(`[${previous}]fade=t=out:st=${(seconds - .5).toFixed(6)}:d=0.5,format=yuv420p[out]`);
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', source, '-filter_complex', filters.join(';'), '-map', '[out]', '-an', '-t', String(seconds), '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${stem}.mp4`]);
  await encodeCompanions(stem);
  console.log(`live: ${seconds.toFixed(1)}s, ${cuts.length} cuts, 0.3s crossfades`);
}

async function main() {
  const config = options(process.argv.slice(2));
  if (config.help) {
    console.log('Usage: node tools/record-features.mjs [--only create,explore,live,board]\n  [--live-cuts 3-8,20-26,41-45] [--classroom-selector CSS]\nRequires Node 22+, ffmpeg, Chrome (or CHROME_PATH), and built _site/lessons/sci-diffusion.html.');
    return;
  }
  const needChrome = config.only.some((id) => id !== 'live');
  const lesson = join(ROOT, '_site/lessons/sci-diffusion.html');
  if (needChrome && !existsSync(lesson)) throw new Error('Missing _site/lessons/sci-diffusion.html. Run node tools/build.mjs && node tools/site.mjs first.');
  if (config.only.includes('live')) parseCuts(config.liveCuts);
  await run('ffmpeg', ['-version']);
  const out = join(ROOT, 'site/assets/video'); mkdirSync(out, { recursive: true });
  let server;
  try {
    if (needChrome) server = await serveSite();
    for (const id of config.only) {
      console.log(`Recording ${id}…`);
      const directory = temporary(`exploragram-${id}-`), stem = join(out, `feature-${id}`);
      let browser;
      try {
        if (id === 'live') await live(config.liveCuts, stem);
        else {
          browser = await launchChrome();
          const input = new HumanInput(browser);
          let scenes;
          if (id === 'create') {
            await browser.send('Page.navigate', { url: `${server.base}/__mock.html` });
            await waitFor(browser, '!!window.interview && !!window.__ready', 'interview mock and lesson iframe');
            await browser.evaluate('document.fonts.ready.then(() => { document.querySelector("#prompt").focus(); return true; })');
          } else {
            scenes = lessonScenes(readFileSync(lesson, 'utf8'));
            await openLesson(browser, server.base);
            await nextTo(browser, input, scenes.time);
            if (id === 'board') {
              // 교실 도구(타이머 등)는 툴바 단추가 아니라 장 안 부품이다. 선택자를 준 경우에만 그 단추를 누른다.
              if (config.classroomSelector) await input.box(config.classroomSelector);
              await input.range(scenes.timeSelector, .36, 600);
            }
          }
          const capture = await screencast(browser, directory, (poster) => id === 'create' ? create(browser, input, poster) : id === 'explore' ? explore(browser, input, scenes, poster) : board(browser, input, scenes, config.classroomSelector, poster), 16);
          await browser.close(); browser = null;
          await encodeCapture(capture, stem);
          console.log(`${id}: ${capture.seconds.toFixed(1)}s`);
        }
        printSizes(stem);
      } finally {
        try { await browser?.close(); } finally { rmSync(directory, { recursive: true, force: true }); }
      }
    }
  } finally { await server?.close(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
