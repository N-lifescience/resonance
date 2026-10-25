# 강사 카드 탭 — 설계 브리프 (2026-10-25)

브랜치 `feat/card-vault`에서 만든다. main에는 화요일 연수가 끝난 뒤, 맥미니 세션의 UI/UX 브랜치와 함께 정리해 합친다.

## 목표

다른 선생님이 설치 없이 공명 사이트에서 유명 강사의 화법을 분석한 **강사 카드**를 만들고 모은다. 모은 카드를 화법 항목별로 조합해 공명 수업 HTML에 맞는 **강사 화법 대본**을 쓰게 한다. 효과는 class-helper(수업자료제작기)와 같게 한다. class-helper의 대본 품질을 정하는 것은 두 글이다.

- 영상 분석 요청문 13항목(`class-helper/references/Gemini_영상분석_요청문.md`)
- 대본 제작 기준·5층 매트릭스(`class-helper/scripts/lesson-performance.md`)

둘 다 글이라 어떤 AI든 읽는다. 서버가 하던 일은 브라우저와 AI 대화로 옮긴다.

## 선생님이 따라 하는 순서

1. **강사 카드** 탭: 유튜브 영상으로 강사 카드를 만들고 쌓는다. 강사마다 한 번이면 된다.
2. **제작하기**: 지금처럼 쓰던 AI로 수업 HTML을 만든다.
3. **강사 카드** 탭: 화법 항목마다 카드를 고르고 「대본 묶음 저장」을 누른다. md 파일 하나가 나온다.
4. 쓰던 AI에 수업 HTML과 묶음 파일을 올리고 "이 자료로 대본 써줘"라고 쓴다. AI가 묻고 설계표를 확인받은 뒤 대본을 준다.

## 나눠 만들기

| 차례 | 내용 | 이 브랜치 |
|---|---|---|
| 1차 | 강사 카드 탭(만들기·보관·조합·묶음 저장) | 한다 |
| 2차 | 대본 지침(`guide/script-guide.md`)과 대본 뷰어(대본 HTML, 시간 계산·인쇄·장 점검) | 다음 |
| 3차 | 제작하기에 4단계 안내, 공명 지침 끝에 대본 지침 주소 한 줄 | 다음 |

엔진(`engine/`)은 건드리지 않는다.

## 1차: 강사 카드 탭

### 자리

- 새 쪽 `site/cards.html`. 머리 메뉴에 「강사 카드」를 「살펴보기」「제작하기」 다음에 더한다(`index.html`, `explore.html`, `make.html`의 `pill-nav` 한 줄씩).
- 새 파일 `site/assets/js/cards.js`, `site/assets/css/cards.css`, `site/assets/cards/prompt.md`. `site.css`와 `site.js`는 고치지 않는다. 맥미니 UI 브랜치와 겹치는 곳을 메뉴 세 줄로 줄이려는 것이다.
- 화면 색·글꼴·문구 규칙은 `docs/v3-brief.md`를 따른다.

### 화면

1. **카드 추가**
   - 새 카드(강사 이름) 또는 기존 카드를 고른다.
   - 유튜브 주소를 한 번에 10개까지, 카드당 30개까지 넣는다. 분석 구간(시작·끝)과 배우고 싶은 점을 적는다.
   - 「Gemini로 분석」: 키가 있을 때. 영상을 하나씩 차례로 분석하고 영상마다 상태(기다림·분석 중·완료·실패)를 보인다.
   - 「AI Studio로 분석」(펼침): 주소와 구간을 채운 요청문을 복사하는 단추, AI Studio 열기 링크, 결과 붙여넣기 칸, 「카드에 넣기」. 키도 사용량도 없이 카드를 만든다.
2. **보관함**
   - 카드 목록: 대표 사진(유튜브 썸네일 또는 직접 올린 사진), 강사 이름, 분석한 영상 수.
   - 카드를 열면 영상별로 영상 열기, 분석 보기, 실패한 영상 다시 분석, 영상 빼기.
   - 사진 바꾸기(1MB 이하 PNG·JPG·WebP)와 기본 썸네일로 되돌리기. 사진은 AI에 보내지 않는다.
   - 카드 삭제는 휴지통으로 옮긴다. 휴지통에서 되살리거나 비운다.
   - 카드 하나를 md 파일로 저장한다(동료에게 건네기용).
3. **대본 묶음**
   - 화법 열 항목마다 카드를 고른다. 비워 두면 기본 화법이다. 항목 이름은 class-helper와 같다: 배경지식 끌어오기, 배경지식 활용, 유머 방식, 강조하는 말투, 집중시키는 화법, 질문·문답 방식, 설명 순서·판서, 압박·단정 표현, 동기유발·도입 이야기, 수업 마무리 이야기.
   - 「대본 묶음 저장」으로 `강사화법묶음-YYYYMMDD.md`를 받는다.
4. **설정과 백업**
   - Gemini 키: 기본은 「이번만 쓰기」(탭을 닫으면 잊음). 「이 기기에 저장」은 개인 기기에서만 권한다.
   - 「보관함 백업 파일로 저장」「백업 불러오기」. 카드 md 파일 불러오기(class-helper `references/강사_*.md`와 `_cards/*.json`도 받는다).
   - "카드는 이 브라우저에만 저장됩니다. 학교 PC가 재부팅 때 지운다면 백업 파일을 쓰세요."를 늘 보인다.

### 저장

IndexedDB `resonance-cards`의 `cards` 저장소. 카드 모양은 class-helper의 `_cards/*.json`과 같게 둬서 그대로 불러온다.

```js
{ id, instructor, photo /* data URL 또는 null */, deletedAt /* null 또는 ISO */, createdAt, updatedAt,
  sources: [{ id, url, start, end, focus, status /* queued|running|done|error */, text, error, model, usage, at }] }
```

- 같은 영상·구간·초점(`videoId|start|end|focus`)을 이미 분석했으면 다시 부르지 않는다.
- 분석 중에 탭을 닫으면 다음에 열 때 `running`을 `error`("중단됨")로 바꾸고 다시 분석 단추를 보인다.
- Gemini 키는 「이 기기에 저장」일 때만 `localStorage`에 둔다. 그 밖에는 메모리에만 둔다.

### Gemini 부르기

- class-helper `scripts/gemini_video.mjs`와 같은 요청을 브라우저에서 보낸다: `fileData.fileUri`에 유튜브 주소, 구간은 `videoMetadata.startOffset/endOffset`, `temperature 0.3`. 모델은 모델 목록에서 버전이 가장 높은 Flash를 고른다.
- 2026-10-25에 사전 요청(OPTIONS)을 확인했다. `Origin: https://n-lifescience.github.io`와 `Origin: null` 모두 `Access-Control-Allow-Origin`이 돌아오고 `x-goog-api-key` 머리글이 허용된다. 실제 키로 영상 분석까지 되는지는 아직 확인하지 않았다.
- 요청문 원본은 `site/assets/cards/prompt.md` 하나다. 「Gemini로 분석」과 「요청문 복사」가 같은 파일을 쓴다. 내용은 class-helper 요청문 13항목을 옮긴다.
- 응답이 끝까지 오지 않으면(`finishReason`이 `STOP`이 아니면) 실패로 두고 "구간을 줄여 다시 시도"를 안내한다. 429는 사용 한도로 안내한다.

### 대본 묶음 형식 (2차 대본 지침과의 약속)

```markdown
# 강사 화법 묶음
- 대본 지침: https://raw.githubusercontent.com/N-lifescience/resonance/main/guide/script-guide.md
- 만든 날: 2026-10-25

## 화법 배정
| 화법 항목 | 강사 카드 |
|---|---|
| 동기유발·도입 이야기 | 김상욱1 |
| 유머 방식 | (기본 화법) |

## 카드: 김상욱1
(완료된 영상 분석. 카드마다 14,000자 안팎으로 줄인다)
```

- 줄이는 규칙은 class-helper `cardDigest`를 옮긴다. 영상마다 같은 몫을 나누고, 배경지식·질문·설명 순서 절에 1.3배 몫을 준다.
- 같은 카드를 여러 항목에 골라도 카드 본문은 한 번만 넣는다.

### 개인정보와 안전

- 로그인, 회원가입, 이름·학교·연락처를 받지 않는다. 사용 횟수도 세지 않는다.
- 기기 밖으로 나가는 것: (1) 키로 분석할 때 유튜브 주소와 요청문이 선생님 키로 Google Gemini에 간다. (2) 썸네일을 유튜브 이미지 서버(`i.ytimg.com`)에서 받는다. (3) 쪽 파일을 GitHub Pages에서 받는다. 화면 안내에 이 셋을 적는다.
- `cards.html`에는 외부 스크립트를 넣지 않는다. CSP 메타로 `connect-src`를 자기 자신과 `generativelanguage.googleapis.com`, `img-src`를 자기 자신·`data:`·`https://i.ytimg.com`으로 막는다.
- 분석 글은 모델 출력이라 믿지 않는다. `textContent`로만 넣고 `innerHTML`을 쓰지 않는다.
- 키를 주소(URL)나 묶음 파일에 넣지 않는다.
- 카드에는 강사 원대사가 짧게 들어 있다. 화면에 "카드와 묶음 파일은 개인 수업 참고용입니다. 인터넷에 공개하지 마세요."를 적는다. 사이트에 유명 강사 예시 카드를 넣지 않는다.

### 시험

- `cards.js`의 순수 함수(유튜브 주소 읽기, 중복 열쇠, 줄이기, 옛 md 카드 읽기, 묶음 만들기)를 `tests/unit/cards.test.mjs`에서 `node --test`로 확인한다.
- 화면은 `node tools/site.mjs`로 묶은 `_site/cards.html`을 브라우저로 열어 카드 추가(붙여넣기 경로)·사진·삭제·되살리기·백업·묶음 저장을 직접 해 본다. 키 경로는 사용자 키로 한 번 시험한다.

## 2차: 대본 지침과 대본 뷰어

### 자리

- 스킬 `skills/lecture-script/`: `SKILL.md`(절차와 기준), `references/format.md`(대본 형식), `references/performance.md`(class-helper 대본 제작 기준을 수업 HTML에 맞게 고친 판), `assets/template.html`(대본 HTML 뼈대).
- 합본 `guide/script-guide.md`: `tools/build.mjs`가 위 파일을 이어 붙여 만든다. 채팅 AI는 이 파일 하나만 읽는다. `tools/site.mjs`가 `_site/guide/`로 복사해 강사 카드 탭이 묶음에 넣는다.
- 대본 뷰어 `script-viewer/viewer.js`·`viewer.css`. 엔진과 따로다. 대본 HTML은 jsDelivr `@2` 주소로 부른다.
- 레퍼런스 대본 `skills/lecture-script/references/examples/v3-high-bio-script.html`: 직접 만든 예시 수업 `examples/v3/v3-high-bio.html`의 대본.

### 묶음과 지침

- 강사 카드 탭의 묶음 파일 맨 앞에 합본 지침 전체를 넣는다. 주소를 못 읽는 AI도 파일 하나로 따라 한다. 지침을 못 받으면 주소 한 줄만 넣는다.
- 선생님이 쓰는 말: "이 묶음 파일의 지침대로 이 수업 HTML로 대본 써줘".

### 대본 HTML

```html
<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>…</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/N-lifescience/resonance@2/script-viewer/viewer.css">
<script defer src="https://cdn.jsdelivr.net/gh/N-lifescience/resonance@2/script-viewer/viewer.js"></script>
</head><body>
<script type="text/markdown" id="lecture-script">
(대본 MD)
</script>
</body></html>
```

### 대본 MD 형식

- 머리말(`---`로 감쌈): `title`, `deck`(수업 HTML의 `data-deck`), `minutes`, `level`, `화법:` 아래에 `  항목: 강사 이름`.
- `## <장 id> · <제목>`: 수업 HTML의 모든 장이 HTML 순서대로 한 번씩.
- `### ▶N`: → 키로 N번째 단계를 연 뒤 할 말. 개수는 엔진 규칙과 같다(장 안의 `.step`, `data-step`이 같으면 한 번에 열림).
- 줄 태그: 태그 없음(교사 대사), `@질문`, `@예상`, `@대기 N초`, `@연출`, `@조작`, `@참고 강사 | 기법`, `@생략가능(이유)`, `@비트`(뼈대용, 최종본에 남으면 오류).
- 시간은 AI가 쓰지 않는다. 뷰어가 class-helper 시간 엔진과 같은 규칙(한글 음절·숫자·영문 1, 분당 290, 문장마다 0.4초)으로 대사·질문·생략가능을 세고 `@대기`를 더한다.

### 대본 뷰어

- 머리: 제목, 수업 HTML 덱, 목표 시간과 예상 시간, 화법 배정.
- 장마다: 번호/전체, id, 제목, 예상 시간, 누적 시간. 태그마다 모양을 달리한다.
- 「점검」: 형식 오류와 경고. 「수업 HTML 불러오기」(또는 끌어다 놓기)로 장 id·순서·▶ 개수를 수업 HTML과 맞춘다. 「AI에게 보낼 말 복사」.
- 「인쇄」: A4 세로. PDF로 저장하면 대본 PDF.
- 대본 글은 `textContent`로만 그린다. 불러온 수업 HTML은 `DOMParser`로 읽기만 하고 실행하지 않는다.

### 시험

- `tests/unit/script-viewer.test.mjs`: 읽기, 시간, 단계 묶음, 형식 점검, 덱 비교.
- 레퍼런스 대본을 뷰어로 열어 `v3-high-bio.html`과 맞췄을 때 오류 0.
- 실제 시범: 세포호흡 1차시 HTML과 김상욱1 카드 묶음을 지침만 받은 새 에이전트에게 주고 대본을 쓰게 해 본다(저장소 밖 `class/세포호흡/`).

### 합칠 때 주의

- 맥미니 UI/UX 브랜치는 GitHub에 올라와 있지 않아 이 브랜치를 만들 때 비교하지 못했다. 두 브랜치가 함께 고치는 곳은 세 쪽의 머리 메뉴 줄로 예상한다. 합칠 때 그 줄만 손으로 맞춘다.
