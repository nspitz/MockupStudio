// Wires the page together: files → detect → handles → preview → compare / export.

import { RULES } from './rules.js';
import { loadImage, scaledCanvas, fitLongSide, pixels, slugify } from './files.js';
import { KEYS, detectRegion, sampleHue } from './keying.js';
import { findCorners, defaultCorners } from './corners.js';
import { rotateCorners, quadSize } from './geometry.js';
import { designLevels, renderComposite, flattenCard } from './compose.js';
import { cropFor, outputSize, toJpegBlob, downloadBlob, canShareFiles, shareBlob } from './export.js';
import { createHandles } from './handles.js';
import { createPromptPanel } from './promptPanel.js';

const PREVIEW_LONG = 1400;
const DETECT_LONG = 1000;
// A back card must fill at least this much of its outline; scattered pink balloons don't.
const BACK_MIN_FILL = 0.25;

const $ = (id) => document.getElementById(id);

const state = {
  front: null, // { design, levels }
  back: null,
  scene: null,
  // One card, or front (green) + back (magenta) in a hand shot: [{ role, key: { name, hue }, corners }].
  cards: [],
  active: 0,
  key: { name: 'green', hue: KEYS.green.hue },
  rotation: 0,
  lighting: 0.8,
  texture: 0.12,
  aspect: 'original',
  exportCount: 0,
};

const two = () => state.cards.length === 2;
const designOf = (card) => (card.role === 'back' ? state.back : state.front);
const allCorners = () => state.cards.flatMap((c) => c.corners);

const handles = createHandles({
  svg: $('overlay'),
  magnifier: $('magnifier'),
  getScene: () => state.scene?.canvas,
  onCommit: (c) => { state.cards[state.active].corners = c; orientationHint(); schedule(); },
  onPick: pickKey,
});

const promptPanel = createPromptPanel();

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
    cards: state.cards.map((c) => ({ corners: c.corners, rotation: state.rotation, keyHue: c.key.hue, levels: designOf(c)?.levels })),
    lighting: state.lighting, texture: state.texture,
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
  if (!state.scene || !state.cards.length) return;
  const s = state.scene.canvas;
  try {
    handles.setCrop(state.aspect === 'original' ? null : cropFor(s.width, s.height, state.aspect, allCorners()));
    $('cropError').hidden = true;
  } catch (err) {
    handles.setCrop(null);
    $('cropError').textContent = err.message;
    $('cropError').hidden = false;
  }
}

function ready() {
  return !!(state.front && state.scene && state.cards.length && (!two() || state.back));
}

function updateButtons() {
  for (const id of ['compareBtn', 'downloadBtn', 'shareBtn']) $(id).disabled = !ready();
}

function syncHandles() {
  handles.setCorners(state.cards[state.active]?.corners || null);
  handles.setOthers(state.cards.filter((_, i) => i !== state.active).map((c) => c.corners));
}

function updateModeUI() {
  $('cardRow').hidden = !two();
  $('keyRow').hidden = two();
  for (const b of $('cardSeg').querySelectorAll('button')) b.setAttribute('aria-pressed', String(Number(b.dataset.card) === state.active));
}

// ---- Files ---------------------------------------------------------------

async function openDesign(file, role) {
  const d = await loadImage(file);
  state[role] = { design: d, levels: designLevels(d.canvas) };
  const { width: w, height: h } = d.canvas;
  $(role === 'front' ? 'designName' : 'backName').textContent = `${file.name} · ${w}×${h}`;
  if (Math.min(w, h) < 1500) {
    setStatus(`The ${role} design is only ${w}×${h}. Use the original Canva export (PNG, 1500×2100 or more), not a WhatsApp copy.`, 'warn');
  }
  return d;
}

$('designInput').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const d = await openDesign(f, 'front');
    promptPanel.setDesign(d.canvas);
    if (Math.min(d.canvas.width, d.canvas.height) >= 1500 && !state.scene) {
      setStatus('Design loaded. Copy the Gemini prompt, make the scene in Gemini, then open it under Scene.', 'ok');
    }
    orientationHint();
    schedule();
  } catch (err) {
    setStatus(err.message, 'error');
  }
});

// A back design can turn a scene that is already open into a hand shot, so detect again.
$('backInput').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    await openDesign(f, 'back');
    if (state.scene && !two()) detect(true);
    else { orientationHint(); schedule(); }
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
  const k = s.width / w;
  const toScene = (q) => q && q.map(([x, y]) => [x * k, y * k]);
  const quadArea = (q) => Math.abs(q.reduce((a, p, i) => { const n = q[(i + 1) % 4]; return a + p[0] * n[1] - n[0] * p[1]; }, 0)) / 2;
  setHint('');

  let best;
  if (autoKey) {
    const green = detectRegion(img, KEYS.green.hue);
    const magenta = detectRegion(img, KEYS.magenta.hue);
    if (green.area / (w * h) >= 0.005 && magenta.area / (w * h) >= 0.005) {
      const back = detectRegion(img, KEYS.magenta.hue, true);
      const fq = findCorners(green.mask, w, h), bq = findCorners(back.mask, w, h);
      const isCard = bq && back.area / quadArea(bq) >= BACK_MIN_FILL;
      if (fq && isCard && state.back) {
        state.cards = [
          { role: 'front', key: { name: 'green', hue: KEYS.green.hue }, corners: toScene(fq) },
          { role: 'back', key: { name: 'magenta', hue: KEYS.magenta.hue }, corners: toScene(bq) },
        ];
        state.active = 0;
        state.key = state.cards[0].key;
        updateModeUI();
        updateKeySeg();
        setStatus(`Front (green) and back (magenta) found. Check each card's corners with Front / Back.${state.front ? '' : ' Now choose the front design.'}`, 'ok');
        syncHandles();
        orientationHint();
        schedule();
        return;
      }
      if (fq && isCard && !state.back) setHint('This looks like a hand or pile scene with a magenta back card. Choose the back design to fill it.');
    }
    best = green.area >= magenta.area ? { ...green, key: { name: 'green', hue: KEYS.green.hue } } : { ...magenta, key: { name: 'magenta', hue: KEYS.magenta.hue } };
    state.key = best.key;
    updateKeySeg();
  } else {
    best = { ...detectRegion(img, state.key.hue), key: state.key };
  }

  const coverage = best.area / (w * h);
  const pct = `${(coverage * 100).toFixed(1)}%`;
  const quad = coverage >= 0.005 ? findCorners(best.mask, w, h) : null;
  let corners;
  if (!quad) {
    corners = defaultCorners(s.width, s.height);
    setStatus('No key-colour card found. Check the key colour, tap Pick and tap the card, or drag the 4 corners onto the card by hand.', 'warn');
  } else {
    corners = toScene(quad);
    if (coverage < 0.03) setStatus(`Card found but small (${pct} of the scene). Check the corners.`, 'warn');
    else setStatus(`Card found (${pct} of the scene). Drag a corner to fine-tune.${state.front ? '' : ' Now choose the design.'}`, 'ok');
  }
  state.cards = [{ role: 'front', key: best.key, corners }];
  state.active = 0;
  updateModeUI();
  syncHandles();
  if ($('hint').hidden) orientationHint();
  schedule();
}

function orientationHint() {
  const off = state.cards.filter((c) => {
    const d = designOf(c)?.design.canvas;
    if (!d || !c.corners) return false;
    const q = quadSize(rotateCorners(c.corners, state.rotation));
    return (q.w > q.h) !== (d.width > d.height);
  });
  if (!off.length) return setHint('');
  const which = two() ? ` (${off.map((c) => c.role).join(' and ')})` : '';
  setHint(`The card's shape doesn't match the design's orientation${which}. Tap Rotate design.`);
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

$('cardSeg').addEventListener('click', (e) => {
  const i = e.target.closest('button')?.dataset.card;
  if (i === undefined || !two()) return;
  state.active = Number(i);
  updateModeUI();
  syncHandles();
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

$('redetectBtn').addEventListener('click', () => { if (state.scene) detect(two()); });

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
  const crop = cropFor(s.width, s.height, aspect, allCorners());
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
  const name = `${slugify(state.front.design.name)}-mockup-${n}.jpg`;
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
const signature = () => JSON.stringify([state.cards, state.rotation, state.lighting, state.texture, state.aspect, state.front.design.name, state.back?.design.name, state.scene.name]);

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
  const figures = [];
  state.cards.forEach((card, i) => {
    const d = designOf(card).design.canvas;
    const flat = flattenCard(r.canvas, r.quads[i], d.width, d.height);
    const original = document.createElement('canvas');
    original.width = flat.width;
    original.height = flat.height;
    original.getContext('2d').drawImage(d, 0, 0, flat.width, flat.height);
    const label = two() ? `${card.role === 'back' ? 'Back' : 'Front'}: ` : '';
    figures.push(figure(original, `${label}your original file`), figure(flat, `${label}flattened from the mockup`));
  });
  $('compareBody').replaceChildren(...figures);
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
updateModeUI();
updateButtons();
