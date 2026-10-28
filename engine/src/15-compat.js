// 옛 브라우저 맞춤. 크로뮴 104·사파리 14.1보다 오래된 브라우저(업데이트를 막아 둔 학교 태블릿의 삼성 인터넷·웹뷰 등)는
// CSS translate 속성을 모른다. 편집에서 옮긴 자리는 style="translate: X Y"로 저장되므로 그 브라우저에서는 옮김이 빠진다.
// 그러면 교사 화면과 장 모양이 달라져 실시간 판서가 빗나간다(2026-10 수업: 그림과 ② 문장이 제자리로 돌아가 동그라미가 어긋남).
// 그런 브라우저에서만 같은 거리를 상대 위치나 여백으로 옮긴다. 원본(Source)은 건드리지 않아 저장 파일은 그대로다.
const COMPAT_LOOSEN = /:(where|is|matches|-webkit-any|has)\(|:not\([^)]*,/i;   // 옛 브라우저가 규칙째 버리는 선택자

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

  // ---- :where()·:is()를 모르는 옛 브라우저 ----
  // 크로뮴 88보다 오래된 브라우저는 :where()·:is()가 든 규칙을 통째로 버린다. 엔진의 장 글꼴 크기·줄 간격·여백(:where(.slide) h1,
  // :where(.slide) p 등)이 모두 이런 규칙이라, 그 기기에서는 제목·표·작은 글씨가 브라우저 기본 크기로 커지고 줄 간격과 여백이 달라졌다.
  // 교사 화면과 장 모양이 달라 실시간 판서가 빗나갔다(2026-10 수업, 학생 태블릿). 그런 브라우저에서만 엔진 CSS와 수업 <style>을
  // 다시 읽어, 그 규칙을 옛 브라우저가 읽는 선택자로 풀어 쓴 스타일을 원래 스타일 바로 뒤에 넣는다. 새 브라우저는 아무것도 하지 않는다.
  selOk(sel) {
    try { document.querySelector(sel); return true; } catch (err) { return false; }
  },

  async loosen() {
    if (this.selOk(':where(html)') && this.selOk(':is(html)')) return;
    const jobs = qsa('link[rel~="stylesheet"][href], style').map(async (el) => {
      if (el.hasAttribute('data-ch-compat')) return;
      // 링크한 CSS는 다시 받는다(방금 받은 파일이라 캐시에서 온다). 못 받으면(다른 사이트가 막음) 그대로 둔다.
      const text = el.tagName === 'STYLE' ? el.textContent : await this.get(el.href);
      const css = this.rewrite(text);
      if (css) el.after(h('style', { 'data-ch-compat': '' }, css));
    });
    await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 3000))]);
  },

  // XMLHttpRequest: fetch와 달리 file:// 수업 파일 옆의 CSS도 읽는다
  get(url) {
    return new Promise((resolve) => {
      try {
        const x = new XMLHttpRequest();
        x.open('GET', url);
        x.onload = () => resolve(x.status === 200 || (x.status === 0 && x.responseText) ? x.responseText : '');
        x.onerror = () => resolve('');
        x.send();
      } catch (err) { resolve(''); }
    });
  },

  // CSS 글에서 옛 브라우저가 버리는 규칙만 골라 풀어 쓴다(@media·@supports 안도). 고칠 것이 없으면 ''.
  rewrite(text) { return this.block(String(text || '').replace(/\/\*[\s\S]*?\*\//g, '')); },

  block(src) {
    let out = '';
    let i = 0;
    for (;;) {
      const open = this.index(src, '{', i);
      if (open < 0) return out;
      const end = this.pair(src, open, '{', '}');
      if (end < 0) return out;
      const heads = this.split(src.slice(i, open), ';');   // 앞의 @import …; 같은 문장은 건너뛴다
      const head = heads[heads.length - 1].trim();
      const body = src.slice(open + 1, end);
      i = end + 1;
      if (head[0] === '@') {
        if (/^@(media|supports)\b/i.test(head)) {
          const inner = this.block(body);
          if (inner) out += `${head}{${inner}}\n`;
        }
        continue;
      }
      if (!COMPAT_LOOSEN.test(head)) continue;
      // 선택자 하나만 못 읽어도 규칙 전체가 버려졌으므로 같은 규칙의 다른 선택자도 함께 쓴다
      const sels = [...new Set(this.split(head, ',').flatMap((x) => this.sel(x.trim())))];
      if (sels.length) out += `${sels.join(',')}{${body}}\n`;
    }
  },

  // 선택자 하나 → 옛 브라우저가 읽는 선택자 목록. :has()는 흉내 낼 수 없어 뺀다.
  sel(s) {
    const plain = this.mask(s);   // 속성 값·따옴표 안은 찾지 않는다
    if (!s || /:has\(/i.test(plain)) return [];
    // :where(.slide) 뒤 자손: :where는 특정도가 0이라 '장 안' 조건만 덜어 내면 특정도가 같다(수업 CSS가 그대로 이긴다).
    // 태그만으로 된 선택자(h1, p, ul li)는 엔진 창(실시간 입장 화면 등)의 같은 태그까지 바뀌지 않게 section 안으로 묶는다.
    // 클래스·속성이 하나라도 있으면(.calc output) 묶지 않는다: 특정도가 올라가 같은 특정도의 수업 CSS를 이기게 된다.
    const m = /:where\(\s*\.slide\s*\)/i.exec(plain);
    if (m) {
      const after = s.slice(m.index + m[0].length);
      let rep = '.slide';
      let rest = after;
      if (/^\s+[^\s>+~]/.test(after)) {
        rest = after.replace(/^\s+/, '');
        rep = /[.#[]/.test(rest) ? '' : 'section ';
      }
      return this.sel(s.slice(0, m.index) + rep + rest);
    }
    // 남은 :where()·:is(): 고를 것마다 선택자를 하나씩. :where() 안의 .slide 조건은 덜어 낸다
    // (:where(.slide .sort) .bin → .sort .bin: 특정도가 덜 올라 수업 CSS의 .sort .bin이 그대로 이긴다)
    const g = /:(where|is|matches|-webkit-any)\(/i.exec(plain);
    if (g) {
      const at = g.index + g[0].length - 1;
      const end = this.pair(s, at, '(', ')');
      if (end < 0) return [];
      const head = s.slice(0, g.index);
      const tail = s.slice(end + 1);
      const where = g[1].toLowerCase() === 'where';
      return this.split(s.slice(at + 1, end), ',').flatMap((x) => {
        const alt = where ? x.replace(/(^|\s)\.slide(?=\s|$)/g, ' ').trim() : x.trim();
        return this.sel(head + alt + tail);
      });
    }
    // :not(가, 나) → :not(가):not(나)
    let k = 0;
    for (;;) {
      const at = this.mask(s).toLowerCase().indexOf(':not(', k);
      if (at < 0) break;
      const end = this.pair(s, at + 4, '(', ')');
      if (end < 0) return [];
      const list = this.split(s.slice(at + 5, end), ',');
      const rep = list.length > 1 ? list.map((x) => `:not(${x.trim()})`).join('') : s.slice(at, end + 1);
      s = s.slice(0, at) + rep + s.slice(end + 1);
      k = at + rep.length;
    }
    return [s.trim()];
  },

  // 대괄호·따옴표 안의 글자를 _로 가린 같은 길이의 글
  mask(s) {
    let out = '';
    let depth = 0;
    let q = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { out += '_'; if (c === '\\') { out += '_'; i++; } else if (c === q) q = ''; continue; }
      if (c === '"' || c === "'") { q = c; out += '_'; continue; }
      if (c === '[') depth++;
      out += depth ? '_' : c;
      if (c === ']') depth--;
    }
    return out;
  },

  // 괄호·대괄호·따옴표 밖에서 ch로 나눈다
  split(s, ch) {
    const out = [];
    let depth = 0;
    let q = '';
    let from = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = ''; continue; }
      if (c === '"' || c === "'") q = c;
      else if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (c === ch && depth === 0) { out.push(s.slice(from, i)); from = i + 1; }
    }
    out.push(s.slice(from));
    return out;
  },

  // 따옴표 밖의 첫 ch
  index(s, ch, from) {
    let q = '';
    for (let i = from; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = ''; continue; }
      if (c === '"' || c === "'") q = c;
      else if (c === ch) return i;
    }
    return -1;
  },

  // s[at]의 여는 괄호와 짝인 닫는 괄호(따옴표 안은 건너뛴다)
  pair(s, at, open, close) {
    let depth = 0;
    let q = '';
    for (let i = at; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = ''; continue; }
      if (c === '"' || c === "'") q = c;
      else if (c === open) depth++;
      else if (c === close && --depth === 0) return i;
    }
    return -1;
  },
};
