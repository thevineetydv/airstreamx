# Studio Editor music library

The editor only lets creators use tracks listed in `public/studio-music/manifest.json`
(no custom music uploads), so every exported video is safe to publish.

## Built-in tracks
Made by `generate.py` from pure synthesis (no samples), so AirStreamX owns them.
Regenerate: `python3 scripts/studio-music/generate.py` (needs numpy, scipy, ffmpeg).

## Adding a real track
1. Use only tracks that are **CC0 / public domain** or that you have a written licence
   to redistribute inside your app. "Free for YouTube" or "no attribution needed"
   is NOT always enough — the app hands the file to every creator.
2. Encode: `ffmpeg -i in.wav -af loudnorm=I=-15:TP=-1.5 -c:a libmp3lame -b:a 96k public/studio-music/<id>.mp3`
   (MP3 plays in every browser, including Chromium without H.264/AAC.)
3. Add an entry to `manifest.json`: `id, title, mood, goodFor, url, duration, license`
   (put the source URL + licence in `license`).
4. Keep files ≲ 1 MB (≈ 60–90 s loop). They are not pre-cached by the PWA,
   only downloaded when a creator picks music.
