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

  var API = "https://api.github.com/repos/" + REPO.owner + "/" + REPO.repo;
  var onAdminPage = !!document.getElementById("admin-app");
  var token = getToken();

  /* ---------- on normal pages: reveal owner buttons ---------- */
  if (!onAdminPage) {
    if (!token) return;
    document.querySelectorAll(".admin-only").forEach(function (el) { el.hidden = false; });
    var pill = document.createElement("a");
    pill.href = "admin.html"; pill.className = "btn primary manage-pill"; pill.textContent = "Manage site";
    document.body.appendChild(pill);
    document.documentElement.classList.add("is-owner");
    initHighlightButtons();
    return;
  }

  /* ---------- ☆ buttons on the publications list (owner only) ---------- */
  function toast(text, kind) {
    var t = document.getElementById("owner-toast");
    if (!t) { t = document.createElement("div"); t.id = "owner-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = text; t.className = kind || ""; t.hidden = false;
    clearTimeout(t._h); t._h = setTimeout(function () { t.hidden = true; }, 5000);
  }
  function initHighlightButtons() {
    var list = document.getElementById("pub-list");
    if (!list || !window.SiteHL) return;
    var busy = false;
    list.addEventListener("click", function (e) {
      var btn = e.target.closest(".hl-btn"); if (!btn || busy) return;
      var HL = window.SiteHL, rec = HL.shown[+btn.getAttribute("data-i")]; if (!rec) return;
      busy = true; btn.disabled = true; toast("Saving…");
      readJSON("data/papers.json").then(function (papers) {
        HL.papers = papers;
        var i = HL.find(rec), adding = i < 0, msgText;
        if (adding) {
          papers.unshift({ id: "inspire-" + rec.id, inspire: String(rec.id), title: rec.title, collab: rec.collab || "", journal: rec.journal || "",
            year: rec.year || "", arxiv: rec.arxiv || "", doi: rec.doi || "", url: "https://inspirehep.net/literature/" + rec.id,
            type: rec.type || "article", note: "", featured: true });
          msgText = "Added to Highlighted.";
        } else {
          if (papers[i].inspire) papers.splice(i, 1); else papers[i].featured = false;
          msgText = "Removed from Highlighted.";
        }
        return commit([{ path: "data/papers.json", text: JSON.stringify(papers, null, 1) + "\n" }],
          (adding ? "Highlight: " : "Unhighlight: ") + rec.title.slice(0, 60)).then(function () {
          HL.papers = papers; HL.renderFeatured(); HL.renderList();
          toast(msgText + " Live for visitors in about 2 minutes.", "ok");
        });
      }).catch(function (err) { toast("Couldn't save: " + err.message, "err"); btn.disabled = false; })
        .then(function () { busy = false; });
    });
  }

  /* ---------- GitHub API helpers ---------- */
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
  var MAX_FILE = 45 * 1048576;
  function ext(name) { return ((name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "")) || "bin"; }
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
      loadGallery(); loadPapers(); loadTalks(); loadStatus();
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
          '<label><input type="checkbox" data-f="home"' + (p.home ? " checked" : "") + '> Home page</label>' +
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
      if (card.querySelector('[data-f="home"]').checked) p.home = true; else delete p.home;
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
      if (!p.featured) return "";
      return '<li><div><span class="t">' + esc(p.title) + "</span><small>" + esc([p.collab, p.journal, p.year, p.arxiv && "arXiv:" + p.arxiv].filter(Boolean).join(" · ")) + '</small></div><span class="row-btns">' +
        (i > 0 ? '<button type="button" data-up="' + i + '" title="Move up">↑</button>' : "") + '<button type="button" data-del="' + i + '">Remove</button></span></li>';
    }).join("") || '<li class="muted">None yet.</li>';
  }
  function loadPapers() { readJSON("data/papers.json").then(function (p) { papers = p; renderPapers(); }); }
  document.getElementById("paper-admin").addEventListener("click", function (e) {
    var up = e.target.getAttribute("data-up");
    if (up != null) {
      up = +up; var tmp = papers[up - 1]; papers[up - 1] = papers[up]; papers[up] = tmp;
      renderPapers(); msg("paper-msg", "Saving order…");
      commit([{ path: "data/papers.json", text: JSON.stringify(papers, null, 1) + "\n" }], "Reorder highlighted papers")
        .then(function () { msg("paper-msg", "Order saved." + LIVE_NOTE, "ok"); })
        .catch(function (err) { msg("paper-msg", "Save failed: " + err.message, "err"); loadPapers(); });
      return;
    }
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
    var p = { id: slug(v("p-title")) + "-" + Date.now().toString(36), featured: true, title: v("p-title"), collab: v("p-collab"), journal: v("p-journal"), year: v("p-year"),
      arxiv: v("p-arxiv").replace(/^arxiv:/i, ""), doi: v("p-doi"), url: v("p-url"), type: v("p-type"), note: v("p-note") };
    var btn = e.target.querySelector("button[type=submit]"); btn.disabled = true; msg("paper-msg", "Saving…");
    readJSON("data/papers.json").then(function (cur) {
      cur.unshift(p); papers = cur;
      return commit([{ path: "data/papers.json", text: JSON.stringify(cur, null, 1) + "\n" }], "Add paper: " + p.title.slice(0, 60));
    }).then(function () { msg("paper-msg", "Added to Highlighted." + LIVE_NOTE, "ok"); e.target.reset(); renderPapers(); })
      .catch(function (err) { msg("paper-msg", "Save failed: " + err.message, "err"); })
      .then(function () { btn.disabled = false; });
  });

  /* ---------- talks ---------- */
  var talks = [];
  function renderTalks() {
    document.getElementById("talk-admin").innerHTML = talks.map(function (t, i) {
      return '<li><div><span class="t">' + esc(t.title || t.event) + "</span><small>" + esc([t.date, t.title ? t.event : "", t.place].filter(Boolean).join(" · ")) + (t.slides ? " · 📎 slides" : "") + '</small></div><span class="row-btns"><button type="button" data-slides="' + i + '">' + (t.slides ? "Replace slides" : "Slides") + '</button><button type="button" data-del="' + i + '">Delete</button></span></li>';
    }).join("") || '<li class="muted">None yet.</li>';
  }
  function loadTalks() { readJSON("data/talks.json").then(function (t) { talks = t; renderTalks(); }); }
  var slideInput = document.getElementById("talk-slide-input"), slideFor = null;
  slideInput.addEventListener("change", function () {
    var f = slideInput.files[0], t = talks[slideFor]; slideInput.value = "";
    if (!f || !t) return;
    if (f.size > MAX_FILE) { msg("talk-msg", "The slides are larger than 45 MB. Please export a smaller PDF.", "err"); return; }
    msg("talk-msg", "Uploading slides…");
    fileB64(f).then(function (b) {
      return readJSON("data/talks.json").then(function (cur) {
        var tt = cur.filter(function (x) { return x.id === t.id; })[0]; if (!tt) throw new Error("talk not found");
        var changes = [], path = "files/talks/" + (tt.id || slug(tt.event)) + "." + ext(f.name);
        if (tt.slides && tt.slides !== path) changes.push({ path: tt.slides, remove: true });
        tt.slides = path; changes.push({ path: path, b64: b }, { path: "data/talks.json", text: JSON.stringify(cur, null, 1) + "\n" });
        talks = cur;
        return commit(changes, "Slides for talk: " + (tt.title || tt.event).slice(0, 50));
      });
    }).then(function () { msg("talk-msg", "Slides uploaded." + LIVE_NOTE, "ok"); renderTalks(); })
      .catch(function (err) { msg("talk-msg", "Upload failed: " + err.message, "err"); });
  });
  document.getElementById("talk-admin").addEventListener("click", function (e) {
    var si = e.target.getAttribute("data-slides");
    if (si != null) { slideFor = +si; slideInput.click(); return; }
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
    var slideFile = document.getElementById("t-slides").files[0];
    if (slideFile && slideFile.size > MAX_FILE) { msg("talk-msg", "The slides are larger than 45 MB. Please export a smaller PDF.", "err"); return; }
    var t = { id: slug(v("t-event")) + "-" + Date.now().toString(36), kind: v("t-kind"), date: v("t-date"), event: v("t-event"), place: v("t-place"), title: v("t-title"), description: v("t-desc"), url: v("t-url") };
    var btn = e.target.querySelector("button[type=submit]"); btn.disabled = true; msg("talk-msg", "Saving…");
    readJSON("data/talks.json").then(function (cur) {
      var changes = [];
      return (slideFile ? fileB64(slideFile).then(function (b) {
        t.slides = "files/talks/" + t.id + "." + ext(slideFile.name); changes.push({ path: t.slides, b64: b });
      }) : Promise.resolve()).then(function () {
        cur.push(t); cur.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }); talks = cur;
        changes.push({ path: "data/talks.json", text: JSON.stringify(cur, null, 1) + "\n" });
        return commit(changes, "Add talk: " + (t.title || t.event).slice(0, 60));
      });
    }).then(function () { msg("talk-msg", "Talk added." + LIVE_NOTE, "ok"); e.target.reset(); renderTalks(); })
      .catch(function (err) { msg("talk-msg", "Save failed: " + err.message, "err"); })
      .then(function () { btn.disabled = false; });
  });


  /* ---------- weekly status ---------- */
  var SW = window.StatusWeeks, SC = window.StatusCrypto;
  var sdata = { projects: [], weeks: [] }, editingWeek = null;
  var sExisting = [], sNew = [], loadedPriv = false;
  var sFiles = document.getElementById("s-files"), sFileList = document.getElementById("s-filelist");
  function fsize(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
  function projOptions(sel) {
    return '<option value="">Whole week</option>' + sdata.projects.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === sel ? " selected" : "") + ">" + esc(p.name) + "</option>"; }).join("");
  }
  function renderFileList() {
    sFileList.innerHTML = sExisting.map(function (f, i) {
      return '<li class="' + (f._remove ? "rm" : "") + '"><span class="st-ficon">' + esc(ext(f.name).toUpperCase().slice(0, 4)) + '</span><span class="nm">' + esc(f.name) + ' <small>' + fsize(f.size || 0) + (f.enc ? " · 🔒" : "") + '</small></span><select data-ex="' + i + '" aria-label="Project">' + projOptions(f.project) + '</select><button type="button" data-rmex="' + i + '">' + (f._remove ? "Undo" : "Remove") + "</button></li>";
    }).join("") + sNew.map(function (n, i) {
      return '<li class="new"><span class="st-ficon">' + esc(ext(n.file.name).toUpperCase().slice(0, 4)) + '</span><span class="nm">' + esc(n.file.name) + " <small>" + fsize(n.file.size) + ' · new</small></span><select data-nw="' + i + '" aria-label="Project">' + projOptions(n.project) + '</select><button type="button" data-rmnw="' + i + '">Remove</button></li>';
    }).join("");
  }
  sFiles.addEventListener("change", function () {
    Array.prototype.forEach.call(sFiles.files, function (f) {
      if (f.size > MAX_FILE) { msg("status-msg", f.name + " is larger than 45 MB. Please export a smaller PDF.", "err"); return; }
      sNew.push({ file: f, project: "" });
    });
    sFiles.value = ""; renderFileList();
  });
  sFileList.addEventListener("change", function (e) {
    var a = e.target.getAttribute("data-ex"), b = e.target.getAttribute("data-nw");
    if (a != null) sExisting[+a].project = e.target.value; if (b != null) sNew[+b].project = e.target.value;
  });
  sFileList.addEventListener("click", function (e) {
    var a = e.target.getAttribute("data-rmex"), b = e.target.getAttribute("data-rmnw");
    if (a != null) { sExisting[+a]._remove = !sExisting[+a]._remove; renderFileList(); }
    if (b != null) { sNew.splice(+b, 1); renderFileList(); }
  });
  var sDate = document.getElementById("s-date"), sProj = document.getElementById("s-projects");
  function lines(id) { return document.getElementById(id).value.split("\n").map(function (x) { return x.replace(/^\s*[-•*]\s*/, "").trim(); }).filter(Boolean); }
  function curWeek() { var d = sDate.value ? new Date(sDate.value + "T12:00:00") : new Date(); return SW.of(d); }
  function isPrivate() { return document.querySelector('input[name="s-vis"]:checked').value === "private"; }
  function passphrase() { var p = document.getElementById("s-pass").value; if (!p) { try { p = sessionStorage.getItem("st_pass") || ""; } catch (e) {} } return p; }
  function updateWeekLabel() {
    var wk = curWeek(), exists = sdata.weeks.some(function (w) { return w.week === wk; });
    document.getElementById("s-weeklabel").textContent = SW.label(wk).split(" · ")[1] + (exists ? " · editing" : " · new");
    document.getElementById("s-save").textContent = exists ? "Update this week" : "Save update";
  }
  function projectBlock(p, e) {
    e = e || {};
    var id = p.id, on = !!(e.done || e.plan || e.blockers || e.note);
    return '<details class="st-fp" data-p="' + esc(id) + '"' + (on ? " open" : "") + ' style="--pc:' + esc(p.color) + '"><summary><span class="st-dot" aria-hidden="true"></span>' + esc(p.name) +
      '<span class="muted small">' + esc(p.status === "active" ? "" : p.status) + "</span></summary>" +
      '<div class="two"><div><label for="d-' + id + '">Done this week</label><textarea id="d-' + id + '" rows="3" placeholder="One item per line">' + esc((e.done || []).join("\n")) + '</textarea></div>' +
      '<div><label for="n-' + id + '">Plan for next week</label><textarea id="n-' + id + '" rows="3" placeholder="One item per line">' + esc((e.plan || []).join("\n")) + "</textarea></div></div>" +
      '<div class="two"><div><label for="b-' + id + '">Blockers (optional)</label><textarea id="b-' + id + '" rows="2">' + esc((e.blockers || []).join("\n")) + '</textarea></div>' +
      '<div><label for="g-' + id + '">Progress: <output id="go-' + id + '">' + (e.progress != null ? e.progress : lastProgress(id)) + '</output>%</label><input id="g-' + id + '" type="range" min="0" max="100" step="5" value="' + (e.progress != null ? e.progress : lastProgress(id)) + '">' +
      '<label for="t-' + id + '">Note (optional)</label><input id="t-' + id + '"  value="' + esc(e.note || "") + '"></div></div></details>';
  }
  function lastProgress(pid) {
    var ws = sdata.weeks.filter(function (w) { return !w.private; }).sort(function (a, b) { return b.week.localeCompare(a.week); });
    for (var i = 0; i < ws.length; i++) { var e = (ws[i].entries || []).filter(function (x) { return x.project === pid; })[0]; if (e && e.progress != null) return e.progress; }
    return 0;
  }
  function fillForm(content, priv) {
    sExisting = ((content && content.files) || []).map(function (f) { return Object.assign({}, f); }); sNew = []; loadedPriv = !!priv && !!content; renderFileList();
    var byP = {}; ((content && content.entries) || []).forEach(function (e) { byP[e.project] = e; });
    document.getElementById("s-summary").value = (content && content.summary) || "";
    document.querySelector('input[name="s-vis"][value="' + (priv ? "private" : "public") + '"]').checked = true;
    document.getElementById("s-passrow").hidden = !priv;
    sProj.innerHTML = sdata.projects.filter(function (p) { return p.status !== "done" || byP[p.id]; }).map(function (p) { return projectBlock(p, byP[p.id]); }).join("") ||
      '<p class="muted">Add a project below first.</p>';
  }
  sProj.addEventListener("input", function (e) { if (e.target.type === "range") document.getElementById("go-" + e.target.id.slice(2)).textContent = e.target.value; });
  document.querySelectorAll('input[name="s-vis"]').forEach(function (r) { r.addEventListener("change", function () { document.getElementById("s-passrow").hidden = !isPrivate(); }); });

  function weekContentFor(w) {
    if (!w.private) return Promise.resolve(w);
    var p = passphrase(); if (!p) return Promise.reject(new Error("Enter your passphrase to open private weeks."));
    return SC.decrypt(w.enc, p).catch(function () { throw new Error("Wrong passphrase for this private week."); });
  }
  function loadWeekIntoForm(wk) {
    var w = sdata.weeks.filter(function (x) { return x.week === wk; })[0];
    updateWeekLabel();
    if (!w) { fillForm(null, isPrivate()); return; }
    weekContentFor(w).then(function (c) { fillForm(c, !!w.private); msg("status-msg", "Loaded " + SW.label(wk).split(" · ")[0] + " for editing."); })
      .catch(function (err) { fillForm(null, true); msg("status-msg", err.message, "err"); });
  }
  sDate.addEventListener("change", function () { loadWeekIntoForm(curWeek()); });

  document.getElementById("s-carry").addEventListener("click", function () {
    var prev = sdata.weeks.filter(function (w) { return w.week < curWeek(); }).sort(function (a, b) { return b.week.localeCompare(a.week); })[0];
    if (!prev) { msg("status-msg", "No earlier week to copy from."); return; }
    weekContentFor(prev).then(function (c) {
      var n = 0;
      (c.entries || []).forEach(function (e) {
        var ta = document.getElementById("d-" + e.project); if (!ta || !(e.plan || []).length) return;
        if (!ta.value.trim()) { ta.value = e.plan.join("\n"); ta.closest("details").open = true; n++; }
      });
      msg("status-msg", n ? "Copied last week's plan into “Done” for " + n + " project(s). Edit what actually happened." : "Nothing to copy (Done fields already filled, or no plan last week).", n ? "ok" : "");
    }).catch(function (err) { msg("status-msg", err.message, "err"); });
  });

  document.getElementById("status-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var wk = curWeek(), priv = isPrivate(), pass = passphrase();
    if (priv && pass.length < 8) { msg("status-msg", "Use a passphrase of at least 8 characters for private updates.", "err"); return; }
    var entries = [];
    sdata.projects.forEach(function (p) {
      if (!document.getElementById("d-" + p.id)) return;
      var en = { project: p.id, done: lines("d-" + p.id), plan: lines("n-" + p.id), blockers: lines("b-" + p.id), progress: +document.getElementById("g-" + p.id).value, note: document.getElementById("t-" + p.id).value.trim() };
      if (en.done.length || en.plan.length || en.blockers.length || en.note) entries.push(en);
    });
    if (!entries.length) { msg("status-msg", "Add at least one item for one project.", "err"); return; }
    if (!priv && sExisting.some(function (f) { return f.enc && !f._remove; })) { msg("status-msg", "This week has encrypted files. Keep it Private, or remove those files first.", "err"); return; }
    if (priv && sExisting.some(function (f) { return !f.enc && !f._remove; })) { msg("status-msg", "This week has public files. Remove them and upload again to make them private.", "err"); return; }
    var content = { summary: document.getElementById("s-summary").value.trim(), entries: entries };
    var fileChanges = [], stamp = Date.now().toString(36);
    sExisting.filter(function (f) { return f._remove; }).forEach(function (f) { fileChanges.push({ path: f.path, remove: true }); });
    var kept = sExisting.filter(function (f) { return !f._remove; }).map(function (f) { var c = Object.assign({}, f); delete c._remove; return c; });
    var uploads = Promise.all(sNew.map(function (n, i) {
      var f = n.file, base = "files/status/" + wk + "/" + stamp + "-" + (i + 1);
      var meta = { name: f.name, size: f.size, type: f.type || "", project: n.project || "" };
      if (!priv) return fileB64(f).then(function (b) { meta.path = base + "-" + slug(f.name.replace(/\.[^.]+$/, "")) + "." + ext(f.name); fileChanges.push({ path: meta.path, b64: b }); return meta; });
      return f.arrayBuffer().then(function (buf) { return SC.encryptBytes(buf, pass); }).then(function (r) {
        meta.path = base + ".enc"; meta.enc = { salt: r.salt, iv: r.iv }; fileChanges.push({ path: meta.path, b64: SC.b64(r.data) }); return meta;
      });
    }));
    var btn = document.getElementById("s-save"); btn.disabled = true; msg("status-msg", priv ? "Encrypting and saving…" : (sNew.length ? "Uploading files and saving…" : "Saving…"));
    uploads.then(function (newMeta) {
      content.files = kept.concat(newMeta);
      return priv ? SC.encrypt(content, pass).then(function (box) { return { week: wk, private: true, enc: box, updated: new Date().toISOString() }; })
          : Promise.resolve({ week: wk, private: false, summary: content.summary, entries: entries, files: content.files, updated: new Date().toISOString() });
    })
      .then(function (rec) {
        if (priv) { try { sessionStorage.setItem("st_pass", pass); } catch (x) {} }
        return readJSON("data/status.json").then(function (cur) {
          if (Array.isArray(cur)) cur = { projects: sdata.projects, weeks: [] };
          cur.weeks = (cur.weeks || []).filter(function (w) { return w.week !== wk; }); cur.weeks.push(rec);
          cur.weeks.sort(function (a, b) { return b.week.localeCompare(a.week); });
          sdata = cur;
          return commit(fileChanges.concat([{ path: "data/status.json", text: JSON.stringify(cur, null, 1) + "\n" }]), "Weekly status " + wk + (priv ? " (private)" : ""));
        });
      })
      .then(function () { msg("status-msg", "Saved " + SW.label(wk).split(" · ")[0] + "." + LIVE_NOTE, "ok"); sExisting = content.files.slice(); sNew = []; renderFileList(); renderStatusList(); updateWeekLabel(); })
      .catch(function (err) { msg("status-msg", "Save failed: " + err.message, "err"); })
      .then(function () { btn.disabled = false; });
  });

  function renderStatusList() {
    var ws = sdata.weeks.slice().sort(function (a, b) { return b.week.localeCompare(a.week); });
    document.getElementById("status-admin").innerHTML = ws.map(function (w) {
      var n = w.private ? "private" : (w.entries || []).length + " project(s)";
      return '<li><div><span class="t">' + esc(SW.label(w.week)) + "</span><small>" + (w.private ? "🔒 " : "") + esc(n) + '</small></div><span class="row-btns"><button type="button" data-edit="' + esc(w.week) + '">Edit</button><button type="button" data-delw="' + esc(w.week) + '">Delete</button></span></li>';
    }).join("") || '<li class="muted">No updates yet.</li>';
  }
  document.getElementById("status-admin").addEventListener("click", function (e) {
    var wk = e.target.getAttribute("data-edit");
    if (wk) { var m = SW.monday(wk); sDate.value = m.toISOString().slice(0, 10); loadWeekIntoForm(wk); document.getElementById("status").scrollIntoView(); return; }
    wk = e.target.getAttribute("data-delw"); if (!wk) return;
    if (e.target.textContent !== "Confirm") { e.target.textContent = "Confirm"; return; }
    readJSON("data/status.json").then(function (cur) {
      var gone = (cur.weeks || []).filter(function (w) { return w.week === wk; })[0];
      cur.weeks = (cur.weeks || []).filter(function (w) { return w.week !== wk; }); sdata = cur;
      var ch = ((gone && gone.files) || []).map(function (f) { return { path: f.path, remove: true }; });
      if (gone && gone.private) msg("status-msg", "Note: files of a private week stay in the repo (encrypted) unless you remove them while editing.");
      return commit(ch.concat([{ path: "data/status.json", text: JSON.stringify(cur, null, 1) + "\n" }]), "Delete weekly status " + wk);
    }).then(function () { msg("status-msg", "Deleted." + LIVE_NOTE, "ok"); renderStatusList(); updateWeekLabel(); })
      .catch(function (err) { msg("status-msg", "Delete failed: " + err.message, "err"); });
  });

  /* ---------- projects ---------- */
  var projDirty = false, pSave = document.getElementById("p-save");
  function renderProjectAdmin() {
    document.getElementById("project-admin").innerHTML = sdata.projects.map(function (p, i) {
      return '<div class="proj-row" data-i="' + i + '">' +
        '<input type="color" data-f="color" value="' + esc(p.color || "#2446c7") + '" aria-label="Colour">' +
        '<input data-f="name" value="' + esc(p.name) + '" placeholder="Project name" aria-label="Project name">' +
        '<input data-f="collab" value="' + esc(p.collab || "") + '" placeholder="Collaboration" aria-label="Collaboration">' +
        '<select data-f="status" aria-label="Status">' + ["active", "planned", "paused", "done"].map(function (s) { return "<option value=\"" + s + "\"" + (s === p.status ? " selected" : "") + ">" + { active: "Active", planned: "Planned", paused: "Paused", done: "Completed" }[s] + "</option>"; }).join("") + "</select>" +
        '<input class="wide" data-f="description" value="' + esc(p.description || "") + '" placeholder="One-line description" aria-label="Description">' +
        '<button type="button" class="rm" data-rm="' + i + '" title="Remove project">✕</button></div>';
    }).join("") || '<p class="muted">No projects yet.</p>';
  }
  document.getElementById("project-admin").addEventListener("input", function (e) {
    var row = e.target.closest(".proj-row"); if (!row) return;
    sdata.projects[+row.getAttribute("data-i")][e.target.getAttribute("data-f")] = e.target.value;
    projDirty = true; pSave.disabled = false;
  });
  document.getElementById("project-admin").addEventListener("click", function (e) {
    var i = e.target.getAttribute("data-rm"); if (i == null) return;
    if (e.target.textContent !== "Sure?") { e.target.textContent = "Sure?"; return; }
    sdata.projects.splice(+i, 1); renderProjectAdmin(); projDirty = true; pSave.disabled = false;
  });
  document.getElementById("p-add").addEventListener("click", function () {
    var colors = ["#2446c7", "#1f8a7a", "#a87a22", "#b3406b", "#6b4fbb", "#2f7d32", "#c2562b"];
    sdata.projects.push({ id: "p-" + Date.now().toString(36), name: "", collab: "", color: colors[sdata.projects.length % colors.length], status: "active", description: "" });
    renderProjectAdmin(); projDirty = true; pSave.disabled = false;
    var rows = document.querySelectorAll(".proj-row"); rows[rows.length - 1].querySelector('[data-f="name"]').focus();
  });
  pSave.addEventListener("click", function () {
    var projects = sdata.projects.filter(function (p) { return p.name.trim(); }).map(function (p) {
      if (/^p-/.test(p.id)) p.id = slug(p.name) + "-" + p.id.slice(2, 6);
      p.name = p.name.trim(); return p;
    });
    pSave.disabled = true; msg("proj-msg", "Saving…");
    readJSON("data/status.json").then(function (cur) {
      if (Array.isArray(cur)) cur = { weeks: [] };
      cur.projects = projects; sdata = cur;
      return commit([{ path: "data/status.json", text: JSON.stringify(cur, null, 1) + "\n" }], "Update status projects");
    }).then(function () { msg("proj-msg", "Projects saved." + LIVE_NOTE, "ok"); projDirty = false; renderProjectAdmin(); loadWeekIntoForm(curWeek()); })
      .catch(function (err) { msg("proj-msg", "Save failed: " + err.message, "err"); pSave.disabled = false; });
  });

  function loadStatus() {
    readJSON("data/status.json").then(function (d) {
      sdata = Array.isArray(d) ? { projects: [], weeks: [] } : { projects: d.projects || [], weeks: d.weeks || [] };
      if (!sDate.value) { var t = new Date(); sDate.value = t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0"); }
      renderProjectAdmin(); renderStatusList(); loadWeekIntoForm(curWeek());
    }).catch(function (err) { msg("status-msg", "Couldn't load the work log: " + err.message, "err"); });
  }
})();
