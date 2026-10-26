// 현재 반과 그 반의 판서 문서. 저장은 0.5초 늦춰서 한다.
// 반 바꾸기·추가·삭제·비우기·백업은 run으로 하나씩 차례로 하고, 현재 반과 문서는 swap으로 한 번에 바꾼다.
// 그래서 flush(지연 저장, 창 숨김, 창 닫기)가 언제 불려도 문서는 자기 반 키에만 써진다.
const Session = {
  deck: 'deck',
  classes: ['기본'],
  current: '기본',
  doc: null,
  hist: null,
  timer: 0,
  queue: Promise.resolve(),
  unsaved: new Map(),   // 저장에 실패한(또는 저장하지 않는) 반 문서: 창을 닫기 전까지는 반을 오가도, 백업에도 남는다
  // false면 이 기기에 판서를 저장하지도 읽지도 않는다(<html data-save="off">, Store.persist). 이 기기에 남은
  // 다른 사람의 판서도 보이지 않는다. 판서는 창을 닫을 때까지 메모리에만 있다.
  keep: true,
  warned: false,

  deckKey() {
    const raw = document.documentElement.dataset.deck || document.title || location.pathname;
    return String(raw).trim().slice(0, 120) || 'deck';
  },

  async init() {
    this.deck = this.deckKey();
    this.keep = Store.persist;
    const saved = this.keep ? await Store.get('classes') : null;
    if (saved && Array.isArray(saved.list)) {
      // 저장소 값은 믿지 않는다: 문자열, 20자 이하, 위험 키 아님, 중복 없음
      const ok = (c) => typeof c === 'string' && c.trim() && c.length <= 20 && !BAD_KEYS.includes(c);
      const list = [...new Set(saved.list.filter(ok))].slice(0, 50);
      if (list.length) {
        this.classes = list;
        this.current = list.includes(saved.current) ? saved.current : list[0];
      }
    }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.flush(); });
    window.addEventListener('pagehide', () => this.flush());
    await this.loadCurrent();
  },

  key(cls) { return `ink:${this.deck}:${cls}`; },

  async load(cls) {
    if (this.unsaved.has(cls)) return this.unsaved.get(cls);
    if (!this.keep) return InkModel.emptyDoc();
    return InkModel.sanitizeDoc(await Store.get(this.key(cls))) || InkModel.emptyDoc();
  },

  async save(cls, doc) {
    if (!this.keep) this.unsaved.set(cls, doc);
    else if (await Store.set(this.key(cls), doc)) this.unsaved.delete(cls);
    else this.unsaved.set(cls, doc);
  },

  run(fn) {
    const p = this.queue.then(fn);
    this.queue = p.catch(() => {});
    return p;
  },

  swap(cls, doc) {
    clearTimeout(this.timer);
    this.current = cls;
    this.doc = doc;
    this.hist = InkModel.history();
    emit('session');
  },

  async loadCurrent() { this.swap(this.current, await this.load(this.current)); },

  changed() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 500);
    if (!this.keep && !this.warned) {   // 저장하지 않는 화면이라는 것을 처음 쓸 때 한 번 알린다
      this.warned = true;
      Toolbar.notice('이 화면은 판서를 저장하지 않아요. 창을 닫으면 사라져요.');
    }
  },

  async flush() {
    clearTimeout(this.timer);
    if (this.doc) await this.save(this.current, this.doc);
  },

  async saveClasses() { if (this.keep) await Store.set('classes', { list: this.classes, current: this.current }); },

  switchTo(cls) {
    return this.run(async () => {
      if (!this.classes.includes(cls) || cls === this.current) return;
      const doc = await this.load(cls);
      const prev = this.current;
      const prevDoc = this.doc;
      this.swap(cls, doc);
      await this.save(prev, prevDoc);   // 읽는 동안 그린 획까지 옛 반에 저장
      await this.saveClasses();
    });
  },

  addClass(name) {
    return this.run(async () => {
      const n = String(name || '').trim().slice(0, 20);
      if (!n || this.classes.includes(n) || BAD_KEYS.includes(n)) return false;
      this.classes.push(n);
      await this.saveClasses();
      return true;
    });
  },

  removeClass(cls) {
    return this.run(async () => {
      if (this.classes.length <= 1 || !this.classes.includes(cls)) return false;
      this.classes = this.classes.filter((c) => c !== cls);
      // 현재 반이면 먼저 다른 반으로 옮긴 뒤 지운다(대기 중 저장은 swap이 버린다). 그래야 flush가 지운 키를 되살리지 못한다.
      if (cls === this.current) this.swap(this.classes[0], await this.load(this.classes[0]));
      this.unsaved.delete(cls);
      if (this.keep) await Store.del(this.key(cls));   // 저장하지 않는 화면은 이 기기에 남은 다른 사람의 판서를 지우지 않는다
      await this.saveClasses();
      return true;
    });
  },

  clearCurrent() {
    return this.run(async () => {
      this.swap(this.current, InkModel.emptyDoc());
      await this.flush();
    });
  },

  exportBackup() {
    return this.run(async () => {
      const all = {};
      // 현재 반은 메모리의 문서를 쓴다: 저장이 실패하고 있어도 백업은 된다
      for (const c of this.classes) all[c] = c === this.current ? this.doc : await this.load(c);
      return InkModel.backup(this.deck, all);
    });
  },

  async importBackup(text) {
    const r = InkModel.parseBackup(text);
    if (!r.ok) return r;
    return this.run(async () => {
      for (const [c, d] of Object.entries(r.classes)) {
        if (!this.classes.includes(c)) this.classes.push(c);
        if (c === this.current) this.swap(c, d);
        await this.save(c, d);
      }
      await this.saveClasses();
      return r;
    });
  },
};
