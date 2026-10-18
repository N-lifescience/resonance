// 배포 사이트를 _site/로 묶는다. 원본 에셋은 제외하고 수업의 CDN 엔진을 로컬로 바꾼다.
// 사용: node tools/build.mjs && node tools/site.mjs
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '_site');
const examples = join(root, 'skills/exploragram/references/examples');
const v3 = join(root, 'examples/v3');
const CDN_ENGINE = /https:\/\/cdn\.jsdelivr\.net\/gh\/N-lifescience\/resonance@2\/engine\//g;
const validSlug = (name) => /^[\w-]{1,60}$/.test(name);
const names = new Set();
const lessons = [];
function reserve(filename, origin) {
  const slug = filename.slice(0, -5);
  if (!validSlug(slug)) throw new Error(`Invalid lesson filename: ${origin}/${filename}`);
  const key = slug.toLowerCase();
  if (names.has(key)) throw new Error(`Duplicate lesson filename: ${origin}/${filename}`);
  names.add(key);
  return slug;
}
// 먼저 검증한다. 잘못된 이름이나 충돌이 있으면 기존 빌드 결과를 지우지 않는다.
const siteLessons = join(root, 'site/lessons');
if (existsSync(siteLessons)) {
  for (const name of readdirSync(siteLessons).filter((name) => name.endsWith('.html'))) reserve(name, 'site/lessons');
}
for (const name of readdirSync(examples).filter((name) => name.endsWith('.html'))) {
  reserve(name, 'references/examples');
  lessons.push({ name, path: join(examples, name) });
}
const metadata = [];
if (existsSync(v3)) {
  const files = readdirSync(v3).sort();
  const v3Names = new Set();
  for (const name of files.filter((name) => name.endsWith('.html'))) {
    v3Names.add(reserve(name, 'examples/v3'));
    lessons.push({ name, path: join(v3, name) });
  }
  const metaNames = new Set();
  for (const name of files.filter((name) => /^meta-.*\.json$/.test(name))) {
    const data = JSON.parse(readFileSync(join(v3, name), 'utf8'));
    if (!Array.isArray(data)) throw new Error(`Expected metadata array: examples/v3/${name}`);
    for (const item of data) {
      if (!item || typeof item.slug !== 'string' || !validSlug(item.slug) || !v3Names.has(item.slug)) throw new Error(`Metadata needs a matching v3 lesson: examples/v3/${name}`);
      if (metaNames.has(item.slug)) throw new Error(`Duplicate metadata slug: ${item.slug}`);
      metaNames.add(item.slug);
      metadata.push(item);
    }
  }
}
rmSync(out, { recursive: true, force: true });
const sourceAssets = join(root, 'site/assets/_src');
cpSync(join(root, 'site'), out, {
  recursive: true,
  filter: (source) => source !== sourceAssets && !source.startsWith(sourceAssets + sep)
});
mkdirSync(join(out, 'engine'), { recursive: true });
for (const name of ['exploragram.js', 'exploragram.css']) cpSync(join(root, 'engine', name), join(out, 'engine', name));
mkdirSync(join(out, 'lessons'), { recursive: true });
if (existsSync(join(examples, 'media'))) cpSync(join(examples, 'media'), join(out, 'lessons/media'), { recursive: true });
if (existsSync(join(v3, 'media'))) cpSync(join(v3, 'media'), join(out, 'lessons/media'), { recursive: true });
for (const { name, path } of lessons) {
  writeFileSync(join(out, 'lessons', name), readFileSync(path, 'utf8').replace(CDN_ENGINE, '../engine/'));
}
writeFileSync(join(out, 'lessons/meta.json'), JSON.stringify(metadata, null, 2) + '\n');
// 이미 나간 연수 슬라이드와 소개 덱 주소를 유지한다.
cpSync(join(root, 'examples/assets'), join(out, 'examples/assets'), { recursive: true });
for (const name of ['training.html', 'intro-story.html']) cpSync(join(root, 'examples', name), join(out, 'examples', name));
const live = JSON.parse(readFileSync(join(root, 'live.config.json'), 'utf8'));
writeFileSync(join(out, 'live-config.js'), `window.EXPLORAGRAM_LIVE = ${JSON.stringify(live)};\n`);
writeFileSync(join(out, '.nojekyll'), '');
console.log(`site → ${out} (${metadata.length} v3 lessons in meta.json)`);
