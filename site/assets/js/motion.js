/* 보이는 기본 화면 위에 얹는 스크롤 효과. GSAP이 없어도 모든 내용은 그대로 보인다. */
(() => {
  'use strict';
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  window.GongmyeongMotion = { paused: false };
  try { localStorage.removeItem('gm-motion-paused'); } catch { /* 저장 차단 */ }
  if (!gsap || !ScrollTrigger) return;
  gsap.registerPlugin(ScrollTrigger);
  try {
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
    ScrollTrigger.refresh();
  } catch {
    // 일부가 실패해도 내용은 모두 보이게 둔다.
    ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    gsap.set('[data-reveal]', { clearProps: 'all' });
  }
})();
