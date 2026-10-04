# FR Finder

**by GC Tech** · free · open source (MIT)

A Chrome extension that finds the **most similar frequency responses** inside a [squig.link](https://squig.link) database. Pick an IEM or headphone, and FR Finder lists the 10 closest measurements from the same database, with a mini overlay graph for each one.

> **Unofficial.** FR Finder is an independent tool. It is not affiliated with squig.link or with any of the measurement creators.

## Why only inside the same database?
Every creator uses a different measurement rig, so curves from different databases are not directly comparable. FR Finder never mixes databases: results always come from the site you are currently on.

## Features
- Top **10 most similar** curves, each with a similarity % and an overlay graph (your reference in violet, the match in green/yellow/orange).
- **Bass / Normal / Treble focus** switch. Bass and mids can be fixed with EQ, treble peaks and dips come from the driver geometry, so **every mode keeps a slight bias towards 3 kHz and above**; Treble mode pushes it further.
- Level-aligned comparison: it compares the *shape*, not the volume.
- Detects the model you select on the site and updates automatically. **Click a result to add it to the site's graph, click it again to remove it** (results currently on the graph are highlighted).
- In **Bass** or **Treble** focus the mini overlay graphs **zoom into that frequency range** (20 Hz–1.5 kHz or 1.5–20 kHz) with a tighter dB scale, so differences are easier to see.
- Draggable, minimizable floating window (position is remembered).
- Respectful loading: nothing is downloaded until you press **Index this database**. Pause/Stop at any time. Data is cached locally for 30 days.

## Install (manual, takes one minute)
1. Download `fr-finder-vX.Y.Z.zip` from the [Releases](../../releases) page and **unzip it**.
2. Open `chrome://extensions` in Chrome (or Edge / Brave).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the unzipped folder (the one containing `manifest.json`).
5. Open any squig.link site (for example a creator's page), reload it, and the **FR Finder** window appears.

Requires Chrome 111 or newer. Desktop only (Chrome on phones does not support extensions).

## How to use
1. On a squig.link graph page, press **Index this database** once. It shows how many files will be read; progress is shown and you can pause or stop.
2. Select a model on the site (or type it in the FR Finder search box and press **Find**).
3. Choose **Bass / Normal / Treble** to change what matters most to you.
4. Click a result to add it to the graph, click it again to remove it.

## How similarity is computed
Each curve is resampled on 256 log-spaced points (20 Hz to 20 kHz) and L/R are averaged. Then:
1. Both curves are **smoothed** (about 1/6 octave) so narrow ripples and measurement noise do not matter.
2. They are **level-aligned** using the weighted median of their difference (shape, not volume).
3. Each point is compared with the other curve **within a small frequency window** (about ±1/6 octave), so a peak at 6.2 kHz versus 6.6 kHz counts as almost the same peak. Larger shifts are still penalized.
4. Errors are weighted by frequency (see Bass / Normal / Treble in the `PRESETS` table at the top of `extension/content.js`), and very large errors are softly capped so a single bad region (usually above 13 kHz) cannot dominate.

The percentage is a simple scale: 0 dB weighted error = 100 %, 3 dB = 0 %. Tolerances are constants at the top of the algorithm section (`SMOOTH`, `SHIFT`, `SHIFT_PENALTY`, `ERR_CAP`, `SCALE_DB`).

## Limitations
- Works on the **standard squig.link graph tool** only. Sites using other front-ends or protected data (for example custom gateways) are not supported, on purpose.
- Similar curves on a coupler do not guarantee identical sound. Above ~10 kHz measurements depend a lot on insertion depth and the rig, so treat that region with care.
- Not every database has L/R files for every model; models without files are skipped.

## Being kind to creators' servers
Measurement files are static files hosted by each creator. FR Finder downloads them only after you ask, with low concurrency (4 at a time), once, and keeps them for 30 days. If you run a squig.link site and do not want it supported, open an issue and I will exclude it.

## Privacy
No data is collected or sent anywhere. See [PRIVACY.md](PRIVACY.md).

## Credits & license
Made by **GC Tech**. MIT License, see [LICENSE](LICENSE).
