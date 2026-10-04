// Runs in the page context (MAIN world): reads the site's own config and active phones.
(() => {
  let prev = [], lastKey = '';
  const current = () => {
    try { return activePhones.filter(p => !p.isTarget && !p.isDynamic).map(p => p.fileName); }
    catch (e) { return null; }
  };
  setInterval(() => {
    const cur = current();
    if (!cur) return;
    const added = cur.filter(n => !prev.includes(n));
    prev = cur;
    const key = cur.join('|');
    if (key !== lastKey) { lastKey = key; window.postMessage({ squigFinder: 'active', files: cur }, '*'); }
    if (added.length) window.postMessage({ squigFinder: 'selected', file: added[added.length - 1] }, '*');
  }, 200);

  window.addEventListener('message', ev => {
    const d = ev.data;
    if (ev.source !== window || !d) return;
    if (d.squigFinder === 'getConfig') {
      const cfg = { squigFinder: 'config' };
      try { cfg.dir = DIR; } catch (e) {}
      try { cfg.phoneBook = PHONE_BOOK; } catch (e) {}
      try { cfg.channels = default_channels; } catch (e) {}
      try { cfg.samples = num_samples; } catch (e) {}
      window.postMessage(cfg, '*');
      return;
    }
    if (d.squigFinder === 'toggle') {
      let ok = false, active = false;
      try {
        const f = d.file;
        const p = window.allPhones.find(x => x.fileName === f || (x.fileNames || []).includes(f));
        const a = activePhones.find(x => !x.isTarget && (x.fileName === f || (p && (x === p || x.copyOf === p))));
        if (a) { removeCopies(a); ok = true; active = false; }          // already on the graph: remove
        else if (p) { showPhone(p, false); ok = true; active = true; }  // not there: add (compare mode)
      } catch (e) {}
      window.postMessage({ squigFinder: 'toggled', ok, active }, '*');
    }
  });
})();
