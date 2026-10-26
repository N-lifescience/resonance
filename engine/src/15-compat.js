// 옛 브라우저 맞춤. 크로뮴 104·사파리 14.1보다 오래된 브라우저(업데이트를 막아 둔 학교 태블릿의 삼성 인터넷·웹뷰 등)는
// CSS translate 속성을 모른다. 편집에서 옮긴 자리는 style="translate: X Y"로 저장되므로 그 브라우저에서는 옮김이 빠진다.
// 그러면 교사 화면과 장 모양이 달라져 실시간 판서가 빗나간다(2026-10 수업: 그림과 ② 문장이 제자리로 돌아가 동그라미가 어긋남).
// 그런 브라우저에서만 같은 거리를 상대 위치나 여백으로 옮긴다. 원본(Source)은 건드리지 않아 저장 파일은 그대로다.
const Compat = {
  done: new WeakSet(),

  init() {
    if (!window.CSS || !CSS.supports || CSS.supports('translate', '1px 1px')) return;
    // 장이 보일 때 맞춘다: 숨은 장은 auto 여백을 px로 알려 주지 않는다. 줄이기(Fit)보다 먼저 듣는다.
    on('show', (slide) => {
      if (this.done.has(slide)) return;
      this.done.add(slide);
      this.translate(slide);
    });
  },

  // root 안에서 style 속성에 translate를 px로 적은 요소를 그만큼 옮긴다. translate처럼 둘레 배치와 요소 폭은 바꾸지 않는다.
  translate(root) {
    const px = (v) => parseFloat(v) || 0;
    for (const el of qsa('[style*="translate"]', root)) {
      const m = /(?:^|;)\s*translate\s*:\s*([^;]+)/i.exec(el.getAttribute('style'));
      const v = m ? m[1].trim().split(/\s+/) : [];
      if (!v.length || v.length > 2 || !v.every((s) => /^-?(\d+\.?\d*|\.\d+)(px)?$/.test(s))) continue;   // 편집기가 적는 px만
      const [x, y = 0] = v.map(parseFloat);
      if (!x && !y) continue;
      if (el instanceof SVGElement && el.ownerSVGElement) {   // 그림 속 도형: 사용자 단위가 CSS px와 같다
        el.setAttribute('transform', `translate(${x} ${y}) ${el.getAttribute('transform') || ''}`.trim());
        continue;
      }
      const cs = getComputedStyle(el);
      if (cs.position === 'absolute' || cs.position === 'fixed') {
        // 떠 있는 요소: 한쪽 여백에 더하고 반대쪽에서 빼면 폭·높이는 그대로 자리만 옮겨진다(left·right를 함께 준 요소도)
        el.style.marginLeft = `${px(cs.marginLeft) + x}px`;
        el.style.marginRight = `${px(cs.marginRight) - x}px`;
        el.style.marginTop = `${px(cs.marginTop) + y}px`;
        el.style.marginBottom = `${px(cs.marginBottom) - y}px`;
      } else if (cs.position === 'static' || cs.position === 'relative') {
        if (cs.position === 'static') el.style.position = 'relative';
        el.style.left = `${px(cs.left) + x}px`;
        el.style.top = `${px(cs.top) + y}px`;
      }
    }
  },
};
