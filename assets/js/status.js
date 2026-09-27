/* Weekly work log (status.html). Data: data/status.json
   Private weeks are AES-GCM encrypted in the browser with a passphrase (PBKDF2-SHA256),
   so their text is unreadable in the public repo. */
(function () {
  "use strict";

  /* ---------- crypto (shared with the Manage page) ---------- */
  var enc = new TextEncoder(), dec = new TextDecoder();
  function b64(buf) { var s = "", b = new Uint8Array(buf); for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
  function unb64(str) { var s = atob(str), b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }
  function deriveKey(pass, salt) {
    return crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]).then(function (k) {
      return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: 250000, hash: "SHA-256" }, k, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    });
  }
  var Crypto = window.StatusCrypto = {
    encrypt: function (obj, pass) {
      var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
      return deriveKey(pass, salt).then(function (key) {
        return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, enc.encode(JSON.stringify(obj)));
      }).then(function (ct) { return { v: 1, salt: b64(salt), iv: b64(iv), data: b64(ct) }; });
    },
    encryptBytes: function (buf, pass) {
      var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
      return deriveKey(pass, salt).then(function (key) { return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, buf); })
        .then(function (ct) { return { salt: b64(salt), iv: b64(iv), data: ct }; });
    },
    decryptBytes: function (buf, meta, pass) {
      return deriveKey(pass, unb64(meta.salt)).then(function (key) { return crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(meta.iv) }, key, buf); });
    },
    b64: b64,
    decrypt: function (box, pass) {
      return deriveKey(pass, unb64(box.salt)).then(function (key) {
        return crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv) }, key, unb64(box.data));
      }).then(function (pt) { return JSON.parse(dec.decode(pt)); });
    }
  };

  /* ---------- ISO week helpers (shared) ---------- */
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var Weeks = window.StatusWeeks = {
    monday: function (wk) {            // "2026-W39" -> Date (UTC Monday)
      var m = /^(\d{4})-W(\d{2})$/.exec(wk || ""); if (!m) return null;
      var y = +m[1], w = +m[2], jan4 = new Date(Date.UTC(y, 0, 4)), day = jan4.getUTCDay() || 7;
      var mon = new Date(jan4); mon.setUTCDate(jan4.getUTCDate() - day + 1 + (w - 1) * 7); return mon;
    },
    of: function (date) {              // Date -> "2026-W39"
      var d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())), day = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - day);
      var y = d.getUTCFullYear(), w = Math.ceil(((d - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
      return y + "-W" + (w < 10 ? "0" : "") + w;
    },
    label: function (wk) {
      var m = Weeks.monday(wk); if (!m) return wk;
      var s = new Date(m); s.setUTCDate(m.getUTCDate() + 6);
      var a = m.getUTCDate() + (m.getUTCMonth() !== s.getUTCMonth() ? " " + MON[m.getUTCMonth()] : "");
      return "Week " + (+wk.slice(6)) + " · " + a + "–" + s.getUTCDate() + " " + MON[s.getUTCMonth()] + " " + s.getUTCFullYear();
    },
    shift: function (wk, n) { var m = Weeks.monday(wk); m.setUTCDate(m.getUTCDate() + 7 * n); return Weeks.of(new Date(m.getUTCFullYear(), m.getUTCMonth(), m.getUTCDate())); }
  };

  var root = document.getElementById("st-weeks");
  if (!root) return;                   // only the Status page renders below

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function store(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }

  var data = { projects: [], weeks: [] }, unlocked = {}, filter = "all", q = "";
  var projById = {};
  var STATUS = { active: "Active", paused: "Paused", done: "Completed", planned: "Planned" };

  function weekContent(w) { return w.private ? unlocked[w.week] : w; }   // null if still locked
  function sortedWeeks() { return data.weeks.slice().sort(function (a, b) { return b.week.localeCompare(a.week); }); }

  /* ---------- this week banner ---------- */
  function renderNow() {
    var cur = Weeks.of(new Date()), ws = sortedWeeks(), last = ws[0];
    var has = ws.some(function (w) { return w.week === cur; });
    var streak = 0, wk = has ? cur : Weeks.shift(cur, -1);
    var set = {}; ws.forEach(function (w) { set[w.week] = 1; });
    while (set[wk]) { streak++; wk = Weeks.shift(wk, -1); }
    document.getElementById("st-now").innerHTML =
      '<div><span class="eyebrow">This week</span><strong>' + esc(Weeks.label(cur)) + "</strong></div>" +
      '<div><span class="eyebrow">Last update</span><strong>' + (last ? esc(Weeks.label(last.week).split(" · ")[0]) : "None yet") + "</strong></div>" +
      '<div><span class="eyebrow">Updates</span><strong>' + ws.length + "</strong></div>" +
      '<div><span class="eyebrow">Streak</span><strong>' + streak + " week" + (streak === 1 ? "" : "s") + "</strong></div>";
  }

  /* ---------- project cards ---------- */
  function history(pid) {             // [{week, progress, entry}] oldest -> newest, from readable weeks
    var out = [];
    sortedWeeks().slice().reverse().forEach(function (w) {
      var c = weekContent(w); if (!c) return;
      (c.entries || []).forEach(function (e) { if (e.project === pid) out.push({ week: w.week, progress: +e.progress || 0, entry: e }); });
    });
    return out;
  }
  function spark(points, color) {
    if (points.length < 2) return "";
    var W = 120, H = 28, n = points.length;
    var xy = points.map(function (p, i) { return [(i / (n - 1)) * (W - 4) + 2, H - 3 - (p / 100) * (H - 6)]; });
    var d = xy.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join("");
    var last = xy[n - 1];
    return '<svg class="spark" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" aria-hidden="true">' +
      '<path d="' + d + " L" + last[0].toFixed(1) + " " + (H - 1) + " L2 " + (H - 1) + 'Z" fill="' + color + '" fill-opacity=".12"/>' +
      '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="2.6" fill="' + color + '"/></svg>';
  }
  function renderProjects() {
    var box = document.getElementById("st-projects");
    var ps = data.projects.slice().sort(function (a, b) { return (a.status === "done") - (b.status === "done"); });
    document.getElementById("st-proj-count").textContent = ps.filter(function (p) { return p.status === "active"; }).length + " active";
    box.innerHTML = ps.map(function (p) {
      var h = history(p.id), last = h[h.length - 1], prog = last ? last.progress : 0;
      var next = last && last.entry.plan && last.entry.plan[0];
      return '<article class="st-proj" style="--pc:' + esc(p.color || "#2446c7") + '">' +
        '<div class="st-proj-top"><span class="st-dot" aria-hidden="true"></span><span class="pill st-' + esc(p.status || "active") + '">' + esc(STATUS[p.status] || "Active") + "</span>" + (p.collab ? '<span class="st-collab">' + esc(p.collab) + "</span>" : "") + "</div>" +
        "<h3>" + esc(p.name) + "</h3>" +
        (p.description ? '<p class="st-desc">' + esc(p.description) + "</p>" : "") +
        '<div class="st-prog"><div class="bar"><i style="width:' + prog + '%"></i></div><span class="mono">' + prog + "%</span></div>" +
        '<div class="st-proj-foot"><span>' + (last ? "Updated " + esc(Weeks.label(last.week).split(" · ")[0]) : "No updates yet") + "</span>" + spark(h.map(function (x) { return x.progress; }), p.color || "#2446c7") + "</div>" +
        (next ? '<p class="st-next"><b>Next</b> ' + esc(next) + "</p>" : "") +
        "</article>";
    }).join("") || '<p class="muted">No projects yet.</p>';
  }

  /* ---------- activity strip ---------- */
  function renderActivity() {
    var cur = Weeks.of(new Date()), map = {};
    data.weeks.forEach(function (w) { var c = weekContent(w); map[w.week] = { n: c ? (c.entries || []).length : 1, locked: !!w.private && !c }; });
    var cells = [];
    for (var i = 25; i >= 0; i--) {
      var wk = Weeks.shift(cur, -i), m = map[wk], lvl = m ? Math.min(4, m.n) : 0;
      cells.push('<a role="listitem" class="st-cell l' + lvl + (m && m.locked ? " locked" : "") + (wk === cur ? " now" : "") + '" ' + (m ? 'href="#w-' + wk + '"' : "") +
        ' title="' + esc(Weeks.label(wk)) + (m ? " · " + (m.locked ? "private" : m.n + " project" + (m.n === 1 ? "" : "s")) : " · no update") + '"></a>');
    }
    document.getElementById("st-activity").innerHTML = cells.join("");
  }

  /* ---------- filters ---------- */
  function renderFilter() {
    var box = document.getElementById("st-filter");
    box.innerHTML = '<button type="button" data-f="all" aria-pressed="' + (filter === "all") + '">All projects</button>' +
      data.projects.map(function (p) { return '<button type="button" data-f="' + esc(p.id) + '" aria-pressed="' + (filter === p.id) + '"><span class="st-dot sm" style="--pc:' + esc(p.color) + '"></span>' + esc(p.name) + "</button>"; }).join("");
  }
  document.getElementById("st-filter").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return; filter = b.getAttribute("data-f"); renderFilter(); renderWeeks();
  });
  document.getElementById("st-search").addEventListener("input", function (e) { q = e.target.value.trim().toLowerCase(); renderWeeks(); });

  /* ---------- week list ---------- */
  function list(items, cls, label) {
    items = (items || []).filter(Boolean); if (!items.length) return "";
    return '<div class="st-col ' + cls + '"><h4>' + label + '</h4><ul>' + items.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>";
  }
  function renderWeeks() {
    var ws = sortedWeeks(), locked = 0, html = [];
    ws.forEach(function (w, wi) {
      var c = weekContent(w);
      if (!c) {
        locked++;
        if (filter === "all" && !q) html.push('<article class="st-week locked" id="w-' + esc(w.week) + '"><header><h3>' + esc(Weeks.label(w.week)) + '</h3><span class="pill">🔒 Private</span></header><p class="muted">This update is private.</p></article>');
        return;
      }
      var entries = (c.entries || []).filter(function (e) { return filter === "all" || e.project === filter; });
      if (q) entries = entries.filter(function (e) {
        var p = projById[e.project] || {};
        return [p.name, e.note].concat(e.done || [], e.plan || [], e.blockers || []).join(" ").toLowerCase().indexOf(q) > -1 || (c.summary || "").toLowerCase().indexOf(q) > -1;
      });
      if (!entries.length && (filter !== "all" || q)) return;
      html.push('<article class="st-week" id="w-' + esc(w.week) + '">' +
        "<header><h3>" + esc(Weeks.label(w.week)) + "</h3>" + (w.private ? '<span class="pill">🔓 Private</span>' : "") + (wi === 0 ? '<span class="pill st-active">Latest</span>' : "") + "</header>" +
        (c.summary ? '<p class="st-summary">' + esc(c.summary) + "</p>" : "") +
        entries.map(function (e) {
          var p = projById[e.project] || { name: e.project, color: "#56647d" };
          return '<section class="st-entry" style="--pc:' + esc(p.color) + '"><div class="st-entry-head"><span class="st-dot" aria-hidden="true"></span><h4>' + esc(p.name) + "</h4>" +
            (e.progress != null && e.progress !== "" ? '<div class="st-prog sm"><div class="bar"><i style="width:' + (+e.progress) + '%"></i></div><span class="mono">' + (+e.progress) + "%</span></div>" : "") + "</div>" +
            '<div class="st-cols">' + list(e.done, "done", "Done") + list(e.plan, "plan", "Plan for next week") + list(e.blockers, "block", "Blockers") + "</div>" +
            (e.note ? '<p class="st-note">' + esc(e.note) + "</p>" : "") + "</section>";
        }).join("") + filesBlock(w, c) + "</article>");
    });
    root.innerHTML = html.join("") || '<p class="pub-status">' + (data.weeks.length ? "No updates match that filter." : "No weekly updates yet.") + "</p>";
    var ub = document.getElementById("st-unlock");
    ub.hidden = !locked; document.getElementById("st-locked-n").textContent = locked;
  }

  function size(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
  function icon(name) { var e = (name.split(".").pop() || "").toLowerCase(); return { pdf: "PDF", ppt: "PPT", pptx: "PPT", key: "KEY", png: "IMG", jpg: "IMG", jpeg: "IMG", zip: "ZIP" }[e] || "FILE"; }
  function filesBlock(w, c) {
    var fs = (c.files || []).filter(function (f) { return filter === "all" || !f.project || f.project === filter; });
    if (!fs.length) return "";
    return '<div class="st-files"><h4>Slides &amp; files</h4><ul>' + fs.map(function (f) {
      var p = projById[f.project], tag = p ? '<span class="st-ftag"><span class="st-dot sm" style="--pc:' + esc(p.color) + '"></span>' + esc(p.name) + "</span>" : "";
      var inner = '<span class="st-ficon">' + icon(f.name) + '</span><span class="st-fname">' + esc(f.name) + '</span><span class="st-fsize">' + size(f.size || 0) + (w.private ? " · 🔒" : "") + "</span>";
      return "<li>" + (w.private
        ? '<button type="button" class="st-file" data-week="' + esc(w.week) + '" data-path="' + esc(f.path) + '">' + inner + "</button>"
        : '<a class="st-file" href="' + esc(f.path) + '" target="_blank" rel="noopener">' + inner + "</a>") + tag + "</li>";
    }).join("") + "</ul></div>";
  }
  // private files: fetch the encrypted copy, decrypt in the browser, show it in an on-page viewer
  var viewer = document.createElement("div");
  viewer.className = "st-viewer"; viewer.hidden = true; viewer.setAttribute("role", "dialog"); viewer.setAttribute("aria-modal", "true");
  viewer.innerHTML = '<div class="st-vbar"><strong class="st-vname"></strong><a class="btn st-vdl" download>Download</a><button type="button" class="btn st-vclose">Close</button></div><div class="st-vbody"></div>';
  document.body.appendChild(viewer);
  var vUrl = null;
  function closeViewer() { viewer.hidden = true; viewer.querySelector(".st-vbody").innerHTML = ""; if (vUrl) URL.revokeObjectURL(vUrl); vUrl = null; document.body.style.overflow = ""; }
  viewer.querySelector(".st-vclose").addEventListener("click", closeViewer);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !viewer.hidden) closeViewer(); });
  root.addEventListener("click", function (e) {
    var b = e.target.closest("button.st-file"); if (!b) return;
    var w = data.weeks.filter(function (x) { return x.week === b.getAttribute("data-week"); })[0], c = w && unlocked[w.week];
    var f = c && (c.files || []).filter(function (x) { return x.path === b.getAttribute("data-path"); })[0];
    var pass = store("st_pass"); if (!f || !pass) return;
    var label = b.querySelector(".st-fsize"), old = label.textContent; label.textContent = "Decrypting…";
    fetch(f.path + "?v=" + encodeURIComponent(w.updated || "")).then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(function (buf) { return Crypto.decryptBytes(buf, f.enc, pass); })
      .then(function (pt) {
        vUrl = URL.createObjectURL(new Blob([pt], { type: f.type || "application/octet-stream" }));
        viewer.querySelector(".st-vname").textContent = f.name;
        var dl = viewer.querySelector(".st-vdl"); dl.href = vUrl; dl.download = f.name;
        var body = viewer.querySelector(".st-vbody");
        if (/pdf/.test(f.type || "") || /\.pdf$/i.test(f.name)) body.innerHTML = '<iframe title="' + esc(f.name) + '" src="' + vUrl + '"></iframe>';
        else if (/^image\//.test(f.type || "")) body.innerHTML = '<img alt="' + esc(f.name) + '" src="' + vUrl + '">';
        else body.innerHTML = '<p class="st-vnote">This file type can\'t be previewed here. Use Download to open it.</p>';
        viewer.hidden = false; document.body.style.overflow = "hidden"; viewer.querySelector(".st-vclose").focus();
        label.textContent = old;
      }).catch(function () { label.textContent = "Couldn't open this file"; });
  });

  function renderAll() { renderNow(); renderProjects(); renderActivity(); renderFilter(); renderWeeks(); }

  /* ---------- unlocking private weeks ---------- */
  function tryUnlock(pass, quiet) {
    var priv = data.weeks.filter(function (w) { return w.private && !unlocked[w.week]; });
    if (!priv.length) return Promise.resolve(0);
    return Promise.all(priv.map(function (w) {
      return Crypto.decrypt(w.enc, pass).then(function (c) { unlocked[w.week] = c; return 1; }, function () { return 0; });
    })).then(function (r) {
      var n = r.reduce(function (a, b) { return a + b; }, 0);
      if (n) store("st_pass", pass);
      if (!quiet) { var m = document.getElementById("st-unlock-msg"); m.textContent = n ? "Unlocked " + n + "." : "Wrong passphrase."; m.className = "msg " + (n ? "ok" : "err"); }
      renderAll(); return n;
    });
  }
  document.getElementById("st-unlock-form").addEventListener("submit", function (e) {
    e.preventDefault(); var p = document.getElementById("st-pass").value; if (p) tryUnlock(p);
  });

  fetch("data/status.json?v=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (d) {
    data = { projects: d.projects || [], weeks: d.weeks || [] };
    data.projects.forEach(function (p) { projById[p.id] = p; });
    renderAll();
    var saved = store("st_pass"); if (saved) tryUnlock(saved, true);
    if (location.hash) { var t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
  }).catch(function () { root.innerHTML = '<p class="pub-status">Couldn\'t load the work log. Please refresh.</p>'; });
})();
