// 넘기기: 단계 공개, 키보드, 손 모드 스와이프, 주소 #쪽, 진행 막대.
// 장 안의 글 입력칸(단답·서답). 여기에 포커스가 있어도 리모컨 넘기기(PageDown·PageUp)와 빈 칸의 화살표는 넘기기로 받는다.
const NAV_TEXT = 'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="url"], input[type="email"], input[type="tel"]';

const Nav = {
  state: { slide: 0, shown: 0 },
  groups: [],
  counts: [],
  override: null,   // 칠판 모드처럼 넘기기를 가로채는 대상 { next(), prev(), close() }
  enterAll: false,
  digits: '',
  digitTimer: 0,
  progress: null,

  init() {
    this.groups = Stage.slides.map((slide) => {
      const steps = qsa('.step', slide);
      const keys = steps.map((el) => (el.dataset.step != null && el.dataset.step !== '' ? Number(el.dataset.step) : null));
      return Steps.groups(keys).map((g) => g.map((i) => steps[i]));
    });
    this.counts = this.groups.map((g) => g.length);
    const fromHash = parseInt(location.hash.slice(1), 10);
    this.state = Steps.go(Number.isFinite(fromHash) ? fromHash - 1 : 0, this.counts, false);
    this.progress = h('div', { class: 'ch-progress', 'aria-hidden': 'true' }, h('i'));
    document.body.append(this.progress);
    document.addEventListener('keydown', (e) => this.onKey(e));
    this.bindSwipe();
    this.render(-1);
  },

  // all: 장에 들어올 때 단계 막대를 끝 칸으로 둘지(이전 장으로 돌아올 때)
  set(next, all) {
    const before = this.state.slide;
    this.state = next;
    this.enterAll = !!all;
    this.render(before);
  },

  // 지금 장에서 다음에 열릴 단계의 첫 요소, 마지막으로 열린 단계의 첫 요소
  nextStepEl() { const g = this.groups[this.state.slide][this.state.shown]; return g ? g[0] : null; },
  lastStepEl() { const g = this.groups[this.state.slide][this.state.shown - 1]; return g ? g[0] : null; },

  next() {
    if (this.override) return this.override.next();
    if (Stepper.advance(this.state.slide, this.nextStepEl())) return;   // 단계 막대가 먼저면 한 칸 연다
    this.set(Steps.next(this.state, this.counts), false);
  },

  prev() {
    if (this.override) return this.override.prev();
    if (Stepper.retreat(this.state.slide, this.lastStepEl())) return;
    const next = Steps.prev(this.state, this.counts);
    this.set(next, next.slide !== this.state.slide);
  },

  // el이 든 단계까지 연다(지금 장일 때만). 정답 상자 ✓, 분류 완료 등이 쓴다.
  revealTo(el) {
    if (!el) return false;
    const { slide, shown } = this.state;
    const gi = this.groups[slide].findIndex((g) => g.some((s) => s === el || s.contains(el) || el.contains(s)));
    if (gi < 0 || shown > gi) return false;
    this.set({ slide, shown: gi + 1 }, false);
    return true;
  },

  // index는 0부터 센다(화면의 쪽 번호·#주소·숫자+Enter는 1부터). 숫자가 아니면 무시한다.
  go(index, allShown) {
    if (!Number.isFinite(index)) return;
    if (this.override) this.override.close();
    const before = this.state.slide;
    this.set(Steps.go(Math.round(index), this.counts, !!allShown), !!allShown);
    if (this.state.slide === before) Stepper.enter(before, !!allShown);   // 같은 장으로 가도 단계처럼 처음 상태로
  },

  render(before) {
    const { slide, shown } = this.state;
    Stage.slides.forEach((s, i) => s.classList.toggle('is-active', i === slide));
    this.groups[slide].forEach((g, gi) => g.forEach((el) => el.classList.toggle('is-shown', gi < shown)));
    this.progress.firstChild.style.transform = `scaleX(${(slide + 1) / Stage.slides.length})`;
    if (before !== slide) {
      // 떠나는 장의 입력칸에 포커스가 남으면 다음 장에서도 넘기기 키가 그 칸으로 가서 막힌다
      const a = document.activeElement;
      if (before >= 0 && a && a.blur && Stage.slides[before] && Stage.slides[before].contains(a)) a.blur();
      Stepper.enter(slide, this.enterAll);
      if (before >= 0) emit('hide', Stage.slides[before], before);
      emit('show', Stage.slides[slide], slide);
      try { history.replaceState(null, '', `#${slide + 1}`); } catch (err) { /* 잦은 호출을 막는 브라우저가 있다 */ }
    }
    emit('nav', this.state);   // 장이나 단계가 바뀔 때마다(실시간 수업이 학생에게 알린다)
  },

  onKey(e) {
    if (e.defaultPrevented || e.isComposing) return;
    const t = e.target;
    const field = t && t.closest && t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
    if (field && !this.fieldNav(e, field)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) { emit('key', e); return; }
    const k = e.key;
    if (/^[0-9]$/.test(k)) {
      this.digits += k;
      clearTimeout(this.digitTimer);
      this.digitTimer = setTimeout(() => { this.digits = ''; }, 1500);
      return;
    }
    if (k === 'Enter' && this.digits) {
      e.preventDefault();
      const n = parseInt(this.digits, 10);
      this.digits = '';
      this.go(n - 1);
      return;
    }
    this.digits = '';   // 쪽 번호를 치다가 다른 키를 누르면 번호는 버린다
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(k)) {
      e.preventDefault();
      this.next();
    } else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) {
      e.preventDefault();
      this.prev();
    } else if (k === 'Home') {
      e.preventDefault();
      this.go(0);
    } else if (k === 'End') {
      e.preventDefault();
      this.go(this.counts.length - 1);
    } else {
      emit('key', e);   // 나머지 글자 키는 각 모듈(목차, 툴바, 칠판, 점검)이 처리
    }
  },

  // 장 안 글 입력칸에 포커스가 있을 때 넘기기로 보낼 키인가. 글을 쓰는 키(글자, Space, Enter, 글이 있는 칸의 화살표)는 칸에 둔다.
  // 보낼 때는 칸을 놓는다(전자칠판 화면 키보드도 닫힌다). Esc는 칸만 놓는다. 엔진 창(반 이름, 코드 입력)의 칸은 건드리지 않는다.
  fieldNav(e, field) {
    if (e.ctrlKey || e.metaKey || e.altKey || !field.matches(NAV_TEXT) || !field.closest('section.slide')) return false;
    const k = e.key;
    if (k === 'Escape') { field.blur(); return false; }
    const remote = k === 'PageDown' || k === 'PageUp';
    const empty = /^Arrow(Right|Left|Up|Down)$/.test(k) && field.value === '';
    if (!remote && !empty) return false;
    field.blur();
    return true;
  },

  // 손 모드에서 손가락으로 좌우로 밀면 넘긴다.
  bindSwipe() {
    let start = null;
    Stage.deck.addEventListener('pointerdown', (e) => {
      // 두 번째 손가락이 닿으면(isPrimary 아님) 스와이프를 취소한다.
      const ok = e.isPrimary && e.pointerType === 'touch' && document.body.dataset.tool === 'hand'
        && !(e.target.closest && e.target.closest('input, textarea, select, [data-no-ink]'));
      start = ok ? [e.clientX, e.clientY] : null;
    });
    Stage.deck.addEventListener('pointercancel', () => { start = null; });
    Stage.deck.addEventListener('pointerup', (e) => {
      if (!start || !e.isPrimary) return;
      const dx = e.clientX - start[0];
      const dy = e.clientY - start[1];
      start = null;
      if (Math.abs(dx) > 60 && Math.abs(dy) < 50) { if (dx < 0) this.next(); else this.prev(); }
    });
  },
};
