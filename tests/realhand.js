// Runs tests/local/hand-scene.jpg + hand-front.jpg + hand-back.jpg (a real two-key Gemini hand
// scene) through the same steps as the app, prints the numbers and shows the export for a screenshot.

import { KEYS, detectRegion } from '../js/keying.js';
import { findCorners } from '../js/corners.js';
import { fitLongSide, scaledCanvas, pixels } from '../js/files.js';
import { designLevels, renderComposite } from '../js/compose.js';
import { cropFor, outputSize } from '../js/export.js';

function load(id) {
  const img = document.getElementById(id);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}

const out = document.getElementById('out');
const log = (s) => { out.textContent += `${s}\n`; };

addEventListener('load', () => {
  const scene = load('sceneImg'), front = load('frontImg'), back = load('backImg');
  log(`scene ${scene.width}x${scene.height}, front ${front.width}x${front.height}, back ${back.width}x${back.height}`);

  const { w, h } = fitLongSide(scene.width, scene.height, Math.min(1000, Math.max(scene.width, scene.height)));
  const img = pixels(w === scene.width ? scene : scaledCanvas(scene, w, h));
  const k = scene.width / w;
  const corners = (mask) => findCorners(mask, w, h).map(([x, y]) => [Math.round(x * k), Math.round(y * k)]);
  const green = detectRegion(img, KEYS.green.hue);
  const largest = detectRegion(img, KEYS.magenta.hue);
  const merged = detectRegion(img, KEYS.magenta.hue, true);
  const fq = corners(green.mask), bq = corners(merged.mask);
  log(`front ${JSON.stringify(fq)}`);
  log(`back merged ${JSON.stringify(bq)} (${merged.area}px)`);
  log(`back largest piece only ${JSON.stringify(corners(largest.mask))} (${largest.area}px)`);

  const crop = cropFor(scene.width, scene.height, 'original', [...fq, ...bq]);
  const size = outputSize(crop);
  const cards = [
    { corners: fq, keyHue: KEYS.green.hue, levels: designLevels(front) },
    { corners: bq, keyHue: KEYS.magenta.hue, levels: designLevels(back) },
  ];
  const t0 = performance.now();
  const r = renderComposite({ scene, crop, outW: size.w, outH: size.h, cards, lighting: 0.8, texture: 0.12 });
  log(`export ${r.canvas.width}x${r.canvas.height} in ${Math.round(performance.now() - t0)}ms`);
  const D = pixels(r.canvas).data;
  let g = 0, m = 0;
  for (let p = 0; p < D.length; p += 4) {
    if (D[p + 1] > D[p] + 70 && D[p + 1] > D[p + 2] + 70) g++;
    if (D[p] > D[p + 1] + 70 && D[p + 2] > D[p + 1] + 70) m++;
  }
  log(`key pixels left: ${g} green, ${m} magenta`);
  document.body.append(r.canvas);
  document.title = 'REAL DONE';
});
