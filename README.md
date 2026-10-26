# Mockup Studio

Turns a printable invitation design into Etsy listing mockups **without ever letting an AI redraw the design**.

An image model (e.g. Gemini) draws only the *scene*, with the card as a flat chroma-key blank (pure green `#00FF00` or magenta `#FF00FF`). This page finds that blank, perspective-warps your original design file onto it, re-applies the scene's lighting, and exports a 2000px+ JPG. Everything runs in your browser; design files are never uploaded.

Live: https://nspitz.github.io/MockupStudio/

## Use

1. Optional: paste the design's props pack (JSON with `name`, `surface`, `props`, `party`, `wall`, `colours`) under **Props pack**. It sets the theme's surface, props, party and wall for every shot.
2. Pick a shot (Pile, Main, Hand, Stand, Phone), copy the prompt, and generate the scene in Gemini. Never attach the design.
3. Open the page, choose your design (front) and the scene.
4. Check the corners (drag to fine-tune), use **Compare** to confirm the text, then **Download JPG** or **Save / Share** on a phone.

Pile and Hand scenes use two keys, green for fronts and magenta for backs. Compositing them needs hand mode and pile mode, which aren't built yet.

## Design Fidelity Rules

See `js/rules.js` (also under **Rules** in the app). In short: the design is never sent to a generator, never cropped, and only warped, lit and textured.

## Code

Plain HTML + ES modules, no build step.

| File | Job |
|---|---|
| `js/keying.js` | key-colour mask, largest region, small-hole fill |
| `js/corners.js`, `js/geometry.js` | hull → 4 corners, homographies |
| `js/compose.js` | warp, lighting, paper texture, despill, Compare flattening |
| `js/export.js` | crops (R4), output size, JPG |
| `js/handles.js` | draggable corners + magnifier |
| `js/prompt.js`, `js/props.js` | shot types, prompt text, prop library |
| `js/pack.js`, `js/promptPanel.js` | props pack parsing, the prompt section |
| `js/palette.js` | design colour names, key choice |
| `js/main.js` | page wiring |

## Tests

Serve the folder (`python -m http.server 8765`) and open `tests/selftest.html` — the title reads `SELFTEST PASS` or `SELFTEST FAIL`. Headless: `chrome --headless=new --dump-dom http://127.0.0.1:8765/tests/selftest.html`. `tests/realscene.html` runs a real scene + design from `tests/local/` (git-ignored, never published).
