# Changelog

## 2026-10-25 — Step 2: Gemini prompt panel

- New section 2: mockup type (Main flat-lay / Stand / Phone), surface (4 presets + Other), prop checkboxes in 4 groups, "+ Add" for your own props, one-off "Other props", and an editable prompt with Copy.
- Reads the design's main colours from real pixels (no AI, R1) and names them for the props palette; picks green or magenta, whichever is furthest from them. Real red-lace design → white, deep red, rose → green.
- Remembers ticked props, surface and other props per mockup type, plus your own props — on that device only.
- The key-colour blank, "nothing covers the card/screen" and no-text rules are fixed text added in code.
- Tests: 21 self-checks passing (8 new: colour naming, key choice, all 3 prompt types). Phone layout: props in two columns; empty-stage placeholder fixed.

## 2026-10-25 — Step 1: compositing engine

- Single-page tool, phone-first: open a design and a green/magenta-card scene, auto-detect the key colour and the card's 4 corners, drag-to-fix corners with a magnifier, eyedropper key pick, rotate design in 90° steps.
- Compositor: homography warp from the original file with mip levels, lighting from the key pixels (0–100%), procedural paper texture (0–30%), 1px feather, despill. Scene is upscaled first so the design renders at final size (2000px+ long side).
- Export crops Original / 3:4 / 4:5 / 1:1 / 4:3 that refuse to cut the card (R4); JPG stepped to stay under ~1MB; Save / Share on phones.
- Compare: original next to the card flattened back out of the mockup.
- Tests: `tests/selftest.html` (13 synthetic checks, all passing); `tests/realscene.html` on a real Gemini scene — corners exact, 0 green pixels left, 1493×2000 export ≈0.7MB.
