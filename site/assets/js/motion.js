/* 보이는 기본 화면 위에 얹는 스크롤 전환. GSAP이 없어도 모든 내용은 남는다. */
(() => {
  'use strict';
  const button = document.querySelector('[data-motion-toggle]');
  let paused = false;
  try { paused = localStorage.getItem('gm-motion-paused') === '1'; } catch { /* 저장 차단 */ }
  let context = null;
  let media = null;
  let animations = [];
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  const api = { get paused() { return paused; } };
  window.GongmyeongMotion = api;

  // 단어를 감싸되 공백과 어절 경계는 보존한다.
  document.querySelectorAll('[data-reveal-words]').forEach((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const fragment = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) fragment.append(document.createTextNode(part));
        else { const span = document.createElement('span'); span.className = 'reveal-word'; span.textContent = part; fragment.append(span); }
      });
      node.replaceWith(fragment);
    });
  });
  function finish() {
    media?.revert(); media = null;
    context?.revert(); context = null;
    animations = [];
    document.documentElement.classList.add('motion-paused');
  }
  function start() {
    document.documentElement.classList.remove('motion-paused');
    if (!gsap || !ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);
    const add = (animation) => { animations.push(animation); return animation; };
    try {
      context = gsap.context(() => {
        document.querySelectorAll('[data-reveal-words]').forEach((element) => {
          add(gsap.fromTo(element.querySelectorAll('.reveal-word'), { color: '#A8A49B' }, {
            color: '#141413', stagger: .12, ease: 'none',
            scrollTrigger: { trigger: element, start: 'top 82%', end: 'bottom 48%', scrub: true }
          }));
        });
        document.querySelectorAll('[data-shrink-card]').forEach((element) => {
          add(gsap.fromTo(element, { clipPath: 'inset(0px 0px round 0px)' }, {
            clipPath: 'inset(0px 24px round 24px)', ease: 'none',
            scrollTrigger: { trigger: element, start: 'bottom 88%', end: 'bottom 12%', scrub: true }
          }));
        });
        document.querySelectorAll('[data-expand-card]').forEach((element) => {
          add(gsap.fromTo(element, { scale: .9, borderRadius: 28 }, {
            scale: 1, borderRadius: 0, ease: 'none',
            scrollTrigger: { trigger: element, start: 'top 95%', end: 'top 20%', scrub: true }
          }));
        });
        document.querySelectorAll('[data-sweep]').forEach((element) => {
          add(gsap.fromTo(element, { x: () => innerWidth * .14 }, {
            x: () => -Math.max(element.scrollWidth - innerWidth * .8, innerWidth * .2), ease: 'none',
            scrollTrigger: { trigger: element.parentElement, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true }
          }));
        });
        document.querySelectorAll('[data-draw]').forEach((path) => {
          if (typeof path.getTotalLength !== 'function') return;
          const length = path.getTotalLength();
          add(gsap.fromTo(path, { strokeDasharray: length, strokeDashoffset: length }, {
            strokeDashoffset: 0, ease: 'none',
            scrollTrigger: { trigger: path.closest('.chalk-note') || path, start: 'top 65%', end: 'bottom 40%', scrub: true }
          }));
        });
      });
      media = gsap.matchMedia();
      media.add({ small: '(max-width: 767px)', large: '(min-width: 768px)', wide: '(min-width: 1101px)' }, ({ conditions }) => {
        document.querySelectorAll('[data-pin-scene]').forEach((scene) => {
          const paper = scene.querySelector('[data-ppt-sheet]');
          const board = scene.querySelector('[data-board-screen]');
          if (!paper || !board) return;
          const timeline = add(gsap.timeline({ scrollTrigger: {
            trigger: scene, start: 'top 88px', end: conditions.small ? '+=420' : '+=1200',
            // Tall copy stays in document flow; a pin is only safe if the scene fits.
            pin: scene.offsetHeight <= innerHeight - 112, pinSpacing: true,
            scrub: .6, anticipatePin: 1, invalidateOnRefresh: true
          } }));
          timeline.to(paper, { y: -55, rotationX: 18, rotationZ: -15, duration: .4, ease: 'none' })
            .to(paper, { rotationY: -110, rotationX: 42, scaleX: .22, y: -140, opacity: 0, borderTopRightRadius: 100, duration: .6, ease: 'none' })
            .fromTo(board, { scale: .88, rotationZ: 3 }, { scale: 1, rotationZ: 0, duration: .8, ease: 'none' }, .2);
        });
        // Native sticky remains bounded by its own grid row. No feature pin spacer
        // can carry the demo over the following heading; narrower layouts stack.
        if (conditions.wide) document.querySelectorAll('.feature').forEach((section) => {
          const card = section.querySelector('.demo-box');
          if (card) add(gsap.fromTo(card, { scale: 1 }, {
            scale: .96, ease: 'none',
            scrollTrigger: { trigger: section, start: 'top 55%', end: 'bottom 96px', scrub: true }
          }));
        });
      });
      ScrollTrigger.refresh();
    } catch {
      // A partial plugin failure also exposes complete, readable end states.
      finish();
    }
  }
  function update() {
    if (!button) return;
    button.textContent = paused ? button.dataset.resume : button.dataset.pause;
    button.setAttribute('aria-pressed', String(paused));
  }
  button?.addEventListener('click', () => {
    paused = !paused;
    if (paused) finish(); else start();
    try { localStorage.setItem('gm-motion-paused', paused ? '1' : '0'); } catch { /* 저장 차단 */ }
    update();
    document.dispatchEvent(new CustomEvent('gm:motion-change', { detail: { paused } }));
  });
  if (paused) finish(); else start();
  update();
})();
