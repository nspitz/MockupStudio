// Runs tests/local/scene.jpg + tests/local/design.jpg through the same steps as the app,
// prints the numbers, and shows the export (or, with ?flat, the Compare pair) for a screenshot.

import { KEYS, detectRegion } from '../js/keying.js';
import { findCorners } from '../js/corners.js';
import { fitLongSide, scaledCanvas, pixels } from '../js/files.js';
import { designLevels, renderComposite, flattenCard } from '../js/compose.js';
import { cropFor, outputSize } from '../js/export.js';

// Everything runs synchronously inside the load event, so headless Chrome's --dump-dom sees the result.
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

addEventListener('load', run);

function run() {
const scene = load('sceneImg');
const design = load('designImg');
log(`scene ${scene.width}x${scene.height}, design ${design.width}x${design.height}`);

const { w, h } = fitLongSide(scene.width, scene.height, Math.min(1000, Math.max(scene.width, scene.height)));
const img = pixels(w === scene.width ? scene : scaledCanvas(scene, w, h));
const region = detectRegion(img, KEYS.green.hue);
const k = scene.width / w;
const corners = findCorners(region.mask, w, h).map(([x, y]) => [x * k, y * k]);
log(`coverage ${(100 * region.area / (w * h)).toFixed(1)}%, corners ${JSON.stringify(corners.map((p) => p.map(Math.round)))}`);

const levels = designLevels(design);
const crop = cropFor(scene.width, scene.height, 'original', corners);
const size = outputSize(crop);
const params = { scene, crop, outW: size.w, outH: size.h, corners, keyHue: KEYS.green.hue, levels };

const t0 = performance.now();
const r = renderComposite({ ...params, lighting: 0.8, texture: 0.12 });
log(`export ${r.canvas.width}x${r.canvas.height} in ${Math.round(performance.now() - t0)}ms`);
log(`jpg at q0.92 ≈ ${((r.canvas.toDataURL('image/jpeg', 0.92).length * 0.75) / 1e6).toFixed(2)} MB`);

const D = pixels(r.canvas).data;
let spill = 0;
for (let p = 0; p < D.length; p += 4) if (D[p + 1] > D[p] + 70 && D[p + 1] > D[p + 2] + 70) spill++;
log(`green pixels left: ${spill}`);

const neutral = renderComposite({ ...params, lighting: 0, texture: 0 });
const flat = flattenCard(neutral.canvas, neutral.quad, design.width, design.height);
const A = pixels(flat).data;
const B = pixels(scaledCanvas(design, flat.width, flat.height)).data;
let sum = 0, n = 0;
const mx = Math.round(flat.width * 0.02), my = Math.round(flat.height * 0.02);
for (let y = my; y < flat.height - my; y++) {
  for (let x = mx; x < flat.width - mx; x++) {
    const p = (y * flat.width + x) * 4;
    for (let c = 0; c < 3; c++) { sum += Math.abs(A[p + c] - B[p + c]); n++; }
  }
}
log(`neutral flatten vs original: mean abs diff ${(sum / n).toFixed(2)}/255`);

if (new URLSearchParams(location.search).has('flat')) {
  document.body.append(design, flat);
} else {
  document.body.append(r.canvas);
}
document.title = 'REAL DONE';
}
