// Run directly: node lite/test/parse.test.mjs (Node built-ins only, no browser).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { parseLesson, renderLesson, paginateLesson, css } from '../lite.js';

const require = createRequire(import.meta.url);
assert.equal(require('../lite.js').parseLesson, parseLesson);
let passed = 0;
function test(name, run) {
  try { run(); passed++; console.log('ok ' + passed + ' - ' + name); }
  catch (error) { console.error('FAIL - ' + name); throw error; }
}
function decode(s) {
  return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
// Small HTML inspection helper, not a replacement for browser layout checks.
// Quoted > signs and SVG self-closing tags are handled explicitly.
function nodes(html) {
  const list = [], stack = [];
  const tags = /<\s*(\/?)\s*([a-z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  for (const m of html.matchAll(tags)) {
    const tag = m[2].toLowerCase();
    if (m[1]) {
      assert.equal(stack.pop()?.tag, tag, 'balanced HTML: ' + m[0]);
      continue;
    }
    const attrs = {};
    for (const a of m[3].matchAll(/([^\s=/'">]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[a[1]] = decode(a[2] ?? a[3] ?? a[4] ?? '');
    const node = { tag, attrs, parent: stack[stack.length - 1] || null };
    list.push(node);
    if (!/\/$/.test(m[3].trim()) && !['img', 'input', 'meta', 'link', 'br', 'hr'].includes(tag)) stack.push(node);
  }
  assert.equal(stack.length, 0, 'all HTML tags close');
  return list;
}
function hasClass(node, name) { return (node.attrs.class || '').split(/\s+/).includes(name); }
function closest(node, name) { while (node) { if (hasClass(node, name)) return node; node = node.parent; } return null; }
function data(html, name) { return nodes(html).filter(n => Object.hasOwn(n.attrs, name)).map(n => n.attrs[name]); }
function readLesson(name) {
  const source = readFileSync(new URL('../examples/' + name + '.html', import.meta.url), 'utf8');
  const text = source.match(/<script type="text\/x-lesson">([\s\S]*?)<\/script>/)[1];
  return { source, text, parsed: parseLesson(text), html: renderLesson(text) };
}
const all = readLesson('all-parts'), ion = readLesson('ion-3-1');

// Use the actual engine expression parser to verify compatibility without DOM,
// external packages, eval of lesson input, or launching Chrome.
const engine = readFileSync(new URL('../../engine/exploragram.js', import.meta.url), 'utf8');
const sandbox = {};
const start = engine.indexOf('/* ---- 50-expr.js ---- */'), end = engine.indexOf('/* ---- 51-stepper.js ---- */');
assert(start > 0 && end > start);
vm.runInNewContext(engine.slice(start, end) + '\nglobalThis.expr = Expr;', sandbox);
const Expr = sandbox.expr;
function evaluate(expr, scope) {
  const compiled = Expr.compile(expr);
  assert.equal(compiled.ok, true, expr + ': ' + compiled.error);
  const value = compiled.fn(scope);
  if (typeof value === 'number') assert(Number.isFinite(value), expr + ' must be finite');
  return value;
}
function assignments(src, scope) {
  const parsed = Expr.lets(src || '');
  assert.equal(parsed.ok, true, src + ': ' + parsed.error);
  for (const item of parsed.list) scope[item.name] = item.fn(scope);
}
function calcScope(calc, list, endState = false, overrides = {}) {
  const own = list.filter(n => closest(n, 'calc') === calc);
  const scope = {};
  assignments(calc.attrs['data-const'], scope);
  for (const node of own) {
    const a = node.attrs;
    if (node.tag === 'input' && a.name) scope[a.name] = Number(endState ? a.max : a.value);
    if (a['data-name'] && a['data-stops']) scope[a['data-name']] = endState ? a['data-stops'].split('|').length - 1 : 0;
    if (a['data-count']) {
      const [l, r] = a['data-count'].split(',').map(s => s.trim());
      scope[l] = Number(a['data-left']); scope[r] = Number(a['data-right']);
    }
  }
  const groupNames = [...new Set(own.map(n => n.attrs['data-set']).filter(Boolean))];
  for (const name of groupNames) {
    const group = own.filter(n => n.attrs['data-set'] === name);
    const initial = group.find(n => n.attrs['aria-pressed'] === 'true') || group[0];
    scope[name] = Number((endState ? group[group.length - 1] : initial).attrs['data-value']);
  }
  Object.assign(scope, overrides);
  assignments(calc.attrs['data-let'], scope);
  return scope;
}
function verifyCalcs(html) {
  const list = nodes(html);
  const calcs = list.filter(n => hasClass(n, 'calc'));
  for (const calc of calcs) {
    const own = list.filter(n => closest(n, 'calc') === calc);
    const controls = own.filter(n => Object.hasOwn(n.attrs, 'data-set'));
    const combinations = [{}, ...controls.map(n => ({ [n.attrs['data-set']]: Number(n.attrs['data-value']) }))];
    for (const end of [false, true]) for (const overrides of combinations) {
      const scope = calcScope(calc, list, end, overrides);
      for (const n of own) {
        const a = n.attrs;
        for (const key of ['data-show', 'data-expr', 'data-left', 'data-right', 'data-pass']) if (Object.hasOwn(a, key)) evaluate(a[key], scope);
        if (a['data-attr']) for (const part of a['data-attr'].split(';')) evaluate(part.slice(part.indexOf(':') + 1), scope);
        if (hasClass(n, 'bar')) { evaluate(a['data-value'], scope); evaluate(a['data-max'], scope); }
        if (a['data-line']) for (const x of [0, 0.5, 10]) evaluate(a['data-line'], { ...scope, x });
        if (a['data-point']) for (const expr of a['data-point'].split(',')) evaluate(expr, scope);
        if (n.tag === 'i' && a['data-x']) {
          // A comma inside max(...) belongs to the upper bound.
          const comma = a['data-x'].indexOf(',');
          evaluate(a['data-x'].slice(0, comma), scope); evaluate(a['data-x'].slice(comma + 1), scope);
        }
      }
    }
  }
  return { list, calcs };
}

test('pure API works through both named import and require', () => {
  assert.deepEqual(parseLesson(''), { settings: { accent: '', deck: '' }, slides: [], warnings: [] });
  assert.equal(renderLesson(null), '');
  const text = '# 제목\n문장';
  assert.deepEqual(parseLesson(text), parseLesson(text));
  assert.equal(renderLesson(text), renderLesson(text));
});
test('settings, covers, chapter titles, grouping and sequential IDs', () => {
  const p = parseLesson('색: #568A35\n덱: sci-2-ion\n# [표지] 전하\n첫 줄\n버릴 줄\n[묶음] 생각 열기\n# 물음\n글\n# [장표지] 2. 이온의 이동\n# 이동\n[묶음] 정리\n# 마지막');
  assert.equal(p.settings.accent, '#568A35'); assert.equal(p.settings.deck, 'sci-2-ion');
  assert.deepEqual(p.slides.map(s => s.id), ['s1', 's2', 's3', 's4', 's5']);
  assert.equal(p.slides[0].type, 'cover'); assert.equal(p.slides[0].blocks.length, 1);
  assert.equal(p.slides[1].section, '생각 열기'); assert.equal(p.slides[3].section, '2. 이온의 이동'); assert.equal(p.slides[4].section, '정리');
  const html = renderLesson('색: #f00\n# [표지] 전하\n첫 줄\n버릴 줄\n# [장표지] 2. 이온의 이동');
  assert(html.includes('<div class="band"><p class="kicker">첫 줄</p></div><h1>전하</h1>'));
  assert(!html.includes('버릴 줄')); assert(html.includes('<p class="kicker">2</p><h1>이온의 이동</h1>'));
  assert(!parseLesson('색: red; color:black\n# 제목').settings.accent);
});
test('full-width punctuation, bullets, CRLF and both arrows', () => {
  const p = parseLesson('  ＃ ［표지］ 표지\r\n 소개 \r\n＃ 제목\r\n－ 문단\r\n• 둘\r\n· 셋\r\n＞ 단계\r\n-> 둘째\r\n→ 셋째\r\n［꼬리표］ 띠\r\n｜가｜나｜\r\n｜－ー｜값｜');
  assert.equal(p.slides.length, 2);
  assert.deepEqual(p.slides[1].blocks.slice(0, 6).map(b => b.type), ['paragraph', 'paragraph', 'paragraph', 'step', 'step', 'step']);
  assert.equal(p.slides[1].blocks[6].type, 'kicker'); assert.equal(p.slides[1].blocks[7].type, 'table');
  assert.equal(parseLesson('＃ 제목\n［퀴즈］ 물음\n＊ 맞음\n－ 틀림').slides[0].blocks[0].type, 'quiz');
});
test('paragraphs, steps, both Q forms, both answers, kicker and AI', () => {
  const html = renderLesson('# 제목\n문장\n- 항목\n> 열기\nQ. 하나\nQ 둘\n답: 하나\nA. 둘\n[꼬리표] 확인\n[AI] 새 글');
  for (const expected of ['<p>문장</p>', '<p>항목</p>', '<p class="step">열기</p>', '<p class="q" data-n="Q">하나</p>', '<p class="q" data-n="Q">둘</p>', '<div class="answer"><p>하나</p></div>', '<div class="answer"><p>둘</p></div>', '<p class="kicker">확인</p>', '<p data-ai="AI 작성">새 글</p>']) assert(html.includes(expected), expected);
});
test('inline marks escape HTML and attribute injection', () => {
  const html = renderLesson('# <제목>\n<svg onload="oops"> & {정답} **굵게** ==형광==\n[그림 7-4] "><script>alert(1)</script>');
  assert(html.includes('&lt;svg onload=&quot;oops&quot;&gt; &amp;'));
  assert(html.includes('<span class="blank">정답</span> <b>굵게</b> <mark>형광</mark>'));
  assert(!html.includes('<script>')); assert(!nodes(html).some(n => Object.keys(n.attrs).some(k => /^on/.test(k))));
});
test('unknown lines remain paragraphs, including unknown activity lines', () => {
  assert(renderLesson('알 수 없는 줄\n[없는 부품] 그대로').includes('<p>[없는 부품] 그대로</p>'));
  const p = parseLesson('# 제목\n[고르기]\n값: 수\n- 가 = 0 | 처음\n모르는 설정\n[AI] 마지막');
  assert.equal(p.warnings[0].line, 5);
  assert.equal(p.slides[0].blocks[1].text, '모르는 설정');
  assert(renderLesson('# 제목\n[고르기]\n모르는 설정').includes('<p>모르는 설정</p>'));
});
test('activity blocks end at blanks, headings and the next marker without blanks', () => {
  const p = parseLesson('# 첫째\n[퀴즈] 물음\n* 정답\n- 오답\n[분류] 가|나\n- 카드 = 가\n[순서] 순서\n- 먼저\n- 나중\n# 둘째\n[단계] 과정\n- 처음|문장\n\n보통 문장');
  assert.deepEqual(p.slides[0].blocks.map(b => b.type), ['quiz', 'sort', 'order']);
  assert.deepEqual(p.slides[1].blocks.map(b => b.type), ['stages', 'paragraph']);
});
test('tables use a header row, row headings, and discard separators', () => {
  const html = renderLesson('# 표\n|이온|전하|\n|---|:---:|\n|Na⁺|+1|\n|Cl⁻|−1|');
  assert(html.includes('<table class="compare"><thead><tr><th>이온</th><th>전하</th></tr></thead><tbody><tr><th>Na⁺</th><td>+1</td>'));
  assert(!html.includes('---')); assert.equal(nodes(html).filter(n => n.tag === 'tr').length, 3);
});
test('figures, two columns, stacked pairs, grid and figure-only placement', () => {
  const single = renderLesson('# 그림\n[그림 7-4] 설명');
  assert(single.includes('<figure class="fig"><img data-ppt="7-4" alt="설명"><figcaption>설명</figcaption></figure>'));
  assert(single.includes('lite-figure-only')); assert(!single.includes('lite-cols'));
  const pair = renderLesson('# 그림\n문단\n[그림 1-1] 하나\n[그림 1-2] 둘');
  assert(pair.includes('class="lite-cols"')); assert(pair.includes('lite-pictures lite-two'));
  assert(renderLesson('# 그림\n문단\n[그림 1-1] 가\n[그림 1-2] 나\n[그림 1-3] 다').includes('lite-pictures lite-many'));
  assert(css.includes('.fig img[hidden]{display:none !important}')); assert(css.includes('max-height:300px')); assert(css.includes('max-height:200px')); assert(css.includes('max-height:460px'));
});
test('videos accept HTTP(S) URLs and preserve invalid lines as text', () => {
  const html = renderLesson('# 영상\n[영상] https://example.test/watch?v=1&x=2 | 제목\n[영상] javascript:alert(1)');
  assert(html.includes('<div class="video" data-youtube="https://example.test/watch?v=1&amp;x=2" data-title="제목"></div>'));
  assert(html.includes('<p>[영상] javascript:alert(1)</p>'));
});
test('quiz shuffle is deterministic and correct positions vary by question', () => {
  const positions = new Set();
  for (let i = 0; i < 20; i++) {
    const text = '# 확인\n[퀴즈] 물음 ' + i + '\n- 오답 하나 | 이유\n* 정답 | 맞다\n- 오답 둘\n- 오답 셋';
    assert.equal(renderLesson(text), renderLesson(text));
    const opts = nodes(renderLesson(text)).filter(n => hasClass(n, 'opt'));
    positions.add(opts.findIndex(n => Object.hasOwn(n.attrs, 'data-ok')));
    assert.equal(opts.filter(n => Object.hasOwn(n.attrs, 'data-ok')).length, 1);
    assert(opts.every(n => Object.hasOwn(n.attrs, 'data-why')));
  }
  assert(positions.size > 1);
  const many = renderLesson('# 확인\n[퀴즈] 모두 고르자\n* 가\n- 나\n* 다\n- 라\n- 마');
  assert(many.includes('data-cols="2"')); assert(many.includes('data-multi'));
});
test('sort categories, reasons and hints match the target bins', () => {
  const html = renderLesson('# 분류\n[분류] 양이온 | 음이온\n- Na⁺ = 양이온 | 전자를 잃음\n- Cl⁻ = 음이온 | 전자를 얻음');
  assert(html.includes('<div class="bin" data-bin="b1"><h3>양이온</h3></div>'));
  assert(html.includes('<span data-bin="b2" data-why="전자를 얻음" data-hint="칸 이름의 특징을 다시 보자.">Cl⁻</span>'));
});
test('order preserves the written correct order and optional reasons', () => {
  const html = renderLesson('# 순서\n[순서] 해 보자\n- 먼저 | 이유\n- 다음');
  assert(html.includes('<ol class="order"><li data-why="이유">먼저</li><li data-why="">다음</li></ol>'));
});
test('drift uses numeric groups, switch, playback and exact drawn counts', () => {
  const { list, calcs } = verifyCalcs(all.html);
  const drift = calcs.find(n => hasClass(n, 'lite-drift'));
  const begin = calcScope(drift, list), end = calcScope(drift, list, true);
  assert.equal(begin.p, 0); assert.equal(begin.nL, 0); assert.equal(begin.nR, 0);
  assert.equal(end.p, 1); assert.equal(end.nL, 2); assert.equal(end.nR, 4);
  const group = list.find(n => n.tag === 'g' && n.attrs['data-show'] === 'sol == 2');
  const circles = list.filter(n => n.tag === 'circle' && n.parent === group);
  assert.equal(circles.length, 6);
  assert.equal(circles.filter(n => n.attrs.fill === '#DC2626').length, end.nL);
  assert.equal(circles.filter(n => n.attrs.fill === '#2563EB').length, end.nR);
  assert(all.html.includes('data-play="5"')); assert(all.html.includes('data-value="0" aria-pressed="true"'));
});
test('one drift choice and absent switch become constants; all five directions work', () => {
  const html = renderLesson('# 움직임\n[끌려가기]\n고르기: 입자 = 가 왼쪽 1, 나 오른쪽 1, 다 위 1, 라 아래 1, 마 그대로 1');
  const { list, calcs } = verifyCalcs(html);
  assert(html.includes('data-const="sol = 1; on = 1"')); assert(!html.includes('data-set="sol"'));
  assert.equal(calcScope(calcs[0], list, true).p, 1);
  for (const color of ['#DC2626', '#2563EB', '#7C3AED', '#B45309', '#6B7280']) assert(html.includes('fill="' + color + '"'));
});
test('choice supports light bulb, bar and dots with numeric selectors', () => {
  const { list, calcs } = verifyCalcs(all.html);
  const choice = calcs.find(n => hasClass(n, 'lite-choice'));
  assert.equal(calcScope(choice, list).v, 0); assert.equal(calcScope(choice, list, true).v, 6);
  assert(all.html.includes('fill-opacity: 0.08 + 0.92 * v / m'));
  for (const art of ['막대', '점']) {
    const html = renderLesson('# 값\n[고르기] 비교\n값: 수 | 개\n그림: ' + art + '\n- 가 = 0 | 없음\n- 나 = 3 | 있음');
    verifyCalcs(html);
    assert(art === '막대' ? html.includes('class="bar" data-value="v" data-max="3"') : data(html, 'data-attr').filter(s => s.includes('opacity: v >=')).length === 3);
  }
  const zero = renderLesson('# 영\n[고르기]\n- 가 = 0');
  assert(zero.includes('; m = 1')); verifyCalcs(zero);
});
test('electron stage, ion formula, charge and Korean ion names', () => {
  const atoms = [['Na', '나트륨', 11, '잃음', 1, 'Na⁺', '나트륨 이온'], ['Mg', '마그네슘', 12, '잃음', 2, 'Mg²⁺', '마그네슘 이온'], ['O', '산소', 8, '얻음', 2, 'O²⁻', '산화 이온'], ['Cl', '염소', 17, '얻음', 1, 'Cl⁻', '염화 이온'], ['F', '플루오린', 9, '얻음', 1, 'F⁻', '플루오린화 이온'], ['S', '황', 16, '얻음', 2, 'S²⁻', '황화 이온']];
  const html = renderLesson('# 전자\n[전자 이동]\n' + atoms.map(a => '- ' + a.slice(0, 5).join(' ')).join('\n'));
  const { list, calcs } = verifyCalcs(html);
  assert(html.includes('class="reveal" data-name="st" data-stops="시작|원자|이온"'));
  assert(html.includes('class="veil"')); assert(html.includes('data-at="1"'));
  for (const [i, atom] of atoms.entries()) {
    const neutral = calcScope(calcs[0], list, false, { el: i + 1, st: 1 });
    const charged = calcScope(calcs[0], list, true, { el: i + 1 });
    assert.equal(neutral.q, 0); assert.equal(neutral.ne, atom[2]);
    assert.equal(charged.f, atom[5]); assert.equal(charged.nm, atom[6]);
    assert.equal(charged.ne, atom[2] + (atom[3] === '잃음' ? -atom[4] : atom[4]));
    assert.equal(Math.abs(charged.q), atom[4]);
  }
});
test('superscript digits include 0 and multi-digit charges; large nuclei omit inner shells', () => {
  const html = renderLesson('# 전자\n[전자 이동]\n- Ca 칼슘 20 잃음 10\n- Kr 크립톤 36 얻음 12');
  const { list, calcs } = verifyCalcs(html);
  assert.equal(calcScope(calcs[0], list, true, { el: 1 }).f, 'Ca¹⁰⁺');
  assert.equal(calcScope(calcs[0], list, true).f, 'Kr¹²⁻');
  assert(html.includes('안쪽 껍질은 생략(모형)'));
  const quoted = renderLesson('# 전자\n[전자 이동]\n- Na 나\'트"륨 11 잃음 1');
  verifyCalcs(quoted);
});
test('graph compiles curves and moving points, strips Math., and supports replay', () => {
  const html = renderLesson('# 그래프\n[그래프] 높이\n가로: t 0~10 0.5 | 시간 | 분 | 재생\n세로: 0~9 | 높이 | 칸\n식: Math.min(8, 8 * c * (1 - Math.exp(-t / 3)))\n고르기: c = 0.5 | 낮음, 1 | 높음\n문장: t == 0 -> 시작\n문장: t > 0 → 이동');
  verifyCalcs(html);
  assert(!html.includes('Math.')); assert(html.includes('data-point="t, y"')); assert(html.includes('data-play="8"'));
  assert(data(html, 'data-line')[0].includes('exp(-x / 3)'));
  assert(data(html, 'data-x').includes('0, max(t, 0.01)'));
  assert(nodes(html).some(n => n.attrs['data-expr'] === 'y' && n.attrs['data-digits'] === '1' && n.attrs['data-unit'] === '칸'));
});
test('invalid graph names are renamed consistently and functions are left intact', () => {
  for (const variable of ['x', 'e', 'time', 'y']) {
    const html = renderLesson('# 그래프\n[그래프]\n가로: ' + variable + ' -2~2 0.5 | 가로\n세로: 0~4 | 세로\n식: abs(' + variable + ') + exp(-abs(' + variable + '))');
    verifyCalcs(html);
    assert(html.includes('name="a"')); assert(data(html, 'data-line')[0].includes('abs(x)'));
    assert(data(html, 'data-line')[0].includes('exp('));
  }
  const html = renderLesson('# 그래프\n[그래프]\n가로: t 0~2 1 | 시간\n세로: 0~4 | 값\n식: t * sign\n고르기: sign = 1 | 작게, 2 | 크게');
  verifyCalcs(html); assert(!html.includes('data-set="sign"'));
  assert(!html.includes('data-play'));
});
test('diffusion uses particle counters for both outputs and bars, with optional membrane', () => {
  const { list, calcs } = verifyCalcs(all.html);
  const calc = calcs.find(n => hasClass(n, 'lite-diffusion'));
  const scope = calcScope(calc, list);
  assert.equal(scope.a1L, 30); assert.equal(scope.a2R, 5);
  const own = list.filter(n => closest(n, 'calc') === calc);
  assert(own.some(n => n.attrs['data-membrane'] === '0.5'));
  assert(own.some(n => n.attrs['data-count'] === 'a1L, a1R' && n.attrs['data-size'] === '5'));
  assert(own.some(n => n.attrs['data-pass'] === '0' && n.attrs['data-size'] === '8'));
  assert(own.some(n => hasClass(n, 'bar') && n.attrs['data-value'] === 'a2R' && n.attrs['data-max'] === '25'));
  const noMembrane = renderLesson('# 확산\n[퍼지기]\n막: 없음 | 왼쪽 | 오른쪽\n- 물 10 0 통과 파랑');
  assert(!noMembrane.includes('data-membrane')); verifyCalcs(noMembrane);
});
test('stages have a starting stop, numbered data-only panels and optional pictures', () => {
  const html = renderLesson('# 과정\n[단계] 물에 녹이면?\n- 고체 | 붙어 있다. | 그림 19-9\n- 수용액 | 흩어진다.');
  assert(html.includes('data-stops="시작|고체|수용액"'));
  assert(html.includes('<div data-only="1"><p>붙어 있다.</p><figure class="fig">'));
  assert(html.includes('<div data-only="2"><p>흩어진다.</p></div>'));
  assert(html.includes('data-ai="모형"')); assert(html.includes('(모형)'));
});
test('pagination preserves order, atomic activities, IDs and section metadata', () => {
  const text = '# [장표지] 2. 장\n# 긴 글\n' + Array.from({ length: 22 }, (_, i) => '문단 ' + i).join('\n') + '\n[퀴즈] 물음\n* 맞음\n- 틀림';
  const p = parseLesson(text);
  const before = JSON.stringify(p);
  const divided = paginateLesson(p, s => s.blocks.length * 100);
  assert.equal(JSON.stringify(p), before, 'pagination never mutates input');
  assert.equal(divided.slides[1].id, 's2'); assert.equal(divided.slides[2].id, 's2b'); assert.equal(divided.slides[2].title, '긴 글 (2)');
  assert(divided.slides.slice(1).every(s => s.section === '2. 장' && s.blocks.length <= 4));
  assert.deepEqual(divided.slides.slice(1).flatMap(s => s.blocks), p.slides[1].blocks);
  assert.equal(divided.slides.flatMap(s => s.blocks).filter(b => b.type === 'quiz').length, 1);
  assert(paginateLesson(p, () => NaN).slides.length > 2);
  assert.equal(new Set(divided.slides.map(s => s.id)).size, divided.slides.length);
  const captions = paginateLesson(parseLesson('# 그림\n문단\n[그림 1-1] ' + '긴 설명 '.repeat(10) + '\n[그림 1-2] ' + '긴 설명 '.repeat(10)));
  assert(captions.slides.length > 1, 'future placeholders and long captions reserve space');
  assert.equal(captions.slides.flatMap(s => s.blocks).filter(b => b.type === 'figure').length, 2);
  assert(renderLesson(text, { paginate: true }).includes('id="s2b"'));
  const long = paginateLesson(parseLesson('# 긴 글\n' + Array.from({ length: 60 }, (_, i) => '문단' + i).join('\n')), s => s.blocks.length * 510);
  assert.equal(new Set(long.slides.map(s => s.id)).size, 60);
});
test('all six template layouts and both unchanged lesson sources compile with the engine', () => {
  assert.equal(all.parsed.slides.length, 10); assert.equal(ion.parsed.slides.length, 31);
  assert.equal(all.parsed.warnings.length, 0); assert.equal(ion.parsed.warnings.length, 0);
  const { calcs } = verifyCalcs(all.html); verifyCalcs(ion.html);
  assert.equal(calcs.length, 5);
  for (const calc of calcs) { assert.equal(calc.attrs['data-ai'], '모형'); assert(Object.hasOwn(calc.attrs, 'data-activity')); }
  for (const name of ['drift', 'choice', 'graph', 'diffusion']) assert(calcs.find(n => hasClass(n, 'lite-' + name)).attrs.style.includes('grid-template-columns:600px 1fr;gap:28px;align-items:start'));
  assert.equal(paginateLesson(all.parsed).slides.length, 10, 'state slide numbers remain stable with fallback measurement');
  assert(ion.source.includes('<script src="../lite.js" data-engine="../../engine/">'));
});
test('state fixtures cover first and last state on all six template slides', () => {
  const states = JSON.parse(readFileSync(new URL('../examples/states.json', import.meta.url), 'utf8'));
  assert.equal(states.length, 12);
  for (let slide = 1; slide <= 6; slide++) assert.equal(states.filter(s => s.slide === slide).length, 2);
  for (const state of states) {
    assert.equal(typeof state.name, 'string'); assert(state.name); assert(state.js);
    new vm.Script('(function () {' + state.js + '\n})()');
    assert(state.js.includes('#s' + state.slide));
  }
  assert(states.find(s => s.name === '끌려가기-끝').js.includes('r.value = r.max'));
  assert(states.find(s => s.name === '전자-끝').js.includes('b[b.length - 1].click()'));
});
test('lite source avoids newer syntax and any runtime library import', () => {
  const source = readFileSync(new URL('../lite.js', import.meta.url), 'utf8');
  assert(!source.includes('?.')); assert(!source.includes('??')); assert(!source.includes('replaceAll'));
  assert(!/\b(?:import|require)\s*\(/.test(source));
  assert(!/\bclass\s+\w/.test(source));
  new vm.Script(source);
});
// Minimal in-memory DOM exercises loader sequencing only. It deliberately has
// no layout engine (height = 0), so pagination takes the documented fallback.
function browserHarness(options = {}) {
  const trace = [], warnings = [], timers = new Map();
  let timerId = 0;
  class Element {
    constructor(tag, attrs = {}) { this.tagName = tag.toUpperCase(); this.attrs = { ...attrs }; this.children = []; this.parentNode = null; this.events = {}; this.style = { setProperty: (key, value) => { this.style[key] = value; } }; }
    get id() { return this.attrs.id || ''; } set id(v) { this.attrs.id = v; }
    get className() { return this.attrs.class || ''; } set className(v) { this.attrs.class = v; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    get firstElementChild() { return this.children[0] || null; }
    addEventListener(k, fn) { this.events[k] = fn; }
    appendChild(child) { return this.insertBefore(child, null); }
    insertBefore(child, before) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      if (before) this.children.splice(this.children.indexOf(before), 0, child); else this.children.push(child);
      trace.push('insert:' + child.tagName + (child.className ? '.' + child.className : ''));
      return child;
    }
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; return child; }
    descendants() { return this.children.flatMap(c => [c, ...c.descendants()]); }
    querySelectorAll(selector) {
      const selectors = selector.split(',').map(s => s.trim());
      return this.descendants().filter(n => selectors.some(sel => {
        const tag = sel.match(/^[a-z]+/i), id = sel.match(/#([\w-]+)/), cls = sel.match(/\.([\w-]+)/);
        const match = (!tag || n.tagName === tag[0].toUpperCase()) && (!id || n.id === id[1]) && (!cls || n.className.split(/\s+/).includes(cls[1]));
        return match && [...sel.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].every(a => (n.attrs[a[1]] ?? n[a[1]]) === a[2]);
      }));
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    set innerHTML(html) {
      this.children = [];
      const mapping = new Map();
      for (const node of nodes(html)) {
        const el = new Element(node.tag, node.attrs);
        mapping.set(node, el);
        const parent = mapping.get(node.parent) || this;
        parent.children.push(el); el.parentNode = parent;
      }
    }
    getBoundingClientRect() { return { height: 0, width: 0 }; }
  }
  const doc = new Element('document');
  doc.documentElement = new Element('html'); doc.appendChild(doc.documentElement);
  doc.head = new Element('head'); doc.body = new Element('body');
  doc.documentElement.appendChild(doc.head); doc.documentElement.appendChild(doc.body);
  doc.createElement = tag => new Element(tag);
  doc.getElementById = id => doc.descendants().find(n => n.id === id) || null;
  Object.defineProperty(doc, 'scripts', { get() { return doc.descendants().filter(n => n.tagName === 'SCRIPT'); } });
  doc.readyState = options.ready ? 'complete' : 'loading'; doc.title = options.title || '전하와 입자';
  const liteScript = new Element('script', options.base ? { 'data-engine': options.base } : {});
  doc.currentScript = liteScript; doc.head.appendChild(liteScript);
  const source = new Element('script', options.plain ? { type: 'text/plain', id: 'lesson' } : { type: 'text/x-lesson' });
  source.textContent = options.text || '색: #123456\n# 첫째\n글'; doc.body.appendChild(source);
  if (options.saved) {
    doc.body.appendChild(new Element('section', { class: 'slide', id: 'saved' }));
    doc.documentElement.setAttribute('data-deck', 'saved-deck');
  }
  if (options.engine) { const engineScript = new Element('script'); engineScript.src = '/already/exploragram.js?v=2'; doc.head.appendChild(engineScript); }
  if (options.css) { const link = new Element('link'); link.rel = 'stylesheet'; link.href = '/already/exploragram.css'; link.sheet = {}; doc.head.appendChild(link); }
  trace.length = 0;
  const win = { console: { warn: msg => warnings.push(msg) }, setTimeout: (fn, ms) => { assert.equal(ms, 5000); timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id) };
  vm.runInNewContext(readFileSync(new URL('../lite.js', import.meta.url), 'utf8'), { window: win, document: doc });
  return { doc, win, source, trace, warnings, timers, ready: () => doc.events.DOMContentLoaded(), finishCSS: () => doc.querySelector('link[rel="stylesheet"]').events.load() };
}
async function asyncTest(name, run) {
  try { await run(); passed++; console.log('ok ' + passed + ' - ' + name); }
  catch (error) { console.error('FAIL - ' + name); throw error; }
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
await asyncTest('browser waits for DOM and CSS, preserves source and loads engine last', async () => {
  const h = browserHarness({ base: '../../engine/' });
  assert.equal(h.trace.length, 0, 'DOMContentLoaded has not fired');
  h.ready();
  assert.equal(h.doc.documentElement.lang, 'ko'); assert.match(h.doc.documentElement.getAttribute('data-deck'), /^lite-[a-z0-9]{6}$/);
  assert.equal(h.doc.body.getAttribute('data-theme'), 'ppt');
  assert.equal(h.doc.body.style['--accent'], '#123456'); assert.equal(h.doc.body.style['--tab'], '#123456'); assert.equal(h.doc.body.style['--tab-ink'], '#fff');
  assert(h.doc.querySelector('meta[name="viewport"]')); assert(h.doc.getElementById('lite-css'));
  assert(h.trace.indexOf('insert:LINK') < h.trace.indexOf('insert:STYLE'));
  assert.equal(h.doc.querySelectorAll('section.slide').length, 0);
  assert(!h.doc.scripts.some(s => s.src));
  h.finishCSS(); await flush();
  assert.equal(h.doc.querySelectorAll('section.slide').length, 1);
  assert(h.source.parentNode === h.doc.body, 'lesson script stays in body');
  assert.equal(h.doc.scripts.filter(s => s.src).length, 1);
  assert.equal(h.doc.scripts.find(s => s.src).src, '../../engine/exploragram.js');
  assert(h.trace.indexOf('insert:DIV.lite-measure') < h.trace.lastIndexOf('insert:SCRIPT'));
  assert(!h.doc.querySelector('.lite-measure')); assert.equal(h.timers.size, 0); assert.equal(h.warnings.length, 0);
});
await asyncTest('CSS timeout and failure continue, plain lesson source and default engine work', async () => {
  for (const failure of ['timeout', 'error']) {
    const h = browserHarness({ plain: true }); h.ready();
    assert.equal(h.doc.querySelector('link[rel="stylesheet"]').href, 'https://cdn.jsdelivr.net/gh/N-lifescience/resonance@2/engine/exploragram.css');
    if (failure === 'timeout') [...h.timers.values()][0](); else h.doc.querySelector('link[rel="stylesheet"]').events.error();
    await flush();
    assert.equal(h.doc.querySelectorAll('section.slide').length, 1); assert.equal(h.warnings.length, 1); assert(h.warnings[0].startsWith('[lite]'));
    assert.equal(h.doc.scripts.find(s => s.src).src, 'https://cdn.jsdelivr.net/gh/N-lifescience/resonance@2/engine/exploragram.js');
  }
});
await asyncTest('saved HTML runs engine only and existing engine scripts are not duplicated', async () => {
  for (const engine of [false, true]) {
    const h = browserHarness({ saved: true, engine }); h.ready(); await flush();
    assert.equal(h.doc.querySelectorAll('section.slide').length, 1); assert(h.doc.getElementById('saved'));
    assert.equal(h.doc.documentElement.getAttribute('data-deck'), 'saved-deck');
    assert.equal(h.doc.scripts.filter(s => s.src).length, 1);
    assert(!h.doc.querySelector('link[rel="stylesheet"]')); assert(!h.doc.getElementById('lite-css')); assert.equal(h.timers.size, 0);
  }
});
await asyncTest('ready document and loaded stylesheet skip waits; explicit deck wins', async () => {
  const h = browserHarness({ ready: true, css: true, engine: true, base: '/engine', text: '덱: explicit-deck\n# 장\n문단' }); await flush();
  assert.equal(h.doc.documentElement.getAttribute('data-deck'), 'explicit-deck'); assert.equal(h.timers.size, 0);
  assert.equal(h.doc.querySelectorAll('link[rel="stylesheet"]').length, 1); assert.equal(h.doc.scripts.filter(s => s.src).length, 1);
  assert.equal(h.doc.querySelectorAll('section.slide').length, 1); assert(h.doc.getElementById('lite-css'));
});
// 마주온 기본 모델이 실제로 쓴 말투(2026-11-15 시험)
test('weak-model dialect: bare color line and bulleted/grouped figures', () => {
  const lesson = parseLesson('#568A35\n# [표지] 제목\n학년\n[그림 1-2] 표지 그림\n# 장\n- 문장\n- 그림 2-5: 광고 화면\n- 그림 6-1, 6-2, 6-5: 원자 모형\n그림 9-3~9-8: 이온식 예시\n(그림 19-9·19-13) 녹는 모형');
  assert.equal(lesson.settings.accent, '#568A35');
  assert.equal(lesson.slides.length, 2, 'color line is not a slide');
  assert.equal(lesson.slides[0].blocks.filter(b => b.type === 'figure').length, 0, 'no figure on the cover');
  const figs = lesson.slides[1].blocks.filter(b => b.type === 'figure').map(b => b.ppt);
  assert.deepEqual(figs, ['2-5', '6-1', '6-2', '6-5', '9-3', '9-4', '9-5', '9-6', '19-9', '19-13']);
  assert.equal(lesson.slides[1].blocks.find(b => b.ppt === '6-2').text, '원자 모형');
  assert.equal(parseLesson('색 568A35\n# 장').settings.accent, '#568A35');
  assert.equal(parseLesson('# 568 문제\n- 문장').slides[0].title, '568 문제', 'a title with a space is still a title');
});
test('weak-model dialect: sort header is a question, choice uses numbers as labels or verdict words', () => {
  const sort = renderLesson('# 장\n[분류] 전기가 통하는지 나누어 보자.\n- 이온 음료 = 통한다 | 이온이 있다.\n- 설탕 수용액 = 통하지 않는다 | 이온이 없다.\n- 증류수 = 통하지 않는다 | 이온이 거의 없다.');
  assert.match(sort, /<p class="q"[^>]*>전기가 통하는지 나누어 보자\.<\/p>/);
  assert.equal((sort.match(/class="bin"/g) || []).length, 2);
  assert.equal((sort.match(/<span data-bin="b2"/g) || []).length, 2);
  const fuzzy = renderLesson('# 장\n[분류] 양이온 | 음이온\n- Na⁺ = 양이온 | 잃음\n- Cl⁻ = \'음이온\' | 얻음');
  assert.equal((fuzzy.match(/<span data-bin=/g) || []).length, 2, 'quoted bin name still matches');
  const loose = renderLesson('# 장\n[분류] 전기가 통하는 물질 | 전기가 통하지 않는 물질\n- 이온 음료 = 통한다 | 있다\n- 증류수 = 통하지 않는다 | 없다');
  assert.match(loose, /<span data-bin="b1"[^>]*>이온 음료<\/span>/);
  assert.match(loose, /<span data-bin="b2"[^>]*>증류수<\/span>/);
  const numbered = renderLesson('# 장\n[고르기] 전기가 통할까?\n값: 용액 | 가지\n그림: 전구\n- 증류수 = 1 | 소리가 나지 않는다.\n- 이온 음료 = 2 | 소리가 난다.\n- 설탕 수용액 = 3 | 소리가 나지 않는다.');
  assert.match(numbered, /v = c == 1 \? 0 : c == 2 \? 1 : 0/, 'index values corrected from verdict sentences');
  assert.doesNotMatch(numbered, /용액 <output/);
  const words = renderLesson('# 장\n[고르기] 전기가 통할까?\n그림: 전구\n- 증류수 = 통하지 않는다\n- 소금물 = 통한다');
  assert.match(words, /v = c == 1 \? 0 : 1/);
  const cat = renderLesson('# 장\n[고르기] 어느 쪽이 화학적 소화일까?\n그림: 시험관\n- 음식물을 잘게 씹는다 = 기계적 소화 | 힘을 가한다.\n- 녹말이 엿당으로 바뀐다 = 화학적 소화 | 효소가 분해한다.');
  assert.match(cat, /class="sort"/, 'category choice becomes a sort');
  assert.equal((cat.match(/class="bin"/g) || []).length, 2);
  const real = renderLesson('# 장\n[고르기] 이온 수\n값: 이온 수 | 개\n- 증류수 = 0 | 없다\n- 소금물 = 6 | 있다');
  assert.match(real, /v = c == 1 \? 0 : 6/, 'real numbers stay');
});
console.log('\n' + passed + ' total tests passed. Chrome and browser layout/audit not run.');
