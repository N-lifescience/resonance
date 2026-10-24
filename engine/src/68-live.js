// 실시간 수업: 학생 기기(웨일북 등)가 교사 화면을 따라가고, 학생이 움직인 익스플로라그램 슬라이더 값·고른 퀴즈 보기·적은 단답이
// 교사 「학생 보기」에 이름 없이 모인다.
// 저장 안 함·식별 안 함: 이름·번호·DB 없이 탭 메모리에만 두고, 닫으면 사라진다. 실시간을 켜지 않으면 아무것도 하지 않는다.
// 채널 둘: 교사 → 학생 'ch-live-<코드>'(학생이 구독), 학생 → 교사 'ch-live-<코드>-in'(교사만 구독, 학생은 구독 없이 보낸다).
// 그래서 학생 메시지는 다른 학생에게 퍼지지 않는다. 전송은 Supabase Realtime(broadcast) 또는 같은 PC 탭끼리(BroadcastChannel).
// 실시간 판서(⚙ 「학생 화면에 판서 보이기」): 교사가 보는 쪽(장·칠판)의 판서를 묶어 보낸다. 묶음마다 판 번호(rev)를 붙이고
// 앞 판 번호(base)가 맞을 때만 이어 그린다. 놓쳤거나 늦게 들어온 학생은 'need'로 그 쪽 전체(snap)를 다시 받는다.
const LIVE = Object.assign({ url: '', key: '', site: '' }, typeof LIVE_CONFIG === 'object' && LIVE_CONFIG ? LIVE_CONFIG : {});
const LIVE_SUPA_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.min.js';   // 판을 고정한다(httpSend가 있는 판)
const LIVE_QR_JS = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
const LIVE_STATE_MS = 5000;   // 늦게 들어온 학생을 위해 교사 상태를 다시 보내는 간격
const LIVE_HI_MS = 10000;     // 학생이 '여기 있어요'를 보내는 간격
const LIVE_GONE_MS = 30000;   // 이만큼 소식이 없으면 참여 인원에서 뺀다
const LIVE_WAIT_MS = 15000;   // 이만큼 교사 상태가 없으면 학생에게 '기다리는 중'
const LIVE_VAL_MS = 300;      // 슬라이더를 끄는 동안은 멈춘 뒤에 한 번 보낸다(손을 떼면 바로)
const LIVE_SEND_MS = 400;     // 교사 상태를 보내는 가장 짧은 간격
const LIVE_JOIN_MS = 2000;    // 새 학생이 들어와서 보내는 상태는 이 간격에 한 번(가짜 학생을 쏟아내도 퍼지는 양이 묶인다)
const LIVE_FORGET_MS = 120000;   // 이만큼 소식이 없으면 그 학생 값을 분포에서 지운다(가려진 탭은 타이머가 1분까지 늦다)
const LIVE_MAX = 300;         // 한 방이 기억하는 학생 수(새로 고침하면 새 sid라 반 인원보다 넉넉히)
const LIVE_BINS = 20;         // 값이 40개를 넘는 슬라이더는 이만큼 칸으로 묶는다
const LIVE_SKIP = '.ch-stops, .ch-yearline';   // 엔진의 단계 막대·연표 막대는 교사를 따라가는 것이라 모으지 않는다
// 실시간 판서. 묶음 하나도 학생 수만큼 퍼지므로 학생이 많으면 간격을 늘린다(학생 수 × LIVE_INK_PER, LIVE_INK_MIN~LIVE_INK_MAX).
const LIVE_INK_FIRST = 150;   // 판서가 바뀐 뒤 처음 보내기까지(획 첫머리를 조금 모은다)
const LIVE_INK_MIN = 400;
const LIVE_INK_MAX = 1500;
const LIVE_INK_PER = 16;
const LIVE_INK_PLAY = 350;    // 학생 화면은 받은 묶음을 이만큼에 걸쳐 그린다(선이 그어지는 대로 보이게)
const LIVE_INK_BYTES = 180000;   // 메시지 하나의 글자 수(Supabase broadcast 한도 256KB보다 작게). 넘으면 점을 성기게 한다.
const LIVE_NEED_WAIT = 800;   // 학생: 판이 어긋난 것을 보고 이만큼 기다렸다가(이미 오는 중일 수 있다) 다시 보내 달라고 한다
const LIVE_ID_MAX = 2 ** 31;

// 화면과 상관없는 계산. 단위 시험이 Node에서 부른다.
const LiveCore = {
  // 교사가 연 범위: 장마다 null(아직 안 감) 또는 { shown, steps }. 같은 장은 지금까지 가장 많이 연 값을 남긴다.
  reach(prev, n, slide, shown, steps) {
    const out = Array.from({ length: n }, (_, i) => (prev && prev[i]) || null);
    const old = out[slide];
    out[slide] = {
      shown: old ? Math.max(old.shown, shown) : shown,
      steps: steps.map((p, k) => (old && old.steps[k] != null ? Math.max(old.steps[k], p) : p)),
    };
    return out;
  },

  // dir(+1, -1) 쪽으로 가장 가까운 열린 장. 없으면 -1.
  step(reach, from, dir) {
    for (let i = from + dir; i >= 0 && i < reach.length; i += dir) if (reach[i]) return i;
    return -1;
  },

  // 값 → 칸 [{ lo, hi, n, pick }]. 값이 40개 이하로 나뉘면 값마다 한 칸, 아니면 LIVE_BINS칸.
  // pick은 칸 안에서 가장 많은 값(같으면 작은 값)이다. 칠판에 띄울 때 이 값을 쓴다.
  bins(values, min, max, step) {
    const st = step > 0 ? step : 1;
    const each = (max - min) / st + 1 <= 40;
    const count = Math.max(1, each ? Math.round((max - min) / st) + 1 : LIVE_BINS);
    const width = each ? st : (max - min) / LIVE_BINS;
    const tally = Array.from({ length: count }, () => new Map());
    const out = tally.map((_, i) => ({ lo: min + i * width, hi: each ? min + i * width : min + (i + 1) * width, n: 0, pick: null }));
    for (const v of values) {
      if (!Number.isFinite(v)) continue;
      const i = clamp(each ? Math.round((v - min) / st) : Math.floor((v - min) / width), 0, count - 1);
      out[i].n++;
      tally[i].set(v, (tally[i].get(v) || 0) + 1);
    }
    out.forEach((b, i) => {
      let most = 0;
      for (const [v, k] of tally[i]) if (k > most || (k === most && v < b.pick)) { b.pick = v; most = k; }
    });
    return out;
  },

  // 판서 좌표 p[from…] → 보낼 정수 [dx, dy, …]. 앞 점(prev, 없으면 원점)에서 뺀 값이라 짧다.
  // 앞 점과 가로·세로 모두 step보다 가까운 점은 건너뛴다(step 1이면 반올림해 같은 점만). last는 마지막으로 보낸 점.
  inkEnc(p, from, prev, step) {
    const pts = [];
    let last = prev;
    for (let i = from; i + 1 < p.length; i += 2) {
      const x = Math.round(p[i]);
      const y = Math.round(p[i + 1]);
      if (last && Math.max(Math.abs(x - last[0]), Math.abs(y - last[1])) < step) continue;
      pts.push(x - (last ? last[0] : 0), y - (last ? last[1] : 0));
      last = [x, y];
    }
    return { pts, last };
  },

  inkDec(pts, prev) {
    const out = [];
    let x = prev ? prev[0] : 0;
    let y = prev ? prev[1] : 0;
    for (let i = 0; i + 1 < pts.length; i += 2) {
      x += pts[i];
      y += pts[i + 1];
      out.push(x, y);
    }
    return out;
  },

  // 보낼 획 하나: [번호, 0 펜 | 1 형광펜, 색, 굵기, 좌표]
  inkWire(id, s, pts) { return [id, s.t === 'hl' ? 1 : 0, s.c, s.w, pts]; },

  // 쪽 전체. list = [{ id, s }]. sent는 다음 비교에 쓸 기록(id → { n: 보낸 좌표 수, last: 마지막으로 보낸 점 }).
  inkSnap(list, step) {
    const snap = [];
    const sent = new Map();
    for (const { id, s } of list) {
      const e = LiveCore.inkEnc(s.p, 0, null, step);
      if (!e.pts.length) continue;
      snap.push(LiveCore.inkWire(id, s, e.pts));
      sent.set(id, { n: s.p.length, last: e.last });
    }
    return { snap, sent };
  },

  // 지난번에 보낸 기록(sent)과 지금 쪽의 차이. put: 새 획, more: 길어진 획의 뒷부분, del: 사라진 획 번호.
  // sent는 바꾸지 않고 다음 기록을 돌려준다(보내기로 정한 뒤에 바꾼다).
  inkDelta(list, sent, step) {
    const put = [];
    const more = [];
    const next = new Map();
    for (const { id, s } of list) {
      const old = sent.get(id);
      if (!old) {
        const e = LiveCore.inkEnc(s.p, 0, null, step);
        if (!e.pts.length) continue;
        put.push(LiveCore.inkWire(id, s, e.pts));
        next.set(id, { n: s.p.length, last: e.last });
      } else if (old.n < s.p.length) {
        const e = LiveCore.inkEnc(s.p, old.n, old.last, step);
        if (e.pts.length) more.push([id, e.pts]);
        next.set(id, { n: s.p.length, last: e.last });
      } else next.set(id, old);
    }
    const del = [...sent.keys()].filter((id) => !next.has(id));
    return { put, more, del, sent: next };
  },

  // 한 장에 답한 학생 수. maps는 그 장 활동마다의 Map(sid → 값)(없으면 null), alive(sid)는 지금 접속 중인지.
  // 여러 활동에 답한 학생도 한 명으로 센다. 나간 학생은 빼서 '접속 m명 중 n명'의 n이 m을 넘지 않는다.
  answered(maps, alive) {
    const sids = new Set();
    for (const m of maps) if (m) for (const sid of m.keys()) if (alive(sid)) sids.add(sid);
    return sids.size;
  },

  // 학생이 받아 둔 판(have)이 교사가 알린 판(rev)만큼 새것인가. 판 번호는 늘기만 하고, 0은 '아무것도 안 쓴 빈 쪽'이다.
  inkFresh(have, rev) { return have === rev || (rev > 0 && have > rev); },

  // 받은 메시지 검사. 모양이 맞으면 필요한 값만 담은 새 객체, 아니면 null. n은 받는 쪽 덱의 장 수.
  clean(event, p, n) {
    if (!p || typeof p !== 'object') return null;
    const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
    const sid = (x) => typeof x === 'string' && /^[a-z0-9]{8}$/.test(x);
    if (event === 'hi') return sid(p.sid) ? { sid: p.sid } : null;
    if (event === 'end') return sid(p.tid) ? { tid: p.tid } : null;
    if (event === 'val') {
      const ok = sid(p.sid) && int(p.slide, 0, n - 1) && typeof p.key === 'string' && p.key.length > 0 && p.key.length <= 60 && Number.isFinite(p.v);
      return ok ? { sid: p.sid, slide: p.slide, key: p.key, v: p.v } : null;
    }
    const where = sid(p.sid) && int(p.slide, 0, n - 1) && typeof p.key === 'string' && /^[\w-]{1,60}$/.test(p.key);
    if (event === 'pick') {
      const ok = where && Array.isArray(p.c) && p.c.length <= 50 && p.c.every((x) => int(x, 0, 49));
      return ok ? { sid: p.sid, slide: p.slide, key: p.key, c: [...new Set(p.c)].sort((a, b) => a - b) } : null;
    }
    if (event === 'text') {
      const t = where && typeof p.t === 'string' ? LiveCore.tidy(p.t.slice(0, 1000)) : '';
      return t ? { sid: p.sid, slide: p.slide, key: p.key, t } : null;
    }
    // 판서 쪽 이름: 's장번호' 또는 'b칠판번호'
    const pg = (x) => {
      const m = typeof x === 'string' && /^([sb])(0|[1-9]\d{0,2})$/.exec(x);
      return !!m && Number(m[2]) < (m[1] === 's' ? n : 200);
    };
    if (event === 'need') {
      return sid(p.sid) && pg(p.pg) && int(p.have, -1, LIVE_ID_MAX) ? { sid: p.sid, pg: p.pg, have: p.have } : null;
    }
    if (event === 'ink') {
      if (!sid(p.tid) || !int(p.ep, 0, 1e6) || !pg(p.pg) || !int(p.rev, 1, LIVE_ID_MAX)) return null;
      let budget = 400000;   // 메시지 하나에 받는 좌표 수
      const pts = (a) => {
        if (!Array.isArray(a) || a.length < 2 || a.length % 2 || a.length > budget || !a.every((v) => int(v, -20000, 20000))) return null;
        budget -= a.length;
        return a.slice();
      };
      const stroke = (s) => {
        if (!Array.isArray(s) || s.length !== 5 || !int(s[0], 0, LIVE_ID_MAX) || (s[1] !== 0 && s[1] !== 1)) return null;
        if (!InkModel.sanitizeStroke({ t: 'pen', c: s[2], w: s[3], p: [0, 0] })) return null;   // 색·굵기
        const q = pts(s[4]);
        return q && [s[0], s[1], s[2], s[3], q];
      };
      const list = (a, max, fn) => {
        if (a == null) return [];
        if (!Array.isArray(a) || a.length > max) return null;
        const out = a.map(fn);
        return out.every(Boolean) ? out : null;
      };
      const out = { tid: p.tid, ep: p.ep, pg: p.pg, rev: p.rev };
      if (p.snap != null) {
        out.snap = list(p.snap, 5000, stroke);
        return out.snap ? out : null;
      }
      if (!int(p.base, 0, LIVE_ID_MAX)) return null;
      out.base = p.base;
      out.put = list(p.put, 5000, stroke);
      out.more = list(p.more, 200, (m) => {
        if (!Array.isArray(m) || m.length !== 2 || !int(m[0], 0, LIVE_ID_MAX)) return null;
        const q = pts(m[1]);
        return q && [m[0], q];
      });
      out.del = list(p.del, 5000, (id) => (int(id, 0, LIVE_ID_MAX) ? id : null));
      return out.put && out.more && out.del ? out : null;
    }
    if (event === 'state') {
      if (!sid(p.tid) || !int(p.slide, 0, 999) || !int(p.shown, 0, 999) || !Array.isArray(p.reach) || p.reach.length > 1000) return null;
      const steps = (a) => (Array.isArray(a) && a.length <= 50 && a.every((x) => int(x, -1, 999)) ? a.slice() : []);
      const L = p.lesson && typeof p.lesson === 'object' ? p.lesson : {};
      return {
        tid: p.tid,
        slide: p.slide,
        shown: p.shown,
        steps: steps(p.steps),
        reach: p.reach.map((r) => (r && typeof r === 'object' && int(r.shown, 0, 999) ? { shown: r.shown, steps: steps(r.steps) } : null)),
        lesson: { key: String(L.key || '').slice(0, 120), n: int(L.n, 1, 1000) ? L.n : 0, title: String(L.title || '').slice(0, 120) },
        site: typeof p.site === 'string' && /^[\w-]{1,60}$/.test(p.site) ? p.site : null,
        // 실시간 판서가 켜져 있을 때만: 교사가 보는 판서 쪽과 판 번호, 칠판을 열었으면 그 칠판
        ink: p.ink && typeof p.ink === 'object' && int(p.ink.ep, 0, 1e6) && pg(p.ink.pg) && int(p.ink.rev, 0, LIVE_ID_MAX)
          ? { ep: p.ink.ep, pg: p.ink.pg, rev: p.ink.rev } : null,
        board: p.board && typeof p.board === 'object' && int(p.board.i, 0, 199) && int(p.board.n, 1, 200) && p.board.i < p.board.n && BOARD_BGS.includes(p.board.bg)
          ? { i: p.board.i, n: p.board.n, bg: p.board.bg } : null,
        // 툴바 타이머가 떠 있을 때만: 남은 ms, 처음 정한 초, 가는 중인지
        timer: p.timer && typeof p.timer === 'object' && int(p.timer.left, 0, 1e8) && int(p.timer.total, 1, 1e5) && typeof p.timer.run === 'boolean'
          ? { left: p.timer.left, total: p.timer.total, run: p.timer.run } : null,
      };
    }
    return null;
  },

  // 단답 글: 줄바꿈·제어 문자는 띄어쓰기로, 앞뒤 빈칸은 지우고 SHORT_MAX자까지
  tidy(t) { return String(t || '').replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200); },

  code() { return String(100000 + Math.floor(Math.random() * 900000)); },

  sid() {
    let s = '';
    while (s.length < 8) s += Math.random().toString(36).slice(2);
    return s.slice(0, 8);
  },
};

const LIVE_NAV_KEYS = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', ' ', 'Enter', 'Backspace'];

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = h('script', { src });
    s.onload = () => resolve();
    s.onerror = () => { s.remove(); reject(new Error(`불러오지 못함: ${src}`)); };
    document.head.append(s);
  });
}

// QR 그림(<img>). 처음 쓸 때 QR 라이브러리를 불러온다(인터넷이 없으면 reject).
async function qrImage(url) {
  if (!window.qrcode) await loadScript(LIVE_QR_JS);
  const qr = window.qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  return h('img', { src: qr.createDataURL(4, 2), alt: `QR 코드: ${url}` });
}

// 전송: open(채널 이름, 받기(event, payload), 듣기) → { send(event, payload), close() }. 연결하지 못하면 reject.
// 듣지 않는 채널은 구독하지 않는다(학생 → 교사). 그래서 학생은 다른 학생의 메시지를 받지 않는다.
const LocalLink = {
  async open(topic, onMsg, listen) {
    const bc = new BroadcastChannel(topic);
    if (listen) bc.onmessage = (e) => { const m = e.data; if (m && typeof m.event === 'string') onMsg(m.event, m.payload); };
    return { send: (event, payload) => bc.postMessage({ event, payload }), close: () => bc.close() };
  },
};

const SupaLink = {
  client: null,
  async open(topic, onMsg, listen) {
    if (!window.supabase) await loadScript(LIVE_SUPA_JS);
    if (!this.client) this.client = window.supabase.createClient(LIVE.url, LIVE.key, { auth: { persistSession: false, autoRefreshToken: false } });
    const client = this.client;
    const ch = client.channel(topic, { config: { broadcast: { self: false } } });
    if (listen) {
      for (const ev of ['state', 'val', 'pick', 'text', 'hi', 'end', 'ink', 'need']) ch.on('broadcast', { event: ev }, (m) => onMsg(ev, m && m.payload));
      try {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('TIMED_OUT')), 10000);
          ch.subscribe((status) => {
            if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
            else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(timer); reject(new Error(status)); }
          });
        });
      } catch (err) {
        client.removeChannel(ch);
        throw err;
      }
    }
    // 구독한 채널은 웹소켓으로, 구독하지 않은 채널(학생 → 교사)은 REST(httpSend)로 보낸다
    const send = (event, payload) => {
      const p = listen || typeof ch.httpSend !== 'function' ? ch.send({ type: 'broadcast', event, payload }) : ch.httpSend(event, payload);
      Promise.resolve(p).catch(() => {});
    };
    return { send, close: () => { client.removeChannel(ch); } };
  },
};

const Live = {
  role: null,          // null | 'teacher' | 'student'
  local: false,
  code: '',
  main: null,          // 교사 → 학생 채널
  inbox: null,         // 학생 → 교사 채널
  timers: [],
  // 교사
  reach: [],
  vals: new Map(),     // '장|키' → Map(sid → 값)
  picks: new Map(),    // '장|키' → Map(sid → [고른 보기 번호])
  texts: new Map(),    // '장|키' → Map(sid → { t, at })
  hidden: new Set(),   // 교사가 숨긴 단답 '장|키|sid'
  seen: new Map(),     // sid → 마지막 소식 시각
  peek: null,          // 칠판에 띄운 학생 값 { input, before }
  panel: null,
  ui: null,
  tallyEl: null,       // 오른쪽 위 응답 현황(접속 m명 중 n명 제출)
  dist: null,
  distOn: false,
  distRaf: 0,
  lastSlide: -1,
  sentAt: 0,
  stateTimer: 0,
  stateDue: 0,
  run: null,           // 지금 진행 중인 startTeacher의 표시
  tid: '',
  frozen: false,       // 인쇄 중(단계 막대를 모두 연 상태)
  distHold: null,      // 분포 막대를 누르고 있는 포인터
  distLate: false,
  distHoldTimer: 0,
  // 실시간 판서(교사)
  inkRec: new WeakMap(),   // 쪽(획 배열) → { pg, rev, sent }: 그 쪽을 마지막으로 보낸 기록
  inkIds: new WeakMap(),   // 획 → 번호
  inkNext: 1,
  inkSeq: 0,               // 판 번호. 한 번 켠 동안 늘기만 한다(빈 쪽만 0)
  inkEp: 0,                // 판서 문서 번호: 반을 바꾸면 는다. 학생은 번호가 바뀌면 받아 둔 판서를 모두 버린다
  inkTimer: 0,
  inkSentAt: 0,
  inkSnapAt: 0,
  inkWanted: false,        // 학생이 쪽 전체를 다시 달라고 했다
  // 실시간 판서(학생)
  inkOn: false,
  inkPages: new Map(),     // 쪽 이름 → { rev, arr, ids: Map(번호 → 획) }
  inkPlay: new Map(),      // 그리는 중인 획 → { q: 남은 좌표, arr, until, at }
  inkRaf: 0,
  fab: null,               // 교사 화면 오른쪽 아래의 「실시간 수업」 단추
  needTimer: 0,
  needAt: 0,
  // 학생
  sid: '',
  teacher: null,       // 마지막으로 받은 교사 상태(clean을 거친 것)
  follow: true,
  heard: 0,
  pending: new Map(),  // '장|키' → 보내기 타이머
  join: null,
  joinUi: null,
  bar: null,
  barKey: '',
  timerEl: null,       // 교사 툴바 타이머의 남은 시간
  timerTick: 0,
  timerEnd: 0,         // 가는 중이면 이 기기 시계로 끝나는 시각, 멈춤이면 0
  timerLeft: 0,        // 멈춤일 때 남은 ms

  init() {
    const q = new URLSearchParams(location.search);
    this.local = q.get('live') === 'local' || !(LIVE.url && LIVE.key);
    const join = q.get('join');
    if (join != null || document.documentElement.dataset.live === 'student') {
      this.startStudent(/^\d{6}$/.test(join || '') ? join : '');
      return;
    }
    // 실시간은 공명의 핵심 기능이라 툴바에 섞지 않고 오른쪽 아래에 따로 띄운다
    this.fab = Toolbar.btn('live', '실시간', () => (this.role ? this.showPanel(true) : this.startTeacher()), { 'data-no-ink': '' });
    this.fab.classList.add('ch-live-fab');
    document.body.append(this.fab);
    this.syncFab();
    on('nav', () => this.onNav());
    on('ink-dirty', () => this.inkDirty());
    on('session', () => { this.inkEp++; this.sendState(); });   // 반을 바꿨다: 학생은 받아 둔 판서를 버리고 새로 받는다
    on('board-mode', () => this.sendState());   // 칠판을 열고 닫거나 칠판 쪽·바탕을 바꾸면 학생 화면도 맞춘다
    on('pop-timer', () => { this.sendState(); this.renderTally(); });   // 툴바 타이머를 띄우거나 멈추면 학생 화면의 남은 시간도 맞춘다
    on('pop-timer-moved', () => this.renderTally());
    on('features', () => this.onFeatures());
    // 점검(D)·인쇄는 단계 막대를 잠깐 모두 연다. 그 상태가 학생에게 가거나 연 범위로 남지 않게 한다.
    on('print-before', () => { this.frozen = true; });
    on('print-after', () => { this.frozen = false; this.sendState(); });
    Stage.deck.addEventListener('ch-stepper', (e) => {
      if (this.role !== 'teacher' || /^(audit|print)$/.test((e.detail && e.detail.src) || '')) return;
      this.track();
      this.sendState();
    });
  },

  link() { return this.local ? LocalLink : SupaLink; },
  every(fn, ms) { this.timers.push(setInterval(fn, ms)); },
  stop() { for (const t of this.timers) clearInterval(t); this.timers = []; },

  // 장 안에서 학생이 움직이는 슬라이더(엔진의 단계 막대·연표 막대는 빼고)와 그 키
  ranges(i) {
    const s = Stage.slides[i];
    return s ? qsa('input[type="range"]', s).filter((el) => !el.closest(LIVE_SKIP)) : [];
  },
  keyOf(el, i) { return el.id || el.getAttribute('name') || `r${this.ranges(i).indexOf(el)}`; },
  // ponytail: 한 장에 같은 name이 둘이면(계산 상자 둘) 앞의 것으로만 모인다. 따로 모으려면 id를 붙인다.
  rangeOf(i, key) { return this.ranges(i).find((el) => this.keyOf(el, i) === key) || null; },
  // 장 안의 퀴즈·투표·단답: 키는 id, 없으면 장 안 순서(q0, p0, s0…)
  quizzes(i) { return Quiz.list.filter((q) => q.slide === Stage.slides[i]); },
  polls(i) { return Poll.list.filter((q) => q.slide === Stage.slides[i]); },
  shorts(i) { return Short.list.filter((q) => q.slide === Stage.slides[i]); },
  partsOf(i, kind) { return kind === 'q' ? this.quizzes(i) : kind === 'p' ? this.polls(i) : this.shorts(i); },
  partKey(item, i, kind) { return item.box.id || `${kind}${this.partsOf(i, kind).indexOf(item)}`; },
  // 학생 보기에 쓸 물음: 상자 안 첫 글, 없으면 바로 앞 문단, 그것도 없으면 장 제목
  askOf(box) {
    const prev = box.previousElementSibling;
    const el = box.querySelector('p:not(.ch-fb), h3, h4') || (prev && prev.matches('p, h3, h4') ? prev : null);
    const slide = box.closest('section.slide');
    return ((el && (el.innerText || el.textContent)) || (slide && slide.dataset.title) || '').replace(/\s+/g, ' ').trim();   // innerText: <br> 자리를 띄어 쓴다
  },
  partOf(i, key, kind) { return this.partsOf(i, kind).find((it) => this.partKey(it, i, kind) === key) || null; },

  // ---- 교사 ----
  async startTeacher() {
    if (this.role) return;
    this.role = 'teacher';
    this.tid = LiveCore.sid();   // 이 수업(방)의 표시. 학생은 처음 받은 tid의 상태·끝만 믿는다.
    const run = {};   // 이 시작의 표시: 연결하는 사이에 끝내고 다시 시작하면 옛 시작은 아무것도 붙이지 않는다
    this.run = run;
    const alive = () => this.run === run;
    this.showPanel(true);
    this.say('연결하는 중…');
    let main = null;
    try {
      for (let tries = 0; !main && alive(); tries++) {
        if (tries >= 5) throw new Error('코드를 만들지 못했어요');
        const code = LiveCore.code();
        // 이미 쓰는 코드인지: 그 방 교사에게 '새 학생'처럼 인사하면 2초 안에 상태가 온다
        let taken = false;
        const cand = await this.link().open(`ch-live-${code}`, (ev) => { if (ev === 'state') taken = true; }, true);
        const probe = await this.link().open(`ch-live-${code}-in`, () => {}, false);
        probe.send('hi', { sid: LiveCore.sid() });
        await new Promise((r) => setTimeout(r, LIVE_JOIN_MS + 200));
        probe.close();
        if (taken || !alive()) cand.close();
        else { main = cand; this.code = code; }
      }
      if (!alive()) { if (main) main.close(); return; }   // 연결하는 사이에 끝냈다
      const inbox = await this.link().open(`ch-live-${this.code}-in`, (ev, p) => this.onInbox(ev, p), true);
      if (!alive()) { main.close(); inbox.close(); return; }
      this.main = main;
      this.inbox = inbox;
    } catch (err) {
      console.error('[exploragram] live', err);
      if (main) main.close();
      if (!alive()) return;
      this.run = null;
      this.code = '';
      this.role = null;
      this.renderPanel();
      this.say('연결 안 됨 · 수업은 그대로 돼요');
      return;
    }
    this.reach = [];
    this.lastSlide = Nav.state.slide;
    this.every(() => { this.sendState(); this.renderCount(); }, LIVE_STATE_MS);
    this.sendState();
    this.renderPanel();
  },

  // 교사가 연 범위를 지금 화면으로 넓힌다. 보내기를 미뤄도 지나간 장이 빠지지 않게 넘길 때마다 부른다.
  track() {
    const { slide, shown } = Nav.state;
    const steps = (Stepper.bySlide[slide] || []).map((st) => st.pos);
    if (!this.frozen) this.reach = LiveCore.reach(this.reach, Stage.slides.length, slide, shown, steps);
    return steps;
  },

  stateNow() {
    const { slide, shown } = Nav.state;
    const steps = this.track();
    const s = {
      tid: this.tid, slide, shown, steps, reach: this.reach,
      lesson: { key: Session.deck, n: Stage.slides.length, title: document.title.slice(0, 120) },
      site: this.siteName(),
      timer: PopTimer.wire(),
    };
    const cur = this.inkLive() && this.inkCur();
    if (cur) {
      const rec = this.inkRec.get(cur.arr);
      s.ink = { ep: this.inkEp, pg: cur.pg, rev: rec && rec.pg === cur.pg ? rec.rev : 0 };
      const d = Session.doc;
      s.board = Board.active ? { i: d.board, n: d.boards.length, bg: d.boards[d.board].bg } : null;
    }
    return s;
  },

  // 배포 사이트(또는 이 PC의 미리보기)의 …/lessons/이름.html이면 그 이름. 사이트 첫 화면이 학생을 이 수업으로 보낸다.
  siteName() {
    const m = /\/lessons\/([\w-]{1,60})\.html$/.exec(location.pathname);
    const ours = (LIVE.site && location.href.startsWith(LIVE.site)) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    return /^https?:$/.test(location.protocol) && ours && m ? m[1] : null;
  },

  // 상태 하나가 학생 수만큼 퍼지므로(무료 한도는 프로젝트 전체 초당 100개) gap에 한 번만 보내고, 미룬 것은 그때의 상태로 보낸다.
  // 더 이른 요청(넘기기)이 오면 늦은 예약(새 학생)을 앞당긴다.
  sendState(gap) {
    if (this.role !== 'teacher' || !this.main || this.frozen) return;
    const now = Date.now();
    const due = this.sentAt + (gap || LIVE_SEND_MS);
    if (due > now) {
      if (!this.stateTimer || due < this.stateDue) {
        clearTimeout(this.stateTimer);
        this.stateDue = due;
        this.stateTimer = setTimeout(() => { this.stateTimer = 0; this.sendState(); }, due - now);
      }
      return;
    }
    clearTimeout(this.stateTimer);
    this.stateTimer = 0;
    this.sentAt = now;
    if (this.inkLive()) this.inkFlush();   // 판서를 먼저 보내야 상태에 적힌 판 번호가 학생에게 있는 판과 맞는다
    this.main.send('state', this.stateNow());
  },

  // ---- 실시간 판서(교사) ----
  inkLive() { return this.role === 'teacher' && !!this.main && !this.frozen && Settings.enabled('liveInk'); },
  inkGap() { return clamp(this.count() * LIVE_INK_PER, LIVE_INK_MIN, LIVE_INK_MAX); },

  inkId(s) {
    if (!this.inkIds.has(s)) this.inkIds.set(s, this.inkNext++);
    return this.inkIds.get(s);
  },

  // 교사가 지금 보는 쪽: 이름(pg), 획 배열(arr), 보낼 획(쓰는 중인 획 포함)
  inkCur() {
    const ref = Ink.ref;
    const arr = Ink.page;
    if (!ref || !arr) return null;
    let pg;
    if (ref.kind === 'board') pg = `b${ref.index}`;
    else {
      const i = Stage.slides.findIndex((s) => s.dataset.key === ref.key);
      if (i < 0) return null;
      pg = `s${i}`;
    }
    const strokes = arr.slice();
    const g = Ink.gesture;
    if (g && g.stroke && g.page === arr) strokes.push(g.stroke);
    return { pg, arr, strokes };
  },

  // 판서가 바뀌었다: 잠깐 모아서 보낸다
  inkDirty() {
    if (!this.inkLive() || this.inkTimer) return;
    const now = Date.now();
    const at = Math.max(now + LIVE_INK_FIRST, this.inkSentAt + this.inkGap());
    this.inkTimer = setTimeout(() => { this.inkTimer = 0; this.inkFlush(); }, at - now);
  },

  // 지금 쪽을 보낸다. 처음 보내는 쪽이나 다시 달라는 학생이 있으면 쪽 전체(LIVE_JOIN_MS에 한 번), 아니면 바뀐 것만.
  inkFlush() {
    clearTimeout(this.inkTimer);
    this.inkTimer = 0;
    if (!this.inkLive()) return;
    const cur = this.inkCur();
    if (!cur) return;
    const now = Date.now();
    const list = cur.strokes.map((s) => ({ id: this.inkId(s), s }));
    let rec = this.inkRec.get(cur.arr);
    if (rec && rec.pg !== cur.pg) rec = null;   // 칠판을 지워 번호가 당겨진 쪽
    if (!rec && !list.length) {   // 처음 보는 빈 쪽은 판 0: 학생이 모르는 쪽도 빈 판 0으로 보므로 보낼 것이 없다
      rec = { pg: cur.pg, rev: 0, sent: new Map() };
      this.inkRec.set(cur.arr, rec);
    }
    if (!rec || (this.inkWanted && now - this.inkSnapAt >= LIVE_JOIN_MS)) {
      const { r, body } = this.inkFit((step) => LiveCore.inkSnap(list, step), (x) => ({ snap: x.snap }));
      rec = { pg: cur.pg, rev: ++this.inkSeq, sent: r.sent };
      this.inkRec.set(cur.arr, rec);
      this.inkSnapAt = now;
      this.inkWanted = false;
      this.inkSend(cur.pg, rec.rev, body);
    } else {
      const { r, body } = this.inkFit((step) => LiveCore.inkDelta(list, rec.sent, step), (x) => {
        const b = { base: rec.rev };
        if (x.put.length) b.put = x.put;
        if (x.more.length) b.more = x.more;
        if (x.del.length) b.del = x.del;
        return b;
      });
      if (r.put.length || r.more.length || r.del.length) {
        rec.rev = ++this.inkSeq;
        rec.sent = r.sent;
        this.inkSend(cur.pg, rec.rev, body);
      }
    }
    if (this.inkWanted) this.inkTimer = setTimeout(() => { this.inkTimer = 0; this.inkFlush(); }, Math.max(0, this.inkSnapAt + LIVE_JOIN_MS - now));
  },

  // 메시지가 너무 크면(획이 아주 많은 쪽) 점을 성기게 해서 다시 만든다
  inkFit(make, pick) {
    let r;
    let body;
    for (const step of [1, 2, 4, 8, 16]) {
      r = make(step);
      body = pick(r);
      if (JSON.stringify(body).length <= LIVE_INK_BYTES) break;
    }
    return { r, body };
  },

  inkSend(pg, rev, body) {
    this.main.send('ink', Object.assign({ tid: this.tid, ep: this.inkEp, pg, rev }, body));
    this.inkSentAt = Date.now();
  },

  // ⚙ 설정에서 기능을 켜고 껐다
  onFeatures() {
    if (this.role !== 'teacher') return;
    if (!Settings.enabled('live')) { this.endTeacher(); return; }
    this.sendState();   // 「학생 화면에 판서 보이기」를 켜고 끄면 학생 화면도 바로 맞춘다
  },

  onNav() {
    if (this.role !== 'teacher') return;
    if (Nav.state.slide !== this.lastSlide) { this.lastSlide = Nav.state.slide; this.peek = null; }
    this.track();
    this.sendState();
    this.renderDist();
    this.renderCount();
  },

  onInbox(event, raw) {
    const p = LiveCore.clean(event, raw, Stage.slides.length);
    if (!p || !p.sid) return;
    const fresh = !this.seen.has(p.sid);
    if (fresh && this.prune() >= LIVE_MAX) return;   // 코드를 아는 누군가가 가짜 학생을 쏟아내도 메모리가 무한히 늘지 않게
    this.seen.set(p.sid, Date.now());
    if (fresh) this.sendState(LIVE_JOIN_MS);   // 새로 들어온 학생이 다음 상태(5초)를 기다리지 않게
    if (event === 'need') {
      // 이미 최신 판을 가진 학생(상태가 엇갈려 온 것)이면 다시 보내지 않는다
      const cur = this.inkLive() && this.inkCur();
      const rec = cur && this.inkRec.get(cur.arr);
      if (cur && p.pg === cur.pg && !(rec && rec.pg === cur.pg && rec.rev === p.have)) {
        this.inkWanted = true;
        this.inkDirty();
      }
    }
    if (event === 'val') {
      const input = this.rangeOf(p.slide, p.key);
      if (input) {
        const v = clamp(p.v, Number(input.min || 0), Number(input.max || 100));
        const key = `${p.slide}|${p.key}`;
        if (!this.vals.has(key)) this.vals.set(key, new Map());
        this.vals.get(key).set(p.sid, v);
        if (p.slide === Nav.state.slide) this.renderDist();
      }
    }
    if (event === 'pick' || event === 'text') {
      const kind = event === 'pick' ? 'q' : 's';
      const poll = kind === 'q' && !this.partOf(p.slide, p.key, 'q') ? this.partOf(p.slide, p.key, 'p') : null;   // 투표도 pick으로 온다(한 학생 한 표)
      const item = poll || this.partOf(p.slide, p.key, kind);
      if (item) {
        const key = `${p.slide}|${p.key}`;
        const store = kind === 'q' ? this.picks : this.texts;
        if (!store.has(key)) store.set(key, new Map());
        if (poll) store.get(key).set(p.sid, p.c.filter((c) => c < poll.names.length).slice(0, 1));
        else if (kind === 'q') store.get(key).set(p.sid, p.c.filter((c) => c < item.opts.length));
        else {
          const old = store.get(key).get(p.sid);
          if (!old || old.t !== p.t) this.hidden.delete(`${key}|${p.sid}`);   // 고쳐 보낸 답은 다시 보인다
          store.get(key).set(p.sid, { t: p.t, at: old ? old.at : Date.now() });
        }
        if (p.slide === Nav.state.slide) this.renderDist();
      }
    }
    this.renderCount();
  },

  // 오래 소식이 없는 학생(창을 닫음, 새로 고침 전 sid, 가짜 sid)은 분포에서도 지운다. 남은 수를 돌려준다.
  prune() {
    const now = Date.now();
    for (const [sid, t] of this.seen) {
      if (now - t <= LIVE_FORGET_MS) continue;
      this.seen.delete(sid);
      for (const store of [this.vals, this.picks, this.texts]) for (const m of store.values()) m.delete(sid);
    }
    return this.seen.size;
  },

  // 참여 인원: 최근 LIVE_GONE_MS 안에 소식이 온 학생
  count() {
    this.prune();
    const now = Date.now();
    let n = 0;
    for (const t of this.seen.values()) if (now - t <= LIVE_GONE_MS) n++;
    return n;
  },

  // 지금 장의 응답 현황 { n: 답한 학생, of: 접속 학생, word }. 학생이 답하는 활동이 없는 장이면 null.
  // 퀴즈·투표·단답이 있으면 '제출', 슬라이더만 있으면 '참여'(값을 바꾼 학생)로 쓴다.
  tally() {
    const i = Nav.state.slide;
    const answer = [...this.quizzes(i).map((it) => [this.picks, this.partKey(it, i, 'q')]),
      ...this.polls(i).map((it) => [this.picks, this.partKey(it, i, 'p')]),
      ...this.shorts(i).map((it) => [this.texts, this.partKey(it, i, 's')])];
    const parts = [...answer, ...this.ranges(i).map((el) => [this.vals, this.keyOf(el, i)])];
    if (!parts.length) return null;
    const of = this.count();
    const now = Date.now();
    const n = LiveCore.answered(parts.map(([store, key]) => store.get(`${i}|${key}`)), (sid) => now - (this.seen.get(sid) || 0) <= LIVE_GONE_MS);
    return { n, of, word: answer.length ? '제출' : '참여' };
  },

  tallyText(t) { return t.of > 0 && t.n === t.of ? `접속 ${t.of}명 모두 ${t.word}` : `접속 ${t.of}명 중 ${t.n}명 ${t.word}`; },

  // 교사 화면 오른쪽 위: 응답을 받는 장에서만 보인다. 누르면 「학생 보기」를 연다(실시간 창이 열려 있으면 그 창에 같은 줄이 있다).
  renderTally() {
    const t = this.role === 'teacher' && this.main ? this.tally() : null;
    if (!this.tallyEl) {
      if (!t) return;
      this.tallyEl = h('button', {
        type: 'button', class: 'ch-live-tally ch-live-ui', 'data-no-ink': '', hidden: true,
        onclick: (e) => { this.toggleDist(true); e.currentTarget.blur(); },
      });
      document.body.append(this.tallyEl);
    }
    const el = this.tallyEl;
    el.hidden = !t || (!!this.panel && !this.panel.hidden);
    if (el.hidden) return;
    // 툴바 타이머와 겹치면(좁은 화면, 옮긴 타이머) 타이머 아래로 내린다
    el.style.top = '';
    if (PopTimer.shown()) {
      const p = PopTimer.el.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (r.left < p.right && r.right > p.left && r.top < p.bottom && r.bottom > p.top) el.style.top = `${Math.round(p.bottom + 8)}px`;
    }
    const text = this.tallyText(t);
    if (el.textContent === text) return;   // 학생 값이 몰려 와도 글이 같으면 그대로 둔다
    el.textContent = text;
    el.classList.toggle('is-all', t.of > 0 && t.n === t.of);
    el.setAttribute('aria-label', `${text}. 학생 보기 열기`);
  },

  showPanel(open) {
    if (!this.panel) this.buildPanel();
    this.panel.hidden = !open;
    if (open) this.renderPanel();
    else this.renderTally();
  },

  buildPanel() {
    const btn = (text, fn, cls, label) => h('button', {
      type: 'button', class: cls, text, 'aria-label': label, onclick: (e) => { fn(); e.currentTarget.blur(); },
    });
    this.ui = {
      status: h('p', { class: 'ch-live-status', role: 'status', 'aria-live': 'polite' }),
      code: h('b', { class: 'ch-live-code' }),
      qr: h('div', { class: 'ch-live-qr' }),
      how: h('p', { class: 'ch-live-how' }),
      count: h('p', { class: 'ch-live-count' }),
      distBtn: btn('학생 보기', () => this.toggleDist(), 'ch-live-dist-btn'),
      fileBtn: btn('학생용 파일 저장', () => this.saveStudentFile()),
      endBtn: btn('끝내기', () => this.endTeacher()),
    };
    const U = this.ui;
    this.panel = h('aside', { class: 'ch-live ch-live-ui', 'data-no-ink': '', 'aria-label': '실시간 수업', hidden: true },
      h('div', { class: 'ch-live-head' }, h('h2', { text: '실시간 수업' }), btn('×', () => this.showPanel(false), 'ch-live-x', '창 닫기(수업은 계속)')),
      U.status, U.code, U.qr, U.how, U.count, Settings.row('liveInk'),
      h('div', { class: 'ch-live-btns' }, U.distBtn, U.fileBtn, U.endBtn));
    Settings.sync(this.panel);
    document.body.append(this.panel);
  },

  say(text) { if (this.ui) this.ui.status.textContent = text; },

  // 켜져 있는 동안은 단추 이름과 색으로 수업 중임을 알린다
  syncFab() {
    if (!this.fab) return;
    const on = this.role === 'teacher';
    this.fab.classList.toggle('is-on', on);
    this.fab.querySelector('span').textContent = on ? '실시간 켜짐' : '실시간';
    this.fab.title = on ? '실시간 수업 중: 실시간 창 열기' : '실시간 수업 시작';
    this.fab.setAttribute('aria-label', this.fab.title);
  },

  renderPanel() {
    this.syncFab();
    if (!this.ui) return;
    const U = this.ui;
    const on = this.role === 'teacher' && !!this.main;
    const http = /^https?:$/.test(location.protocol);
    U.code.textContent = on ? `${this.code.slice(0, 3)} ${this.code.slice(3)}` : '';
    for (const b of [U.distBtn, U.fileBtn, U.endBtn]) b.disabled = !on;
    U.distBtn.setAttribute('aria-pressed', String(this.distOn));
    if (on) this.say(this.local ? '같은 PC 시험용 · 서버 설정 전' : '연결됨 · 저장 안 함, 이름 안 받음');
    const site = this.siteName();
    U.how.textContent = !on ? ''
      : site && LIVE.site ? `학생: QR을 찍거나 ${LIVE.site.replace(/^https?:\/\//, '')} 에서 코드 입력`
        : http ? '학생: QR을 찍어 들어와요'
          : '「학생용 파일 저장」으로 받은 파일을 웨일 클래스에 올리면, 학생은 그 파일을 열고 코드를 넣어요';
    U.qr.replaceChildren();
    if (on && http) {
      const local = new URLSearchParams(location.search).get('live') === 'local' ? '&live=local' : '';
      this.drawQr(`${location.origin}${location.pathname}?join=${this.code}${local}`);
    }
    this.renderCount();
  },

  async drawQr(url) {
    const code = this.code;
    try {
      const img = await qrImage(url);
      if (this.code !== code) return;   // 불러오는 사이에 끝냈거나 새 코드가 생겼다
      this.ui.qr.replaceChildren(img);
    } catch (err) {
      if (this.code === code) this.ui.qr.replaceChildren(h('small', { text: url }));   // QR을 못 그리면 주소라도
    }
  },

  renderCount() {
    if (this.ui) {
      const t = this.role === 'teacher' && this.main ? this.tally() : null;
      this.ui.count.textContent = this.role === 'teacher' && this.main ? (t ? this.tallyText(t) : `접속 ${this.count()}명`) : '';
    }
    this.renderTally();
  },

  toggleDist(force) {
    this.distOn = force != null ? !!force : !this.distOn;
    if (!this.dist) {
      this.dist = h('div', { class: 'ch-live-dist ch-live-ui', 'data-no-ink': '', role: 'region', 'aria-label': '학생 값', hidden: true });
      document.body.append(this.dist);
      // 누르는 도중에 막대를 다시 만들면 click이 사라진다. 누른 손가락을 뗀 뒤에 다시 그린다.
      // 칠판에서 pointerup이 빠지는 일이 있어 1초가 지나면 그냥 푼다.
      const release = (e) => {
        if (this.distHold == null || (e && e.pointerId !== this.distHold)) return;
        this.distHold = null;
        clearTimeout(this.distHoldTimer);
        if (this.distLate) { this.distLate = false; setTimeout(() => this.renderDist(), 0); }
      };
      this.dist.addEventListener('pointerdown', (e) => {
        this.distHold = e.pointerId;
        clearTimeout(this.distHoldTimer);
        this.distHoldTimer = setTimeout(() => release(null), 1000);
      });
      window.addEventListener('pointerup', release, true);
      window.addEventListener('pointercancel', release, true);
    }
    if (this.ui) this.ui.distBtn.setAttribute('aria-pressed', String(this.distOn));
    this.renderDist();
  },

  // 값이 몰려 와도 한 번에 그린다. requestAnimationFrame은 창이 가려지면 멈추므로 타이머로 묶는다.
  renderDist() {
    if (!this.dist || this.distRaf) return;
    this.distRaf = setTimeout(() => {
      this.distRaf = 0;
      if (this.distHold != null) this.distLate = true;
      else this.drawDist();
    }, 50);
  },

  // 지금 장의 슬라이더마다 학생 값 분포. 막대를 누르면 그 값을 교사 익스플로라그램에 넣는다(누가 맞췄는지는 모른다).
  drawDist() {
    const on = this.distOn && this.role === 'teacher';
    this.dist.hidden = !on;
    if (!on) return;
    const i = Nav.state.slide;
    const rows = this.ranges(i).map((input) => {
      const key = this.keyOf(input, i);
      const vals = [...(this.vals.get(`${i}|${key}`) || new Map()).values()];
      const min = Number(input.min || 0);
      const max = Number(input.max || 100);
      const bins = LiveCore.bins(vals, min, max, Number(input.step) || 1);
      const top = Math.max(1, ...bins.map((b) => b.n));
      const peeked = this.peek && this.peek.input === input;
      const bars = bins.map((b) => h('button', {
        type: 'button', class: 'ch-live-bin', disabled: !b.n, style: `--h:${(b.n / top).toFixed(3)}`,
        title: b.n ? `${b.pick} · ${b.n}명` : null, 'aria-label': b.n ? `값 ${b.pick}, ${b.n}명` : '없음',
        'aria-pressed': String(!!peeked && b.n > 0 && Number(input.value) === b.pick),
        onclick: (e) => { this.peekAt(input, b.pick); e.currentTarget.blur(); },
      }));
      return h('div', { class: 'ch-live-row', 'data-key': key },
        h('span', { class: 'ch-live-name', text: input.getAttribute('aria-label') || key }),
        h('div', { class: 'ch-live-bins' }, bars),
        h('span', { class: 'ch-live-n', text: `${vals.length}명` }));
    });
    rows.push(...this.quizzes(i).map((item) => this.quizRow(item, i)), ...this.polls(i).map((item) => this.pollRow(item, i)), ...this.shorts(i).map((item) => this.shortRow(item, i)));
    const slider = this.ranges(i).length > 0;
    const head = h('div', { class: 'ch-live-dhead' },
      h('b', { text: '학생 응답' }),
      h('span', { text: this.peek ? '학생 값을 칠판에 띄우는 중' : slider ? '막대를 누르면 그 값을 칠판 익스플로라그램에 띄워요' : '이름 없이 모아요' }),
      this.peek ? h('button', { type: 'button', class: 'ch-live-back', text: '내 값으로', onclick: () => this.unpeek() }) : null,
      h('button', { type: 'button', class: 'ch-live-x', text: '×', 'aria-label': '학생 보기 닫기', onclick: () => this.toggleDist(false) }));
    const empty = h('p', { class: 'ch-live-empty', text: '이 장에는 학생이 답하는 활동(슬라이더, 퀴즈, 투표, 단답)이 없어요' });
    this.dist.replaceChildren(head, ...(rows.length ? rows : [empty]));
  },

  // 퀴즈: 보기마다 고른 학생 수(여러 개 고르기는 한 학생이 여러 보기에 들어간다). 정답 보기에 ✓.
  quizRow(item, i) {
    const key = this.partKey(item, i, 'q');
    const all = [...(this.picks.get(`${i}|${key}`) || new Map()).values()];
    const n = item.opts.map((_, k) => all.filter((c) => c.includes(k)).length);
    const top = Math.max(1, ...n);
    return h('div', { class: 'ch-live-row ch-live-quiz', 'data-key': key },
      h('span', { class: 'ch-live-name', text: this.askOf(item.box) || '퀴즈' }),
      h('span', { class: 'ch-live-n', text: `${all.length}명` }),
      h('ol', { class: 'ch-live-opts' }, item.opts.map((o, k) => {
        const t = o.querySelector('.ch-opt-t');
        const ok = o.hasAttribute('data-ok');
        return h('li', { class: ok ? 'is-ok' : null, style: `--w:${(n[k] / top).toFixed(3)}` },
          h('b', { text: `${ok ? '✓' : ''}${k + 1}` }),
          h('span', { class: 'ch-live-opt-t', text: (t || o).textContent.trim() }),
          h('i', { 'aria-hidden': 'true' }),
          h('em', { text: `${n[k]}명` }));
      })));
  },

  // 투표: 보기마다 고른 학생 수. 「칠판에 넣기」를 누르면 그 인원이 칠판의 투표에 들어간다(교사가 보일 때를 정한다).
  pollRow(item, i) {
    const key = this.partKey(item, i, 'p');
    const all = [...(this.picks.get(`${i}|${key}`) || new Map()).values()];
    const n = item.names.map((_, k) => all.filter((c) => c.includes(k)).length);
    const top = Math.max(1, ...n);
    return h('div', { class: 'ch-live-row ch-live-quiz ch-live-poll', 'data-key': key },
      h('span', { class: 'ch-live-name', text: this.askOf(item.box) || '투표' }),
      h('span', { class: 'ch-live-n', text: `${all.length}명` }),
      h('ol', { class: 'ch-live-opts' }, item.names.map((name, k) => h('li', { style: `--w:${(n[k] / top).toFixed(3)}` },
        h('b', { text: String(k + 1) }),
        h('span', { class: 'ch-live-opt-t', text: name }),
        h('i', { 'aria-hidden': 'true' }),
        h('em', { text: `${n[k]}명` })))),
      h('button', { type: 'button', class: 'ch-live-back ch-live-put', text: '칠판에 넣기', onclick: (e) => { Poll.set(item, n); e.currentTarget.blur(); } }));
  },

  // 단답: 이름 없이 카드로. 교사는 칠판에 띄우기 곤란한 답을 숨길 수 있다(학생 기기에는 아무 변화 없음).
  shortRow(item, i) {
    const key = this.partKey(item, i, 's');
    const all = [...(this.texts.get(`${i}|${key}`) || new Map()).entries()].sort((a, b) => a[1].at - b[1].at);
    const shown = all.filter(([sid]) => !this.hidden.has(`${i}|${key}|${sid}`));
    const hid = all.length - shown.length;
    return h('div', { class: 'ch-live-row ch-live-short', 'data-key': key },
      h('span', { class: 'ch-live-name', text: this.askOf(item.box) || '단답' }),
      h('span', { class: 'ch-live-n', text: hid ? `${all.length}명 · 숨김 ${hid}` : `${all.length}명` }),
      shown.length ? h('ul', { class: 'ch-live-cards' }, shown.map(([sid, a]) => h('li', null,
        h('span', { text: a.t }),
        h('button', { type: 'button', class: 'ch-live-x', text: '×', 'aria-label': '이 답 숨기기', onclick: () => { this.hidden.add(`${i}|${key}|${sid}`); this.renderDist(); } }))))
        : h('p', { class: 'ch-live-empty', text: all.length ? '모두 숨겼어요' : '아직 보낸 답이 없어요' }));
  },

  peekAt(input, v) {
    if (v == null) return;
    if (this.peek && this.peek.input !== input) this.unpeek();
    if (!this.peek) this.peek = { input, before: input.value };
    this.setRange(input, v);
    this.renderDist();
  },

  unpeek() {
    if (!this.peek) return;
    const { input, before } = this.peek;
    this.peek = null;
    this.setRange(input, before);
    this.renderDist();
  },

  // 익스플로라그램 스크립트·계산 상자는 input 이벤트로 다시 그린다
  setRange(input, v) {
    input.value = String(v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  },

  // 학생용 파일: 원본(그림 포함)에 학생 표시만 붙인다. 판서·편집 흔적은 들어가지 않는다.
  // 엔진을 상대 주소로 부르는 수업(사이트·시험 폴더)이면 학생용 파일은 CDN 엔진을 부르게 바꾼다(웨일 클래스에서 연 파일은 옆에 엔진이 없다).
  studentHtml() {
    const doc = PptFill.buildDoc();
    doc.documentElement.setAttribute('data-live', 'student');
    const cdn = 'https://cdn.jsdelivr.net/gh/N-lifescience/resonance@2/engine/';
    for (const [sel, attr] of [['link[rel~="stylesheet"][href]', 'href'], ['script[src]', 'src']]) {
      for (const el of qsa(sel, doc)) {
        const m = /^(?![a-z]+:|\/\/)(?:[^?#]*\/)?(exploragram\.(?:css|js))(?:[?#].*)?$/i.exec(el.getAttribute(attr));
        if (m) el.setAttribute(attr, cdn + m[1]);
      }
    }
    return PptFill.serialize(doc);
  },

  saveStudentFile() {
    saveText(PptFill.fileName('-학생용'), this.studentHtml(), 'text/html;charset=utf-8');
    this.say('학생용 파일을 내려받았어요. 웨일 클래스에 올려 주세요');
  },

  endTeacher() {
    const links = [this.main, this.inbox];
    if (this.main) this.main.send('end', { tid: this.tid });
    setTimeout(() => { for (const l of links) if (l) l.close(); }, 500);   // 끝 메시지가 나간 뒤에 닫는다
    this.stop();
    this.run = null;
    clearTimeout(this.stateTimer);
    this.stateTimer = 0;
    this.unpeek();
    this.main = null;
    this.inbox = null;
    this.role = null;
    this.code = '';
    this.vals.clear();
    this.picks.clear();
    this.texts.clear();
    this.hidden.clear();
    this.seen.clear();
    this.reach = [];
    clearTimeout(this.inkTimer);
    this.inkTimer = 0;
    this.inkRec = new WeakMap();
    this.inkWanted = false;
    this.toggleDist(false);
    this.renderPanel();
    this.say('끝냈어요. 「실시간」을 다시 누르면 새 코드로 시작해요');
  },

  // ---- 학생 ----
  startStudent(code) {
    this.role = 'student';
    this.sid = LiveCore.sid();
    document.documentElement.classList.add('ch-live-student');
    // 학생 화면은 이 기기의 기능 설정과 상관없다. 판서층에는 이 기기의 판서 대신 교사에게서 받은 판서만 그린다(저장하지 않는다).
    document.documentElement.classList.remove('ch-off-ink', 'ch-off-board', 'ch-off-live');
    Ink.mirror = this.inkMirror();
    emit('live-role');   // 투표는 학생 화면에서 '세기'가 아니라 '고르기'가 된다
    Nav.override = { next: () => this.move(1), prev: () => this.move(-1), close() {} };
    Nav.revealTo = () => false;   // 정답 상자 ✓ 등이 교사보다 먼저 단계를 열지 않게
    // 차례 장의 단추·Exploragram.go도 교사가 연 장으로만
    Nav.go = (index) => {
      const i = Math.round(Number(index));
      if (this.teacher && this.teacher.reach[i]) this.showSlide(i);
    };
    for (const st of Stepper.all) {
      if (st.input) st.input.disabled = true;
      for (const b of st.buttons) b.disabled = true;
    }
    for (const el of qsa('.ch-yearline input', Stage.deck)) el.disabled = true;
    // 넘기기 키만 받는다. 펜·칠판·목차·점검 같은 단축키는 학생 화면에서 쓰지 않는다.
    window.addEventListener('keydown', (e) => {
      if (this.role !== 'student') return;
      const t = e.target;
      if (t && t.closest && t.closest('input, textarea, select')) return;
      if (!LIVE_NAV_KEYS.includes(e.key) || e.ctrlKey || e.metaKey || e.altKey) e.stopImmediatePropagation();
    }, true);
    Stage.deck.addEventListener('input', (e) => this.onInput(e, false));
    Stage.deck.addEventListener('change', (e) => this.onInput(e, true));
    on('quiz-answer', (item, c) => this.sendPart('pick', item, 'q', { c }));
    on('short-answer', (item, t) => this.sendPart('text', item, 's', { t }));
    on('poll-vote', (item, k) => this.sendPart('pick', item, 'p', { c: [k] }));
    this.buildJoin(code);
    this.bar = h('div', { class: 'ch-live-bar ch-live-ui', 'data-no-ink': '', role: 'status', hidden: true });
    document.body.append(this.bar);
    if (code) this.connect(code);
  },

  buildJoin(code) {
    const input = h('input', {
      type: 'text', inputmode: 'numeric', maxlength: '6', autocomplete: 'off', 'aria-label': '방 코드 6자리', placeholder: '000000', value: code || null,
    });
    const msg = h('p', { class: 'ch-live-msg', role: 'status', 'aria-live': 'polite' });
    const form = h('form', { class: 'ch-live-card' },
      h('h2', { text: '실시간 수업 참여' }),
      h('p', { text: '선생님 화면의 코드 6자리를 넣어 주세요' }),
      h('div', { class: 'ch-live-field' }, input, h('button', { type: 'submit', class: 'ch-live-go', text: '들어가기' })),
      msg);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const c = input.value.replace(/\D/g, '');
      if (!/^\d{6}$/.test(c)) { msg.textContent = '코드 6자리를 확인해 주세요'; input.focus(); return; }
      this.connect(c);
    });
    this.join = h('div', { class: 'ch-live-join ch-live-ui', 'data-no-ink': '' }, form);
    this.joinUi = { input, msg, form };
    document.body.append(this.join);
  },

  joinSay(text) { if (this.joinUi) this.joinUi.msg.textContent = text; },

  async connect(code) {
    if (this.teacher) return;
    // 같은 코드로 이미 연결했거나 연결하는 중이면(주소의 ?join으로 들어가는 중에 「들어가기」) 그대로 둔다.
    // 같은 이름의 채널을 두 번 구독하면 Supabase가 오류를 낸다.
    if (code === this.code && (this.main || this.attempt)) return;
    this.disconnect();   // 다른 코드로 다시 들어가는 경우
    const mine = {};
    this.attempt = mine;
    this.code = code;
    this.mismatch = false;
    this.joinSay('연결하는 중…');
    let main = null;
    try {
      main = await this.link().open(`ch-live-${code}`, (ev, p) => this.onMain(ev, p), true);
      const inbox = await this.link().open(`ch-live-${code}-in`, () => {}, false);
      if (this.attempt !== mine) { main.close(); inbox.close(); return; }   // 그사이 다른 코드를 넣었다
      this.attempt = null;
      this.main = main;
      this.inbox = inbox;
    } catch (err) {
      console.error('[exploragram] live', err);
      if (main) main.close();
      if (this.attempt === mine) {
        this.attempt = null;
        this.code = '';
        this.joinSay('인터넷 연결을 확인해 주세요');
      }
      return;
    }
    this.joinSay('선생님을 기다리는 중…');
    this.hi();
    const t0 = Date.now();
    this.every(() => this.hi(), LIVE_HI_MS);
    this.every(() => {
      if (!this.teacher && !this.mismatch && Date.now() - t0 > 10000) this.joinSay('선생님 화면에서 실시간이 켜져 있는지, 코드가 맞는지 확인해 주세요');
      this.renderBar();
    }, 1000);
  },

  disconnect() {
    this.stop();
    for (const t of this.pending.values()) clearTimeout(t);
    this.pending.clear();
    for (const l of [this.main, this.inbox]) if (l) l.close();
    this.main = null;
    this.inbox = null;
    this.attempt = null;
  },

  hi() { if (this.inbox) this.inbox.send('hi', { sid: this.sid }); },

  // 처음 받아들인 교사(tid)의 상태·끝만 믿는다. 코드를 아는 다른 사람이 보낸 가짜 상태·끝은 버린다.
  // ponytail: 채널을 엿들어 tid까지 흉내 내면 막지 못한다. 막으려면 교사 인증(웨일 스페이스 로그인)이 필요하다.
  onMain(event, raw) {
    const p = LiveCore.clean(event, raw, Stage.slides.length);
    if (!p || (this.teacher && p.tid !== this.teacher.tid)) return;
    if (event === 'end') { if (this.teacher) this.ended(); return; }
    if (event === 'ink') { if (this.teacher) this.onInk(p); return; }
    if (event !== 'state') return;
    const same = p.reach.length === Stage.slides.length && p.slide < Stage.slides.length
      && p.lesson.key === Session.deck && p.lesson.n === Stage.slides.length;
    if (!same) {
      if (!this.teacher) {
        this.mismatch = true;
        this.joinSay('다른 수업 파일이에요. 선생님이 올린 파일을 열어 주세요');
      }
      return;
    }
    if (!this.teacher) {
      this.join.hidden = true;
      this.follow = true;
    }
    this.teacher = p;
    this.heard = Date.now();
    this.timerShow(p.timer);
    this.inkState(p);
    // 교사가 학생이 보던 장으로 오면 다시 따라간다
    if (this.follow || p.slide === Nav.state.slide) this.showSlide(p.slide);
    else {
      this.renderBar();
      this.inkShow();
    }
  },

  // 학생 화면에 장 i를 연다. 교사가 있는 장이면 교사의 지금 단계, 지난 장이면 교사가 연 가장 먼 단계까지.
  showSlide(i) {
    const t = this.teacher;
    if (!t) return;
    const r = i === t.slide ? { shown: t.shown, steps: t.steps } : t.reach[i];
    if (!r) return;
    Nav.set({ slide: i, shown: clamp(r.shown, 0, Nav.counts[i] || 0) }, false);
    (Stepper.bySlide[i] || []).forEach((st, k) => { if (r.steps[k] >= 0) st.set(r.steps[k], 'live'); });
    this.follow = i === t.slide;
    this.renderBar();
    this.inkShow();
  },

  move(dir) {
    if (!this.teacher) return;
    const i = LiveCore.step(this.teacher.reach, Nav.state.slide, dir);
    if (i >= 0) this.showSlide(i);
  },

  // 위 띠: 지난 장을 보는 중이면 교사 위치와 「선생님 화면으로」, 교사 소식이 끊기면 기다리는 중.
  // 내용이 같으면 다시 그리지 않는다(누르는 도중에 단추가 바뀌면 눌림이 사라진다).
  renderBar() {
    if (!this.bar) return;
    const t = this.teacher;
    const waiting = !!t && Date.now() - this.heard > LIVE_WAIT_MS;
    const behind = !!t && !this.follow;
    const onBoard = behind && this.inkOn && !!t.board;
    const key = waiting ? 'wait' : onBoard ? 'board' : behind ? `at${t.slide}` : '';
    if (key === this.barKey) return;
    this.barKey = key;
    this.bar.hidden = !key;
    if (!key) return;
    if (waiting) {
      // 교사가 새로 고침하면 코드가 바뀐다. 새 코드를 넣을 길을 둔다.
      this.bar.replaceChildren(h('span', { text: '선생님 연결을 기다리는 중' }),
        h('button', { type: 'button', text: '코드 다시 넣기', onclick: () => this.rejoin() }));
    } else {
      this.bar.replaceChildren(h('span', { text: onBoard ? '선생님은 칠판 화면' : `선생님은 ${t.slide + 1}장` }),
        h('button', { type: 'button', text: '선생님 화면으로', onclick: (e) => { this.showSlide(this.teacher.slide); e.currentTarget.blur(); } }));
    }
  },

  onInput(e, now) {
    const el = e.target;
    if (!this.inbox || !el.matches || !el.matches('input[type="range"]') || el.closest(LIVE_SKIP)) return;
    const slide = Stage.slides.indexOf(el.closest('section.slide'));
    if (slide < 0) return;
    const key = this.keyOf(el, slide);
    const id = `${slide}|${key}`;
    clearTimeout(this.pending.get(id));
    const send = () => {
      this.pending.delete(id);
      if (this.inbox) this.inbox.send('val', { sid: this.sid, slide, key, v: Number(el.value) });
    };
    if (now) send();
    else this.pending.set(id, setTimeout(send, LIVE_VAL_MS));
  },

  sendPart(event, item, kind, data) {
    if (this.role !== 'student' || !this.inbox) return;
    const slide = Stage.slides.indexOf(item.slide);
    if (slide < 0) return;
    this.inbox.send(event, Object.assign({ sid: this.sid, slide, key: this.partKey(item, slide, kind) }, data));
  },

  ended() {
    this.reset();
    this.joinUi.form.replaceChildren(h('h2', { text: '수업이 끝났어요' }), h('p', { text: '선생님이 실시간 수업을 끝냈어요' }),
      h('button', { type: 'button', text: '다른 코드로 들어가기', onclick: () => this.rejoin() }));
  },

  // 연결을 끊고 입장 화면을 다시 띄운다(교사 새로 고침, 다음 수업)
  rejoin() {
    this.reset();
    this.join.remove();
    this.buildJoin('');
    this.joinSay('선생님 화면의 새 코드를 넣어 주세요');
    this.joinUi.input.focus();
  },

  reset() {
    this.disconnect();
    this.teacher = null;
    this.barKey = '';
    this.bar.hidden = true;
    this.join.hidden = false;
    clearTimeout(this.needTimer);
    this.needTimer = 0;
    this.timerShow(null);
    this.inkOn = false;
    this.inkReset(0);
    this.inkShow();
  },

  // 교사 툴바 타이머의 남은 시간(학생 화면 오른쪽 아래). 기기마다 시계가 달라 받은 남은 시간으로 이 기기의 끝 시각을 다시 잡는다.
  // 교사 상태가 올 때마다(5초) 다시 맞춘다.
  timerShow(w) {
    clearInterval(this.timerTick);
    this.timerTick = 0;
    if (!w) { if (this.timerEl) this.timerEl.hidden = true; return; }
    if (!this.timerEl) {
      this.timerEl = h('div', { class: 'ch-live-timer ch-live-ui', 'data-no-ink': '', role: 'timer' }, h('span'), h('b'));
      document.body.append(this.timerEl);
    }
    this.timerEnd = w.run ? Date.now() + w.left : 0;
    this.timerLeft = w.left;
    this.timerEl.hidden = false;
    if (w.run) this.timerTick = setInterval(() => this.timerDraw(), 250);
    this.timerDraw();
  },

  timerDraw() {
    const left = this.timerEnd ? Math.max(0, this.timerEnd - Date.now()) : this.timerLeft;
    const done = left <= 0;
    this.timerEl.firstChild.textContent = done ? '시간' : this.timerEnd ? '남은 시간' : '멈춤';
    this.timerEl.lastChild.textContent = done ? '끝' : Timer.fmt(left / 1000);
    this.timerEl.classList.toggle('is-done', done);
    if (done) { clearInterval(this.timerTick); this.timerTick = 0; }
  },

  // ---- 실시간 판서(학생) ----
  inkMirror() {
    const doc = InkModel.emptyDoc();
    doc.boards = [];   // 교사 칠판 번호대로 받을 때 만든다
    return doc;
  },

  // 반이 바뀌었거나 새 수업: 받아 둔 판서를 모두 버린다
  inkReset(ep) {
    this.inkEp = ep;
    this.inkPages.clear();
    this.inkPlay.clear();
    Ink.mirror = this.inkMirror();
    if (Ink.ref) Ink.redraw();
  },

  inkState(t) {
    this.inkOn = !!t.ink;
    if (!t.ink) return;
    if (t.ink.ep !== this.inkEp) this.inkReset(t.ink.ep);
    this.inkCheck();
  },

  inkHave(pg) {
    const e = this.inkPages.get(pg);
    return e ? e.rev : 0;
  },

  // 교사가 알린 판보다 받아 둔 판이 오래됐으면(묶음을 놓쳤거나 늦게 들어옴) 잠깐 기다렸다가 쪽 전체를 다시 달라고 한다
  inkCheck() {
    const k = this.teacher && this.teacher.ink;
    if (!k || LiveCore.inkFresh(this.inkHave(k.pg), k.rev) || this.needTimer) return;
    this.needTimer = setTimeout(() => {
      this.needTimer = 0;
      const k2 = this.teacher && this.teacher.ink;
      if (!k2 || !this.inbox || LiveCore.inkFresh(this.inkHave(k2.pg), k2.rev)) return;
      if (Date.now() - this.needAt < LIVE_JOIN_MS) { this.inkCheck(); return; }
      this.needAt = Date.now();
      this.inbox.send('need', { sid: this.sid, pg: k2.pg, have: this.inkHave(k2.pg) });
    }, LIVE_NEED_WAIT);
  },

  // 쪽 이름 → 받아 둔 쪽. 획 배열은 Ink.mirror 안의 것이라 판서층이 그대로 그린다.
  inkPage(pg) {
    let e = this.inkPages.get(pg);
    if (e) return e;
    const i = Number(pg.slice(1));
    let arr = null;
    if (pg[0] === 's') {
      const slide = Stage.slides[i];
      if (slide) arr = InkModel.page(Ink.mirror, { kind: 'slide', key: slide.dataset.key });
    } else {
      const boards = Ink.mirror.boards;
      while (boards.length <= i) boards.push({ bg: 'white', strokes: [] });
      arr = boards[i].strokes;
    }
    if (!arr) return null;
    e = { rev: 0, arr, ids: new Map() };
    this.inkPages.set(pg, e);
    return e;
  },

  onInk(p) {
    if (p.ep !== this.inkEp) this.inkReset(p.ep);
    const page = this.inkPage(p.pg);
    if (!page) return;
    const shown = () => Ink.page === page.arr && document.documentElement.classList.contains('ch-live-ink');
    if (p.snap) {
      for (const s of page.arr) this.inkPlay.delete(s);
      page.arr.length = 0;
      page.ids.clear();
      for (const w of p.snap) this.inkAdd(page, w, false);
      page.rev = p.rev;
      if (shown()) Ink.redraw();
      return;
    }
    if (page.rev !== p.base) {   // 앞 묶음을 놓쳤다: 쪽 전체를 다시 받을 때까지 이어 그리지 않는다
      page.rev = -1;
      this.inkCheck();
      return;
    }
    page.rev = p.rev;
    if (p.del.length) {
      for (const id of p.del) {
        const s = page.ids.get(id);
        if (!s) continue;
        page.ids.delete(id);
        this.inkPlay.delete(s);
        const at = page.arr.indexOf(s);
        if (at >= 0) page.arr.splice(at, 1);
      }
      if (shown()) Ink.redraw();
    }
    for (const w of p.put) this.inkAdd(page, w, true);
    for (const [id, pts] of p.more) {
      const s = page.ids.get(id);
      if (s) this.inkQueue(s, LiveCore.inkDec(pts, this.inkLast(s)), page.arr, true);
    }
  },

  inkAdd(page, wire, animate) {
    const [id, t, c, w, pts] = wire;
    const old = page.ids.get(id);
    if (old) {   // 같은 번호가 다시 오면 새것으로 바꾼다
      this.inkPlay.delete(old);
      page.arr.splice(page.arr.indexOf(old), 1);
    }
    const s = { t: t ? 'hl' : 'pen', c, w, p: [] };
    page.arr.push(s);
    page.ids.set(id, s);
    this.inkQueue(s, LiveCore.inkDec(pts, null), page.arr, animate);
  },

  // 획의 마지막 받은 점(아직 그리지 않은 것 포함). 이어 받는 좌표는 여기서 뺀 값이다.
  inkLast(s) {
    const e = this.inkPlay.get(s);
    const a = e && e.q.length ? e.q : s.p;
    return a.length >= 2 ? [a[a.length - 2], a[a.length - 1]] : null;
  },

  // 받은 좌표를 획에 잇는다. animate면 LIVE_INK_PLAY에 걸쳐 조금씩 그린다(가려진 탭은 돌아왔을 때 한 번에).
  inkQueue(s, coords, arr, animate) {
    if (!coords.length) return;
    let e = this.inkPlay.get(s);
    if (!animate && !e) {
      for (const v of coords) s.p.push(v);   // 쪽 전체: 다시 그릴 때 함께 그려진다
      return;
    }
    const now = performance.now();
    if (!e) {
      e = { q: [], arr, until: 0, at: now };
      this.inkPlay.set(s, e);
    }
    for (const v of coords) e.q.push(v);
    e.until = now + LIVE_INK_PLAY;
    if (!this.inkRaf) this.inkRaf = requestAnimationFrame(() => this.inkTick());
  },

  inkTick() {
    this.inkRaf = 0;
    const now = performance.now();
    const shownArr = document.documentElement.classList.contains('ch-live-ink') ? Ink.page : null;
    for (const [s, e] of this.inkPlay) {
      const left = e.q.length / 2;
      const dt = Math.max(1, now - e.at);
      e.at = now;
      // 남은 점을 남은 시간에 고르게 나눈다
      const k = now >= e.until ? left : Math.min(left, Math.max(1, Math.ceil((left * dt) / (e.until - now + dt))));
      const take = e.q.splice(0, k * 2);
      for (let i = 0; i < take.length; i += 2) this.inkDraw(s, take[i], take[i + 1], e.arr === shownArr);
      if (!e.q.length) this.inkPlay.delete(s);
    }
    if (this.inkPlay.size) this.inkRaf = requestAnimationFrame(() => this.inkTick());
  },

  // 획에 점 하나를 더하고, 보이는 쪽이면 새 마디만 그린다(교사 화면의 Ink.extend와 같은 방식)
  inkDraw(s, x, y, shown) {
    const p = s.p;
    if (shown) {
      const ctx = Ink.ctx[s.t === 'hl' ? 'hl' : 'pen'];
      ctx.strokeStyle = s.c;
      ctx.fillStyle = s.c;
      ctx.lineWidth = s.w;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      if (p.length) {
        ctx.moveTo(p[p.length - 2], p[p.length - 1]);
        ctx.lineTo(x, y);
        ctx.stroke();
      } else {
        ctx.arc(x, y, s.w / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    p.push(x, y);
  },

  // 학생 화면에 판서층과 교사 칠판을 맞춘다. 칠판은 교사를 따라가는 중일 때만 보인다.
  inkShow() {
    if (this.role !== 'student') return;
    const t = this.teacher;
    const on = this.inkOn && !!t;
    const root = document.documentElement.classList;
    const was = root.contains('ch-live-ink');
    root.toggle('ch-live-ink', on);
    const b = on && this.follow && t.board ? t.board : null;
    Board.el.hidden = !b;
    document.body.classList.toggle('ch-board-on', !!b);
    if (b) {
      Board.el.dataset.bg = b.bg;
      Board.label.textContent = `칠판 ${b.i + 1} / ${b.n}`;
    }
    Board.setDark(b ? b.bg === 'green' : document.body.dataset.theme === 'chalk');
    if (!on) return;
    const ref = b ? { kind: 'board', index: b.i } : { kind: 'slide', key: Stage.slides[Nav.state.slide].dataset.key };
    if (b) this.inkPage(`b${b.i}`);   // 칠판 쪽 배열을 만든다
    const r = Ink.ref;
    if (!r || r.kind !== ref.kind || r.key !== ref.key || r.index !== ref.index) Ink.setPage(ref);
    else if (!was) Ink.redraw();   // 꺼져 있는 동안 받은 판서는 그리지 않았다
  },
};
