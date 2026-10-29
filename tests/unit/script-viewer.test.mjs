import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { plain } from './load.mjs';

// 대본 뷰어(script-viewer/viewer.js)의 순수 함수. document가 없으면 화면 코드는 건너뛴다.
const code = readFileSync(new URL('../../script-viewer/viewer.js', import.meta.url), 'utf8');
const ctx = vm.createContext({ console });
vm.runInContext(code, ctx);
const S = ctx.LectureScript;

const MD = `---
title: 삼투 1차시 대본
deck: v3-high-bio
minutes: 2
level: 일반 학급
화법:
  유머 방식: 강사가
  질문·문답 방식: 강사나
---

## cover · 표지
@참고 강사가 | 엉뚱한 질문으로 시작
@연출 학생들을 천천히 둘러본다.
배추에 소금을 뿌리면 왜 숨이 죽을까요?
@질문 소금이 물을 끌어당기는 걸까요?
@예상 네 / 아니요
@대기 5초 손을 들게 한다

## goal · 학습 목표
오늘은 세 가지를 배웁니다.

### ▶1
첫째, 삼투의 방향.

### ▶2
@생략가능(부가 예시) 김치 담글 때를 떠올려 보세요.
@조작 슬라이더를 끝까지 민다.
`;

test('머리말, 장, 단계, 태그를 읽는다', () => {
  const d = S.parse(MD);
  assert.deepEqual(plain(d.errors), []);
  assert.equal(d.meta.title, '삼투 1차시 대본');
  assert.equal(d.meta.minutes, 2);
  assert.deepEqual(plain(d.meta.화법), { '유머 방식': '강사가', '질문·문답 방식': '강사나' });
  assert.deepEqual(plain(d.slides.map((s) => [s.id, s.title, s.blocks.length])), [['cover', '표지', 1], ['goal', '학습 목표', 3]]);
  const kinds = d.slides[0].blocks[0].lines.map((l) => l.kind);
  assert.deepEqual(plain(kinds), ['ref', 'cue', 'say', 'question', 'answer', 'wait']);
  const wait = d.slides[0].blocks[0].lines[5];
  assert.equal(wait.seconds, 5);
  assert.equal(wait.text, '손을 들게 한다');
  const ref = d.slides[0].blocks[0].lines[0];
  assert.equal(ref.instructor, '강사가');
  assert.equal(d.slides[1].blocks[2].lines[0].reason, '부가 예시');
});

test('발화량은 한글·숫자·영문만 세고, 시간은 290음절/분과 문장 쉼으로 계산한다', () => {
  assert.equal(S.units('ATP 2개, 안녕!'), 7);
  assert.equal(Math.round(S.speechSeconds('가'.repeat(290) + '.') * 10) / 10, 60.4);
  assert.equal(S.parseDuration('1분 30초'), 90);
  assert.equal(S.parseDuration('8초'), 8);
  assert.ok(Number.isNaN(S.parseDuration('잠깐')));
});

test('말하는 줄과 대기만 시간에 넣고, 연출·예상 답·조작·참고는 뺀다', () => {
  const d = S.parse('## a · 가\n@연출 아주 긴 연출 지문입니다 아주 긴 연출 지문입니다\n@예상 긴 답 긴 답 긴 답\n@조작 누른다\n@대기 10초');
  assert.equal(S.slideTime(d.slides[0]).total, 10);
  const opt = S.parse('## a · 가\n@생략가능(예시) 가나다라마.');
  const t = S.slideTime(opt.slides[0]);
  assert.ok(t.total > 0 && t.total === t.optional);
});

test('형식이 맞으면 점검 오류가 없다', () => {
  const r = S.check(S.parse(MD));
  assert.deepEqual(plain(r.errors), []);
});

test('형식 오류를 잡는다: 모르는 태그, 대기 시간, 단계 번호, 빈 장, 비트, 화법에 없는 강사, 장 밖 글', () => {
  const bad = `---
화법:
  유머 방식: 강사가
---
떠도는 글
## a · 가
@몰라 이건
@대기 잠깐
### ▶2
말
## b · 나
@연출 연출만 있다
## c · 다
@비트 개념: 삼투
@참고 강사다 | 기법
말
## a · 다시
말`;
  const r = S.check(S.parse(bad));
  const all = r.errors.join('\n');
  for (const want of ['모르는 태그', '@대기 뒤에는', '▶1부터', 'b: 할 말도', '@비트가 남아', "'강사다'가 머리말 화법에 없다", '장 밖의 글', 'a: 같은 장이 두 번']) assert.match(all, new RegExp(want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), want);
});

test('목표 시간과 25% 넘게 다르면 경고한다', () => {
  const d = S.parse(`---\nminutes: 10\n---\n## a · 가\n짧은 말.`);
  assert.match(S.check(d).warnings.join(), /25%/);
});

test('단계 묶음은 엔진 규칙과 같다: data-step이 같으면 한 번, 없으면 앞 단계 다음에 하나씩', () => {
  assert.equal(S.groupCount([]), 0);
  assert.equal(S.groupCount([null, null]), 2);
  assert.equal(S.groupCount([1, 2, 3]), 3);
  assert.equal(S.groupCount([1, 1, 2]), 2);
  assert.equal(S.groupCount([1, null, 2, null]), 4);
  assert.equal(S.groupCount([2, 1, 2]), 2);
});

test('수업 HTML과 맞추기: 없는 장, 빠진 장, 순서, 단계 수, deck 이름', () => {
  const doc = S.parse(MD);
  const ok = { deck: 'v3-high-bio', slides: [{ id: 'cover', title: '표지', steps: 0 }, { id: 'goal', title: '목표', steps: 2 }] };
  assert.deepEqual(plain(S.compare(doc, ok)), { errors: [], warnings: [] });
  const bad = { deck: 'other', slides: [{ id: 'goal', title: '목표', steps: 1 }, { id: 'cover', title: '표지', steps: 0 }, { id: 'new', title: '새 장', steps: 0 }] };
  const r = S.compare(doc, bad);
  const all = r.errors.join('\n');
  assert.match(all, /new: 대본에 없는 장/);
  assert.match(all, /장 순서가 수업 HTML과 다르다/);
  assert.match(all, /goal: 대본의 단계는 ▶2개인데 수업 HTML의 단계\(\.step\)는 1개다/);
  assert.match(r.warnings.join(), /data-deck/);
  const extra = S.compare(S.parse('## ghost · 유령\n말'), ok);
  assert.match(extra.errors.join(), /ghost: 수업 HTML에 없는 장/);
});

test('AI에게 보낼 말에 오류와 확인 항목을 모두 담는다', () => {
  const msg = S.aiMessage({ errors: ['a: 오류'], warnings: ['b: 경고'] });
  assert.match(msg, /- \[오류\] a: 오류/);
  assert.match(msg, /- \[확인\] b: 경고/);
});

test('단계 막대 칸 수는 엔진처럼 첫 칸 시작을 빼고 센다', () => {
  assert.equal(S.stopCount('시작|1단계|2단계'), 2);
  assert.equal(S.stopCount('가|나|다'), 3);
  assert.equal(S.stopCount(' 시작 | 가 |'), 1);
  assert.equal(S.stopCount(''), 0);
});

test('막대가 있는 장에 @조작이 없으면 확인 항목으로 알린다', () => {
  const deck = { deck: '', slides: [{ id: 'a', title: '가', steps: 0, bars: 6 }] };
  assert.match(S.compare(S.parse('## a · 가\n말'), deck).warnings.join(), /막대가 → 키로 6칸/);
  assert.equal(S.compare(S.parse('## a · 가\n@조작 → 키로 막대 한 칸\n말'), deck).warnings.length, 0);
});

test('한글이나 점이 든 장 id도 읽는다', () => {
  const d = S.parse('## 도입-1 · 시작\n말\n## sec.2 · 둘\n말');
  assert.deepEqual(plain(d.errors), []);
  assert.deepEqual(plain(d.slides.map((s) => s.id)), ['도입-1', 'sec.2']);
});

test('단계 제목을 잘못 쓴 "## ▶1"은 장으로 읽지 않고 오류로 알린다', () => {
  const d = S.parse('## a · 가\n말\n## ▶1\n말');
  assert.equal(d.slides.length, 1);
  assert.match(S.check(d).errors.join(), /장 제목은/);
});

test('단계 막대 칸 이름의 <br>은 엔진처럼 줄바꿈으로 본다', () => {
  assert.equal(S.stopCount('시작<br>|가|<br>|나'), 2);
});

test('편집: 줄의 글만 바꾸고 태그, 대기 시간, 강사 이름, 장 id는 지킨다', () => {
  const d = S.parse(MD);
  const [ref, , say, q, , wait] = d.slides[0].blocks[0].lines;
  const opt = d.slides[1].blocks[2].lines[0];
  let md = MD;
  md = S.editLine(md, say.lineNo, '배추가 왜 **흐물흐물**해질까요?');
  md = S.editLine(md, q.lineNo, '소금이 물을 당길까요?');
  md = S.editLine(md, wait.lineNo, '공책에 적게 한다');
  md = S.editLine(md, ref.lineNo, '질문으로 시작');
  md = S.editLine(md, opt.lineNo, '깍두기를 떠올려 보세요.');
  md = S.editLine(md, d.slides[1].lineNo, '오늘 배울 것', 'slide');
  md = S.editLine(md, d.titleLine, '삼투 대본', 'title');
  const e = S.parse(md);
  assert.deepEqual(plain(e.errors), []);
  assert.equal(e.meta.title, '삼투 대본');
  assert.equal(e.slides[1].id, 'goal');
  assert.equal(e.slides[1].title, '오늘 배울 것');
  const lines = e.slides[0].blocks[0].lines;
  assert.deepEqual(plain(lines.map((l) => l.kind)), ['ref', 'cue', 'say', 'question', 'answer', 'wait']);
  assert.equal(lines[2].text, '배추가 왜 **흐물흐물**해질까요?');
  assert.equal(lines[3].text, '소금이 물을 당길까요?');
  assert.equal(lines[5].seconds, 5);
  assert.equal(lines[5].text, '공책에 적게 한다');
  assert.equal(lines[0].instructor, '강사가');
  assert.equal(lines[0].technique, '질문으로 시작');
  assert.equal(e.slides[1].blocks[2].lines[0].reason, '부가 예시');
  assert.equal(md.split('\n').length, MD.split('\n').length);
});

test('편집: 대사를 비우면 그 줄이 빠지고, @나 #로 시작하는 대사는 태그로 읽히지 않는다', () => {
  const d = S.parse(MD);
  const say = d.slides[0].blocks[0].lines[2];
  const gone = S.parse(S.editLine(MD, say.lineNo, '  '));
  assert.equal(gone.slides[0].blocks[0].lines.length, 5);
  const odd = S.parse(S.editLine(MD, say.lineNo, '@질문 아님'));
  assert.deepEqual(plain(odd.errors), []);
  assert.equal(odd.slides[0].blocks[0].lines[2].kind, 'say');
  assert.equal(odd.slides[0].blocks[0].lines[2].text, '＠질문 아님');
});

test('편집 저장: 대본 안의 </script>는 끊기지 않게 바꾼다', () => {
  assert.equal(S.scriptSafe('a </script> b </SCRIPT>'), 'a <\\/script> b <\\/SCRIPT>');
});
