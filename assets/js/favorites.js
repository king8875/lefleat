(() => {
  'use strict';

  const KEY = 'leaflet.portfolio.favorites.v1';
  const TTL = 7 * 24 * 60 * 60 * 1000;   // 관심 포트폴리오 보관 기간: 7일
  const LIMIT = 100;

  function read() {
    try {
      const now = Date.now();
      const items = JSON.parse(localStorage.getItem(KEY) || '[]')
        .filter(item => item && item.id && Number(item.expiresAt) > now)
        .slice(0, LIMIT);
      localStorage.setItem(KEY, JSON.stringify(items));
      return items;
    } catch (_) {
      return [];
    }
  }

  function write(items) {
    try { localStorage.setItem(KEY, JSON.stringify(items.slice(0, LIMIT))); } catch (_) {}
    document.dispatchEvent(new CustomEvent('leaflet:favorites-change'));
  }

  function has(id) { return read().some(item => String(item.id) === String(id)); }

  function toggle(item) {
    const items = read();
    const index = items.findIndex(saved => String(saved.id) === String(item.id));
    let active;
    if (index > -1) {
      items.splice(index, 1);
      active = false;
    } else {
      items.unshift({
        id: Number(item.id),
        title: String(item.title || ''),
        category: String(item.category || ''),
        url: String(item.url || ''),
        src: String(item.src || ''),
        expiresAt: Date.now() + TTL
      });
      active = true;
    }
    write(items);
    return active;
  }

  function setButton(button, item) {
    const active = has(item.id);
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.setAttribute('aria-label', `${item.title} 관심 포트폴리오${active ? '에서 제거' : '에 추가'}`);
  }

  function bindButton(button, item) {
    if (!button || button.dataset.favoriteBound) return;
    button.dataset.favoriteBound = '1';
    setButton(button, item);
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      toggle(item);
      setButton(button, item);
    });
    button.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      toggle(item);
      setButton(button, item);
    });
    document.addEventListener('leaflet:favorites-change', () => setButton(button, item));
  }

  function itemNode(item, compact) {
    const row = document.createElement('article');
    row.className = compact ? 'favorite-row favorite-row--compact' : 'favorite-row';
    const link = document.createElement('a');
    link.href = item.url;
    link.className = 'favorite-row__link';
    const image = document.createElement('img');
    image.src = item.src;
    image.alt = item.title;
    image.loading = 'lazy';
    const copy = document.createElement('span');
    copy.className = 'favorite-row__copy';
    const category = document.createElement('em');
    category.textContent = item.category || '포트폴리오';
    const title = document.createElement('strong');
    title.textContent = item.title;
    copy.append(category, title);
    link.append(image, copy);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'favorite-row__remove';
    remove.setAttribute('aria-label', `${item.title} 삭제`);
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      write(read().filter(saved => String(saved.id) !== String(item.id)));
    });
    row.append(link, remove);
    return row;
  }

  function renderHeader() {
    const head = document.getElementById('favoriteHead');
    const count = document.getElementById('favoriteCount');
    const tip = document.getElementById('favoriteEmptyTip');
    const popover = document.getElementById('favoritePopover');
    if (!head || !count || !popover) return;
    const items = read();
    count.textContent = String(items.length);
    count.hidden = items.length === 0;
    head.classList.toggle('has-items', items.length > 0);
    if (tip) tip.hidden = items.length > 0;
    popover.replaceChildren();

    const top = document.createElement('div');
    top.className = 'favorite-popover__head';
    const label = document.createElement('strong');
    label.textContent = '관심 포트폴리오';
    const amount = document.createElement('span');
    amount.textContent = `${items.length}개`;
    top.append(label, amount);
    popover.append(top);

    const list = document.createElement('div');
    list.className = 'favorite-popover__list';
    if (items.length) items.slice(0, 5).forEach(item => list.append(itemNode(item, true)));
    else {
      const empty = document.createElement('p');
      empty.className = 'favorite-popover__empty';
      empty.textContent = '포트폴리오 이미지의 하트를 눌러 관심 작업을 모아보세요.';
      list.append(empty);
    }
    popover.append(list);

    const actions = document.createElement('div');
    actions.className = 'favorite-popover__actions';
    const more = document.createElement('a');
    more.href = '/favorites';
    more.className = 'favorite-more-btn';
    more.textContent = '더보기';
    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'favorite-export-btn';
    send.dataset.favoriteExport = '';
    send.textContent = '이메일로 내보내기';
    send.disabled = items.length === 0;
    actions.append(more, send);
    popover.append(actions);
  }

  function renderPage() {
    const list = document.getElementById('favoritesPageList');
    if (!list) return;
    const items = read();
    list.replaceChildren();
    if (items.length) items.forEach(item => list.append(itemNode(item, false)));
    else {
      const empty = document.createElement('div');
      empty.className = 'favorites-page-empty';
      const title = document.createElement('strong');
      title.textContent = '아직 모아둔 포트폴리오가 없습니다.';
      const text = document.createElement('p');
      text.textContent = '마음에 드는 제작 사례의 하트를 누르면 이곳에 저장됩니다.';
      const link = document.createElement('a');
      link.href = '/portfolio';
      link.textContent = '포트폴리오 보기';
      empty.append(title, text, link);
      list.append(empty);
    }
    document.querySelectorAll('[data-favorite-export]').forEach(button => { button.disabled = items.length === 0; });
  }

  function closePopover() {
    const popover = document.getElementById('favoritePopover');
    const head = document.getElementById('favoriteHead');
    if (popover) popover.hidden = true;
    if (head) head.setAttribute('aria-expanded', 'false');
  }

  function openExport() {
    closePopover();
    if (!read().length) return;
    let modal = document.getElementById('favoriteExportModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'favoriteExportModal';
      modal.className = 'favorite-modal';
      modal.hidden = true;
      modal.innerHTML = '<div class="favorite-modal__backdrop" data-modal-close></div><section class="favorite-modal__panel" role="dialog" aria-modal="true" aria-labelledby="favorite-modal-title"><button type="button" class="favorite-modal__close" data-modal-close aria-label="닫기">×</button><h2 id="favorite-modal-title">이메일로 내보내기</h2><p>선택한 포트폴리오의 카테고리, 제목과 링크를 이메일로 보내드립니다.</p><form><label for="favoriteExportEmail">받을 이메일 주소</label><input id="favoriteExportEmail" name="email" type="email" autocomplete="email" required placeholder="name@example.com"><input name="_hp" type="text" tabindex="-1" autocomplete="off" aria-hidden="true"><label class="favorite-privacy"><input name="privacy" type="checkbox" required><span><strong>[필수] 개인정보 수집·이용 동의</strong><small>수집 항목: 이메일 주소 · 이용 목적: 관심 포트폴리오 목록 발송 및 문의 내역 관리 · 보유 기간: 접수일로부터 1년</small><small>동의를 거부할 수 있으나 이메일 내보내기 기능은 이용할 수 없습니다. <a href="/privacy-policy" target="_blank" rel="noopener">자세히 보기</a></small></span></label><p class="favorite-modal__note" aria-live="polite"></p><button type="submit" class="favorite-export-submit">내보내기</button></form></section>';
      document.body.append(modal);
      modal.querySelectorAll('[data-modal-close]').forEach(button => button.addEventListener('click', () => {
        modal.hidden = true;
        modal.querySelector('.favorite-modal__note').textContent = '';
      }));
      modal.querySelector('form').addEventListener('submit', event => {
        event.preventDefault();
        const form = event.currentTarget;
        const email = form.email.value.trim();
        const note = form.querySelector('.favorite-modal__note');
        const submit = form.querySelector('button[type="submit"]');
        if (!form.reportValidity()) return;
        note.textContent = '전송 중입니다.';
        submit.disabled = true;
        fetch('/api/favorites-export.php', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, items: read().map(item => item.id), privacy: form.privacy.checked, _hp: form._hp.value })
        }).then(response => response.json()).then(result => {
          if (!result.ok) throw new Error(result.error || '전송하지 못했습니다.');
          note.textContent = '이메일 내보내기가 완료되었습니다. 확인 후 창을 닫아주세요.';
          form.reset();
        }).catch(error => { note.textContent = error.message || '잠시 후 다시 시도해주세요.'; })
          .finally(() => { submit.disabled = false; });
      });
    }
    modal.querySelector('.favorite-modal__note').textContent = '';
    modal.hidden = false;
    setTimeout(() => modal.querySelector('input[type="email"]').focus(), 0);
  }

  function clearAll() {
    if (!read().length) return;
    if (!window.confirm('관심 포트폴리오를 모두 지울까요?')) return;
    write([]);
  }

  const api = { read, has, toggle, bindButton, openExport, clearAll };
  window.LeafletFavorites = api;

  document.addEventListener('click', event => {
    const head = event.target.closest('#favoriteHead');
    const popover = document.getElementById('favoritePopover');
    if (head && popover) {
      const opening = popover.hidden;
      popover.hidden = !opening;
      head.setAttribute('aria-expanded', opening ? 'true' : 'false');
      return;
    }
    if (event.target.closest('[data-favorite-export]')) { openExport(); return; }
    if (event.target.closest('[data-favorite-clear]')) { clearAll(); return; }
    if (popover && !popover.hidden && !event.target.closest('.favorite-head-wrap')) closePopover();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closePopover();
      const modal = document.getElementById('favoriteExportModal');
      if (modal) modal.hidden = true;
    }
  });
  document.addEventListener('leaflet:favorites-change', () => { renderHeader(); renderPage(); });
  window.addEventListener('storage', event => { if (event.key === KEY) document.dispatchEvent(new CustomEvent('leaflet:favorites-change')); });
  renderHeader();
  renderPage();
})();
