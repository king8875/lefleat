/* ============================================================
   리플렛마스터 — 견적 구성 페이지 스크립트 (시안)
   - lfleat-list.docx 의 01~10 입력 요소를 상태로 관리
   - 선택이 바뀌면 좌측 미리보기 / 상단 바 / 요약 금액을 즉시 갱신
   - 단가는 시안용 예시값이며 PRICE 상수만 고치면 전체가 따라 움직인다
   ============================================================ */
(function () {
  'use strict';

  var form = document.getElementById('cfgForm');
  if (!form) return;

  /* ----------------------------------------------------------
     단가 정의 (시안용 예시 단가)
     ---------------------------------------------------------- */
  var PRICE = {
    // 수량 구간별 인쇄 단가 (부당, 3단 접지 기준)
    qtyTiers: [
      { min: 10, unit: 3500 },
      { min: 20, unit: 2600 },
      { min: 30, unit: 2100 },
      { min: 100, unit: 900 },
      { min: 500, unit: 370 },
      { min: 2000, unit: 190 },
      { min: 5000, unit: 150 }
    ],
    panelExtra: 150000,  // 5단 초과 1단당 디자인 추가비
    srcFile: 200000,     // 작업 파일 제공
    vatRate: 0.1
  };

  // 판형 정의 : 펼친 사이즈(mm) 와 접었을 때 단수
  var FORMAT = {
    'flat-a5': { label: '단면 낱장 A5', panels: 1, spread: [148, 210], folded: [148, 210], sizeText: '148×210mm' },
    'fold2':   { label: '2단 접지 A4', panels: 2, spread: [297, 210], folded: [148.5, 210], sizeText: '펼침 297×210mm' },
    'fold3':   { label: '3단 접지 A4', panels: 3, spread: [297, 210], folded: [99, 210], sizeText: '펼침 297×210mm' },
    'fold4':   { label: '4단 접지',    panels: 4, spread: [400, 210], folded: [100, 210], sizeText: '펼침 400×210mm' },
    'fold5':   { label: '5단 이상',    panels: 5, spread: [500, 210], folded: [100, 210], sizeText: '펼침 500×210mm' }
  };

  var VIEWS = ['펼친 면 (앞)', '펼친 면 (뒤)', '접었을 때'];
  var view = 0;

  /* ----------------------------------------------------------
     유틸
     ---------------------------------------------------------- */
  function won(n) { return '₩' + Math.round(n).toLocaleString('ko-KR'); }
  function checked(name) { return form.querySelector('input[name="' + name + '"]:checked'); }
  function checkedAll(name) {
    return Array.prototype.slice.call(form.querySelectorAll('input[name="' + name + '"]:checked'));
  }
  function num(v, fallback) { var n = parseFloat(v); return isFinite(n) ? n : fallback; }

  // 영업일 기준 납품일 (주말 제외)
  function addBusinessDays(from, days) {
    var d = new Date(from.getTime()), left = days;
    while (left > 0) {
      d.setDate(d.getDate() + 1);
      var w = d.getDay();
      if (w !== 0 && w !== 6) left--;
    }
    return d;
  }
  function fmtDate(d) {
    var wd = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일(' + wd + ')';
  }

  function unitForQty(qty) {
    var unit = PRICE.qtyTiers[0].unit;
    for (var i = 0; i < PRICE.qtyTiers.length; i++) {
      if (qty >= PRICE.qtyTiers[i].min) unit = PRICE.qtyTiers[i].unit;
    }
    return unit;
  }

  /* ----------------------------------------------------------
     현재 상태 읽기
     ---------------------------------------------------------- */
  function readState() {
    var fEl = checked('format');
    var key = fEl ? fEl.value : 'fold3';
    var fmt = FORMAT[key];
    var panels = fmt.panels;
    var sizeText = fmt.sizeText;

    if (key === 'fold5') {
      panels = Math.min(12, Math.max(5, Math.round(num(document.getElementById('panelCount').value, 5))));
      var custom = (document.getElementById('customSize').value || '').trim();
      sizeText = custom ? '펼침 ' + custom : '펼침 ' + (panels * 100) + '×210mm';
    }

    var qEl = checked('qty');
    var qty = qEl && qEl.value === 'custom'
      ? Math.max(10, Math.round(num(document.getElementById('qtyCustom').value, 10)))
      : num(qEl ? qEl.value : 500, 500);

    var paper = checked('paper');
    var bind = checked('bind');
    var coat = checked('coat');
    var coatSide = checked('coatSide');
    var due = checked('due');
    var srcfile = checked('srcfile');

    return {
      org: checked('org') ? checked('org').value : '',
      formatKey: key,
      formatLabel: fmt.label,
      panels: panels,
      sizeText: sizeText,
      designBase: num(fEl && fEl.dataset.price, 770000),
      qty: qty,
      qtyUnit: unitForQty(qty),
      paper: paper ? paper.value : '',
      paperMult: num(paper && paper.dataset.mult, 1),
      bind: bind ? bind.value : '',
      bindUnit: num(bind && bind.dataset.unit, 0),
      coat: coat ? coat.value : '',
      coatUnit: num(coat && coat.dataset.unit, 0),
      coatSide: coatSide ? coatSide.value : '단면',
      coatSideMult: num(coatSide && coatSide.dataset.mult, 1),
      finish: checkedAll('finish').map(function (el) {
        return { name: el.value, unit: num(el.dataset.unit, 0) };
      }),
      styles: checkedAll('style').map(function (el) { return el.value; }),
      srcfile: srcfile ? srcfile.value : '제공 안 함',
      srcfilePrice: num(srcfile && srcfile.dataset.price, 0),
      due: due ? due.value : '일반',
      dueDays: num(due && due.dataset.days, 10),
      dueRate: num(due && due.dataset.rate, 0)
    };
  }

  /* ----------------------------------------------------------
     금액 계산
     ---------------------------------------------------------- */
  function calc(s) {
    // 단수가 늘어나면 인쇄 면적·판비가 함께 늘어난다 (3단 = 1.0)
    var panelFactor = 0.7 + 0.1 * s.panels;

    var design = s.designBase + (s.panels > 5 ? (s.panels - 5) * PRICE.panelExtra : 0);
    var printing = Math.round(s.qtyUnit * s.paperMult * panelFactor) * s.qty;

    // 접지 마감(4단 이하)에는 제본 공정이 들어가지 않는다
    var bindApplies = s.panels >= 5;
    var binding = bindApplies ? s.bindUnit * s.qty : 0;

    var coating = s.coatUnit * s.coatSideMult * s.qty;

    var finishUnit = s.finish.reduce(function (a, f) { return a + f.unit; }, 0);
    var finishing = finishUnit * s.qty;

    var subtotal = design + printing + binding + coating + finishing + s.srcfilePrice;
    var rush = Math.round(subtotal * s.dueRate);
    var net = subtotal + rush;
    var vat = Math.round(net * PRICE.vatRate);

    return {
      panelFactor: panelFactor,
      bindApplies: bindApplies,
      design: design,
      printing: printing,
      binding: binding,
      coating: coating,
      finishing: finishing,
      srcfile: s.srcfilePrice,
      subtotal: subtotal,
      rush: rush,
      net: net,
      vat: vat,
      total: net + vat
    };
  }

  /* ----------------------------------------------------------
     좌측 미리보기 (판형에 따라 SVG 를 그린다)
     ---------------------------------------------------------- */
  function paperFill(paper) {
    if (paper === '모조지') return '#fbfaf7';
    if (paper === '랑데뷰지') return '#fdfcf8';
    return '#ffffff';
  }

  function svgSpread(s, back) {
    var W = 520, H = 330;
    var sw = s.panels === 1 ? FORMAT['flat-a5'].spread[0] : s.panels * (s.formatKey === 'fold4' || s.panels >= 5 ? 100 : (s.formatKey === 'fold2' ? 148.5 : 99));
    var sh = 210;
    var scale = Math.min((W - 40) / sw, (H - 40) / sh);
    var w = sw * scale, h = sh * scale;
    var x = (W - w) / 2, y = (H - h) / 2;
    var pw = w / s.panels;
    var fill = paperFill(s.paper);
    var out = [];

    out.push('<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + s.formatLabel + ' ' + (back ? '뒷면' : '앞면') + ' 미리보기">');
    out.push('<defs><filter id="pshadow" x="-20%" y="-20%" width="140%" height="150%">' +
      '<feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity=".14"/></filter></defs>');
    out.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="3" fill="' + fill + '" filter="url(#pshadow)"/>');

    for (var i = 0; i < s.panels; i++) {
      var px = x + pw * i;
      // 앞면 첫 패널 = 표지
      var isCover = !back && i === (s.panels > 1 ? s.panels - 1 : 0);
      if (isCover) {
        out.push('<rect x="' + px + '" y="' + y + '" width="' + pw + '" height="' + h + '" fill="#101010" opacity=".92"/>');
        out.push('<rect x="' + (px + pw * 0.16) + '" y="' + (y + h * 0.16) + '" width="' + (pw * 0.5) + '" height="' + (h * 0.035) + '" rx="2" fill="#fff" opacity=".9"/>');
        out.push('<rect x="' + (px + pw * 0.16) + '" y="' + (y + h * 0.26) + '" width="' + (pw * 0.68) + '" height="' + (h * 0.02) + '" rx="2" fill="#fff" opacity=".45"/>');
        out.push('<rect x="' + (px + pw * 0.16) + '" y="' + (y + h * 0.45) + '" width="' + (pw * 0.68) + '" height="' + (h * 0.3) + '" rx="3" fill="#fff" opacity=".18"/>');
      } else {
        // 내지 : 제목 + 본문 라인 + 이미지 박스
        out.push('<rect x="' + (px + pw * 0.14) + '" y="' + (y + h * 0.12) + '" width="' + (pw * 0.46) + '" height="' + (h * 0.028) + '" rx="2" fill="#101010" opacity=".72"/>');
        for (var l = 0; l < 5; l++) {
          var lw = pw * (l % 3 === 2 ? 0.44 : 0.72);
          out.push('<rect x="' + (px + pw * 0.14) + '" y="' + (y + h * (0.2 + l * 0.045)) + '" width="' + lw + '" height="' + (h * 0.014) + '" rx="1.5" fill="#101010" opacity=".18"/>');
        }
        out.push('<rect x="' + (px + pw * 0.14) + '" y="' + (y + h * 0.46) + '" width="' + (pw * 0.72) + '" height="' + (h * 0.2) + '" rx="3" fill="#101010" opacity=".08"/>');
        for (var m = 0; m < 4; m++) {
          out.push('<rect x="' + (px + pw * 0.14) + '" y="' + (y + h * (0.72 + m * 0.045)) + '" width="' + (pw * (m === 3 ? 0.36 : 0.66)) + '" height="' + (h * 0.014) + '" rx="1.5" fill="#101010" opacity=".14"/>');
        }
      }
      // 접지선
      if (i > 0) {
        out.push('<line x1="' + px + '" y1="' + y + '" x2="' + px + '" y2="' + (y + h) + '" stroke="#101010" stroke-opacity=".28" stroke-width="1" stroke-dasharray="5 5"/>');
      }
    }
    out.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="3" fill="none" stroke="#101010" stroke-opacity=".12"/>');
    // 치수 표시
    out.push('<line x1="' + x + '" y1="' + (y + h + 18) + '" x2="' + (x + w) + '" y2="' + (y + h + 18) + '" stroke="#101010" stroke-opacity=".28" stroke-width="1"/>');
    out.push('<text x="' + (x + w / 2) + '" y="' + (y + h + 33) + '" text-anchor="middle" font-size="11" fill="#6b6b70">' + s.panels + '단 · ' + (back ? '뒷면' : '앞면') + '</text>');
    out.push('</svg>');
    return out.join('');
  }

  function svgFolded(s) {
    var W = 520, H = 330;
    var fw = s.panels === 1 ? 148 : (s.formatKey === 'fold2' ? 148.5 : (s.formatKey === 'fold3' ? 99 : 100));
    var fh = 210;
    var scale = Math.min((W - 200) / fw, (H - 70) / fh);
    var w = fw * scale, h = fh * scale;
    var x = (W - w) / 2, y = (H - h) / 2 - 6;
    var fill = paperFill(s.paper);
    var out = [];
    out.push('<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="접었을 때 미리보기">');
    out.push('<defs><filter id="fshadow" x="-30%" y="-20%" width="180%" height="150%">' +
      '<feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000" flood-opacity=".16"/></filter></defs>');
    // 뒤에 겹친 종이 (두께 표현)
    var layers = Math.min(3, Math.max(1, s.panels - 1));
    for (var i = layers; i > 0; i--) {
      out.push('<rect x="' + (x + i * 5) + '" y="' + (y - i * 4) + '" width="' + w + '" height="' + h + '" rx="3" fill="' + fill + '" stroke="#101010" stroke-opacity=".12"/>');
    }
    out.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="3" fill="#101010" opacity=".92" filter="url(#fshadow)"/>');
    out.push('<rect x="' + (x + w * 0.14) + '" y="' + (y + h * 0.14) + '" width="' + (w * 0.52) + '" height="' + (h * 0.035) + '" rx="2" fill="#fff" opacity=".9"/>');
    out.push('<rect x="' + (x + w * 0.14) + '" y="' + (y + h * 0.24) + '" width="' + (w * 0.7) + '" height="' + (h * 0.02) + '" rx="2" fill="#fff" opacity=".45"/>');
    out.push('<rect x="' + (x + w * 0.14) + '" y="' + (y + h * 0.44) + '" width="' + (w * 0.72) + '" height="' + (h * 0.32) + '" rx="3" fill="#fff" opacity=".18"/>');
    if (s.coat) {
      out.push('<text x="' + (x + w / 2) + '" y="' + (y + h + 26) + '" text-anchor="middle" font-size="11" fill="#6b6b70">' + s.coat + ' 코팅 · ' + s.coatSide + '</text>');
    }
    out.push('</svg>');
    return out.join('');
  }

  function renderVisual(s, c) {
    var art = document.getElementById('stageArt');
    art.innerHTML = view === 2 ? svgFolded(s) : svgSpread(s, view === 1);

    document.getElementById('stageSpec').textContent =
      s.formatLabel + ' · ' + s.sizeText + ' · ' + VIEWS[view];

    var caption = view === 2
      ? '접었을 때의 크기와 표지 인상을 확인하세요.'
      : '선택한 판형과 접지 방식이 실시간으로 반영됩니다.';
    document.getElementById('visualCaption').textContent = caption;

    // 닷
    var dots = document.getElementById('galDots');
    if (dots.children.length !== VIEWS.length) {
      dots.innerHTML = '';
      VIEWS.forEach(function (label, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'cfg-dot';
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-label', label);
        b.addEventListener('click', function () { view = i; update(); });
        dots.appendChild(b);
      });
    }
    Array.prototype.forEach.call(dots.children, function (el, i) {
      el.classList.toggle('is-on', i === view);
      el.setAttribute('aria-selected', i === view ? 'true' : 'false');
    });

    // 미리보기 하단 요약
    var eta = fmtDate(addBusinessDays(new Date(), s.dueDays));
    var meta = [
      ['판형', s.formatLabel + ' (' + s.panels + '단)'],
      ['수량', s.qty.toLocaleString('ko-KR') + '부'],
      ['용지', s.paper],
      ['코팅', s.coat + ' / ' + s.coatSide],
      ['후가공', s.finish.length ? s.finish.map(function (f) { return f.name; }).join(', ') : '없음'],
      ['예상 납품', eta]
    ];
    document.getElementById('visualMeta').innerHTML = meta.map(function (m) {
      return '<li><span>' + m[0] + '</span><b>' + m[1] + '</b></li>';
    }).join('');
  }

  /* ----------------------------------------------------------
     요약 / 상단 바 렌더
     ---------------------------------------------------------- */
  function renderSummary(s, c) {
    var eta = fmtDate(addBusinessDays(new Date(), s.dueDays));

    var specs = [
      ['진행 기관', s.org],
      ['판형', s.formatLabel + ' · ' + s.sizeText],
      ['수량', s.qty.toLocaleString('ko-KR') + '부 (부당 ' + s.qtyUnit.toLocaleString('ko-KR') + '원 구간)'],
      ['용지', s.paper],
      ['제본 방식', s.bind + (c.bindApplies ? '' : ' (접지 마감 · 미적용)')],
      ['코팅', s.coat + ' · ' + s.coatSide],
      ['후가공', s.finish.length ? s.finish.map(function (f) { return f.name; }).join(', ') : '없음'],
      ['스타일', s.styles.length ? s.styles.length + '개 선택 (' + s.styles.join(', ') + ')' : '미선택'],
      ['작업 파일', s.srcfile],
      ['납기', s.due + ' · ' + s.dueDays + ' 영업일 · ' + eta + ' 납품 예정']
    ];
    document.getElementById('sumSpecs').innerHTML = specs.map(function (m) {
      return '<dt>' + m[0] + '</dt><dd>' + m[1] + '</dd>';
    }).join('');

    var rows = [
      ['디자인 (' + s.formatLabel + ')', won(c.design)],
      ['인쇄 (' + s.paper + ' · ' + s.qty.toLocaleString('ko-KR') + '부)', won(c.printing)]
    ];
    if (c.binding) rows.push(['제본 (' + s.bind + ')', won(c.binding)]);
    if (c.coating) rows.push(['코팅 (' + s.coat + ' · ' + s.coatSide + ')', won(c.coating)]);
    if (c.finishing) rows.push(['후가공 (' + s.finish.map(function (f) { return f.name; }).join(', ') + ')', won(c.finishing)]);
    if (c.srcfile) rows.push(['작업 파일 제공', won(c.srcfile)]);
    if (c.rush) rows.push([s.due, won(c.rush)]);
    rows.push(['공급가액', won(c.net)]);
    rows.push(['부가세 (10%)', won(c.vat)]);

    var html = rows.map(function (m) {
      return '<dt>' + m[0] + '</dt><dd>' + m[1] + '</dd>';
    }).join('');
    html += '<dt class="is-total">합계 (VAT 포함)</dt><dd class="is-total">' + won(c.total) + '</dd>';
    document.getElementById('sumPrice').innerHTML = html;

    document.getElementById('sumTotal').textContent = won(c.total);
    document.getElementById('navPrice').textContent = won(c.total) + ' (VAT 포함)';
    document.getElementById('mbTotal').textContent = won(c.total);
  }

  /* ----------------------------------------------------------
     항목 간 연동 규칙
     ---------------------------------------------------------- */
  function applyRules(s, c) {
    // 제본 : 접지 마감(4단 이하)에서는 비활성 안내
    var bindSec = document.getElementById('sec-bind');
    document.getElementById('bindAlert').hidden = c.bindApplies;
    Array.prototype.forEach.call(bindSec.querySelectorAll('.cfg-card'), function (card) {
      card.classList.toggle('is-muted', !c.bindApplies);
    });

    // 스타일 : 최소 2개
    var n = s.styles.length;
    document.getElementById('styleCount').textContent = n + '개 선택';
    document.getElementById('styleAlert').hidden = n >= 2;

    // 납기 : 카드마다 예상 납품일 표기
    Array.prototype.forEach.call(form.querySelectorAll('input[name="due"]'), function (el) {
      var slot = el.closest('.cfg-card').querySelector('[data-eta]');
      if (slot) {
        slot.textContent = '예상 납품일 ' + fmtDate(addBusinessDays(new Date(), num(el.dataset.days, 10)));
      }
    });
  }

  /* ----------------------------------------------------------
     갱신 루프
     ---------------------------------------------------------- */
  function update() {
    var s = readState();
    var c = calc(s);
    applyRules(s, c);
    renderVisual(s, c);
    renderSummary(s, c);
  }

  /* ----------------------------------------------------------
     이벤트
     ---------------------------------------------------------- */
  form.addEventListener('change', function (e) {
    // 후가공 '없음' 은 배타 선택
    if (e.target.name === 'finish') {
      var boxes = Array.prototype.slice.call(form.querySelectorAll('input[name="finish"]'));
      var none = boxes.filter(function (b) { return b.value === '없음'; })[0];
      if (e.target.value === '없음' && e.target.checked) {
        boxes.forEach(function (b) { if (b !== none) b.checked = false; });
      } else if (e.target.checked && none) {
        none.checked = false;
      } else if (!boxes.some(function (b) { return b.checked; }) && none) {
        none.checked = true;
      }
    }
    // 직접 입력 라디오를 켜면 입력칸으로 포커스
    if (e.target.name === 'qty' && e.target.value === 'custom') {
      document.getElementById('qtyCustom').focus();
    }
    if (e.target.name === 'format' && e.target.value === 'fold5') {
      document.getElementById('panelCount').focus();
    }
    update();
  });

  form.addEventListener('input', function (e) {
    if (['panelCount', 'customSize', 'qtyCustom'].indexOf(e.target.id) > -1) update();
  });

  document.getElementById('galPrev').addEventListener('click', function () {
    view = (view + VIEWS.length - 1) % VIEWS.length; update();
  });
  document.getElementById('galNext').addEventListener('click', function () {
    view = (view + 1) % VIEWS.length; update();
  });

  // 견적 신청 : 스타일 2개 미선택이면 해당 섹션으로 이동
  document.getElementById('sumSubmit').addEventListener('click', function (e) {
    if (checkedAll('style').length < 2) {
      e.preventDefault();
      document.getElementById('sec-style').scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.getElementById('styleAlert').hidden = false;
    }
  });

  // 구성 링크 복사
  document.getElementById('sumCopy').addEventListener('click', function () {
    var s = readState();
    var q = new URLSearchParams({
      org: s.org, format: s.formatKey, panels: s.panels, qty: s.qty,
      paper: s.paper, bind: s.bind, coat: s.coat, side: s.coatSide,
      finish: s.finish.map(function (f) { return f.name; }).join('|'),
      style: s.styles.join('|'), file: s.srcfile, due: s.due
    }).toString();
    var url = location.origin + location.pathname + '?' + q;
    var btn = this, original = '구성 링크 복사';
    function done(msg) {
      btn.textContent = msg;
      setTimeout(function () { btn.textContent = original; }, 2000);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { done('복사되었습니다'); }, function () { done('복사 실패'); });
    } else {
      done('복사 실패');
    }
  });

  /* ----------------------------------------------------------
     상단 바 : 스크롤하면 그림자
     ---------------------------------------------------------- */
  var nav = document.getElementById('cfgLocalnav');
  addEventListener('scroll', function () {
    nav.classList.toggle('is-scrolled', scrollY > 40);
  }, { passive: true });

  /* ----------------------------------------------------------
     쿼리스트링으로 들어온 구성 복원
     ---------------------------------------------------------- */
  (function restore() {
    var q = new URLSearchParams(location.search);
    if (!q.toString()) return;
    function pick(name, value) {
      if (!value) return;
      var el = form.querySelector('input[name="' + name + '"][value="' + value.replace(/"/g, '') + '"]');
      if (el) el.checked = true;
    }
    pick('org', q.get('org'));
    pick('format', q.get('format'));
    pick('paper', q.get('paper'));
    pick('bind', q.get('bind'));
    pick('coat', q.get('coat'));
    pick('coatSide', q.get('side'));
    pick('srcfile', q.get('file'));
    pick('due', q.get('due'));

    var qty = q.get('qty');
    if (qty) {
      var exact = form.querySelector('input[name="qty"][value="' + qty + '"]');
      if (exact) { exact.checked = true; }
      else {
        form.querySelector('input[name="qty"][value="custom"]').checked = true;
        document.getElementById('qtyCustom').value = qty;
      }
    }
    if (q.get('panels')) document.getElementById('panelCount').value = q.get('panels');

    var finish = (q.get('finish') || '').split('|').filter(Boolean);
    if (finish.length) {
      Array.prototype.forEach.call(form.querySelectorAll('input[name="finish"]'), function (b) {
        b.checked = finish.indexOf(b.value) > -1;
      });
    }
    var styles = (q.get('style') || '').split('|').filter(Boolean);
    Array.prototype.forEach.call(form.querySelectorAll('input[name="style"]'), function (b) {
      b.checked = styles.indexOf(b.value) > -1;
    });
  })();

  update();
})();
