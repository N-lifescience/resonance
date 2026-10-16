// 칠판 모드: 슬라이드와 단계는 그대로 두고, 반별 칠판 쪽으로 판서·넘기기 대상을 바꾼다.
const BOARD_LABELS = { white: '흰색', grid: '모눈', lines: '줄', green: '초록 칠판', coord: '좌표평면' };

const Board = {
  active: false,
  el: null,
  label: null,
  toggleBtn: null,   // 슬라이드·칠판 두 칸 묶음
  slidesBtn: null,
  boardBtn: null,

  init() {
    this.label = h('div', { class: 'ch-board-label', role: 'status', 'aria-live': 'polite', 'data-no-keep': '' });   // 엔진 글: 어절 보정 안 함
    this.el = h('div', { class: 'ch-board', 'data-bg': 'white', 'aria-label': '칠판', hidden: true }, this.label);
    Stage.deck.append(this.el);
    // 지금 보는 쪽에 불이 들어오는 두 칸 전환(누르면 그쪽으로 간다). 한 단추가 글자를 바꾸면 지금 상태인지 갈 곳인지 헷갈린다.
    this.slidesBtn = Toolbar.btn('slides', '슬라이드', () => this.close(), { 'aria-pressed': 'true' });
    this.boardBtn = Toolbar.btn('board', '칠판', () => this.open(), { 'aria-pressed': 'false' });
    this.toggleBtn = h('div', { class: 'ch-seg', role: 'group', 'aria-label': '슬라이드 · 칠판' }, this.slidesBtn, this.boardBtn);
    const add = Toolbar.btn('boardAdd', '칠판 추가', () => this.add());
    const del = Toolbar.btn('boardDel', '칠판 삭제', () => this.remove());
    const bg = Toolbar.btn('bg', '바탕', (e) => {
      if (this.active) Toolbar.togglePop(e.currentTarget, () => this.bgPanel());
    });
    for (const b of [add, del, bg]) b.classList.add('ch-board-only');
    Toolbar.slots.board.append(this.toggleBtn, add, del, bg);
    on('session', () => {
      Toolbar.closePop();
      if (this.active) this.render();
    });
    on('key', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || keyName(e) !== 'c') return;
      e.preventDefault();
      this.toggle();
    });
    this.setToggle();
    if (document.body.dataset.theme === 'chalk') this.setDark(true);   // 흰 펜, 밝게 겹치는 형광펜
  },

  get doc() { return Session.doc; },

  toggle() { if (this.active) this.close(); else this.open(); },

  open() {
    if (this.active || !Settings.enabled('board')) return;
    this.active = true;
    Nav.override = this;
    document.body.classList.add('ch-board-on');
    this.render();
    emit('board', true);
  },

  close() {
    if (!this.active) return;
    Toolbar.closePop();
    this.active = false;
    if (Nav.override === this) Nav.override = null;
    document.body.classList.remove('ch-board-on');
    this.el.hidden = true;
    this.setDark(document.body.dataset.theme === 'chalk');   // 칠판 테마의 슬라이드는 어둡다
    this.setToggle();
    Ink.setPage({ kind: 'slide', key: Stage.slides[Nav.state.slide].dataset.key });
    emit('board', false);
  },

  render() {
    if (!this.active) return;
    Toolbar.closePop();
    const doc = this.doc;
    doc.board = clamp(doc.board, 0, doc.boards.length - 1);
    const b = doc.boards[doc.board];
    this.el.hidden = false;
    this.el.dataset.bg = b.bg;
    this.label.textContent = `칠판 ${doc.board + 1} / ${doc.boards.length}`;
    this.setDark(b.bg === 'green');
    this.setToggle();
    // 새 반의 문서에서는 그 반의 번호를 쓰고, 미완성 획이 다른 쪽에 기록되지 않도록 취소한다.
    Ink.setPage({ kind: 'board', index: doc.board });
  },

  setDark(dark) {
    document.body.classList.toggle('ch-dark-page', dark);
    if (dark && Tools.penColor === PEN_COLORS[0]) {
      Tools.penColor = PEN_WHITE;
      emit('tool', Tools.current);
    } else if (!dark && Tools.penColor === PEN_WHITE) {
      Tools.penColor = PEN_COLORS[0];
      emit('tool', Tools.current);
    }
  },

  next() {
    if (!this.active || this.doc.board >= this.doc.boards.length - 1) return;
    this.doc.board += 1;
    this.render();
    Session.changed();
  },

  prev() {
    if (!this.active || this.doc.board <= 0) return;
    this.doc.board -= 1;
    this.render();
    Session.changed();
  },

  add() {
    if (!this.active) return;
    InkModel.addBoard(this.doc, this.doc.boards[this.doc.board].bg);
    this.render();
    Session.changed();
  },

  async remove() {
    if (!this.active) return;
    const b = this.doc.boards[this.doc.board];
    if (b.strokes.length && !await Ask.ask('이 칠판을 지울까요? 판서도 함께 사라져요.', { ok: '삭제' })) return;
    if (!this.active || this.doc.boards[this.doc.board] !== b) return;   // 묻는 사이 반·칠판이 바뀌었으면 그만둔다
    InkModel.deleteBoard(this.doc);
    this.render();
    Session.changed();
  },

  setBg(bg) {
    if (!this.active || !BOARD_BGS.includes(bg)) return;
    this.doc.boards[this.doc.board].bg = bg;
    this.render();
    Session.changed();
  },

  setToggle() {
    this.slidesBtn.setAttribute('aria-pressed', String(!this.active));
    this.boardBtn.setAttribute('aria-pressed', String(this.active));
    emit('board-mode', this.active);   // 양옆 HUD의 전환 단추도 맞춘다
  },

  bgPanel() {
    const cur = this.doc.boards[this.doc.board].bg;
    return h('div', { class: 'ch-pop-bg' }, h('h3', { text: '칠판 바탕' }),
      h('div', { class: 'ch-bg-list' }, ...BOARD_BGS.map((bg) => h('button', {
        type: 'button', class: 'ch-bg', 'data-bg': bg, 'aria-pressed': String(bg === cur),
        onclick: () => { this.setBg(bg); Toolbar.closePop(); },
      }, h('i', { 'aria-hidden': 'true' }), h('span', { text: BOARD_LABELS[bg] })))));
  },
};
