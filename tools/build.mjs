// engine/src/*.js 와 engine/css/*.css 를 이름 순서대로 이어 붙여 배포 파일 두 개를 만든다.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '2.7.1';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function concat(dir, ext) {
  return readdirSync(join(root, dir))
    .filter((f) => f.endsWith(ext))
    .sort()
    .map((f) => `/* ---- ${f} ---- */\n${readFileSync(join(root, dir, f), 'utf8').trim()}\n`)
    .join('\n');
}

const banner = `/*! exploragram engine v${VERSION} | © N-lifescience | https://github.com/N-lifescience/resonance */`;
// 실시간 수업 설정(Supabase 주소·공개 키, 사이트 주소). 브라우저에 넣으라고 만든 공개 키만 둔다.
const live = JSON.parse(readFileSync(join(root, 'live.config.json'), 'utf8'));
writeFileSync(join(root, 'engine/exploragram.js'),
  `${banner}\n(function () {\n'use strict';\nconst VERSION = '${VERSION}';\nconst LIVE_CONFIG = ${JSON.stringify(live)};\n${concat('engine/src', '.js')}\n})();\n`);
writeFileSync(join(root, 'engine/exploragram.css'), `${banner}\n${concat('engine/css', '.css')}`);
console.log(`built exploragram v${VERSION}`);

// 채팅 AI용 합본 지침: 스킬 문서와 references를 파일 하나로 잇는다(주소 하나만 주면 되게).
const skill = join(root, 'skills/exploragram');
const read = (rel) => readFileSync(join(skill, rel), 'utf8').replace(/^---[\s\S]*?---\n/, '').trim();
const demote = (md) => md.replace(/^# .*\n+/, '').replace(/^(#+) /gm, '#$1 ');   // 맨 위 제목은 절 제목이 대신하고, 나머지는 한 단계 아래로
const title = (rel) => (/^# (.+)$/m.exec(read(rel)) || [, rel])[1];
const parts = [
  ['절차와 기준', 'SKILL.md'],
  ['기능 목록', 'references/feature-menu.md'],
  ['익스플로라그램', 'references/exploragram.md'],
  ['화면과 원본 모양', 'references/design.md'],
  ['부품 사전', 'references/components.md'],
  ['한국어 문장', 'references/korean.md'],
];
// 레퍼런스 완성본(HTML)은 합본에 넣지 않고 주소로 알린다
const EXAMPLES = 'https://cdn.jsdelivr.net/gh/N-lifescience/resonance@2/skills/exploragram/references/examples/';
const examples = readdirSync(join(skill, 'references/examples')).filter((f) => f.endsWith('.html')).sort();
const guide = [
  '# exploragram 합본 지침',
  '',
  '> **AI에게**: 이 파일 하나가 Exploragram 지침 전체다. 선생님이 수업 PPT를 주면 이 지침대로 수업용 HTML을 만든다.',
  '> **반드시**: `<head>`에 아래 엔진 css·js 두 줄을 넣는다(지금 환경에서 안 열려도 그대로 둔다). 넘기기·툴바를 직접 짜지 않고, PPT 장을 통째로 그림으로 넣지 않는다(1절 기준 8·9).',
  '> 본문의 `references/…`는 이 파일의 해당 절을, `scripts/…`는 저장소 https://github.com/N-lifescience/resonance 의 `skills/exploragram/scripts/`를 가리킨다.',
  `> 엔진: \`https://cdn.jsdelivr.net/gh/N-lifescience/resonance@2/engine/exploragram.css\`·\`.js\` (v${VERSION})`,
  `> 레퍼런스 완성본(\`references/examples/\`): ${examples.map((f) => `${EXAMPLES}${f}`).join(' · ')}`,
  '',
  '## 차례',
  '',
  ...parts.map(([title], i) => `${i + 1}. ${title}`),
  '',
  ...parts.flatMap(([title, file], i) => ['---', '', `## ${i + 1}. ${title}`, '', demote(read(file)), '']),
].join('\n');
mkdirSync(join(root, 'guide'), { recursive: true });
writeFileSync(join(root, 'guide/exploragram-guide.md'), `<!-- 자동 생성: node tools/build.mjs (손으로 고치지 않는다) -->\n${guide}`);
console.log(`guide ${guide.length} chars`);

// 대본 합본 지침: 채팅 AI가 주소 하나로 읽고, 강사 카드 탭이 대본 묶음 파일에 넣는다.
const scriptSkill = join(root, 'skills/lecture-script');
const readScript = (rel) => readFileSync(join(scriptSkill, rel), 'utf8').replace(/^---[\s\S]*?---\n/, '').trim();
const scriptParts = [
  ['절차와 기준', 'SKILL.md'],
  ['대본 형식', 'references/format.md'],
  ['화법 적용 기준', 'references/performance.md'],
];
const CDN = 'https://cdn.jsdelivr.net/gh/N-lifescience/resonance@2';
// 대본 형식 예시(코드 상자 안의 '## 장id', '### ▶1')는 제목이 아니므로 단계를 낮추지 않는다.
const demoteOutsideFences = (md) => {
  let fence = false;
  return md.replace(/^# .*\n+/, '').split('\n').map((line) => {
    if (/^\s*```/.test(line)) { fence = !fence; return line; }
    return fence ? line : line.replace(/^(#+) /, '#$1 ');
  }).join('\n');
};
const scriptGuide = [
  '# 강사 화법 대본 합본 지침',
  '',
  '> **AI에게**: 이 파일 하나가 대본 지침 전체다. 선생님이 공명 수업 HTML과 강사 화법 묶음을 주면 이 지침대로 대본 HTML을 만든다.',
  '> **반드시**: `<head>`에 아래 대본 뷰어 css·js 두 줄을 넣는다(지금 환경에서 안 열려도 그대로 둔다). 장의 예상 시간은 쓰지 않는다(뷰어가 센다. `@대기 N초`는 쓴다). 장 id와 ▶ 개수는 수업 HTML과 같게 쓴다.',
  `> 이 파일 안의 이름: \`SKILL.md\` = 1절 「절차와 기준」, \`references/format.md\` = 2절 「대본 형식」, \`references/performance.md\` = 3절 「화법 적용 기준」, \`assets/template.html\` = 4절 「대본 HTML 뼈대」. \`references/examples/\`의 레퍼런스 대본은 아래 주소로 연다.`,
  `> 대본 뷰어: \`${CDN}/script-viewer/viewer.css\`·\`.js\``,
  `> 레퍼런스 대본: ${CDN}/skills/lecture-script/references/examples/v3-high-bio-script.html (그 수업 HTML: ${CDN}/examples/v3/v3-high-bio.html)`,
  '',
  '## 차례',
  '',
  ...scriptParts.map(([title], i) => `${i + 1}. ${title}`),
  `${scriptParts.length + 1}. 대본 HTML 뼈대`,
  '',
  ...scriptParts.flatMap(([title, file], i) => ['---', '', `## ${i + 1}. ${title}`, '', demoteOutsideFences(readScript(file)), '']),
  '---',
  '',
  `## ${scriptParts.length + 1}. 대본 HTML 뼈대`,
  '',
  '```html',
  readFileSync(join(scriptSkill, 'assets/template.html'), 'utf8').trim(),
  '```',
  '',
].join('\n');
writeFileSync(join(root, 'guide/script-guide.md'), `<!-- 자동 생성: node tools/build.mjs (손으로 고치지 않는다) -->\n${scriptGuide}`);
console.log(`script guide ${scriptGuide.length} chars`);
