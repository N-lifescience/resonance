# Resonance lite

> 2026-11-16: 이 폴더는 공개 저장소 [N-lifescience/resonance-lite](https://github.com/N-lifescience/resonance-lite)로 옮겼다. 마주온 에이전트는 `https://cdn.jsdelivr.net/gh/N-lifescience/resonance-lite@1/lite.js`를 쓴다. 고칠 때는 그 저장소에서 고친다.

수업 글을 공명 엔진 HTML로 바꾸는 단일 파일 렌더러다. 빌드와 외부 라이브러리가 필요 없으며, 브라우저 코드는 ES2017 범위에서 작성했다. 입력 문법은 [SPEC.md](SPEC.md), 엔진 부품 문법은 `skills/exploragram/references/components.md`를 따른다.

- `lite.js`: 파서, 순수 렌더러, 틀 6개, CSS, 브라우저 초기화와 장 나누기.
- `test/parse.test.mjs`: Node 기본 모듈만 쓰는 시험. 실제 엔진 식 파서로 계산도 확인한다.
- `examples/all-parts.html`: 틀 6개와 퀴즈, 분류, 순서, 그림 두 칸 배치.
- `examples/states.json`: 위 예제의 1~6장 조작 상태 12개. 퍼지기는 초기화한 상태와 움직이는 상태를 비교한다.
- `examples/ion-3-1.html`: 기존 본보기. 내용은 수정하지 않는다.
- `examples/_rendered-*.html`: 눈으로 볼 수 있게 미리 펼친 파일. `.gitignore`로 제외한다.

## API

```js
const { parseLesson, renderLesson } = require('./lite/lite.js');
// Node ESM: import { parseLesson, renderLesson } from './lite/lite.js';
const lesson = parseLesson('# 제목\n본문');
const html = renderLesson('# 제목\n본문');
```

`parseLesson`은 `{ settings: { accent, deck }, slides, warnings }`를 반환한다. 각 장은 `{ id, title, type, section, blocks }`이고, 문법 문제가 있으면 `warnings`에 1부터 센 줄 번호와 설명을 담는다. 두 함수는 DOM을 읽거나 입력을 바꾸지 않는다. `renderLesson`의 반환값은 `section.slide` 조각이며 CSS와 엔진은 포함하지 않는다.

추가 API는 `paginateLesson(lesson, measure?)`와 `css` 문자열이다. `measure`는 장 구조를 받아 본문 높이(px)를 반환한다. 측정하지 못하면 글자 수로 어림한다. `renderLesson(text, { paginate: true })`로 같은 어림 나누기를 쓸 수 있다. 브라우저에서는 CSS를 기다린 뒤 화면 밖 1280×720 장에서 실제 높이를 재어 나눈다. 활동은 통째로 유지한다. 문단이나 활동 하나만으로 한 장보다 크면 그 덩어리는 그대로 남긴다.

브라우저에서는 `window.ResonanceLite`로 API를 제공하고 자동 초기화한다. `script[data-engine]`으로 엔진 폴더를 지정하며 기본값은 `https://cdn.jsdelivr.net/gh/N-lifescience/resonance@2/engine/`다. 이미 펼친 장이 있으면 엔진만 불러오고, 엔진 스크립트는 중복 삽입하지 않는다.

그래프의 가로 변수는 한 글자 영문이어야 한다. `x`, 함수명, 상수명뿐 아니라 계산 결과에 쓰는 `y`도 `a`로 바꾸어 충돌을 막는다. 원자번호 19·20은 2, 8, 8, 2 배치에 필요한 네 번째 껍질을 추가한다.

## 시험

저장소 루트에서 실행한다.

```sh
node lite/test/parse.test.mjs
```

문법, 이스케이프, 결정적 퀴즈 섞기, 틀의 식과 처음·끝 계산값, 장 나누기, 초기화 순서를 검사한다. 초기화 검사는 Node 모의 DOM으로 수행하며 실제 브라우저 배치 검사를 대신하지 않는다.

Chrome 점검은 별도로 실행한다. 이번 구현 작업에서는 사용자 요청에 따라 실행하지 않았다.

```sh
node skills/exploragram/scripts/states.mjs lite/examples/ion-3-1.html /tmp/lite-ion
node skills/exploragram/scripts/states.mjs lite/examples/all-parts.html /tmp/lite-all lite/examples/states.json
```

실제 화면의 넘침과 정렬, `errors 0` 여부는 위 점검에서 확인해야 한다. 엔진을 고치면 식 파서 호환 시험도 다시 돌린다.
