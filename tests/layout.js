// Draws the Pile layout's outlines over the inspiration photo, numbered bottom to top, and renders
// the template with real designs. ?scale=2 draws the overlay bigger.

import { LAYOUTS, layoutQuads } from '../js/layouts.js';
import { designLevels, renderLayout } from '../js/compose.js';

const out = document.getElementById('out');
const log = (s) => { out.textContent += `${s}\n`; };

function loadCanvas(name) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      res(c);
    };
    img.onerror = () => rej(new Error(`missing ${name}`));
    img.src = `local/${name}`;
  });
}

const layout = LAYOUTS.pile;
const scale = Number(new URLSearchParams(location.search).get('scale')) || 1.5;
const result = {};
try {
  const inspo = await loadCanvas('pile-inspo.jpg');
  const front = await loadCanvas('pile-front.jpg');
  const back = await loadCanvas('pile-back.jpg');
  const aspect = { front: front.height / front.width, back: back.height / back.width };

  const ov = document.createElement('canvas');
  ov.width = Math.round(inspo.width * scale);
  ov.height = Math.round(inspo.height * scale);
  const x = ov.getContext('2d');
  x.drawImage(inspo, 0, 0, ov.width, ov.height);
  const quads = layoutQuads(layout, ov.width, ov.height, aspect);
  x.lineWidth = 2;
  x.font = 'bold 28px sans-serif';
  quads.forEach((q, i) => {
    x.strokeStyle = q.role === 'front' ? '#00ff00' : '#ff00ff';
    x.beginPath();
    q.corners.forEach(([px, py], j) => (j ? x.lineTo(px, py) : x.moveTo(px, py)));
    x.closePath();
    x.stroke();
    const cx = q.corners.reduce((s, p) => s + p[0], 0) / 4, cy = q.corners.reduce((s, p) => s + p[1], 0) / 4;
    x.fillStyle = x.strokeStyle;
    x.fillText(String(i), Math.min(ov.width - 30, Math.max(4, cx)), Math.min(ov.height - 6, Math.max(28, cy)));
  });
  result.overlay = ov.toDataURL('image/png');

  const W = 2000, H = 1500;
  const t0 = performance.now();
  const r = renderLayout({
    outW: W, outH: H, lighting: 0.8, texture: 0.12,
    cards: layoutQuads(layout, W, H, aspect).map((c) => ({ corners: c.corners, levels: designLevels(c.role === 'back' ? back : front) })),
  });
  log(`render ${W}x${H} in ${Math.round(performance.now() - t0)} ms`);
  result.render = r.canvas.toDataURL('image/jpeg', 0.9);
  for (const src of [result.overlay, result.render]) {
    const img = document.createElement('img');
    img.src = src;
    document.getElementById('view').append(img);
  }
} catch (e) {
  log(`FAILED ${e.message}`);
}
document.getElementById('result').textContent = JSON.stringify(result);
document.title = 'LAYOUT DONE';
