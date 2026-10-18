/*! 공명 인트로 — 15초 모션그래픽 (Canvas 2D + DOM, 외부 라이브러리 없음)
 *  ResonanceIntro.mount(el, { onEnd, safeTop = 72, startAt = 0, autoplay = true, controls = true })
 *    → { skip(), destroy(), play(), pause(), replay(), seek(t), time(), ctaTop, ready }
 *  그림은 시간의 순수 함수 render(t)다. 같은 t면 같은 그림이 나온다(프레임 캡처용 window.__intro.seek).
 *  시간표는 128 BPM 한 박(15/32초)에 맞췄다: 1막 0~4박, 2막 4~8박, 기능 넷 각 4박, 끝 장면 8박. */
(function () {
  'use strict';
  if (window.ResonanceIntro) return;

  var DUR = 15, BEAT = DUR / 32;
  var T = { a2: 4 * BEAT, f1: 8 * BEAT, f2: 12 * BEAT, f3: 16 * BEAT, f4: 20 * BEAT, end: 24 * BEAT };
  var FSTART = [T.f1, T.f2, T.f3, T.f4, T.end];

  var FONT = '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  var MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "D2Coding", monospace';
  var FONT_CSS = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css';

  var TXT = {
    features: ['HTML 자동 생성 및 편집', '익스플로라그램 탑재', '실시간 수업', '전자칠판 기능 탑재'],
    cap1: [['학생마다', 1], ['다른', 0], ['진동수', 0]],
    cap2: [['하나로', 1], ['맞춰지는', 0], ['순간', 0]],
    name: '공명',
    tag: [['교실의', 1], ['진동수를', 0], ['맞추다', 0]],
    summary: '공명, 교실의 진동수를 맞추다. 핵심 기능 넷은 HTML 자동 생성 및 편집, 익스플로라그램 탑재, 실시간 수업, 전자칠판 기능 탑재입니다.',
    skip: '건너뛰기', pause: '멈춤', play: '재생'
  };
  // 캔버스에 쓰는 글자(글꼴 부분 집합을 미리 받아 두려고 모은다)
  var CANVAS_TXT = '진동수진폭Hz×0123456789.:공명 진동수 찾기진동수를 바꿔 보세요수업.pptx수업.html편집저장실시간코드명연결RESONANCE';

  /* ── 색 ── */
  var HEX = { clay: '#D97757', clayDeep: '#C15F3C', char: '#141413', char2: '#1F1E1C', paper: '#F4F1EA', white: '#FFFFFF', mute: '#6B6A65', muteHi: '#A8A49B', tide: '#2B6E69', tideHi: '#4FA39A', board: '#121211', lesson: '#191816' };
  var RGB = {};
  Object.keys(HEX).forEach(function (k) { var n = parseInt(HEX[k].slice(1), 16); RGB[k] = [n >> 16 & 255, n >> 8 & 255, n & 255]; });
  RGB.peach = mix(RGB.clay, RGB.paper, 0.5);
  RGB.ppt = [20, 20, 19];
  RGB.tile = [226, 221, 211];
  function rgba(c, a) { if (typeof c === 'string') c = RGB[c]; return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a == null ? 1 : Math.max(0, Math.min(1, a)).toFixed(3)) + ')'; }
  function mix(a, b, p) { if (typeof a === 'string') a = RGB[a]; if (typeof b === 'string') b = RGB[b]; return [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p, a[2] + (b[2] - a[2]) * p]; }

  /* ── 수학 ── */
  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, p) { return a + (b - a) * p; }
  function seg(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }
  var E = {
    inQ: function (p) { return p * p; },
    outQ: function (p) { return 1 - (1 - p) * (1 - p); },
    inC: function (p) { return p * p * p; },
    outC: function (p) { return 1 - Math.pow(1 - p, 3); },
    ioC: function (p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; },
    ioQuart: function (p) { return p < 0.5 ? 8 * p * p * p * p : 1 - Math.pow(-2 * p + 2, 4) / 2; },
    ioQuint: function (p) { return p < 0.5 ? 16 * Math.pow(p, 5) : 1 - Math.pow(-2 * p + 2, 5) / 2; },
    outExpo: function (p) { return p >= 1 ? 1 : 1 - Math.pow(2, -10 * p); },
    inExpo: function (p) { return p <= 0 ? 0 : Math.pow(2, 10 * p - 10); },
    outBack: function (p) { var c = 1.70158; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); },
    smooth: function (p) { return p * p * (3 - 2 * p); }
  };
  function rng(seed) {
    return function () {
      seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function wrapPi(a) { return a - TAU * Math.floor((a + Math.PI) / TAU); }
  function lerpRect(a, b, p) { return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), w: lerp(a.w, b.w, p), h: lerp(a.h, b.h, p) }; }
  function rel(K, r) { return { x: K.x + r.x * K.w, y: K.y + r.y * K.h, w: r.w * K.w, h: r.h * K.h }; }
  function grow(r, d) { return { x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d }; }
  function fitIn(aspect, R) { var w = R.w, h = w / aspect; if (h > R.h) { h = R.h; w = h * aspect; } return { x: R.x + (R.w - w) / 2, y: R.y + (R.h - h) / 2, w: w, h: h }; }
  // 수치 적분 표(위상이 진동수 변화를 따라 끊김 없이 이어지게)
  function integral(fn, t1, step) {
    var n = Math.ceil(t1 / step), tab = new Float64Array(n + 1), prev = fn(0), acc = 0;
    for (var i = 1; i <= n; i++) { var v = fn(i * step); acc += (prev + v) * 0.5 * step; tab[i] = acc; prev = v; }
    return function (t) { var x = clamp(t, 0, n * step) / step, i = Math.floor(x); if (i >= n) return tab[n]; return tab[i] + (tab[i + 1] - tab[i]) * (x - i); };
  }

  /* ── 익스플로라그램 장면의 모형: 강제 진동의 공명 곡선 ── */
  var F0 = 0.35, FMIN = 0.2, FMAX = 1.8, ZETA = 0.11, VS = 1.3;
  function amp(f) { var a = 1 - f * f, b = 2 * ZETA * f; return 1 / Math.sqrt(a * a + b * b); }
  var AMAX = amp(Math.sqrt(1 - 2 * ZETA * ZETA));
  function fAt(t) {
    var u = t - T.f2;
    if (u <= 0.15) return F0;
    if (u <= 1.15) return lerp(F0, 1.07, E.ioC(seg(u, 0.15, 1.15)));
    return lerp(1.07, 1.0, E.outC(seg(u, 1.15, 1.4)));
  }
  var PHI = integral(function (t) { return TAU * VS * fAt(t); }, DUR + 1, 1 / 240);
  // 끝 장면 파동: 점점 느려져 15초에 멈춘다
  var PHI_E = integral(function (t) { var s = t - T.end; return s < 0 ? 0 : TAU * 0.7 * (1 - E.ioC(seg(s, 1.3, 3.75))); }, DUR + 1, 1 / 240);
  var OM = TAU * 0.85, SY0 = 1.95, SY1 = 2.85;

  /* ── 그리기 도구 ── */
  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU); }
  function glow(ctx, x, y, r, col, a) {
    if (a <= 0.002 || r <= 0) return;
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function font(w, px, fam) { return w + ' ' + Math.max(1, px).toFixed(2) + 'px ' + (fam || FONT); }
  // 숫자 칸을 고정해 값이 바뀌어도 글자가 흔들리지 않게 쓴다
  function tabText(ctx, s, x, y) {
    var dw = ctx.measureText('0').width;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i], isD = ch >= '0' && ch <= '9';
      var w = isD ? dw : ctx.measureText(ch).width;
      ctx.fillText(ch, x + (isD ? (dw - ctx.measureText(ch).width) / 2 : 0), y);
      x += w;
    }
    return x;
  }
  function zoomTo(ctx, A, B, p) {
    if (p <= 0) return;
    var k = Math.min(B.w / A.w, B.h / A.h), s = Math.pow(k, p);
    var ax = A.x + A.w / 2, ay = A.y + A.h / 2, bx = B.x + B.w / 2, by = B.y + B.h / 2;
    if (Math.abs(k - 1) < 1e-3) { ctx.translate((bx - ax) * p, (by - ay) * p); return; }
    var fx = (bx - k * ax) / (1 - k), fy = (by - k * ay) / (1 - k);
    ctx.translate(fx * (1 - s), fy * (1 - s)); ctx.scale(s, s);
  }
  function icon(ctx, name, x, y, s, col) {
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(1, s * 0.1); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (name === 'pen') {
      ctx.rotate(-Math.PI / 4);
      ctx.moveTo(-s * 0.42, -s * 0.11); ctx.lineTo(s * 0.22, -s * 0.11); ctx.lineTo(s * 0.42, 0); ctx.lineTo(s * 0.22, s * 0.11); ctx.lineTo(-s * 0.42, s * 0.11); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.26, -s * 0.11); ctx.lineTo(-s * 0.26, s * 0.11); ctx.stroke();
    } else if (name === 'check') {
      ctx.moveTo(-s * 0.32, s * 0.02); ctx.lineTo(-s * 0.08, s * 0.26); ctx.lineTo(s * 0.36, -s * 0.24); ctx.stroke();
    } else if (name === 'laser') {
      circle(ctx, 0, 0, s * 0.13); ctx.fill();
      for (var i = 0; i < 6; i++) { var a = i * TAU / 6; ctx.beginPath(); ctx.moveTo(Math.cos(a) * s * 0.26, Math.sin(a) * s * 0.26); ctx.lineTo(Math.cos(a) * s * 0.4, Math.sin(a) * s * 0.4); ctx.stroke(); }
    } else if (name === 'eraser') {
      ctx.rotate(-Math.PI / 5); rr(ctx, -s * 0.36, -s * 0.18, s * 0.72, s * 0.36, s * 0.06); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.06, -s * 0.18); ctx.lineTo(-s * 0.06, s * 0.18); ctx.stroke();
    } else if (name === 'timer') {
      circle(ctx, 0, s * 0.05, s * 0.33); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, s * 0.05); ctx.lineTo(0, -s * 0.13); ctx.moveTo(-s * 0.1, -s * 0.4); ctx.lineTo(s * 0.1, -s * 0.4); ctx.stroke();
    } else if (name === 'next') {
      ctx.moveTo(-s * 0.1, -s * 0.3); ctx.lineTo(s * 0.18, 0); ctx.lineTo(-s * 0.1, s * 0.3); ctx.stroke();
    } else if (name === 'file') {
      ctx.moveTo(-s * 0.3, -s * 0.4); ctx.lineTo(s * 0.12, -s * 0.4); ctx.lineTo(s * 0.3, -s * 0.22); ctx.lineTo(s * 0.3, s * 0.4); ctx.lineTo(-s * 0.3, s * 0.4); ctx.closePath(); ctx.stroke();
    }
    ctx.restore();
  }
  function bez(p0, p1, p2, u) { var v = 1 - u; return { x: v * v * p0.x + 2 * v * u * p1.x + u * u * p2.x, y: v * v * p0.y + 2 * v * u * p1.y + u * u * p2.y }; }

  // 손으로 그은 획: 촘촘한 점 + 누적 길이. prog만큼 그린다(시작과 끝이 가늘다)
  function mkStroke(pts) {
    var len = [0];
    for (var i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    return { pts: pts, len: len, L: len[len.length - 1] };
  }
  function strokeHead(st, prog) {
    var target = st.L * clamp(prog, 0, 1), pts = st.pts, len = st.len;
    for (var i = 1; i < pts.length; i++) {
      if (len[i] >= target) { var f = (target - len[i - 1]) / Math.max(1e-6, len[i] - len[i - 1]); return { x: lerp(pts[i - 1].x, pts[i].x, f), y: lerp(pts[i - 1].y, pts[i].y, f), i: i, f: f }; }
    }
    var p = pts[pts.length - 1]; return { x: p.x, y: p.y, i: pts.length - 1, f: 1 };
  }
  function drawStroke(ctx, st, prog, w0, col) {
    if (prog <= 0) return;
    var h = strokeHead(st, prog), pts = st.pts, n = pts.length;
    ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var i = 1; i <= h.i; i++) {
      var u = st.len[i] / st.L;
      ctx.lineWidth = w0 * (0.5 + 0.5 * Math.sin(Math.PI * clamp(u * 0.92 + 0.06, 0, 1)));
      var x1 = pts[i].x, y1 = pts[i].y;
      if (i === h.i) { x1 = h.x; y1 = h.y; }
      ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(x1, y1); ctx.stroke();
    }
    if (n === 1) { circle(ctx, pts[0].x, pts[0].y, w0 / 2); ctx.fillStyle = col; ctx.fill(); }
  }
  function catmull(pts, step) {
    var out = [];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      var n = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / step));
      for (var j = 0; j < n; j++) {
        var t = j / n, t2 = t * t, t3 = t2 * t;
        out.push({
          x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
        });
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  /* 손글씨 「공명」: 한 음절을 1×1 칸으로 보고 자모 획을 순서대로 적었다 */
  var HAND = [
    // 공
    { pts: [[0.16, 0.12], [0.5, 0.1], [0.8, 0.11], [0.78, 0.24], [0.73, 0.37]] },
    { pts: [[0.47, 0.4], [0.48, 0.51]] },
    { pts: [[0.07, 0.56], [0.5, 0.545], [0.93, 0.565]] },
    { ell: [0.5, 0.8, 0.21, 0.15] },
    // 명
    { pts: [[1.1, 0.11], [1.11, 0.28], [1.12, 0.47]] },
    { pts: [[1.11, 0.11], [1.28, 0.095], [1.44, 0.11], [1.43, 0.29], [1.42, 0.46]] },
    { pts: [[1.13, 0.46], [1.28, 0.455], [1.41, 0.45]] },
    { pts: [[1.52, 0.22], [1.69, 0.225]] },
    { pts: [[1.52, 0.37], [1.69, 0.375]] },
    { pts: [[1.72, 0.04], [1.73, 0.3], [1.72, 0.6]] },
    { ell: [1.45, 0.8, 0.26, 0.145] }
  ];
  var HAND_W = 1.98;

  /* ── 장면 배치: 화면 크기마다 구도를 다시 잡는다 ── */
  function layout(W, H, safeTop, mctx) {
    var L = { W: W, H: H, top: safeTop };
    var ah = Math.max(1, H - safeTop);
    L.land = W / ah >= 1.1;
    L.u = Math.min(W, ah * 1.6) / 100;
    var padX = Math.max(16, W * 0.05);
    var padT = Math.max(12, ah * 0.04);
    var padB = L.land ? Math.max(76, ah * 0.08) : Math.max(84, ah * 0.035 + 72);
    var C = L.C = { x: padX, y: safeTop + padT, w: W - padX * 2, h: Math.max(80, H - safeTop - padT - padB) };
    if (L.land) {
      var listW = clamp(C.w * 0.32, 190, 760), gap = Math.max(24, C.w * 0.045);
      var ax = C.x + listW + gap, aw = C.x + C.w - ax;
      var sw = aw, sh = sw / 1.6;
      if (sh > C.h) { sh = C.h; sw = sh * 1.6; }
      L.S = { x: ax + (aw - sw) * 0.5, y: C.y + (C.h - sh) * 0.5, w: sw, h: sh };
      L.list = { x: C.x, y: C.y, w: listW, h: C.h };
    } else {
      var titleH = clamp(C.h * 0.3, 150, 260), avail = C.h - titleH - 12;
      var pw2 = C.w, ph2 = Math.max(Math.min(avail, pw2 * 1.02), pw2 * 0.55);
      var ptFs = clamp(W * 0.08, 24, 46), grp = ph2 + 22 + ptFs * 3.3 + 24;
      L.S = { x: C.x, y: C.y + Math.max(0, (C.h - grp) * 0.42), w: pw2, h: ph2 };
      L.pt = { x: C.x, y: L.S.y + ph2 + 22, w: C.w };
    }
    L.capFs = L.land ? clamp(L.u * 2.5, 20, 76) : clamp(W * 0.062, 20, 40);
    L.capY = C.y + C.h - L.capFs * 1.3;
    buildOpen(L);
    buildF1(L, mctx);
    buildF3(L, mctx);
    buildF4(L);
    return L;
  }

  function buildOpen(L) {
    var C = L.C, land = L.land, N = 28, cols = land ? 7 : 4, rows = land ? 4 : 7;
    var capBand = L.capFs * (land ? 2.2 : 2.6);
    var R = { x: C.x + C.w * 0.03, y: C.y + C.h * 0.02, w: C.w * 0.94, h: Math.max(60, C.h - capBand) };
    var cw = R.w / cols, chh = R.h / rows, rnd = rng(11), dots = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var q = rnd();
        dots.push({
          x: R.x + (c + 0.5) * cw + (rnd() - 0.5) * cw * 0.32,
          y: R.y + (r + 0.5) * chh + (rnd() - 0.5) * chh * 0.24,
          f: 0.55 + rnd() * 1.55, ph: rnd() * TAU,
          a: Math.min(chh, cw) * (0.13 + rnd() * 0.11),
          col: q < 0.46 ? 'clay' : q < 0.92 ? 'tideHi' : 'paper',
          tl: Math.min(cw * 0.64, chh * 1.4)
        });
      }
    }
    var cx = R.x + R.w / 2, cy = R.y + R.h / 2, dmax = 0;
    dots.forEach(function (d) { d.d = Math.hypot(d.x - cx, d.y - cy); dmax = Math.max(dmax, d.d); });
    var Rmax = dmax * 1.04 + L.u * 2;
    dots.forEach(function (d) { d.ta = 0.18 + 1.07 * (1 - Math.sqrt(1 - d.d / Rmax)); });
    var order = dots.map(function (d, i) { return i; }).sort(function (i, j) { return (dots[i].x - dots[j].x) || (dots[i].y - dots[j].y); });
    var k = TAU / (land ? L.W * 0.4 : L.W * 0.86);
    order.forEach(function (idx, rank) {
      var d = dots[idx]; d.rank = rank / (N - 1); d.lx = lerp(L.W * 0.04, L.W * 0.96, d.rank);
      var free = TAU * d.f * SY0 + d.ph, tgt = k * d.lx - OM * SY0;
      d.Dts = tgt - free; d.Dw = wrapPi(d.Dts);
    });
    L.open = {
      dots: dots, cx: cx, cy: cy, Rmax: Rmax, k: k,
      lineY: C.y + (C.h - capBand * 0.4) * 0.48,
      ab: Math.min(cw, chh) * 0.2, ap: land ? C.h * 0.26 : C.h * 0.15,
      labels: land ? [3, 8, 12, 17, 22, 26] : [1, 6, 13, 18, 25]
    };
  }
  function thetaOf(d, t, k) {
    var free = TAU * d.f * t + d.ph, s = E.ioC(seg(t, SY0, SY1));
    if (s <= 0) return free;
    var D = (k * d.lx - OM * t) - free;
    return free + s * (D - d.Dts + d.Dw);
  }
  function lineAmp(t, O) {
    var a = O.ab * E.outC(seg(t, 2.2, 2.8)) + (O.ap - O.ab) * E.ioC(seg(t, 2.88, 3.3));
    return a * (1 - E.inC(seg(t, 3.36, 3.62)));
  }

  /* 1번 장면: PPT 한 장 → 코드 → 살아 있는 수업 장 */
  var CODE = [
    [['<section', 'clay'], [' class=', 'tideHi'], ['"slide"', 'peach'], ['>', 'clay']],
    [['  ', 0], ['<h2>', 'clay'], ['공명 진동수', 'paper'], ['</h2>', 'clay']],
    [['  ', 0], ['<p>', 'clay'], ['진동수를 바꿔 보세요', 'paper'], ['</p>', 'clay']],
    [['  ', 0], ['<div', 'clay'], [' data-expr=', 'tideHi'], ['"amp(f)"', 'peach'], ['>', 'clay']],
    [['    ', 0], ['<input', 'clay'], [' type=', 'tideHi'], ['"range"', 'peach'], ['>', 'clay']],
    [['    ', 0], ['<canvas', 'clay'], [' data-anim', 'tideHi'], ['>', 'clay']],
    [['  ', 0], ['</div>', 'clay']],
    [['</section>', 'clay']]
  ];
  function buildF1(L, ctx) {
    var S = L.S, tabRoom = S.h * 0.1;
    var K = fitIn(16 / 9, { x: S.x + S.w * 0.03, y: S.y + tabRoom, w: S.w * 0.94, h: S.h - tabRoom - S.h * 0.03 });
    var aS = S.w / S.h;
    var ph = K.h * 0.64, pw = ph * aS;
    if (pw > K.w * 0.6) { pw = K.w * 0.6; ph = pw / aS; }
    var pr1 = { x: K.x + K.w * 0.955 - pw, y: K.y + K.h * 0.94 - ph, w: pw, h: ph };
    var colX = K.x + K.w * 0.055, colW = pr1.x - colX - K.w * 0.04;
    ctx.font = font('800', 100);
    var tFs = Math.min(K.h * 0.075, colW / (ctx.measureText('공명 진동수 찾기').width / 100));
    ctx.font = font('500', 100);
    var iFs = Math.min(tFs * 0.62, colW / (ctx.measureText('진동수를 바꿔 보세요').width / 100));
    var tY = pr1.y + tFs * 0.95, iY = tY + tFs * 0.95 + iFs * 0.9;
    ctx.font = font('800', tFs); var tW = ctx.measureText('공명 진동수').width;
    ctx.font = font('500', iFs); var iW = ctx.measureText('진동수를 바꿔 보세요').width;
    var dotsY = pr1.y + pr1.h - K.h * 0.035, dotR = K.h * 0.014;

    // 코드 글자 자리
    var fs = K.h * 0.05, lh = K.h * 0.098, cx0 = K.x + K.w * 0.085;
    ctx.font = font('600', fs, MONO);
    var toks = [];
    CODE.forEach(function (line, li) {
      var x = cx0, base = K.y + K.h * (0.17 + li * 0.098);
      line.forEach(function (tk) {
        var w = ctx.measureText(tk[0]).width;
        if (tk[1]) toks.push({ line: li, text: tk[0], ccol: RGB[tk[1]], C: { x: (x - K.x) / K.w, y: (base - fs * 0.8 - K.y) / K.h, w: w / K.w, h: fs / K.h }, base: base });
        x += w;
      });
    });
    // PPT 자리: 제목 막대, 글머리표 셋, 그림 칸(3×3)
    function split(list, x, y, wTot, h, gapR) {
      var sum = 0; list.forEach(function (tk) { sum += tk.C.w; });
      var gap = gapR * (list.length - 1), xx = x;
      list.forEach(function (tk) { var w = (wTot - gap) * tk.C.w / sum; tk.P = { x: xx, y: y, w: w, h: h }; xx += w + gapR; });
    }
    function byLine(n) { return toks.filter(function (tk) { return tk.line === n; }); }
    split(byLine(1), 0.085, 0.13, 0.44, 0.085, 0.012);
    byLine(1).forEach(function (tk) { tk.pcol = RGB.ppt; tk.pa = 0.85; });
    [[2, 0.34, 0.36], [3, 0.47, 0.4], [4, 0.6, 0.3]].forEach(function (b) {
      split(byLine(b[0]), 0.115, b[1], b[2], 0.042, 0.01);
      byLine(b[0]).forEach(function (tk) { tk.pcol = RGB.ppt; tk.pa = 0.26; });
    });
    var img = byLine(0).concat(byLine(5), byLine(6), byLine(7));
    var IM = { x: 0.6, y: 0.3, w: 0.32, h: 0.44 };
    img.forEach(function (tk, i) {
      var c = i % 3, r = Math.floor(i / 3), g = 0.006;
      tk.P = { x: IM.x + c * (IM.w + g) / 3, y: IM.y + r * (IM.h + g) / 3, w: IM.w / 3 - g, h: IM.h / 3 - g };
      tk.pcol = RGB.tile; tk.pa = 1;
    });
    // 수업 장 자리
    function relR(x, y, w, h) { return { x: (x - K.x) / K.w, y: (y - K.y) / K.h, w: w / K.w, h: h / K.h }; }
    var tl = byLine(1), il = byLine(2);
    var tx = colX; tl.forEach(function (tk) { var w = tW / tl.length; tk.L = relR(tx, tY - tFs * 0.82, w * 0.94, tFs * 0.86); tx += w; });
    var ix = colX; il.forEach(function (tk) { var w = iW / il.length; tk.L = relR(ix, iY - iFs * 0.8, w * 0.94, iFs * 0.8); ix += w; });
    byLine(0).forEach(function (tk, i) { tk.L = relR(colX + i * dotR * 3.2 - dotR, dotsY - dotR, dotR * 2, dotR * 2); });
    var tiles = byLine(3).concat(byLine(4), byLine(5), byLine(6), byLine(7));
    tiles.forEach(function (tk, i) {
      var c = i % 5, r = Math.floor(i / 5), g = pw * 0.012;
      tk.L = relR(pr1.x + c * (pw + g) / 5, pr1.y + r * (ph + g) / 3, pw / 5 - g, ph / 3 - g);
    });
    toks.forEach(function (tk, i) { tk.lo = i; });

    // 편집 막대(카드 안 오른쪽 위)
    var tbH = K.h * 0.085, tbFs = tbH * 0.46;
    ctx.font = font('700', tbFs);
    var eW = tbH * 0.5 + ctx.measureText('편집').width + tbH * 0.55;
    var tbW = eW + tbH + tbH * 0.25;
    var tb = { x: K.x + K.w * 0.955 - tbW, y: K.y + K.h * 0.055, w: tbW, h: tbH, eW: eW, fs: tbFs };
    var tab = { h: K.h * 0.075 };
    ctx.font = font('600', tab.h * 0.48, MONO);
    tab.w = tab.h * 1.1 + ctx.measureText('수업.pptx').width + tab.h * 0.5;
    tab.x = K.x; tab.y = K.y - tab.h - K.h * 0.03;
    L.f1 = { K: K, pr1: pr1, toks: toks, fs: fs, lh: lh, cx0: cx0, tFs: tFs, iFs: iFs, colX: colX, tY: tY, iY: iY, tW: tW, dotsY: dotsY, dotR: dotR, tb: tb, tab: tab };
  }

  /* 3번 장면: 교사 화면 + QR + 학생 기기 */
  function buildF3(L, ctx) {
    var S = L.S, land = L.land, bzr = 0.03;
    var tsW = land ? S.w * 0.6 : S.w * 0.92;
    var pw = tsW / (1 + 2 * bzr), ph = pw / 1.6, bz = pw * bzr;
    var ts = { x: S.x + (S.w - tsW) / 2, y: S.y, w: tsW, h: ph + 2 * bz };
    var tsPanel = { x: ts.x + bz, y: ts.y + bz, w: pw, h: ph };
    var N = land ? 7 : (L.W < 520 ? 5 : 7);
    var top = ts.y + ts.h + S.h * 0.08, bot = S.y + S.h;
    var phH = Math.max(30, (bot - top) * 0.94), phW = phH * 0.5;
    var gap = phW * 0.42, tot = N * phW + (N - 1) * gap;
    if (tot > S.w * 0.96) { var sc = S.w * 0.96 / tot; phW *= sc; phH *= sc; gap *= sc; tot = S.w * 0.96; }
    var phones = [];
    for (var i = 0; i < N; i++) {
      var nx = (i - (N - 1) / 2) / ((N - 1) / 2 || 1);
      phones.push({ x: S.x + (S.w - tot) / 2 + i * (phW + gap), y: top + (bot - top - phH) * 0.5 + nx * nx * phH * 0.06 * (land ? 1 : 0), w: phW, h: phH, o: Math.abs(nx) });
    }
    var order = phones.map(function (p, i) { return i; }).sort(function (a, b) { return phones[a].o - phones[b].o; });
    order.forEach(function (idx, r) { phones[idx].k = r; });
    var q = Math.min(tsPanel.h * 0.8, tsPanel.w * 0.42);
    var qr = { w: q * 0.82, h: q };
    qr.x = tsPanel.x + (tsPanel.w - qr.w) / 2; qr.y = tsPanel.y + (tsPanel.h - qr.h) / 2;
    var pH = tsPanel.h * 0.115, pFs = pH * 0.46;
    ctx.font = font('700', pFs);
    var pill = { h: pH, fs: pFs, tw: ctx.measureText('실시간').width };
    pill.w = pH * 0.55 + pill.tw + pH * 0.35 + pH * 0.78 + pH * 0.2;
    pill.x = tsPanel.x + tsPanel.w - pill.w - tsPanel.w * 0.03; pill.y = tsPanel.y + tsPanel.h * 0.05;
    // QR 무늬(장식용. 실제로 읽히지 않는다)
    var rnd = rng(5), mods = [], M = 21;
    function finder(r, c) { return (r < 7 && c < 7) || (r < 7 && c >= M - 7) || (r >= M - 7 && c < 7); }
    for (var r = 0; r < M; r++) for (var c = 0; c < M; c++) {
      if (finder(r, c)) continue;
      if ((r === 7 || c === 7 || r === M - 8 || c === M - 8) && (r < 8 || c < 8 || (r < 8 && c >= M - 8) || (r >= M - 8 && c < 8))) continue;
      if (rnd() < 0.48) mods.push({ r: r, c: c, t: rnd() });
    }
    L.f3 = { ts: ts, tsPanel: tsPanel, bzr: bzr, phones: phones, qr: qr, mods: mods, pill: pill };
  }

  /* 4번 장면: 전자칠판 판서 */
  function buildF4(L) {
    var G3 = L.f3, ts = G3.ts;
    var B = fitIn(ts.w / ts.h, L.S);
    var k = B.w / ts.w;
    var bzRect = { x: B.x + (G3.tsPanel.x - ts.x) * k, y: B.y + (G3.tsPanel.y - ts.y) * k, w: G3.tsPanel.w * k, h: G3.tsPanel.h * k };
    var iw = B.w * 0.58, inner = { x: B.x + B.w * 0.045, y: B.y + B.w * 0.045, w: iw, h: iw / 1.6 };
    var tbH = Math.max(28, B.h * 0.1), n = 5;
    var tb = { w: tbH * (n * 1.05 + 0.4), h: tbH };
    tb.x = B.x + (B.w - tb.w) / 2; tb.y = B.y + B.h - tbH - B.h * 0.045;
    tb.icons = ['pen', 'laser', 'eraser', 'timer', 'next'].map(function (nm, i) { return { name: nm, x: tb.x + tbH * (0.2 + 0.525 + i * 1.05), y: tb.y + tbH / 2 }; });
    // 손글씨 상자: 칠판 오른쪽 빈자리
    var hx0 = inner.x + inner.w + B.w * 0.05, hw = B.x + B.w - B.w * 0.05 - hx0;
    var hh = hw / HAND_W;
    var hb = { x: hx0, y: inner.y + inner.h * 0.3 - hh * 0.5, w: hw, h: hh };
    // 손글씨 획
    var rnd = rng(23), hs = [];
    HAND.forEach(function (h) {
      var raw = [];
      if (h.ell) {
        var e = h.ell, a0 = -Math.PI / 2 - 0.25, n2 = 26;
        for (var i = 0; i <= n2; i++) {
          var a = a0 - (i / n2) * (TAU + 0.45), j = 1 + Math.sin(a * 2 + 1.3) * 0.04;
          raw.push([e[0] + Math.cos(a) * e[2] * j, e[1] + Math.sin(a) * e[3] * j]);
        }
      } else raw = h.pts;
      var pts = raw.map(function (p) {
        var x = p[0] + (0.5 - p[1]) * 0.07 + (rnd() - 0.5) * 0.012, y = p[1] + (rnd() - 0.5) * 0.012;
        return { x: hb.x + x / HAND_W * hb.w, y: hb.y + y * hb.h };
      });
      hs.push(mkStroke(catmull(pts, Math.max(1.5, hb.h * 0.02))));
    });
    // 판서 시간표: 획 길이에 비례
    var t0 = 1.08, t1 = 1.6, gapT = 0.022, tot = 0;
    hs.forEach(function (s) { tot += s.L; });
    var avail = (t1 - t0) - gapT * (hs.length - 1), tt = t0;
    hs.forEach(function (s) { s.t0 = tt; s.t1 = tt + avail * s.L / tot; tt = s.t1 + gapT; });
    // 동그라미와 화살표(봉우리 → 손글씨)
    var g = panelGeom(inner), m = markerXY(g, 1.0);
    var rx = inner.w * 0.085, ry = inner.h * 0.11, cpts = [];
    for (var i2 = 0; i2 <= 40; i2++) {
      var a2 = -2.3 + (i2 / 40) * (TAU + 0.55), jj = 1 + Math.sin(a2 * 3 + 0.7) * 0.05;
      cpts.push({ x: m.x + Math.cos(a2) * rx * jj, y: m.y + Math.sin(a2) * ry * jj - ry * 0.05 });
    }
    var circleS = mkStroke(cpts); circleS.t0 = 0.6; circleS.t1 = 0.84;
    var p0 = { x: m.x + rx * 1.05, y: m.y - ry * 0.4 }, p2 = { x: hb.x - hb.w * 0.06, y: hb.y + hb.h * 0.62 };
    var p1 = { x: (p0.x + p2.x) / 2, y: Math.min(p0.y, p2.y) - hb.h * 0.55 };
    var apts = []; for (var i3 = 0; i3 <= 24; i3++) apts.push(bez(p0, p1, p2, i3 / 24));
    var arrowS = mkStroke(apts); arrowS.t0 = 0.86; arrowS.t1 = 0.99;
    var dir = Math.atan2(p2.y - apts[21].y, p2.x - apts[21].x), al = hb.h * 0.22;
    var h1 = mkStroke([{ x: p2.x - Math.cos(dir - 0.5) * al, y: p2.y - Math.sin(dir - 0.5) * al }, p2]); h1.t0 = 0.995; h1.t1 = 1.03;
    var h2 = mkStroke([p2, { x: p2.x - Math.cos(dir + 0.5) * al, y: p2.y - Math.sin(dir + 0.5) * al }]); h2.t0 = 1.035; h2.t1 = 1.065;
    L.f4 = { B: B, bez: bzRect, inner: inner, tb: tb, hb: hb, hand: hs, ink: [circleS, arrowS, h1, h2], handW: Math.max(2, hb.h * 0.075), inkW: Math.max(2, B.h * 0.012) };
  }

  /* ── 익스플로라그램 판(1·2·3·4번 장면이 같은 그림을 다른 크기로 쓴다) ── */
  function panelGeom(R) {
    var a = R.w / R.h, st = E.smooth(clamp((1.5 - a) / 0.15, 0, 1));
    var s = Math.min(R.w, R.h * 1.6), pad = s * 0.045;
    var headH = s * 0.13 + st * s * 0.02;
    var slY = R.y + R.h - pad - s * 0.03;
    var top = R.y + pad + headH, bot = slY - s * 0.075, bh = bot - top, bw = R.w - 2 * pad;
    var A1 = { x: R.x + pad, y: top, w: bw * 0.5, h: bh }, G1 = { x: R.x + pad + bw * 0.58, y: top + bh * 0.04, w: bw * 0.42, h: bh * 0.92 };
    var A2 = { x: R.x + pad, y: top, w: bw, h: bh * 0.44 }, G2 = { x: R.x + pad + bw * 0.06, y: top + bh * 0.54, w: bw * 0.94, h: bh * 0.46 };
    return { R: R, s: s, pad: pad, st: st, str: lerpRect(A1, A2, st), gr: lerpRect(G1, G2, st), sl: { x0: R.x + pad + s * 0.02, x1: R.x + R.w - pad - s * 0.02, y: slY } };
  }
  function knobXY(g, f) { return { x: lerp(g.sl.x0, g.sl.x1, (f - FMIN) / (FMAX - FMIN)), y: g.sl.y }; }
  function markerXY(g, f) { var G = g.gr; return { x: G.x + (f - FMIN) / (FMAX - FMIN) * G.w, y: G.y + G.h - amp(f) / AMAX * G.h * 0.9 }; }

  function drawPanel(ctx, R, t, f) {
    var g = panelGeom(R), s = g.s, A = amp(f), An = A / AMAX;
    var res = Math.exp(-Math.pow((f - 1) / 0.07, 2));
    rr(ctx, R.x, R.y, R.w, R.h, s * 0.03);
    ctx.fillStyle = HEX.char2; ctx.fill();
    ctx.lineWidth = Math.max(0.5, s * 0.0022); ctx.strokeStyle = rgba('paper', 0.1); ctx.stroke();
    // 읽은 값
    var fsL = s * 0.031, fsV = s * 0.062, hx = R.x + g.pad, hy = R.y + g.pad * 0.9;
    var hx2 = R.x + g.pad + (R.w - 2 * g.pad) * lerp(0.5, 0.52, g.st);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.font = font('600', fsL); ctx.fillStyle = rgba('muteHi', 0.95);
    ctx.fillText('진동수', hx, hy + fsL); ctx.fillText('진폭', hx2, hy + fsL);
    ctx.font = font('800', fsV); ctx.fillStyle = HEX.paper;
    var xe = tabText(ctx, f.toFixed(2), hx, hy + fsL + fsV * 1.08);
    ctx.font = font('600', fsV * 0.5); ctx.fillStyle = rgba('muteHi', 1); ctx.fillText(' Hz', xe, hy + fsL + fsV * 1.08);
    ctx.font = font('800', fsV); ctx.fillStyle = rgba(mix('paper', 'clay', res), 1);
    ctx.fillText('×', hx2, hy + fsL + fsV * 1.08);
    tabText(ctx, A.toFixed(1), hx2 + ctx.measureText('×').width + fsV * 0.06, hy + fsL + fsV * 1.08);
    drawString(ctx, g.str, t, An, s, res);
    drawGraph(ctx, g, f, s, res);
    // 손잡이
    var y = g.sl.y, kn = knobXY(g, f);
    ctx.lineCap = 'round'; ctx.lineWidth = s * 0.012;
    ctx.strokeStyle = rgba('paper', 0.13); ctx.beginPath(); ctx.moveTo(g.sl.x0, y); ctx.lineTo(g.sl.x1, y); ctx.stroke();
    ctx.strokeStyle = HEX.clay; ctx.beginPath(); ctx.moveTo(g.sl.x0, y); ctx.lineTo(kn.x, y); ctx.stroke();
    glow(ctx, kn.x, y, s * 0.07, 'clay', 0.25 + res * 0.3);
    circle(ctx, kn.x, y, s * 0.027); ctx.fillStyle = HEX.paper; ctx.fill();
    circle(ctx, kn.x, y, s * 0.01); ctx.fillStyle = HEX.clay; ctx.fill();
  }
  function drawString(ctx, A, t, An, s, res) {
    var cy = A.y + A.h * 0.5, am = A.h * 0.42 * An, k = TAU / (A.w * 0.9), ph = PHI(t);
    ctx.save();
    ctx.setLineDash([s * 0.008, s * 0.012]); ctx.lineWidth = Math.max(0.5, s * 0.002); ctx.strokeStyle = rgba('paper', 0.12);
    ctx.beginPath(); ctx.moveTo(A.x, cy); ctx.lineTo(A.x + A.w, cy); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath();
    for (var i = 0; i <= 64; i++) { var x = A.x + A.w * i / 64; var y = cy + am * Math.sin(k * (x - A.x) - ph); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.lineWidth = s * 0.005; ctx.strokeStyle = rgba(mix('paper', 'clay', res * 0.6), 0.38 + res * 0.25); ctx.stroke();
    for (var j = 0; j < 14; j++) {
      var xx = A.x + A.w * (j + 0.5) / 14, yy = cy + am * Math.sin(k * (xx - A.x) - ph);
      if (res > 0.05) glow(ctx, xx, yy, s * 0.04, j % 2 ? 'tideHi' : 'clay', 0.3 * res);
      circle(ctx, xx, yy, s * 0.011); ctx.fillStyle = j % 2 ? HEX.tideHi : HEX.clay; ctx.fill();
    }
    ctx.restore();
  }
  function drawGraph(ctx, g, f, s, res) {
    var G = g.gr, lw = Math.max(0.6, s * 0.0028);
    ctx.lineWidth = lw; ctx.strokeStyle = rgba('paper', 0.22);
    ctx.beginPath(); ctx.moveTo(G.x, G.y); ctx.lineTo(G.x, G.y + G.h); ctx.lineTo(G.x + G.w, G.y + G.h); ctx.stroke();
    ctx.font = font('600', s * 0.025); ctx.fillStyle = rgba('muteHi', 0.85);
    ctx.textAlign = 'right'; ctx.fillText('진동수', G.x + G.w, G.y + G.h + s * 0.04);
    ctx.textAlign = 'left'; ctx.fillText('진폭', G.x + s * 0.012, G.y + s * 0.02);
    function py(ff) { return G.y + G.h - amp(ff) / AMAX * G.h * 0.9; }
    function px(ff) { return G.x + (ff - FMIN) / (FMAX - FMIN) * G.w; }
    var n = 96, fi;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (var i = 0; i <= n; i++) { fi = FMIN + (FMAX - FMIN) * i / n; if (i) ctx.lineTo(px(fi), py(fi)); else ctx.moveTo(px(fi), py(fi)); }
    ctx.lineWidth = s * 0.004; ctx.strokeStyle = rgba('paper', 0.2); ctx.stroke();
    ctx.beginPath();
    var m = Math.max(1, Math.round(n * (f - FMIN) / (FMAX - FMIN)));
    for (var j = 0; j <= m; j++) { fi = FMIN + (f - FMIN) * j / m; if (j) ctx.lineTo(px(fi), py(fi)); else ctx.moveTo(px(fi), py(fi)); }
    ctx.lineWidth = s * 0.0075; ctx.strokeStyle = HEX.clay; ctx.stroke();
    var mx = px(f), my = py(f);
    ctx.setLineDash([s * 0.008, s * 0.01]); ctx.lineWidth = lw; ctx.strokeStyle = rgba('paper', 0.28);
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx, G.y + G.h); ctx.moveTo(mx, my); ctx.lineTo(G.x, my); ctx.stroke(); ctx.setLineDash([]);
    glow(ctx, mx, my, s * (0.06 + res * 0.07), 'clay', 0.25 + res * 0.45);
    circle(ctx, mx, my, s * 0.026); ctx.lineWidth = s * 0.004; ctx.strokeStyle = rgba('clay', 0.55); ctx.stroke();
    circle(ctx, mx, my, s * 0.014); ctx.fillStyle = HEX.clay; ctx.fill();
  }

  /* ── 장면 그리기 ── */
  function drawBackdrop(ctx, t, L) {
    var W = L.W, H = L.H, S = L.S, big = Math.max(W, H);
    var cx = t < T.f1 ? W / 2 : t < T.end ? S.x + S.w / 2 : W / 2;
    var cy = t < T.f1 ? L.open.lineY : t < T.end ? S.y + S.h / 2 : (L.fin ? L.fin.nc.y : H / 2);
    var mixP = t < T.f1 ? seg(t, 3.4, 3.75) : t < T.end ? 0 : 0;
    if (t >= T.f1 - 0.35 && t < T.f1) { cx = lerp(W / 2, S.x + S.w / 2, E.ioC(mixP)); cy = lerp(L.open.lineY, S.y + S.h / 2, E.ioC(mixP)); }
    if (t >= T.end && t < T.end + 0.8 && L.fin) { var q = E.ioC(seg(t, T.end, T.end + 0.8)); cx = lerp(S.x + S.w / 2, W / 2, q); cy = lerp(S.y + S.h / 2, L.fin.nc.y, q); }
    var a = 0.05 + 0.11 * Math.exp(-Math.pow((t - 3.3) / 0.35, 2)) + (t > T.f1 ? 0.02 : 0) + (t > T.end ? 0.04 * seg(t, T.end + 0.4, T.end + 1.2) : 0);
    glow(ctx, cx, cy, big * 0.62, 'clay', a);
    glow(ctx, W * 0.08, H * 0.98, big * 0.6, 'tide', 0.12 + 0.08 * Math.exp(-Math.pow((t - 3.3) / 0.4, 2)));
    glow(ctx, W * 0.96, H * 0.04, big * 0.4, 'tide', 0.05);
  }

  function drawOpen(ctx, t, L) {
    var O = L.open, W = L.W, u = L.u, r0 = Math.max(2.6, u * 0.42), k = O.k;
    var K = L.f1.K, lineA = 1, dotsA = 1 - seg(t, 3.42, 3.6);
    var cs = 1 + 0.03 * E.ioC(seg(t, 0, 3.2)) * (1 - E.ioC(seg(t, 3.3, 3.62))) + 0.03 * Math.exp(-Math.pow((t - 3.3) / 0.1, 2));
    ctx.save();
    ctx.translate(W / 2, O.lineY); ctx.scale(cs, cs); ctx.translate(-W / 2, -O.lineY);
    var A = lineAmp(t, O);

    // 아주 큰 글자가 뒤로 지나간다
    var ra = seg(t, 2.55, 2.85) * (1 - seg(t, 3.4, 3.7));
    if (ra > 0) {
      var rfs = L.land ? L.C.h * 0.44 : W * 0.34;
      ctx.font = font('900', rfs); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      ctx.lineWidth = Math.max(1, u * 0.12); ctx.strokeStyle = rgba('paper', 0.13 * ra);
      ctx.strokeText('RESONANCE', W * 0.12 - (t - 2.55) * W * 0.62, O.lineY + rfs * 0.36);
    }
    // 처음 울림: 가운데 점과 퍼지는 고리
    if (t < 1.4) {
      var pop = E.outBack(seg(t, 0.04, 0.34)) * (1 - E.inQ(seg(t, 0.8, 1.15)));
      glow(ctx, O.cx, O.cy, r0 * 9 * pop, 'clay', 0.35 * pop);
      circle(ctx, O.cx, O.cy, r0 * 1.7 * pop); ctx.fillStyle = HEX.clay; ctx.fill();
      for (var ri = 0; ri < 2; ri++) {
        var rp = seg(t, 0.18 + ri * 0.12, 1.25 + ri * 0.12);
        if (rp > 0 && rp < 1) {
          circle(ctx, O.cx, O.cy, O.Rmax * E.outQ(rp));
          ctx.lineWidth = Math.max(1, u * (0.22 - ri * 0.1)); ctx.strokeStyle = rgba(ri ? 'tideHi' : 'clay', 0.55 * Math.pow(1 - rp, 1.4)); ctx.stroke();
        }
      }
    }
    // 하나로 맞춰진 뒤의 큰 파동(리본)
    var waveA = E.outC(seg(t, 2.62, 3.0));
    var x0 = -W * 0.02, x1 = W * 1.02, ly = O.lineY, lw = Math.max(1.5, u * 0.2);
    var col = seg(t, 3.46, 3.75), ce = E.ioQuart(col);
    if (ce > 0) { x0 = lerp(x0, K.x, ce); x1 = lerp(x1, K.x + K.w, ce); ly = lerp(O.lineY, K.y + K.h / 2, ce); lw = lerp(lw, 2, ce); }
    if (waveA > 0) {
      var ribbon = seg(t, 2.86, 3.12) * (1 - seg(t, 3.34, 3.56));
      var gr = ctx.createLinearGradient(0, 0, W, 0);
      gr.addColorStop(0, HEX.tideHi); gr.addColorStop(0.5, HEX.clay); gr.addColorStop(1, HEX.tideHi);
      if (ribbon > 0) {
        ctx.globalCompositeOperation = 'lighter';
        for (var j = 1; j <= 9; j++) {
          ctx.beginPath();
          for (var i = 0; i <= 140; i++) {
            var x = lerp(x0, x1, i / 140), y = ly + A * (1 - j * 0.06) * Math.sin(k * x - OM * t - j * 0.2);
            if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
          }
          ctx.globalAlpha = ribbon * 0.55 * (1 - j / 10); ctx.lineWidth = Math.max(1, u * 0.14); ctx.strokeStyle = gr; ctx.stroke();
        }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
      ctx.beginPath();
      for (var i2 = 0; i2 <= 160; i2++) {
        var xx = lerp(x0, x1, i2 / 160), yy = ly + A * Math.sin(k * xx - OM * t);
        if (i2) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy);
      }
      ctx.lineWidth = lw; ctx.lineCap = 'round';
      ctx.strokeStyle = ce > 0 ? rgba(mix('clay', 'paper', ce), waveA) : gr;
      ctx.globalAlpha = lineA * waveA; ctx.stroke(); ctx.globalAlpha = 1;
    }
    // 학생 점: 저마다 흔들리다(꼬리) 줄을 지어 하나의 파동에 올라탄다
    if (dotsA > 0) {
      var swell = seg(t, 2.95, 3.25) * (1 - seg(t, 3.3, 3.5));
      O.dots.forEach(function (d) {
        var ap = seg(t, d.ta, d.ta + 0.32); if (ap <= 0) return;
        var sc = E.outBack(ap);
        var ms = 2.18 + d.rank * 0.2, m = E.ioQuint(seg(t, ms, ms + 0.62));
        var th = thetaOf(d, t, k);
        var amC = lerp(d.a, A, m);
        var X = lerp(d.x, d.lx, m), Y = lerp(d.y, O.lineY, m) + amC * Math.sin(th);
        var trailA = E.outC(seg(t, d.ta, d.ta + 0.6)) * Math.pow(1 - m, 2);
        if (trailA > 0.01) {
          var TW = 0.9, NS = 22, len = d.tl * trailA;
          var g2 = ctx.createLinearGradient(X - len, 0, X, 0);
          g2.addColorStop(0, rgba(d.col, 0)); g2.addColorStop(1, rgba(d.col, 0.75 * trailA));
          ctx.beginPath();
          for (var s = 0; s <= NS; s++) {
            var tau = (s / NS) * TW, tx = X - (s / NS) * len, ty = Y - amC * Math.sin(th) + amC * Math.sin(thetaOf(d, t - tau, k));
            if (s) ctx.lineTo(tx, ty); else ctx.moveTo(tx, ty);
          }
          ctx.lineWidth = Math.max(1, r0 * 0.5); ctx.lineCap = 'round'; ctx.strokeStyle = g2; ctx.stroke();
        }
        var rr0 = r0 * sc * (1 - E.inQ(seg(t, 3.42, 3.6)));
        glow(ctx, X, Y, rr0 * (3.2 + swell * 3), d.col, 0.22 + swell * 0.25);
        circle(ctx, X, Y, rr0); ctx.fillStyle = HEX[d.col]; ctx.fill();
      });
      // 진동수 읽은 값(맞춰지면 모두 같은 값이 된다)
      var s2 = E.ioC(seg(t, SY0, SY1));
      ctx.font = font('600', Math.max(11, u * 0.95), MONO); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      O.labels.forEach(function (idx) {
        var d = O.dots[idx]; if (!d) return;
        var la = seg(t, d.ta + 0.12, d.ta + 0.4) * (1 - seg(t, 2.45, 2.75));
        if (la <= 0) return;
        ctx.fillStyle = rgba(mix('muteHi', 'tideHi', s2), 0.9 * la);
        ctx.fillText(lerp(d.f, 1, s2).toFixed(1) + ' Hz', d.x + r0 * 2.2, d.y - d.a - r0 * 1.2);
      });
    }
    // 공명 순간의 충격파
    var sp = seg(t, 3.28, 3.95);
    if (sp > 0 && sp < 1) {
      var cxS = W / 2;
      circle(ctx, cxS, O.lineY, Math.hypot(W, L.H) * 0.62 * E.outC(sp));
      ctx.lineWidth = Math.max(1, u * 0.7 * (1 - sp)); ctx.strokeStyle = rgba('paper', 0.4 * (1 - sp)); ctx.stroke();
      glow(ctx, cxS, O.lineY, Math.max(W, L.H) * 0.5, 'clay', 0.16 * (1 - sp));
    }
    ctx.restore();
  }

  function drawF1(ctx, t, L) {
    var u = t - T.f1, G = L.f1, K = G.K;
    var zp = E.ioQuart(seg(u, 1.5, 1.875));
    ctx.save();
    zoomTo(ctx, G.pr1, L.S, zp);
    var op = E.outExpo(seg(u, 0, 0.34)), hh = Math.max(2, K.h * op), top = K.y + (K.h - hh) / 2;
    var pc = E.ioC(seg(u, 0.4, 0.58)), lc = E.ioC(seg(u, 1.0, 1.2));
    var wipe = E.ioQuart(seg(u, 0.36, 0.6)), zf = 1 - E.outC(seg(u, 1.5, 1.66));
    var rad = K.h * 0.035;
    glow(ctx, K.x + K.w / 2, K.y + K.h / 2, K.w * 0.7, lc > 0 ? 'tide' : 'clay', 0.08 * op * zf);
    ctx.save(); ctx.globalAlpha = zf;
    rr(ctx, K.x, top, K.w, hh, Math.min(rad, hh / 2));
    ctx.fillStyle = HEX.white; if (wipe < 1) ctx.fill();
    if (lc > 0) { ctx.lineWidth = Math.max(1, K.h * 0.004); ctx.strokeStyle = rgba('tideHi', 0.6 * E.outC(seg(u, 1.15, 1.4))); ctx.stroke(); }
    ctx.restore();
    ctx.save(); rr(ctx, K.x, top, K.w, hh, Math.min(rad, hh / 2)); ctx.clip();
    var pptA = 1 - seg(u, 0.58, 0.62);
    if (pptA > 0) {
      ctx.fillStyle = rgba('clay', pptA); ctx.fillRect(K.x + K.w * 0.055, K.y + K.h * 0.13, K.w * 0.008, K.h * 0.085);
      [0.34, 0.47, 0.6].forEach(function (y) { circle(ctx, K.x + K.w * 0.092, K.y + K.h * (y + 0.021), K.h * 0.012); ctx.fillStyle = rgba('ppt', 0.4 * pptA); ctx.fill(); });
      ctx.font = font('600', K.h * 0.032); ctx.fillStyle = rgba('ppt', 0.35 * pptA); ctx.textAlign = 'right'; ctx.fillText('1', K.x + K.w * 0.95, K.y + K.h * 0.93); ctx.textAlign = 'left';
    }
    // PPT를 코드로 바꾸는 쓸기: 왼쪽부터 어두운 편집기가 덮고, 앞머리에 주황 선
    if (wipe > 0) {
      var wx = K.x + K.w * wipe;
      ctx.fillStyle = rgba(mix('char2', 'lesson', lc), zf); ctx.fillRect(K.x, top, wx - K.x + 1, hh);
      if (wipe < 1) {
        var wg = ctx.createLinearGradient(wx - K.w * 0.12, 0, wx, 0);
        wg.addColorStop(0, rgba('clay', 0)); wg.addColorStop(1, rgba('clay', 0.35));
        ctx.fillStyle = wg; ctx.fillRect(wx - K.w * 0.12, top, K.w * 0.12, hh);
        ctx.fillStyle = HEX.clay; ctx.fillRect(wx - 1.5, top, 3, hh);
      }
    }
    var codeA = pc * (1 - lc);
    if (codeA > 0) {
      ctx.font = font('500', G.fs * 0.82, MONO); ctx.fillStyle = rgba('muteHi', 0.38 * codeA); ctx.textAlign = 'right';
      for (var li = 0; li < CODE.length; li++) ctx.fillText(String(li + 1), K.x + K.w * 0.055, K.y + K.h * (0.17 + li * 0.098));
      ctx.textAlign = 'left';
      for (var wd = 0; wd < 3; wd++) { circle(ctx, K.x + K.w * (0.03 + wd * 0.024), K.y + K.h * 0.06, K.h * 0.011); ctx.fillStyle = rgba('paper', 0.18 * codeA); ctx.fill(); }
    }
    drawTokens(ctx, G, u);
    var IM = rel(K, { x: 0.6, y: 0.3, w: 0.32, h: 0.44 }), ia = 1 - seg(u, 0.42, 0.52);
    if (ia > 0) {
      ctx.save(); ctx.globalAlpha = ia;
      ctx.beginPath(); ctx.rect(K.x + K.w * wipe, K.y, K.w, K.h); ctx.clip();
      ctx.fillStyle = 'rgba(160,152,138,1)';
      ctx.beginPath(); ctx.moveTo(IM.x + IM.w * 0.1, IM.y + IM.h * 0.85); ctx.lineTo(IM.x + IM.w * 0.42, IM.y + IM.h * 0.4); ctx.lineTo(IM.x + IM.w * 0.62, IM.y + IM.h * 0.66); ctx.lineTo(IM.x + IM.w * 0.74, IM.y + IM.h * 0.52); ctx.lineTo(IM.x + IM.w * 0.92, IM.y + IM.h * 0.85); ctx.closePath(); ctx.fill();
      circle(ctx, IM.x + IM.w * 0.74, IM.y + IM.h * 0.25, IM.h * 0.09); ctx.fillStyle = HEX.clay; ctx.fill();
      ctx.restore();
    }
    // 코드가 써지는 커서
    if (codeA > 0.5 && u < 1.0) {
      var cl = Math.min(CODE.length - 1, Math.floor(seg(u, 0.5, 0.95) * CODE.length));
      var last = G.toks.filter(function (tk) { return tk.line === cl; }).pop();
      if (last && Math.floor(u / 0.09) % 2 === 0) { ctx.fillStyle = HEX.clay; ctx.fillRect(K.x + (last.C.x + last.C.w) * K.w + G.fs * 0.15, last.base - G.fs * 0.85, G.fs * 0.5, G.fs * 1.05); }
    }
    var la = E.outC(seg(u, 1.06, 1.28));
    if (la > 0) drawLesson(ctx, G, t, u, la, zf);
    if (u > 1.16 && zf > 0) { ctx.save(); ctx.globalAlpha = zf; drawEditBar(ctx, G, u); ctx.restore(); }
    ctx.restore();
    drawFileTab(ctx, G, u, op * (1 - seg(u, 1.1, 1.3)));
    ctx.restore();
  }
  function mvRect(a, b, pPos, pSize) {
    var w = lerp(a.w, b.w, pSize), h = lerp(a.h, b.h, pSize);
    var cx = lerp(a.x + a.w / 2, b.x + b.w / 2, pPos), cy = lerp(a.y + a.h / 2, b.y + b.h / 2, pPos);
    return { x: cx - w / 2, y: cy - h / 2, w: w, h: h };
  }
  function tokState(tk, u) {
    var q = seg(u, 0.42 + tk.line * 0.03, 0.42 + tk.line * 0.03 + 0.34);
    var v = seg(u, 0.96 + tk.lo * 0.005, 0.96 + tk.lo * 0.005 + 0.26);
    var pc = E.ioC(q), lc = E.ioC(v);
    var r = mvRect(tk.P, tk.C, pc, E.outC(Math.min(1, q * 1.6)));
    return { r: mvRect(r, tk.L, lc, E.outC(Math.min(1, v * 1.4))), pc: pc, lc: lc };
  }
  function drawTokens(ctx, G, u) {
    var K = G.K, fade = 1 - E.inQ(seg(u, 1.12, 1.3));
    if (fade <= 0) return;
    ctx.font = font('600', G.fs, MONO); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    G.toks.forEach(function (tk) {
      var A = tokState(tk, u), B = tokState(tk, u - 0.035), r = rel(K, A.r), rb = rel(K, B.r);
      var ta = E.smooth(A.pc) * (1 - E.smooth(Math.min(1, A.lc * 4)));
      var col = mix(mix(tk.pcol, tk.ccol, A.pc), 'paper', A.lc);
      var ba = lerp(lerp(tk.pa, 0.7, A.pc), 0.2, A.lc) * (1 - ta) * fade;
      var dx = r.x - rb.x, dy = r.y - rb.y;
      if (dx * dx + dy * dy > 9) {
        ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1, Math.min(r.h, K.h * 0.05) * 0.55);
        ctx.strokeStyle = rgba(col, 0.13 * fade);
        ctx.beginPath(); ctx.moveTo(rb.x + rb.w / 2, rb.y + rb.h / 2); ctx.lineTo(r.x + r.w / 2, r.y + r.h / 2); ctx.stroke();
      }
      if (ba > 0.01) { rr(ctx, r.x, r.y, r.w, r.h, Math.min(r.h * 0.32, K.h * 0.012)); ctx.fillStyle = rgba(col, ba); ctx.fill(); }
      if (ta > 0.01) { ctx.fillStyle = rgba(tk.ccol, ta * fade); ctx.fillText(tk.text, r.x, r.y + G.fs * 0.8); }
    });
  }
  function typed(u) { return u >= 1.47 ? ' 찾기' : u >= 1.4 ? ' 찾' : ''; }
  function drawLesson(ctx, G, t, u, la, zf) {
    var K = G.K;
    ctx.save(); ctx.globalAlpha = la * zf;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = font('800', G.tFs); ctx.fillStyle = HEX.paper;
    var title = '공명 진동수' + typed(u);
    ctx.fillText(title, G.colX, G.tY);
    var tw = ctx.measureText(title).width;
    ctx.font = font('500', G.iFs); ctx.fillStyle = HEX.muteHi;
    ctx.fillText('진동수를 바꿔 보세요', G.colX, G.iY);
    for (var i = 0; i < 4; i++) { circle(ctx, G.colX + G.dotR + i * G.dotR * 3.2, G.dotsY, G.dotR); ctx.fillStyle = i ? rgba('paper', 0.22) : HEX.clay; ctx.fill(); }
    ctx.globalAlpha = la; drawPanel(ctx, G.pr1, t, F0); ctx.globalAlpha = la * zf;
    if (u >= 1.34) {
      var ea = E.outC(seg(u, 1.34, 1.42));
      ctx.setLineDash([K.h * 0.012, K.h * 0.009]); ctx.lineWidth = Math.max(1, K.h * 0.004); ctx.strokeStyle = rgba('tideHi', ea);
      rr(ctx, G.colX - K.h * 0.02, G.tY - G.tFs * 0.95, tw + K.h * 0.04 + G.tFs * 0.1, G.tFs * 1.22, K.h * 0.012); ctx.stroke(); ctx.setLineDash([]);
      var typing = u >= 1.38 && u < 1.52;
      if (typing || Math.floor((u - 1.34) / 0.12) % 2 === 0) { ctx.fillStyle = HEX.clay; ctx.fillRect(G.colX + tw + G.tFs * 0.06, G.tY - G.tFs * 0.82, Math.max(1.5, G.tFs * 0.07), G.tFs * 0.95); }
    }
    ctx.restore();
  }
  function drawEditBar(ctx, G, u) {
    var tb = G.tb, a = E.outC(seg(u, 1.16, 1.3)), y = tb.y - (1 - a) * tb.h * 0.6;
    ctx.save(); ctx.globalAlpha *= a;
    rr(ctx, tb.x, y, tb.w, tb.h, tb.h / 2); ctx.fillStyle = rgba('char', 0.92); ctx.fill();
    ctx.lineWidth = Math.max(1, tb.h * 0.03); ctx.strokeStyle = rgba('paper', 0.16); ctx.stroke();
    var on = u >= 1.33, pad = tb.h * 0.1;
    if (on) { rr(ctx, tb.x + pad, y + pad, tb.eW - pad, tb.h - pad * 2, (tb.h - pad * 2) / 2); ctx.fillStyle = HEX.clay; ctx.fill(); }
    icon(ctx, 'pen', tb.x + tb.h * 0.5, y + tb.h / 2, tb.h * 0.42, on ? HEX.white : HEX.paper);
    ctx.font = font('700', tb.fs); ctx.textBaseline = 'middle'; ctx.fillStyle = on ? HEX.white : HEX.paper;
    ctx.fillText('편집', tb.x + tb.h * 0.82, y + tb.h / 2 + tb.fs * 0.04);
    var saved = seg(u, 1.56, 1.66), cxk = tb.x + tb.eW + tb.h * 0.55;
    if (saved > 0) { circle(ctx, cxk, y + tb.h / 2, tb.h * 0.36 * E.outBack(saved)); ctx.fillStyle = HEX.tide; ctx.fill(); }
    icon(ctx, 'check', cxk, y + tb.h / 2, tb.h * 0.42, saved > 0 ? HEX.white : rgba('paper', 0.55));
    ctx.textBaseline = 'alphabetic'; ctx.restore();
  }
  function drawFileTab(ctx, G, u, a) {
    if (a <= 0) return;
    var tb = G.tab, K = G.K;
    ctx.save(); ctx.globalAlpha = a * E.outC(seg(u, 0.12, 0.3));
    rr(ctx, tb.x, tb.y, tb.w, tb.h, tb.h * 0.3); ctx.fillStyle = rgba('paper', 0.08); ctx.fill();
    var html = E.ioC(seg(u, 0.5, 0.62));
    icon(ctx, 'file', tb.x + tb.h * 0.55, tb.y + tb.h / 2, tb.h * 0.55, rgba(mix('muteHi', 'clay', html), 1));
    ctx.font = font('600', tb.h * 0.48, MONO); ctx.textBaseline = 'middle';
    ctx.beginPath(); ctx.rect(tb.x, tb.y, tb.w, tb.h); ctx.clip();
    var tx = tb.x + tb.h * 1.05, ty = tb.y + tb.h / 2;
    ctx.fillStyle = rgba('paper', 0.85 * (1 - html)); ctx.fillText('수업.pptx', tx, ty - html * tb.h);
    ctx.fillStyle = rgba('paper', 0.9 * html); ctx.fillText('수업.html', tx, ty + (1 - html) * tb.h);
    ctx.restore();
    void K;
  }

  function drawBezel(ctx, P, bzr, a) {
    if (a <= 0) return;
    var b = P.w * bzr, R = grow(P, b);
    ctx.save(); ctx.globalAlpha = a;
    rr(ctx, R.x, R.y, R.w, R.h, R.w * 0.03); ctx.fillStyle = HEX.board; ctx.fill();
    ctx.lineWidth = Math.max(1, R.w * 0.003); ctx.strokeStyle = rgba('paper', 0.14); ctx.stroke();
    circle(ctx, R.x + R.w / 2, R.y + b * 0.5, Math.max(1, b * 0.16)); ctx.fillStyle = rgba('paper', 0.25); ctx.fill();
    ctx.restore();
  }
  function drawF2(ctx, t, L) {
    var u = t - T.f2, sp = E.ioQuart(seg(u, 1.5, 1.875));
    var R = lerpRect(L.S, L.f3.tsPanel, sp);
    glow(ctx, R.x + R.w / 2, R.y + R.h / 2, R.w * 0.7, 'clay', 0.06 + 0.08 * Math.exp(-Math.pow((fAt(t) - 1) / 0.08, 2)));
    drawBezel(ctx, R, L.f3.bzr, sp);
    drawPanel(ctx, R, t, fAt(t));
  }

  function drawPhone(ctx, P, t, lit, a) {
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a;
    var r = P.w * 0.18;
    rr(ctx, P.x, P.y, P.w, P.h, r); ctx.fillStyle = '#0B0B0A'; ctx.fill();
    ctx.lineWidth = Math.max(1, P.w * 0.025); ctx.strokeStyle = rgba('paper', 0.2); ctx.stroke();
    var b = P.w * 0.07, S = { x: P.x + b, y: P.y + b, w: P.w - 2 * b, h: P.h - 2 * b };
    rr(ctx, S.x, S.y, S.w, S.h, r * 0.7);
    ctx.fillStyle = lit > 0 ? rgba(mix([10, 10, 9], 'char2', lit), 1) : '#0A0A09'; ctx.fill();
    if (lit > 0) {
      ctx.save(); rr(ctx, S.x, S.y, S.w, S.h, r * 0.7); ctx.clip(); ctx.globalAlpha = a * lit;
      ctx.fillStyle = rgba('paper', 0.18); rr(ctx, S.x + S.w * 0.12, S.y + S.h * 0.08, S.w * 0.5, S.h * 0.035, S.h * 0.02); ctx.fill();
      ctx.font = font('800', S.w * 0.15); ctx.fillStyle = HEX.paper; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      tabText(ctx, fAt(t).toFixed(2), S.x + S.w * 0.12, S.y + S.h * 0.22);
      var cy = S.y + S.h * 0.5, am = S.h * 0.14 * (amp(fAt(t)) / AMAX), k = TAU / (S.w * 0.9), ph = PHI(t);
      ctx.beginPath();
      for (var i = 0; i <= 24; i++) { var x = S.x + S.w * i / 24, y = cy + am * Math.sin(k * (x - S.x) - ph); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.lineWidth = Math.max(1, S.w * 0.025); ctx.strokeStyle = rgba('paper', 0.4); ctx.stroke();
      for (var j = 0; j < 6; j++) { var xx = S.x + S.w * (j + 0.5) / 6, yy = cy + am * Math.sin(k * (xx - S.x) - ph); circle(ctx, xx, yy, Math.max(1, S.w * 0.05)); ctx.fillStyle = j % 2 ? HEX.tideHi : HEX.clay; ctx.fill(); }
      ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1, S.w * 0.04); ctx.strokeStyle = rgba('paper', 0.14);
      ctx.beginPath(); ctx.moveTo(S.x + S.w * 0.14, S.y + S.h * 0.84); ctx.lineTo(S.x + S.w * 0.86, S.y + S.h * 0.84); ctx.stroke();
      ctx.strokeStyle = HEX.clay; ctx.beginPath(); ctx.moveTo(S.x + S.w * 0.14, S.y + S.h * 0.84); ctx.lineTo(S.x + S.w * 0.5, S.y + S.h * 0.84); ctx.stroke();
      if (lit < 1) { ctx.fillStyle = rgba('white', 0.55 * (1 - lit)); ctx.fillRect(S.x, S.y, S.w, S.h); }
      ctx.restore();
    } else {
      var g = ctx.createLinearGradient(S.x, S.y, S.x + S.w, S.y + S.h);
      g.addColorStop(0, 'rgba(255,255,255,0.06)'); g.addColorStop(0.5, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; rr(ctx, S.x, S.y, S.w, S.h, r * 0.7); ctx.fill();
    }
    rr(ctx, P.x + P.w * 0.36, P.y + b * 0.35, P.w * 0.28, b * 0.32, b * 0.16); ctx.fillStyle = '#000'; ctx.fill();
    ctx.restore();
  }
  function phoneTimes(p) { var tl = 0.5 + p.k * 0.05; return { rise: 0.38 + p.k * 0.045, line: tl, arrive: tl + 0.34 }; }
  function drawF3(ctx, t, L) {
    var u = t - T.f3, G = L.f3, P = G.tsPanel, S = L.S;
    var zp = E.ioQuart(seg(u, 1.45, 1.875)), phA = 1 - E.inQ(seg(u, 1.45, 1.62));
    ctx.save();
    zoomTo(ctx, G.ts, L.f4.B, zp);
    var qa = E.outBack(seg(u, 0.26, 0.46)), qx = E.inC(seg(u, 0.98, 1.16));
    var qc = { x: G.qr.x + G.qr.w / 2, y: G.qr.y + G.qr.h * 0.42 };
    var count = 0;
    // 연결선 + 기기
    G.phones.forEach(function (p) {
      var tm = phoneTimes(p), top = { x: p.x + p.w / 2, y: p.y };
      var lp = seg(u, tm.line, tm.line + 0.2), la = (1 - seg(u, 1.0, 1.2)) * phA;
      if (lp > 0 && la > 0) {
        var c1 = { x: lerp(qc.x, top.x, 0.5), y: lerp(qc.y, top.y, 0.15) + (top.y - qc.y) * 0.5 };
        ctx.beginPath();
        for (var i = 0; i <= 30; i++) { var b = bez(qc, c1, top, (i / 30) * lp); if (i) ctx.lineTo(b.x, b.y); else ctx.moveTo(b.x, b.y); }
        ctx.lineWidth = Math.max(1, L.u * 0.16); ctx.strokeStyle = rgba('tideHi', 0.55 * la); ctx.stroke();
        var pu = seg(u, tm.line + 0.14, tm.arrive);
        if (pu > 0 && pu < 1) { var pp = bez(qc, c1, top, pu); glow(ctx, pp.x, pp.y, L.u * 1.6, 'tideHi', 0.8 * la); circle(ctx, pp.x, pp.y, L.u * 0.32); ctx.fillStyle = HEX.paper; ctx.fill(); }
      }
      var ra = E.outBack(seg(u, tm.rise, tm.rise + 0.3)), lit = seg(u, tm.arrive, tm.arrive + 0.12);
      if (lit > 0.5) count++;
      if (ra > 0) {
        var off = (1 - ra) * S.h * 0.25;
        drawPhone(ctx, { x: p.x, y: p.y + off, w: p.w, h: p.h }, t, lit, clamp(ra, 0, 1) * phA);
        if (lit > 0 && lit < 1) glow(ctx, p.x + p.w / 2, p.y + p.h / 2, p.h * 0.8, 'tideHi', 0.3 * (1 - lit) * phA);
      }
    });
    // 교사 화면
    drawBezel(ctx, P, G.bzr, 1);
    drawPanel(ctx, P, t, fAt(t));
    // QR
    if (qa > 0 && qx < 1) {
      ctx.save();
      rr(ctx, P.x, P.y, P.w, P.h, P.w * 0.03); ctx.fillStyle = rgba('char', 0.62 * clamp(qa, 0, 1) * (1 - qx)); ctx.fill();
      var sc = clamp(qa, 0, 1.2) * (1 - qx), pc2 = { x: G.pill.x + G.pill.w / 2, y: G.pill.y + G.pill.h / 2 };
      var mx = lerp(qc.x, pc2.x, qx), my = lerp(G.qr.y + G.qr.h / 2, pc2.y, qx);
      ctx.translate(mx, my); ctx.scale(sc, sc); ctx.translate(-(G.qr.x + G.qr.w / 2), -(G.qr.y + G.qr.h / 2));
      var Q = G.qr;
      rr(ctx, Q.x, Q.y, Q.w, Q.h, Q.w * 0.07); ctx.fillStyle = HEX.white; ctx.fill();
      var side = Q.w * 0.78, ox = Q.x + (Q.w - side) / 2, oy = Q.y + (Q.w - side) / 2, m = side / 21;
      ctx.fillStyle = HEX.char;
      [[0, 0], [0, 14], [14, 0]].forEach(function (f) {
        var fp = E.outBack(seg(u, 0.3, 0.42));
        var fx = ox + f[1] * m, fy = oy + f[0] * m;
        ctx.save(); ctx.translate(fx + 3.5 * m, fy + 3.5 * m); ctx.scale(fp, fp); ctx.translate(-(fx + 3.5 * m), -(fy + 3.5 * m));
        rr(ctx, fx, fy, 7 * m, 7 * m, m * 1.4); ctx.fill();
        rr(ctx, fx + m, fy + m, 5 * m, 5 * m, m); ctx.fillStyle = HEX.white; ctx.fill();
        rr(ctx, fx + 2 * m, fy + 2 * m, 3 * m, 3 * m, m * 0.7); ctx.fillStyle = HEX.char; ctx.fill();
        ctx.restore();
      });
      G.mods.forEach(function (md) {
        var mp = seg(u, 0.32 + md.t * 0.2, 0.32 + md.t * 0.2 + 0.08);
        if (mp <= 0) return;
        var ss = m * 0.86 * E.outBack(mp);
        ctx.fillStyle = (md.r + md.c) % 7 === 0 ? HEX.tide : HEX.char;
        ctx.fillRect(ox + md.c * m + (m - ss) / 2, oy + md.r * m + (m - ss) / 2, ss, ss);
      });
      ctx.font = font('700', Q.w * 0.085); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = HEX.char;
      ctx.fillText('코드 4827', Q.x + Q.w / 2, Q.y + Q.h - Q.w * 0.07);
      ctx.restore();
    }
    // 「실시간」 단추
    var pa = E.outBack(seg(u, 0.04, 0.2));
    if (pa > 0) {
      var pl = G.pill, on = u >= 0.24;
      ctx.save();
      ctx.translate(pl.x + pl.w / 2, pl.y + pl.h / 2); ctx.scale(pa, pa); ctx.translate(-(pl.x + pl.w / 2), -(pl.y + pl.h / 2));
      rr(ctx, pl.x, pl.y, pl.w, pl.h, pl.h / 2); ctx.fillStyle = on ? HEX.tide : rgba('paper', 0.14); ctx.fill();
      ctx.lineWidth = Math.max(1, pl.h * 0.04); ctx.strokeStyle = on ? rgba('tideHi', 0.9) : rgba('paper', 0.3); ctx.stroke();
      var dx = pl.x + pl.h * 0.42, dy = pl.y + pl.h / 2, pulse = on ? (u * 2.2) % 1 : 0;
      if (on) { circle(ctx, dx, dy, pl.h * (0.12 + pulse * 0.25)); ctx.fillStyle = rgba('white', 0.5 * (1 - pulse)); ctx.fill(); }
      circle(ctx, dx, dy, pl.h * 0.12); ctx.fillStyle = on ? HEX.white : HEX.clay; ctx.fill();
      ctx.font = font('700', pl.fs); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = HEX.white;
      ctx.fillText('실시간', pl.x + pl.h * 0.68, dy + pl.fs * 0.04);
      if (count > 0) {
        var bx = pl.x + pl.w - pl.h * 0.52;
        circle(ctx, bx, dy, pl.h * 0.36); ctx.fillStyle = HEX.white; ctx.fill();
        ctx.font = font('800', pl.fs * 0.92); ctx.textAlign = 'center'; ctx.fillStyle = HEX.tide;
        ctx.fillText(String(count), bx, dy + pl.fs * 0.05);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawF4(ctx, t, L) {
    var u = t - T.f4, G = L.f4, B = G.B, s = t - T.end;
    var fo = s > 0 ? seg(s, 0.05, 0.6) : 0, alpha = 1 - E.inQ(fo);
    if (alpha <= 0) return;
    var sc = s > 0 ? lerp(1, 0.92, E.outC(seg(s, 0, 0.7))) : 1;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.translate(B.x + B.w / 2, B.y + B.h / 2); ctx.scale(sc, sc); ctx.translate(-(B.x + B.w / 2), -(B.y + B.h / 2));
    rr(ctx, B.x, B.y, B.w, B.h, B.w * 0.03); ctx.fillStyle = HEX.board; ctx.fill();
    ctx.lineWidth = Math.max(1, B.w * 0.003); ctx.strokeStyle = rgba('paper', 0.14); ctx.stroke();
    var ga = E.outC(seg(u, 0.05, 0.4));
    if (ga > 0) {
      ctx.save(); rr(ctx, B.x, B.y, B.w, B.h, B.w * 0.03); ctx.clip();
      var gs = B.w / 30; ctx.beginPath();
      for (var x = B.x + gs; x < B.x + B.w; x += gs) { ctx.moveTo(x, B.y); ctx.lineTo(x, B.y + B.h); }
      for (var y = B.y + gs; y < B.y + B.h; y += gs) { ctx.moveTo(B.x, y); ctx.lineTo(B.x + B.w, y); }
      ctx.lineWidth = 1; ctx.strokeStyle = rgba('paper', 0.05 * ga); ctx.stroke(); ctx.restore();
    }
    var pr = lerpRect(G.bez, G.inner, E.ioQuart(seg(u, 0.0, 0.38)));
    drawPanel(ctx, pr, t, 1.0);
    rr(ctx, pr.x, pr.y, pr.w, pr.h, panelGeom(pr).s * 0.03); ctx.fillStyle = rgba('board', 0.3 * seg(u, 0.15, 0.45)); ctx.fill();
    // 도구 막대
    var tb = G.tb, ta = E.outC(seg(u, 0.08, 0.32));
    if (ta > 0) {
      var oy = (1 - ta) * tb.h * 0.8;
      ctx.save(); ctx.globalAlpha = alpha * ta;
      rr(ctx, tb.x, tb.y + oy, tb.w, tb.h, tb.h / 2); ctx.fillStyle = rgba('char2', 0.96); ctx.fill();
      ctx.lineWidth = Math.max(1, tb.h * 0.03); ctx.strokeStyle = rgba('paper', 0.16); ctx.stroke();
      var act = u >= 0.5 ? 'pen' : u >= 0.12 ? 'laser' : '';
      tb.icons.forEach(function (ic) {
        var on = ic.name === act;
        if (on) { circle(ctx, ic.x, ic.y + oy, tb.h * 0.36); ctx.fillStyle = HEX.clay; ctx.fill(); }
        icon(ctx, ic.name, ic.x, ic.y + oy, tb.h * 0.42, on ? HEX.white : rgba('paper', 0.8));
      });
      ctx.restore();
    }
    // 레이저
    var lp = seg(u, 0.12, 0.56);
    if (lp > 0 && lp < 1) {
      var m = markerXY(panelGeom(pr), 1.0), rxL = pr.w * 0.16, ryL = pr.h * 0.16;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      var prev = null;
      for (var i = 0; i <= 14; i++) {
        var q = Math.max(0, lp - 0.22 * (1 - i / 14));
        var lx = m.x - rxL * 0.6 + rxL * (Math.sin(q * 9.5) * 0.7 + q * 0.6), ly = m.y + ryL * Math.sin(q * 15 + 0.6) * 0.8;
        if (prev) { ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(lx, ly); ctx.lineCap = 'round'; ctx.lineWidth = L.u * 0.5 * (i / 14); ctx.strokeStyle = rgba('clay', 0.5 * (i / 14)); ctx.stroke(); }
        prev = { x: lx, y: ly };
      }
      glow(ctx, prev.x, prev.y, L.u * 3, 'clay', 0.9);
      circle(ctx, prev.x, prev.y, L.u * 0.42); ctx.fillStyle = '#FFE9DE'; ctx.fill();
      ctx.restore();
    }
    // 동그라미와 화살표
    G.ink.forEach(function (st) { drawStroke(ctx, st, seg(u, st.t0, st.t1), G.inkW, HEX.clay); });
    ctx.restore();
  }
  // 손글씨 「공명」(끝 장면에서 로고 자리로 옮겨 간다)
  function drawHand(ctx, t, L) {
    var u = t - T.f4, s = t - T.end, G = L.f4;
    var m = s > 0 ? E.ioQuint(seg(s, 0.0, 0.72)) : 0, a = 1 - seg(s, 0.6, 0.88);
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a;
    if (m > 0 && L.fin) {
      var hb = G.hb, nb = L.fin.nb, k = nb.w / hb.w, sc = 1 + m * (k - 1);
      ctx.translate(m * ((nb.x + nb.w / 2) - k * (hb.x + hb.w / 2)), m * ((nb.y + nb.h / 2) - k * (hb.y + hb.h / 2)));
      ctx.scale(sc, sc);
    }
    G.hand.forEach(function (st) { drawStroke(ctx, st, seg(u, st.t0, st.t1), G.handW, HEX.paper); });
    ctx.restore();
  }
  function penAt(t, L) {
    var u = t - T.f4, G = L.f4;
    if (u < 0.4 || t > T.end + 0.35) return null;
    var penIc = G.tb.icons[0], strokes = G.ink.concat(G.hand);
    var a = E.outC(seg(u, 0.4, 0.5)) * (1 - seg(t, T.end, T.end + 0.3));
    var hover = { x: penIc.x + G.B.w * 0.05, y: penIc.y - G.B.h * 0.12 };
    if (u < 0.5) { var p = E.ioC(seg(u, 0.4, 0.5)); return { x: lerp(hover.x, penIc.x, p), y: lerp(hover.y, penIc.y, p), a: a }; }
    if (u < strokes[0].t0) { var p2 = E.ioC(seg(u, 0.52, strokes[0].t0)), s0 = strokes[0].pts[0]; return { x: lerp(penIc.x, s0.x, p2), y: lerp(penIc.y, s0.y, p2), a: a }; }
    for (var i = 0; i < strokes.length; i++) {
      var st = strokes[i];
      if (u <= st.t1) { var h = strokeHead(st, seg(u, st.t0, st.t1)); return { x: h.x, y: h.y, a: a }; }
      var nx = strokes[i + 1];
      if (nx && u < nx.t0) {
        var e = st.pts[st.pts.length - 1], b = nx.pts[0], q = E.ioC(seg(u, st.t1, nx.t0));
        return { x: lerp(e.x, b.x, q), y: lerp(e.y, b.y, q) - Math.sin(Math.PI * q) * G.hb.h * 0.06, a: a };
      }
    }
    var last = strokes[strokes.length - 1].pts.slice(-1)[0], q2 = E.ioC(seg(u, strokes[strokes.length - 1].t1, 1.875 + 0.35));
    return { x: last.x + q2 * G.B.w * 0.1, y: last.y + q2 * G.B.h * 0.08, a: a };
  }
  function drawPen(ctx, P, L) {
    var len = L.f4.B.h * 0.22, w = len * 0.09;
    ctx.save(); ctx.globalAlpha = P.a; ctx.translate(P.x, P.y); ctx.rotate(0.62);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; rr(ctx, w * 0.4, -w * 0.1, len, w * 1.2, w * 0.6); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len * 0.12, -w / 2); ctx.lineTo(len * 0.12, w / 2); ctx.closePath(); ctx.fillStyle = HEX.clay; ctx.fill();
    rr(ctx, len * 0.12, -w / 2, len * 0.88, w, w * 0.45); ctx.fillStyle = HEX.paper; ctx.fill();
    ctx.fillStyle = rgba('muteHi', 1); ctx.fillRect(len * 0.32, -w / 2, len * 0.04, w);
    ctx.restore();
  }

  // 손가락 표시(누름 물결 포함)
  var PRESS = [T.f1 + 1.3, T.f2 + 0.09, T.f3 + 0.21];
  function pointerAt(t, L) {
    var P = L.ptr;
    if (t < T.f1 + 1.08 || t > T.f3 + 0.62) return null;
    var x, y, a = 1, down = 0, p;
    if (t < T.f1 + 1.3) { p = E.ioC(seg(t, T.f1 + 1.08, T.f1 + 1.3)); x = lerp(P.start.x, P.edit.x, p); y = lerp(P.start.y, P.edit.y, p); a = E.outC(seg(t, T.f1 + 1.08, T.f1 + 1.2)); }
    else if (t < T.f1 + 1.44) { x = P.edit.x; y = P.edit.y; down = t < T.f1 + 1.37 ? 1 : 0; }
    else if (t < T.f2 + 0.15) { p = E.ioC(seg(t, T.f1 + 1.44, T.f2 + 0.04)); x = lerp(P.edit.x, P.knob0.x, p); y = lerp(P.edit.y, P.knob0.y, p); down = t >= T.f2 + 0.08 ? 1 : 0; }
    else if (t < T.f2 + 1.42) { var k = knobXY(P.g2, fAt(t)); x = k.x; y = k.y; down = 1; }
    else if (t < T.f3 + 0.19) { var k2 = knobXY(P.g2, fAt(T.f2 + 1.42)); p = E.ioC(seg(t, T.f2 + 1.42, T.f3 + 0.17)); x = lerp(k2.x, P.pill.x, p); y = lerp(k2.y, P.pill.y, p) - Math.sin(Math.PI * p) * L.S.h * 0.08; }
    else { var d = E.outC(seg(t, T.f3 + 0.3, T.f3 + 0.62)); x = P.pill.x + d * L.u * 4; y = P.pill.y + d * L.u * 6; down = t < T.f3 + 0.28 ? 1 : 0; a = 1 - d; }
    return { x: x, y: y, a: a, down: down };
  }
  function drawPointer(ctx, t, L) {
    var P = pointerAt(t, L); if (!P) return;
    var r = Math.max(11, L.u * 1.3);
    PRESS.forEach(function (tp) {
      var q = seg(t, tp, tp + 0.42);
      if (q > 0 && q < 1) { circle(ctx, P.x, P.y, r * (1 + E.outC(q) * 1.8)); ctx.lineWidth = Math.max(1, r * 0.14 * (1 - q)); ctx.strokeStyle = rgba('paper', 0.75 * (1 - q) * P.a); ctx.stroke(); }
    });
    var rs = r * (P.down ? 0.84 : 1);
    ctx.save(); ctx.globalAlpha = P.a;
    circle(ctx, P.x, P.y + r * 0.12, rs * 1.08); ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fill();
    circle(ctx, P.x, P.y, rs); ctx.fillStyle = rgba('paper', P.down ? 0.42 : 0.26); ctx.fill();
    ctx.lineWidth = Math.max(1.5, r * 0.13); ctx.strokeStyle = rgba('paper', 0.95); ctx.stroke();
    circle(ctx, P.x, P.y, rs * 0.26); ctx.fillStyle = HEX.paper; ctx.fill();
    ctx.restore();
  }

  function drawFinale(ctx, t, L) {
    var s = t - T.end, F = L.fin; if (!F) return;
    var W = L.W, r0 = Math.max(2.8, L.u * 0.46);
    var bloom = 0.32 * Math.exp(-Math.pow((s - 0.66) / 0.13, 2)) + 0.1 * E.outC(seg(s, 0.55, 1.2)) * (1 - 0.35 * seg(s, 1.5, 3.75));
    glow(ctx, F.nc.x, F.nc.y, F.fs * 2.2, 'clay', bloom);
    var A = lerp(F.a0, F.af, E.ioC(seg(s, 1.4, 3.75))), ph = PHI_E(t);
    var lineA = E.outC(seg(s, 0.95, 1.6)), rev = E.outC(seg(s, 0.9, 1.6));
    function wy(x) { return F.wy + A * Math.sin(F.k * x - ph); }
    if (lineA > 0) {
      var half = W * 0.56 * rev, xa = W / 2 - half, xb = W / 2 + half;
      for (var j = 2; j >= 0; j--) {
        ctx.beginPath();
        for (var i = 0; i <= 120; i++) { var x = lerp(xa, xb, i / 120), y = F.wy + A * (1 - j * 0.18) * Math.sin(F.k * x - ph - j * 0.35); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
        ctx.lineWidth = j ? Math.max(1, L.u * 0.1) : Math.max(1.2, L.u * 0.16);
        ctx.strokeStyle = j ? rgba(j === 1 ? 'clay' : 'tideHi', 0.22 * lineA) : rgba('paper', 0.42 * lineA);
        ctx.stroke();
      }
    }
    if (s > 0.6) {
      F.dots.forEach(function (d, i) {
        var b = E.outExpo(seg(s, 0.6, 1.05)), m = E.ioQuint(seg(s, 0.88 + d.o * 0.3, 1.7 + d.o * 0.3));
        var bx = F.nc.x + Math.cos(d.ang) * d.dist * b, by = F.nc.y + Math.sin(d.ang) * d.dist * b * 0.62;
        var X = lerp(bx, d.x, m), Y = lerp(by, wy(d.x), m);
        var col = i % 2 ? 'tideHi' : 'clay';
        glow(ctx, X, Y, r0 * 3.4, col, 0.22);
        circle(ctx, X, Y, r0 * E.outBack(seg(s, 0.6, 0.85))); ctx.fillStyle = HEX[col]; ctx.fill();
      });
    }
  }

  /* ── 모듈 ── */
  function ensureFontCss() {
    var link = document.querySelector('link[href*="pretendard"]');
    if (!link) { link = document.createElement('link'); link.rel = 'stylesheet'; link.href = FONT_CSS; document.head.appendChild(link); }
    return new Promise(function (res) {
      if (link.sheet) return res();
      link.addEventListener('load', function () { res(); }, { once: true });
      link.addEventListener('error', function () { res(); }, { once: true });
      setTimeout(res, 2500);
    });
  }
  function loadFonts() {
    var all = TXT.features.join('') + TXT.cap1.concat(TXT.cap2, TXT.tag).map(function (w) { return w[0]; }).join('') + TXT.name + TXT.skip + TXT.pause + TXT.play + CANVAS_TXT;
    return ensureFontCss().then(function () {
      if (!document.fonts || !document.fonts.load) return;
      return Promise.race([
        Promise.all(['900', '800', '700', '600', '500'].map(function (w) { return document.fonts.load(w + ' 40px "Pretendard Variable"', all); })).then(function () { return document.fonts.ready; }),
        new Promise(function (r) { setTimeout(r, 3500); })
      ]);
    }).catch(function () {});
  }

  function mk(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  // 낱말마다 가리개를 씌운다(띄어쓰기에서만 줄이 바뀐다)
  function words(parent, list) {
    var spans = [];
    list.forEach(function (w, i) {
      var word = typeof w === 'string' ? w : w[0], dim = typeof w === 'string' ? 0 : w[1];
      if (i) parent.appendChild(document.createTextNode(' '));
      var o = mk('span', 'ri-w' + (dim ? ' ri-dim' : ''), parent), inn = mk('span', '', o, word);
      spans.push(inn);
    });
    return spans;
  }
  function svgIcon(kind) {
    var ns = 'http://www.w3.org/2000/svg', s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    var p = document.createElementNS(ns, 'path');
    p.setAttribute('fill', 'currentColor');
    p.setAttribute('d', kind === 'pause' ? 'M7 5h3.2v14H7zM13.8 5H17v14h-3.2z' : kind === 'play' ? 'M8 5.2v13.6L19 12z' : 'M5 6.5 11.5 12 5 17.5zM12.5 6.5 19 12l-6.5 5.5z');
    s.appendChild(p); return s;
  }
  function setT(e, v) { if (e._t !== v) { e.style.transform = v; e._t = v; } }
  function setO(e, v) { v = v <= 0.001 ? '0' : v >= 0.999 ? '1' : v.toFixed(3); if (e._o !== v) { e.style.opacity = v; e._o = v; } }
  function setC(e, v) { if (e._c !== v) { e.style.color = v; e._c = v; } }
  function wordAnim(spans, t, tin, stagger, dur, tout, dirOut) {
    for (var i = 0; i < spans.length; i++) {
      var a = E.outExpo(seg(t, tin + i * stagger, tin + i * stagger + dur));
      var b = tout == null ? 0 : E.inC(seg(t, tout + i * stagger * 0.6, tout + i * stagger * 0.6 + 0.3));
      var y = (1 - a) * 110 - b * 110 * (dirOut || 1);
      setT(spans[i], 'translate3d(0,' + y.toFixed(2) + '%,0)');
    }
  }

  function mount(el, opts) {
    opts = opts || {};
    if (!el) throw new Error('ResonanceIntro.mount: 띄울 요소가 없습니다');
    var safeTop = opts.safeTop == null ? 72 : +opts.safeTop;
    var onEnd = typeof opts.onEnd === 'function' ? opts.onEnd : null;
    var autoplay = opts.autoplay !== false;
    var cs = getComputedStyle(el);
    if (cs.position === 'static') el.style.position = 'relative';

    var root = mk('div', 'ri' + (opts.controls === false ? ' ri-noctrl' : ''), el);
    var stage = mk('div', 'ri-stage', root); stage.setAttribute('aria-hidden', 'true');
    var cv = mk('canvas', 'ri-cv', stage), ctx = cv.getContext('2d');
    mk('div', 'ri-vig', stage);
    var grain = mk('div', 'ri-grain', stage);
    var cap1 = mk('p', 'ri-cap', stage), cap2 = mk('p', 'ri-cap', stage);
    var cap1W = words(cap1, TXT.cap1), cap2W = words(cap2, TXT.cap2);
    var list = mk('div', 'ri-list', stage), mark = mk('span', 'ri-mark', list), lis = [], liW = [];
    TXT.features.forEach(function (f, i) {
      var li = mk('div', 'ri-li', list), num = mk('span', 'ri-num', li), numIn = words(num, ['0' + (i + 1)]);
      var tt = mk('span', 'ri-tt', li);
      lis.push(li); liW.push(numIn.concat(words(tt, f.split(' '))));
    });
    var pt = mk('div', 'ri-pt', stage), pti = [], ptW = [];
    TXT.features.forEach(function (f, i) {
      var it = mk('div', 'ri-pti', pt), num = mk('span', 'ri-num', it), tt = mk('span', 'ri-tt', it);
      var w = words(num, ['0' + (i + 1) + ' / 04']).concat(words(tt, f.split(' ')));
      pti.push(it); ptW.push(w);
    });
    var prog4 = mk('div', 'ri-prog4', pt), prog4i = [];
    for (var pi = 0; pi < 4; pi++) prog4i.push(mk('i', '', mk('span', '', prog4)));
    var lock = mk('div', 'ri-lock', root);
    var nameEl = mk('p', 'ri-name', lock, TXT.name);
    var tagEl = mk('p', 'ri-tag', lock), tagW = words(tagEl, TXT.tag);
    lock.setAttribute('aria-hidden', 'true');
    mk('p', 'ri-sr', root, TXT.summary);
    var ctrl = mk('div', 'ri-ctrl', root);
    var bPause = mk('button', 'ri-btn ri-pause', ctrl); bPause.type = 'button';
    var bSkip = mk('button', 'ri-btn ri-skip', ctrl); bSkip.type = 'button';
    mk('span', '', bSkip, TXT.skip); bSkip.appendChild(svgIcon('skip'));
    var bar = mk('i', '', mk('span', 'ri-bar', bSkip));

    var L = null, t = clamp(+opts.startAt || 0, 0, DUR), playing = false, userPaused = !autoplay, ended = false, raf = 0, last = 0, dead = false, ready = false;
    var api = {};
    function setPauseUi() {
      bPause.textContent = '';
      var paused = !playing;
      bPause.appendChild(svgIcon(paused ? 'play' : 'pause'));
      bPause.setAttribute('aria-label', paused ? TXT.play : TXT.pause);
      bPause.title = paused ? TXT.play : TXT.pause;
    }

    function relayout() {
      var r = root.getBoundingClientRect(), W = Math.max(1, Math.round(r.width)), H = Math.max(1, Math.round(r.height));
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (W * H * dpr * dpr > 9e6) dpr = Math.sqrt(9e6 / (W * H));
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      L = layout(W, H, safeTop, ctx); L.dpr = dpr;
      root.setAttribute('data-orient', L.land ? 'land' : 'port');
      // 자막
      [cap1, cap2].forEach(function (c) {
        c.style.fontSize = L.capFs + 'px'; c.style.left = L.C.x + 'px'; c.style.top = '';
        c.style.maxWidth = (L.land ? L.C.w * 0.6 : L.C.w) + 'px';
      });
      var capH = cap1.offsetHeight;
      cap1.style.top = cap2.style.top = (L.C.y + L.C.h - capH) + 'px';
      // 기능 목록
      list.style.display = L.land ? '' : 'none'; pt.style.display = L.land ? 'none' : '';
      if (L.land) {
        var fs = clamp(Math.min(L.list.w * 0.088, L.C.h / 9.5), 17, 96);
        list.style.width = L.list.w + 'px'; list.style.left = L.list.x + 'px';
        for (var it = 0; it < 4; it++) {
          list.style.fontSize = fs + 'px';
          if (list.offsetHeight <= L.C.h * 0.92) break;
          fs *= 0.88;
        }
        list.style.top = (L.C.y + (L.C.h - list.offsetHeight) / 2) + 'px';
        L.liPos = lis.map(function (li) { var tt = li.querySelector('.ri-tt'); return { y: li.offsetTop, h: li.offsetHeight, ty: li.offsetTop + tt.offsetTop, th: tt.offsetHeight }; });
      } else {
        var pfs = clamp(L.W * 0.08, 24, 46);
        pt.style.left = L.pt.x + 'px'; pt.style.top = L.pt.y + 'px'; pt.style.width = L.pt.w + 'px'; pt.style.fontSize = pfs + 'px';
        var mh = 0; pti.forEach(function (it2) { mh = Math.max(mh, it2.offsetHeight); });
        prog4.style.top = (mh + 16) + 'px';
      }
      // 끝 화면 로고 묶음
      var nfs = L.land ? Math.min(L.C.h * 0.27, L.W * 0.15) : Math.min(L.W * 0.3, L.C.h * 0.19);
      nfs = clamp(nfs, 64, 560);
      var tfs = clamp(nfs * 0.17, 19, 96), gap = nfs * 0.46, ctaH = 56, ctaGap = Math.max(28, nfs * 0.24);
      nameEl.style.fontSize = nfs + 'px'; tagEl.style.fontSize = tfs + 'px';
      nameEl.style.transform = 'none'; nameEl._t = null;
      tagEl.style.marginTop = gap + 'px';
      var blockH = lock.offsetHeight + ctaGap + ctaH;
      var top = L.C.y + Math.max(0, (L.C.h - blockH) * 0.46);
      lock.style.top = top + 'px';
      var rr0 = root.getBoundingClientRect(), nr = nameEl.getBoundingClientRect(), tr = tagEl.getBoundingClientRect();
      var tagTop = tr.top - rr0.top, nameTop = nr.top - rr0.top;
      var tspan = tagEl.querySelector('.ri-w');
      var tagGlyphTop = tspan ? tspan.getBoundingClientRect().top - rr0.top : tagTop;
      var nb = { x: nr.left - rr0.left + nr.width * 0.02, y: nameTop + nr.height * 0.1, w: nr.width * 0.96, h: nr.height * 0.82 };
      var wy = (nameTop + nr.height + tagGlyphTop) / 2;
      var rnd = rng(31), dots = [];
      for (var i = 0; i < 28; i++) dots.push({ x: lerp(-L.W * 0.02, L.W * 1.02, i / 27), ang: (i / 28) * TAU + rnd() * 0.5, dist: (0.16 + rnd() * 0.3) * Math.min(L.W, L.H), o: Math.abs(i / 27 - 0.5) * 2 * 0.5 + rnd() * 0.15 });
      L.fin = { nb: nb, nc: { x: nb.x + nb.w / 2, y: nb.y + nb.h / 2 }, fs: nfs, wy: wy, k: TAU / (L.land ? L.W * 0.42 : L.W * 0.9), a0: (tagGlyphTop - nameTop - nr.height) * 0.36, af: (tagGlyphTop - nameTop - nr.height) * 0.2, dots: dots };
      api.ctaTop = Math.round(tr.bottom - rr0.top + ctaGap);
      el.style.setProperty('--ri-cta-top', api.ctaTop + 'px');
      // 손가락 길
      var K = L.f1.K, tb = L.f1.tb, g2 = panelGeom(L.S);
      L.ptr = { start: { x: K.x + K.w * 0.98, y: K.y + K.h * 1.08 }, edit: { x: tb.x + tb.eW * 0.5, y: tb.y + tb.h / 2 }, knob0: knobXY(g2, F0), g2: g2, pill: { x: L.f3.pill.x + L.f3.pill.w * 0.4, y: L.f3.pill.y + L.f3.pill.h / 2 } };
      render(t);
    }

    function updateDom(t) {
      setO(cap1, t < 2.3 ? 1 : 0); setO(cap2, t > 1.6 && t < 4 ? 1 : 0);
      wordAnim(cap1W, t, 0.5, 0.07, 0.5, 1.68, 1);
      wordAnim(cap2W, t, 2.0, 0.08, 0.5, 3.38, 1);
      var s = t - T.end;
      if (L.land) {
        lis.forEach(function (li, i) { wordAnim(liW[i], t, T.f1 + 0.06 + i * 0.07, 0.035, 0.55, T.end - 0.05 + i * 0.04, -1); });
        var w = [0, 0, 0, 0];
        for (var i = 0; i < 4; i++) w[i] = seg(t, FSTART[i] - 0.12, FSTART[i] + 0.08) * (1 - seg(t, FSTART[i + 1] - 0.12, FSTART[i + 1] + 0.08));
        lis.forEach(function (li, i) {
          setC(li, rgba(mix([168, 164, 155], 'paper', w[i]), lerp(0.42, 1, w[i])));
          setT(li, 'translate3d(' + (w[i] * Math.max(4, L.u * 0.5)).toFixed(2) + 'px,0,0)');
        });
        var pos = 0;
        for (var j = 1; j < 4; j++) pos += E.ioQuint(seg(t, FSTART[j] - 0.12, FSTART[j] + 0.14));
        var a = Math.floor(pos), f = pos - a, P = L.liPos, b = Math.min(3, a + 1);
        var y = lerp(P[a].ty, P[b].ty, f), h = lerp(P[a].th, P[b].th, f);
        var vis = E.outExpo(seg(t, T.f1 + 0.1, T.f1 + 0.5)) * (1 - E.inC(seg(t, T.end, T.end + 0.3)));
        setT(mark, 'translate3d(0,' + y.toFixed(2) + 'px,0) scaleY(' + (h / 100 * vis).toFixed(4) + ')');
      } else {
        pti.forEach(function (it, i) { wordAnim(ptW[i], t, FSTART[i] + 0.04, 0.045, 0.5, FSTART[i + 1] - 0.16, 1); });
        setO(prog4, seg(t, T.f1, T.f1 + 0.3) * (1 - seg(t, T.end, T.end + 0.3)));
        prog4i.forEach(function (b2, i) { setT(b2, 'scaleX(' + seg(t, FSTART[i], FSTART[i + 1]).toFixed(4) + ')'); });
      }
      var na = E.outC(seg(s, 0.58, 0.95));
      setO(nameEl, na);
      var blur = (1 - na) * 10;
      var fv = blur > 0.05 ? 'blur(' + blur.toFixed(2) + 'px)' : 'none';
      if (nameEl._f !== fv) { nameEl.style.filter = fv; nameEl._f = fv; }
      setT(nameEl, 'scale(' + lerp(1.05, 1, na).toFixed(4) + ')');
      wordAnim(tagW, t, T.end + 0.98, 0.09, 0.6);
      var fr = Math.floor(t * 24), gx = ((fr * 73) % 61) - 30, gy = ((fr * 41) % 53) - 26;
      setT(grain, 'translate3d(' + gx + 'px,' + gy + 'px,0)');
      setT(bar, 'scaleX(' + (t / DUR).toFixed(4) + ')');
    }

    function render(tt) {
      if (!L) return;
      tt = clamp(tt, 0, DUR);
      ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.fillStyle = HEX.char; ctx.fillRect(0, 0, L.W, L.H);
      if (!ready) return;
      drawBackdrop(ctx, tt, L);
      if (tt < T.f1) drawOpen(ctx, tt, L);
      if (tt >= T.f1 && tt < T.f2) drawF1(ctx, tt, L);
      if (tt >= T.f2 && tt < T.f3) drawF2(ctx, tt, L);
      if (tt >= T.f3 && tt < T.f4) drawF3(ctx, tt, L);
      if (tt >= T.f4 && tt < T.end + 0.7) drawF4(ctx, tt, L);
      if (tt >= T.end) drawFinale(ctx, tt, L);
      if (tt >= T.f4 + 1.0 && tt < T.end + 0.9) drawHand(ctx, tt, L);
      var pen = tt >= T.f4 ? penAt(tt, L) : null;
      if (pen && pen.a > 0) drawPen(ctx, pen, L);
      drawPointer(ctx, tt, L);
      updateDom(tt);
    }

    function frame(now) {
      raf = 0;
      if (!playing || dead) return;
      var dt = (now - last) / 1000; last = now;
      t += clamp(dt, 0, 0.1);
      if (t >= DUR) { t = DUR; render(t); finish(); return; }
      render(t);
      raf = requestAnimationFrame(frame);
    }
    function play() {
      if (dead || !ready) { userPaused = false; return; }
      if (t >= DUR) return;
      userPaused = false;
      if (playing) return;
      playing = true; last = performance.now(); setPauseUi();
      raf = requestAnimationFrame(frame);
    }
    function pause() {
      userPaused = true; playing = false;
      if (raf) cancelAnimationFrame(raf); raf = 0; setPauseUi();
    }
    function finish() {
      playing = false; if (raf) cancelAnimationFrame(raf); raf = 0;
      root.classList.add('ri-done'); setPauseUi();
      if (!ended) { ended = true; if (onEnd) { try { onEnd(); } catch (e) { setTimeout(function () { throw e; }); } } }
    }
    function skip() {
      if (dead || ended) return;
      root.classList.remove('ri-flash'); void root.offsetWidth; root.classList.add('ri-flash');
      t = DUR; render(t); finish();
    }
    function replay() {
      if (dead) return;
      ended = false; root.classList.remove('ri-done', 'ri-flash'); t = 0; render(t); playing = false; play();
    }
    function seek(v) { t = clamp(+v || 0, 0, DUR); render(t); return t; }
    function onVis() {
      if (document.hidden) { if (playing) { playing = false; if (raf) cancelAnimationFrame(raf); raf = 0; } }
      else if (!userPaused && !ended && ready) { playing = false; play(); }
    }
    bPause.addEventListener('click', function () { if (playing) pause(); else play(); });
    bSkip.addEventListener('click', skip);
    document.addEventListener('visibilitychange', onVis);
    var ro = typeof ResizeObserver === 'function' ? new ResizeObserver(function () { relayout(); }) : null;
    if (ro) ro.observe(root); else window.addEventListener('resize', relayout);
    setPauseUi();
    relayout();

    api.ready = loadFonts().then(function () {
      if (dead) return;
      ready = true; relayout();
      if (t >= DUR) { finish(); return; }
      if (!userPaused) play();
    });
    api.skip = skip; api.play = play; api.pause = pause; api.replay = replay; api.seek = seek;
    api.time = function () { return t; };
    api.duration = DUR;
    api.destroy = function () {
      if (dead) return;
      dead = true; playing = false; if (raf) cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
      if (ro) ro.disconnect(); else window.removeEventListener('resize', relayout);
      root.remove();
      if (window.__intro === api) delete window.__intro;
    };
    window.__intro = api;
    return api;
  }

  window.ResonanceIntro = { mount: mount, duration: DUR, beats: T };
})();
