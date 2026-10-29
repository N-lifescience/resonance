/*! lecture-script viewer | © N-lifescience | https://github.com/N-lifescience/resonance */
/* 공명 대본 뷰어. 대본 HTML 안의 <script type="text/markdown" id="lecture-script">를 읽어 그린다.
   시간 계산, 형식 점검, 수업 HTML과 장·단계 맞추기, 인쇄, 편집(글을 그 자리에서 고치고 HTML로 저장)을 맡는다.
   수업 엔진(exploragram)과는 따로다. 대본 글은 textContent로만 그리고, 불러온 수업 HTML은 DOMParser로 읽기만 한다(실행하지 않는다). */
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
    let titleLine = 0;   // 머리말 title: 줄 번호(편집에서 제목을 고칠 때 쓴다)
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
        if (!indent && key.trim() === 'title') titleLine = i + 1;
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
    return { meta, slides, errors, titleLine };
  }

  // 편집: lineNo번째 줄의 글만 text로 바꾼다. 태그(@질문 등), @대기의 시간, @참고의 강사 이름, 장 id는 그대로 둔다.
  // kind: 'line'(대사·태그 줄) | 'slide'(## 장 제목) | 'title'(머리말 title). 줄 수는 바뀌지 않는다(대사를 비우면 빈 줄이 되어 빠진다).
  function editLine(md, lineNo, text, kind = 'line') {
    const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
    const raw = lines[lineNo - 1];
    if (raw == null) return lines.join('\n');
    const indent = raw.match(/^\s*/)[0];
    const t = raw.trim();
    const clean = String(text).replace(/\s+/g, ' ').trim();
    let next = t;
    if (kind === 'title') next = `title: ${clean}`;
    else if (kind === 'slide') {
      const m = /^(##\s+[^\s·|▶]+)/.exec(t);
      if (m) next = clean ? `${m[1]} · ${clean}` : m[1];
    } else if (!t.startsWith('@')) {
      next = clean.replace(/^[@#]/, (c) => (c === '@' ? '＠' : '＃'));   // 대사가 태그나 제목으로 읽히지 않게
    } else {
      const head = /^@[^\s(]+(?:\([^)]*\))?/.exec(t)[0];
      const rest = t.slice(head.length).trim();
      if (head === '@대기') {
        const d = /^(\d+\s*분(?:\s*\d+\s*초)?|\d+\s*초|\d+)/.exec(rest);
        next = `${head} ${d ? d[1] : rest}${clean ? ` ${clean}` : ''}`;
      } else if (head === '@참고') next = `${head} ${rest.split('|')[0].trim()} | ${clean}`;
      else next = `${head} ${clean}`;
    }
    lines[lineNo - 1] = indent + next;
    return lines.join('\n');
  }

  // 대본 글을 <script> 안에 다시 넣을 때 </script>로 끊기지 않게 한다.
  const scriptSafe = (md) => String(md).replace(/<\/(script)/gi, '<\\/$1');

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

  const LectureScript = { parse, check, compare, groupCount, stopCount, deckFromDocument, slideTime, totals, units, speechSeconds, parseDuration, aiMessage, fmt, editLine, scriptSafe };
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
  // 편집 모드에서 고칠 수 있는 글. data-line은 대본 MD의 줄 번호다.
  const editable = (lineNo, kind, ...children) => h('span', { class: 'ls-text', 'data-line': lineNo, 'data-kind': kind }, ...children);
  const say = (l, text = l.text) => editable(l.lineNo, 'line', ...rich(text));

  function lineView(l) {
    switch (l.kind) {
      case 'question': return h('p', { class: 'ls-line ls-q' }, h('span', { class: 'ls-tag', text: '질문' }), say(l));
      case 'answer': return h('p', { class: 'ls-line ls-a' }, h('span', { class: 'ls-tag', text: '예상 답' }), say(l));
      case 'wait': return h('p', { class: 'ls-line ls-wait' }, h('span', { class: 'ls-tag', text: `기다림 ${fmt(l.seconds)}` }), say(l));
      case 'cue': return h('p', { class: 'ls-line ls-cue' }, '(', say(l), ')');
      case 'action': return h('p', { class: 'ls-line ls-act' }, h('span', { class: 'ls-tag', text: '조작' }), say(l));
      case 'ref': return h('p', { class: 'ls-line ls-ref' }, h('span', { class: 'ls-tag', text: '참고' }), h('b', { text: l.instructor }), ' — ', say(l, l.technique));
      case 'optional': return h('p', { class: 'ls-line ls-opt' }, h('span', { class: 'ls-tag', text: l.reason ? `생략 가능 · ${l.reason}` : '생략 가능' }), say(l));
      case 'beat': return h('p', { class: 'ls-line ls-beat' }, h('span', { class: 'ls-tag', text: '비트' }), say(l));
      default: return h('p', { class: 'ls-line ls-say' }, say(l));
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
          h('h2', {}, editable(s.lineNo, 'slide', s.title || (d && d.title) || s.id)),
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
    markEditable();
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

  /* ── 편집: 수업 HTML의 편집 모드처럼 글을 눌러 그 자리에서 고치고, 고친 대본을 HTML 파일로 받는다 ── */
  const CDN = 'https://cdn.jsdelivr.net/gh/N-lifescience/resonance@2/script-viewer/';
  let md = '';
  let editing = false;
  let dirty = false;

  // 고치는 글의 지금 내용을 대본 글로 되돌린다. 굵게(<strong>)는 **로 감싼다.
  function textOf(el) {
    let out = '';
    for (const n of el.childNodes) {
      if (n.nodeType === 3) out += n.nodeValue;
      else if (n.nodeName === 'BR') out += ' ';
      else if (n.nodeName === 'STRONG' || n.nodeName === 'B') out += n.textContent ? `**${n.textContent}**` : '';
      else out += textOf(n);
    }
    return out;
  }

  function markEditable() {
    for (const el of document.querySelectorAll('.ls-app .ls-text')) {
      if (!editing) { el.removeAttribute('contenteditable'); continue; }
      el.setAttribute('contenteditable', 'plaintext-only');
      if (el.contentEditable !== 'plaintext-only') el.setAttribute('contenteditable', 'true');
      el.spellcheck = false;
    }
  }

  function syncEditBar(note) {
    ui.editBtn.textContent = editing ? '편집 끝내기' : '편집';
    ui.editBtn.setAttribute('aria-pressed', String(editing));
    ui.saveBtn.hidden = !editing && !dirty;
    // 안내는 문장마다 끊어 붙인다. 좁은 화면에서도 「HTML 저장」 같은 단추 이름이 문장 안에서 갈라지지 않는다.
    if (note != null) ui.editNote.replaceChildren(...note.split(/(?<=\.) /).filter(Boolean).flatMap((s, k) => [k ? ' ' : '', h('span', { text: s })]));
    ui.editNote.hidden = !ui.editNote.textContent;
  }

  function setEditing(next) {
    if (next === editing) return;
    document.activeElement?.closest?.('.ls-text')?.blur();
    editing = next;
    document.body.classList.toggle('ls-editing', editing);
    if (editing) markEditable(); else render();   // 끝낼 때 다시 그려 시간과 빈 줄을 맞춘다
    syncEditBar(editing ? '글을 눌러 바로 고치세요. 다 고쳤으면 「HTML 저장」을 누르세요.'
      : dirty ? '고친 내용을 아직 저장하지 않았습니다. 「HTML 저장」을 누르세요.' : '');
  }

  // 글자를 칠 때마다 대본 MD에 옮긴다. 화면은 다시 그리지 않는다(커서가 그대로 있게). 시간은 편집을 끝낼 때 다시 센다.
  let titleSynced = false;   // <title>이 머리말 제목과 같았으면 제목을 고칠 때 함께 바꾼다
  function apply(el) {
    const text = textOf(el).replace(/\s+/g, ' ').trim();
    md = editLine(md, Number(el.dataset.line), text, el.dataset.kind);
    doc = parse(md);
    if (el.dataset.kind === 'title' && titleSynced) document.title = text;
    if (!dirty) { dirty = true; syncEditBar(); }
  }

  // 지금 문서에서 뷰어가 그린 화면을 빼고 고친 대본을 넣는다. 사이트처럼 뷰어를 상대 주소로 불렀으면 CDN 주소로 바꿔 내려받은 파일도 열리게 한다.
  function exportHTML() {
    const root = document.documentElement.cloneNode(true);
    root.querySelectorAll('.ls-app, .ls-toolbar').forEach((el) => el.remove());
    const body = root.querySelector('body');
    body.classList.remove('ls-drag', 'ls-editing');
    if (!body.classList.length) body.removeAttribute('class');
    const box = root.querySelector('#lecture-script') || root.querySelector('script[type="text/markdown"]');
    box.textContent = `\n${scriptSafe(md.replace(/^\n+|\n+$/g, ''))}\n`;
    for (const el of root.querySelectorAll('link[href], script[src]')) {
      const attr = el.hasAttribute('href') ? 'href' : 'src';
      const m = /(?:^|\/)script-viewer\/(viewer\.(?:css|js))$/.exec(el.getAttribute(attr));
      if (m && !/^https?:/i.test(el.getAttribute(attr))) el.setAttribute(attr, CDN + m[1]);
    }
    return `<!doctype html>\n${root.outerHTML}\n`;
  }

  function fileName() {
    let last = '';
    try { last = decodeURIComponent(location.pathname.split('/').pop() || ''); } catch { /* 이상한 주소면 제목으로 */ }
    const name = /\.html?$/i.test(last) ? last : `${(doc.meta.title || document.title || '수업 대본').trim()}.html`;
    return name.replace(/[\\/:*?"<>|]+/g, '-');
  }

  function save() {
    document.activeElement?.closest?.('.ls-text')?.blur();
    const name = fileName();
    const url = URL.createObjectURL(new Blob([exportHTML()], { type: 'text/html;charset=utf-8' }));
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    dirty = false;
    syncEditBar(`${name} 파일로 저장했습니다. 원래 대본 파일 대신 내려받은 파일을 쓰세요.`);
  }

  function bindEditing(app) {
    titleSynced = document.title.trim() === (doc.meta.title || '').trim();
    app.addEventListener('focusin', (e) => { const el = e.target.closest('.ls-text'); if (editing && el) el.dataset.before = textOf(el); });
    app.addEventListener('input', (e) => { const el = e.target.closest('.ls-text'); if (editing && el) apply(el); });
    app.addEventListener('focusout', (e) => { const el = e.target.closest('.ls-text'); if (el) { delete el.dataset.before; runCheck(false); } });
    app.addEventListener('keydown', (e) => {
      const el = e.target.closest('.ls-text');
      if (!editing || !el) return;
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); el.blur(); }
      if (e.key === 'Escape' && el.dataset.before != null) { el.replaceChildren(...rich(el.dataset.before)); apply(el); el.blur(); }   // 이 글을 고치기 전으로
    });
    app.addEventListener('paste', (e) => {
      if (!editing || !e.target.closest('.ls-text')) return;
      e.preventDefault();   // 다른 곳의 글꼴·줄바꿈이 따라 들어오지 않게 글만 한 줄로 붙인다
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\s+/g, ' '));
    });
    document.addEventListener('keydown', (e) => {
      if ((editing || dirty) && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    });
    window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  }

  function boot() {
    const src = document.getElementById('lecture-script') || document.querySelector('script[type="text/markdown"]');
    const app = h('div', { class: 'ls-app' });
    document.body.append(app);
    if (!src) { app.append(h('p', { class: 'ls-empty', text: '대본이 없습니다. <script type="text/markdown" id="lecture-script"> 안에 대본을 넣어 주세요.' })); return; }
    md = src.textContent;
    doc = parse(md);
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
    ui.editBtn = h('button', { type: 'button', class: 'ls-edit', 'aria-pressed': 'false', onclick: () => setEditing(!editing) });
    ui.saveBtn = h('button', { type: 'button', class: 'ls-save', text: 'HTML 저장', title: 'Ctrl+S', hidden: true, onclick: save });
    ui.editNote = h('p', { class: 'ls-edit-note', role: 'status', 'aria-live': 'polite', hidden: true });
    const title = doc.meta.title || document.title || '수업 대본';
    // 툴바는 본문 위에 붙여 둔다(sticky). 단추가 몇 줄로 접혀도 대본 글을 가리지 않는다.
    document.body.insertBefore(h('nav', { class: 'ls-toolbar', 'aria-label': '대본 도구' },
      ui.editBtn,
      ui.saveBtn,
      ui.checkBtn,
      h('label', { class: 'ls-button' }, '수업 HTML 불러오기', fileInput),
      h('button', { type: 'button', onclick: () => window.print(), text: '인쇄 · PDF' }),
      ui.editNote), app);
    app.append(
      ui.panel,
      h('header', { class: 'ls-head' }, h('p', { class: 'ls-kicker', text: '수업 대본' }), h('h1', {}, doc.titleLine ? editable(doc.titleLine, 'title', title) : title), ui.summary, ui.mix,
        h('p', { class: 'ls-legend' }, '시간은 보통 속도(분당 290음절)로 센 추정값입니다. ', h('span', { class: 'ls-tag', text: '질문' }), ' 학생에게 묻기 ', h('span', { class: 'ls-tag ls-tag-act', text: '조작' }), ' 화면 조작 ', h('span', { class: 'ls-tag ls-tag-wait', text: '기다림' }), ' 생각·필기 시간 ', h('span', { class: 'ls-legend-cue', text: '(연출)' }), ' 표정·동작')),
      ui.slides);
    render();
    syncEditBar();
    bindEditing(app);
    if (check(doc).errors.length) ui.panel.hidden = false;
    document.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('ls-drag'); });
    document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('ls-drag'); });
    document.addEventListener('drop', (e) => { e.preventDefault(); document.body.classList.remove('ls-drag'); loadDeck(e.dataTransfer.files[0]); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
