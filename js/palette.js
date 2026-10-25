// Reads a design's main colours and names them, and picks the key colour furthest from them.
// Pure pixel maths: the design is never sent anywhere (R1).

import { pixels } from './files.js';
import { hue, hueDistance, KEYS } from './keying.js';

export const NAMED = [
  ['white', 255, 255, 255], ['cream', 245, 238, 220], ['beige', 225, 210, 180], ['tan', 200, 170, 130],
  ['light gray', 200, 200, 200], ['gray', 128, 128, 128], ['charcoal', 60, 60, 60], ['black', 20, 20, 20],
  ['blush pink', 240, 200, 200], ['dusty rose', 205, 140, 145], ['rose', 200, 80, 95], ['pink', 240, 150, 180], ['hot pink', 230, 60, 140], ['coral', 245, 120, 100],
  ['red', 220, 30, 40], ['deep red', 160, 25, 40], ['burgundy', 110, 20, 35], ['orange', 240, 130, 40],
  ['peach', 250, 190, 150], ['mustard', 210, 170, 50], ['gold', 200, 160, 70], ['yellow', 250, 220, 60],
  ['sage green', 160, 180, 140], ['olive green', 110, 120, 60], ['emerald green', 20, 130, 80],
  ['forest green', 30, 80, 50], ['mint', 170, 230, 200], ['teal', 20, 130, 130], ['light blue', 170, 200, 230],
  ['sky blue', 100, 170, 230], ['royal blue', 40, 80, 200], ['navy', 25, 35, 80], ['lavender', 190, 170, 225],
  ['purple', 110, 50, 160], ['plum', 100, 40, 80], ['brown', 110, 70, 40],
];

// "Redmean" distance: cheap, and closer to how people see colour than plain RGB.
function distance([r1, g1, b1], [r2, g2, b2]) {
  const rm = (r1 + r2) / 2, dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

export function nameColour(rgb) {
  let best = NAMED[0], bd = Infinity;
  for (const n of NAMED) {
    const d = distance(rgb, n.slice(1));
    if (d < bd) { bd = d; best = n; }
  }
  return best[0];
}

const hex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

// Up to `max` colours covering at least 4% of the design each, biggest first, one per name.
// Samples real pixels on a grid rather than shrinking the image: shrinking blends fine detail
// (white lace on red) into colours that aren't in the design.
export function extractColours(canvas, max = 4) {
  const { data } = pixels(canvas);
  const stride = Math.max(1, Math.round(Math.sqrt((canvas.width * canvas.height) / 40000)));
  const bins = new Map();
  let total = 0;
  for (let y = 0; y < canvas.height; y += stride) {
    for (let x = 0; x < canvas.width; x += stride) {
      const p = (y * canvas.width + x) * 4;
      total++;
      const k = ((data[p] >> 4) << 8) | ((data[p + 1] >> 4) << 4) | (data[p + 2] >> 4);
      const b = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 };
      b.n++; b.r += data[p]; b.g += data[p + 1]; b.b += data[p + 2];
      bins.set(k, b);
    }
  }
  const picked = [];
  for (const b of [...bins.values()].sort((x, y) => y.n - x.n)) {
    const rgb = [b.r / b.n, b.g / b.n, b.b / b.n];
    const near = picked.find((c) => distance(c.rgb, rgb) < 48);
    if (near) near.n += b.n;
    else picked.push({ rgb, n: b.n });
  }
  const byName = new Map();
  for (const c of picked.sort((x, y) => y.n - x.n)) {
    const name = nameColour(c.rgb);
    if (byName.has(name)) byName.get(name).share += c.n / total;
    else byName.set(name, { name, rgb: c.rgb, hex: hex(c.rgb), share: c.n / total });
  }
  return [...byName.values()].filter((c) => c.share >= 0.04).sort((a, b) => b.share - a.share).slice(0, max);
}

// The key whose hue is furthest from every strong colour in the design; green when it's a tie.
export function chooseKey(colours) {
  const strong = colours.filter(({ rgb: [r, g, b] }) => {
    const max = Math.max(r, g, b);
    return max >= 64 && (max - Math.min(r, g, b)) / max >= 0.25;
  });
  if (!strong.length) return 'green';
  const gap = (keyHue) => Math.min(...strong.map((c) => hueDistance(hue(...c.rgb), keyHue)));
  return gap(KEYS.magenta.hue) > gap(KEYS.green.hue) ? 'magenta' : 'green';
}
