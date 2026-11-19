/* ============================================================
   AI & Fake News — script.js
   Reading controls, sample-post reveal, share checklist,
   and an in-page search with suggestions + highlight + stepping.
   ============================================================ */

(function () {
  'use strict';

  var doc = document;
  var html = doc.documentElement;
  var body = doc.body;
  var KEY = { theme: 'aifn-theme', size: 'aifn-size', contrast: 'aifn-contrast' };

  function read(k, fallback) {
    try { return localStorage.getItem(k) || fallback; } catch (e) { return fallback; }
  }
  function write(k, v) {
    try { localStorage.setItem(k, v); } catch (e) { /* private mode: ignore */ }
  }

  /* ---------- sticky header offset ---------- */
  var topbar = doc.querySelector('.topbar');
  function pad() {
    if (!topbar) return;
    html.style.scrollPaddingTop = (topbar.offsetHeight + 12) + 'px';
  }

  /* ---------- text size ---------- */
  var sizeNormal = doc.getElementById('sizeNormal');
  var sizeLarge = doc.getElementById('sizeLarge');

  function applySize(large) {
    html.setAttribute('data-size', large ? 'large' : 'normal');
    if (sizeNormal) sizeNormal.setAttribute('aria-pressed', large ? 'false' : 'true');
    if (sizeLarge) sizeLarge.setAttribute('aria-pressed', large ? 'true' : 'false');
    write(KEY.size, large ? 'large' : 'normal');
    pad();
  }
  if (sizeNormal) sizeNormal.addEventListener('click', function () { applySize(false); });
  if (sizeLarge) sizeLarge.addEventListener('click', function () { applySize(true); });
  applySize(read(KEY.size, 'normal') === 'large');

  /* ---------- reading colours ---------- */
  var themeBtns = [].slice.call(doc.querySelectorAll('[data-theme-btn]'));

  function applyTheme(t) {
    html.setAttribute('data-theme', t);
    themeBtns.forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-theme-btn') === t ? 'true' : 'false');
    });
    write(KEY.theme, t);
  }
  themeBtns.forEach(function (b) {
    b.addEventListener('click', function () { applyTheme(b.getAttribute('data-theme-btn')); });
  });
  var startTheme = read(KEY.theme, 'light');
  applyTheme(['light', 'sepia', 'dark'].indexOf(startTheme) > -1 ? startTheme : 'light');

  /* ---------- contrast ---------- */
  var contrastBtn = doc.getElementById('contrastToggle');
  function applyContrast(on) {
    html.setAttribute('data-contrast', on ? 'high' : 'normal');
    if (contrastBtn) contrastBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    write(KEY.contrast, on ? 'on' : 'off');
    pad();
  }
  if (contrastBtn) {
    contrastBtn.addEventListener('click', function () {
      applyContrast(html.getAttribute('data-contrast') !== 'high');
    });
  }
  applyContrast(read(KEY.contrast, 'off') === 'on');

  /* ---------- "Aa" settings popover ---------- */
  var aaBtn = doc.getElementById('aaBtn');
  var reader = doc.getElementById('reader');

  function setReader(open) {
    if (!reader || !aaBtn) return;
    reader.hidden = !open;
    aaBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    pad();
  }
  if (aaBtn && reader) {
    aaBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      setReader(reader.hidden);
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !reader.hidden) setReader(false);
    });
  }

  /* ---------- share checklist ---------- */
  var checks = [].slice.call(doc.querySelectorAll('#checkList input[type="checkbox"]'));
  var checkResult = doc.getElementById('checkResult');

  function updateCheck() {
    var n = checks.reduce(function (t, c) { return t + (c.checked ? 1 : 0); }, 0);
    var msg;
    if (n === 0) {
      msg = 'Nothing checked yet. Start with the first question — it catches most fakes on its own.';
    } else if (n <= 2) {
      msg = n + ' of 4 checked. If you are still unsure, do not share it yet. Save it and sleep on it.';
    } else if (n === 3) {
      msg = '3 of 4 checked. One gap is enough to let a fake through — try the last question.';
    } else {
      msg = 'All four checked. You have done more than most people do before sharing. If it still feels wrong, trust that feeling.';
    }
    if (checkResult) checkResult.textContent = msg;
  }
  checks.forEach(function (c) { c.addEventListener('change', updateCheck); });

  var checkReset = doc.getElementById('checkReset');
  if (checkReset) {
    checkReset.addEventListener('click', function () {
      checks.forEach(function (c) { c.checked = false; });
      updateCheck();
    });
  }

  /* ============================================================
     Search: suggestions → jump → highlight → step through
     ============================================================ */
  var input = doc.getElementById('searchInput');
  var panel = doc.getElementById('searchPanel');
  var clearBtn = doc.getElementById('searchClear');
  var main = doc.querySelector('main');

  if (!input || !panel || !main) return;

  var chips = [].slice.call(doc.querySelectorAll('.chips a'));

  var index = [].slice.call(main.querySelectorAll('section[id]')).map(function (sec, i) {
    var headEl = sec.querySelector('h2') || sec.querySelector('h1');
    var eyebrowEl = sec.querySelector('.eyebrow');
    var numMatch = eyebrowEl ? eyebrowEl.textContent.match(/^\s*(\d{2})/) : null;
    return {
      order: i,
      id: sec.id,
      num: numMatch ? numMatch[1] : '',
      title: headEl ? headEl.textContent.replace(/\s+/g, ' ').trim() : sec.id,
      text: sec.textContent.replace(/\s+/g, ' ').trim()
    };
  });

  var state = { mode: 'list', results: [], active: 0, marks: [], hit: 0, term: '' };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function runQuery(term) {
    var q = term.toLowerCase();
    var out = [];
    index.forEach(function (item) {
      var lower = item.text.toLowerCase();
      var count = 0;
      var at = q ? lower.indexOf(q) : -1;
      while (at !== -1) {
        count++;
        at = lower.indexOf(q, at + q.length);
      }
      var titleHit = !!q && item.title.toLowerCase().indexOf(q) !== -1;
      if (!count && !titleHit) return;

      var snippet;
      if (count) {
        var pos = lower.indexOf(q);
        var from = Math.max(0, pos - 44);
        var to = Math.min(item.text.length, pos + q.length + 72);
        snippet = (from > 0 ? '… ' : '') + item.text.slice(from, to) + (to < item.text.length ? ' …' : '');
      } else {
        snippet = 'The heading contains this word.';
      }
      out.push({
        item: item, count: count, titleHit: titleHit, snippet: snippet,
        score: (titleHit ? 10 : 0) + Math.min(count, 9)
      });
    });
    out.sort(function (a, b) { return b.score - a.score || a.item.order - b.item.order; });
    return out;
  }

  function clearMarks() {
    [].slice.call(main.querySelectorAll('mark.hl')).forEach(function (m) {
      var p = m.parentNode;
      if (!p) return;
      p.replaceChild(doc.createTextNode(m.textContent), m);
      p.normalize();
    });
    state.marks = [];
    state.hit = 0;
  }

  function markTerm(term) {
    if (!term) return;
    var re = new RegExp(escapeRe(term), 'gi');
    var walker = doc.createTreeWalker(main, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var p = node.parentNode;
        if (!p || !p.closest) return NodeFilter.FILTER_REJECT;
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (p.closest('script, style, mark')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach(function (node) {
      var text = node.nodeValue;
      re.lastIndex = 0;
      if (!re.test(text)) return;
      re.lastIndex = 0;
      var frag = doc.createDocumentFragment();
      var last = 0;
      var m;
      while ((m = re.exec(text)) !== null) {
        if (m.index > last) frag.appendChild(doc.createTextNode(text.slice(last, m.index)));
        var mark = doc.createElement('mark');
        mark.className = 'hl';
        mark.textContent = m[0];
        frag.appendChild(mark);
        state.marks.push(mark);
        last = m.index + m[0].length;
      }
      if (last < text.length) frag.appendChild(doc.createTextNode(text.slice(last)));
      if (node.parentNode) node.parentNode.replaceChild(frag, node);
    });
  }

  function showPanel() {
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }
  function hidePanel() {
    panel.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  }

  function renderList(term, results) {
    if (!results.length) {
      panel.innerHTML =
        '<div class="p-head"><span>No results</span><span>for “' + esc(term) + '”</span></div>' +
        '<div class="p-empty"><b>Nothing on this page matches that.</b><br>' +
        'Try a wider word: “deepfake”, “scam”, “label”, “Taiwan”, “Bangladesh”, “source”.</div>';
      showPanel();
      return;
    }

    var out = '<div class="p-head"><span><b>' + results.length +
      (results.length === 1 ? ' section' : ' sections') + '</b></span>' +
      '<span>for “' + esc(term) + '”</span>' +
      '<span class="p-nav">↑ ↓ Enter</span></div>';

    results.forEach(function (r, i) {
      out +=
        '<button type="button" class="res" role="option" data-i="' + i + '" aria-selected="' +
        (i === state.active ? 'true' : 'false') + '">' +
        '<span class="res-t">' + (r.item.num ? '<span class="res-n">' + esc(r.item.num) + '</span>' : '') +
        '<span>' + esc(r.item.title) + '</span></span>' +
        '<span class="res-s">' + esc(r.snippet) + '</span>' +
        '</button>';
    });

    panel.innerHTML = out;
    showPanel();

    [].slice.call(panel.querySelectorAll('.res')).forEach(function (btn) {
      btn.addEventListener('click', function () {
        openResult(parseInt(btn.getAttribute('data-i'), 10));
      });
      btn.addEventListener('mouseenter', function () {
        var i = parseInt(btn.getAttribute('data-i'), 10);
        state.active = i;
        setActive(i);
      });
    });
  }

  function setActive(i) {
    [].slice.call(panel.querySelectorAll('.res')).forEach(function (b, k) {
      b.setAttribute('aria-selected', k === i ? 'true' : 'false');
    });
  }

  function renderNav() {
    var total = state.marks.length;
    var out =
      '<div class="p-head">' +
      '<span><b>' + (total ? (state.hit + 1) + ' of ' + total : 'No') + '</b> ' +
      (total === 1 ? 'match' : 'matches') + '</span>' +
      '<span>for “' + esc(state.term) + '”</span>' +
      '<span class="p-nav">' +
      '<button type="button" data-nav="prev" aria-label="Previous match"' + (total ? '' : ' disabled') + '>‹</button>' +
      '<button type="button" data-nav="next" aria-label="Next match"' + (total ? '' : ' disabled') + '>›</button>' +
      '<button type="button" data-nav="close" aria-label="Close search">Close</button>' +
      '</span></div>' +
      '<div class="p-empty">Press Enter to step to the next match. Esc clears the highlights.</div>';
    panel.innerHTML = out;
    showPanel();
  }

  function focusHit() {
    if (!state.marks.length) return;
    state.marks.forEach(function (m, k) { m.classList.toggle('current', k === state.hit); });
    var el = state.marks[state.hit];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function openResult(i) {
    var r = state.results[i];
    if (!r) return;
    state.mode = 'nav';
    state.term = input.value.trim();
    clearMarks();
    markTerm(state.term);

    var startIdx = -1;
    for (var k = 0; k < state.marks.length; k++) {
      var owner = state.marks[k].closest('section[id]');
      if (owner && owner.id === r.item.id) { startIdx = k; break; }
    }

    if (startIdx === -1) {
      var sec = doc.getElementById(r.item.id);
      if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      state.hit = 0;
      renderNav();
      return;
    }
    state.hit = startIdx;
    renderNav();
    focusHit();
  }

  function step(delta) {
    if (!state.marks.length) return;
    var n = state.marks.length;
    state.hit = (state.hit + delta + n) % n;
    focusHit();
    renderNav();
  }

  function doSearch() {
    var term = input.value.trim();
    if (clearBtn) clearBtn.classList.toggle('show', term.length > 0);

    if (!term) {
      clearMarks();
      state.mode = 'list';
      state.results = [];
      panel.innerHTML = '';
      hidePanel();
      return;
    }
    clearMarks();
    state.mode = 'list';
    state.term = term;
    state.results = runQuery(term);
    state.active = 0;
    renderList(term, state.results);
    pad();
  }

  var timer = null;
  input.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(doSearch, 200);
  });

  input.addEventListener('focus', function () {
    if (!input.value.trim()) return;
    if (state.mode === 'nav' && state.marks.length) { renderNav(); return; }
    doSearch();
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      clearMarks();
      panel.innerHTML = '';
      hidePanel();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (state.mode !== 'list' || !state.results.length) return;
      e.preventDefault();
      var n = state.results.length;
      state.active = (state.active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      setActive(state.active);
      var cur = panel.querySelector('[aria-selected="true"]');
      if (cur) cur.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (state.mode === 'nav') { step(1); return; }
      var term = input.value.trim();
      if (!term) return;
      if (!state.results.length) {
        state.results = runQuery(term);
        if (!state.results.length) { renderList(term, state.results); return; }
      }
      openResult(state.active);
    }
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      input.value = '';
      doSearch();
      input.focus();
    });
  }

  panel.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-nav]') : null;
    if (!btn) return;
    var act = btn.getAttribute('data-nav');
    if (act === 'next') step(1);
    else if (act === 'prev') step(-1);
    else if (act === 'close') { panel.innerHTML = ''; hidePanel(); clearMarks(); }
  });

  doc.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (reader && !reader.hidden && !t.closest('#reader') && !t.closest('#aaBtn')) setReader(false);
    if (!t.closest('.search')) hidePanel();
  });

  /* ---------- active chip ---------- */
  if ('IntersectionObserver' in window && chips.length) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var id = '#' + en.target.id;
        chips.forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === id); });
      });
    }, { rootMargin: '-42% 0px -52% 0px', threshold: 0 });

    chips.forEach(function (a) {
      var target = doc.getElementById(a.getAttribute('href').slice(1));
      if (target) spy.observe(target);
    });
  }

  /* ---------- back to top ---------- */
  var toTop = doc.getElementById('toTop');
  if (toTop) {
    window.addEventListener('scroll', function () {
      toTop.classList.toggle('show', window.scrollY > 520);
    }, { passive: true });
    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ---------- keep scroll offset correct ---------- */
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(pad, 120);
  });
  window.addEventListener('load', pad);
  pad();
})();

/* ============ Welcome page ============ */
(function () {
  var body = document.body;
  var welcome = document.getElementById('welcome');
  var start = document.getElementById('welcomeStart');
  var brand = document.querySelector('.brand');
  var main = document.querySelector('main');

  if (!welcome) return;

  function closeWelcome() {
    welcome.classList.add('is-hidden');
    body.classList.remove('welcome-open');
    window.setTimeout(function () { welcome.hidden = true; }, 400);
    if (main) {
      main.setAttribute('tabindex', '-1');
      main.focus({ preventScroll: true });
    }
  }

  function openWelcome() {
    welcome.hidden = false;
    void welcome.offsetWidth;          
    welcome.classList.remove('is-hidden');
    body.classList.add('welcome-open');
    window.scrollTo({ top: 0, behavior: 'auto' });
    if (start) start.focus({ preventScroll: true });
  }

  body.classList.add('welcome-open');

  if (start) start.addEventListener('click', closeWelcome);

  // Keep the optional spotlight subtle and limited to mouse-like pointers.
  var pointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (pointerQuery.matches && !motionQuery.matches) {
    var frame = 0;
    welcome.addEventListener('pointermove', function (event) {
      if (frame) return;
      frame = window.requestAnimationFrame(function () {
        var rect = welcome.getBoundingClientRect();
        welcome.style.setProperty('--spot-x', (event.clientX - rect.left) + 'px');
        welcome.style.setProperty('--spot-y', (event.clientY - rect.top) + 'px');
        welcome.classList.add('has-spotlight');
        frame = 0;
      });
    }, { passive: true });
    welcome.addEventListener('pointerleave', function () {
      welcome.classList.remove('has-spotlight');
    }, { passive: true });
  }

  // Click the brand name to return welcome page
  if (brand) {
    brand.addEventListener('click', function (e) {
      e.preventDefault();
      openWelcome();
    });
  }
})();
