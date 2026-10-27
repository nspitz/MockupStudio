# Mockup Studio

Turns a printable invitation design into Etsy listing mockups **without ever letting an AI redraw the design**.

An image model (e.g. Gemini) draws only the *scene*, with the card as a flat chroma-key blank (pure green `#00FF00` or magenta `#FF00FF`). This page finds that blank, perspective-warps your original design file onto it, re-applies the scene's lighting, and exports a 2000px+ JPG. Everything runs in your browser; design files are never uploaded.

Live: https://nspitz.github.io/MockupStudio/

## Use

0. Optional: **Saved designs → Import library** once per device, with a library file (`{"format":"mockup-studio-library","designs":[{slug, name, front, back, pack}]}`, images as data URLs). It's kept in that browser's IndexedDB; after that, picking a design fills its front, back and props pack. Library files hold the print files you sell, so they never go in this public repo.
1. Optional: paste the design's props pack (JSON with `name`, `surface`, `props`, `party`, `wall`, `colours`) under **Props pack**. It sets the theme's surface, props, party and wall for every shot.
2. Pick a shot (Pile, Main, Hand, Stand, Phone), copy the prompt, and generate the scene in Gemini. Never attach the design.
3. Open the page, choose your design (front) and the scene.
4. Check the corners (drag to fine-tune), use **Compare** to confirm the text, then **Download JPG** or **Save / Share** on a phone.

**Pile** has no Gemini scene. The app lays out 12 cards from your front and back designs to a fixed layout (`js/layouts.js`, measured off an inspiration photo), landscape 4:3 at 2000×1500, with a soft shadow under each card. Fronts and backs alternate, the cards around the edge run off the frame, and the hero front card on top is always whole (R4's one exception). Choose both designs and it's ready to download; Compare checks the hero card.

Hand scenes (landscape 4:3) use two keys, green for the front and magenta for the back. Choose the back design too, and the app fills every card: green with the front, magenta with the back. One button per card switches which corners you're dragging. A card split in two by a card of its own colour lying across it reads as two cards.

## Design Fidelity Rules

See `js/rules.js` (also under **Rules** in the app). In short: the design is never sent to a generator, never cropped, and only warped, lit and textured.

## Code

Plain HTML + ES modules, no build step.

| File | Job |
|---|---|
| `js/keying.js` | key-colour mask, largest region, small-hole fill |
| `js/corners.js`, `js/geometry.js` | hull → 4 corners (hidden ones too), homographies |
| `js/detect.js` | several cards in one scene: green fronts, magenta backs |
| `js/compose.js` | warp, lighting, paper texture, despill, Compare flattening; layout rendering with shadows |
| `js/layouts.js` | fixed card layouts (Pile): positions, angles, front/back, hero |
| `js/export.js` | crops (R4), output size, JPG |
| `js/handles.js` | draggable corners + magnifier |
| `js/prompt.js`, `js/props.js` | shot types, prompt text, prop library |
| `js/pack.js`, `js/promptPanel.js` | props pack parsing, the prompt section |
| `js/library.js` | saved designs: library import, on-device storage |
| `js/palette.js` | design colour names, key choice |
| `js/main.js` | page wiring |

## Tests

Serve the folder (`python -m http.server 8765`) and open `tests/selftest.html` — the title reads `SELFTEST PASS` or `SELFTEST FAIL`. Headless: `chrome --headless=new --dump-dom http://127.0.0.1:8765/tests/selftest.html`. `tests/realscene.html` runs a real scene + design from `tests/local/` (git-ignored, never published); `tests/realmulti.html?set=hand` (or `?set=pile`, add `&outline` to draw the detected cards) does the same for a two-key scene (`<set>-scene.jpg`, `<set>-front.jpg`, `<set>-back.jpg`). `tests/layout.html` draws the Pile layout's outlines over `tests/local/pile-inspo.jpg` and renders it from `pile-front.jpg` + `pile-back.jpg`, for re-measuring a layout. Use a fresh `--user-data-dir` for headless runs, or Chrome serves cached modules. Under `--virtual-time-budget` IndexedDB stalls, so the library tests run on the 3s memory fallback; to test IndexedDB itself, run on real time with `--remote-debugging-port` and read the page title from `/json`.
