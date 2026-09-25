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
    var KINDS = [["invited", "Invited talks"], ["talk", "Conference talks"], ["school", "Schools"], ["poster", "Posters"]];
    function card(x) {
      return '<article class="card"><span class="meta">' + esc([fmtDate(x.date), x.place].filter(Boolean).join(" · ")) + "</span>" +
        "<h3>" + esc(x.title || x.event) + "</h3>" +
        (x.title ? "<p><strong>" + esc(x.event) + "</strong></p>" : "") +
        (x.description ? "<p>" + esc(x.description) + "</p>" : "") +
        '<div class="foot">' + (x.url ? '<a class="link-arrow" href="' + esc(x.url) + '" target="_blank" rel="noopener">Details</a>' : "") +
        (x.proceedings && x.proceedings.url ? '<a class="proc" href="' + esc(x.proceedings.url) + '" target="_blank" rel="noopener">Proceedings: ' + esc(x.proceedings.label || "link") + "</a>" : "") + "</div></article>";
    }
    getJSON("data/talks.json").then(function (t) {
      t.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
      var html = KINDS.map(function (k) {
        var items = t.filter(function (x) { return (x.kind || "talk") === k[0]; });
        if (!items.length) return "";
        return '<section class="talk-group"><h2>' + k[1] + ' <span class="n">' + items.length + '</span></h2><div class="cards">' + items.map(card).join("") + "</div></section>";
      }).join("");
      talkList.classList.remove("cards");
      talkList.innerHTML = html || '<p class="pub-status">No talks listed yet.</p>';
    }).catch(function () { talkList.innerHTML = '<p class="pub-status">Couldn\'t load talks. Please refresh the page.</p>'; });
  }

  /* ---------- highlighted papers: shared state (data/papers.json, entries with featured:true) ---------- */
  var HL = window.SiteHL = {
    papers: [], shown: [],
    keys: function (p) {   // identifiers of a paper, for matching INSPIRE records with highlighted entries
      var k = [];
      if (p.inspire) k.push("i:" + p.inspire);
      if (p.id && /^\d+$/.test(String(p.id))) k.push("i:" + p.id);
      if (p.doi) k.push("d:" + String(p.doi).toLowerCase());
      if (p.arxiv) k.push("a:" + String(p.arxiv).toLowerCase());
      return k;
    },
    find: function (p) {
      var ks = HL.keys(p);
      for (var i = 0; i < HL.papers.length; i++) {
        var q = HL.papers[i]; if (!q.featured) continue;
        if (HL.keys(q).some(function (k) { return ks.indexOf(k) > -1; })) return i;
      }
      return -1;
    },
    isFeatured: function (p) { return HL.find(p) > -1; },
    renderFeatured: function () {}, renderList: function () {}
  };

  /* ---------- highlighted publications section ---------- */
  var feat = document.getElementById("pub-featured");
  HL.renderFeatured = function () {
    if (!feat) return;
    var f = HL.papers.filter(function (p) { return p.featured; });
    var max = parseInt(feat.getAttribute("data-limit") || "0", 10); if (max) f = f.slice(0, max);
    feat.innerHTML = f.map(function (p) {
      var url = p.doi ? "https://doi.org/" + p.doi : (p.arxiv ? "https://arxiv.org/abs/" + p.arxiv : (p.url || (p.inspire ? "https://inspirehep.net/literature/" + p.inspire : "#")));
      return '<li><span class="venue">' + esc(p.journal || p.year) + '</span><h3><a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(p.title) + '</a></h3><span class="who">' + esc(p.collab) + (p.note ? " · " + esc(p.note) : "") + "</span></li>";
    }).join("");
    feat.hidden = !f.length;
  };
  getJSON("data/papers.json").then(function (ps) {
    HL.papers = ps; HL.renderFeatured(); HL.renderList();
  }).catch(function () { if (feat) feat.hidden = true; });

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
      HL.shown = list;
      pubList.innerHTML = list.map(function (p, i) {
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
        return '<li class="pub"><span class="yr">' + esc(p.year) + '</span><div><h3><a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(p.title) + '</a></h3><div class="src">' + src.join("") + '</div></div><div class="cites">' + (p.cites == null ? "" : p.cites + "<small>cites</small>") +
          (function () { var on = HL.isFeatured(p); return '<button type="button" class="hl-btn" data-i="' + i + '" aria-pressed="' + on + '" title="' + (on ? "Remove from Highlighted" : "Add to Highlighted") + '">' + (on ? "★" : "☆") + "</button>"; })() + "</div></li>";
      }).join("") || '<li class="pub"><span></span><p>No papers match that filter.</p></li>';
      if (statusEl) statusEl.textContent = limit ? "" : total + " record" + (total === 1 ? "" : "s") + (liveDone ? " · live from INSPIRE-HEP" : "");
      var more = document.getElementById("pub-more");
      if (more) more.hidden = limit || shown >= total;
    }

    function fetchJSON(q) {
      var url = "https://inspirehep.net/api/literature?sort=mostrecent&size=250&q=" + encodeURIComponent(q) + "&fields=" + FIELDS;
      return fetch(url, { headers: { Accept: "application/json" } }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
    }

    // "All publications" comes only from INSPIRE-HEP: first the nightly copy saved in the site, then the live list.
    var inspire = [], liveDone = false;
    function show() {
      all = inspire;
      var stats = document.getElementById("pub-stats");
      if (stats && inspire.length) {
        var c = inspire.reduce(function (s, p) { return s + p.cites; }, 0);
        stats.textContent = inspire.length + " records · " + c.toLocaleString() + " citations";
      }
      render();
    }
    HL.renderList = function () { if (all.length) render(); };
    getJSON("data/publications.json").then(function (d) {
      if (liveDone) return;
      var hits = (d.hits && d.hits.hits) || [];
      if (!hits.length) return;
      inspire = hits.map(normalise); show();
      if (statusEl && !limit && d.updated) statusEl.textContent = all.length + " records · saved " + d.updated.slice(0, 10) + " · refreshing…";
    }).catch(function () {});
    fetchJSON("authors.recid:" + AUTHOR_RECID)
      .then(function (d) { return d.hits && d.hits.total ? d : fetchJSON("a Haradhan.Adhikary.1"); })
      .then(function (d) { liveDone = true; var h = (d.hits.hits || []).map(normalise); if (h.length) { inspire = h; show(); } })
      .catch(function () {
        if (statusEl && !inspire.length) statusEl.innerHTML = 'Couldn\'t reach INSPIRE-HEP just now. <a href="https://inspirehep.net/authors/' + AUTHOR_RECID + '" target="_blank" rel="noopener">See the full list on INSPIRE-HEP</a>.';
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

/* ---------- crossing fields: heavy-ion collision → one neutrino ring ---------- */
(function () {
  "use strict";
  var cv = document.getElementById("crossing-canvas");
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext("2d");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var W, H, tracks = [], pmts = [], ring = [], seed = 11, CYCLE = 9000;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  var warm = ["#ffb347", "#ff8a4c", "#ffd36b", "#ff6f61", "#f6c35b"];
  var ringStops = [[25, 195, 255], [61, 255, 160], [255, 225, 77]];
  function rc(x) { x = Math.max(0, Math.min(.999, x)) * 2; var i = Math.floor(x), f = x - i, a = ringStops[i], b = ringStops[i + 1]; return "rgb(" + (a[0] + (b[0] - a[0]) * f | 0) + "," + (a[1] + (b[1] - a[1]) * f | 0) + "," + (a[2] + (b[2] - a[2]) * f | 0) + ")"; }

  function geom() { var m = W < 560; return { vx: W * (m ? .24 : .2), vy: H * .5, rx: W * (m ? .73 : .79), ry: H * .5, R: Math.min(H * .3, W * (m ? .19 : .13)) }; }

  function build() {
    var r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed = 11; tracks = []; pmts = []; ring = [];
    var g = geom(), n = W < 500 ? 90 : 170, reach = Math.min(W * .19, H * .46);
    for (var i = 0; i < n; i++) {
      var ang = rnd() * Math.PI * 2, len = reach * (.35 + rnd() * .75), curv = (rnd() - .5) * (rnd() < .3 ? .03 : .008);
      tracks.push({ a: ang, len: len, k: curv, c: warm[(rnd() * warm.length) | 0], w: .6 + rnd() * .9, d: rnd() * .35 });
    }
    var pitch = Math.max(8, Math.min(W, H) / 26), half = g.R * 1.9;
    for (var y = g.ry - half; y <= g.ry + half; y += pitch * .866) {
      var row = Math.round((y - g.ry) / (pitch * .866));
      for (var x = g.rx - half + (row % 2 ? pitch / 2 : 0); x <= g.rx + half; x += pitch) pmts.push({ x: x, y: y });
    }
    pmts.forEach(function (p) {
      var dx = p.x - g.rx, dy = p.y - g.ry, d = Math.sqrt(dx * dx + dy * dy), on = Math.exp(-Math.pow((d - g.R) / Math.max(g.R * .07, pitch * .55), 2));
      if (rnd() < on * .95) ring.push({ x: p.x, y: p.y, t: .5 + .4 * Math.cos(Math.atan2(dy, dx) - .6), q: .6 + rnd() * .6, d: rnd() });
    });
    cv._pitch = pitch;
  }

  function trackPath(t, frac) {
    var g = geom(), x = g.vx, y = g.vy, a = t.a, steps = 18, ds = t.len * frac / steps;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (var i = 0; i < steps; i++) { a += t.k * ds; x += Math.cos(a) * ds; y += Math.sin(a) * ds; ctx.lineTo(x, y); }
  }

  function draw(ms) {
    var g = geom(), p = ms / CYCLE;                       // p in [0,1): burst → neutrino → ring → hold
    var burst = Math.min(1, p / .22), nu = Math.max(0, Math.min(1, (p - .24) / .22)), glow = Math.max(0, Math.min(1, (p - .44) / .14));
    var fade = p > .9 ? 1 - (p - .9) / .1 : 1;
    ctx.fillStyle = "#070b14"; ctx.fillRect(0, 0, W, H);
    // faint TPC outline on the left, detector wall on the right
    ctx.strokeStyle = "rgba(255,190,110,.10)"; ctx.lineWidth = 1;
    ctx.strokeRect(g.vx - W * .17, g.vy - H * .4, W * .34, H * .8);
    ctx.fillStyle = "#172038";
    var pr = cv._pitch * .33;
    pmts.forEach(function (q) { ctx.beginPath(); ctx.arc(q.x, q.y, pr, 0, 6.283); ctx.fill(); });
    // heavy-ion tracks
    ctx.lineCap = "round";
    tracks.forEach(function (t) {
      var f = Math.max(0, Math.min(1, (burst - t.d) / (1 - t.d)));
      if (f <= 0) return;
      ctx.globalAlpha = .75 * fade; ctx.strokeStyle = t.c; ctx.lineWidth = t.w;
      trackPath(t, f); ctx.stroke();
    });
    ctx.globalAlpha = fade; ctx.fillStyle = "#fff4e0";
    ctx.beginPath(); ctx.arc(g.vx, g.vy, 3, 0, 6.283); ctx.fill();
    // the neutrino: invisible in reality, drawn dashed
    if (nu > 0) {
      var x0 = g.vx + W * .02, x1 = g.rx - g.R * .15, xe = x0 + (x1 - x0) * nu;
      ctx.globalAlpha = .9 * fade; ctx.setLineDash([6, 7]); ctx.strokeStyle = "#9fb6ff"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x0, g.vy); ctx.lineTo(xe, g.ry); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#cfdcff"; ctx.beginPath(); ctx.arc(xe, g.ry, 2.5, 0, 6.283); ctx.fill();
      ctx.font = "600 " + Math.max(13, H * .06) + "px Spectral, Georgia, serif"; ctx.fillStyle = "#cfdcff";
      ctx.fillText("ν", (x0 + x1) / 2 - 5, g.vy - 10);
    }
    // Cherenkov ring
    ring.forEach(function (h) {
      var a = Math.max(0, Math.min(1, (glow - h.d * .5) / .5)); if (a <= 0) return;
      ctx.globalAlpha = a * fade; ctx.fillStyle = rc(h.t);
      ctx.beginPath(); ctx.arc(h.x, h.y, pr * (.6 + h.q * .5), 0, 6.283); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  var start = 0, running = false, visible = true, raf;
  var HOLD = .8 * CYCLE;                                   // the complete picture
  function loop(now) {
    if (!running) return;
    draw((now - start) % CYCLE);
    raf = requestAnimationFrame(loop);
  }
  function play() { if (reduce || running || !visible) return; running = true; start = performance.now() - HOLD; raf = requestAnimationFrame(loop); }
  function stop() { running = false; cancelAnimationFrame(raf); }
  build(); draw(HOLD);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (e) { visible = e[0].isIntersecting; visible ? play() : stop(); }, { threshold: .2 }).observe(cv);
  } else play();
  var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { build(); if (!running) draw(HOLD); }, 150); });
})();
