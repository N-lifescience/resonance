// Shared recording primitives. Node 22+, Chrome and ffmpeg; no npm packages.
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const WIDTH = 1600, HEIGHT = 900, FPS = 30;
export const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
export const temporary = (prefix) => mkdtempSync(join(tmpdir(), prefix));

export function run(command, args, { timeout = 180000, allowFailure = false } = {}) {
  return new Promise((done, reject) => {
    const grouped = process.platform !== 'win32';
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: grouped });
    let stdout = '', stderr = '', timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      // states.mjs starts Chrome itself. Stop that whole group on a timeout.
      try { if (grouped && child.pid) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); }
      catch { child.kill('SIGKILL'); }
    }, timeout);
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    child.on('error', (error) => { clearTimeout(timer); reject(new Error(`${command}: ${error.message}`)); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const result = { code, signal, stdout, stderr };
      if (timedOut) reject(new Error(`${command} timed out after ${timeout / 1000}s`));
      else if (code !== 0 && !allowFailure) reject(new Error(`${command} failed (${code ?? signal}):\n${stderr.slice(-6000)}`));
      else done(result);
    });
  });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm' };
export async function serveSite(site = join(ROOT, '_site')) {
  const baseDir = realpathSync(site);
  const server = createServer((request, response) => {
    try {
      let name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      // The mock's literal ../../_site/lessons/... URL also works at /__mock.html.
      if (name.startsWith('/_site/')) name = name.slice('/_site'.length);
      if (name.endsWith('/')) name += 'index.html';
      const mock = name === '/__mock.html';
      const path = mock ? join(ROOT, 'tools/record/interview-mock.html') : resolve(baseDir, `.${name}`);
      const rel = relative(baseDir, path);
      if (!mock && (rel === '..' || rel.startsWith('../') || isAbsolute(rel))) { response.writeHead(403).end(); return; }
      if (!existsSync(path) || !statSync(path).isFile()) { response.writeHead(404).end('Not found'); return; }
      const real = realpathSync(path), realRel = relative(baseDir, real);
      if (!mock && (realRel === '..' || realRel.startsWith('../') || isAbsolute(realRel))) { response.writeHead(403).end(); return; }
      response.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      const stream = createReadStream(path);
      stream.on('error', () => response.destroy());
      stream.pipe(response);
    } catch { response.writeHead(400).end('Bad request'); }
  });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((done) => { server.close(done); server.closeAllConnections(); }),
  };
}

// Injection runs in each same-origin document, including the mock's lesson iframe.
const CURSOR = `(() => {
  const init = () => {
    const dot = document.createElement('div');
    dot.id = '__recordCursor';
    dot.style.cssText = 'position:fixed;left:-100px;top:-100px;width:28px;height:28px;border-radius:50%;background:rgba(20,20,19,.42);box-shadow:0 2px 8px rgba(0,0,0,.12);pointer-events:none;z-index:2147483647;transform:translate(-50%,-50%)';
    document.documentElement.append(dot);
    window.__recordCursor = (x,y,down=false) => { dot.style.left=x+'px';dot.style.top=y+'px';dot.style.background=down?'rgba(217,119,87,.65)':'rgba(20,20,19,.42)'; };
    document.addEventListener('pointermove', e => window.__recordCursor(e.clientX,e.clientY,!!e.buttons), true);
    document.addEventListener('pointerdown', e => window.__recordCursor(e.clientX,e.clientY,true), true);
    document.addEventListener('pointerup', e => window.__recordCursor(e.clientX,e.clientY,false), true);
    document.addEventListener('pointerout', e => { if(!e.relatedTarget || e.relatedTarget.tagName==='IFRAME') window.__recordCursor(-100,-100); }, true);
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();`;

export async function launchChrome() {
  if (typeof WebSocket !== 'function') throw new Error('Node 22+ is required (built-in WebSocket).');
  const executable = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (!existsSync(executable)) throw new Error('Chrome not found. Set CHROME_PATH to the executable.');
  const profile = temporary('exploragram-feature-chrome-');
  const child = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--window-size=${WIDTH},${HEIGHT}`, 'about:blank'], { stdio: 'ignore' });
  let startupError;
  child.on('error', (error) => { startupError = error; });
  let ws;
  const waiting = new Map(), listeners = new Map();
  let nextId = 0;
  const rejectPending = (error) => { for (const entry of waiting.values()) { clearTimeout(entry.timer); entry.reject(error); } waiting.clear(); };
  const close = async () => {
    rejectPending(new Error('Chrome session closed'));
    ws?.close();
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise((done) => child.once('exit', done));
      child.kill();
      await Promise.race([exited, sleep(1800)]);
      if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
    }
    rmSync(profile, { recursive: true, force: true });
  };
  try {
    let target;
    for (let i = 0; i < 100 && !target; i++) {
      if (startupError) throw startupError;
      if (child.exitCode !== null) throw new Error(`Chrome exited (${child.exitCode})`);
      try {
        const port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
        const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) });
        target = (await response.json()).find((item) => item.type === 'page');
      } catch { /* Chrome is still starting. */ }
      if (!target) await sleep(100);
    }
    if (!target) throw new Error('Chrome did not expose a CDP page within 10s.');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((done, reject) => { ws.addEventListener('open', done, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    ws.addEventListener('close', () => rejectPending(new Error('CDP disconnected')));
    ws.addEventListener('error', () => rejectPending(new Error('CDP WebSocket error')));
    ws.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      const pending = waiting.get(message.id);
      if (pending) {
        waiting.delete(message.id); clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
        else pending.done(message.result);
      }
      for (const callback of listeners.get(message.method) || []) callback(message.params);
    });
    const send = (method, params = {}) => new Promise((done, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
      waiting.set(id, { done, reject, timer, method });
      ws.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result?.value;
    };
    const on = (method, callback) => {
      if (!listeners.has(method)) listeners.set(method, new Set());
      listeners.get(method).add(callback);
      return () => listeners.get(method)?.delete(callback);
    };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: CURSOR });
    return { send, evaluate, on, close };
  } catch (error) { await close(); throw error; }
}

export async function waitFor(browser, expression, label = expression, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await browser.evaluate(expression).catch(() => false)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

export class HumanInput {
  constructor(browser) { this.browser = browser; this.x = WIDTH * .55; this.y = HEIGHT * .7; }
  async move(x, y, duration = 360, down = false) {
    const fromX = this.x, fromY = this.y, count = Math.max(2, Math.ceil(duration / 25));
    const start = performance.now();
    for (let i = 1; i <= count; i++) {
      const t = i / count, eased = t * t * (3 - 2 * t);
      this.x = fromX + (x - fromX) * eased; this.y = fromY + (y - fromY) * eased;
      await this.browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: this.x, y: this.y, button: down ? 'left' : 'none', buttons: down ? 1 : 0 });
      await sleep(Math.max(0, start + duration * t - performance.now()));
    }
  }
  async button(type, clickCount = 1) {
    await this.browser.send('Input.dispatchMouseEvent', { type, x: this.x, y: this.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount });
  }
  async clickAt(x, y, { double = false } = {}) {
    await this.move(x, y); await sleep(80);
    await this.button('mousePressed'); await sleep(65); await this.button('mouseReleased');
    if (double) { await sleep(85); await this.button('mousePressed', 2); await this.button('mouseReleased', 2); }
    await sleep(140);
  }
  async box(selector, frame = null) {
    const result = await this.browser.evaluate(`(() => {
      const f = ${frame ? `document.querySelector(${JSON.stringify(frame)})` : 'null'};
      const d = f ? f.contentDocument : document;
      const el = [...d.querySelectorAll(${JSON.stringify(selector)})].find(e => {const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden';});
      if(!el) return null;
      const r=el.getBoundingClientRect(), o=f?f.getBoundingClientRect():{left:0,top:0};
      return {x:r.left+o.left,y:r.top+o.top,width:r.width,height:r.height,value:el.value,min:el.min,max:el.max};
    })()`);
    if (!result) throw new Error(`Visible control not found: ${selector}`);
    return result;
  }
  async click(selector, frame = null, options) {
    const r = await this.box(selector, frame);
    await this.clickAt(r.x + r.width / 2, r.y + r.height / 2, options);
  }
  async range(selector, fraction, duration = 2000) {
    const r = await this.box(selector);
    // Native sliders reserve half the thumb width at both ends (44px in this lesson).
    const pad = Math.min(22, r.width / 4), room = r.width - 2 * pad;
    const current = (Number(r.value) - Number(r.min || 0)) / (Number(r.max || 100) - Number(r.min || 0));
    await this.move(r.x + pad + room * current, r.y + r.height / 2);
    await this.button('mousePressed'); await sleep(110);
    await this.move(r.x + pad + room * fraction, r.y + r.height / 2, duration, true);
    await this.button('mouseReleased'); await sleep(250);
  }
  async stroke(points, duration = 1100) {
    await this.move(...points[0], 260); await this.button('mousePressed');
    const distances = [0];
    for (let i = 1; i < points.length; i++) distances.push(distances.at(-1) + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    const count = Math.max(points.length, Math.ceil(duration / 20));
    const start = performance.now();
    let segment = 1;
    for (let i = 1; i <= count; i++) {
      const distance = distances.at(-1) * i / count;
      while (segment < points.length - 1 && distances[segment] < distance) segment++;
      const t = (distance - distances[segment - 1]) / (distances[segment] - distances[segment - 1] || 1);
      this.x = points[segment - 1][0] + (points[segment][0] - points[segment - 1][0]) * t;
      this.y = points[segment - 1][1] + (points[segment][1] - points[segment - 1][1]) * t;
      await this.browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: this.x, y: this.y, button: 'left', buttons: 1 });
      await sleep(Math.max(0, start + duration * i / count - performance.now()));
    }
    await this.button('mouseReleased'); await sleep(150);
  }
  async type(text, interval = 65) {
    for (const char of text) { await this.browser.send('Input.insertText', { text: char }); await sleep(interval); }
  }
  async key(key, code = key, modifiers = 0) {
    await this.browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers });
    await this.browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers });
  }
}

export async function screencast(browser, directory, action, duration = 16) {
  const frames = [], started = Date.now() / 1000;
  let frameError;
  const off = browser.on('Page.screencastFrame', (frame) => {
    try {
      const name = `frame-${String(frames.length).padStart(6, '0')}.jpg`;
      writeFileSync(join(directory, name), Buffer.from(frame.data, 'base64'));
      frames.push({ name, time: frame.metadata.timestamp ?? Date.now() / 1000 });
    } catch (error) { frameError = error; }
    browser.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch((error) => { frameError = error; });
  });
  let poster;
  try {
    await browser.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: WIDTH, maxHeight: HEIGHT, everyNthFrame: 1 });
    await action(async () => {
      const shot = await browser.send('Page.captureScreenshot', { format: 'png' });
      poster = join(directory, 'poster.png'); writeFileSync(poster, Buffer.from(shot.data, 'base64'));
    });
    const elapsed = Date.now() / 1000 - started;
    if (elapsed > 18) throw new Error(`Scene took ${elapsed.toFixed(1)}s (maximum 18s). Retry after the machine is idle.`);
    await sleep(Math.max(0, duration - elapsed) * 1000);
    if (!poster) {
      const shot = await browser.send('Page.captureScreenshot', { format: 'png' });
      poster = join(directory, 'poster.png'); writeFileSync(poster, Buffer.from(shot.data, 'base64'));
    }
  } finally {
    await browser.send('Page.stopScreencast').finally(off);
  }
  if (frameError) throw frameError;
  if (!frames.length) throw new Error('Chrome produced no screencast frames.');
  const seconds = Date.now() / 1000 - started;
  const lines = ['ffconcat version 1.0'];
  frames.forEach((frame, i) => {
    const start = i === 0 ? started : Math.max(started, frame.time);
    const end = frames[i + 1]?.time ?? started + seconds;
    lines.push(`file '${frame.name}'`, `duration ${Math.max(.001, end - start).toFixed(6)}`);
  });
  lines.push(`file '${frames.at(-1).name}'`);
  const list = join(directory, 'frames.ffconcat'); writeFileSync(list, lines.join('\n'));
  return { list, poster, seconds };
}

export function normaliseVideo() {
  return `fps=${FPS},scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p`;
}
export async function encodeCapture(capture, stem) {
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', capture.list, '-vf', `${normaliseVideo()},fade=t=out:st=${(capture.seconds - .5).toFixed(4)}:d=0.5`, '-t', capture.seconds.toFixed(4), '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${stem}.mp4`]);
  await encodeCompanions(stem, capture.poster);
}
export async function encodeCompanions(stem, poster = null) {
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${stem}.mp4`, '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '32', '-row-mt', '1', '-pix_fmt', 'yuv420p', `${stem}.webm`]);
  const input = poster ? ['-i', poster] : ['-ss', '2', '-i', `${stem}.mp4`];
  await run('ffmpeg', ['-y', '-loglevel', 'error', ...input, '-frames:v', '1', '-vf', `scale=${WIDTH}:${HEIGHT}:flags=lanczos`, '-c:v', 'libwebp', '-quality', '88', `${stem}-poster.webp`]);
}
export function printSizes(stem) {
  for (const suffix of ['.mp4', '.webm', '-poster.webp']) {
    const file = `${stem}${suffix}`;
    console.log(`${relative(ROOT, file)}  ${(statSync(file).size / 1048576).toFixed(2)} MiB`);
  }
}
