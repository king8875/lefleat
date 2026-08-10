/* 검색창 컬러 피커 — cosmos.so 색상 탐색 방식 (SV 영역 + 휴 슬라이더 + HEX + 검색) */
(() => {
  const btn = document.getElementById('paletteBtn');
  const host = document.querySelector('.header-search');
  if (!btn || !host) return;

  let H = 0, S = 0.86, V = 0.71; // 기본 #B51919 근사
  let pop = null;

  function hsv2rgb(h, s, v) {
    const f = n => {
      const k = (n + h / 60) % 6;
      return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    };
    return [f(5), f(3), f(1)].map(x => Math.round(x * 255));
  }
  const hex = () => '#' + hsv2rgb(H, S, V).map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();

  function build() {
    pop = document.createElement('div');
    pop.className = 'color-pop';
    pop.hidden = true;
    pop.innerHTML =
      '<div class="cp-sv"><span class="cp-sv-thumb"></span></div>' +
      '<div class="cp-hue"><span class="cp-hue-thumb"></span></div>' +
      '<div class="cp-foot">' +
        '<span class="cp-swatch"><i></i><b class="cp-hex"></b></span>' +
        '<button type="button" class="cp-go">검색</button>' +
      '</div>';
    host.appendChild(pop);

    const sv = pop.querySelector('.cp-sv');
    const svThumb = pop.querySelector('.cp-sv-thumb');
    const hue = pop.querySelector('.cp-hue');
    const hueThumb = pop.querySelector('.cp-hue-thumb');

    function paint() {
      sv.style.background =
        'linear-gradient(to top, #000, rgba(0,0,0,0)), ' +
        'linear-gradient(to right, #fff, hsl(' + H + ',100%,50%))';
      svThumb.style.left = (S * 100) + '%';
      svThumb.style.top = ((1 - V) * 100) + '%';
      hueThumb.style.left = (H / 360 * 100) + '%';
      const c = hex();
      pop.querySelector('.cp-swatch i').style.background = c;
      pop.querySelector('.cp-hex').textContent = c;
    }

    function drag(el, onMove) {
      el.addEventListener('pointerdown', e => {
        el.setPointerCapture(e.pointerId);
        onMove(e);
        const mv = ev => onMove(ev);
        const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); };
        el.addEventListener('pointermove', mv);
        el.addEventListener('pointerup', up);
      });
    }
    drag(sv, e => {
      const r = sv.getBoundingClientRect();
      S = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      V = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      paint();
    });
    drag(hue, e => {
      const r = hue.getBoundingClientRect();
      H = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * 360;
      paint();
    });

    pop.querySelector('.cp-go').addEventListener('click', () => {
      const c = hex().slice(1);
      close();
      window.dwTrackColor && window.dwTrackColor('#' + c);
      if (typeof window.dwApplyColor === 'function') window.dwApplyColor('#' + c);
      else location.href = (window.DW_BASE || '') + '/portfolio?color=' + c;
    });
    paint();
  }

  function open() {
    if (!pop) build();
    if (!pop.hidden && pop.classList.contains('open')) return;
    document.getElementById('searchInput')?.blur();
    const ov = document.getElementById('searchOverlay');
    if (ov && !ov.hidden) { ov.classList.remove('open'); ov.hidden = true; }
    pop.hidden = false;
    void pop.offsetWidth; // reflow로 트랜지션 트리거
    pop.classList.add('open');
  }
  function close() {
    if (!pop) return;
    pop.classList.remove('open');
    setTimeout(() => { pop.hidden = true; }, 200);
  }

  btn.addEventListener('click', e => {
    e.stopPropagation();
    (pop && !pop.hidden) ? close() : open();
  });
  document.addEventListener('click', e => {
    if (pop && !pop.hidden && !e.target.closest('.color-pop') && !e.target.closest('.palette-btn')) close();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
})();
