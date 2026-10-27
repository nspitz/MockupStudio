# Changelog

## 2026-10-27 — Hidden back corner under a thumb; cleaner card edges

- Detection: in a wide-fan Hand scene, the back card's bottom-left corner was hidden under the front card, and the thumb on the front card sat inside that hidden part. The correct reading (visible edges extended under the front card) was rejected because the thumb counted as bare wall, so the back design was warped into a trapezoid. `detectCards` now makes a second pass where other cards' whole outlines count as cover when judging the fit (`findCorners(…, cover)`); as edge evidence it still uses key pixels only, so a card underneath can't make real edges look hidden. The old real hand and pile scenes detect identically.
- Despill: green and magenta keys now use classic spill suppression (only the key's channels come down), so the blank's dull side edge keeps the table's colour instead of a green or grey line. It reaches 3 scene pixels rather than 3 output pixels, and the hue window is ±70°.
- Tests: 49 self-checks passing (new: wide-fan hand with a thumb over the hidden corner, which was 205px off before the fix and is 1.1px now).

## 2026-10-27 — Prompt restyle from real listing photos

- Props now sit close around the card in loose, asymmetric, overlapping groups, cropped by the frame and never evenly spaced, with only a little bare surface showing. A ribbon or sprig may tuck under the card's edge, but nothing rests on it. Main's card fills about two thirds of the frame. The light is soft side light, with a calm surface and the colour carried by the props. Why: the first restyle put one prop in each corner with bare linen between, which read as staged.
- Props packs gain `scatter` (sparse stars or confetti around the card, never on it). Hand stays prop-free.
- Tests: 48 self-checks passing (new: scatter; pack parsing now checks scatter; main and phone wording updated).

## 2026-10-27 — Pile as a fixed layout, landscape Hand

- Pile no longer uses a Gemini scene. The app draws 12 cards from the front and back designs to a fixed layout measured off an inspiration photo (`js/layouts.js`): fronts and backs alternating, edge cards running off the frame, the hero front on top, landscape 4:3 at 2000×1500. Each card casts a soft shadow on the cards below it, which follows the Lighting slider; paper texture as before. Picking Pile hides the prompt and needs no scene, the crop setting doesn't apply, and Compare checks the hero card.
- Shadows strengthened after the first review (opacity 0.45 → 0.7 × Lighting, wider blur and offset), so a front lying over a back stands out. Hand prompt: the two cards are fanned as wide as a natural one-handed hold allows, with the back card turned about 20° and all four of its corners visible.
- R4 gains its one exception: in the Pile, cards around the hero may run off the frame; the hero is always whole, and a layout that would cut it throws.
- `compose.js`: the warp loop is shared by scene compositing and the new `renderLayout`. Hand prompt is now landscape 4:3. The Pile prompt is gone; `tests/prompts.html` builds four prompts.
- `tests/batch.js` has a `layout` mode (no scene). New `tests/layout.html` overlays the layout on the inspiration photo for re-measuring.
- Tests: 47 self-checks passing (7 new: layout size and cards, mixed fronts/backs and edge cards, full frame coverage, hero matches its design, shadow render, R4 hero check, no Pile prompt; the old Pile prompt check removed, the hand prompt check now wants landscape). Driven in the page too: Pile → designs → preview, Compare, back to Hand.

## 2026-10-26 — Prompt restyle, batch pages

- Prompts: props now sit at the edges and corners of the frame, partly cropped so mostly only an edge or a corner shows, with open surface around the card. Every shot asks for rich, warm, true-to-life colour that's not washed out or pastel (it was "soft daylight").
- New `tests/batch.html` composites a manifest of real scenes headless (single, two-key, and phone with the whole design fitted inside the screen), and refuses a scene with the wrong card count. New `tests/prompts.html` builds the five prompts for each props pack with `buildPrompt`. Both read from the git-ignored `tests/local/batch/`.
- Tests: self-checks updated for the new wording; SELFTEST PASS.

## 2026-10-26 — Saved designs

- New in section 1: **Saved designs** and **Import library**. A library file holds each design's front, back and props pack; it's imported once per device into IndexedDB (falling back to memory for the session if the browser won't store it or stalls for 3s). Picking a design loads all three, and re-detects when a scene is already open, so you can go through designs over the same scene. Re-importing replaces designs by slug.
- Library files are made outside this repo (they hold the print files) and are never published here.
- Size warning now starts below 1400px on the short side (Canva 5x7 exports are 1429×2000).
- Tests: 41 self-checks passing (2 new: library import/replace/load, reject a non-library file). A real 7-design, 21.5 MB library imported and drove the full flow in the page on real IndexedDB.

## 2026-10-26 — Step 3: pile mode

- Any number of green fronts and magenta backs in one scene. Each key colour is split into cards: a piece at least 25% of that colour's largest is a card, smaller pieces down to 1% join the nearest card (the back card's slivers in a hand shot), and the rest is noise. Every card must fill 25% of its outline.
- Corners under another card: the hull of a covered card runs along the edge of the card on top, which looks just like a real edge. With the other cards' pixels known, hull edges whose both ends touch another card are left out and the real edges are extended to meet. That reading is kept only when it explains the scene clearly better (its own key pixels outside it, plus bare background inside it, at most half the alternative's), so cards on top keep their exact corners.
- New `js/detect.js` (multi-card detection shared by the app and the real-scene test); `mergedComponents` replaced by `cardPieces`. One corner button per card (Front 1, Front 2, Back 1, Back 2); the others are dashed outlines. Compare shows every pair.
- Tests: 39 self-checks passing (new: synthetic 4-card pile with 3 hidden corners, all within 2.2px). `tests/realhand.*` became `tests/realmulti.html?set=hand|pile`; on the real Gemini pile scene all 4 cards are found and 0 key pixels are left, and the hand scene is unchanged.

## 2026-10-26 — Step 4: hand mode

- New picker: Design (back). A scene with a sizeable green card and a magenta card that fills at least 25% of its outline becomes a hand shot: front design on green, back design on magenta. Without a back design the app says to choose one; pink balloons in a Stand scene don't count as a card.
- The back card is found from every piece of magenta, merged (at least 1% of the largest piece). Seen around the front card, it splits into separate pieces, and the largest piece alone put its corners up to 433px off on the real scene.
- Hidden corners: the card's 4 edges are extended to meet, so a corner under the hand is still found (front card's bottom-left: was 13px off, now exact). The old method is kept when nothing is hidden, so visible corners stay exact.
- `renderComposite` takes a list of cards and reads every card's mask from the untouched scene before drawing any design, so a back design full of green can't be taken for the green key.
- Corners: a Front / Back switch; the other card is drawn as a dashed outline. Crops keep both cards whole (R4). Compare shows both pairs.
- Tests: 36 self-checks passing (7 new: merged back pieces, front under a thumb, no key left, both cards match their designs, two hidden-corner cases). `tests/realhand.html` on the real Gemini hand scene: 0 green and 0 magenta pixels left, 1493×2000.

## 2026-10-26 — Step 2b: five shots and props packs

- Shot types are now Pile, Main, Hand, Stand, Phone. Main is head-on (straight down, square to the frame). Stand puts a named party in the blurred background.
- Pile: four fanned cards with every corner visible, two green (fronts) and two magenta (backs), the same colour never touching. Hand: one hand holding a green front card fanned over a magenta back card against a wall, with no props. Both forbid other bright green or magenta objects. Prompts only for now; compositing comes with hand mode and pile mode.
- Props pack: paste a design's JSON (surface, props, party, wall, colours) to fill all five shots. Its props show as a "This design" group you can untick per shot, and its colours set the props palette and the key choice. It's remembered on the device until cleared.
- New "Background" field (Party on Stand, Wall on Hand).
- Tests: 29 self-checks passing (8 new: head-on main, party on stand, pile, hand, pack parsing).

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
