// 타이머: 활동 시간을 잰다. <div class="timer" data-sec="300" data-label="모둠 활동"></div>
// 「시작」·「멈춤」·「다시」 단추, 끝나면 '끝'과 함께 세 번 깜빡인다(1초에 세 번 넘게 번쩍이지 않는다).
const Timer = {
  list: [],

  init() {
    this.list = [];
    for (const el of qsa('.timer', Stage.deck)) {
      const total = clamp(Math.round(Number(el.dataset.sec) || 60), 1, 24 * 3600);
      const face = h('output', { class: 'ch-timer-face', 'aria-live': 'off' });
      const run = h('button', { type: 'button', class: 'ch-timer-run' });
      const reset = h('button', { type: 'button', class: 'ch-reset', text: '다시' });
      const t = { el, total, left: total, face, run, reset, timer: 0, end: 0 };
      // replaceChildren은 null을 글자 'null'로 넣으므로 이름이 없을 때는 빼고 넘긴다
      el.replaceChildren(...[el.dataset.label ? h('span', { class: 'ch-timer-label', text: el.dataset.label }) : null,
        face, h('span', { class: 'ch-timer-btns' }, run, reset)].filter(Boolean));
      run.addEventListener('click', (e) => { this.toggle(t); e.currentTarget.blur(); });
      reset.addEventListener('click', (e) => { this.reset(t); e.currentTarget.blur(); });
      this.list.push(t);
      this.render(t);
    }
  },

  fmt(sec) {
    const s = Math.max(0, Math.ceil(sec));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  },

  render(t) {
    t.face.textContent = t.left <= 0 ? '끝' : this.fmt(t.left);
    t.run.textContent = t.timer ? '멈춤' : t.left < t.total && t.left > 0 ? '이어서' : '시작';
    t.el.classList.toggle('is-running', !!t.timer);
    t.el.classList.toggle('is-done', t.left <= 0);
  },

  toggle(t) {
    if (t.timer) { this.pause(t); return; }
    if (t.left <= 0) t.left = t.total;
    t.end = performance.now() + t.left * 1000;
    t.timer = setInterval(() => this.tick(t), 250);
    this.render(t);
  },

  tick(t) {
    t.left = (t.end - performance.now()) / 1000;
    if (t.left <= 0) {
      t.left = 0;
      clearInterval(t.timer);
      t.timer = 0;
      t.face.setAttribute('aria-live', 'assertive');
    }
    this.render(t);
  },

  pause(t) {
    clearInterval(t.timer);
    t.timer = 0;
    t.left = Math.max(0, (t.end - performance.now()) / 1000);
    this.render(t);
  },

  reset(t) {
    clearInterval(t.timer);
    t.timer = 0;
    t.left = t.total;
    t.face.setAttribute('aria-live', 'off');
    this.render(t);
  },

  // 남은 시간(초)을 늘린다. 끝난 타이머도 다시 이어 갈 수 있게 된다.
  add(t, sec) {
    t.total += sec;
    if (t.timer) t.end += sec * 1000;
    else t.left = Math.max(0, t.left) + sec;
    t.face.setAttribute('aria-live', 'off');
    this.render(t);
  },

  // 실시간 수업이 학생에게 보낼 모양 { left: 남은 ms, total: 초, run }. 기기마다 시계가 달라 끝 시각 대신 남은 시간을 보낸다.
  wire(t) {
    const left = t.timer ? t.end - performance.now() : t.left * 1000;
    return { left: Math.max(0, Math.round(left)), total: t.total, run: !!t.timer && left > 0 };
  },
};

// 툴바 「타이머」: 어느 장에서나 시간을 골라 화면 위에 띄운다(익스플로라그램을 다룰 시간 주기 등).
// 장을 넘기거나 칠판을 열어도 떠 있고, 끌어서 옮길 수 있다. 실시간 수업 중이면 학생 화면에도 남은 시간이 보인다(68-live).
const POP_TIMER_PRESETS = [30, 60, 120, 180, 300, 600];
const PopTimer = {
  t: null,          // Timer와 같은 모양. 떠 있지 않으면 null
  el: null,
  pick: 240,        // 창의 「직접 정하기」 값(초)
  pos: null,        // 끌어 옮긴 자리 { x, y }(px). 없으면 위 가운데

  label(sec) { return sec < 60 ? `${sec}초` : `${sec / 60}분`; },

  // 툴바 창 내용
  panel() {
    const go = (sec) => { Toolbar.closePop(); this.open(sec); };
    const value = h('output', { class: 'ch-ptimer-pick', text: this.label(this.pick) });
    const step = (d) => { this.pick = clamp(this.pick + d, 60, 3600); value.textContent = this.label(this.pick); };
    return h('div', { class: 'ch-pop-timer' },
      h('h3', { text: '타이머' }),
      h('div', { class: 'ch-ptimer-presets' }, POP_TIMER_PRESETS.map((sec) => h('button', {
        type: 'button', class: 'ch-class', text: this.label(sec), onclick: () => go(sec),
      }))),
      h('div', { class: 'ch-ptimer-own' },
        h('button', { type: 'button', class: 'ch-class', text: '−', 'aria-label': '1분 줄이기', onclick: () => step(-60) }),
        value,
        h('button', { type: 'button', class: 'ch-class', text: '+', 'aria-label': '1분 늘리기', onclick: () => step(60) }),
        h('button', { type: 'button', class: 'ch-class ch-ptimer-start', text: '시작', onclick: () => go(this.pick) })),
      this.shown() ? Toolbar.menuItem('타이머 닫기', () => { Toolbar.closePop(); this.close(); }) : null);
  },

  build() {
    const btn = (cls, text, fn, label) => h('button', {
      type: 'button', class: cls, text, 'aria-label': label || null, onclick: (e) => { fn(); e.currentTarget.blur(); this.changed(); },
    });
    const face = h('output', { class: 'ch-timer-face', 'aria-live': 'off' });
    const t = { el: null, total: 60, left: 60, face, run: null, reset: null, timer: 0, end: 0 };
    t.run = btn('ch-timer-run', '', () => Timer.toggle(t));
    t.reset = btn('ch-reset', '다시', () => Timer.reset(t));
    this.el = h('div', { class: 'ch-ptimer', 'data-no-ink': '', role: 'group', 'aria-label': '타이머' },
      face, h('span', { class: 'ch-timer-btns' }, t.run, t.reset,
        btn('ch-reset', '+1분', () => Timer.add(t, 60), '1분 늘리기'),
        btn('ch-ptimer-x', '×', () => this.close(), '타이머 닫기')));
    t.el = this.el;
    this.t = t;
    this.bindDrag();
    document.body.append(this.el);
    on('resize', () => { this.place(); emit('pop-timer-moved'); });
  },

  // sec초로 맞추고 바로 시작한다
  open(sec) {
    if (!this.el) this.build();
    const t = this.t;
    clearInterval(t.timer);
    t.timer = 0;
    t.total = sec;
    t.left = sec;
    t.face.setAttribute('aria-live', 'off');
    this.el.hidden = false;
    this.place();
    Timer.toggle(t);
    this.changed();
  },

  close() {
    if (!this.el || this.el.hidden) return;
    clearInterval(this.t.timer);
    this.t.timer = 0;
    this.el.hidden = true;
    this.changed();
  },

  shown() { return !!this.el && !this.el.hidden; },
  wire() { return this.shown() ? Timer.wire(this.t) : null; },
  changed() { emit('pop-timer', this.wire()); },

  // 처음에는 위 가운데. 왼쪽을 0에 두고 너비를 잰 뒤 옮긴다(left: 50%면 화면 절반 너비에서 줄이 바뀐다).
  place() {
    if (!this.shown()) return;
    const s = this.el.style;
    s.left = '0px';
    const r = this.el.getBoundingClientRect();
    const at = this.pos || { x: (window.innerWidth - r.width) / 2, y: 16 };
    s.left = `${clamp(at.x, 0, Math.max(0, window.innerWidth - r.width))}px`;
    s.top = `${clamp(at.y, 0, Math.max(0, window.innerHeight - r.height))}px`;
  },

  // 단추가 아닌 곳을 끌면 옮긴다(펜을 든 채로도: data-no-ink)
  bindDrag() {
    let d = null;
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const r = this.el.getBoundingClientRect();
      d = { id: e.pointerId, x: e.clientX - r.left, y: e.clientY - r.top };
      try { this.el.setPointerCapture(e.pointerId); } catch (err) { /* 합성 이벤트 */ }
    });
    this.el.addEventListener('pointermove', (e) => {
      if (!d || e.pointerId !== d.id) return;
      e.preventDefault();
      this.pos = { x: e.clientX - d.x, y: e.clientY - d.y };
      this.place();
    });
    const end = (e) => {
      if (!d || e.pointerId !== d.id) return;
      d = null;
      emit('pop-timer-moved');   // 응답 현황처럼 위에 붙은 것이 자리를 다시 잡는다
    };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
  },
};
