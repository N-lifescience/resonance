import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from './load.mjs';

const { Compat } = load(['15-compat.js'], ['Compat']);

test('rewrite: :where(.slide) 뒤 태그만 있으면 section 안으로, 클래스·속성이 있으면 조건만 덜어 낸다(특정도가 같다)', () => {
  eq(Compat.rewrite(':where(.slide) h1 { font-size: 80px; }'), 'section h1{ font-size: 80px; }\n');
  eq(Compat.rewrite(':where(.slide) .kicker { font-size: 20px }'), '.kicker{ font-size: 20px }\n');
  eq(Compat.rewrite(':where(.slide) h2[data-n]::before { x: 1 }'), 'h2[data-n]::before{ x: 1 }\n');
  eq(Compat.rewrite(':where(.slide) > h2 { x: 1 }'), '.slide > h2{ x: 1 }\n');
  eq(Compat.rewrite(':where(.slide) .calc input[type="range"] { x: 1 }'), '.calc input[type="range"]{ x: 1 }\n');
  eq(Compat.rewrite(':where(.slide) .calc output { x: 1 }'), '.calc output{ x: 1 }\n');   // 클래스가 앞에 있어도 묶지 않는다
  eq(Compat.rewrite(':where(.slide) ul li { x: 1 }'), 'section ul li{ x: 1 }\n');
});

test('rewrite: 고칠 것이 없는 규칙은 넣지 않고, 버려진 규칙의 다른 선택자는 함께 쓴다', () => {
  eq(Compat.rewrite('.a { x: 1 } h1 { y: 2 }'), '');
  eq(Compat.rewrite('.a, :where(.slide) p { x: 1 }'), '.a,section p{ x: 1 }\n');
});

test('rewrite: :is()·나머지 :where()는 고를 것마다 풀고, :not(가, 나)는 이어 쓰며, :has()는 뺀다', () => {
  eq(Compat.rewrite('.x :is(b, small) { x: 1 }'), '.x b,.x small{ x: 1 }\n');
  eq(Compat.rewrite(':where(.slide) :is(b, small) { x: 1 }'), 'section b,section small{ x: 1 }\n');
  eq(Compat.rewrite(':where([data-theme="ppt"] .slide) h2:where(:not([data-n])) { x: 1 }'), '[data-theme="ppt"] h2:not([data-n]){ x: 1 }\n');
  eq(Compat.rewrite(':where(.slide .sort) .bin { x: 1 }'), '.sort .bin{ x: 1 }\n');   // 수업 CSS의 .sort .bin과 특정도가 같다
  eq(Compat.rewrite('.a:not(.b, .c) { x: 1 }'), '.a:not(.b):not(.c){ x: 1 }\n');
  eq(Compat.rewrite('.a:has(.b), .c :is(.d) { x: 1 }'), '.c .d{ x: 1 }\n');
});

test('rewrite: @media 안도 풀고, @import·@keyframes·주석·따옴표 속 괄호는 건드리지 않는다', () => {
  const css = '@import url("x.css");\n/* :where(.slide) p {} */\n@keyframes k { from { a: 1 } to { a: 2 } }\n'
    + '@media print { :where(.slide) p { x: 1 } .q { y: 2 } }\n.z[data-a="{:is(b)}"] :is(i) { content: "}"; }';
  eq(Compat.rewrite(css), '@media print{section p{ x: 1 }\n}\n.z[data-a="{:is(b)}"] i{ content: "}"; }\n');
});

test('rewrite: 빌드한 엔진 CSS의 :where·:is 규칙을 모두 옛 브라우저가 읽는 모양으로 푼다', () => {
  const css = readFileSync(new URL('../../engine/exploragram.css', import.meta.url), 'utf8');
  const out = Compat.rewrite(css);
  assert.ok(out.length > 1000);
  assert.ok(!/:(where|is)\(/.test(out), '풀지 못한 :where·:is가 남지 않는다');
  assert.ok(out.includes('section h1{') && out.includes('section p,section li{'), '장 제목·본문 크기');
});

function eq(a, b) { assert.equal(a, b); }
