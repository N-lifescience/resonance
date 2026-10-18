// 코드로 교사 상태를 한 번 들은 뒤, 사이트의 예시 수업이면 그 수업으로 보낸다(학생 역할로).
(function () {
  const SUPA = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.min.js';
  const cfg = window.EXPLORAGRAM_LIVE || {};
  const q = new URLSearchParams(location.search);
  const forceLocal = q.get('live') === 'local';
  const local = forceLocal || !(cfg.url && cfg.key);
  const form = document.getElementById('join');
  const input = document.getElementById('code');
  const msg = document.getElementById('msg');
  if (!form || !input || !msg) return;
  let close = null;
  let timer = 0;

  const say = (text, bad) => { msg.textContent = text; msg.classList.toggle('is-bad', !!bad); };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.append(s);
    });
  }

  async function listen(code, onState) {
    const topic = `ch-live-${code}`;
    if (local) {
      const bc = new BroadcastChannel(topic);
      bc.onmessage = (e) => { if (e.data && e.data.event === 'state') onState(e.data.payload); };
      return () => bc.close();
    }
    if (!window.supabase) await loadScript(SUPA);
    const client = window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } });
    const ch = client.channel(topic, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'state' }, (m) => onState(m && m.payload));
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('TIMED_OUT')), 10000);
      ch.subscribe((s) => {
        if (s === 'SUBSCRIBED') { clearTimeout(t); resolve(); }
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') { clearTimeout(t); reject(new Error(s)); }
      });
    });
    return () => client.removeChannel(ch);
  }

  async function join(code) {
    if (close) close();
    clearTimeout(timer);
    say('선생님을 찾는 중… (5초쯤 걸려요)');
    try {
      close = await listen(code, (p) => {
        if (!p || typeof p !== 'object') return;
        clearTimeout(timer);
        if (close) { close(); close = null; }
        if (typeof p.site === 'string' && /^[\w-]{1,60}$/.test(p.site)) {
          location.href = `lessons/${p.site}.html?join=${code}${forceLocal ? '&live=local' : ''}`;
        } else {
          say('이 수업은 선생님이 웨일 클래스에 올린 학생용 파일로 들어가요. 그 파일을 열고 같은 코드를 넣어 주세요.');
        }
      });
    } catch (err) {
      say('연결하지 못했어요. 인터넷 연결을 확인해 주세요.', true);
      return;
    }
    timer = setTimeout(() => say('선생님을 찾지 못했어요. 코드와, 선생님 화면에서 실시간이 켜져 있는지 확인해 주세요.', true), 12000);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = input.value.replace(/\D/g, '');
    if (!/^\d{6}$/.test(code)) { say('코드 6자리를 확인해 주세요.', true); input.focus(); return; }
    join(code);
  });

  const popover = document.getElementById('join-popover');
  const trigger = document.querySelector('[data-join-toggle]');
  const open = () => {
    popover.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    document.dispatchEvent(new Event('gm:join-open'));
    input.focus();
  };
  const shut = () => { popover.hidden = true; trigger.setAttribute('aria-expanded', 'false'); };
  trigger.addEventListener('click', () => { if (popover.hidden) open(); else shut(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !popover.hidden) { shut(); trigger.focus(); } });
  document.addEventListener('click', (e) => { if (!popover.hidden && !popover.contains(e.target) && !trigger.contains(e.target)) shut(); });
  const openFromURL = () => { if (location.hash === '#join-h' || q.has('join')) open(); };
  window.addEventListener('hashchange', openFromURL);
  openFromURL();

  const pre = (q.get('join') || '').replace(/\D/g, '');
  if (/^\d{6}$/.test(pre)) { input.value = pre; join(pre); }
}());
