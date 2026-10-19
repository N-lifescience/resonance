# 보안·개인정보 판단 기록

2026-10-19 `/dorms` 읽기 점검(dorms-check 0.3.1, security 트랙) 뒤에 정한 것이다. 다음 점검에서 같은 항목이 다시 나오면 여기 적은 근거를 먼저 본다. 상황이 바뀌면(학생 데이터 저장, 에듀집 등록, 호스팅 이전) 다시 판단한다.

## 보안 헤더 — 달지 않는다

대상: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy(모두 '권고').

- GitHub Pages에서는 응답 헤더를 설정할 수 없다. X-Frame-Options·frame-ancestors·nosniff·Permissions-Policy는 `<meta>`로도 넣을 수 없다.
- `<meta>` CSP는 넣을 수 있다. 하지만 사이트는 cdnjs(GSAP)·jsDelivr(Pretendard, supabase-js)·Google Fonts·Supabase(https·wss)·같은 출처 수업 iframe을 쓴다. 남의 HTML을 화면에 넣는 곳도 없다(`site/assets/js`의 innerHTML 0). 그래서 막아 주는 것보다 깨질 위험이 더 크다.
- 헤더가 꼭 필요해지면 앞단(Cloudflare 등)을 두거나, 헤더 설정 파일을 쓸 수 있는 호스팅(Vercel 등)으로 옮긴 뒤 그 파일에 넣는다.

## 개인정보처리방침 — 지금은 두지 않는다

- 사이트는 이름·학번·연락처·계정을 받지 않는다. 쿠키도 쓰지 않는다.
- 실시간 수업: 학생이 보낸 값은 이름 없이 Supabase Realtime(broadcast)을 거쳐 교사 화면 메모리에만 머문다. DB에 저장하지 않는다(`engine/src/68-live.js` 첫머리).
- 복사 횟수 카운터: `site_counters` 표에 허용된 이름과 횟수만 둔다(`docs/counter.sql`).
- 기능 제안·문의는 구글 설문으로 받는다. 이메일을 모으지 않고 로그인도 요구하지 않는다. 자유 서술 칸만 남는다.
- 학생 데이터를 받는 기능을 넣거나 에듀집에 올릴 때는 `/Volumes/T7/Projects/_workspace-rules/dorms-ready.md`의 항목을 모두 갖춘 방침 페이지를 만든다. 일부만 적은 방침은 미충족으로 잡힌다.

## 편집기 「HTML 직접 고치기」 정화 — 넣지 않는다

- `engine/src/67-edit.js`의 `setInner`(createContextualFragment)는 교사가 자기 수업 파일을 고칠 때만 쓰인다. 입력하는 사람이 곧 파일 주인이다. 수업 파일에는 원래 AI가 쓴 스크립트와 `on*` 속성이 들어 있다.
- script·`on*`를 지우는 정화를 넣으면 교사가 활동이 든 요소를 고쳐 저장할 때 그 활동이 망가진다.
- 학생이나 다른 사람이 보낸 값은 HTML로 넣지 않는다. 실시간 수업 값은 `h()`의 textContent로만 그린다(`engine/src/00-core.js`, `68-live.js`에 `html` 키 0).

## 2026-10-19에 확인한 것

- 위험 코드 패턴 48건은 모두 정규식 `.exec()`다(child_process 아님).
- 카운터: 공개 키로 표를 직접 읽거나 쓰면 401(42501)이다. `get_counter`는 허용된 이름에만 답하고 그 밖의 이름은 400이다.
- 하드코딩 비밀값·소스맵·설정 파일 노출이 없다. HTTPS 강제와 HSTS를 확인했다.
- dorms-check는 이 맥의 npm 설정(allow-git=none) 때문에 `npx github:`로 받을 수 없다. 받아 둔 사본(`~/.npm/_npx/…/dorms-check`, 0.3.1)으로 돌렸다.
