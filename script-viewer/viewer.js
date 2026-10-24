/*! lecture-script viewer | © N-lifescience | https://github.com/N-lifescience/resonance */
/* 공명 대본 뷰어. 대본 HTML 안의 <script type="text/markdown" id="lecture-script">를 읽어 그린다.
   시간 계산, 형식 점검, 수업 HTML과 장·단계 맞추기, 인쇄를 맡는다. 수업 엔진(exploragram)과는 따로다.
   대본 글은 textContent로만 그리고, 불러온 수업 HTML은 DOMParser로 읽기만 한다(실행하지 않는다). */
(function () {
  'use strict';

  // class-helper 시간 엔진과 같은 가정: 보통 속도 290음절/분, 문장마다 0.4초 쉼. 수업마다 다르니 추정값이다.
  const RATE = 290;
  const PAUSE = 0.4;
  const TAGS = { 질문: 'question', 예상: 'answer', 대기: 'wait', 연출: 'cue', 조작: 'action', 참고: 'ref', 생략가능: 'optional', 비트: 'beat' };
  const SPOKEN = new Set(['say', 'question', 'optional']);
  const LONG_SLIDE = 600;   // 활동 장은 5분을 넘기 쉽다. 10분을 넘으면 장을 나눌지 살핀다.

  function units(text) {
    let n = 0;
    for (const ch of text) if (/[가-힣0-9A-Za-z]/.test(ch)) n += 1;
    return n;
  }
  const sentences = (text) => Math.max(1, (text.match(/[.?!…]|다\s|요\s/g) || []).length);
  const speechSeconds = (text) => (units(text) / RATE) * 60 + sentences(text) * PAUSE;

  // '8초', '1분', '1분 30초', '90' → 초. 읽지 못하면 NaN.
  function parseDuration(value) {
    const s = String(value).trim();
    if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
    const m = /^(?:(\d+)\s*분)?\s*(?:(\d+)\s*초)?$/.exec(s);
    if (!m || (!m[1] && !m[2])) return NaN;
    return Number(m[1] || 0) * 60 + Number(m[2] || 0);
  }

  function parseLine(raw, lineNo, errors) {
    const text = raw.trim();
    if (!text.startsWith('@')) return { kind: 'say', text, lineNo };
    const m = /^@([^\s(]+)(?:\(([^)]*)\))?(?:\s+([\s\S]*))?$/.exec(text);
    const kind = m && TAGS[m[1]];
    if (!kind) { errors.push({ lineNo, msg: `모르는 태그: ${text.split(/\s/)[0]} (쓸 수 있는 태그: ${Object.keys(TAGS).map((t) => `@${t}`).join(' ')})` }); return null; }
    const rest = (m[3] || '').trim();
    const line = { kind, text: rest, lineNo };
    if (kind === 'wait') {
      // '@대기 8초 예측을 적는다'처럼 시간 뒤에 할 일을 덧붙여도 된다.
      const d = /^(\d+\s*분(?:\s*\d+\s*초)?|\d+\s*초|\d+)\s*(.*)$/.exec(rest);
      line.seconds = d ? parseDuration(d[1]) : NaN;
      line.text = d ? d[2] : '';
      if (!Number.isFinite(line.seconds) || line.seconds <= 0) { errors.push({ lineNo, msg: `@대기 뒤에는 '8초'처럼 시간을 쓴다: ${text}` }); return null; }
      return line;
    }
    if (!rest) { errors.push({ lineNo, msg: `@${m[1]} 뒤에 내용이 없다` }); return null; }
    if (kind === 'optional') line.reason = (m[2] || '').trim();
    if (kind === 'ref') {
      const [who, ...how] = rest.split('|');
      line.instructor = who.trim();
      line.technique = how.join('|').trim();
      if (!line.instructor || !line.technique) { errors.push({ lineNo, msg: `@참고는 '강사 | 기법'으로 쓴다: ${text}` }); return null; }
    }
    return line;
  }

  // 대본 MD → { meta, slides, errors }. 장: { id, title, lineNo, blocks: [{ step, lineNo, lines }] }
  function parse(md) {
    const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
    const meta = { 화법: {} };
    const slides = [];
    const errors = [];
    let i = 0;
    while (i < lines.length && !lines[i].trim()) i++;
    if (lines[i] && lines[i].trim() === '---') {
      let inMix = false;
      for (i += 1; i < lines.length && lines[i].trim() !== '---'; i++) {
        const raw = lines[i];
        if (!raw.trim()) continue;
        const kv = /^(\s*)([^:]+):\s*(.*)$/.exec(raw);
        if (!kv) { errors.push({ lineNo: i + 1, msg: `머리말을 읽지 못했다: ${raw.trim()}` }); continue; }
        const [, indent, key, value] = kv;
        if (indent && inMix) { if (value.trim()) meta.화법[key.trim()] = value.trim(); continue; }
        inMix = key.trim() === '화법' && !value.trim();
        if (!inMix) meta[key.trim()] = value.trim();
      }
      if (i >= lines.length) errors.push({ lineNo: 1, msg: '머리말을 닫는 --- 줄이 없다' });
      i += 1;
    }
    let slide = null;
    let block = null;
    for (; i < lines.length; i++) {
      const raw = lines[i];
      const t = raw.trim();
      const lineNo = i + 1;
      if (!t || /^<!--.*-->$/.test(t)) continue;
      if (/^#\s/.test(t)) { if (!slide && !meta.title) meta.title = t.replace(/^#\s+/, ''); else errors.push({ lineNo, msg: `대본 안에는 # 제목을 쓰지 않는다: ${t}` }); continue; }
      if (/^##\s/.test(t)) {
        const m = /^##\s+([^\s·|▶]+)\s*(?:[·|]\s*(.*))?$/.exec(t);
        if (!m) { errors.push({ lineNo, msg: `장 제목은 '## 장id · 제목'으로 쓴다: ${t}` }); slide = null; block = null; continue; }
        slide = { id: m[1], title: (m[2] || '').trim(), lineNo, blocks: [] };
        block = { step: 0, lineNo, lines: [] };
        slide.blocks.push(block);
        slides.push(slide);
        continue;
      }
      if (/^###/.test(t)) {
        const m = /^###\s*▶\s*(\d+)\s*$/.exec(t);
        if (!m) { errors.push({ lineNo, msg: `단계 제목은 '### ▶1'처럼 쓴다: ${t}` }); continue; }
        if (!slide) { errors.push({ lineNo, msg: `장 제목(##)보다 먼저 나온 단계: ${t}` }); continue; }
        block = { step: Number(m[1]), lineNo, lines: [] };
        slide.blocks.push(block);
        continue;
      }
      if (!slide) { errors.push({ lineNo, msg: `장 밖의 글: ${t.slice(0, 40)}` }); continue; }
      const line = parseLine(t, lineNo, errors);
      if (line) block.lines.push(line);
    }
    if (meta.minutes != null) meta.minutes = Number(meta.minutes);
    return { meta, slides, errors };
  }

  function slideTime(slide) {
    let total = 0, optional = 0;
    for (const b of slide.blocks) for (const l of b.lines) {
      if (l.kind === 'wait') total += l.seconds;
      else if (SPOKEN.has(l.kind)) {
        const s = speechSeconds(l.text);
        total += s;
        if (l.kind === 'optional') optional += s;
      }
    }
    return { total, optional };
  }

  function totals(doc) {
    let total = 0, optional = 0;
    for (const s of doc.slides) { const t = slideTime(s); total += t.total; optional += t.optional; }
    return { total, optional };
  }

  // 형식 점검(수업 HTML 없이). errors는 고쳐야 하고 warnings는 살펴볼 것.
  function check(doc) {
    const errors = doc.errors.map((e) => `${e.lineNo}번째 줄: ${e.msg}`);
    const warnings = [];
    if (!doc.slides.length) errors.push('장이 하나도 없다. 장마다 "## 장id · 제목"으로 시작한다.');
    const seen = new Set();
    const mixNames = new Set(Object.values(doc.meta.화법 || {}));
    for (const s of doc.slides) {
      if (seen.has(s.id)) errors.push(`${s.id}: 같은 장이 두 번 나온다`);
      seen.add(s.id);
      const steps = s.blocks.slice(1).map((b) => b.step);
      steps.forEach((n, k) => { if (n !== k + 1) errors.push(`${s.id}: 단계 번호가 ▶1부터 차례로 이어지지 않는다(▶${n})`); });
      const lines = s.blocks.flatMap((b) => b.lines);
      if (!lines.some((l) => SPOKEN.has(l.kind) || l.kind === 'wait')) errors.push(`${s.id}: 할 말도 @대기도 없다`);
      for (const l of lines) {
        if (l.kind === 'beat') errors.push(`${s.id}: @비트가 남아 있다. 대사로 바꾼다(${l.lineNo}번째 줄)`);
        if (l.kind === 'ref' && !mixNames.has(l.instructor)) errors.push(`${s.id}: @참고의 '${l.instructor}'가 머리말 화법에 없다`);
      }
      const t = slideTime(s).total;
      if (t > LONG_SLIDE) warnings.push(`${s.id}: 이 장만 약 ${fmt(t)}. 장을 나누거나 줄일 곳을 살핀다`);
    }
    const { total } = totals(doc);
    const goal = doc.meta.minutes;
    if (Number.isFinite(goal) && goal > 0 && Math.abs(total - goal * 60) > goal * 60 * 0.25) warnings.push(`예상 ${fmt(total)} / 목표 ${goal}분. 25% 넘게 차이 난다`);
    return { errors, warnings };
  }

  // 엔진 12-nav.js·10-steps.js와 같은 규칙으로 → 키를 몇 번 누르는지 센다.
  // keys: 장 안의 .step 순서대로 data-step 숫자 또는 null. data-step이 같으면 한 번에 열린다.
  // ponytail: 엔진 규칙을 옮겨 왔다. 엔진의 단계 규칙이 바뀌면 여기도 고친다.
  function groupCount(keys) {
    const groups = new Set();
    let base = 0, n = 0;
    for (const v of keys) {
      if (typeof v === 'number' && Number.isFinite(v)) { base = v; n = 0; groups.add(v); } else { n += 1; groups.add(base + n * 1e-6); }
    }
    return groups.size;
  }

  // 단계 막대 칸 수: 엔진 51-stepper.js parseStops와 같다(첫 칸 '시작'은 빼고 센다).
  function stopCount(text) {
    const list = String(text || '').split('|').map((s) => s.replace(/<br\s*\/?>/gi, '\n').trim()).filter(Boolean);
    return list.length - (list[0] === '시작' ? 1 : 0);
  }

  // → 키가 .step보다 먼저 한 칸씩 여는 단계 막대(엔진 Stepper). data-nav="off"면 → 키와 따로다.
  function barStops(slide) {
    let n = 0;
    for (const el of slide.querySelectorAll('.reveal[data-stops], .switch[data-stops], figure.map-reveal[data-stops]')) if (el.dataset.nav !== 'off') n += stopCount(el.dataset.stops);
    for (const ol of slide.querySelectorAll('ol.yearline')) n += new Set([...ol.querySelectorAll(':scope > li[data-year]')].map((li) => Number(li.dataset.year)).filter(Number.isFinite)).size;
    return n;
  }

  // 수업 HTML(Document)에서 장 목록을 읽는다. 읽기만 하는 사본이라 고쳐도 된다.
  function deckFromDocument(html) {
    // 엔진 43-parts.js Answer와 똑같이: 안에 .step이 없는 정답 상자는 내용을 새 div.step으로 감싼다.
    for (const box of html.querySelectorAll('.answer')) {
      if (box.querySelector('.step')) continue;
      const wrap = html.createElement('div');
      wrap.className = 'step';
      wrap.append(...box.childNodes);
      box.append(wrap);
    }
    const slides = [...html.querySelectorAll('section')].filter((s) => s.classList.contains('slide')).map((s) => ({
      id: s.id,
      title: s.dataset.title || (s.querySelector('h1,h2') || {}).textContent || '',
      sec: s.dataset.sec || '',
      steps: groupCount([...s.querySelectorAll('.step')].map((el) => (el.dataset.step != null && el.dataset.step !== '' ? Number(el.dataset.step) : null))),
      bars: barStops(s),
    }));
    return { deck: html.documentElement.dataset.deck || '', title: html.title || '', slides };
  }

  // 대본과 수업 HTML의 장 id·순서·단계 수를 맞춘다.
  function compare(doc, deck) {
    const errors = [], warnings = [];
    const deckIds = deck.slides.map((s) => s.id);
    const byId = new Map(deck.slides.map((s) => [s.id, s]));
    const scriptIds = doc.slides.map((s) => s.id);
    if (deck.slides.some((s) => !s.id)) errors.push('수업 HTML에 id가 없는 장이 있다. 장마다 고정 id가 있어야 대본과 맞출 수 있다');
    for (const id of scriptIds) if (!byId.has(id)) errors.push(`${id}: 수업 HTML에 없는 장이다`);
    for (const s of deck.slides) if (s.id && !scriptIds.includes(s.id)) errors.push(`${s.id}: 대본에 없는 장이다(${s.title})`);
    const common = scriptIds.filter((id) => byId.has(id));
    const deckOrder = deckIds.filter((id) => scriptIds.includes(id));
    const at = common.findIndex((id, k) => id !== deckOrder[k]);
    if (at >= 0) errors.push(`장 순서가 수업 HTML과 다르다: ${at ? `${deckOrder[at - 1]} 다음에는 ` : '처음에는 '}${deckOrder[at]}이 와야 한다`);
    for (const s of doc.slides) {
      const d = byId.get(s.id);
      if (!d) continue;
      const k = s.blocks.length - 1;
      if (k !== d.steps) errors.push(`${s.id}: 대본의 단계는 ▶${k}개인데 수업 HTML의 단계(.step)는 ${d.steps}개다`);
      if (d.bars && !s.blocks.some((b) => b.lines.some((l) => l.kind === 'action'))) warnings.push(`${s.id}: 단계 막대가 → 키로 ${d.bars}칸 열린다. 막대를 여는 자리에 @조작을 쓴다`);
    }
    if (doc.meta.deck && deck.deck && doc.meta.deck !== deck.deck) warnings.push(`머리말 deck(${doc.meta.deck})과 수업 HTML의 data-deck(${deck.deck})이 다르다`);
    return { errors, warnings };
  }

  function aiMessage(result) {
    return ['대본 점검 결과입니다. 아래 항목만 고쳐서 대본 HTML 전체를 다시 주세요. 머리말과 장 id, ▶ 단계 규칙은 지침대로 지켜 주세요.', '',
      ...result.errors.map((e) => `- [오류] ${e}`), ...result.warnings.map((w) => `- [확인] ${w}`)].join('\n');
  }

  function fmt(sec) {
    const s = Math.round(sec);
    if (s < 60) return `${s}초`;
    const m = Math.floor(s / 60), r = s % 60;
    return r ? `${m}분 ${r}초` : `${m}분`;
  }

  const LectureScript = { parse, check, compare, groupCount, stopCount, deckFromDocument, slideTime, totals, units, speechSeconds, parseDuration, aiMessage, fmt };
  globalThis.LectureScript = LectureScript;
  if (typeof document === 'undefined') return;

  /* ───────────── 화면 ───────────── */
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    el.append(...children.flat().filter((c) => c != null && c !== false));
    return el;
  }
  // **굵게**만 살린다. 나머지는 글자 그대로.
  const rich = (text) => text.split(/\*\*(.+?)\*\*/g).map((part, k) => (k % 2 ? h('strong', { text: part }) : part));

  function lineView(l) {
    switch (l.kind) {
      case 'question': return h('p', { class: 'ls-line ls-q' }, h('span', { class: 'ls-tag', text: '질문' }), ...rich(l.text));
      case 'answer': return h('p', { class: 'ls-line ls-a' }, h('span', { class: 'ls-tag', text: '예상 답' }), ...rich(l.text));
      case 'wait': return h('p', { class: 'ls-line ls-wait' }, h('span', { class: 'ls-tag', text: `기다림 ${fmt(l.seconds)}` }), l.text);
      case 'cue': return h('p', { class: 'ls-line ls-cue', text: `(${l.text})` });
      case 'action': return h('p', { class: 'ls-line ls-act' }, h('span', { class: 'ls-tag', text: '조작' }), ...rich(l.text));
      case 'ref': return h('p', { class: 'ls-line ls-ref' }, h('span', { class: 'ls-tag', text: '참고' }), h('b', { text: l.instructor }), ` — ${l.technique}`);
      case 'optional': return h('p', { class: 'ls-line ls-opt' }, h('span', { class: 'ls-tag', text: l.reason ? `생략 가능 · ${l.reason}` : '생략 가능' }), ...rich(l.text));
      case 'beat': return h('p', { class: 'ls-line ls-beat' }, h('span', { class: 'ls-tag', text: '비트' }), l.text);
      default: return h('p', { class: 'ls-line ls-say' }, ...rich(l.text));
    }
  }

  let doc = null;
  let deck = null;
  const ui = {};

  function render() {
    const { meta, slides } = doc;
    const t = totals(doc);
    const mix = Object.entries(meta.화법 || {});
    let acc = 0;
    const deckById = deck ? new Map(deck.slides.map((s) => [s.id, s])) : null;
    ui.slides.replaceChildren(...slides.map((s, k) => {
      const st = slideTime(s).total;
      acc += st;
      const d = deckById && deckById.get(s.id);
      return h('section', { class: 'ls-slide', id: `ls-${s.id}` },
        h('header', { class: 'ls-slide-head' },
          h('span', { class: 'ls-no', text: `${k + 1}/${slides.length}` }),
          h('code', { class: 'ls-id', text: s.id }),
          h('h2', { text: s.title || (d && d.title) || s.id }),
          h('span', { class: 'ls-time', text: `약 ${fmt(st)} · 누적 ${fmt(acc)}` }),
          d && d.steps + d.bars ? h('span', { class: 'ls-keys', text: `→ ${d.steps + d.bars}번${d.bars ? ` (단계 ${d.steps} · 막대 ${d.bars}칸)` : ''}` }) : null),
        d && d.sec ? h('p', { class: 'ls-sec', text: d.sec }) : null,
        ...s.blocks.map((b) => h('div', { class: b.step ? 'ls-step' : 'ls-open' },
          b.step ? h('span', { class: 'ls-step-chip', text: `▶${b.step}` }) : null,
          ...b.lines.map(lineView))));
    }));
    ui.summary.replaceChildren(...[
      `예상 ${fmt(t.total)}`,
      Number.isFinite(meta.minutes) && `목표 ${meta.minutes}분`,
      t.optional > 0 && `생략 가능 대사를 빼면 ${fmt(t.total - t.optional)}`,
      `${slides.length}장`,
      meta.deck && `수업 HTML ${meta.deck}`,
      meta.level,
    ].filter(Boolean).map((text) => h('span', { class: 'ls-chip', text })));
    ui.mix.hidden = !mix.length;
    ui.mix.replaceChildren(h('caption', { text: '화법 배정' }), ...mix.map(([k, v]) => h('tr', {}, h('th', { scope: 'row', text: k }), h('td', { text: v }))));
    runCheck(false);
  }

  function runCheck(open) {
    const a = check(doc);
    const b = deck ? compare(doc, deck) : { errors: [], warnings: [] };
    const result = { errors: [...a.errors, ...b.errors], warnings: [...a.warnings, ...b.warnings] };
    const n = result.errors.length + result.warnings.length;
    ui.checkBtn.textContent = n ? `점검 ${n}` : '점검';
    ui.checkBtn.classList.toggle('is-bad', result.errors.length > 0);
    ui.panelList.replaceChildren(...(n ? [...result.errors.map((e) => h('li', { class: 'is-error', text: e })), ...result.warnings.map((w) => h('li', { class: 'is-warn', text: w }))]
      : [h('li', { class: 'is-ok', text: deck ? '수업 HTML과 장·단계가 모두 맞습니다.' : '형식 오류가 없습니다. 수업 HTML을 불러오면 장과 단계도 맞춰 봅니다.' })]));
    ui.panelNote.textContent = deck ? `맞춰 본 수업 HTML: ${deck.title || deck.deck || '불러온 파일'} (${deck.slides.length}장)` : '수업 HTML을 아직 불러오지 않았습니다.';
    ui.copyBtn.hidden = !n;
    ui.copyBtn.onclick = async () => {
      try { await navigator.clipboard.writeText(aiMessage(result)); ui.copyBtn.textContent = '복사했습니다'; } catch { ui.copyBtn.textContent = '복사하지 못했습니다'; }
      setTimeout(() => { ui.copyBtn.textContent = 'AI에게 보낼 말 복사'; }, 2000);
    };
    if (open) ui.panel.hidden = false;
    ui.checkBtn.setAttribute('aria-expanded', String(!ui.panel.hidden));
  }

  async function loadDeck(file) {
    if (!file) return;
    if (!/\.html?$/i.test(file.name)) { ui.panelNote.textContent = 'HTML 파일을 골라 주세요.'; ui.panel.hidden = false; return; }
    let text;
    try { text = await file.text(); } catch { ui.panelNote.textContent = '파일을 읽지 못했습니다.'; ui.panel.hidden = false; return; }
    const html = new DOMParser().parseFromString(text, 'text/html');
    deck = deckFromDocument(html);
    if (!deck.slides.length) { deck = null; ui.panelNote.textContent = '이 파일에서 장(section.slide)을 찾지 못했습니다.'; ui.panel.hidden = false; return; }
    render();
    runCheck(true);
  }

  function boot() {
    const src = document.getElementById('lecture-script') || document.querySelector('script[type="text/markdown"]');
    const app = h('div', { class: 'ls-app' });
    document.body.append(app);
    if (!src) { app.append(h('p', { class: 'ls-empty', text: '대본이 없습니다. <script type="text/markdown" id="lecture-script"> 안에 대본을 넣어 주세요.' })); return; }
    doc = parse(src.textContent);
    if (doc.meta.title && !document.title.trim()) document.title = doc.meta.title;
    const fileInput = h('input', { type: 'file', accept: '.html,.htm,text/html', class: 'ls-file', onchange: (e) => { loadDeck(e.target.files[0]); e.target.value = ''; } });
    ui.checkBtn = h('button', { type: 'button', 'aria-expanded': 'false', onclick: () => { ui.panel.hidden = !ui.panel.hidden; ui.checkBtn.setAttribute('aria-expanded', String(!ui.panel.hidden)); } });
    ui.copyBtn = h('button', { type: 'button', class: 'ls-primary', text: 'AI에게 보낼 말 복사' });
    ui.panelList = h('ul');
    ui.panelNote = h('p', { class: 'ls-note' });
    ui.panel = h('section', { class: 'ls-panel', hidden: true, 'aria-label': '대본 점검' }, h('h2', { text: '대본 점검' }), ui.panelNote, ui.panelList, ui.copyBtn);
    ui.summary = h('div', { class: 'ls-summary' });
    ui.mix = h('table', { class: 'ls-mix' });
    ui.slides = h('div', { class: 'ls-slides' });
    app.append(
      h('nav', { class: 'ls-toolbar', 'aria-label': '대본 도구' },
        ui.checkBtn,
        h('label', { class: 'ls-button' }, '수업 HTML 불러오기', fileInput),
        h('button', { type: 'button', onclick: () => window.print(), text: '인쇄 · PDF' })),
      ui.panel,
      h('header', { class: 'ls-head' }, h('p', { class: 'ls-kicker', text: '수업 대본' }), h('h1', { text: doc.meta.title || document.title || '수업 대본' }), ui.summary, ui.mix,
        h('p', { class: 'ls-legend' }, '시간은 보통 속도(분당 290음절)로 센 추정값입니다. ', h('span', { class: 'ls-tag', text: '질문' }), ' 학생에게 묻기 ', h('span', { class: 'ls-tag ls-tag-act', text: '조작' }), ' 화면 조작 ', h('span', { class: 'ls-tag ls-tag-wait', text: '기다림' }), ' 생각·필기 시간 ', h('span', { class: 'ls-legend-cue', text: '(연출)' }), ' 표정·동작')),
      ui.slides);
    render();
    if (check(doc).errors.length) ui.panel.hidden = false;
    document.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('ls-drag'); });
    document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('ls-drag'); });
    document.addEventListener('drop', (e) => { e.preventDefault(); document.body.classList.remove('ls-drag'); loadDeck(e.dataTransfer.files[0]); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
