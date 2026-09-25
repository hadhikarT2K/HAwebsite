/* Haradhan Adhikary — site script (no dependencies) */
(function () {
  "use strict";
  var root = document.documentElement;
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- theme ---------- */
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  var themeBtn = document.querySelector(".theme-btn");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var current = root.getAttribute("data-theme") ||
        (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      var next = current === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      store("theme", next);
    });
  }

  /* ---------- mobile menu ---------- */
  var menuBtn = document.querySelector(".menu-btn");
  var nav = document.getElementById("site-nav");
  if (menuBtn && nav) {
    menuBtn.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("open")) { nav.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); menuBtn.focus(); }
    });
  }

  /* ---------- footer year ---------- */
  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ---------- copy buttons ---------- */
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = btn.getAttribute("data-copy");
      var done = function () { var old = btn.textContent; btn.textContent = "Copied"; setTimeout(function () { btn.textContent = old; }, 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { window.prompt("Copy:", text); });
      } else { window.prompt("Copy:", text); }
    });
  });

  /* ---------- Cherenkov ring event display ---------- */
  var canvas = document.getElementById("event-canvas");
  if (canvas && canvas.getContext) {
    var ctx = canvas.getContext("2d");
    var W, H, dpr, pmts = [], hits = [], t0 = 0, label = document.getElementById("event-label");
    var stops = [[59, 76, 255], [25, 195, 255], [61, 255, 160], [255, 225, 77], [255, 107, 61]];
    function cmap(x) {
      x = Math.max(0, Math.min(0.9999, x)) * (stops.length - 1);
      var i = Math.floor(x), f = x - i, a = stops[i], b = stops[i + 1];
      return "rgb(" + Math.round(a[0] + (b[0] - a[0]) * f) + "," + Math.round(a[1] + (b[1] - a[1]) * f) + "," + Math.round(a[2] + (b[2] - a[2]) * f) + ")";
    }
    // deterministic PRNG so the first frame is always the same nice event
    var seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    function gauss() { return Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd()); }

    function layout() {
      var r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pmts = [];
      var pitch = Math.max(11, W / 38), row = pitch * 0.866;
      for (var y = pitch * 0.6, j = 0; y < H - pitch * 0.3; y += row, j++) {
        for (var x = pitch * 0.6 + (j % 2 ? pitch / 2 : 0); x < W - pitch * 0.3; x += pitch) pmts.push({ x: x, y: y });
      }
      canvas._pitch = pitch;
    }

    function newEvent() {
      var mu = rnd() < 0.5;
      var cx = W * (0.3 + rnd() * 0.4), cy = H * (0.28 + rnd() * 0.38);
      var R = Math.min(W, H) * (0.2 + rnd() * 0.14);
      var width = mu ? 0.035 : 0.09;          // muon rings are sharp, electron rings fuzzy
      var pitch = canvas._pitch;
      hits = [];
      pmts.forEach(function (p) {
        var dx = p.x - cx, dy = p.y - cy, d = Math.sqrt(dx * dx + dy * dy);
        var ring = Math.exp(-Math.pow((d - R) / (R * width), 2));
        var inside = mu && d < R ? 0.35 * (d / R) : 0;   // filled disk for a stopping muon
        var prob = Math.max(ring, inside) * 0.95;
        if (rnd() < prob) {
          var ang = Math.atan2(dy, dx);
          var time = 0.35 + 0.35 * (d / (R * 1.3)) + 0.12 * Math.cos(ang - 0.8) + 0.05 * gauss();
          hits.push({ x: p.x, y: p.y, q: 0.45 + rnd() * 0.9 * ring, t: time, delay: rnd() * 0.5 });
        } else if (rnd() < 0.018) {
          hits.push({ x: p.x, y: p.y, q: 0.25 + rnd() * 0.2, t: rnd(), delay: rnd() * 0.5, noise: true });
        }
      });
      hits.pitch = pitch;
      if (label) label.textContent = (mu ? "μ-like ring" : "e-like ring") + " · " + hits.length + " hit PMTs";
      t0 = performance.now();
    }

    function draw(now) {
      var p = reduceMotion ? 1 : Math.min(1, (now - t0) / 900);
      ctx.fillStyle = "#070b14"; ctx.fillRect(0, 0, W, H);
      var pr = canvas._pitch * 0.34;
      ctx.fillStyle = "#18223a";
      for (var i = 0; i < pmts.length; i++) { ctx.beginPath(); ctx.arc(pmts[i].x, pmts[i].y, pr, 0, 6.283); ctx.fill(); }
      for (var k = 0; k < hits.length; k++) {
        var h = hits[k], a = Math.max(0, Math.min(1, (p - h.delay * 0.6) / 0.4));
        if (a <= 0) continue;
        ctx.globalAlpha = a * (h.noise ? 0.55 : 1);
        ctx.fillStyle = cmap(h.t);
        ctx.beginPath(); ctx.arc(h.x, h.y, pr * (0.55 + h.q * 0.55), 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    var timer = null, running = false;
    function loop(now) {
      draw(now);
      if (now - t0 < 1000) requestAnimationFrame(loop); else running = false;
    }
    function fire() { newEvent(); if (!running) { running = true; requestAnimationFrame(loop); } }
    layout(); newEvent();
    if (reduceMotion) draw(performance.now()); else { running = true; requestAnimationFrame(loop); }
    if (!reduceMotion) timer = setInterval(function () { if (!document.hidden) fire(); }, 5200);
    canvas.addEventListener("click", fire);
    var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { layout(); newEvent(); draw(performance.now() + 5000); }, 150); });
  }

  /* ---------- shared helpers ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function getJSON(path) { return fetch(path + "?v=" + Date.now(), { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }

  /* ---------- home strip: newest six photos ---------- */
  var strip = document.getElementById("home-strip");
  if (strip) {
    getJSON("data/gallery.json").then(function (g) {
      if (!g.length) return;
      strip.innerHTML = g.slice(0, 6).map(function (p) {
        return '<a href="gallery.html"><img src="' + esc(p.thumb) + '" alt="' + esc(p.caption) + '" loading="lazy" width="' + (p.w || 480) + '" height="' + (p.h || 640) + '"></a>';
      }).join("");
    }).catch(function () {});
  }

  /* ---------- gallery page: built from data/gallery.json ---------- */
  var grid = document.getElementById("gallery-grid");
  if (grid) {
    getJSON("data/gallery.json").then(function (g) {
      var cats = [["all", "All"], ["science", "Science"], ["people", "People"], ["travel", "Travel"]].filter(function (c) {
        return c[0] === "all" || g.some(function (p) { return p.category === c[0]; });
      });
      document.getElementById("gallery-filters").innerHTML = cats.map(function (c, i) {
        return '<button type="button" data-filter="' + c[0] + '" aria-pressed="' + (i === 0) + '">' + c[1] + "</button>";
      }).join("");
      grid.innerHTML = g.map(function (p) {
        var cap = p.caption || "";
        return '<figure data-cat="' + esc(p.category) + '"><button type="button" data-full="' + esc(p.full) + '" aria-label="Enlarge' + (cap ? ": " + esc(cap) : " photo") + '"><img src="' + esc(p.thumb) + '" alt="' + esc(cap) + '" loading="lazy" width="' + (p.w || 640) + '" height="' + (p.h || 480) + '"></button>' + (cap ? "<figcaption>" + esc(cap) + "</figcaption>" : "") + "</figure>";
      }).join("") || '<p class="pub-status">No photos yet.</p>';
      initGallery();
    }).catch(function () { grid.innerHTML = '<p class="pub-status">Couldn\'t load the photos. Please refresh the page.</p>'; });
  }

  function initGallery() {
    var items = Array.prototype.slice.call(grid.querySelectorAll("figure"));
    var filterBtns = document.querySelectorAll("#gallery-filters button");
    filterBtns.forEach(function (b) {
      b.addEventListener("click", function () {
        var f = b.getAttribute("data-filter");
        filterBtns.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        items.forEach(function (it) { it.hidden = !(f === "all" || it.getAttribute("data-cat") === f); });
      });
    });

    var lb = document.getElementById("lightbox"), lbImg = lb.querySelector("img"), lbCap = lb.querySelector("figcaption");
    var idx = 0, lastFocus = null;
    function visible() { return items.filter(function (it) { return !it.hidden; }); }
    function show(i) {
      var v = visible(); if (!v.length) return;
      idx = (i + v.length) % v.length;
      lbImg.src = v[idx].querySelector("button").getAttribute("data-full");
      lbImg.alt = v[idx].querySelector("img").alt;
      var fc = v[idx].querySelector("figcaption"); lbCap.textContent = fc ? fc.textContent : "";
    }
    function open(i) { lastFocus = document.activeElement; lb.hidden = false; document.body.style.overflow = "hidden"; show(i); lb.querySelector(".lb-close").focus(); }
    function close() { lb.hidden = true; document.body.style.overflow = ""; lbImg.removeAttribute("src"); if (lastFocus) lastFocus.focus(); }
    items.forEach(function (it) { it.querySelector("button").addEventListener("click", function () { open(visible().indexOf(it)); }); });
    lb.querySelector(".lb-close").addEventListener("click", close);
    lb.querySelector(".lb-prev").addEventListener("click", function () { show(idx - 1); });
    lb.querySelector(".lb-next").addEventListener("click", function () { show(idx + 1); });
    lb.addEventListener("click", function (e) { if (e.target === lb) close(); });
    document.addEventListener("keydown", function (e) {
      if (lb.hidden) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") show(idx - 1);
      if (e.key === "ArrowRight") show(idx + 1);
    });
    var sx = null;
    lb.addEventListener("touchstart", function (e) { sx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener("touchend", function (e) { if (sx === null) return; var dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1)); sx = null; });
  }

  /* ---------- talks page: data/talks.json ---------- */
  var talkList = document.getElementById("talk-list");
  if (talkList) {
    var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var fmtDate = function (d) { var m = /^(\d{4})-(\d{2})/.exec(d || ""); return m ? MONTHS[+m[2] - 1] + " " + m[1] : (d || ""); };
    getJSON("data/talks.json").then(function (t) {
      t.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
      talkList.innerHTML = t.map(function (x) {
        return '<article class="card"><span class="meta">' + esc([fmtDate(x.date), x.place].filter(Boolean).join(" · ")) + "</span>" +
          "<h3>" + esc(x.title || x.event) + "</h3>" +
          (x.title ? '<p><strong>' + esc(x.event) + "</strong></p>" : "") +
          (x.description ? "<p>" + esc(x.description) + "</p>" : "") +
          (x.url ? '<div class="foot"><a class="link-arrow" href="' + esc(x.url) + '" target="_blank" rel="noopener">Details</a></div>' : "") + "</article>";
      }).join("") || '<p class="pub-status">No talks listed yet.</p>';
    }).catch(function () { talkList.innerHTML = '<p class="pub-status">Couldn\'t load talks. Please refresh the page.</p>'; });
  }

  /* ---------- lazy YouTube embed ---------- */
  document.querySelectorAll(".video[data-yt]").forEach(function (box) {
    var btn = box.querySelector("button");
    btn.addEventListener("click", function () {
      var id = box.getAttribute("data-yt");
      var f = document.createElement("iframe");
      f.src = "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&rel=0";
      f.title = btn.getAttribute("aria-label") || "YouTube video";
      f.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      f.allowFullscreen = true;
      box.innerHTML = ""; box.appendChild(f);
    });
  });

  /* ---------- publications from INSPIRE-HEP ---------- */
  var pubList = document.getElementById("pub-list");
  if (pubList) {
    var AUTHOR_RECID = "1945984";                 // INSPIRE author profile: Haradhan.Adhikary.1
    var FIELDS = "titles.title,collaborations.value,publication_info.journal_title,publication_info.journal_volume,publication_info.year,publication_info.artid,publication_info.page_start,arxiv_eprints.value,dois.value,citation_count,earliest_date,author_count,document_type,control_number";
    var limit = parseInt(pubList.getAttribute("data-limit") || "0", 10);
    var statusEl = document.getElementById("pub-status");
    var all = [], state = { q: "", kind: "all", sort: "date" }, shown = 25;

    function clean(t) { return t.replace(/\$([^$]*)\$/g, "$1").replace(/\\(mathrm|rm|text)\{([^}]*)\}/g, "$2").replace(/\\sqrt\{([^}]*)\}/g, "√$1").replace(/\\/g, "").replace(/[{}^_]/g, ""); }

    function normalise(h) {
      var m = h.metadata || {};
      var pi = (m.publication_info || []).filter(function (p) { return p.journal_title; })[0] || {};
      var arx = m.arxiv_eprints && m.arxiv_eprints[0] && m.arxiv_eprints[0].value;
      var doi = m.dois && m.dois[0] && m.dois[0].value;
      var types = m.document_type || [];
      var year = (pi.year || (m.earliest_date || "").slice(0, 4) || "");
      return {
        id: m.control_number,
        title: clean((m.titles && m.titles[0] && m.titles[0].title) || "Untitled"),
        collab: (m.collaborations || []).map(function (c) { return c.value; }).join(", "),
        journal: pi.journal_title ? (pi.journal_title + (pi.journal_volume ? " " + pi.journal_volume : "") + (pi.year ? " (" + pi.year + ")" : "") + (pi.artid || pi.page_start ? " " + (pi.artid || pi.page_start) : "")) : "",
        arxiv: arx, doi: doi, cites: m.citation_count || 0, year: String(year), date: m.earliest_date || "",
        authors: m.author_count || 0,
        type: types.indexOf("conference paper") > -1 ? "proc" : (types.indexOf("thesis") > -1 ? "thesis" : "article"),
        lead: (m.author_count || 0) > 0 && (m.author_count || 0) <= 15
      };
    }

    function render() {
      var q = state.q.toLowerCase();
      var list = all.filter(function (p) {
        if (state.kind === "lead" && !p.lead) return false;
        if (state.kind === "proc" && p.type !== "proc") return false;
        if (state.kind === "article" && p.type !== "article") return false;
        if (q && (p.title + " " + p.collab + " " + p.journal + " " + p.year).toLowerCase().indexOf(q) === -1) return false;
        return true;
      });
      list.sort(state.sort === "cites" ? function (a, b) { return (b.cites || 0) - (a.cites || 0); } : function (a, b) { return b.date < a.date ? -1 : b.date > a.date ? 1 : 0; });
      var total = list.length;
      if (limit) list = list.slice(0, limit); else list = list.slice(0, shown);
      pubList.innerHTML = list.map(function (p) {
        var url = p.manual ? (p.url || "#") : (p.doi ? "https://doi.org/" + p.doi : (p.arxiv ? "https://arxiv.org/abs/" + p.arxiv : "https://inspirehep.net/literature/" + p.id));
        var src = [];
        if (p.lead) src.push('<span class="tag lead">Small-author</span>');
        else if (p.collab) src.push('<span class="tag">' + esc(p.collab) + "</span>");
        if (p.type === "proc") src.push('<span class="tag">Proceedings</span>');
        if (p.type === "thesis") src.push('<span class="tag">Thesis</span>');
        if (p.journal) src.push("<span>" + esc(p.journal) + "</span>");
        if (p.arxiv) src.push('<a href="https://arxiv.org/abs/' + esc(p.arxiv) + '" target="_blank" rel="noopener">arXiv:' + esc(p.arxiv) + "</a>");
        if (p.note) src.push("<span>" + esc(p.note) + "</span>");
        if (p.id) src.push('<a href="https://inspirehep.net/literature/' + esc(p.id) + '" target="_blank" rel="noopener">INSPIRE</a>');
        return '<li class="pub"><span class="yr">' + esc(p.year) + '</span><div><h3><a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(p.title) + '</a></h3><div class="src">' + src.join("") + '</div></div><div class="cites">' + (p.cites == null ? "" : p.cites + "<small>cites</small>") + "</div></li>";
      }).join("") || '<li class="pub"><span></span><p>No papers match that filter.</p></li>';
      if (statusEl) statusEl.textContent = limit ? "" : total + " record" + (total === 1 ? "" : "s") + (liveDone ? " · live from INSPIRE-HEP" : "");
      var more = document.getElementById("pub-more");
      if (more) more.hidden = limit || shown >= total;
    }

    function fetchJSON(q) {
      var url = "https://inspirehep.net/api/literature?sort=mostrecent&size=250&q=" + encodeURIComponent(q) + "&fields=" + FIELDS;
      return fetch(url, { headers: { Accept: "application/json" } }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
    }

    // Papers you added by hand (data/papers.json) are merged with INSPIRE and never duplicated.
    function manualToRecord(p) {
      return { id: null, url: p.doi ? "https://doi.org/" + p.doi : (p.arxiv ? "https://arxiv.org/abs/" + p.arxiv : p.url),
        title: p.title, collab: p.collab || "", journal: p.journal || "", arxiv: p.arxiv || "", doi: p.doi || "", cites: null,
        year: String(p.year || ""), date: String(p.year || "0000"), authors: 0, type: p.type === "proc" ? "proc" : (p.type === "thesis" ? "thesis" : "article"),
        lead: false, note: p.note || "", manual: true };
    }
    var manual = [], inspire = [];
    function key(p) { return (p.arxiv || "").toLowerCase() || (p.doi || "").toLowerCase() || p.title.toLowerCase().replace(/[^a-z0-9]/g, ""); }
    function merge() {
      var seen = {};
      inspire.forEach(function (p) { seen[(p.arxiv || "").toLowerCase()] = 1; seen[(p.doi || "").toLowerCase()] = 1; seen[p.title.toLowerCase().replace(/[^a-z0-9]/g, "")] = 1; });
      all = inspire.concat(manual.filter(function (p) {
        return !(p.arxiv && seen[p.arxiv.toLowerCase()]) && !(p.doi && seen[p.doi.toLowerCase()]) && !seen[p.title.toLowerCase().replace(/[^a-z0-9]/g, "")];
      }));
      var stats = document.getElementById("pub-stats");
      if (stats && inspire.length) {
        var c = inspire.reduce(function (s, p) { return s + p.cites; }, 0);
        stats.textContent = inspire.length + " records · " + c.toLocaleString() + " citations";
      }
      render();
    }
    var liveDone = false;
    getJSON("data/papers.json").then(function (m) { manual = m.map(manualToRecord); }).catch(function () {})
      .then(function () {
        // 1) instant: the nightly copy saved in the site; 2) then the live list from INSPIRE
        getJSON("data/publications.json").then(function (d) {
          if (liveDone) return;
          var hits = (d.hits && d.hits.hits) || [];
          if (hits.length) inspire = hits.map(normalise);
          merge();
          if (statusEl && !limit && d.updated) statusEl.textContent = all.length + " records · updated " + d.updated.slice(0, 10);
        }).catch(function () { if (!liveDone) merge(); });
        return fetchJSON("authors.recid:" + AUTHOR_RECID)
          .then(function (d) { return d.hits && d.hits.total ? d : fetchJSON("a Haradhan.Adhikary.1"); })
          .then(function (d) { liveDone = true; var h = (d.hits.hits || []).map(normalise); if (h.length) inspire = h; merge(); })
          .catch(function () { if (statusEl && !inspire.length) statusEl.textContent = "Couldn't reach INSPIRE-HEP just now. Showing saved papers."; });
      });

    var search = document.getElementById("pub-search");
    if (search) search.addEventListener("input", function () { state.q = search.value; shown = 25; render(); });
    document.querySelectorAll("[data-kind]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.kind = b.getAttribute("data-kind"); shown = 25;
        document.querySelectorAll("[data-kind]").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        render();
      });
    });
    document.querySelectorAll("[data-sort]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.sort = b.getAttribute("data-sort");
        document.querySelectorAll("[data-sort]").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        render();
      });
    });
    var moreBtn = document.getElementById("pub-more");
    if (moreBtn) moreBtn.addEventListener("click", function () { shown += 25; render(); });
  }
})();
