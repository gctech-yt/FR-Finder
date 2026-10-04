# Changelog

## 1.4.0
- Click a result again to remove it from the site's graph; results currently on the graph are highlighted.
- Bass / Treble focus zoom the overlay previews into the relevant frequency range with a tighter dB scale.
- Slightly more weight on 3 kHz and above in every mode, clearly more in Treble mode.

## 1.3.0
- More tolerant similarity: smoothing (~1/6 oct), small frequency-shift tolerance (~±1/6 oct) and a soft cap on large errors, so curves with the same overall shape but slightly shifted peaks are recognised as similar.
- Mids weigh a bit more in Normal and Treble modes; the treble bias is kept in every mode.
- Faster weighted-median level alignment.
- Percentage scale is now 0 dB = 100 %, 3 dB = 0 %.

## 1.2.0
- Renamed to FR Finder (by GC Tech). Top 10 results. On-demand indexing with pause/stop and a 30-day cache. Icons and docs.
