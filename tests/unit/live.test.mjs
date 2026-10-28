import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, plain } from './load.mjs';

const eq = (a, b, m) => assert.equal(a, b, m);

const { LiveCore } = load(['00-core.js', '20-ink-geom.js', '21-ink-model.js', '68-live.js'], ['LiveCore']);

test('reach: 간 장만 열리고, 같은 장은 큰 값을 남긴다', () => {
  let r = LiveCore.reach([], 3, 1, 2, [1]);
  assert.deepStrictEqual(plain(r), [null, { shown: 2, steps: [1] }, null]);
  r = LiveCore.reach(r, 3, 1, 1, [0]);
  assert.deepStrictEqual(plain(r[1]), { shown: 2, steps: [1] });
  r = LiveCore.reach(r, 3, 2, 0, []);
  assert.deepStrictEqual(plain(r[2]), { shown: 0, steps: [] });
});

test('bins: 값이 적으면 값마다 한 칸, 최빈값을 고른다', () => {
  const b = LiveCore.bins([3, 3, 7, 99, NaN, -5], 0, 10, 1);
  assert.equal(b.length, 11);
  assert.equal(b[3].n, 2);
  assert.equal(b[3].pick, 3);
  assert.equal(b[10].n, 1);   // 범위 밖은 끝 칸(값은 교사가 받을 때 자른다)
  assert.equal(b[0].n, 1);
  assert.equal(b[5].pick, null);
});

test('bins: 값이 많으면 20칸, 같은 수면 작은 값', () => {
  const b = LiveCore.bins([0, 1, 1, 0, 999], 0, 1000, 1);
  assert.equal(b.length, 20);
  assert.equal(b[0].n, 4);
  assert.equal(b[0].pick, 0);
  assert.equal(b[19].n, 1);
});

test('clean: 모양이 맞는 메시지만 받는다', () => {
  assert.deepStrictEqual(plain(LiveCore.clean('val', { sid: 'abcd1234', slide: 1, key: 'ik-t', v: 3, x: 1 }, 3)),
    { sid: 'abcd1234', slide: 1, key: 'ik-t', v: 3 });
  assert.equal(LiveCore.clean('val', { sid: 'ABC', slide: 1, key: 'k', v: 3 }, 3), null);
  assert.equal(LiveCore.clean('val', { sid: 'abcd1234', slide: 3, key: 'k', v: 3 }, 3), null);
  assert.equal(LiveCore.clean('val', { sid: 'abcd1234', slide: 0, key: 'k'.repeat(61), v: 3 }, 3), null);
  assert.equal(LiveCore.clean('val', { sid: 'abcd1234', slide: 0, key: 'k', v: Infinity }, 3), null);
  assert.deepStrictEqual(plain(LiveCore.clean('hi', { sid: 'abcd1234' }, 3)), { sid: 'abcd1234' });
  assert.equal(LiveCore.clean('nope', {}, 3), null);
  assert.equal(LiveCore.clean('hi', null, 3), null);
  assert.deepStrictEqual(plain(LiveCore.clean('end', { tid: 'abcd1234' }, 3)), { tid: 'abcd1234' });
  assert.equal(LiveCore.clean('end', {}, 3), null, '교사 표시 없는 끝은 버린다');
  const s = LiveCore.clean('state', {
    tid: 'tttt0000', slide: 1, shown: 0, steps: [2], reach: [null, { shown: 1, steps: [2, 'x'] }], lesson: { key: 'd', n: 2, title: 't' }, site: '../x',
  }, 2);
  assert.deepStrictEqual(plain(s), {
    tid: 'tttt0000', slide: 1, shown: 0, steps: [2], reach: [null, { shown: 1, steps: [] }], lesson: { key: 'd', n: 2, title: 't' }, site: null, ink: null, board: null, bd: null, timer: null,
  });
  assert.equal(LiveCore.clean('state', { tid: 'tttt0000', slide: -1, shown: 0, reach: [] }, 2), null);
  assert.equal(LiveCore.clean('state', { slide: 0, shown: 0, reach: [] }, 2), null, '교사 표시 없는 상태는 버린다');
});

test('clean: 상태의 툴바 타이머는 모양이 맞을 때만', () => {
  const base = { tid: 'tttt0000', slide: 0, shown: 0, reach: [null] };
  const timer = (t) => plain(LiveCore.clean('state', { ...base, timer: t }, 1)).timer;
  assert.deepStrictEqual(timer({ left: 90500, total: 180, run: true, x: 1 }), { left: 90500, total: 180, run: true });
  assert.deepStrictEqual(timer({ left: 0, total: 60, run: false }), { left: 0, total: 60, run: false }, '끝난 타이머');
  for (const bad of [{ left: -1, total: 60, run: true }, { left: 1.5, total: 60, run: true }, { left: 1000, total: 0, run: true },
    { left: 1000, total: 60, run: 'yes' }, { left: 1e9, total: 60, run: true }, 'x', null]) {
    eq(timer(bad), null, JSON.stringify(bad));
  }
});

test('answered: 장의 활동 여럿에 답한 학생은 한 명, 나간 학생은 빼고 센다', () => {
  const quiz = new Map([['aaaaaaaa', [1]], ['bbbbbbbb', [0]]]);
  const short = new Map([['aaaaaaaa', { t: '물' }], ['cccccccc', { t: '빛' }], ['dddddddd', { t: '열' }]]);
  const alive = (sid) => sid !== 'dddddddd';
  eq(LiveCore.answered([quiz, short, null], alive), 3);
  eq(LiveCore.answered([null, undefined], alive), 0);
  eq(LiveCore.answered([short], () => true), 3);
});

test('inkEnc·inkDec: 앞 점에서 뺀 정수로 보내고 되살린다', () => {
  const p = [10.4, 20.6, 10.6, 20.4, 13, 25, 13.2, 25.1, 40, 5];
  const e = LiveCore.inkEnc(p, 0, null, 1);
  assert.deepStrictEqual(plain(e.pts), [10, 21, 1, -1, 2, 5, 27, -20], '반올림해서 같은 점(13, 25)은 한 번만');
  assert.deepStrictEqual(plain(e.last), [40, 5]);
  assert.deepStrictEqual(plain(LiveCore.inkDec(e.pts, null)), [10, 21, 11, 20, 13, 25, 40, 5]);
  // 이어 보내기: 앞서 보낸 마지막 점에서 뺀 값
  const more = LiveCore.inkEnc([...p, 42, 9], 10, e.last, 1);
  assert.deepStrictEqual(plain(more.pts), [2, 4]);
  assert.deepStrictEqual(plain(LiveCore.inkDec(more.pts, e.last)), [42, 9]);
  // 성기게: 가로·세로 모두 step보다 가까운 점은 건너뛴다
  assert.deepStrictEqual(plain(LiveCore.inkEnc([0, 0, 1, 1, 2, 3, 3, 3], 0, null, 2).pts), [0, 0, 2, 3]);
  assert.deepStrictEqual(plain(LiveCore.inkEnc([5, 5], 0, null, 4).pts), [5, 5], '점 하나는 남는다');
});

test('inkSnap·inkDelta: 새 획, 길어진 획, 사라진 획만 보낸다', () => {
  const a = { t: 'pen', c: '#1F2328', w: 6, p: [0, 0, 10, 0] };
  const b = { t: 'hl', c: '#FFE45C', w: 24, p: [5, 5] };
  const snap = LiveCore.inkSnap([{ id: 1, s: a }], 1);
  assert.deepStrictEqual(plain(snap.snap), [[1, 0, '#1F2328', 6, [0, 0, 10, 0]]]);
  a.p.push(20, 5);
  const d = LiveCore.inkDelta([{ id: 1, s: a }, { id: 2, s: b }], snap.sent, 1);
  assert.deepStrictEqual(plain(d.more), [[1, [10, 5]]], '길어진 뒷부분만');
  assert.deepStrictEqual(plain(d.put), [[2, 1, '#FFE45C', 24, [5, 5]]], '형광펜은 1');
  eq(d.del.length, 0);
  eq(snap.sent.get(1).n, 4, '앞 기록은 바꾸지 않는다');
  const d2 = LiveCore.inkDelta([{ id: 2, s: b }], d.sent, 1);
  assert.deepStrictEqual(plain(d2), { put: [], more: [], del: [1], sent: {} });
  const same = LiveCore.inkDelta([{ id: 2, s: b }], d2.sent, 1);
  assert.equal(same.put.length + same.more.length + same.del.length, 0, '바뀐 것이 없으면 빈 묶음');
});

test('inkFresh: 같은 판이거나 더 새 판이면 맞다. 빈 쪽(0)은 꼭 같아야 한다', () => {
  assert.equal(LiveCore.inkFresh(5, 5), true);
  assert.equal(LiveCore.inkFresh(7, 5), true, '상태보다 뒤에 온 묶음을 이미 받았다');
  assert.equal(LiveCore.inkFresh(3, 5), false);
  assert.equal(LiveCore.inkFresh(-1, 5), false, '놓친 묶음이 있는 쪽');
  assert.equal(LiveCore.inkFresh(0, 0), true);
  assert.equal(LiveCore.inkFresh(12, 0), false, '다른 칠판이 그 번호로 당겨져 비었다');
});

test('clean: 판서 묶음·다시 달라는 요청의 모양을 검사한다', () => {
  const base = { tid: 'tttt0000', ep: 1, pg: 's1', rev: 9 };
  const ok = LiveCore.clean('ink', { ...base, base: 8, put: [[3, 0, '#1F2328', 6, [1, 2, 3, 4]]], more: [[2, [1, 1]]], del: [1], x: 1 }, 3);
  assert.deepStrictEqual(plain(ok), { ...base, base: 8, put: [[3, 0, '#1F2328', 6, [1, 2, 3, 4]]], more: [[2, [1, 1]]], del: [1] });
  assert.deepStrictEqual(plain(LiveCore.clean('ink', { ...base, base: 8 }, 3)), { ...base, base: 8, put: [], more: [], del: [] }, '빠진 목록은 빈 목록');
  assert.deepStrictEqual(plain(LiveCore.clean('ink', { ...base, snap: [] }, 3)), { ...base, snap: [] }, '빈 쪽 전체');
  const bad = [
    { ...base, base: 8, put: [[3, 0, 'red', 6, [1, 2]]] },               // 색 모양
    { ...base, base: 8, put: [[3, 0, '#000', 99, [1, 2]]] },             // 굵기
    { ...base, base: 8, put: [[3, 2, '#000', 6, [1, 2]]] },              // 도구
    { ...base, base: 8, put: [[3, 0, '#000', 6, [1, 2, 3]]] },           // 홀수 좌표
    { ...base, base: 8, put: [[3, 0, '#000', 6, [1.5, 2]]] },            // 정수가 아님
    { ...base, base: 8, more: [[2, [1e6, 0]]] },                          // 너무 큰 값
    { ...base, base: 8, del: ['1'] },
    { ...base },                                                          // 앞 판 번호 없음
    { ...base, pg: 's3', snap: [] },                                      // 없는 장
    { ...base, pg: 'b200', snap: [] },
    { ...base, pg: 's01', snap: [] },
    { ...base, rev: 0, snap: [] },
    { ...base, tid: 'x', snap: [] },
    { ...base, snap: 'x' },
  ];
  for (const m of bad) assert.equal(LiveCore.clean('ink', m, 3), null, JSON.stringify(m));
  const many = Array.from({ length: 11 }, (_, i) => [i, 0, '#000', 6, Array(40000).fill(0)]);
  assert.equal(LiveCore.clean('ink', { ...base, snap: many }, 3), null, '좌표가 너무 많은 메시지');
  assert.deepStrictEqual(plain(LiveCore.clean('need', { sid: 'abcd1234', pg: 'b0', have: -1 }, 3)), { sid: 'abcd1234', pg: 'b0', have: -1 });
  assert.equal(LiveCore.clean('need', { sid: 'abcd1234', pg: 's9', have: 0 }, 3), null);
  const s = LiveCore.clean('state', {
    tid: 'tttt0000', slide: 0, shown: 0, reach: [null], ink: { ep: 2, pg: 'b1', rev: 0 }, board: { i: 1, n: 2, bg: 'green' },
  }, 1);
  assert.deepStrictEqual(plain(s.ink), { ep: 2, pg: 'b1', rev: 0 });
  assert.deepStrictEqual(plain(s.board), { i: 1, n: 2, bg: 'green' });
  const t = LiveCore.clean('state', { tid: 'tttt0000', slide: 0, shown: 0, reach: [null], ink: { ep: 2, pg: 's5', rev: 1 }, board: { i: 2, n: 2, bg: 'red' } }, 1);
  eq(t.ink, null, '없는 장');
  eq(t.board, null, '모르는 바탕·범위 밖 칠판');
});

test('code·sid 모양', () => {
  for (let i = 0; i < 50; i++) {
    assert.match(LiveCore.code(), /^[1-9]\d{5}$/);
    assert.match(LiveCore.sid(), /^[a-z0-9]{8}$/);
  }
});
