/* 검색 오버레이 — cosmos.so 방식 (최근 검색 / 디자인품목 / 최근 조회 / 즉시 결과) */
(() => {
  const bar = document.getElementById('searchBar');
  const input = document.getElementById('searchInput');
  const overlay = document.getElementById('searchOverlay');
  if (!bar || !overlay) return;

  const PLACEHOLDERS = ["검색: '애뉴얼리포트'", "검색: '브로셔'", "검색: '백서 디자인'", "검색: '카탈로그'"];
  let phIdx = 0;
  setInterval(() => { if (document.activeElement !== input) input.placeholder = PLACEHOLDERS[phIdx++ % PLACEHOLDERS.length]; }, 3500);

  const isBlog = location.pathname === '/blog' || location.pathname.startsWith('/blog/');
  const LS_RECENT = isBlog ? 'leaflet.blog.recentKeywords' : 'dw.recentSearches';
  const LS_VIEWED = isBlog ? 'leaflet.blog.recentViewed' : 'dw.viewedItems';
  const LS_COLORS = 'dw.recentColors';
  const load = k => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v.slice(0, 12)));

  const esc = value => {
    const node = document.createElement('span');
    node.textContent = String(value || '');
    return node.innerHTML;
  };
  const mediaUrl = src => !src ? '' : (/^(https?:)?\//.test(src) ? src : (window.LEAFLET_ASSET_BASE||'') + src);

  const icoSearch = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="9" cy="9" r="6.2"/><path d="m13.6 13.6 4 4"/></svg>';

  const POP = window.LEAFLET_POPULAR || { keywords: [], portfolio: [], colors: [], blog: [] };
  // 페이지와 무관하게 키워드 · 컬러 · 포트폴리오 · 블로그 4개 섹션을 모두 노출한다
  // (데이터가 비어 있는 섹션만 자동으로 숨김)
  const SHOW = { colors: true, portfolio: true, blog: true };

  const show = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; };

  function renderRecent() {
    const wrap = document.getElementById('soRecentChips');
    const recent = load(LS_RECENT);
    // 검색 기록이 하나라도 있으면 최근 키워드, 없으면 인기 키워드로 대체
    const usingRecent = recent.length > 0;
    const list = usingRecent ? recent : (POP.keywords || []);
    const title = document.getElementById('soRecentTitle');
    if (title) title.textContent = usingRecent ? '최근 키워드' : '인기 키워드';
    const clearBtn = document.querySelector('.so-clear[data-clear="recent"]');
    if (clearBtn) clearBtn.hidden = !usingRecent;
    show('soRecent', list.length > 0);
    wrap.innerHTML = list.map(q => `<span class="so-chip" data-q="${esc(q)}">${icoSearch}${esc(q)}</span>`).join('');
    wrap.querySelectorAll('.so-chip').forEach(c => c.addEventListener('click', () => runSearch(c.dataset.q)));
  }

  function renderColors() {
    const wrap = document.getElementById('soColorChips');
    if (!SHOW.colors) { show('soColors', false); wrap.innerHTML = ''; return; }
    // 컬러는 개인 기록보다 인기 컬러를 우선 노출 (기록이 없어도 항상 채워지도록)
    const list = (POP.colors && POP.colors.length) ? POP.colors : load(LS_COLORS);
    show('soColors', list.length > 0);
    wrap.innerHTML = list.map(c =>
      `<span class="so-chip so-color" data-c="${esc(c)}"><i style="background:${esc(c)}"></i>${esc(c).toUpperCase()}</span>`).join('');
    wrap.querySelectorAll('.so-chip').forEach(ch => ch.addEventListener('click', () => {
      const c = ch.dataset.c;
      window.dwTrackColor && window.dwTrackColor(c);
      if (window.dwApplyColor) { window.dwApplyColor(c); close(); }
      else location.href = (window.DW_BASE || '') + '/portfolio?color=' + c.slice(1);
    }));
  }

  // 컬러 검색 기록 (masonry/컬러피커에서 호출)
  window.dwTrackColor = hex => {
    const list = load(LS_COLORS).filter(x => x.toLowerCase() !== hex.toLowerCase());
    list.unshift(hex.toLowerCase());
    save(LS_COLORS, list);
  };

  const thumbHtml = v =>
    `<a class="so-thumb" href="${esc(v.url)}">${v.src ? `<img src="${esc(mediaUrl(v.src))}" alt="${esc(v.title)}" loading="lazy" decoding="async">` : '<span class="so-thumb__ph" aria-hidden="true"></span>'}<p>${esc(v.title)}</p></a>`;

  function renderViewed() {
    const wrap = document.getElementById('soViewedThumbs');
    if (!SHOW.portfolio) { show('soViewed', false); wrap.innerHTML = ''; return; }
    const list = POP.portfolio || [];
    show('soViewed', list.length > 0);
    wrap.innerHTML = list.map(thumbHtml).join('');
  }

  function renderBlog() {
    const wrap = document.getElementById('soBlogThumbs');
    if (!wrap) return;
    if (!SHOW.blog) { show('soBlog', false); wrap.innerHTML = ''; return; }
    const list = POP.blog || [];
    show('soBlog', list.length > 0);
    wrap.innerHTML = list.map(thumbHtml).join('');
  }

  function runSearch(q) {
    input.value = q;
    const r = load(LS_RECENT).filter(x => x !== q);
    r.unshift(q); save(LS_RECENT, r);
    renderRecent();
    if (window.faqApplySearch) { window.faqApplySearch(q); close(); }
    else if (isBlog && window.blogApplySearch) { window.blogApplySearch(q); close(); }
    else if (window.dwApplySearch) { window.dwApplySearch(q); close(); }
    // 홈·/spec·/price·/contact 처럼 페이지 자체 검색 핸들러가 없는 곳에서는
    // 아무 반응이 없었다. 포트폴리오로 검색어를 넘겨 결과를 보여준다.
    else { location.href = (window.DW_BASE || '') + '/portfolio?q=' + encodeURIComponent(q); }
  }

  window.dwTrackView = d => {
    const v = load(LS_VIEWED).filter(x => x.id !== d.id);
    v.unshift({ id: d.id, src: d.src, title: d.title, url: d.url || ('/portfolio/' + (d.slug || '')) });
    save(LS_VIEWED, v);
  };

  // 오버레이가 열리면 검색창도 같은 폭으로 넓힌다 (CSS transition으로 부드럽게)
  const wrap = overlay.closest('.header-search') || document.querySelector('.header-search');

  // 패널 뒤 배경 딤. 헤더(z-index:100) 아래·본문 위에 깔아 본문과 겹쳐 읽히지 않게 한다.
  // .site-main 이 스택 컨텍스트를 만들므로 body 직속에 붙인다(모달에서 겪은 문제와 동일).
  let dimEl = null;
  const getDim = () => {
    if (!dimEl) {
      dimEl = document.createElement('div');
      dimEl.className = 'so-dim';
      dimEl.addEventListener('click', () => { input.blur(); close(); });
      document.body.appendChild(dimEl);
    }
    return dimEl;
  };

  let panelTimer = 0;

  // 패널만 여닫는다 (검색창 확장 상태는 그대로 둔다 — 입력 중에 폭이 줄면 산만하다)
  function showPanel() {
    clearTimeout(panelTimer);
    if (overlay.hidden) {
      overlay.hidden = false;
      renderRecent(); renderColors(); renderViewed(); renderBlog();
      void overlay.offsetHeight;   // 리플로우 강제 — rAF 에 의존하면 백그라운드 탭에서 전환이 걸리지 않는다
    }
    overlay.classList.add('open');
    getDim().classList.add('show');
    input.setAttribute('aria-expanded', 'true');
  }
  function hidePanel() {
    if (overlay.hidden) return;
    clearTimeout(panelTimer);
    overlay.classList.remove('open');
    if (dimEl) dimEl.classList.remove('show');
    input.setAttribute('aria-expanded', 'false');
    panelTimer = setTimeout(() => { overlay.hidden = true; }, 220);
  }

  function open() {
    // 이미 입력이 남아 있는 상태로 다시 포커스하면 패널은 접힌 채로 둔다
    if (wrap) wrap.classList.add('is-expanded');
    if (input.value.trim()) return;   // 입력이 남아 있으면 패널은 접힌 채로 둔다
    showPanel();
  }
  function close() {
    hidePanel();
    if (wrap) wrap.classList.remove('is-expanded');
  }

  input.addEventListener('focus', open);
  bar.addEventListener('click', () => input.focus());
  input.addEventListener('input', () => {
    const q = input.value.trim();
    // 입력이 있으면 결과를 가리지 않게 패널을 접고, 다 지우면 다시 펼친다
    if (q) hidePanel(); else showPanel();
    if (window.faqApplySearch) window.faqApplySearch(q);
    else if (isBlog && window.blogApplySearch) window.blogApplySearch(q);
    else if (window.dwApplySearch) window.dwApplySearch(q);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && input.value.trim()) runSearch(input.value.trim());
    if (e.key === 'Escape') { input.blur(); close(); }
  });
  document.addEventListener('click', e => {
    if (!overlay.hidden && !e.target.closest('.header-search')) close();
  });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== input) { e.preventDefault(); input.focus(); }
  });
  document.querySelectorAll('.so-clear').forEach(btn => btn.addEventListener('click', () => {
    const keys = { recent: LS_RECENT, colors: LS_COLORS, viewed: LS_VIEWED };
    localStorage.removeItem(keys[btn.dataset.clear]);
    renderRecent(); renderColors(); renderViewed(); renderBlog();
  }));
})();
