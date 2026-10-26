// Runs a real two-key Gemini scene through the same detection and compositing as the app:
// tests/local/<set>-scene.jpg + <set>-front.jpg + <set>-back.jpg, with ?set=hand (default) or ?set=pile.
// Prints the numbers and shows the export, with each detected outline drawn on top when ?outline.

import { fitLongSide, scaledCanvas, pixels } from '../js/files.js';
import { detectCards } from '../js/detect.js';
import { designLevels, renderComposite } from '../js/compose.js';
import { cropFor, outputSize } from '../js/export.js';

const params = new URLSearchParams(location.search);
const set = params.get('set') || 'hand';
const imgs = [['sceneImg', 'scene'], ['frontImg', 'front'], ['backImg', 'back']].map(([id, part]) => document.getElementById(id));
const loaded = imgs.map((img, i) => new Promise((res, rej) => {
  img.onload = res;
  img.onerror = () => rej(new Error(`missing ${img.src}`));
  img.src = `local/${set}-${['scene', 'front', 'back'][i]}.jpg`;
}));

function load(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}

const out = document.getElementById('out');
const log = (s) => { out.textContent += `${s}\n`; };

Promise.all(loaded).catch((e) => { log(e.message); throw e; }).then(() => {
  const [scene, front, back] = imgs.map(load);
  log(`${set}: scene ${scene.width}x${scene.height}, front ${front.width}x${front.height}, back ${back.width}x${back.height}`);

  const { w, h } = fitLongSide(scene.width, scene.height, Math.min(1000, Math.max(scene.width, scene.height)));
  const img = pixels(w === scene.width ? scene : scaledCanvas(scene, w, h));
  const k = scene.width / w;
  const t0 = performance.now();
  const found = detectCards(img);
  log(`detect ${Math.round(performance.now() - t0)}ms, found=${found.found}`);
  const cards = found.cards.map((c) => ({ ...c, corners: c.corners.map(([x, y]) => [Math.round(x * k), Math.round(y * k)]) }));
  for (const c of cards) log(`${c.role} ${JSON.stringify(c.corners)}`);

  const crop = cropFor(scene.width, scene.height, 'original', cards.flatMap((c) => c.corners));
  const size = outputSize(crop);
  const levels = { front: designLevels(front), back: designLevels(back) };
  const t1 = performance.now();
  const r = renderComposite({
    scene, crop, outW: size.w, outH: size.h, lighting: 0.8, texture: 0.12,
    cards: cards.map((c) => ({ corners: c.corners, keyHue: c.key.hue, levels: levels[c.role] })),
  });
  log(`export ${r.canvas.width}x${r.canvas.height} in ${Math.round(performance.now() - t1)}ms`);
  const D = pixels(r.canvas).data;
  let g = 0, m = 0;
  for (let p = 0; p < D.length; p += 4) {
    if (D[p + 1] > D[p] + 70 && D[p + 1] > D[p + 2] + 70) g++;
    if (D[p] > D[p + 1] + 70 && D[p + 2] > D[p + 1] + 70) m++;
  }
  log(`key pixels left: ${g} green, ${m} magenta`);
  if (params.has('outline')) {
    const x = r.canvas.getContext('2d'), s = size.w / crop.w;
    x.lineWidth = 4;
    for (const c of cards) {
      x.strokeStyle = c.role === 'front' ? '#0a0' : '#a0a';
      x.beginPath();
      c.corners.forEach(([px, py], i) => (i ? x.lineTo((px - crop.x) * s, (py - crop.y) * s) : x.moveTo((px - crop.x) * s, (py - crop.y) * s)));
      x.closePath();
      x.stroke();
    }
  }
  document.body.append(r.canvas);
  document.title = 'REAL DONE';
});
