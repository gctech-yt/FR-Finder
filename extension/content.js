(() => {
  // Only ever runs on squig.link (static, public measurement files).
  if (!/(^|\.)squig\.link$/.test(location.hostname)) return;
  if (window.__squigFinder) return;
  window.__squigFinder = true;

  // ====================== CONFIG ======================
  const N_RESULTS = 10;
  const TTL = 30 * 24 * 3600 * 1000; // cache lifetime: 30 days
  const CONCURRENCY = 4;
  const GRID = Array.from({ length: 256 }, (_, i) => 20 * Math.pow(1000, i / 255)); // 20 Hz - 20 kHz, log

  // ================= ALGORITHM (replaceable) =================
  // Frequency weights, interpolated on a log axis between [Hz, weight] points.
  // Bass can be fixed with EQ; treble peaks/dips come from driver geometry, so EVERY mode
  // keeps a treble bias (3k and up always weighs more than the mids).
  const PRESETS = {
    bass: [[20, 2.0], [200, 2.0], [500, 1.2], [1000, 0.8], [2500, 0.8], [3000, 1.2], [8000, 1.2], [10000, 0.9], [12000, 0.45], [20000, 0.18]],
    normal: [[20, 0.7], [200, 0.8], [1000, 1.1], [2500, 1.2], [3000, 1.85], [8000, 1.85], [10000, 1.5], [12000, 1.1], [16000, 0.65], [20000, 0.45]],
    treble: [[20, 0.1], [200, 0.2], [1000, 0.6], [2500, 1.0], [3000, 3.3], [8000, 3.3], [10000, 2.8], [12000, 2.0], [16000, 1.35], [20000, 0.8]]
  };
  const MODES = ['bass', 'normal', 'treble'];
  // Tolerance settings (grid step is ~0.039 octave):
  const SMOOTH = 2;          // +-2 points (~1/6 octave) smoothing: ignores narrow ripples
  const SHIFT = 4;           // allow peaks/dips to be off by up to +-4 points (~1/6 octave)
  const SHIFT_PENALTY = 0.10; // dB charged per point of horizontal shift
  const ERR_CAP = 6;         // errors above 6 dB count only 30% beyond the cap (one bad region cannot dominate)
  const SCALE_DB = 3;        // percentage scale: 0 dB = 100 %, SCALE_DB = 0 %

  function weight(f, P) {
    if (f <= P[0][0]) return P[0][1];
    for (let i = 1; i < P.length; i++) {
      if (f <= P[i][0]) {
        const t = (Math.log(f) - Math.log(P[i - 1][0])) / (Math.log(P[i][0]) - Math.log(P[i - 1][0]));
        return P[i - 1][1] + t * (P[i][1] - P[i - 1][1]);
      }
    }
    return P[P.length - 1][1];
  }
  let W = [], WSUM = 1;
  function setMode(mode) {
    W = GRID.map(f => weight(f, PRESETS[mode]));
    WSUM = W.reduce((x, y) => x + y, 0);
  }
  setMode('normal');
  const IDX = GRID.map((_, i) => i);

  const smoothMemo = new WeakMap();
  function smoothed(c) {
    let o = smoothMemo.get(c);
    if (o) return o;
    const n = c.length; o = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0, k = 0;
      for (let j = -SMOOTH; j <= SMOOTH; j++) { const x = i + j; if (x >= 0 && x < n) { s += c[x]; k++; } }
      o[i] = s / k;
    }
    smoothMemo.set(c, o);
    return o;
  }
  // level offset = weighted median of (a - b), via a histogram (fast, 0.02 dB resolution)
  const HB = 4096, hist = new Float64Array(HB);
  function alignOffset(a, b) {
    const n = GRID.length, diff = new Float32Array(n);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) { const d = a[i] - b[i]; diff[i] = d; if (d < lo) lo = d; if (d > hi) hi = d; }
    const span = Math.max(hi - lo, 1e-6), step = span / (HB - 1);
    hist.fill(0);
    for (let i = 0; i < n; i++) hist[Math.round((diff[i] - lo) / step)] += W[i];
    let acc = 0, bin = 0;
    for (; bin < HB; bin++) { acc += hist[bin]; if (acc >= WSUM / 2) break; }
    return { off: lo + bin * step, diff };
  }
  // Weighted tolerant MAE in dB, lower = more similar. a, b: raw Float32Array(256) in dB.
  // Compared on smoothed curves, level-aligned, and each point may match the other curve
  // within a small frequency window (a peak at 6.2k vs 6.6k is almost the same peak).
  function distance(a, b) {
    const as = smoothed(a), bs = smoothed(b);
    const { off } = alignOffset(as, bs);
    const n = GRID.length;
    let s = 0;
    for (let i = 0; i < n; i++) {
      let e1 = 1e9, e2 = 1e9;
      for (let k = -SHIFT; k <= SHIFT; k++) {
        const j = i + k;
        if (j < 0 || j >= n) continue;
        const pen = SHIFT_PENALTY * Math.abs(k);
        const v1 = Math.abs(as[i] - (bs[j] + off)) + pen; if (v1 < e1) e1 = v1;
        const v2 = Math.abs(as[j] - (bs[i] + off)) + pen; if (v2 < e2) e2 = v2;
      }
      let e = (e1 + e2) / 2;
      if (e > ERR_CAP) e = ERR_CAP + 0.3 * (e - ERR_CAP);
      s += W[i] * e;
    }
    return s / WSUM;
  }

  // ====================== PATHS / SITE CONFIG ======================
  let BASE = '', PB_URL = '', CH = ['L', 'R'], SAMPLES = [''];
  function askBridgeConfig() {
    return new Promise(res => {
      const t = setTimeout(() => { window.removeEventListener('message', on); res(null); }, 1500);
      function on(ev) {
        if (ev.source !== window || !ev.data || ev.data.squigFinder !== 'config') return;
        clearTimeout(t); window.removeEventListener('message', on); res(ev.data);
      }
      window.addEventListener('message', on);
      window.postMessage({ squigFinder: 'getConfig' }, '*');
    });
  }
  async function initConfig() {
    const cfg = await askBridgeConfig();
    if (cfg && cfg.dir) BASE = new URL(cfg.dir, location.href).href;
    if (cfg && cfg.phoneBook) PB_URL = new URL(cfg.phoneBook, location.href).href;
    if (cfg && Array.isArray(cfg.channels) && cfg.channels.length) CH = cfg.channels;
    if (cfg && Array.isArray(cfg.samples) && cfg.samples.length) SAMPLES = cfg.samples;
    else if (cfg && Number.isInteger(cfg.samples) && cfg.samples > 0) SAMPLES = Array.from({ length: cfg.samples }, (_, i) => String(i + 1));
    if (!PB_URL) {
      const hit = performance.getEntriesByType('resource').map(r => r.name).find(n => /phone_book\.(json|js)(\?|$)/.test(n));
      if (hit) PB_URL = hit.split('?')[0];
    }
    if (!BASE) {
      if (PB_URL) BASE = PB_URL.replace(/phone_book\.[a-z]+$/i, '');
      else BASE = location.origin + location.pathname.replace(/[^/]*$/, '') + 'data/';
    }
    if (!PB_URL) PB_URL = BASE + 'phone_book.json';
  }

  // ====================== PARSING ======================
  function parseFR(text) {
    const f = [], s = [];
    for (const line of text.split(/\r?\n/)) {
      if (!line || line[0] === '*') continue;
      const p = line.trim().split(/[\t, ;]+/);
      const x = parseFloat(p[0]), y = parseFloat(p[1]);
      if (isFinite(x) && isFinite(y) && x > 0) { f.push(x); s.push(y); }
    }
    return { f, s };
  }
  function resample({ f, s }) {
    const out = new Float32Array(GRID.length);
    let j = 0;
    for (let i = 0; i < GRID.length; i++) {
      const g = GRID[i];
      while (j < f.length - 2 && f[j + 1] < g) j++;
      if (g <= f[0]) out[i] = s[0];
      else if (g >= f[f.length - 1]) out[i] = s[s.length - 1];
      else {
        const t = (Math.log(g) - Math.log(f[j])) / (Math.log(f[j + 1]) - Math.log(f[j]));
        out[i] = s[j] + t * (s[j + 1] - s[j]);
      }
    }
    return out;
  }

  // ====================== CACHE (IndexedDB, 30-day expiry) ======================
  const dbp = new Promise((res, rej) => {
    const r = indexedDB.open('squig-finder', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('curves');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  async function cacheGet(k) {
    const db = await dbp;
    return new Promise(res => {
      const q = db.transaction('curves').objectStore('curves').get(k);
      q.onsuccess = () => res(q.result || null);
      q.onerror = () => res(null);
    });
  }
  async function cachePut(k, c) {
    const db = await dbp;
    return new Promise(res => {
      const tx = db.transaction('curves', 'readwrite');
      tx.objectStore('curves').put({ t: Date.now(), c }, k);
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
  }
  const fresh = rec => rec && rec.t && rec.c && Date.now() - rec.t < TTL;
  async function cacheLoadFresh(keys) {
    const db = await dbp, out = new Map();
    return new Promise(res => {
      const req = db.transaction('curves').objectStore('curves').openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return res(out);
        if (keys.has(cur.key) && fresh(cur.value)) out.set(cur.key, cur.value.c);
        cur.continue();
      };
      req.onerror = () => res(out);
    });
  }

  // ====================== DATA ======================
  async function loadBook() {
    const r = await fetch(PB_URL);
    if (!r.ok) throw new Error('phone book HTTP ' + r.status);
    const txt = await r.text();
    let book;
    try { book = JSON.parse(txt); }
    catch { book = JSON.parse(txt.slice(txt.indexOf('['), txt.lastIndexOf(']') + 1)); }
    const list = [];
    for (const brand of book) {
      for (const ph of brand.phones || []) {
        const files = Array.isArray(ph.file) ? ph.file : [ph.file];
        const suf = Array.isArray(ph.suffix) ? ph.suffix : [];
        files.forEach((file, i) => {
          if (!file) return;
          const model = `${ph.name}${suf[i] ? ' ' + suf[i] : ''}`.trim();
          list.push({ brand: brand.name, model, label: `${brand.name} ${model}`.trim(), file, key: BASE + '|' + file });
        });
      }
    }
    return list;
  }
  const diag = { failed: 0, firstUrl: '', firstStatus: '' };
  async function fetchPair(u1, u2) {
    let r = await fetch(u1).catch(() => null);
    let same = false;
    try { same = new URL(u1).href === new URL(u2).href; } catch {}
    if ((!r || !r.ok) && !same) r = await fetch(u2).catch(() => null);
    if (!r || !r.ok) {
      if (!diag.firstUrl) { diag.firstUrl = u1; diag.firstStatus = r ? r.status : 'network error'; }
      throw new Error('fetch failed');
    }
    return parseFR(await r.text());
  }
  async function loadCurve(e, force) {
    if (!force) { const rec = await cacheGet(e.key); if (fresh(rec)) return rec.c; }
    const got = [];
    const jobs = [];
    for (const ch of CH) for (const n of SAMPLES) {
      const nm = e.file + ' ' + ch + n;
      jobs.push([BASE + nm + '.txt', BASE + encodeURIComponent(nm) + '.txt']);
    }
    await Promise.all(jobs.map(async ([u1, u2]) => {
      try { const fr = await fetchPair(u1, u2); if (fr.f.length > 10) got.push(resample(fr)); } catch {}
    }));
    if (!got.length) {
      for (const sfx of ['', ' AVG']) {
        try {
          const fr = await fetchPair(BASE + e.file + sfx + '.txt', BASE + encodeURIComponent(e.file + sfx) + '.txt');
          if (fr.f.length > 10) { got.push(resample(fr)); break; }
        } catch {}
      }
    }
    if (!got.length) { diag.failed++; return null; }
    const out = new Float32Array(GRID.length);
    for (let i = 0; i < out.length; i++) { let t = 0; for (const g of got) t += g[i]; out[i] = t / got.length; }
    await cachePut(e.key, out);
    return out;
  }

  let entries = [];
  const curves = new Map();

  // ---- on-demand indexing (never starts by itself) ----
  const job = { running: false, paused: false, stopped: false };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function indexAll(force) {
    if (job.running || !entries.length) return;
    job.running = true; job.paused = false; job.stopped = false;
    diag.failed = 0; diag.firstUrl = ''; diag.firstStatus = '';
    $('prog').classList.remove('hide'); $('bar').style.width = '0%';
    refreshIdxUI();
    try {
      if (curves.size === 0 || force) {
        // probe a few evenly spaced models first; if none loads, stop right away
        setStatus('Testing file access…');
        const probe = Array.from({ length: Math.min(6, entries.length) }, (_, i) => entries[Math.floor(i * entries.length / 6)]);
        let ok = 0;
        for (const e of probe) { try { const c = await loadCurve(e, force); if (c) { curves.set(e.key, c); ok++; } } catch {} }
        if (!ok && curves.size === 0) {
          console.warn('[FR Finder] cannot read measurement files:', diag.firstUrl, diag.firstStatus);
          setStatus('This site does not look compatible: its measurement files cannot be read. Nothing else was requested.', true);
          return;
        }
      }
      const todo = entries.filter(e => force || !curves.has(e.key));
      let idx = 0, done = 0;
      async function worker() {
        while (idx < todo.length && !job.stopped) {
          while (job.paused && !job.stopped) await sleep(200);
          if (job.stopped) break;
          const e = todo[idx++];
          try { const c = await loadCurve(e, force); if (c) curves.set(e.key, c); } catch {}
          done++;
          $('bar').style.width = (100 * done / todo.length) + '%';
          $('sub').textContent = `indexing ${done}/${todo.length}`;
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      if (job.stopped) setStatus('Stopped. The partial index is kept.');
      else {
        setStatus(diag.failed ? `${diag.failed} models have no measurement file.` : '');
        ui.done = ui.done || {}; ui.done[BASE] = Date.now(); saveUI();
      }
      ready = curves.size > 0;
      if (ready) { if (pending) { show(pending); pending = null; } else if (currentRef) show(currentRef); }
    } finally {
      job.running = false;
      $('prog').classList.add('hide');
      refreshIdxUI();
    }
  }
  function isComplete() {
    const d = ui.done && ui.done[BASE];
    return (d && Date.now() - d < TTL) || (entries.length && curves.size >= entries.length * 0.97);
  }
  function refreshIdxUI() {
    const n = entries.length, have = curves.size, files = n * CH.length * SAMPLES.length;
    $('sub').textContent = job.running ? $('sub').textContent : `${n} models · ${have} indexed`;
    const showCard = !job.running ? !isComplete() : true;
    $('idx').style.display = showCard ? 'block' : 'none';
    $('idxBtn').style.display = job.running ? 'none' : '';
    $('pauseBtn').style.display = $('stopBtn').style.display = job.running ? '' : 'none';
    $('pauseBtn').textContent = job.paused ? 'Resume' : 'Pause';
    $('upd').style.display = (!job.running && have > 0 && isComplete()) ? '' : 'none';
    if (job.running) $('idxt').textContent = job.paused ? 'Paused.' : 'Downloading each measurement once. It is cached for 30 days.';
    else if (have > 0) { $('idxt').textContent = 'Partial index: results may be incomplete.'; $('idxBtn').textContent = `Resume indexing (${have}/${n})`; }
    else { $('idxt').textContent = `One-time download of about ${files} small files (~${Math.max(1, Math.round(files * 0.02))} MB) from this site, then cached for 30 days.`; $('idxBtn').textContent = 'Index this database'; }
  }

  function findSimilar(refEntry) {
    const ref = curves.get(refEntry.key);
    if (!ref) return [];
    const out = [];
    for (const e of entries) {
      if (e.key === refEntry.key) continue;
      const c = curves.get(e.key);
      if (c) out.push({ e, d: distance(ref, c) });
    }
    out.sort((x, y) => x.d - y.d);
    return out;
  }

  // ====================== UI ======================
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483647;';
  const sh = host.attachShadow({ mode: 'open' });
  sh.innerHTML = `
  <style>
    :host{all:initial}
    *{box-sizing:border-box}
    .panel{position:fixed;width:330px;font:13px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;color:#e9e9f2;
      background:rgba(17,17,24,.88);backdrop-filter:blur(14px) saturate(140%);-webkit-backdrop-filter:blur(14px) saturate(140%);
      border:1px solid rgba(255,255,255,.09);border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.5);overflow:hidden;
      transition:box-shadow .2s}
    .panel.drag{box-shadow:0 18px 60px rgba(0,0,0,.65);cursor:grabbing}
    .head{display:flex;align-items:center;gap:8px;padding:7px 10px;cursor:grab;user-select:none;
      background:linear-gradient(135deg,rgba(15,118,110,.55),rgba(20,184,166,.18))}
    .logo{width:22px;height:22px;border-radius:7px;display:grid;place-items:center;font-size:12px;
      background:linear-gradient(135deg,#0f766e,#14b8a6);color:#fff;box-shadow:0 2px 8px rgba(20,184,166,.45)}
    .title{flex:1;font-weight:650;letter-spacing:.2px}
    .title small{display:block;font-weight:400;font-size:10px;color:#a9c4c0;margin-top:0}
    .ib{width:22px;height:22px;border:0;border-radius:8px;background:rgba(255,255,255,.08);color:#ddd;cursor:pointer;font-size:15px;line-height:1}
    .ib:hover{background:rgba(255,255,255,.18)}
    .body{padding:9px 10px 8px;max-height:min(60vh,500px);overflow:auto}
    .panel.min .body{display:none}
    .panel.min{width:auto;min-width:190px}
    .search{display:flex;gap:6px}
    input[type=text],input:not([type]){flex:1;min-width:0;padding:5px 9px;border-radius:9px;border:1px solid rgba(255,255,255,.12);
      background:rgba(0,0,0,.35);color:#fff;outline:none;font:inherit}
    input:focus{border-color:#14b8a6;box-shadow:0 0 0 3px rgba(20,184,166,.25)}
    .go{padding:0 11px;border:0;border-radius:9px;cursor:pointer;color:#fff;font-weight:600;
      background:linear-gradient(135deg,#0f766e,#14b8a6)}
    .go:hover{filter:brightness(1.12)}
    .lbl{margin:8px 0 3px;font-size:10px;letter-spacing:.8px;text-transform:uppercase;color:#9a9ab5}
    .seg{position:relative;display:grid;grid-template-columns:repeat(3,1fr);padding:2px;border-radius:9px;background:rgba(0,0,0,.35);
      border:1px solid rgba(255,255,255,.08)}
    .seg .thumb{position:absolute;top:2px;bottom:2px;left:2px;width:calc((100% - 4px)/3);border-radius:7px;
      background:linear-gradient(135deg,#0f766e,#14b8a6);transition:transform .22s cubic-bezier(.4,1.3,.5,1);box-shadow:0 2px 8px rgba(20,184,166,.4)}
    .seg button{position:relative;z-index:1;border:0;background:none;color:#b8c4c2;padding:3px 0;font:inherit;font-size:12px;font-weight:600;cursor:pointer;transition:color .2s}
    .seg button.on{color:#fff}
    .prog{height:3px;border-radius:3px;background:rgba(255,255,255,.08);margin-top:8px;overflow:hidden}
    .prog>div{height:100%;width:0;background:linear-gradient(90deg,#0f766e,#14b8a6);transition:width .2s}
    .prog.hide{display:none}
    .st{margin-top:4px;font-size:10.5px;color:#9a9ab5;word-break:break-word}
    .st.err{color:#ff8a8a}
    .ref{margin-top:8px;padding:4px 9px;border-radius:9px;background:rgba(124,92,255,.14);border:1px solid rgba(124,92,255,.35);display:none}
    .ref.show{display:block}
    .ref .k{font-size:10px;letter-spacing:.8px;text-transform:uppercase;color:#a99cff}
    .ref .v{font-weight:600;margin-top:0;font-size:12px}
    .row{display:grid;grid-template-columns:18px 1fr auto;gap:2px 8px;align-items:center;padding:4px 7px 3px;margin-top:4px;border-radius:9px;
      background:rgba(255,255,255,.04);cursor:pointer;transition:transform .12s,background .12s;animation:in .25s both}
    .row:hover{background:rgba(20,184,166,.18);transform:translateX(-2px)}
    @keyframes in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
    .n{color:#7c7c99;font-weight:700;text-align:center;font-size:12px}
    .nm{min-width:0}
    .nm b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .nm span{display:block;font-size:10.5px;color:#9a9ab5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .pct{font-weight:700;font-size:13px;text-align:right}
    .sw{grid-column:2 / 4;position:relative}
    .spark{width:100%;height:22px;display:block;transition:height .2s}
    .sw.z .spark{height:30px}
    .rng{position:absolute;right:3px;bottom:-1px;font-size:8.5px;color:rgba(255,255,255,.5);pointer-events:none;text-shadow:0 0 3px #000}
    .row.on{background:rgba(20,184,166,.22);box-shadow:inset 2px 0 0 #14b8a6}
    .row.on .nm span::after{content:' · on graph';color:#2dd4bf}
    .empty{margin-top:10px;color:#9a9ab5;font-size:12px}
    .hint{margin-top:6px;font-size:9.5px;color:#6f8a87;text-align:center}
    .by{margin-left:6px;font-size:9px;font-weight:400;color:#6fbdb4;letter-spacing:.3px}
    .idx{margin-top:8px;padding:7px 9px;border-radius:9px;background:rgba(20,184,166,.10);border:1px solid rgba(20,184,166,.28)}
    .idxt{font-size:10.5px;color:#a9c9c5;margin-bottom:6px}
    .btns{display:flex;gap:6px}
    .go.wide{flex:1;padding:6px 10px;margin:0}
    .ghost{padding:5px 10px;border-radius:9px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#dfeeee;cursor:pointer;font:inherit;font-size:12px}
    .ghost:hover{background:rgba(255,255,255,.14)}
    .lnk{cursor:pointer;text-decoration:underline;color:#6fbdb4}
    ::-webkit-scrollbar{width:6px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.18);border-radius:6px}
  </style>
  <div class="panel" id="panel">
    <div class="head" id="head">
      <div class="logo">&#9680;</div>
      <div class="title">FR Finder<span class="by">by GC Tech</span><small id="sub">loading…</small></div>
      <button class="ib" id="min" title="Minimize">&#8211;</button>
    </div>
    <div class="body">
      <div class="search">
        <input id="q" list="dl" placeholder="Search a model…" autocomplete="off" spellcheck="false">
        <datalist id="dl"></datalist>
        <button class="go" id="go">Find</button>
      </div>
      <div class="lbl">Match focus</div>
      <div class="seg" id="seg">
        <div class="thumb" id="thumb"></div>
        <button data-m="0">Bass</button><button data-m="1" class="on">Normal</button><button data-m="2">Treble</button>
      </div>
      <div class="idx" id="idx" style="display:none">
        <div class="idxt" id="idxt"></div>
        <div class="btns"><button class="go wide" id="idxBtn">Index this database</button><button class="ghost" id="pauseBtn">Pause</button><button class="ghost" id="stopBtn">Stop</button></div>
      </div>
      <div class="prog hide" id="prog"><div id="bar"></div></div>
      <div class="st" id="st"></div>
      <div class="ref" id="ref"><div class="k">Reference</div><div class="v" id="refv"></div></div>
      <div id="res"></div>
      <div class="hint">FR Finder by GC Tech · unofficial · drag title to move · hover % for dB error <span class="lnk" id="upd" style="display:none">· Update data</span></div>
    </div>
  </div>`;
  document.documentElement.appendChild(host);
  const $ = id => sh.getElementById(id);
  const panel = $('panel');

  // ---- remember position / state ----
  const UI_KEY = 'squigFinder:ui';
  const ui = (() => { try { return JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch { return {}; } })();
  const saveUI = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch {} };
  function place(x, y) {
    const w = panel.offsetWidth, h = panel.offsetHeight;
    x = Math.max(4, Math.min(window.innerWidth - w - 4, x));
    y = Math.max(4, Math.min(window.innerHeight - 40, y));
    panel.style.left = x + 'px'; panel.style.top = y + 'px';
    ui.x = x; ui.y = y;
  }
  place(ui.x ?? window.innerWidth - 346, ui.y ?? 12);
  if (ui.min) panel.classList.add('min');
  window.addEventListener('resize', () => place(ui.x, ui.y));

  // ---- drag ----
  let drag = null;
  $('head').addEventListener('pointerdown', ev => {
    if (ev.target.closest('button')) return;
    drag = { dx: ev.clientX - panel.offsetLeft, dy: ev.clientY - panel.offsetTop };
    panel.classList.add('drag');
    $('head').setPointerCapture(ev.pointerId);
  });
  $('head').addEventListener('pointermove', ev => { if (drag) place(ev.clientX - drag.dx, ev.clientY - drag.dy); });
  const endDrag = () => { if (drag) { drag = null; panel.classList.remove('drag'); saveUI(); } };
  $('head').addEventListener('pointerup', endDrag);
  $('head').addEventListener('pointercancel', endDrag);
  $('min').onclick = () => {
    panel.classList.toggle('min'); ui.min = panel.classList.contains('min');
    $('min').innerHTML = ui.min ? '&#43;' : '&#8211;'; saveUI(); place(ui.x, ui.y);
  };
  $('min').innerHTML = ui.min ? '&#43;' : '&#8211;';
  // keep site hotkeys from firing while typing
  ['keydown', 'keyup', 'keypress'].forEach(t => $('q').addEventListener(t, e => e.stopPropagation()));

  // ---- helpers ----
  const norm = s => s.toLowerCase().replace(/[_\s]+/g, ' ').trim();
  let ready = false, mode = Number.isInteger(ui.mode) ? ui.mode : 1, currentRef = null, pending = null, suppressUntil = 0;
  const setStatus = (t, err) => { const s = $('st'); s.textContent = t; s.classList.toggle('err', !!err); };
  function setSeg(i) {
    mode = i; ui.mode = i; saveUI();
    $('thumb').style.transform = `translateX(${i * 100}%)`;
    sh.querySelectorAll('#seg button').forEach((b, j) => b.classList.toggle('on', j === i));
  }
  setSeg(mode);
  sh.querySelectorAll('#seg button').forEach(b => b.onclick = () => { setSeg(+b.dataset.m); if (currentRef && ready) show(currentRef); });

  function findEntry(text) {
    const t = norm(text);
    return entries.find(e => norm(e.label) === t) || entries.find(e => norm(e.label).includes(t));
  }

  // mini overlay graph: reference (bright violet) vs candidate (score colour), level-aligned.
  // Bass / Treble focus zoom into the relevant frequency window and tighten the dB scale.
  const ZOOM = {
    0: { lo: 20, hi: 1500, shade: [20, 200], tag: '20 Hz – 1.5 kHz' },
    1: { lo: 20, hi: 20000, shade: [3000, 20000], tag: '' },
    2: { lo: 1500, hi: 20000, shade: [3000, 20000], tag: '1.5 – 20 kHz' }
  };
  let sparkScale = { m: 0, R: 10 };
  function computeSparkScale(ref) {
    const z = ZOOM[mode];
    let m = 0, k = 0;
    for (let i = 0; i < GRID.length; i++) if (GRID[i] >= z.lo && GRID[i] <= z.hi) { m += ref[i]; k++; }
    m /= Math.max(k, 1);
    let R = 10;
    if (mode !== 1) {
      let mx = 0;
      for (let i = 0; i < GRID.length; i++) if (GRID[i] >= z.lo && GRID[i] <= z.hi) mx = Math.max(mx, Math.abs(ref[i] - m));
      R = Math.max(5, Math.min(12, mx * 1.15));
    }
    sparkScale = { m, R };
  }
  function spark(ref, cand, color) {
    const z = ZOOM[mode], zoomed = mode !== 1;
    const { off } = alignOffset(smoothed(ref), smoothed(cand));
    const { m, R } = sparkScale;
    const STEP = zoomed ? 2 : 4, H = 24, W2 = 220;
    const L = Math.log(z.hi / z.lo);
    const px = f => Math.log(f / z.lo) / L * W2;
    const y = v => { const t = Math.max(-R, Math.min(R, v)); return (H / 2 - (t / R) * (H / 2 - 2)).toFixed(1); };
    const pr = [], pc = [];
    for (let i = 0; i < GRID.length; i += STEP) {
      if (GRID[i] < z.lo || GRID[i] > z.hi) continue;
      const x = px(GRID[i]).toFixed(1);
      pr.push(`${x},${y(ref[i] - m)}`); pc.push(`${x},${y(cand[i] + off - m)}`);
    }
    const s0 = Math.max(0, px(Math.max(z.shade[0], z.lo))), s1 = Math.min(W2, px(Math.min(z.shade[1], z.hi)));
    return `<div class="sw${zoomed ? ' z' : ''}"><svg class="spark" viewBox="0 0 ${W2} ${H}" preserveAspectRatio="none">
      <rect x="${s0.toFixed(1)}" y="0" width="${Math.max(0, s1 - s0).toFixed(1)}" height="${H}" fill="rgba(255,255,255,.05)"/>
      <polyline points="${pr.join(' ')}" fill="none" stroke="#b061ff" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
      <polyline points="${pc.join(' ')}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>${z.tag ? `<span class="rng">${z.tag}</span>` : ''}</div>`;
  }
  const scoreColor = p => p >= 75 ? '#3ddc97' : p >= 50 ? '#ffd166' : '#ff8a5c';

  function show(ref) {
    currentRef = ref;
    setMode(MODES[mode]);
    $('ref').classList.add('show');
    $('refv').textContent = ref.label;
    const box = $('res'); box.innerHTML = '';
    if (!curves.has(ref.key)) { box.innerHTML = '<div class="empty">This model\'s curve could not be loaded.</div>'; return; }
    const res = findSimilar(ref).slice(0, N_RESULTS);
    if (!res.length) { box.innerHTML = '<div class="empty">No other curves loaded yet.</div>'; return; }
    const refC = curves.get(ref.key);
    computeSparkScale(refC);
    res.forEach(({ e, d }, i) => {
      const pct = Math.max(0, Math.min(100, Math.round(100 * (1 - d / SCALE_DB))));
      const col = scoreColor(pct);
      const row = document.createElement('div');
      row.className = 'row'; row.style.animationDelay = (i * 30) + 'ms';
      row.innerHTML = `<div class="n">${i + 1}</div>
        <div class="nm"><b></b><span></span></div>
        <div class="pct" style="color:${col}" title="${d.toFixed(2)} dB weighted avg. error">${pct}%</div>
        ${spark(refC, curves.get(e.key), col)}`;
      row.querySelector('b').textContent = e.model;
      row.querySelector('span').textContent = e.brand;
      row.dataset.file = e.file;
      row.title = 'Click to add to the graph, click again to remove it';
      row.onclick = () => toggleOnGraph(e);
      box.appendChild(row);
    });
    markRows();
  }
  function setRef(entry) { $('q').value = entry.label; if (ready) show(entry); else pending = entry; }

  // ---- add / remove a result on the site's graph (click again to remove) ----
  const activeFiles = new Set();
  function markRows() {
    sh.querySelectorAll('#res .row').forEach(r => r.classList.toggle('on', activeFiles.has(norm(r.dataset.file || ''))));
  }
  window.addEventListener('message', ev => {
    if (ev.source !== window || !ev.data || ev.data.squigFinder !== 'active') return;
    activeFiles.clear();
    (ev.data.files || []).forEach(f => activeFiles.add(norm(f)));
    markRows();
  });
  function toggleOnGraph(e) {
    suppressUntil = Date.now() + 1500;
    let answered = false;
    const onMsg = ev => {
      if (ev.source !== window || !ev.data || ev.data.squigFinder !== 'toggled') return;
      answered = true; window.removeEventListener('message', onMsg);
      if (!ev.data.ok) fallback(e);
    };
    window.addEventListener('message', onMsg);
    window.postMessage({ squigFinder: 'toggle', file: e.file }, '*');
    setTimeout(() => { if (!answered) { window.removeEventListener('message', onMsg); fallback(e); } }, 500);
  }
  function fallback(e) {
    const el = [...document.querySelectorAll('.phone-item')].find(x => norm(x.getAttribute('name') || '') === norm(e.label));
    if (el) el.click(); else navigator.clipboard?.writeText(e.label);
  }

  // ---- selection on the site ----
  const byFile = f => entries.find(e => norm(e.file) === norm(f));
  window.addEventListener('message', ev => {
    if (ev.source !== window || !ev.data || ev.data.squigFinder !== 'selected') return;
    if (Date.now() < suppressUntil) return;
    const e = byFile(ev.data.file);
    if (e) setRef(e);
  });
  let prevShare = [];
  setInterval(() => {
    if (!entries.length) return;
    const s = new URLSearchParams(location.search).get('share');
    const cur = s ? s.split(',').map(x => x.replace(/_/g, ' ')) : [];
    const added = cur.filter(x => !prevShare.includes(x));
    prevShare = cur;
    if (!added.length || Date.now() < suppressUntil) return;
    const e = byFile(added[added.length - 1]);
    if (e) setRef(e);
  }, 300);

  const go = () => {
    const ref = findEntry($('q').value);
    if (!ref) { setStatus('Model not found', true); return; }
    if (!ready) { setStatus('Index the database first (button above).'); return; }
    show(ref);
  };
  $('go').onclick = go;
  $('q').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  $('idxBtn').onclick = () => indexAll(false);
  $('pauseBtn').onclick = () => { job.paused = !job.paused; refreshIdxUI(); };
  $('stopBtn').onclick = () => { job.stopped = true; job.paused = false; };
  $('upd').onclick = () => {
    const files = entries.length * CH.length * SAMPLES.length;
    if (confirm(`Re-download about ${files} files from this site to refresh the data?`)) indexAll(true);
  };

  // ====================== START ======================
  (async () => {
    try {
      $('sub').textContent = 'detecting site…';
      await initConfig();
      $('sub').textContent = 'reading phone book…';
      entries = await loadBook();
      const dl = $('dl');
      entries.forEach(e => { const o = document.createElement('option'); o.value = e.label; dl.appendChild(o); });
      // use whatever is already cached (no network)
      const cached = await cacheLoadFresh(new Set(entries.map(e => e.key)));
      cached.forEach((c, k) => curves.set(k, c));
      ready = curves.size > 0;
      refreshIdxUI();
      if (ready && pending) { show(pending); pending = null; }
    } catch (err) {
      console.warn('[FR Finder]', err, PB_URL, BASE);
      $('sub').textContent = 'not available';
      setStatus('This page is not a supported squig.link graph.', true);
    }
  })();
})();
