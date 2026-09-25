/* Site manager: writes photos, papers and talks into the GitHub repo.
   The key never leaves this browser except in requests to api.github.com. */
(function () {
  "use strict";
  var REPO = { owner: "hadhikart2k", repo: "HAwebsite", branch: "main" };
  var KEY = "gh_site_token";

  function getToken() {
    try { return localStorage.getItem(KEY) || sessionStorage.getItem(KEY); } catch (e) { return null; }
  }
  function setToken(t, remember) {
    try { (remember ? localStorage : sessionStorage).setItem(KEY, t); } catch (e) { /* storage blocked */ }
  }
  function clearToken() { try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch (e) {} }

  var onAdminPage = !!document.getElementById("admin-app");
  var token = getToken();

  /* ---------- on normal pages: reveal owner buttons ---------- */
  if (!onAdminPage) {
    if (!token) return;
    document.querySelectorAll(".admin-only").forEach(function (el) { el.hidden = false; });
    var pill = document.createElement("a");
    pill.href = "admin.html"; pill.className = "btn primary manage-pill"; pill.textContent = "Manage site";
    document.body.appendChild(pill);
    return;
  }

  /* ---------- GitHub API helpers ---------- */
  var API = "https://api.github.com/repos/" + REPO.owner + "/" + REPO.repo;
  function gh(path, opts) {
    opts = opts || {};
    return fetch(path.indexOf("http") === 0 ? path : API + path, {
      method: opts.method || "GET",
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: "no-store"
    }).then(function (r) {
      if (r.status === 204) return null;
      return r.json().then(function (j) {
        if (!r.ok) { var e = new Error(j.message || ("GitHub error " + r.status)); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function b64utf8(str) { return btoa(unescape(encodeURIComponent(str))); }
  function fromB64utf8(b) { return decodeURIComponent(escape(atob(b.replace(/\n/g, "")))); }
  function fileB64(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result).split(",")[1]); };
      fr.onerror = rej; fr.readAsDataURL(file);
    });
  }
  function readJSON(path) {
    return gh("/contents/" + path + "?ref=" + REPO.branch).then(function (j) { return JSON.parse(fromB64utf8(j.content)); })
      .catch(function (e) { if (e.status === 404) return []; throw e; });
  }
  /* One commit for any number of files. changes: [{path, b64}|{path, text}|{path, remove:true}] */
  function commit(changes, message, attempt) {
    attempt = attempt || 1;
    var head;
    return gh("/git/ref/heads/" + REPO.branch).then(function (ref) {
      head = ref.object.sha;
      return gh("/git/commits/" + head);
    }).then(function (c) {
      return Promise.all(changes.map(function (ch) {
        if (ch.remove) return Promise.resolve({ path: ch.path, mode: "100644", type: "blob", sha: null });
        var content = ch.b64 != null ? ch.b64 : b64utf8(ch.text);
        return gh("/git/blobs", { method: "POST", body: { content: content, encoding: "base64" } })
          .then(function (b) { return { path: ch.path, mode: "100644", type: "blob", sha: b.sha }; });
      })).then(function (tree) {
        return gh("/git/trees", { method: "POST", body: { base_tree: c.tree.sha, tree: tree } });
      });
    }).then(function (t) {
      return gh("/git/commits", { method: "POST", body: { message: message, tree: t.sha, parents: [head] } });
    }).then(function (nc) {
      return gh("/git/refs/heads/" + REPO.branch, { method: "PATCH", body: { sha: nc.sha } });
    }).catch(function (e) {
      if (e.status === 422 && attempt < 3) return commit(changes, message, attempt + 1);   // someone else pushed; retry on top
      throw e;
    });
  }
  function msg(id, text, kind) { var el = document.getElementById(id); el.textContent = text; el.className = "msg" + (kind ? " " + kind : ""); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "item"; }
  function stamp() { var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; }; return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()); }
  var LIVE_NOTE = " Live on the site in about 2 minutes.";

  /* ---------- unlock ---------- */
  var unlockSec = document.getElementById("unlock"), app = document.getElementById("admin-app");
  document.getElementById("actions-link").href = "https://github.com/" + REPO.owner + "/" + REPO.repo + "/actions";

  function start() {
    return gh("").then(function (r) {
      if (!r.permissions || !r.permissions.push) throw new Error("This key can read the repository but not change it. Set Contents to “Read and write”.");
      return gh("https://api.github.com/user").catch(function () { return {}; });
    }).then(function (u) {
      unlockSec.hidden = true; app.hidden = false;
      document.getElementById("admin-who").textContent = "Signed in" + (u.login ? " as " + u.login : "") + " · " + REPO.owner + "/" + REPO.repo;
      loadGallery(); loadPapers(); loadTalks();
      if (location.hash) { var t = document.querySelector(location.hash); if (t) t.scrollIntoView(); }
    });
  }
  document.getElementById("unlock-form").addEventListener("submit", function (e) {
    e.preventDefault();
    token = document.getElementById("gh-token").value.trim();
    msg("unlock-msg", "Checking the key…");
    start().then(function () {
      setToken(token, document.getElementById("gh-remember").checked);
    }).catch(function (err) {
      token = null;
      msg("unlock-msg", err.status === 401 ? "GitHub didn't accept that key. Check it was copied in full and hasn't expired." : (err.status === 404 ? "The key can't see the HAwebsite repository. Give it access to that repository." : err.message), "err");
    });
  });
  document.getElementById("lock-btn").addEventListener("click", function () { clearToken(); location.reload(); });
  if (token) start().catch(function () { clearToken(); token = null; msg("unlock-msg", "Your saved key no longer works. Paste a new one.", "err"); });

  /* ---------- photos: upload ---------- */
  var files = [];
  var fileInput = document.getElementById("photo-files"), list = document.getElementById("photo-list");
  fileInput.addEventListener("change", function () {
    files = Array.prototype.slice.call(fileInput.files);
    list.innerHTML = files.map(function (f, i) {
      var previewable = /image\/(jpeg|png|webp|gif)/.test(f.type);
      var ph = previewable ? '<img class="ph" alt="" src="' + URL.createObjectURL(f) + '">' : '<span class="ph">' + esc((f.name.split(".").pop() || "").toUpperCase()) + "</span>";
      return '<div class="upload-item">' + ph + '<div><input id="cap-' + i + '" placeholder="Caption (optional)" aria-label="Caption for ' + esc(f.name) + '"><small>' + esc(f.name) + " · " + (f.size / 1048576).toFixed(1) + " MB</small></div></div>";
    }).join("");
  });
  document.getElementById("photo-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!files.length) return;
    var big = files.filter(function (f) { return f.size > 45 * 1048576; });
    if (big.length) { msg("photo-msg", big[0].name + " is larger than 45 MB. Please pick a smaller file.", "err"); return; }
    var cat = document.getElementById("photo-cat").value, base = stamp();
    var btn = e.target.querySelector("button[type=submit]"); btn.disabled = true;
    msg("photo-msg", "Uploading " + files.length + " photo" + (files.length > 1 ? "s" : "") + "…");
    Promise.all(files.map(function (f, i) {
      return fileB64(f).then(function (b64) {
        var ext = (f.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
        var id = base + "-" + (i + 1) + "-" + slug(f.name.replace(/\.[^.]+$/, ""));
        var meta = { caption: document.getElementById("cap-" + i).value.trim(), category: cat, added: new Date().toISOString() };
        return [{ path: "photos/new/" + id + "." + ext, b64: b64 }, { path: "photos/new/" + id + ".json", text: JSON.stringify(meta, null, 1) }];
      });
    })).then(function (pairs) {
      return commit([].concat.apply([], pairs), "Add " + files.length + " photo" + (files.length > 1 ? "s" : "") + " via site manager");
    }).then(function () {
      msg("photo-msg", "Uploaded." + LIVE_NOTE + " HEIC photos are converted automatically.", "ok");
      e.target.reset(); list.innerHTML = ""; files = [];
    }).catch(function (err) { msg("photo-msg", "Upload failed: " + err.message, "err"); })
      .then(function () { btn.disabled = false; });
  });

  /* ---------- photos: edit gallery ---------- */
  var gallery = [], galleryDirty = false;
  var saveBtn = document.getElementById("gallery-save");
  function loadGallery() {
    readJSON("data/gallery.json").then(function (g) {
      gallery = g;
      var box = document.getElementById("gallery-admin");
      box.innerHTML = g.map(function (p, i) {
        return '<div class="admin-thumb" data-i="' + i + '"><img src="' + esc(p.thumb) + '" alt="" loading="lazy">' +
          '<input data-f="caption" value="' + esc(p.caption) + '" aria-label="Caption">' +
          '<select data-f="category" aria-label="Category">' + ["science", "people", "travel"].map(function (c) { return "<option" + (c === p.category ? " selected" : "") + ">" + c + "</option>"; }).join("") + "</select>" +
          '<label><input type="checkbox" data-f="remove"> Remove</label></div>';
      }).join("") || '<p class="muted">No photos yet.</p>';
      galleryDirty = false; saveBtn.disabled = true;
    }).catch(function (err) { msg("gallery-msg", "Couldn't load the gallery: " + err.message, "err"); });
  }
  document.getElementById("gallery-admin").addEventListener("input", function (e) {
    var card = e.target.closest(".admin-thumb"); if (!card) return;
    if (e.target.getAttribute("data-f") === "remove") card.classList.toggle("remove", e.target.checked);
    galleryDirty = true; saveBtn.disabled = false;
  });
  saveBtn.addEventListener("click", function () {
    if (!galleryDirty) return;
    var keep = [], changes = [], removed = 0;
    document.querySelectorAll("#gallery-admin .admin-thumb").forEach(function (card) {
      var p = gallery[+card.getAttribute("data-i")];
      if (card.querySelector('[data-f="remove"]').checked) {
        removed++;
        changes.push({ path: p.full, remove: true }, { path: p.thumb, remove: true });
        return;
      }
      p.caption = card.querySelector('[data-f="caption"]').value.trim();
      p.category = card.querySelector('[data-f="category"]').value;
      keep.push(p);
    });
    changes.push({ path: "data/gallery.json", text: JSON.stringify(keep, null, 1) + "\n" });
    saveBtn.disabled = true; msg("gallery-msg", "Saving…");
    commit(changes, "Update gallery" + (removed ? " (remove " + removed + ")" : "") + " via site manager")
      .then(function () { msg("gallery-msg", "Saved." + LIVE_NOTE, "ok"); loadGallery(); })
      .catch(function (err) { msg("gallery-msg", "Save failed: " + err.message, "err"); saveBtn.disabled = false; });
  });

  /* ---------- papers ---------- */
  var papers = [];
  function renderPapers() {
    document.getElementById("paper-admin").innerHTML = papers.map(function (p, i) {
      return '<li><div><span class="t">' + esc(p.title) + "</span><small>" + esc([p.collab, p.journal, p.year, p.arxiv && "arXiv:" + p.arxiv].filter(Boolean).join(" · ")) + '</small></div><button type="button" data-del="' + i + '">Delete</button></li>';
    }).join("") || '<li class="muted">None yet.</li>';
  }
  function loadPapers() { readJSON("data/papers.json").then(function (p) { papers = p; renderPapers(); }); }
  document.getElementById("paper-admin").addEventListener("click", function (e) {
    var i = e.target.getAttribute("data-del"); if (i == null) return;
    var p = papers[+i];
    if (e.target.textContent !== "Confirm") { e.target.textContent = "Confirm"; return; }
    papers.splice(+i, 1);
    commit([{ path: "data/papers.json", text: JSON.stringify(papers, null, 1) + "\n" }], "Remove paper: " + p.title.slice(0, 60))
      .then(function () { msg("paper-msg", "Deleted." + LIVE_NOTE, "ok"); renderPapers(); })
      .catch(function (err) { msg("paper-msg", "Delete failed: " + err.message, "err"); loadPapers(); });
  });
  document.getElementById("paper-lookup").addEventListener("submit", function (e) {
    e.preventDefault();
    var id = document.getElementById("lookup-id").value.trim().replace(/^arxiv:/i, "").replace(/^https?:\/\/(dx\.)?doi\.org\//, "").replace(/^https?:\/\/arxiv\.org\/abs\//, "");
    if (!id) return;
    var url = "https://inspirehep.net/api/" + (id.indexOf("10.") === 0 ? "doi/" : "arxiv/") + encodeURIComponent(id).replace(/%2F/g, "/");
    msg("paper-msg", "Looking it up on INSPIRE-HEP…");
    fetch(url, { headers: { Accept: "application/json" } }).then(function (r) { if (!r.ok) throw new Error(r.status === 404 ? "not found" : r.status); return r.json(); })
      .then(function (j) {
        var m = j.metadata, pi = (m.publication_info || []).filter(function (x) { return x.journal_title; })[0] || {};
        var set = function (k, v) { document.getElementById(k).value = v || ""; };
        set("p-title", m.titles && m.titles[0].title);
        set("p-collab", (m.collaborations || []).map(function (c) { return c.value; }).join(", ") ||
          (m.authors || []).slice(0, 4).map(function (a) { return a.full_name; }).join("; ") + ((m.authors || []).length > 4 ? " et al." : ""));
        set("p-journal", pi.journal_title ? pi.journal_title + (pi.journal_volume ? " " + pi.journal_volume : "") + (pi.year ? " (" + pi.year + ")" : "") + (pi.artid || pi.page_start ? " " + (pi.artid || pi.page_start) : "") : "");
        set("p-year", pi.year || (m.earliest_date || "").slice(0, 4));
        set("p-arxiv", m.arxiv_eprints && m.arxiv_eprints[0].value);
        set("p-doi", m.dois && m.dois[0].value);
        var t = m.document_type || [];
        document.getElementById("p-type").value = t.indexOf("conference paper") > -1 ? "proc" : t.indexOf("thesis") > -1 ? "thesis" : (pi.journal_title ? "article" : "preprint");
        msg("paper-msg", "Filled in from INSPIRE-HEP. Check the details, then add.", "ok");
      }).catch(function () { msg("paper-msg", "Couldn't find that on INSPIRE-HEP. Fill in the details by hand.", "err"); });
  });
  document.getElementById("paper-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = function (k) { return document.getElementById(k).value.trim(); };
    var p = { id: slug(v("p-title")) + "-" + Date.now().toString(36), title: v("p-title"), collab: v("p-collab"), journal: v("p-journal"), year: v("p-year"),
      arxiv: v("p-arxiv").replace(/^arxiv:/i, ""), doi: v("p-doi"), url: v("p-url"), type: v("p-type"), note: v("p-note") };
    var btn = e.target.querySelector("button[type=submit]"); btn.disabled = true; msg("paper-msg", "Saving…");
    readJSON("data/papers.json").then(function (cur) {
      cur.unshift(p); papers = cur;
      return commit([{ path: "data/papers.json", text: JSON.stringify(cur, null, 1) + "\n" }], "Add paper: " + p.title.slice(0, 60));
    }).then(function () { msg("paper-msg", "Paper added." + LIVE_NOTE, "ok"); e.target.reset(); renderPapers(); })
      .catch(function (err) { msg("paper-msg", "Save failed: " + err.message, "err"); })
      .then(function () { btn.disabled = false; });
  });

  /* ---------- talks ---------- */
  var talks = [];
  function renderTalks() {
    document.getElementById("talk-admin").innerHTML = talks.map(function (t, i) {
      return '<li><div><span class="t">' + esc(t.title || t.event) + "</span><small>" + esc([t.date, t.title ? t.event : "", t.place].filter(Boolean).join(" · ")) + '</small></div><button type="button" data-del="' + i + '">Delete</button></li>';
    }).join("") || '<li class="muted">None yet.</li>';
  }
  function loadTalks() { readJSON("data/talks.json").then(function (t) { talks = t; renderTalks(); }); }
  document.getElementById("talk-admin").addEventListener("click", function (e) {
    var i = e.target.getAttribute("data-del"); if (i == null) return;
    if (e.target.textContent !== "Confirm") { e.target.textContent = "Confirm"; return; }
    var t = talks.splice(+i, 1)[0];
    commit([{ path: "data/talks.json", text: JSON.stringify(talks, null, 1) + "\n" }], "Remove talk: " + (t.title || t.event).slice(0, 60))
      .then(function () { msg("talk-msg", "Deleted." + LIVE_NOTE, "ok"); renderTalks(); })
      .catch(function (err) { msg("talk-msg", "Delete failed: " + err.message, "err"); loadTalks(); });
  });
  document.getElementById("talk-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = function (k) { return document.getElementById(k).value.trim(); };
    var t = { id: slug(v("t-event")) + "-" + Date.now().toString(36), date: v("t-date"), event: v("t-event"), place: v("t-place"), title: v("t-title"), description: v("t-desc"), url: v("t-url") };
    var btn = e.target.querySelector("button[type=submit]"); btn.disabled = true; msg("talk-msg", "Saving…");
    readJSON("data/talks.json").then(function (cur) {
      cur.push(t); cur.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }); talks = cur;
      return commit([{ path: "data/talks.json", text: JSON.stringify(cur, null, 1) + "\n" }], "Add talk: " + (t.title || t.event).slice(0, 60));
    }).then(function () { msg("talk-msg", "Talk added." + LIVE_NOTE, "ok"); e.target.reset(); renderTalks(); })
      .catch(function (err) { msg("talk-msg", "Save failed: " + err.message, "err"); })
      .then(function () { btn.disabled = false; });
  });
})();
