/* 신뢰 배지 슬라이더 — 자동 흐름 + 드래그·터치 조작 (모바일)
   목록을 두 벌 출력해 두고, 절반을 넘으면 되감아 무한 루프처럼 보이게 한다. */
(() => {
  'use strict';
  const box = document.querySelector('.site-trust__inner');
  const list = box && box.querySelector('ul');
  if (!box || !list) return;

  const SPEED = 0.35;                 // px per frame (약 21px/s)
  const RESUME_DELAY = 1200;          // 손 뗀 뒤 자동 재개까지
  const enabled = () => matchMedia('(max-width: 760px)').matches;

  let paused = false, resumeTimer = 0, raf = 0;
  let dragging = false, startX = 0, startScroll = 0, moved = false;

  const half = () => list.scrollWidth / 2;
  const normalize = () => {
    const h = half();
    if (h <= 0) return;
    if (box.scrollLeft >= h) box.scrollLeft -= h;
    else if (box.scrollLeft < 0) box.scrollLeft += h;
  };

  const tick = () => {
    raf = 0;
    if (!enabled()) return;
    if (!paused && !dragging) {
      box.scrollLeft += SPEED;
      normalize();
    }
    raf = requestAnimationFrame(tick);
  };
  const start = () => { if (!raf && enabled()) raf = requestAnimationFrame(tick); };
  const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };

  const pause = () => { paused = true; clearTimeout(resumeTimer); };
  const resume = (delay = RESUME_DELAY) => {
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => { paused = false; }, delay);
  };

  // 포인터 드래그 (마우스·터치 공통)
  box.addEventListener('pointerdown', e => {
    if (!enabled()) return;
    dragging = true; moved = false;
    startX = e.clientX;
    startScroll = box.scrollLeft;
    pause();
    box.classList.add('is-grabbing');
    box.setPointerCapture(e.pointerId);
  });
  box.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 3) moved = true;
    box.scrollLeft = startScroll - dx;
    normalize();
  });
  const endDrag = e => {
    if (!dragging) return;
    dragging = false;
    box.classList.remove('is-grabbing');
    try { box.releasePointerCapture(e.pointerId); } catch (_) {}
    resume();
  };
  box.addEventListener('pointerup', endDrag);
  box.addEventListener('pointercancel', endDrag);
  // 드래그 직후의 클릭은 무시 (링크가 없어도 안전하게)
  box.addEventListener('click', e => { if (moved) { e.preventDefault(); e.stopPropagation(); } }, true);

  // 손가락 스크롤(관성)·마우스 휠에도 자동 흐름을 잠시 멈춘다
  box.addEventListener('touchstart', pause, { passive: true });
  box.addEventListener('touchend', () => resume(), { passive: true });
  box.addEventListener('scroll', () => { if (!dragging) normalize(); }, { passive: true });
  box.addEventListener('mouseenter', pause);
  box.addEventListener('mouseleave', () => resume(200));

  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });
  addEventListener('resize', () => { enabled() ? start() : stop(); });
  start();
})();
