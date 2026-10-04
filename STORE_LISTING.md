# Chrome Web Store – listing material (copy/paste)

## Name
FR Finder

## Short description (max 132 characters)
Find the most similar frequency responses inside a squig.link database. Free, unofficial tool by GC Tech.

## Detailed description
FR Finder helps you discover IEMs and headphones that measure similarly, inside the same squig.link database.

How it works
• Open any squig.link graph page and press "Index this database" once.
• Select a model on the site (or search for it in the FR Finder window).
• See the 10 most similar measurements, each with a similarity % and a mini overlay graph.
• Click a result to add it to the graph, click again to remove it.

Highlights
• Bass / Normal / Treble focus. Bass and mids can be changed with EQ, treble peaks and dips come from the driver itself, so every mode keeps a slight emphasis on 3 kHz and above.
• Overlay previews zoom into the bass or treble range when you pick that focus.
• Level-aligned comparison: it compares the curve shape, not the loudness.
• Results come only from the database you are on (different creators use different measurement rigs).
• Draggable, minimizable window that remembers its position.
• Respectful of creators' servers: nothing is downloaded until you ask, with low concurrency, pause/stop, and a 30-day local cache.
• No data collection, no tracking, no accounts.

Notes
• Unofficial: not affiliated with squig.link or any measurement creator.
• Works with the standard squig.link graph tool. Desktop Chrome 111+.
• Similar measurements do not guarantee identical sound; above ~10 kHz measurements vary a lot with the rig and insertion depth.

Made by GC Tech.

## Category
Tools (or Productivity)

## Single purpose
Find and display the frequency-response measurements most similar to a selected one, within the squig.link database the user is viewing.

## Permission justification
- No `permissions` and no `host_permissions` are requested.
- Content script on `https://squig.link/*` and `https://*.squig.link/*`: needed to read the page's public data files and show the floating results window.
- Content script with `"world": "MAIN"` (same sites): needed to read the site's own configuration (data folder, channel names) and active models, and to ask the site to add a result to its graph. It does not load or execute any remote code.

## Data usage disclosure (Privacy tab)
- Does it collect user data? **No.** (Tick none of the categories.)
- Certify: data is not sold, not used for unrelated purposes, not used for creditworthiness.
- Remote code: **No.**
- Privacy policy URL: https://github.com/gctech-yt/FR-Finder/blob/main/PRIVACY.md

## Screenshots (1280×800 or 640×400)
1. The window with 10 results on a creator's graph page.
2. The Bass / Normal / Treble switch (zoom on the panel).
3. The "Index this database" card with progress.
4. A result added to the graph.
Tip: use `store/icon-440.png` as a base for the 440×280 promo tile.
