// 화면 양옆 가장자리: ‹ 이전, › 다음. 판서 도구는 화면에 떠 있는 단추 하나(HUD)에 모은다.
// 툴바(색·굵기, 되돌리기, 칠판(25-board가 채움), 반 메뉴, 설정·편집·점검·타이머·목차·전체 화면)는
// 화면 아래에 깔지 않고 떠 있는 도구판의 「더보기」 안에 둔다.
// 아이콘은 24×24 선 그림(직접 그린 단순 도형).
const ICONS = {
  prev: 'M15 18l-6-6 6-6',
  next: 'M9 18l6-6-6-6',
  hand: 'M5 3l13 7.5-5.5 1.5L10 18z',
  pen: 'M4 20l4.5-1L19 8.5 15.5 5 5 15.5zM13.5 7l3.5 3.5',
  hl: 'M4 21h8M7 17l-2 2M7 17l9.5-9.5 3 3L10 20zM14 5l5 5',
  eraser: 'M8 20h12M4.5 15.5l9-9 6 6-7.5 7.5H9z',
  laser: 'M12 9a3 3 0 1 1 0 6a3 3 0 1 1 0-6M12 2v3M12 19v3M2 12h3M19 12h3',
  style: 'M12 4a8 8 0 1 1 0 16a8 8 0 1 1 0-16',
  undo: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  clear: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  board: 'M3 4h18v12H3zM8 20l4-4 4 4',
  slides: 'M3 5h18v14H3zM7 9h10M7 13h6',
  boardAdd: 'M3 4h18v12H3zM12 7v6M9 10h6M8 20l4-4 4 4',
  boardDel: 'M3 4h18v12H3zM9.5 7.5l5 5M14.5 7.5l-5 5M8 20l4-4 4 4',
  bg: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
  class: 'M9 5a3 3 0 1 1 0 6a3 3 0 1 1 0-6M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 5.5a3 3 0 0 1 0 5.5M18 14.5c2 .6 3 2.6 3 5.5',
  toc: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  full: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  tools: 'M4 20l4.5-1L19 8.5 15.5 5 5 15.5z',
  gear: 'M12 9a3 3 0 1 1 0 6a3 3 0 1 1 0-6M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1',
  zoom: 'M10.5 4a6.5 6.5 0 1 1 0 13a6.5 6.5 0 1 1 0-13M15.5 15.5L21 21M10.5 7.5v6M7.5 10.5h6',
  check: 'M5 12.5l4.5 4.5L19 7',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  timer: 'M10 2h4M12 2v2M12 4a9 9 0 1 1 0 18a9 9 0 1 1 0-18M12 9v4l3 2',
  live: 'M12 11a1.5 1.5 0 1 1 0 3a1.5 1.5 0 1 1 0-3M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.5 5.5a9.2 9.2 0 0 0 0 13M18.5 5.5a9.2 9.2 0 0 1 0 13',
};

function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `ch-icon ch-icon-${name}`);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICONS[name] || '');
  svg.append(path);
  return svg;
}

// 텍스트 파일 내려받기(판서 백업, M2의 저장 기능에서도 쓴다).
function saveText(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type: type || 'text/plain;charset=utf-8' }));
  const a = h('a', { href: url, download: filename.replace(/[\\/:*?"<>|]+/g, '-') });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const HUD_HOME = { x: 0.03, y: 0.8 };   // 떠 있는 판서 도구 단추의 처음 자리(화면 비율): 왼쪽 아래
const TOOL_LIST = [['hand', '손'], ['pen', '펜'], ['hl', '형광펜'], ['eraser', '지우개'], ['laser', '레이저']];

const Toolbar = {
  el: null,
  slots: {},
  pop: null,
  popAnchor: null,
  styleBtn: null,
  huds: {},
  edges: {},
  moreBtn: null,
  classBtn: null,
  noticeEl: null,
  noticeTimer: 0,
  prefs: { hud: { ...HUD_HOME } },

  async init() {
    const saved = await Store.get('toolbar');
    if (saved && typeof saved === 'object') {
      // 예전 저장(양옆 HUD 둘, 아래 툴바 위치)은 버리고 떠 있는 단추 자리만 읽는다
      const p = saved.float;
      if (p && [p.x, p.y].every((v) => typeof v === 'number' && v >= 0 && v <= 1)) this.prefs.hud = { x: p.x, y: p.y };
      if (PEN_COLORS.includes(saved.penColor)) Tools.penColor = saved.penColor;
      if (PEN_WIDTHS.includes(saved.penWidth)) Tools.penWidth = saved.penWidth;
      if (HL_COLORS.includes(saved.hlColor)) Tools.hlColor = saved.hlColor;
    }
    this.el = h('div', { class: 'ch-toolbar', role: 'toolbar', 'aria-label': '수업 도구', 'data-dock': 'float', hidden: true });
    for (const name of ['nav', 'tools', 'style', 'edit', 'board', 'class', 'misc']) {
      this.slots[name] = h('div', { class: `ch-tb-group ch-tb-${name}` });
      this.el.append(this.slots[name]);
    }
    this.build();
    this.el.addEventListener('keydown', (e) => this.buttonKeys(e));
    // 더보기에서 바로 일을 하는 단추(칠판 추가, 전체 화면, 목차…)를 누르면 도구판을 닫아 화면을 비운다.
    // 팝오버를 여는 단추(색, 바탕, 반, 타이머, 설정)는 팝오버에서 고른 뒤 닫힌다(closePop).
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('.ch-tb-btn');
      if (!b || (this.pop && this.popAnchor === b)) return;
      for (const hud of Object.values(this.huds)) if (hud.contains(b)) this.setHud(hud, false);
    });
    on('tool', () => this.sync());
    on('session', () => this.sync());
    // 반을 바꾸면(목록에서 고르기, 지금 반 삭제) 어느 반 판서인지 화면에 잠깐 알린다
    let shownClass = Session.current;
    on('session', () => {
      if (Session.current === shownClass) return;
      shownClass = Session.current;
      this.notice(h('b', { text: Session.current }), ' 판서로 바꿨어요');
    });
    on('key', (e) => this.onKey(e));
    on('panels-close', () => this.closePop());
    document.addEventListener('pointerdown', (e) => {
      const t = e.target.closest ? e.target : document.body;
      const inPop = this.pop && this.pop.contains(t);
      for (const hud of Object.values(this.huds)) {
        if (hud.classList.contains('is-open') && !hud.contains(t) && !inPop) this.setHud(hud, false);
      }
      if (!this.pop || inPop || (this.popAnchor && this.popAnchor.contains(t))) return;
      this.closePop(Object.values(this.huds).some((hud) => hud.contains(t)));   // 도구판 안을 눌렀으면 도구판은 둔다
      if (!t.closest(UI_CONTROLS)) swallowTap(e);   // 창 닫으려고 누른 것이 판서·클릭이 되지 않게
    }, true);
    this.buildEdges();
    this.buildHud();
    this.applyDock();
    Tools.set('hand');
  },

  btn(name, label, onclick, attrs) {
    const b = h('button', Object.assign({ type: 'button', class: 'ch-tb-btn', 'data-name': name, title: label, 'aria-label': label }, attrs || {}),
      icon(name), h('span', { text: label }));
    b.addEventListener('click', (e) => { onclick(e); b.blur(); });
    return b;
  },

  // 화면 가운데에 2초쯤 떴다가 사라지는 알림
  notice(...kids) {
    if (!this.noticeEl) {
      this.noticeEl = h('div', { class: 'ch-notice', role: 'status', 'aria-live': 'polite' });
      document.body.append(this.noticeEl);
    }
    const el = this.noticeEl;
    el.replaceChildren(...kids);
    el.classList.add('is-on');
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => el.classList.remove('is-on'), 2000);
  },

  menuItem(label, onclick) { return h('button', { type: 'button', class: 'ch-menu-item', text: label, onclick }); },

  // 버튼의 기본 Enter·Space 클릭은 유지하고, 장 넘기기 단축키까지 전달하지 않는다.
  buttonKeys(e) {
    if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
  },

  build() {
    const S = this.slots;
    for (const [tool, label] of TOOL_LIST) {
      S.tools.append(this.btn(tool, label, () => Tools.set(tool), { 'data-tool': tool, 'aria-pressed': 'false' }));
    }
    this.styleBtn = this.btn('style', '색', (e) => this.togglePop(e.currentTarget, () => this.stylePanel()));
    S.style.append(this.styleBtn);
    S.edit.append(
      this.btn('undo', '되돌리기', () => Ink.undo()),
      // 묻지 않고 지운다: 되돌리기 한 번이면 모두 돌아온다(기본 확인창은 칠판에서 막혀 먹통이 되곤 했다)
      this.btn('clear', '이 장 지우기', () => Ink.clear()),
    );
    this.classBtn = this.btn('class', '반', (e) => this.togglePop(e.currentTarget, () => this.classPanel()));
    S.class.append(this.classBtn);
    S.misc.append(
      this.btn('timer', '타이머', (e) => this.togglePop(e.currentTarget, () => PopTimer.panel())),
      this.btn('toc', '목차', () => Panels.toggle(Panels.toc)),
      this.btn('full', '전체 화면', () => Panels.fullscreen()),
    );
  },

  // 화면 양옆 가장자리의 반원 탭: 왼쪽 ‹ 이전, 오른쪽 › 다음. 펜을 든 채로도 넘긴다.
  buildEdges() {
    for (const [side, name, label, go] of [['left', 'prev', '이전 장', () => Nav.prev()], ['right', 'next', '다음 장', () => Nav.next()]]) {
      const b = h('button', { type: 'button', class: 'ch-edge-nav', 'data-side': side, 'data-name': name, title: label, 'aria-label': label }, icon(name));
      b.addEventListener('click', () => { go(); b.blur(); });
      b.addEventListener('keydown', (e) => this.buttonKeys(e));
      this.edges[side] = b;
      document.body.append(b);
    }
  },

  // 떠 있는 판서 도구 단추: 누르면 도구판이 화면 가운데 쪽으로 나오고, 끌면 화면 어디로든 옮긴다.
  // 도구판 끝의 「더보기」는 나머지 수업 도구(툴바)를 도구판 옆에 펼친다. 자리는 이 PC에 저장한다.
  buildHud() {
    const panel = h('div', { class: 'ch-hud-panel', role: 'toolbar', 'aria-label': '판서 도구' });
    const hud = h('div', { class: 'ch-hud', 'data-side': 'float' });
    const tab = h('button', { type: 'button', class: 'ch-hud-tab', title: '판서 도구 (끌어서 옮기기)', 'aria-label': '판서 도구 꺼내기', 'aria-expanded': 'false' }, icon('tools'));
    tab.addEventListener('click', () => {
      if (tab.dataset.dragged) { delete tab.dataset.dragged; return; }   // 끌어 옮긴 끝의 클릭은 열지 않는다
      this.setHud(hud, !hud.classList.contains('is-open'));
    });
    this.bindHudDrag(hud, tab);
    for (const [tool, label] of TOOL_LIST) {
      panel.append(this.btn(tool, label, (e) => {
        // 이미 고른 펜·형광펜을 다시 누르면 색 고르기
        if (Tools.current === tool && (tool === 'pen' || tool === 'hl')) { this.togglePop(e.currentTarget, () => this.stylePanel()); return; }
        Tools.set(tool);
        this.setHud(hud, false);
      }, { 'data-tool': tool, 'aria-pressed': 'false' }));
    }
    const seg = h('div', { class: 'ch-seg' },
      this.btn('slides', '슬라이드', () => Board.close(), { 'aria-pressed': 'true' }),
      this.btn('board', '칠판', () => Board.open(), { 'aria-pressed': 'false' }));
    this.moreBtn = this.btn('more', '더보기', () => this.setMore(hud, !hud.classList.contains('is-more')), { 'aria-expanded': 'false' });
    panel.append(this.btn('undo', '되돌리기', () => Ink.undo()), seg, this.moreBtn);
    hud.addEventListener('keydown', (e) => this.buttonKeys(e));   // 단추·도구판·더보기의 Enter·Space가 장을 넘기지 않게
    const body = h('div', { class: 'ch-hud-body' }, panel, this.el);
    hud.append(tab, body);
    this.huds.float = hud;
    document.body.append(hud);
    this.placeHud(hud);
    on('board-mode', (active) => {
      for (const b of qsa('.ch-hud [data-name="slides"]')) b.setAttribute('aria-pressed', String(!active));
      for (const b of qsa('.ch-hud [data-name="board"]')) b.setAttribute('aria-pressed', String(active));
    });
    on('resize', () => { for (const h2 of Object.values(this.huds)) this.placeHud(h2); });
    this.sync();
  },

  setMore(hud, open) {
    if (!open && this.pop && this.el.contains(this.popAnchor)) this.closePop(true);
    hud.classList.toggle('is-more', open);
    this.el.hidden = !open;
    this.moreBtn.setAttribute('aria-pressed', String(open));
    this.moreBtn.setAttribute('aria-expanded', String(open));
    if (hud.classList.contains('is-open')) this.fitHudPanel(hud);
  },

  // prefs.hud = { x, y }: 0~1 비율(화면 너비·높이에서 단추가 움직일 수 있는 범위).
  placeHud(hud) {
    const pos = this.prefs.hud;
    const tab = hud.firstChild;
    const w = tab.offsetWidth;
    const hgt = tab.offsetHeight;
    const left = pos.x * Math.max(0, window.innerWidth - w);
    hud.style.left = `${left}px`;
    const top = pos.y * Math.max(0, window.innerHeight - hgt);
    hud.style.top = `${top}px`;
    hud.toggleAttribute('data-top', top < 72);   // 위에 붙는 알림(점검)이 들어갈 자리가 없다
    hud.dataset.open = left + w / 2 < window.innerWidth / 2 ? 'right' : 'left';   // 도구판은 화면 가운데 쪽으로 연다
    if (hud.classList.contains('is-open')) this.fitHudPanel(hud);
  },

  bindHudDrag(hud, tab) {
    let d = null;
    tab.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const r = hud.getBoundingClientRect();
      d = { id: e.pointerId, x: e.clientX, y: e.clientY, left: r.left, top: r.top, moved: false };
      try { tab.setPointerCapture(e.pointerId); } catch (err) { /* 합성 이벤트 */ }
    });
    tab.addEventListener('pointermove', (e) => {
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 8) return;
      if (!d.moved) { d.moved = true; this.setHud(hud, false); }
      e.preventDefault();
      hud.style.left = `${clamp(d.left + dx, 0, window.innerWidth - tab.offsetWidth)}px`;
      hud.style.top = `${clamp(d.top + dy, 0, window.innerHeight - tab.offsetHeight)}px`;
    });
    const end = (e) => {
      if (!d || e.pointerId !== d.id) return;
      const moved = d.moved;
      d = null;
      if (!moved) return;
      tab.dataset.dragged = '1';
      setTimeout(() => { delete tab.dataset.dragged; }, 400);   // 클릭이 오지 않는 경우(터치 취소)를 대비
      const r = tab.getBoundingClientRect();
      const frac = (at, room) => (room > 0 ? clamp(at / room, 0, 1) : 0);
      this.prefs.hud = { x: frac(r.left, window.innerWidth - r.width), y: frac(r.top, window.innerHeight - r.height) };
      this.placeHud(hud);
      this.savePrefs();
    };
    tab.addEventListener('pointerup', end);
    tab.addEventListener('pointercancel', end);
  },

  // 열린 도구판이 화면 위아래로 넘치지 않게 끌어 올리거나 내린다.
  fitHudPanel(hud) {
    const panel = hud.lastChild;   // 도구판과 더보기를 함께 담은 몸통
    panel.style.setProperty('--dy', '0px');
    panel.style.setProperty('--dx', '0px');
    const r = panel.getBoundingClientRect();
    let dy = 0;
    let dx = 0;
    if (r.top < 8) dy = 8 - r.top;
    else if (r.bottom > window.innerHeight - 8) dy = window.innerHeight - 8 - r.bottom;
    // 좁은 화면에서 더보기까지 펼치면 옆으로 넘칠 수 있다: 화면 안으로 민다(단추를 조금 덮는 것은 괜찮다)
    if (r.right > window.innerWidth - 8) dx = Math.max(8 - r.left, window.innerWidth - 8 - r.right);
    else if (r.left < 8) dx = Math.min(8 - r.left, window.innerWidth - 8 - r.right);
    panel.style.setProperty('--dy', `${dy}px`);
    panel.style.setProperty('--dx', `${dx}px`);
  },

  setHud(hud, open) {
    if (!open && this.pop && hud.contains(this.popAnchor)) this.closePop(true);
    if (!open) this.setMore(hud, false);
    hud.classList.toggle('is-open', open);
    hud.firstChild.setAttribute('aria-expanded', String(open));
    if (open) this.fitHudPanel(hud);
  },

  sync() {
    for (const b of qsa('.ch-toolbar [data-tool], .ch-hud [data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === Tools.current));
    this.styleBtn.style.setProperty('--swatch', Tools.current === 'hl' ? Tools.hlColor : Tools.penColor);
    this.classBtn.querySelector('span').textContent = Session.current;
    this.classBtn.title = `반: ${Session.current}`;   // 툴바 알약에서 말줄임된 긴 반 이름도 다 보이게
    this.classBtn.setAttribute('aria-label', `반: ${Session.current}`);
  },

  togglePop(anchor, makeContent) {
    if (this.pop && this.popAnchor === anchor) { this.closePop(); return; }
    this.closePop(true);
    this.pop = h('div', { class: 'ch-pop', role: 'dialog' }, makeContent());
    this.pop.addEventListener('keydown', (e) => this.buttonKeys(e));
    this.popAnchor = anchor;
    document.body.append(this.pop);
    const a = anchor.getBoundingClientRect();
    const p = this.pop.getBoundingClientRect();
    // 툴바가 아래면 버튼 위로, 왼쪽이면 오른편으로, 오른쪽이면 왼편으로 띄운다(HUD는 그 HUD의 쪽).
    const hud = anchor.closest('.ch-hud');
    // 도구판이 오른쪽으로 열렸으면(단추가 화면 왼쪽) 팝오버도 오른편으로, 아니면 왼편으로
    const side = hud ? (hud.dataset.open === 'right' ? 'left' : 'right') : 'bottom';
    let x = a.left + a.width / 2 - p.width / 2;
    let y = a.top - p.height - 10;
    if (side === 'left') {
      x = a.right + 10;
      y = a.top + a.height / 2 - p.height / 2;
    } else if (side === 'right') {
      x = a.left - p.width - 10;
      y = a.top + a.height / 2 - p.height / 2;
    }
    this.pop.style.left = `${clamp(x, 8, window.innerWidth - p.width - 8)}px`;
    this.pop.style.top = `${clamp(y, 8, window.innerHeight - p.height - 8)}px`;
  },

  // keepHud가 아니면, 더보기에서 연 팝오버를 닫을 때(골랐을 때) 도구판도 함께 닫는다.
  closePop(keepHud) {
    const anchor = this.popAnchor;
    if (this.pop) this.pop.remove();
    this.pop = null;
    this.popAnchor = null;
    if (keepHud || !anchor || !this.el.contains(anchor)) return;
    for (const hud of Object.values(this.huds)) if (hud.contains(anchor)) this.setHud(hud, false);
  },

  stylePanel() {
    const isHl = Tools.current === 'hl';
    const dark = document.body.classList.contains('ch-dark-page');
    const colors = isHl ? HL_COLORS : PEN_COLORS.concat(dark ? [PEN_WHITE] : []);
    const cur = isHl ? Tools.hlColor : Tools.penColor;
    const pick = (c) => {
      if (isHl) Tools.hlColor = c; else Tools.penColor = c;
      if (!isHl && Tools.current !== 'pen') Tools.set('pen');
      this.savePrefs();
      this.closePop();
      this.sync();
    };
    const wrap = h('div', { class: 'ch-pop-style' },
      h('div', { class: 'ch-swatches' }, ...colors.map((c) => h('button', {
        type: 'button', class: 'ch-swatch', 'aria-label': c, 'aria-pressed': String(c === cur), style: `--c:${c}`, onclick: () => pick(c),
      }))));
    if (!isHl) {
      wrap.append(h('div', { class: 'ch-widths' }, ...PEN_WIDTHS.map((w, i) => h('button', {
        type: 'button', class: 'ch-width', 'aria-label': ['가늘게', '보통', '굵게'][i], 'aria-pressed': String(w === Tools.penWidth), style: `--w:${w}px`,
        onclick: () => {
          Tools.penWidth = w;
          if (Tools.current !== 'pen') Tools.set('pen');
          this.savePrefs();
          this.closePop();
          this.sync();
        },
      }))));
    }
    return wrap;
  },

  classPanel() {
    const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      const text = await f.text();
      const parsed = InkModel.parseBackup(text);
      if (!parsed.ok) { await Ask.ask(parsed.error, { alert: true }); return; }
      if (parsed.deck && parsed.deck !== Session.deck && !await Ask.ask('다른 수업의 백업이에요. 그래도 불러올까요?', { ok: '불러오기' })) return;
      await Session.importBackup(text);
      this.closePop();
      await Ask.ask('판서 백업을 불러왔어요.', { alert: true });
    });
    return h('div', { class: 'ch-pop-class' },
      h('h3', { text: '반 고르기' }),
      h('div', { class: 'ch-class-list' }, ...Session.classes.map((c) => h('button', {
        type: 'button', class: 'ch-class', 'aria-pressed': String(c === Session.current), text: c,
        onclick: async () => { this.closePop(); await Session.switchTo(c); },
      }))),
      this.menuItem('＋ 반 추가', async () => {
        this.closePop();
        const name = await Ask.ask('반 이름 (예: 2반)', { input: '', ok: '추가' });
        if (name && await Session.addClass(name)) await Session.switchTo(name.trim().slice(0, 20));
      }),
      this.menuItem('이 반 판서 모두 지우기', async () => {
        this.closePop();
        if (await Ask.ask(`${Session.current}: 이 수업의 판서를 모두 지울까요?`, { ok: '모두 지우기' })) await Session.clearCurrent();
      }),
      this.menuItem('이 반 삭제', async () => {
        this.closePop();
        if (Session.classes.length <= 1) { await Ask.ask('반이 하나뿐이라 지울 수 없어요.', { alert: true }); return; }
        if (await Ask.ask(`${Session.current}을(를) 반 목록에서 지울까요? 이 수업의 그 반 판서도 지워져요.`, { ok: '삭제' })) await Session.removeClass(Session.current);
      }),
      this.menuItem('판서 백업 파일로 저장', async () => {
        this.closePop();
        saveText(`${Session.deck}-판서백업-${new Date().toISOString().slice(0, 10)}.json`, await Session.exportBackup(), 'application/json');
      }),
      this.menuItem('백업 파일 불러오기', () => file.click()),
      file);
  },

  // 화면 아래에 툴바를 깔지 않으니 무대 여백은 모두 0이다.
  applyDock() {
    const root = document.documentElement.style;
    for (const side of ['bottom', 'left', 'right']) root.setProperty(`--ch-reserve-${side}`, '0px');
    this.closePop();
    Stage.fit();
  },

  savePrefs() {
    Store.set('toolbar', { float: this.prefs.hud, penColor: Tools.penColor, penWidth: Tools.penWidth, hlColor: Tools.hlColor });
  },

  onKey(e) {
    if (!Settings.enabled('ink')) return;   // 판서를 끈 기기: 도구 단축키·되돌리기 없음
    const k = keyName(e);
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); Ink.undo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const map = { p: 'pen', h: 'hl', e: 'eraser', l: 'laser', escape: 'hand' };
    if (map[k]) Tools.set(map[k]);
  },
};
