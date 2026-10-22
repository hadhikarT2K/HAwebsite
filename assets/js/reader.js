/* Magazine reader: page-by-page viewer for image issues (PNG/JPG pages) and PDFs.
   Opened from the Outreach page via window.MagReader.open(issue, page). */
(function () {
  "use strict";
  var PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var el = document.createElement("div");
  el.className = "reader"; el.hidden = true;
  el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Magazine reader");
  el.innerHTML =
    '<div class="rd-bar">' +
      '<div class="rd-title"><span class="rd-series"></span><strong class="rd-name"></strong></div>' +
      '<span class="rd-count mono" aria-live="polite"></span>' +
      '<div class="rd-tools">' +
        '<button type="button" class="rd-btn rd-grid-btn" title="All pages" aria-label="Show all pages"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z"/></svg></button>' +
        '<button type="button" class="rd-btn rd-zoom-btn" title="Zoom (double-click a page)" aria-label="Zoom"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5M11 8v6M8 11h6"/></svg></button>' +
        '<button type="button" class="rd-btn rd-fs-btn" title="Fullscreen" aria-label="Fullscreen"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>' +
        '<a class="rd-btn rd-dl" title="Download" aria-label="Download" target="_blank" rel="noopener"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg></a>' +
        '<button type="button" class="rd-btn rd-close" title="Close (Esc)" aria-label="Close reader">✕</button>' +
      "</div>" +
    "</div>" +
    '<div class="rd-stage">' +
      '<button type="button" class="rd-nav rd-prev" aria-label="Previous page">‹</button>' +
      '<div class="rd-spread"></div>' +
      '<button type="button" class="rd-nav rd-next" aria-label="Next page">›</button>' +
      '<div class="rd-grid" hidden></div>' +
    "</div>" +
    '<div class="rd-foot"><input type="range" class="rd-scrub" min="1" value="1" aria-label="Page"><span class="rd-hint">Swipe, use ← →, or tap the page edges</span></div>';
  document.body.appendChild(el);

  var $ = function (s) { return el.querySelector(s); };
  var spreadEl = $(".rd-spread"), gridEl = $(".rd-grid"), scrub = $(".rd-scrub");
  var state = null;   // {issue, n, page (0-based, first page shown), pdf, cache:{}, two, zoom}

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function twoUp() { return window.innerWidth >= 900 && window.innerWidth / window.innerHeight > 1.15; }

  /* pages shown together: cover alone, then 2–3, 4–5 … in two-page mode */
  function spreadOf(p) {
    if (!state.two || p === 0) return [p];
    var start = p % 2 === 1 ? p : p - 1;
    return start + 1 < state.n ? [start, start + 1] : [start];
  }
  function stepFrom(p, dir) {
    var s = spreadOf(p);
    if (dir > 0) return Math.min(state.n - 1, s[s.length - 1] + 1);
    return Math.max(0, s[0] - 1);
  }

  /* ---------- page sources ---------- */
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = PDFJS + "pdf.min.js";
      s.onload = function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js"; res(window.pdfjsLib); };
      s.onerror = function () { rej(new Error("pdf.js failed to load")); };
      document.head.appendChild(s);
    });
  }
  function pageNode(i) {             // returns a Promise of an element for page i
    if (state.cache[i]) return Promise.resolve(state.cache[i]);
    var issue = state.issue, p;
    if (issue.images) {
      p = new Promise(function (res) {
        var img = new Image(); img.decoding = "async"; img.alt = "Page " + (i + 1);
        img.onload = img.onerror = function () { res(img); };
        img.src = issue.images[i];
      });
    } else {
      p = state.pdf.getPage(i + 1).then(function (pg) {
        var vp1 = pg.getViewport({ scale: 1 }), stage = $(".rd-stage");
        var targetH = Math.min(stage.clientHeight || 900, 1600) * Math.min(window.devicePixelRatio || 1, 2) * 1.4;
        var vp = pg.getViewport({ scale: targetH / vp1.height });
        var c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
        c.setAttribute("role", "img"); c.setAttribute("aria-label", "Page " + (i + 1));
        return pg.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise.then(function () { return c; });
      });
    }
    state.cache[i] = p;
    return p;
  }

  /* ---------- render ---------- */
  function show(p, dir) {
    if (!state) return;
    p = Math.max(0, Math.min(state.n - 1, p));
    var pages = spreadOf(p); state.page = pages[0];
    var label = pages.length > 1 ? (pages[0] + 1) + "–" + (pages[1] + 1) : String(pages[0] + 1);
    $(".rd-count").textContent = state.n === 1 ? "" : (pages[0] === 0 && pages.length === 1 ? "Cover · " : "Page ") + label + " / " + state.n;
    scrub.value = pages[0] + 1;
    $(".rd-prev").disabled = pages[0] === 0; $(".rd-next").disabled = pages[pages.length - 1] >= state.n - 1;
    try { history.replaceState(null, "", "#read-" + state.issue.id + "-p" + (pages[0] + 1)); } catch (e) {}
    var token = {}; state.token = token;
    spreadEl.classList.toggle("rd-two", pages.length > 1);
    Promise.all(pages.map(pageNode)).then(function (nodes) {
      if (state.token !== token) return;
      var wrap = document.createElement("div");
      wrap.className = "rd-pages" + (reduce || !dir ? "" : dir > 0 ? " in-next" : " in-prev");
      nodes.forEach(function (n, k) { var f = document.createElement("div"); f.className = "rd-page" + (pages.length > 1 ? (k ? " right" : " left") : ""); f.appendChild(n.cloneNode ? (n.tagName === "CANVAS" ? copyCanvas(n) : n.cloneNode()) : n); wrap.appendChild(f); });
      spreadEl.innerHTML = ""; spreadEl.appendChild(wrap);
      // preload neighbours
      [stepFrom(p, 1), stepFrom(p, 1) + 1, stepFrom(p, -1), stepFrom(p, -1) - 1].forEach(function (q) { if (q >= 0 && q < state.n) pageNode(q); });
    });
  }
  function copyCanvas(c) { var d = document.createElement("canvas"); d.width = c.width; d.height = c.height; d.getContext("2d").drawImage(c, 0, 0); d.setAttribute("aria-label", c.getAttribute("aria-label")); return d; }
  function next() { if (state && !state.zoom && state.n > 1) show(stepFrom(state.page, 1), 1); }
  function prev() { if (state && !state.zoom && state.n > 1) show(stepFrom(state.page, -1), -1); }

  function setZoom(on) {
    var keep = state.n === 1 ? spreadEl.scrollTop / Math.max(1, spreadEl.scrollHeight) : 0;
    state.zoom = on; el.classList.toggle("zoomed", on);
    if (state.n === 1) spreadEl.scrollTop = keep * spreadEl.scrollHeight; else if (!on) spreadEl.scrollTo(0, 0);
  }

  function buildGrid() {
    gridEl.innerHTML = "";
    for (var i = 0; i < state.n; i++) {
      (function (i) {
        var b = document.createElement("button"); b.type = "button"; b.className = "rd-thumb";
        b.innerHTML = '<span class="ph"></span><span class="num">' + (i + 1) + "</span>";
        b.addEventListener("click", function () { gridEl.hidden = true; show(i, 0); });
        gridEl.appendChild(b);
        if (state.issue.images) { var img = new Image(); img.loading = "lazy"; img.alt = ""; img.src = state.issue.images[i]; b.querySelector(".ph").appendChild(img); }
        else if (i < 60) pageNode(i).then(function (n) { var c = copyCanvas(n); b.querySelector(".ph").appendChild(c); });
      })(i);
    }
  }

  /* ---------- open / close ---------- */
  var lastFocus = null;
  function open(issue, startPage) {
    lastFocus = document.activeElement;
    state = { issue: issue, n: 0, page: 0, cache: {}, two: twoUp(), zoom: false };
    $(".rd-series").textContent = issue.seriesName || "";
    $(".rd-name").textContent = issue.title || "";
    var dl = $(".rd-dl"); dl.hidden = !issue.file; if (issue.file) { dl.href = issue.file; dl.setAttribute("download", ""); }
    spreadEl.innerHTML = '<p class="rd-loading">Opening…</p>'; gridEl.hidden = true;
    el.hidden = false; document.body.style.overflow = "hidden"; $(".rd-close").focus();
    var ready = issue.images ? Promise.resolve(issue.images.length)
      : loadPdfJs().then(function (lib) { return lib.getDocument(issue.file).promise; }).then(function (pdf) { state.pdf = pdf; return pdf.numPages; });
    ready.then(function (n) {
      state.n = n; scrub.max = n; buildGrid();
      el.classList.toggle("single", n === 1);   // one image: read it top to bottom, full width
      show(Math.max(0, Math.min(n - 1, (startPage || 1) - 1)), 0);
    }).catch(function () {
      spreadEl.innerHTML = '<p class="rd-loading">This issue couldn\'t be opened here. ' + (issue.file ? '<a href="' + esc(issue.file) + '" target="_blank" rel="noopener">Open the PDF directly</a>.' : "") + "</p>";
    });
  }
  function close() {
    if (!state) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    el.hidden = true; el.classList.remove("zoomed", "single"); document.body.style.overflow = ""; state = null; spreadEl.innerHTML = "";
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    if (lastFocus) lastFocus.focus();
  }

  /* ---------- controls ---------- */
  $(".rd-close").addEventListener("click", close);
  $(".rd-next").addEventListener("click", next);
  $(".rd-prev").addEventListener("click", prev);
  scrub.addEventListener("input", function () { show(+scrub.value - 1, 0); });
  $(".rd-grid-btn").addEventListener("click", function () { gridEl.hidden = !gridEl.hidden; });
  $(".rd-zoom-btn").addEventListener("click", function () { setZoom(!state.zoom); });
  $(".rd-fs-btn").addEventListener("click", function () {
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    else if (el.requestFullscreen) el.requestFullscreen().catch(function () {});
  });
  spreadEl.addEventListener("dblclick", function () { setZoom(!state.zoom); });
  spreadEl.addEventListener("click", function (e) {
    if (state.zoom || e.detail > 1) return;
    var r = spreadEl.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
    if (x < 0.3) prev(); else if (x > 0.7) next();
  });
  var tx = null, ty = null, lastTap = 0;
  spreadEl.addEventListener("touchstart", function (e) { if (e.touches.length === 1) { tx = e.touches[0].clientX; ty = e.touches[0].clientY; } }, { passive: true });
  spreadEl.addEventListener("touchend", function (e) {
    if (tx === null) return;
    var dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty; tx = null;
    var now = Date.now();
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) { if (now - lastTap < 300) { setZoom(!state.zoom); e.preventDefault(); } lastTap = now; return; }
    if (!state.zoom && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { dx < 0 ? next() : prev(); }
  });
  document.addEventListener("keydown", function (e) {
    if (!state) return;
    if (e.key === "Escape") { if (!gridEl.hidden) gridEl.hidden = true; else if (state.zoom) setZoom(false); else close(); }
    else if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); next(); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); prev(); }
    else if (e.key === "Home") show(0, -1); else if (e.key === "End") show(state.n - 1, 1);
  });
  var rt; window.addEventListener("resize", function () {
    if (!state) return; clearTimeout(rt);
    rt = setTimeout(function () { var t = twoUp(); if (state.n > 1 && t !== state.two) { state.two = t; show(state.page, 0); } }, 150);
  });

  window.MagReader = { open: open };
})();
