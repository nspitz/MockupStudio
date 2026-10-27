// Several cards in one scene (Hand, Pile): green cards are fronts, magenta cards are backs.
// Works at detection size; the caller scales the corners up to the scene.

import { KEYS, cardPieces } from './keying.js';
import { findCorners } from './corners.js';
import { polygonArea, pointInConvex, bbox } from './geometry.js';

// A card must fill at least this much of its outline; pink balloons or a pine sprig don't.
export const MIN_FILL = 0.25;

// Returns { cards: [{ role, key, corners, area }], found } where found says whether the scene has
// both a green and a magenta card. cards is empty unless it does.
export function detectCards(img) {
  const { width: w, height: h } = img;
  const green = cardPieces(img, KEYS.green.hue);
  const magenta = cardPieces(img, KEYS.magenta.hue);
  if (!green.pieces.length || !magenta.pieces.length) return { cards: [], found: false };
  const anyKey = new Uint8Array(green.candidates.length);
  for (let i = 0; i < anyKey.length; i++) anyKey[i] = green.candidates[i] | magenta.candidates[i];

  const pieces = [
    ...green.pieces.map((p) => ({ p, role: 'front', key: 'green' })),
    ...magenta.pieces.map((p) => ({ p, role: 'back', key: 'magenta' })),
  ];
  // Pass 1: other cards are their key pixels. Pass 2 also counts their whole outlines as cover, so a thumb
  // resting on the front card isn't read as bare table inside the back card's hidden part.
  const others = (j, quads) => {
    const o = new Uint8Array(anyKey.length);
    for (let i = 0; i < o.length; i++) o[i] = anyKey[i] && !pieces[j].p.mask[i] ? 1 : 0;
    quads.forEach((q, k) => {
      if (k === j || !q) return;
      const b = bbox(q, w, h);
      for (let y = b.y0; y < b.y1; y++) {
        for (let x = b.x0; x < b.x1; x++) if (!pieces[j].p.mask[y * w + x] && pointInConvex(q, x + 0.5, y + 0.5)) o[y * w + x] = 1;
      }
    });
    return o;
  };
  // Outlines only judge the fit: as edge evidence, a card underneath would make this card's real edges look hidden.
  const keyOthers = pieces.map((_, j) => others(j, []));
  const first = pieces.map((_, j) => findCorners(pieces[j].p.mask, w, h, keyOthers[j]));
  const corners = pieces.map((_, j) => findCorners(pieces[j].p.mask, w, h, keyOthers[j], others(j, first)));

  const cards = pieces.map(({ p, role, key }, j) => ({ role, key: { name: key, hue: KEYS[key].hue }, corners: corners[j], area: p.area }))
    .filter((c) => c.corners && c.area / polygonArea(c.corners) >= MIN_FILL);
  const fronts = cards.filter((c) => c.role === 'front'), backs = cards.filter((c) => c.role === 'back');
  if (!fronts.length || !backs.length) return { cards: [], found: false };
  return { cards: [...fronts, ...backs], found: true };
}
