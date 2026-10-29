/* 첫 화면: 예시 수업 피드, 수업 미리 보기 창, 기능 영상(스토리). 바깥 자료는 textContent로만 넣는다. */
(() => {
  'use strict';
  const $ = (s, parent = document) => parent.querySelector(s);
  const $$ = (s, parent = document) => [...parent.querySelectorAll(s)];
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // 같은 사이트의 수업 파일만 연다. 끝에 장 번호(#5)는 붙일 수 있다.
  const lessonURL = (value) => (typeof value === 'string' && /^(?:lessons\/[\w-]{1,60}|[\w-]{1,60})\.html(?:#\d{1,3})?$/.test(value) ? value : null);
  // 대화 상자 바깥(배경)을 누르면 닫는다.
  const closeOnBackdrop = (dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });

  /* ── 수업 미리 보기: 1280×720 교실 화면 그대로 띄우고 상자 너비에 맞춰 통째로 줄인다 ── */
  const viewer = $('[data-viewer]');
  const stage = viewer && $('[data-viewer-stage]', viewer);
  const fit = () => stage.style.setProperty('--demo-scale', String(stage.clientWidth / 1280));
  const watch = window.ResizeObserver && stage ? new ResizeObserver(fit) : null;
  function openLesson(lesson) {
    const src = lessonURL(lesson.src);
    if (!viewer || !src) return;
    $('[data-viewer-title]', viewer).textContent = lesson.title;
    $('[data-viewer-meta]', viewer).textContent = lesson.meta || '';
    $('[data-viewer-question]', viewer).textContent = lesson.question || '';
    $('[data-viewer-question]', viewer).hidden = !lesson.question;
    const tags = $('[data-viewer-tags]', viewer);
    tags.replaceChildren(...(lesson.tags || []).map((text) => { const li = document.createElement('li'); li.textContent = text; return li; }));
    tags.hidden = !tags.children.length;
    $('[data-viewer-full]', viewer).href = src;
    const frame = document.createElement('iframe');
    frame.className = 'demo-frame';
    frame.title = `${lesson.title} 수업 미리 보기`;
    frame.allow = 'fullscreen';
    frame.setAttribute('allowfullscreen', '');
    frame.setAttribute('referrerpolicy', 'same-origin');
    frame.src = src;
    stage.replaceChildren(frame);
    viewer.showModal();
    fit();
    watch?.observe(stage);
  }
  if (viewer) {
    $('[data-viewer-close]', viewer).addEventListener('click', () => viewer.close());
    closeOnBackdrop(viewer);
    // 닫으면 수업 화면을 지워 소리·타이머·실시간 연결이 남지 않게 한다.
    viewer.addEventListener('close', () => { watch?.disconnect(); stage.replaceChildren(); });
  }
  $$('[data-open-lesson]').forEach((button) => button.addEventListener('click', () => openLesson({
    src: button.dataset.src, title: button.dataset.title, meta: button.dataset.meta, question: button.dataset.question
  })));

  /* ── 예시 수업 피드 ── */
  const grid = $('[data-lesson-grid]');
  if (grid) {
    const status = $('[data-lessons-status]');
    let lessons = [];
    let level = '';
    const text = (value) => (typeof value === 'string' ? value : '');
    function render() {
      const matches = lessons.filter((lesson) => !level || lesson.level === level);
      grid.replaceChildren(...matches.map((lesson) => {
        const item = $('#lesson-post-template').content.cloneNode(true);
        const img = $('img', item);
        img.addEventListener('error', () => { img.hidden = true; }, { once: true });
        img.src = `assets/lessons/${lesson.slug}.webp`;
        const meta = [text(lesson.level), text(lesson.subject)].filter(Boolean).join(' ');
        $('[data-post-badge]', item).textContent = meta;
        $('[data-post-title]', item).textContent = lesson.title;
        $('[data-post-question]', item).textContent = text(lesson.question);
        const tags = (Array.isArray(lesson.exploragrams) ? lesson.exploragrams : []).filter((tag) => typeof tag === 'string');
        $('button', item).addEventListener('click', () => openLesson({
          src: `lessons/${lesson.slug}.html`, title: lesson.title, meta: Number.isFinite(lesson.slides) ? `${meta}, ${lesson.slides}장` : meta, question: text(lesson.question), tags
        }));
        return item;
      }));
      status.textContent = matches.length ? status.dataset.count.replace('{n}', String(matches.length)) : '';
    }
    $('[data-level-filters]').addEventListener('click', (event) => {
      const button = event.target.closest('[data-level]');
      if (!button) return;
      level = button.dataset.level;
      $$('[data-level]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      render();
    });
    fetch('lessons/meta.json').then((r) => (r.ok ? r.json() : [])).then((data) => {
      if (!Array.isArray(data)) return;
      const seen = new Set();
      lessons = data.filter((item) => {
        if (!item || !/^[\w-]{1,60}$/.test(item.slug) || typeof item.title !== 'string' || seen.has(item.slug)) return false;
        seen.add(item.slug); return true;
      });
      render();
    }).catch(() => { status.textContent = '예시 수업을 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.'; });
  }

  /* ── 기능 영상(스토리): 끝나면 다음 기능으로 넘어간다 ── */
  const story = $('[data-story-viewer]');
  const items = $$('[data-story]');
  if (story && items.length) {
    const video = $('[data-story-video]', story);
    const pause = $('[data-story-pause]', story);
    const bars = items.map(() => document.createElement('span'));
    $('[data-story-progress]', story).replaceChildren(...bars.map((bar) => { const track = document.createElement('span'); track.append(bar); return track; }));
    let index = 0;
    const setPaused = (paused) => {
      pause.setAttribute('aria-pressed', String(paused));
      pause.textContent = paused ? '재생' : '일시 정지';
    };
    function show(next) {
      index = (next + items.length) % items.length;
      const item = items[index].dataset;
      $('[data-story-title]', story).textContent = item.title;
      $('[data-story-text]', story).textContent = item.text;
      $('[data-story-count]', story).textContent = `${index + 1} / ${items.length}`;
      const tryURL = lessonURL(item.try);
      $('[data-story-try]', story).hidden = !tryURL;
      if (tryURL) $('[data-story-try]', story).href = tryURL;
      $('[data-story-more]', story).href = /^explore\.html#[a-z]+$/.test(item.more) ? item.more : 'explore.html';
      bars.forEach((bar, i) => bar.style.setProperty('--p', i < index ? '1' : '0'));
      video.poster = `${item.video}-poster.webp`;
      video.src = `${item.video}.mp4`;
      if (reduced()) { setPaused(true); return; }
      video.play().then(() => setPaused(false)).catch(() => setPaused(true));
    }
    video.addEventListener('timeupdate', () => {
      if (video.duration) bars[index].style.setProperty('--p', String(video.currentTime / video.duration));
    });
    video.addEventListener('ended', () => { if (index < items.length - 1) show(index + 1); else setPaused(true); });
    video.addEventListener('error', () => setPaused(true));
    const toggle = () => { if (video.paused) video.play().then(() => setPaused(false)).catch(() => {}); else { video.pause(); setPaused(true); } };
    pause.addEventListener('click', toggle);
    video.addEventListener('click', toggle);
    $('[data-story-prev]', story).addEventListener('click', () => show(index - 1));
    $('[data-story-next]', story).addEventListener('click', () => show(index + 1));
    $('[data-story-close]', story).addEventListener('click', () => story.close());
    story.addEventListener('keydown', (event) => {
      if (event.target.closest('a,button') && event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); show(index - 1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); show(index + 1); }
    });
    closeOnBackdrop(story);
    story.addEventListener('close', () => { video.pause(); video.removeAttribute('src'); video.load(); });
    items.forEach((button, i) => button.addEventListener('click', () => { story.showModal(); show(i); }));
  }
})();
