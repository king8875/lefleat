(function () {
  'use strict';
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var orb = document.getElementById('mouse-orb');
  // 견적문의 페이지에서는 사용하지 않는다 (CSS로도 숨기지만 rAF 루프까지 막는다)
  if (document.body.dataset.page === 'contact') orb = null;
  if (orb && !reduceMotion && window.matchMedia('(pointer: fine)').matches) {
    var tx = window.innerWidth / 2, ty = window.innerHeight * .4, x = tx, y = ty;
    var isIdle = true;
    var setIdle = function (nextIdle) {
      if (isIdle === nextIdle) return;
      isIdle = nextIdle;
      orb.classList.toggle('is-idle', isIdle);
    };
    orb.classList.add('is-idle');
    window.addEventListener('pointermove', function (event) {
      setIdle(false);
      tx = event.clientX;
      ty = event.clientY;
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', function () { setIdle(true); });
    window.addEventListener('blur', function () { setIdle(true); });
    var moveOrb = function (now) {
      if (isIdle) {
        tx = window.innerWidth * (.5 + Math.sin(now * .00019) * .32 + Math.sin(now * .00047) * .08);
        ty = window.innerHeight * (.48 + Math.cos(now * .00015) * .28 + Math.sin(now * .00039) * .1);
      }
      x += (tx - x) * (isIdle ? .025 : .07);
      y += (ty - y) * (isIdle ? .025 : .07);
      orb.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      requestAnimationFrame(moveOrb);
    };
    requestAnimationFrame(moveOrb);
  }
})();
