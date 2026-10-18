/* 공통 UI와 자료 연결. 화면 문구는 HTML과 template에서 관리한다. */
(() => {
  'use strict';
  const $ = (s, parent = document) => parent.querySelector(s);
  const $$ = (s, parent = document) => [...parent.querySelectorAll(s)];
  const config = window.GONGMYEONG || {};
  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* 비공개 모드에서도 동작 */ } }
  };
  const httpURL = (value) => {
    try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.href : null; } catch { return null; }
  };
  function localFile(value, extension, fallbackDirectory = '') {
    if (typeof value !== 'string' || !value || !/^[\w./-]+$/.test(value) || value.startsWith('/') || value.split('/').some((s) => s === '..' || s === '.')) return null;
    if (!extension.test(value)) return null;
    return !value.includes('/') && fallbackDirectory ? fallbackDirectory + value : value;
  }
  async function request(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } finally { clearTimeout(timeout); }
  }
  async function getJSON(url) {
    const response = await request(url);
    return response.json();
  }
  function setImage(img, src, alt) {
    img.alt = alt;
    img.addEventListener('error', () => { img.hidden = true; }, { once: true });
    if (src) img.src = src; else img.hidden = true;
  }
  $$('img').forEach((img) => img.addEventListener('error', () => { img.hidden = true; }, { once: true }));

  // 만든 사람: 기본 dialog의 Escape, 포커스 가두기, 복귀 동작을 사용한다.
  const dialog = $('.maker-dialog');
  const maker = $('[data-maker-open]');
  if (dialog && maker) {
    maker.addEventListener('click', () => dialog.showModal());
    $('[data-maker-close]', dialog).addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
    const formURL = httpURL(config.formUrl);
    if (formURL) {
      $('[data-form-link]', dialog).href = formURL;
      $('[data-form-link]', dialog).hidden = false;
      $('[data-form-pending]', dialog).hidden = true;
    }
    const githubURL = httpURL(config.githubUrl);
    if (githubURL) $('[data-github-link]', dialog).href = githubURL;
  }

  // 인트로는 모듈이 준비됐을 때만 엔딩을 잠시 가린다. 실패 시 기본 HTML이 남는다.
  const mount = $('#intro-mount');
  if (mount) {
    const ending = $('#intro-ending');
    let intro = null;
    let watchdog = 0;
    let loadPromise = null;
    let run = 0;
    const finish = () => {
      clearTimeout(watchdog);
      ending.hidden = false;
      mount.hidden = true;
      storage.set('gm-intro-seen', '1');
    };
    function loadIntro() {
      if (window.ResonanceIntro?.mount) return Promise.resolve();
      if (loadPromise) return loadPromise;
      loadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const timeout = setTimeout(() => { script.remove(); reject(new Error('intro timeout')); }, 5000);
        script.src = 'assets/intro/intro.js';
        script.onload = () => { clearTimeout(timeout); resolve(); };
        script.onerror = () => { clearTimeout(timeout); script.remove(); reject(new Error('intro unavailable')); };
        document.head.append(script);
      }).catch((error) => { loadPromise = null; throw error; });
      return loadPromise;
    }
    async function play() {
      if (window.GongmyeongMotion?.paused) { finish(); return; }
      const token = ++run;
      try {
        await loadIntro();
        if (token !== run) return;
        if (!window.ResonanceIntro?.mount) throw new Error('intro missing mount');
        intro?.destroy?.();
        mount.replaceChildren();
        ending.hidden = true;
        mount.hidden = false;
        intro = window.ResonanceIntro.mount(mount, { onEnd: finish });
        watchdog = setTimeout(() => { intro?.skip?.(); finish(); }, 18000);
      } catch {
        if (token !== run) return;
        mount.replaceChildren();
        mount.hidden = true;
        ending.hidden = false;
        storage.set('gm-intro-seen', '1');
      }
    }
    function skip() {
      ++run;
      try { intro?.skip?.(); } finally { finish(); }
    }
    $('[data-intro-replay]').addEventListener('click', play);
    document.addEventListener('gm:join-open', skip);
    document.addEventListener('gm:motion-change', (event) => { if (event.detail.paused) skip(); });
    const query = new URLSearchParams(location.search);
    const isJoining = query.has('join') || location.hash === '#join-h';
    if (!isJoining && storage.get('gm-motion-paused') !== '1' && (query.get('intro') === '1' || !storage.get('gm-intro-seen'))) play();
  }

  // ARIA 탭: 좌우 화살표, Home/End. 탭을 떠나면 영상과 체험을 멈춘다.
  $$('.demo-box').forEach((box) => {
    const tabs = $$('[role="tab"]', box);
    function closeDemo() {
      $('iframe', box)?.remove();
      const cover = $('[data-demo-cover]', box);
      if (cover) cover.hidden = false;
      const controls = $('[data-demo-controls]', box);
      if (controls) controls.hidden = true;
    }
    function activate(tab, focus = false) {
      tabs.forEach((item) => {
        const active = item === tab;
        item.setAttribute('aria-selected', String(active));
        item.tabIndex = active ? 0 : -1;
        document.getElementById(item.getAttribute('aria-controls')).hidden = !active;
      });
      $('video', box)?.pause();
      closeDemo();
      if (focus) tab.focus();
    }
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => activate(tab));
      tab.addEventListener('keydown', (event) => {
        const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
        if (!keys.includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        activate(tabs[next], true);
      });
    });
    const open = $('[data-demo-open]', box);
    open?.addEventListener('click', () => {
      const url = localFile(open.dataset.src, /\.html$/);
      if (!url) return;
      const frame = document.createElement('iframe');
      frame.src = url;
      frame.title = open.dataset.title;
      frame.allow = 'fullscreen';
      frame.setAttribute('allowfullscreen', '');
      // 수업 엔진이 필요로 하는 같은 출처 실행과 저장은 유지한다.
      frame.setAttribute('referrerpolicy', 'same-origin');
      $('[data-demo-view]', box).append(frame);
      $('[data-demo-cover]', box).hidden = true;
      $('[data-demo-controls]', box).hidden = false;
      $('[data-demo-close]', box).focus();
    });
    $('[data-demo-close]', box)?.addEventListener('click', () => { closeDemo(); open.focus(); });
    const view = $('[data-video-view]', box);
    const poster = $('[data-video-poster]', box);
    const image = new Image();
    image.onload = () => { poster.src = image.src; poster.hidden = false; };
    image.src = `${view.dataset.videoBase}-poster.webp`;
    const play = $('[data-video-play]', box);
    let available = [];
    Promise.all(['mp4', 'webm'].map(async (extension) => {
      const url = `${view.dataset.videoBase}.${extension}`;
      try { await request(url, { method: 'HEAD' }); return { url, extension }; } catch { return null; }
    })).then((sources) => {
      available = sources.filter(Boolean);
      if (!available.length) return;
      $('[data-video-status]', box).textContent = view.dataset.ready;
      play.hidden = false;
    });
    play.addEventListener('click', async () => {
      if (!available.length) return;
      let video = $('video', view);
      if (!video) {
        video = document.createElement('video');
        video.controls = true;
        video.muted = true;
        video.playsInline = true;
        video.preload = 'none';
        video.poster = poster.src;
        video.setAttribute('aria-label', box.dataset.videoLabel);
        available.forEach(({ url, extension }) => {
          const source = document.createElement('source');
          source.src = url;
          source.type = `video/${extension}`;
          video.append(source);
        });
        video.addEventListener('error', () => {
          video.remove(); poster.hidden = false;
          $('[data-video-cover]', box).hidden = false;
          $('[data-video-status]', box).textContent = view.dataset.failed;
          play.hidden = true;
        });
        view.append(video);
      }
      poster.hidden = true;
      $('[data-video-cover]', box).hidden = true;
      try { await video.play(); } catch { video.controls = true; }
    });
  });

  // 스크롤 카드: 단추와 키보드 모두 같은 간격으로 이동한다.
  function initRail(section) {
    const rail = $('.rail', section);
    const prev = $('[data-rail-prev]', section);
    const next = $('[data-rail-next]', section);
    if (!rail) return;
    const update = () => {
      if (prev) prev.disabled = rail.scrollLeft <= 2;
      if (next) next.disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2;
    };
    const move = (direction) => {
      const step = rail.firstElementChild?.getBoundingClientRect().width || rail.clientWidth;
      rail.scrollBy({ left: direction * (step + 20), behavior: window.GongmyeongMotion?.paused ? 'instant' : 'smooth' });
    };
    prev?.addEventListener('click', () => move(-1));
    next?.addEventListener('click', () => move(1));
    rail.addEventListener('scroll', update, { passive: true });
    rail.addEventListener('keydown', (event) => {
      if (event.target !== rail) return;
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home' || event.key === 'End') rail.scrollTo({ left: event.key === 'Home' ? 0 : rail.scrollWidth, behavior: 'instant' });
      else move(event.key === 'ArrowRight' ? 1 : -1);
    });
    if (window.ResizeObserver) new ResizeObserver(update).observe(rail);
    new MutationObserver(update).observe(rail, { childList: true });
    update();
  }
  $$('[data-rail-section]').forEach(initRail);

  // 예시 수업: 외부 자료를 HTML 문자열로 삽입하지 않는다.
  const lessonsRail = $('[data-lessons-rail]');
  if (lessonsRail) {
    let lessons = [];
    let level = '';
    let subject = '';
    const status = $('[data-lessons-status]');
    function render() {
      const matches = lessons.filter((lesson) => (!level || lesson.level === level) && (!subject || lesson.subject === subject));
      lessonsRail.replaceChildren();
      matches.forEach((lesson) => {
        const card = $('#lesson-card-template').content.cloneNode(true);
        setImage($('img', card), `assets/lessons/${lesson.slug}.webp`, lesson.title);
        $('[data-card-meta]', card).textContent = [lesson.level, lesson.subject].filter(Boolean).join(' ');
        $('[data-card-title]', card).textContent = lesson.title;
        $('[data-card-question]', card).textContent = typeof lesson.question === 'string' ? lesson.question : '';
        (Array.isArray(lesson.exploragrams) ? lesson.exploragrams : []).filter((tag) => typeof tag === 'string').forEach((text) => {
          const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = text;
          $('[data-card-tags]', card).append(tag);
        });
        if (typeof lesson.model === 'string' && lesson.model) $('[data-card-model]', card).textContent = lesson.model;
        $('[data-card-link]', card).href = `lessons/${lesson.slug}.html`;
        lessonsRail.append(card);
      });
      if (!matches.length) lessonsRail.append($('#lessons-empty-template').content.cloneNode(true));
      status.textContent = matches.length ? status.dataset.count.replace('{n}', String(matches.length)) : '';
      lessonsRail.scrollLeft = 0;
    }
    $('[data-level-filters]').addEventListener('click', (event) => {
      const button = event.target.closest('[data-level]'); if (!button) return;
      level = button.dataset.level;
      $$('[data-level]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      render();
    });
    const subjects = $('[data-subject-filters]');
    subjects.addEventListener('click', (event) => {
      const button = event.target.closest('[data-subject]'); if (!button) return;
      subject = button.dataset.subject;
      $$('[data-subject]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      render();
    });
    getJSON('lessons/meta.json').then((data) => {
      if (!Array.isArray(data)) return;
      const seen = new Set();
      lessons = data.filter((item) => {
        if (!item || !/^[\w-]{1,60}$/.test(item.slug) || typeof item.title !== 'string' || seen.has(item.slug)) return false;
        seen.add(item.slug); return true;
      });
      [...new Set(lessons.map((lesson) => lesson.subject).filter((s) => typeof s === 'string' && s))].forEach((text) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'chip';
        button.dataset.subject = text; button.textContent = text; button.setAttribute('aria-pressed', 'false'); subjects.append(button);
      });
      if (lessons.length) render();
    }).catch(() => { /* 준비 중 HTML 유지 */ });
  }

  const comparisonRail = $('[data-comparison-rail]');
  if (comparisonRail) {
    getJSON('assets/comparison/compare.json').then((data) => {
      if (!Array.isArray(data)) return;
      const records = data.filter((record) => record && ['Gemini', 'ChatGPT', 'Claude'].includes(record.platform));
      if (!records.length) return;
      comparisonRail.replaceChildren();
      records.forEach((record) => {
        const card = $('#comparison-card-template').content.cloneNode(true);
        const text = (value) => typeof value === 'string' ? value : '';
        setImage($('img', card), localFile(record.shot, /\.(?:png|webp|jpg|jpeg)$/, 'assets/comparison/'), text(record.model));
        $('[data-compare-platform]', card).textContent = [record.platform, text(record.date)].filter(Boolean).join(' / ');
        $('[data-compare-model]', card).textContent = text(record.model) || record.platform;
        $('[data-compare-mode]', card).textContent = text(record.mode);
        $('[data-compare-note]', card).textContent = text(record.note);
        const metrics = record.metrics || {};
        $$('[data-metric]', card).forEach((node) => {
          const key = node.dataset.metric;
          const value = metrics[key];
          node.textContent = key === 'engine' ? (value === true ? node.dataset.yes : value === false ? node.dataset.no : '—') : (Number.isFinite(value) && value >= 0 ? `${value}${node.dataset.unit || ''}` : '—');
        });
        const file = localFile(record.file, /\.html$/, 'assets/comparison/');
        if (file) $('[data-compare-link]', card).href = file; else $('[data-compare-link]', card).hidden = true;
        comparisonRail.append(card);
      });
    }).catch(() => { /* 준비 중 HTML 유지 */ });
  }

  // 복사 횟수: 공개 RPC만 사용하며 실패한 숫자 줄은 숨긴다.
  const countLine = $('[data-copy-count]');
  const number = $('[data-copy-number]');
  let counterVersion = 0;
  async function counter(fn) {
    const version = ++counterVersion;
    const cfg = window.EXPLORAGRAM_LIVE || {};
    const base = httpURL(cfg.url);
    if (!countLine || !base || !cfg.key) return;
    try {
      const response = await request(`${base.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: config.counterName || 'copy-prompt' })
      });
      const value = await response.json();
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('invalid counter');
      if (version !== counterVersion) return;
      number.textContent = value.toLocaleString('ko-KR'); countLine.hidden = false;
    } catch { if (version === counterVersion) countLine.hidden = true; }
  }
  if (countLine) counter('get_counter');
  $$('[data-copy]').forEach((button) => {
    let reset = 0;
    const label = $('span', button);
    const original = label.textContent;
    const status = $('[data-copy-status]');
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(document.getElementById(button.dataset.copy).textContent.trim());
        label.textContent = button.dataset.done;
        status.textContent = button.dataset.success;
        counter('bump_counter');
        clearTimeout(reset); reset = setTimeout(() => { label.textContent = original; }, 2400);
      } catch { status.textContent = button.dataset.failed; }
    });
  });
})();
