// Runs a batch of real scenes through the app's own detection and compositing, headless.
// tests/local/batch/manifest.json: [{ id, mode: 'single' | 'multi' | 'phone' | 'layout', cards?, scene?, layout?, front, back? }],
// file names relative to tests/local/batch/. Writes [{ id, ok, log, jpeg }] into #result.
//   single: one key card (Main, Stand), green or magenta, whichever is larger.
//   multi:  green fronts + magenta backs (Hand).
//   phone:  one key screen; the whole design is fitted inside it, padded with its own edge colour.
//   layout: no scene; the named layout (Pile) is drawn from the front and back designs.

import { fitLongSide, scaledCanvas, pixels } from '../js/files.js';
import { KEYS, detectRegion } from '../js/keying.js';
import { findCorners } from '../js/corners.js';
import { detectCards } from '../js/detect.js';
import { quadSize } from '../js/geometry.js';
import { designLevels, renderComposite, renderLayout } from '../js/compose.js';
import { cropFor, outputSize, toJpegBlob } from '../js/export.js';
import { LAYOUTS, layoutSize, layoutCards } from '../js/layouts.js';

const DETECT_LONG = 1000;
const BASE = 'local/batch/';
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
    img.src = BASE + name;
  });
}

// Same scaling as main.js detect(): detect at 1000px long side, corners back in scene pixels.
function detectImage(scene) {
  const long = Math.max(scene.width, scene.height);
  const { w, h } = fitLongSide(scene.width, scene.height, Math.min(DETECT_LONG, long));
  const img = pixels(long > DETECT_LONG ? scaledCanvas(scene, w, h) : scene);
  const k = scene.width / w;
  return { img, w, h, toScene: (q) => q.map(([x, y]) => [x * k, y * k]) };
}

function singleCard(scene) {
  const { img, w, h, toScene } = detectImage(scene);
  const green = detectRegion(img, KEYS.green.hue);
  const magenta = detectRegion(img, KEYS.magenta.hue);
  const best = green.area >= magenta.area ? { ...green, key: 'green' } : { ...magenta, key: 'magenta' };
  const coverage = best.area / (w * h);
  const quad = coverage >= 0.005 ? findCorners(best.mask, w, h) : null;
  if (!quad) throw new Error('no key-colour card found');
  return { role: 'front', key: { name: best.key, hue: KEYS[best.key].hue }, corners: toScene(quad), coverage };
}

// Median colour of the design's outer 2% border: the padding colour for a phone screen.
function edgeColour(design) {
  const { width: w, height: h } = design;
  const d = pixels(design).data, b = Math.max(2, Math.round(Math.min(w, h) * 0.02));
  const ch = [[], [], []];
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      if (x >= b && x < w - b && y >= b && y < h - b) continue;
      const p = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) ch[c].push(d[p + c]);
    }
  }
  const med = (a) => a.sort((m, n) => m - n)[a.length >> 1];
  return `rgb(${med(ch[0])},${med(ch[1])},${med(ch[2])})`;
}

// The design scaled to fit whole inside a canvas of the screen's shape (never cropped or stretched).
function fitToScreen(design, corners) {
  const q = quadSize(corners);
  const ratio = q.w / q.h;
  let cw = design.width, ch = design.height;
  if (cw / ch > ratio) ch = Math.round(cw / ratio); else cw = Math.round(ch * ratio);
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const x = c.getContext('2d');
  x.fillStyle = edgeColour(design);
  x.fillRect(0, 0, cw, ch);
  x.drawImage(design, Math.round((cw - design.width) / 2), Math.round((ch - design.height) / 2));
  return c;
}

function keyLeft(canvas) {
  const D = pixels(canvas).data;
  let g = 0, m = 0;
  for (let p = 0; p < D.length; p += 4) {
    if (D[p + 1] > D[p] + 70 && D[p + 1] > D[p + 2] + 70) g++;
    if (D[p] > D[p + 1] + 70 && D[p + 2] > D[p + 1] + 70) m++;
  }
  return { g, m };
}

const toDataUrl = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });

async function layoutJob(job) {
  const layout = LAYOUTS[job.layout];
  if (!layout) throw new Error(`unknown layout ${job.layout}`);
  const designs = {};
  for (const role of ['front', 'back']) {
    const design = await loadCanvas(job[role]);
    designs[role] = { design, levels: designLevels(design) };
  }
  const { w, h } = layoutSize(layout);
  const r = renderLayout({ outW: w, outH: h, lighting: 0.8, texture: 0.12, cards: layoutCards(layout, w, h, designs) });
  const blob = await toJpegBlob(r.canvas);
  const lines = [`layout ${job.layout}, ${layout.cards.length} cards`, `export ${w}x${h}, ${(blob.size / 1e6).toFixed(2)} MB`];
  return { id: job.id, ok: true, log: lines, cards: layout.cards.length, jpeg: await toDataUrl(blob) };
}

async function runJob(job) {
  if (job.mode === 'layout') return layoutJob(job);
  const lines = [];
  const scene = await loadCanvas(job.scene);
  const front = await loadCanvas(job.front);
  const back = job.back ? await loadCanvas(job.back) : null;
  lines.push(`scene ${scene.width}x${scene.height}, mode ${job.mode}`);

  let cards;
  if (job.mode === 'multi') {
    const { img, toScene } = detectImage(scene);
    const found = detectCards(img);
    if (!found.found) throw new Error('needs both a green and a magenta card');
    cards = found.cards.map((c) => ({ ...c, corners: toScene(c.corners) }));
  } else {
    const card = singleCard(scene);
    lines.push(`${card.key.name} card, ${(card.coverage * 100).toFixed(1)}% of the scene`);
    cards = [card];
  }
  for (const c of cards) lines.push(`${c.role} ${JSON.stringify(c.corners.map((p) => p.map(Math.round)))}`);
  // Two same-colour cards touching read as one: refuse rather than export a broken mockup.
  if (job.cards && cards.length !== job.cards) throw new Error(`found ${cards.length} cards, expected ${job.cards}: redo this scene`);

  const design = { front: job.mode === 'phone' ? fitToScreen(front, cards[0].corners) : front, back };
  const levels = { front: designLevels(design.front), back: back && designLevels(back) };
  const crop = cropFor(scene.width, scene.height, 'original', cards.flatMap((c) => c.corners));
  const size = outputSize(crop);
  const r = renderComposite({
    scene, crop, outW: size.w, outH: size.h, lighting: 0.8, texture: 0.12,
    cards: cards.map((c) => ({ corners: c.corners, keyHue: c.key.hue, levels: levels[c.role] })),
  });
  const left = keyLeft(r.canvas);
  const blob = await toJpegBlob(r.canvas);
  lines.push(`export ${r.canvas.width}x${r.canvas.height}, ${(blob.size / 1e6).toFixed(2)} MB, key pixels left: ${left.g} green, ${left.m} magenta`);
  return { id: job.id, ok: true, log: lines, cards: cards.length, keyLeft: left, jpeg: await toDataUrl(blob) };
}

const jobs = await (await fetch(`${BASE}manifest.json`, { cache: 'no-store' })).json();
const results = [];
for (const job of jobs) {
  try {
    const r = await runJob(job);
    log(`${job.id}: ${r.log.join(' | ')}`);
    results.push(r);
  } catch (e) {
    log(`${job.id}: FAILED ${e.message}`);
    results.push({ id: job.id, ok: false, log: [e.message] });
  }
}
document.getElementById('result').textContent = JSON.stringify(results);
document.title = 'BATCH DONE';
