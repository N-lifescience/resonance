import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { plain } from './load.mjs';

// 수업 대본 만들기 쪽의 강사 카드(site/assets/js/cards.js)의 순수 함수. document가 없으면 화면 코드는 건너뛴다.
const code = readFileSync(new URL('../../site/assets/js/cards.js', import.meta.url), 'utf8');
const ctx = vm.createContext({ console, URL });
vm.runInContext(code, ctx);
const L = ctx.CardsLib;

const card = (instructor, texts) => ({ ...L.newCard(instructor), sources: texts.map((text, i) => ({ id: `s${i}`, url: `https://youtu.be/AAAAAAAAAA${i}`, start: '', end: '', focus: '', status: 'done', text })) });

test('유튜브 주소에서 영상 id를 읽고, 다른 주소는 거절한다', () => {
  assert.equal(L.videoId('https://youtu.be/RcU-7lx8EDU?si=x'), 'RcU-7lx8EDU');
  assert.equal(L.videoId('https://www.youtube.com/watch?v=RcU-7lx8EDU&t=3'), 'RcU-7lx8EDU');
  assert.equal(L.videoId('https://m.youtube.com/shorts/RcU-7lx8EDU'), 'RcU-7lx8EDU');
  assert.throws(() => L.videoId('http://youtu.be/RcU-7lx8EDU'));
  assert.throws(() => L.videoId('https://example.com/watch?v=RcU-7lx8EDU'));
  assert.throws(() => L.videoId('https://www.youtube.com/playlist?list=abc'));
});

test('시간 글을 초로 바꾼다', () => {
  assert.equal(L.toSec(''), null);
  assert.equal(L.toSec('45'), 45);
  assert.equal(L.toSec('3:20'), 200);
  assert.equal(L.toSec('1:02:05'), 3725);
  assert.throws(() => L.toSec('3분'));
  assert.throws(() => L.toSec('3:75'));
});

test('같은 영상·구간·초점이면 같은 열쇠다', () => {
  const a = { url: 'https://youtu.be/RcU-7lx8EDU', start: '1:00', end: '', focus: '' };
  assert.equal(L.sourceKey(a), L.sourceKey({ ...a, url: 'https://www.youtube.com/watch?v=RcU-7lx8EDU' }));
  assert.notEqual(L.sourceKey(a), L.sourceKey({ ...a, start: '2:00' }));
});

test('class-helper가 저장한 마크다운 카드를 영상별로 읽는다', () => {
  const md = '# 강사 카드: 김상욱1\n- 한 줄 요약: 2개 자료\n\n## 영상 1 · https://youtu.be/RcU-7lx8EDU\n# 강사 카드: 김상욱1 — 시간\n## 1. 배경지식\n내용 하나\n\n## 영상 2 · 기존 가져온 카드\n내용 둘\n';
  const c = L.parseCardMarkdown(md, '강사_931ab8d1-0fa1-4972-a0e8-0c736c17617d.md');
  assert.equal(c.instructor, '김상욱1');
  assert.equal(c.id, '강사_931ab8d1-0fa1-4972-a0e8-0c736c17617d.md');
  assert.equal(c.sources.length, 2);
  assert.equal(c.sources[0].url, 'https://youtu.be/RcU-7lx8EDU');
  assert.equal(c.sources[1].url, '');
  assert.match(c.sources[0].text, /내용 하나/);
});

test('Gemini 분석 원문 하나도 카드로 읽고, 제목의 영상 주제는 이름에서 뺀다', () => {
  const c = L.parseCardMarkdown('# 강사 카드: 홍길동 — 광합성\n- 영상 주소: https://youtu.be/RcU-7lx8EDU\n## 1. 배경지식\n…');
  assert.equal(c.instructor, '홍길동');
  assert.equal(c.sources.length, 1);
  assert.equal(c.sources[0].url, 'https://youtu.be/RcU-7lx8EDU');
});

test('카드 파일로 저장한 뒤 다시 읽으면 영상과 내용이 그대로다', () => {
  const c = card('이름', ['가'.repeat(50), '나'.repeat(50)]);
  const back = L.parseCardMarkdown(L.cardMarkdown(c));
  assert.equal(back.instructor, '이름');
  assert.deepEqual(plain(back.sources.map((s) => s.text)), ['가'.repeat(50), '나'.repeat(50)]);
});

test('줄인 카드는 한도를 넘지 않고 모든 절을 남긴다', () => {
  const long = Array.from({ length: 6 }, (_, i) => `## ${i + 1}. ${i === 1 ? '질문·문답 방식' : '유머 방식'}\n${'가'.repeat(5000)}`).join('\n');
  const d = L.digest(card('긴 강사', [long, long]), 14000);
  assert.ok(d.length <= 14000, `길이 ${d.length}`);
  assert.equal((d.match(/^## 2\. 질문/gm) || []).length, 2);
  assert.throws(() => L.digest({ instructor: '빈', sources: [] }));
});

test('대본 묶음: 배정표, 지침, 카드를 한 번씩 넣는다', () => {
  const a = card('강사가', ['## 1. 배경지식\n가가']);
  const b = card('강사나', ['## 3. 유머 방식\n나나']);
  const mix = { '유머 방식': b.id, '질문·문답 방식': a.id, '동기유발·도입 이야기': a.id };
  const guide = '<!-- 자동 생성 -->\n# 대본 합본 지침\n## 1. 절차\n내용\n```text\n## cover · 표지\n### ▶1\n```';
  const { text, filename } = L.buildBundle({ cards: [a, b], mix, guide, date: new Date(2026, 9, 25) });
  assert.match(text, /^## cover · 표지$/m, '코드 상자 안의 대본 형식 예시는 제목 단계를 낮추지 않는다');
  assert.match(text, /^### ▶1$/m);
  assert.match(text, /^#### 1\. 절차$/m);
  assert.equal(filename, '강사화법묶음-20261025.md');
  assert.match(text, /\| 유머 방식 \| 강사나 \|/);
  assert.match(text, /\| 배경지식 끌어오기 \| \(기본 화법\) \|/);
  assert.equal((text.match(/^### 카드: 강사가$/gm) || []).length, 1);
  assert.match(text, /^### 대본 합본 지침$/m);
  assert.doesNotMatch(text, /자동 생성/);
  assert.ok(text.indexOf('## 대본 지침') < text.indexOf('## 강사 카드'));
});

test('지침을 못 받으면 주소를 넣고, 같은 이름 카드 둘은 막는다', () => {
  const a = card('같은 이름', ['가']);
  const b = card('같은 이름', ['나']);
  assert.match(L.buildBundle({ cards: [a], mix: { '유머 방식': a.id } }).text, /raw\.githubusercontent\.com\/N-lifescience\/resonance\/main\/guide\/script-guide\.md/);
  assert.throws(() => L.buildBundle({ cards: [a, b], mix: { '유머 방식': a.id, '강조하는 말투': b.id } }), /같은 이름/);
});

test('요청문에 주소·이름·구간을 채운다', () => {
  const p = L.buildPrompt('분석해\n\n[영상 주소]\n', { url: 'https://youtu.be/RcU-7lx8EDU', instructor: '김', focus: '비유', start: '1:00', end: '' });
  assert.match(p, /https:\/\/youtu\.be\/RcU-7lx8EDU/);
  assert.match(p, /강사 이름: 김/);
  assert.match(p, /특히 배우고 싶은 점: 비유/);
  assert.match(p, /분석 구간: 1:00 ~ 끝/);
  assert.doesNotMatch(p, /\[영상 주소\]/);
});

test('가장 높은 버전의 정식 Flash를 고른다', () => {
  assert.equal(L.pickModel(['models/gemini-2.5-flash', 'models/gemini-3-flash-preview-09', 'models/gemini-2.5-pro', 'models/gemini-3-flash']), 'gemini-3-flash');
  assert.equal(L.pickModel(['models/gemini-2.0-flash', 'models/gemini-2.5-flash-preview-05']), 'gemini-2.5-flash-preview-05');
  assert.throws(() => L.pickModel(['models/gemini-2.5-pro']));
});

test('요청 본문에 영상과 구간(초)을 넣는다', () => {
  const body = plain(L.requestBody('p', { url: 'https://youtu.be/RcU-7lx8EDU', start: '1:00', end: '2:30' }));
  assert.deepEqual(body.contents[0].parts[0], { fileData: { fileUri: 'https://www.youtube.com/watch?v=RcU-7lx8EDU' }, videoMetadata: { startOffset: '60s', endOffset: '150s' } });
  assert.equal(plain(L.requestBody('p', { url: 'https://m.youtube.com/shorts/RcU-7lx8EDU', start: '', end: '' })).contents[0].parts[0].videoMetadata, undefined);
});

test('응답에서 생각 토큰을 빼고 글만 읽으며, 잘린 응답은 실패로 본다', () => {
  assert.equal(L.readResponse({ candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: '생각' }, { text: '# 강사 카드' }] } }] }), '# 강사 카드');
  assert.throws(() => L.readResponse({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '반쯤' }] } }] }), /잘렸/);
  assert.throws(() => L.readResponse({ promptFeedback: { blockReason: 'SAFETY' } }), /SAFETY/);
});

test('백업: 같은 id는 더 늦게 고친 쪽을 남기고, 모르는 값과 위험한 사진은 버린다', () => {
  const old = { ...card('이전', ['가']), id: 'x', updatedAt: '2026-10-01T00:00:00Z' };
  const fresh = { ...old, instructor: '새로', updatedAt: '2026-10-02T00:00:00Z' };
  const stale = { ...old, instructor: '옛것', updatedAt: '2026-09-01T00:00:00Z' };
  assert.equal(L.mergeCards([old], [fresh]).cards[0].instructor, '새로');
  assert.equal(L.mergeCards([old], [stale]).cards[0].instructor, '이전');
  const cards = L.parseImport(L.backupText([{ ...fresh, photo: 'javascript:alert(1)', extra: '<script>' }]), 'b.json');
  assert.equal(cards[0].photo, null);
  assert.equal(cards[0].extra, undefined);
  assert.throws(() => L.parseImport('{"hello":1}', 'x.json'));
});

test('class-helper의 _cards/*.json을 받고, 멈춘 분석은 실패로 바꾼다', () => {
  const json = JSON.stringify({ file: '강사_1.md', instructor: '김', sources: [{ id: 'a', url: 'https://youtu.be/RcU-7lx8EDU', status: 'running', text: '' }, { id: 'b', url: '', status: 'done', text: '내용' }], photo: null });
  const [c] = L.parseImport(json, '강사_1.md.json');
  assert.equal(c.id, '강사_1.md');
  assert.equal(L.recoverInterrupted(c), true);
  assert.equal(c.sources[0].status, 'error');
  assert.equal(L.doneSources(c).length, 1);
});

test('주소 없는 영상이 있어도 열쇠를 만들고, 유튜브가 아닌 주소는 버린다', () => {
  assert.doesNotThrow(() => L.sourceKey({ url: '', text: '가져온 분석' }));
  assert.notEqual(L.sourceKey({ url: '', text: '가' }), L.sourceKey({ url: '', text: '나' }));
  const [c] = L.parseImport(JSON.stringify({ app: 'resonance-cards', version: 1, cards: [{ id: 'x', instructor: '김', sources: [{ id: 'a', url: 'javascript:alert(1)', status: 'done', text: '글' }, { id: 'b', url: 'https://example.com/v', status: 'done', text: '글2' }] }] }), 'b.json');
  assert.deepEqual(plain(c.sources.map((s) => s.url)), ['', '']);
});

test('합치기는 양쪽 영상 분석을 모두 남기고, 고친 시각이 없는 class-helper 카드는 로컬을 덮지 않는다', () => {
  const local = { ...card('로컬 이름', ['가'.repeat(30), '나'.repeat(30)]), id: 'k', updatedAt: '2026-10-20T00:00:00Z' };
  local.sources[1].url = 'https://youtu.be/RcU-7lx8EDU';
  const [imported] = L.parseImport(JSON.stringify({ file: 'k', instructor: '옛 이름', sources: [{ id: 'z', url: 'https://youtu.be/RcU-7lx8EDV', status: 'done', text: '다'.repeat(30) }] }), 'k.json');
  assert.equal(imported.updatedAt, '');
  const merged = L.mergeCards([local], [imported]);
  assert.equal(merged.cards[0].instructor, '로컬 이름');
  assert.equal(merged.cards[0].sources.length, 3);
  assert.equal(merged.updated, 1);
  assert.equal(L.mergeCards(merged.cards, [imported]).updated, 0, '같은 것을 다시 불러오면 바뀌지 않는다');
});

test('같은 class-helper 카드의 .json과 .md를 함께 불러와도 분석이 겹치지 않는다', () => {
  const text = '# 강사 카드: 김 — 시간\n## 1. 배경지식\n' + '내용 '.repeat(60);
  const name = '강사_931ab8d1-0fa1-4972-a0e8-0c736c17617d.md';
  const [fromJson] = L.parseImport(JSON.stringify({ file: name, instructor: '김', sources: [{ id: 'e', url: 'https://youtu.be/RcU-7lx8EDU', start: '1:00', status: 'done', text }] }), name + '.json');
  const [fromMd] = L.parseImport(L.cardMarkdown({ instructor: '김', sources: [{ url: 'https://youtu.be/RcU-7lx8EDU', status: 'done', text }] }), name);
  const merged = L.mergeCards(L.mergeCards([], [fromJson]).cards, [fromMd]).cards;
  assert.equal(merged.length, 1);
  assert.equal(merged[0].sources.length, 1);
  assert.equal(merged[0].sources[0].start, '1:00');
});

test('다른 탭이 방금 시작한 분석은 실패로 바꾸지 않는다', () => {
  const c = L.newCard('김');
  const now = Date.parse('2026-10-25T10:00:00Z');
  c.sources.push({ id: 'a', url: '', status: 'running', startedAt: '2026-10-25T09:55:00Z', text: '' }, { id: 'b', url: '', status: 'running', startedAt: '2026-10-25T09:00:00Z', text: '' });
  assert.equal(L.recoverInterrupted(c, now), true);
  assert.deepEqual(plain(c.sources.map((s) => s.status)), ['running', 'error']);
});

test('합친 영상이 30개를 넘어도 다시 읽을 때 잘리지 않는다', () => {
  const big = (prefix) => ({ ...L.newCard('김'), id: 'm', sources: Array.from({ length: 30 }, (_, i) => ({ id: `${prefix}${i}`, url: '', status: 'done', text: `${prefix}${i} 분석` })) });
  const merged = L.mergeCards([{ ...big('a'), updatedAt: '2026-10-01' }], [{ ...big('b'), updatedAt: '2026-10-02' }]).cards[0];
  assert.equal(merged.sources.length, 60);
  assert.equal(L.normalizeCard(merged).sources.length, 60);
});

test('고친 시각이 같으면 구간 정보가 많은 쪽을 남기고, 실패한 분석이 끝난 분석을 가리지 않는다', () => {
  const name = '강사_931ab8d1-0fa1-4972-a0e8-0c736c17617d.md';
  const text = '# 강사 카드: 김 — 시간\n## 1. 배경지식\n' + '내용 '.repeat(60);
  const [fromMd] = L.parseImport(L.cardMarkdown({ instructor: '김', sources: [{ url: 'https://youtu.be/RcU-7lx8EDU', status: 'done', text }] }), name);
  const [fromJson] = L.parseImport(JSON.stringify({ file: name, instructor: '김', sources: [{ id: 'e', url: 'https://youtu.be/RcU-7lx8EDU', start: '1:00', end: '2:00', status: 'done', text }] }), name + '.json');
  const merged = L.mergeCards([fromMd], [fromJson]).cards[0];
  assert.equal(merged.sources.length, 1);
  assert.equal(merged.sources[0].start, '1:00');
  const base = { ...L.newCard('이'), id: 'q', updatedAt: '2026-10-05', sources: [{ id: 's', url: 'https://youtu.be/RcU-7lx8EDU', status: 'error', text: '', error: '실패' }] };
  const old = { ...base, updatedAt: '2026-10-01', sources: [{ id: 't', url: 'https://youtu.be/RcU-7lx8EDU', status: 'done', text: '끝난 분석' }] };
  assert.equal(L.mergeCards([old], [base]).cards[0].sources[0].text, '끝난 분석');
});
