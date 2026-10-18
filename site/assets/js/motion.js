/* 보이는 기본 화면 위에 얹는 스크롤 효과. GSAP이 없어도 모든 내용은 그대로 보인다. */
(() => {
  'use strict';
  const button = document.querySelector('[data-motion-toggle]');
  let paused = false;
  try { paused = localStorage.getItem('gm-motion-paused') === '1'; } catch { /* 저장 차단 */ }
  let context = null;
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  const api = { get paused() { return paused; } };
  window.GongmyeongMotion = api;

  function finish() {
    context?.revert(); context = null;
    document.documentElement.classList.add('motion-paused');
  }
  function start() {
    document.documentElement.classList.remove('motion-paused');
    if (!gsap || !ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);
    try {
      context = gsap.context(() => {
        // 사진 히어로는 아래로 내릴수록 둥근 카드로 줄어 다음 구역과 경계가 생긴다.
        document.querySelectorAll('[data-shrink-card]').forEach((element) => {
          gsap.fromTo(element, { clipPath: 'inset(0px 0px round 0px)' }, {
            clipPath: 'inset(0px 16px round 24px)', ease: 'none',
            scrollTrigger: { trigger: element, start: 'bottom 90%', end: 'bottom 20%', scrub: true }
          });
        });
        // 구역과 카드는 화면에 들어올 때 한 번만 떠오른다.
        document.querySelectorAll('[data-reveal]').forEach((element) => {
          gsap.from(element, {
            y: 40, opacity: 0, duration: .7, ease: 'power2.out',
            delay: Number(element.dataset.revealDelay) || 0,
            scrollTrigger: { trigger: element, start: 'top 88%', once: true }
          });
        });
      });
      ScrollTrigger.refresh();
    } catch {
      // 일부가 실패해도 끝 상태(모두 보이는 화면)를 둔다.
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
