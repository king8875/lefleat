/* ============================================================
   리플렛마스터 — 견적 구성 페이지 스크립트 (시안)
   - 판형 / 수량 / 용지 / 후가공 / 작업 파일 / 납기 6단계
   - 앞 단계를 고르지 않으면 다음 단계는 잠긴다 (단계형 진행)
   - 단계를 고르면 다음 단계로 부드럽게 스크롤
   - 선택이 바뀌면 좌측 미리보기 / 요약 바 / 요약 금액을 즉시 갱신
   - 단가는 시안용 예시값이며 PRICE 상수와 각 카드의 data-* 만 고치면 된다
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
      { min: 1000, unit: 290 },
      { min: 1500, unit: 230 },
      { min: 2000, unit: 190 }
    ],
    baseDays: 10,        // 일반 납기 (영업일)
    rushPerDay: 0.1,     // 1 영업일 단축당 요율
    rushMaxDays: 3,      // 이 이상 단축은 별도 문의
    vatRate: 0.1
  };

  // 판형 정의 : 접었을 때 단수 / 한 면 폭(mm) / 인쇄 면
  var FORMAT = {
    'flat-1': { label: '단면 낱장 A4', panels: 1, panelW: 297, sizeText: '297×210mm', sides: 1 },
    'flat-2': { label: '양면 낱장 A4', panels: 1, panelW: 297, sizeText: '297×210mm', sides: 2 },
    'fold2':  { label: '2단 접지 A4', panels: 2, panelW: 148.5, sizeText: '펼침 297×210mm', sides: 2 },
    'fold3':  { label: '3단 접지 A4', panels: 3, panelW: 99, sizeText: '펼침 297×210mm', sides: 2 },
    'fold4':  { label: '4단 접지',    panels: 4, panelW: 100, sizeText: '펼침 400×210mm', sides: 2 }
  };

  var view = 0;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* ----------------------------------------------------------
     단계 정의
     ---------------------------------------------------------- */
  var STEPS = [
    { id: 'sec-format', title: '판형',      done: function (s) { return !!s.formatKey; } },
    { id: 'sec-qty',    title: '수량',      done: function (s) { return s.qty >= 10; } },
    { id: 'sec-paper',  title: '용지',      done: function (s) { return !!s.paper; } },
    { id: 'sec-finish', title: '후가공',    done: function (s) { return s.finish.length > 0; } },
    // 작업 파일을 '제공' 으로 고르면 받을 이메일까지 입력해야 넘어간다
    { id: 'sec-file',   title: '작업 파일', done: function (s) { return !!s.srcfile && (s.srcfile !== '제공' || s.emailValid); } },
    // 원하는 날짜를 고르면 유효한 날짜까지 입력해야 넘어간다
    { id: 'sec-due',    title: '납기',      done: function (s) { return !!s.due && (s.due !== '원하는 날짜' || s.dueDateOk); } }
  ];

  var LOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">' +
    '<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>';

  // 각 단계에 잠금 안내 문구를 심어 둔다
  STEPS.forEach(function (step) {
    var sec = document.getElementById(step.id);
    if (!sec) return;
    step.el = sec;
    var lock = document.createElement('p');
    lock.className = 'cfg-sec__lock';
    lock.innerHTML = LOCK_SVG + '<span>이전 단계를 먼저 선택해 주세요.</span>';
    var note = sec.querySelector('.cfg-sec__note');
    if (note) note.insertAdjacentElement('afterend', lock);
    else sec.appendChild(lock);
  });

  var frontier = 0;          // 지금 골라야 하는 단계
  var initialized = false;   // 첫 렌더에서는 스크롤하지 않는다

  /* ----------------------------------------------------------
     유틸
     ---------------------------------------------------------- */
  function won(n) { return '₩' + Math.round(n).toLocaleString('ko-KR'); }
  function checked(name) { return form.querySelector('input[name="' + name + '"]:checked'); }
  function checkedAll(name) {
    return Array.prototype.slice.call(form.querySelectorAll('input[name="' + name + '"]:checked'));
  }
  function num(v, fallback) { var n = parseFloat(v); return isFinite(n) ? n : fallback; }
  function val(el) { return el ? el.value : ''; }
  function today() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }

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
  // 두 날짜 사이의 영업일 수
  function businessDaysBetween(from, to) {
    var d = new Date(from.getTime()), n = 0;
    while (d < to) {
      d.setDate(d.getDate() + 1);
      var w = d.getDay();
      if (w !== 0 && w !== 6) n++;
    }
    return n;
  }
  function fmtDate(d) {
    var wd = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일(' + wd + ')';
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function unitForQty(qty) {
    var unit = 0;
    for (var i = 0; i < PRICE.qtyTiers.length; i++) {
      if (qty >= PRICE.qtyTiers[i].min) unit = PRICE.qtyTiers[i].unit;
    }
    return unit;
  }

  // 희망 수령일을 입력했으면 그날까지 남은 영업일로 단축 일수·요율을 구한다
  function dueFromDate(value) {
    var out = { ok: false, days: PRICE.baseDays, rate: 0, shortened: 0, date: null, tooTight: false };
    if (!value) return out;
    var parts = value.split('-');
    var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    if (isNaN(d.getTime())) return out;
    d.setHours(0, 0, 0, 0);
    if (d <= today()) return out;              // 과거·오늘은 무효

    var avail = businessDaysBetween(today(), d);
    var shortened = Math.max(0, PRICE.baseDays - avail);
    out.date = d;
    out.days = avail;
    out.shortened = shortened;
    out.tooTight = shortened > PRICE.rushMaxDays;
    // 자동 견적 범위를 넘으면 요율을 붙이지 않고 별도 문의로 안내한다
    out.rate = out.tooTight ? 0 : shortened * PRICE.rushPerDay;
    out.ok = !out.tooTight;
    return out;
  }

  /* ----------------------------------------------------------
     현재 상태 읽기 — 아직 고르지 않은 항목은 비워 둔다
     ---------------------------------------------------------- */
  function readState() {
    var fEl = checked('format');
    var key = val(fEl);
    var fmt = FORMAT[key];

    var qEl = checked('qty');
    var qty = qEl ? num(qEl.value, 0) : 0;

    var paper = checked('paper');
    var srcfile = checked('srcfile');
    var dueEl = checked('due');
    var dueName = val(dueEl);
    var custom = dueFromDate(document.getElementById('dueDate').value);

    var dueDays = PRICE.baseDays, dueRate = 0, dueDate = null;
    if (dueName === '원하는 날짜') {
      dueDays = custom.days;
      dueRate = custom.rate;
      dueDate = custom.date;
    } else if (dueEl) {
      dueDays = num(dueEl.dataset.days, PRICE.baseDays);
      dueRate = num(dueEl.dataset.rate, 0);
    }

    var email = (document.getElementById('fileEmail').value || '').trim();

    return {
      formatKey: key,
      formatLabel: fmt ? fmt.label : '',
      panels: fmt ? fmt.panels : 0,
      panelW: fmt ? fmt.panelW : 99,
      sides: fmt ? fmt.sides : 2,
      sizeText: fmt ? fmt.sizeText : '',
      designBase: num(fEl && fEl.dataset.price, 0),
      panelFactor: num(fEl && fEl.dataset.factor, 1),
      qty: qty,
      qtyUnit: unitForQty(qty),
      paper: val(paper),
      paperMult: num(paper && paper.dataset.mult, 1),
      finish: checkedAll('finish').map(function (el) {
        return { name: el.value, unit: num(el.dataset.unit, 0) };
      }),
      srcfile: val(srcfile),
      srcfilePrice: num(srcfile && srcfile.dataset.price, 0),
      email: email,
      emailValid: EMAIL_RE.test(email),
      due: dueName,
      dueDays: dueDays,
      dueRate: dueRate,
      dueDate: dueDate,
      dueCustom: custom,
      dueDateOk: custom.ok
    };
  }

  /* ----------------------------------------------------------
     금액 계산
     ---------------------------------------------------------- */
  function calc(s) {
    var design = s.designBase;
    var printing = Math.round(s.qtyUnit * s.paperMult * s.panelFactor) * s.qty;

    var finishUnit = s.finish.reduce(function (a, f) { return a + f.unit; }, 0);
    var finishing = finishUnit * s.qty;

    var subtotal = design + printing + finishing + s.srcfilePrice;
    var rush = Math.round(subtotal * s.dueRate);
    var net = subtotal + rush;
    var vat = Math.round(net * PRICE.vatRate);

    return {
      design: design,
      printing: printing,
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
     단계 진행 상태
     ---------------------------------------------------------- */
  function readProgress(s, c) {
    var doneFlags = STEPS.map(function (step) { return !!step.done(s, c); });
    var first = doneFlags.indexOf(false);
    return {
      doneFlags: doneFlags,
      frontier: first === -1 ? STEPS.length : first,
      complete: first === -1,
      remaining: STEPS.filter(function (step, i) { return !doneFlags[i]; })
        .map(function (step) { return step.title; })
    };
  }

  // 잠금 : 진행 단계보다 뒤에 있는 섹션은 입력을 막는다
  function applyLocks(p) {
    STEPS.forEach(function (step, i) {
      if (!step.el) return;
      var locked = i > p.frontier;
      step.el.classList.toggle('is-locked', locked);
      step.el.classList.toggle('is-current', i === p.frontier);
      step.el.setAttribute('aria-disabled', locked ? 'true' : 'false');
      Array.prototype.forEach.call(step.el.querySelectorAll('input'), function (el) {
        el.disabled = locked;
      });
    });
  }

  /* ----------------------------------------------------------
     좌측 미리보기
     ---------------------------------------------------------- */
  function viewsFor(s) {
    if (!s.formatKey) return ['앞면'];
    if (s.panels === 1) return s.sides === 1 ? ['앞면'] : ['앞면', '뒷면'];
    return ['펼친 면 (앞)', '펼친 면 (뒤)', '접었을 때'];
  }

  function paperFill(paper) { return paper === '고급지' ? '#fdfcf8' : '#ffffff'; }

  function svgPlaceholder() {
    return '<svg viewBox="0 0 520 330" role="img" aria-label="판형 미선택">' +
      '<rect x="120" y="35" width="280" height="260" rx="6" fill="#fff" stroke="#c4c4c8" stroke-width="1.5" stroke-dasharray="7 6"/>' +
      '<text x="260" y="170" text-anchor="middle" font-size="13" fill="#9a9aa0">판형을 선택하면</text>' +
      '<text x="260" y="192" text-anchor="middle" font-size="13" fill="#9a9aa0">미리보기가 표시됩니다.</text>' +
      '</svg>';
  }

  function svgSpread(s, back) {
    var W = 520, H = 330;
    var sw = s.panels * s.panelW, sh = 210;
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
      var isCover = !back && i === (s.panels > 1 ? s.panels - 1 : 0);
      if (isCover) {
        out.push('<rect x="' + px + '" y="' + y + '" width="' + pw + '" height="' + h + '" fill="#101010" opacity=".92"/>');
        out.push('<rect x="' + (px + pw * 0.16) + '" y="' + (y + h * 0.16) + '" width="' + (pw * 0.5) + '" height="' + (h * 0.035) + '" rx="2" fill="#fff" opacity=".9"/>');
        out.push('<rect x="' + (px + pw * 0.16) + '" y="' + (y + h * 0.26) + '" width="' + (pw * 0.68) + '" height="' + (h * 0.02) + '" rx="2" fill="#fff" opacity=".45"/>');
        out.push('<rect x="' + (px + pw * 0.16) + '" y="' + (y + h * 0.45) + '" width="' + (pw * 0.68) + '" height="' + (h * 0.3) + '" rx="3" fill="#fff" opacity=".18"/>');
      } else {
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
      if (i > 0) {
        out.push('<line x1="' + px + '" y1="' + y + '" x2="' + px + '" y2="' + (y + h) + '" stroke="#101010" stroke-opacity=".28" stroke-width="1" stroke-dasharray="5 5"/>');
      }
    }
    out.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="3" fill="none" stroke="#101010" stroke-opacity=".12"/>');
    out.push('<line x1="' + x + '" y1="' + (y + h + 18) + '" x2="' + (x + w) + '" y2="' + (y + h + 18) + '" stroke="#101010" stroke-opacity=".28" stroke-width="1"/>');
    out.push('<text x="' + (x + w / 2) + '" y="' + (y + h + 33) + '" text-anchor="middle" font-size="11" fill="#6b6b70">' +
      (s.panels > 1 ? s.panels + '단 · ' : '') + (back ? '뒷면' : '앞면') + '</text>');
    out.push('</svg>');
    return out.join('');
  }

  function svgFolded(s) {
    var W = 520, H = 330;
    var fw = s.panelW, fh = 210;
    var scale = Math.min((W - 200) / fw, (H - 70) / fh);
    var w = fw * scale, h = fh * scale;
    var x = (W - w) / 2, y = (H - h) / 2 - 6;
    var fill = paperFill(s.paper);
    var out = [];
    out.push('<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="접었을 때 미리보기">');
    out.push('<defs><filter id="fshadow" x="-30%" y="-20%" width="180%" height="150%">' +
      '<feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000" flood-opacity=".16"/></filter></defs>');
    var layers = Math.min(3, Math.max(1, s.panels - 1));
    for (var i = layers; i > 0; i--) {
      out.push('<rect x="' + (x + i * 5) + '" y="' + (y - i * 4) + '" width="' + w + '" height="' + h + '" rx="3" fill="' + fill + '" stroke="#101010" stroke-opacity=".12"/>');
    }
    out.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="3" fill="#101010" opacity=".92" filter="url(#fshadow)"/>');
    out.push('<rect x="' + (x + w * 0.14) + '" y="' + (y + h * 0.14) + '" width="' + (w * 0.52) + '" height="' + (h * 0.035) + '" rx="2" fill="#fff" opacity=".9"/>');
    out.push('<rect x="' + (x + w * 0.14) + '" y="' + (y + h * 0.24) + '" width="' + (w * 0.7) + '" height="' + (h * 0.02) + '" rx="2" fill="#fff" opacity=".45"/>');
    out.push('<rect x="' + (x + w * 0.14) + '" y="' + (y + h * 0.44) + '" width="' + (w * 0.72) + '" height="' + (h * 0.32) + '" rx="3" fill="#fff" opacity=".18"/>');
    var caption = [s.paper, s.finish.map(function (f) { return f.name; }).filter(function (n) { return n !== '없음'; }).join(', ')]
      .filter(Boolean).join(' · ');
    if (caption) {
      out.push('<text x="' + (x + w / 2) + '" y="' + (y + h + 26) + '" text-anchor="middle" font-size="11" fill="#6b6b70">' + caption + '</text>');
    }
    out.push('</svg>');
    return out.join('');
  }

  function renderVisual(s) {
    var art = document.getElementById('stageArt');
    var views = viewsFor(s);
    if (view >= views.length) view = 0;

    if (!s.formatKey) {
      art.innerHTML = svgPlaceholder();
      document.getElementById('stageSpec').textContent = '판형을 선택해 주세요';
      document.getElementById('visualCaption').textContent = '판형을 선택하면 접지 방식이 실시간으로 반영됩니다.';
    } else {
      var name = views[view];
      art.innerHTML = name === '접었을 때' ? svgFolded(s) : svgSpread(s, view === 1);
      document.getElementById('stageSpec').textContent = s.formatLabel + ' · ' + s.sizeText + ' · ' + name;
      document.getElementById('visualCaption').textContent = name === '접었을 때'
        ? '접었을 때의 크기와 표지 인상을 확인하세요.'
        : '선택한 판형과 접지 방식이 실시간으로 반영됩니다.';
    }

    // 닷 (판형에 따라 개수가 달라진다)
    var dots = document.getElementById('galDots');
    if (dots.dataset.count !== String(views.length)) {
      dots.dataset.count = String(views.length);
      dots.innerHTML = '';
      views.forEach(function (label, i) {
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
    var single = views.length < 2;
    document.getElementById('galPrev').disabled = single;
    document.getElementById('galNext').disabled = single;

    // 미리보기 하단 선택 내역
    var meta = [
      ['판형', s.formatKey ? s.formatLabel : '—'],
      ['수량', s.qty ? s.qty.toLocaleString('ko-KR') + '부' : '—'],
      ['용지', s.paper || '—'],
      ['후가공', s.finish.length ? s.finish.map(function (f) { return f.name; }).join(', ') : '—'],
      ['작업 파일', s.srcfile || '—'],
      ['예상 납품', etaText(s) || '—']
    ];
    document.getElementById('visualMeta').innerHTML = meta.map(function (m) {
      return '<li><span>' + m[0] + '</span><b>' + m[1] + '</b></li>';
    }).join('');
  }

  // 예상 납품일 문구
  function etaText(s) {
    if (!s.due) return '';
    if (s.due === '원하는 날짜') {
      return s.dueCustom.date ? fmtDate(s.dueCustom.date) : '';
    }
    return fmtDate(addBusinessDays(today(), s.dueDays));
  }

  /* ----------------------------------------------------------
     요약 렌더
     ---------------------------------------------------------- */
  function specRows(s) {
    var dash = '미선택';
    var due = dash;
    if (s.due === '원하는 날짜') {
      due = s.dueCustom.date
        ? '원하는 날짜 · ' + fmtDate(s.dueCustom.date) + ' 수령' +
          (s.dueCustom.shortened ? ' · ' + s.dueCustom.shortened + " 영업일 단축 (+" + Math.round(s.dueRate * 100) + '%)' : ' · 일반 일정')
        : '원하는 날짜 · 날짜 미입력';
    } else if (s.due) {
      due = s.due + ' · ' + s.dueDays + ' 영업일 · ' + fmtDate(addBusinessDays(today(), s.dueDays)) + ' 납품 예정';
    }
    return [
      ['판형', s.formatKey ? s.formatLabel + ' · ' + s.sizeText : dash],
      ['수량', s.qty ? s.qty.toLocaleString('ko-KR') + '부 (부당 ' + s.qtyUnit.toLocaleString('ko-KR') + '원 구간)' : dash],
      ['용지', s.paper || dash],
      ['후가공', s.finish.length ? s.finish.map(function (f) { return f.name; }).join(', ') : dash],
      ['작업 파일', s.srcfile ? (s.srcfile === '제공' ? '제공' + (s.email ? ' · ' + s.email : '') : s.srcfile) : dash],
      ['납기', due]
    ];
  }

  function renderSummary(s, c, p) {
    document.getElementById('sumSpecs').innerHTML = specRows(s).map(function (m) {
      return '<dt>' + m[0] + '</dt><dd>' + m[1] + '</dd>';
    }).join('');

    document.getElementById('sumTotal').textContent = won(c.total);
    document.getElementById('sumTotalNote').textContent = p.complete ? 'VAT 포함' : 'VAT 포함 · 구성 중';
    document.getElementById('mbTotal').textContent = won(c.total);
    document.getElementById('navPrice').textContent = c.total ? won(c.total) : '구성을 선택해 주세요';

    var remain = document.getElementById('sumRemain');
    remain.hidden = p.complete;
    if (!p.complete) {
      remain.textContent = '아직 선택하지 않은 단계가 있습니다 — ' + p.remaining.join(', ');
    }
  }

  /* ----------------------------------------------------------
     항목 간 연동 규칙
     ---------------------------------------------------------- */
  function applyRules(s) {
    // 작업 파일 : '제공' 이면 받을 이메일 확인
    var emailEl = document.getElementById('fileEmail');
    var needEmail = s.srcfile === '제공';
    var emailBad = needEmail && s.email.length > 0 && !s.emailValid;
    emailEl.classList.toggle('is-invalid', emailBad);
    document.getElementById('fileAlert').hidden = !emailBad;
    emailEl.required = needEmail;

    // 납기 : 일반 카드의 예상 납품일
    var normal = form.querySelector('input[name="due"][value="일반"]');
    var slot = normal.closest('.cfg-card').querySelector('[data-eta]');
    if (slot) slot.textContent = '예상 납품일 ' + fmtDate(addBusinessDays(today(), num(normal.dataset.days, PRICE.baseDays)));

    // 납기 : 원하는 날짜 카드의 단축 일정 / 요율
    var customSlot = document.querySelector('[data-eta-custom]');
    var rateNote = document.getElementById('dueRateNote');
    var alertEl = document.getElementById('dueAlert');
    var d = s.dueCustom;
    var dateFilled = !!document.getElementById('dueDate').value;

    if (!dateFilled) {
      customSlot.textContent = '날짜를 선택하면 요율이 계산됩니다.';
      rateNote.textContent = '자동 계산';
      alertEl.hidden = true;
    } else if (!d.date) {
      customSlot.textContent = '';
      rateNote.textContent = '자동 계산';
      alertEl.hidden = false;
      alertEl.textContent = '오늘 이후의 날짜를 선택해 주세요.';
    } else if (d.tooTight) {
      customSlot.textContent = fmtDate(d.date) + ' 수령 · 영업일 ' + d.days + '일';
      rateNote.textContent = '별도 문의';
      alertEl.hidden = false;
      alertEl.textContent = '선택한 날짜는 일반 일정보다 ' + d.shortened + ' 영업일 짧아 자동 견적이 어렵습니다. 견적문의로 일정을 확인해 주세요.';
    } else {
      customSlot.textContent = fmtDate(d.date) + ' 수령 · 영업일 ' + d.days + '일' +
        (d.shortened ? ' · ' + d.shortened + ' 영업일 단축' : ' · 일반 일정');
      rateNote.textContent = d.rate ? '+' + Math.round(d.rate * 100) + '%' : '기본';
      alertEl.hidden = true;
    }
  }

  /* ----------------------------------------------------------
     다음 단계로 부드럽게 이동
     ---------------------------------------------------------- */
  function scrollToStep(index) {
    var target = index >= STEPS.length ? document.getElementById('cfgSummary') : STEPS[index].el;
    if (!target) return;
    setTimeout(function () {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  /* ----------------------------------------------------------
     갱신 루프
     ---------------------------------------------------------- */
  function update(opts) {
    var s = readState();
    var c = calc(s);
    var p = readProgress(s, c);

    applyRules(s);
    applyLocks(p);
    renderVisual(s);
    renderSummary(s, c, p);

    var advanced = p.frontier > frontier;
    frontier = p.frontier;
    if (initialized && advanced && opts && opts.autoScroll) scrollToStep(frontier);
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
      }
    }
    if (e.target.name === 'due' && e.target.value === '원하는 날짜') {
      document.getElementById('dueDate').focus();
    }
    update({ autoScroll: true });
  });

  // 입력 중에는 스크롤이 튀지 않도록 이동시키지 않는다
  form.addEventListener('input', function (e) {
    if (['fileEmail', 'dueDate'].indexOf(e.target.id) > -1) update();
  });

  document.getElementById('galPrev').addEventListener('click', function () {
    var n = viewsFor(readState()).length;
    view = (view + n - 1) % n; update();
  });
  document.getElementById('galNext').addEventListener('click', function () {
    var n = viewsFor(readState()).length;
    view = (view + 1) % n; update();
  });

  // 결제 : 남은 단계가 있으면 그 단계로 이동
  document.getElementById('sumPay').addEventListener('click', function (e) {
    var s = readState(), c = calc(s), p = readProgress(s, c);
    if (!p.complete) {
      e.preventDefault();
      scrollToStep(p.frontier);
    }
  });

  /* ----------------------------------------------------------
     견적서 이미지 저장 — 캔버스로 직접 그려 PNG 로 내려준다
     (외부 라이브러리 없이 동작해야 하므로 canvas 로 렌더)
     ---------------------------------------------------------- */
  function saveQuoteImage() {
    var s = readState(), c = calc(s);
    var rows = specRows(s);
    var W = 760;
    var MX = 48, lineH = 34;
    var H = 300 + rows.length * lineH + 190;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var cv = document.createElement('canvas');
    cv.width = W * dpr; cv.height = H * dpr;
    var g = cv.getContext('2d');
    g.scale(dpr, dpr);

    var FONT = '"Paperlogy", "Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", sans-serif';
    function text(str, x, y, size, weight, color, align) {
      g.font = (weight || 400) + ' ' + size + 'px ' + FONT;
      g.fillStyle = color || '#101010';
      g.textAlign = align || 'left';
      g.fillText(str, x, y);
    }
    function line(y, color) {
      g.strokeStyle = color || '#ececee';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(MX, y + .5); g.lineTo(W - MX, y + .5); g.stroke();
    }

    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);

    var now = new Date();
    var y = 74;
    text('리플렛마스터', MX, y, 24, 800);
    text('견적서 (예상)', W - MX, y, 15, 600, '#6b6b70', 'right');
    y += 16; line(y);

    y += 44;
    text('예상 견적 금액', MX, y, 13, 600, '#6b6b70');
    y += 40;
    text(won(c.total), MX, y, 34, 800);
    text('VAT 포함', MX + g.measureText(won(c.total)).width + 14, y, 13, 400, '#6b6b70');

    y += 30; line(y);
    y += 40;
    text('선택 내역', MX, y, 14, 700);
    y += 14;

    rows.forEach(function (r) {
      y += lineH;
      text(r[0], MX, y, 13.5, 400, '#6b6b70');
      var v = String(r[1]);
      g.font = '600 13.5px ' + FONT;
      // 값이 길면 줄여서 표기
      while (g.measureText(v).width > W - MX * 2 - 130 && v.length > 8) v = v.slice(0, -2);
      if (v !== String(r[1])) v += '…';
      text(v, W - MX, y, 13.5, 600, '#101010', 'right');
      g.strokeStyle = '#f3f3f5';
      g.beginPath(); g.moveTo(MX, y + 12.5); g.lineTo(W - MX, y + 12.5); g.stroke();
    });

    y += 54;
    text('공급가액', MX, y, 13.5, 400, '#6b6b70');
    text(won(c.net), W - MX, y, 13.5, 600, '#101010', 'right');
    y += lineH;
    text('부가세 (10%)', MX, y, 13.5, 400, '#6b6b70');
    text(won(c.vat), W - MX, y, 13.5, 600, '#101010', 'right');
    y += 16; line(y, '#d8d8dc');
    y += 34;
    text('합계 (VAT 포함)', MX, y, 15, 700);
    text(won(c.total), W - MX, y, 20, 800, '#101010', 'right');

    y += 52;
    text('표기 금액은 시안용 예시 단가로 산출한 예상 견적입니다.', MX, y, 12, 400, '#8a8a90');
    y += 20;
    text('실제 견적은 원고량과 이미지 보정 범위에 따라 조정됩니다.', MX, y, 12, 400, '#8a8a90');
    y += 20;
    text('발행일 ' + now.getFullYear() + '. ' + (now.getMonth() + 1) + '. ' + now.getDate() +
      '  ·  리플렛마스터(디자인위드)  ·  02-6951-0402', MX, y, 12, 400, '#8a8a90');

    var btn = document.getElementById('sumSave');
    var label = '견적서 이미지 저장';
    cv.toBlob(function (blob) {
      if (!blob) { btn.textContent = '저장 실패'; setTimeout(function () { btn.textContent = label; }, 2000); return; }
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = '리플렛마스터_견적서_' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      btn.textContent = '저장했습니다';
      setTimeout(function () { btn.textContent = label; }, 2000);
    }, 'image/png');
  }

  document.getElementById('sumSave').addEventListener('click', saveQuoteImage);

  /* ----------------------------------------------------------
     초기화 : 희망 수령일은 내일부터 선택 가능
     ---------------------------------------------------------- */
  (function initDate() {
    var el = document.getElementById('dueDate');
    var min = new Date(today().getTime());
    min.setDate(min.getDate() + 1);
    el.min = isoDate(min);
    el.max = isoDate(addBusinessDays(today(), 120));
  })();

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
    pick('format', q.get('format'));
    pick('qty', q.get('qty'));
    pick('paper', q.get('paper'));
    pick('srcfile', q.get('file'));
    pick('due', q.get('due'));
    if (q.get('date')) document.getElementById('dueDate').value = q.get('date');

    var finish = (q.get('finish') || '').split('|').filter(Boolean);
    if (finish.length) {
      Array.prototype.forEach.call(form.querySelectorAll('input[name="finish"]'), function (b) {
        b.checked = finish.indexOf(b.value) > -1;
      });
    }
  })();

  update();
  initialized = true;
})();
