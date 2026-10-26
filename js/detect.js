// Several cards in one scene (Hand, Pile): green cards are fronts, magenta cards are backs.
// Works at detection size; the caller scales the corners up to the scene.

import { KEYS, cardPieces } from './keying.js';
import { findCorners } from './corners.js';
import { polygonArea } from './geometry.js';

// A card must fill at least this much of its outline; pink balloons or a pine sprig don't.
export const MIN_FILL = 0.25;

// Returns { cards: [{ role, key, corners, area }], found } where found says whether the scene has
// both a green and a magenta card. cards is empty unless it does.
export function detectCards(img) {
  const { width: w, height: h } = img;
  const green = cardPieces(img, KEYS.green.hue);
  const magenta = cardPieces(img, KEYS.magenta.hue);
  const anyKey = new Uint8Array(green.candidates.length);
  for (let i = 0; i < anyKey.length; i++) anyKey[i] = green.candidates[i] | magenta.candidates[i];

  const cardsOf = ({ pieces }, role, key) => pieces.map((p) => {
    const others = new Uint8Array(anyKey.length);
    for (let i = 0; i < others.length; i++) others[i] = anyKey[i] && !p.mask[i] ? 1 : 0;
    const corners = findCorners(p.mask, w, h, others);
    return { role, key: { name: key, hue: KEYS[key].hue }, corners, area: p.area };
  }).filter((c) => c.corners && c.area / polygonArea(c.corners) >= MIN_FILL);

  if (!green.pieces.length || !magenta.pieces.length) return { cards: [], found: false };
  const fronts = cardsOf(green, 'front', 'green');
  const backs = cardsOf(magenta, 'back', 'magenta');
  if (!fronts.length || !backs.length) return { cards: [], found: false };
  return { cards: [...fronts, ...backs], found: true };
}
