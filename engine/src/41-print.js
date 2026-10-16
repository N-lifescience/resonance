// 모든 슬라이드의 단계를 펼쳐 인쇄한다. 판서는 현재 반의 문서에서 가져온다.
const Print = {
  added: [],
  opened: false,

  init() {
    window.addEventListener('beforeprint', () => this.before());
    window.addEventListener('afterprint', () => this.after());
  },

  inkImage(strokes) {
    const canvas = document.createElement('canvas');
    canvas.width = STAGE_W * 2;
    canvas.height = STAGE_H * 2;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    // 화면과 같게: 형광펜 획은 불투명하게 그리고 그림 전체의 투명도는 CSS(.ch-print-hl)가 정한다
    for (const pass of ['hl', 'pen']) {
      for (const stroke of strokes) if (stroke.t === pass) Ink.drawStrokeOn(ctx, stroke);
    }
    return h('img', { class: 'ch-print-ink', alt: '', src: canvas.toDataURL('image/png') });
  },

  add(parent, el) {
    parent.append(el);
    this.added.push(el);
  },

  appendInk(parent, strokes) {
    // 형광펜은 별도 그림으로 합성하여 인쇄에서도 본문 글자가 비치게 한다.
    for (const pass of ['hl', 'pen']) {
      const selected = strokes.filter((s) => s.t === pass);
      if (!selected.length) continue;
      const img = this.inkImage(selected);
      img.classList.add(`ch-print-${pass}`);
      this.add(parent, img);
    }
  },

  before() {
    this.after();
    this.opened = true;
    emit('print-before');   // 부품: 단계 막대 끝 칸, 문제 정답 표시 등
    if (!Settings.values.printInk || !Settings.enabled('ink') || !Session.doc) return;
    for (const slide of Stage.slides) {
      const strokes = Session.doc.slides[slide.dataset.key];
      if (Array.isArray(strokes) && strokes.length) this.appendInk(slide, strokes);
    }
    Session.doc.boards.forEach((board, i) => {
      if (!board.strokes.length) return;
      const page = h('section', {
        class: 'slide ch-print-board', 'data-page': `칠판 ${i + 1}`, 'data-bg': board.bg,
      }, h('div', { class: 'ch-board', 'data-bg': board.bg }));
      this.add(Stage.deck, page);
      this.appendInk(page, board.strokes);
    });
  },

  after() {
    for (const el of this.added) el.remove();
    this.added = [];
    if (this.opened) emit('print-after');
    this.opened = false;
  },
};
