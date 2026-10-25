// Wires the page together: files → detect → handles → preview → compare / export.

import { RULES } from './rules.js';
import { loadImage, scaledCanvas, fitLongSide, pixels, slugify } from './files.js';
import { KEYS, detectRegion, sampleHue } from './keying.js';
import { findCorners, defaultCorners } from './corners.js';
import { rotateCorners, quadSize } from './geometry.js';
import { designLevels, renderComposite, flattenCard } from './compose.js';
import { cropFor, outputSize, toJpegBlob, downloadBlob, canShareFiles, shareBlob } from './export.js';
import { createHandles } from './handles.js';

const PREVIEW_LONG = 1400;
const DETECT_LONG = 1000;

const $ = (id) => document.getElementById(id);

const state = {
  design: null,
  levels: null,
  scene: null,
  corners: null,
  key: { name: 'green', hue: KEYS.green.hue },
  rotation: 0,
  lighting: 0.8,
  texture: 0.12,
  aspect: 'original',
  exportCount: 0,
};

const handles = createHandles({
  svg: $('overlay'),
  magnifier: $('magnifier'),
  getScene: () => state.scene?.canvas,
  onCommit: (c) => { state.corners = c; orientationHint(); schedule(); },
  onPick: pickKey,
});

function setStatus(text, kind = 'info') {
  const s = $('status');
  s.textContent = text;
  s.dataset.kind = kind;
}

function setHint(text) {
  $('hint').textContent = text;
  $('hint').hidden = !text;
}

let pending = false;
function schedule() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; renderPreview(); });
}

function params(crop, outW, outH) {
  return {
    scene: state.scene.canvas, crop, outW, outH,
    corners: state.corners, rotation: state.rotation, keyHue: state.key.hue,
    levels: state.levels, lighting: state.lighting, texture: state.texture,
  };
}

function renderPreview() {
  const s = state.scene?.canvas;
  if (!s) return;
  const { w, h } = fitLongSide(s.width, s.height, PREVIEW_LONG);
  const r = renderComposite(params({ x: 0, y: 0, w: s.width, h: s.height }, w, h));
  const c = $('stageCanvas');
  c.width = w;
  c.height = h;
  c.getContext('2d').drawImage(r.canvas, 0, 0);
  updateCrop();
  updateButtons();
}

function updateCrop() {
  if (!state.scene || !state.corners) return;
  const s = state.scene.canvas;
  try {
    handles.setCrop(state.aspect === 'original' ? null : cropFor(s.width, s.height, state.aspect, state.corners));
    $('cropError').hidden = true;
  } catch (err) {
    handles.setCrop(null);
    $('cropError').textContent = err.message;
    $('cropError').hidden = false;
  }
}

function ready() {
  return !!(state.design && state.scene && state.corners);
}

function updateButtons() {
  for (const id of ['compareBtn', 'downloadBtn', 'shareBtn']) $(id).disabled = !ready();
}

// ---- Files ---------------------------------------------------------------

$('designInput').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const d = await loadImage(f);
    state.design = d;
    state.levels = designLevels(d.canvas);
    const { width: w, height: h } = d.canvas;
    $('designName').textContent = `${f.name} · ${w}×${h}`;
    if (Math.min(w, h) < 1500) {
      setStatus(`The design is only ${w}×${h}. Use the original Canva export (PNG, 1500×2100 or more), not a WhatsApp copy.`, 'warn');
    } else if (!state.scene) {
      setStatus('Design loaded. Now choose the scene from Gemini.', 'ok');
    }
    orientationHint();
    schedule();
  } catch (err) {
    setStatus(err.message, 'error');
  }
});

$('sceneInput').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    state.scene = await loadImage(f);
    const { width: w, height: h } = state.scene.canvas;
    $('sceneName').textContent = `${f.name} · ${w}×${h}`;
    $('stage').classList.remove('empty');
    handles.setScene(w, h);
    detect(true);
  } catch (err) {
    setStatus(err.message, 'error');
  }
});

// ---- Detection -----------------------------------------------------------

function detect(autoKey) {
  const s = state.scene.canvas;
  const long = Math.max(s.width, s.height);
  const { w, h } = fitLongSide(s.width, s.height, Math.min(DETECT_LONG, long));
  const img = pixels(long > DETECT_LONG ? scaledCanvas(s, w, h) : s);

  let best;
  if (autoKey) {
    for (const name of ['green', 'magenta']) {
      const r = detectRegion(img, KEYS[name].hue);
      if (!best || r.area > best.area) best = { ...r, key: { name, hue: KEYS[name].hue } };
    }
    state.key = best.key;
    updateKeySeg();
  } else {
    best = { ...detectRegion(img, state.key.hue), key: state.key };
  }

  const coverage = best.area / (w * h);
  const pct = `${(coverage * 100).toFixed(1)}%`;
  const quad = coverage >= 0.005 ? findCorners(best.mask, w, h) : null;
  if (!quad) {
    state.corners = defaultCorners(s.width, s.height);
    setStatus('No key-colour card found. Check the key colour, tap Pick and tap the card, or drag the 4 corners onto the card by hand.', 'warn');
  } else {
    const k = s.width / w;
    state.corners = quad.map(([x, y]) => [x * k, y * k]);
    if (coverage < 0.03) setStatus(`Card found but small (${pct} of the scene). Check the corners.`, 'warn');
    else setStatus(`Card found (${pct} of the scene). Drag a corner to fine-tune.${state.design ? '' : ' Now choose the design.'}`, 'ok');
  }
  handles.setCorners(state.corners);
  orientationHint();
  schedule();
}

function orientationHint() {
  if (!state.design || !state.corners) return setHint('');
  const q = quadSize(rotateCorners(state.corners, state.rotation));
  const d = state.design.canvas;
  const mismatch = (q.w > q.h) !== (d.width > d.height);
  setHint(mismatch ? "The card's shape doesn't match the design's orientation. Tap Rotate design." : '');
}

function updateKeySeg() {
  for (const b of $('keySeg').querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.key === state.key.name || (b.dataset.key === 'pick' && state.key.name === 'custom')));
  }
}

$('keySeg').addEventListener('click', (e) => {
  const key = e.target.closest('button')?.dataset.key;
  if (!key || !state.scene) return;
  if (key === 'pick') {
    handles.setPickMode(true);
    setStatus('Tap the card in the scene to sample its colour.', 'info');
    return;
  }
  handles.setPickMode(false);
  state.key = { name: key, hue: KEYS[key].hue };
  updateKeySeg();
  detect(false);
});

function pickKey(x, y) {
  handles.setPickMode(false);
  const s = state.scene.canvas;
  const px = Math.max(0, Math.min(s.width - 5, Math.round(x) - 2));
  const py = Math.max(0, Math.min(s.height - 5, Math.round(y) - 2));
  const h = sampleHue(pixels(s, px, py, 5, 5));
  if (h === null) {
    setStatus("That spot isn't a strong colour. Tap the middle of the card.", 'error');
    return;
  }
  state.key = { name: 'custom', hue: h };
  updateKeySeg();
  detect(false);
}

$('rotateBtn').addEventListener('click', () => {
  state.rotation = (state.rotation + 1) % 4;
  orientationHint();
  schedule();
});

$('redetectBtn').addEventListener('click', () => { if (state.scene) detect(false); });

// ---- Finish --------------------------------------------------------------

for (const [id, key] of [['lighting', 'lighting'], ['texture', 'texture']]) {
  $(id).addEventListener('input', (e) => {
    state[key] = e.target.value / 100;
    $(`${id}Out`).textContent = `${e.target.value}%`;
    schedule();
  });
}

$('aspect').addEventListener('change', (e) => { state.aspect = e.target.value; updateCrop(); });

function renderFull(aspect) {
  const s = state.scene.canvas;
  const crop = cropFor(s.width, s.height, aspect, state.corners);
  const size = outputSize(crop);
  return renderComposite(params(crop, size.w, size.h));
}

const nextFrame = () => new Promise((r) => setTimeout(r, 30));

async function makeExport() {
  setStatus('Rendering…', 'info');
  await nextFrame();
  const r = renderFull(state.aspect);
  const blob = await toJpegBlob(r.canvas);
  const n = String(++state.exportCount).padStart(2, '0');
  const name = `${slugify(state.design.name)}-mockup-${n}.jpg`;
  setStatus(`${name}: ${r.canvas.width}×${r.canvas.height}, ${(blob.size / 1e6).toFixed(2)} MB.`, 'ok');
  return { blob, name };
}

$('downloadBtn').addEventListener('click', async () => {
  try {
    const { blob, name } = await makeExport();
    downloadBlob(blob, name);
  } catch (err) {
    setStatus(err.message, 'error');
  }
});

// Safari only allows sharing straight after a tap; if rendering took too long, the second tap shares the cached file.
let shareCache = null;
const signature = () => JSON.stringify([state.corners, state.rotation, state.lighting, state.texture, state.aspect, state.key.hue, state.design.name, state.scene.name]);

$('shareBtn').hidden = !canShareFiles();
$('shareBtn').addEventListener('click', async () => {
  try {
    if (!shareCache || shareCache.sig !== signature()) shareCache = { sig: signature(), ...(await makeExport()) };
    await shareBlob(shareCache.blob, shareCache.name);
  } catch (err) {
    if (err.name === 'NotAllowedError') setStatus('Ready. Tap Save / Share again.', 'ok');
    else if (err.name !== 'AbortError') setStatus(err.message, 'error');
  }
});

// ---- Compare -------------------------------------------------------------

$('compareBtn').addEventListener('click', async () => {
  setStatus('Rendering…', 'info');
  await nextFrame();
  const r = renderFull('original');
  const d = state.design.canvas;
  const flat = flattenCard(r.canvas, r.quad, d.width, d.height);
  const original = document.createElement('canvas');
  original.width = flat.width;
  original.height = flat.height;
  original.getContext('2d').drawImage(d, 0, 0, flat.width, flat.height);
  const body = $('compareBody');
  body.replaceChildren(figure(original, 'Your original file'), figure(flat, 'Flattened from the mockup'));
  setStatus('', 'info');
  $('compareDlg').showModal();
});

function figure(canvas, caption) {
  const f = document.createElement('figure');
  const c = document.createElement('figcaption');
  c.textContent = caption;
  f.append(canvas, c);
  return f;
}

$('zoomBtn').addEventListener('click', () => {
  const fit = $('compareBody').classList.toggle('fit');
  $('zoomBtn').textContent = fit ? '100%' : 'Fit';
});

// ---- Dialogs -------------------------------------------------------------

$('rulesList').replaceChildren(...RULES.map(([id, text]) => {
  const li = document.createElement('li');
  const b = document.createElement('strong');
  b.textContent = `${id} `;
  li.append(b, text);
  return li;
}));
$('aboutBtn').addEventListener('click', () => $('aboutDlg').showModal());
for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => b.closest('dialog').close());

updateKeySeg();
updateButtons();
