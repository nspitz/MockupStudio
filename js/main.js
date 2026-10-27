// Wires the page together: files → detect → handles → preview → compare / export.

import { RULES } from './rules.js';
import { loadImage, scaledCanvas, fitLongSide, pixels, slugify } from './files.js';
import { KEYS, detectRegion, sampleHue } from './keying.js';
import { findCorners, defaultCorners } from './corners.js';
import { detectCards } from './detect.js';
import { rotateCorners, quadSize } from './geometry.js';
import { designLevels, renderComposite, renderLayout, flattenCard } from './compose.js';
import { cropFor, outputSize, toJpegBlob, downloadBlob, canShareFiles, shareBlob } from './export.js';
import { createHandles } from './handles.js';
import { createPromptPanel } from './promptPanel.js';
import { listDesigns, getDesign, importLibrary } from './library.js';
import { TYPES } from './prompt.js';
import { LAYOUTS, layoutSize, layoutCards } from './layouts.js';

const PREVIEW_LONG = 1400;
const DETECT_LONG = 1000;

const $ = (id) => document.getElementById(id);

const state = {
  front: null, // { design, levels }
  back: null,
  scene: null,
  // One card, or green fronts + magenta backs in a hand or pile shot: [{ role, key: { name, hue }, corners }].
  cards: [],
  active: 0,
  key: { name: 'green', hue: KEYS.green.hue },
  rotation: 0,
  lighting: 0.8,
  texture: 0.12,
  aspect: 'original',
  exportCount: 0,
  // A layout shot (Pile) is drawn from the designs alone; the scene and its cards are left as they were.
  layout: null,
};

const two = () => state.cards.length > 1;
const designOf = (card) => (card.role === 'back' ? state.back : state.front);
const allCorners = () => state.cards.flatMap((c) => c.corners);

const handles = createHandles({
  svg: $('overlay'),
  magnifier: $('magnifier'),
  getScene: () => state.scene?.canvas,
  onCommit: (c) => { state.cards[state.active].corners = c; orientationHint(); schedule(); },
  onPick: pickKey,
});

const promptPanel = createPromptPanel({
  onType: (t) => {
    state.layout = TYPES[t].layout || null;
    refreshStage();
  },
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
    cards: state.cards.map((c) => ({ corners: c.corners, rotation: state.rotation, keyHue: c.key.hue, levels: designOf(c)?.levels })),
    lighting: state.lighting, texture: state.texture,
  };
}

// The layout's cards at outW x outH, each with its design.
function layoutParams(outW, outH) {
  return {
    outW, outH, lighting: state.lighting, texture: state.texture,
    cards: layoutCards(LAYOUTS[state.layout], outW, outH, {
      front: { design: state.front.design.canvas, levels: state.front.levels },
      back: { design: state.back.design.canvas, levels: state.back.levels },
    }),
  };
}

function renderPreview() {
  if (state.layout) {
    if (!ready()) return updateButtons();
    const { w, h } = layoutSize(LAYOUTS[state.layout], PREVIEW_LONG);
    const r = renderLayout(layoutParams(w, h));
    const c = $('stageCanvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(r.canvas, 0, 0);
    $('stage').classList.remove('empty');
    handles.setScene(w, h);
    return updateButtons();
  }
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
  if (state.layout || !state.scene || !state.cards.length) return;
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
  if (state.layout) return !!(state.front && state.back);
  return !!(state.front && state.scene && state.cards.length && (!two() || state.back));
}

function updateButtons() {
  for (const id of ['compareBtn', 'downloadBtn', 'shareBtn']) $(id).disabled = !ready();
}

function syncHandles() {
  if (state.layout) {
    handles.setCorners(null);
    handles.setOthers([]);
    return;
  }
  handles.setCorners(state.cards[state.active]?.corners || null);
  handles.setOthers(state.cards.filter((_, i) => i !== state.active).map((c) => c.corners));
}

// "Front" / "Back" for a hand shot; numbered (Front 1, Back 2…) when there are more of a kind.
function cardLabel(card) {
  const same = state.cards.filter((c) => c.role === card.role);
  const name = card.role === 'back' ? 'Back' : 'Front';
  return same.length > 1 ? `${name} ${same.indexOf(card) + 1}` : `${name} (${card.key.name})`;
}

function updateModeUI() {
  $('cardRow').hidden = !two() || !!state.layout;
  $('keyRow').hidden = two() || !!state.layout;
  for (const id of ['rotateBtn', 'redetectBtn', 'aspect']) $(id).disabled = !!state.layout;
  $('cardSeg').replaceChildren(...(two() ? state.cards : []).map((c, i) => {
    const b = document.createElement('button');
    b.dataset.card = i;
    b.textContent = cardLabel(c);
    b.setAttribute('aria-pressed', String(i === state.active));
    return b;
  }));
}

// Switching between a layout shot and a scene shot: the scene, its cards and its handles come back as they were.
function refreshStage() {
  updateModeUI();
  setHint('');
  syncHandles();
  if (state.layout) {
    handles.setCrop(null);
    if (ready()) setStatus('Pile laid out from your designs. The hero card on top is always whole; the cards around it run off the edge.', 'ok');
    else {
      $('stage').classList.add('empty');
      $('placeholder').textContent = 'Choose the front and back designs to lay out the Pile.';
      setStatus('', 'info');
    }
  } else {
    $('placeholder').textContent = 'Choose a scene to start.';
    if (!state.scene) {
      $('stage').classList.add('empty');
      setStatus('', 'info');
      updateButtons();
      return;
    }
    $('stage').classList.remove('empty');
    handles.setScene(state.scene.canvas.width, state.scene.canvas.height);
    orientationHint();
  }
  schedule();
}

// ---- Files ---------------------------------------------------------------

async function openDesign(file, role) {
  const d = await loadImage(file);
  state[role] = { design: d, levels: designLevels(d.canvas) };
  const { width: w, height: h } = d.canvas;
  $(role === 'front' ? 'designName' : 'backName').textContent = `${file.name} · ${w}×${h}`;
  if (Math.min(w, h) < 1400) {
    setStatus(`The ${role} design is only ${w}×${h}. Use the original Canva export (1400×2000 or more), not a WhatsApp copy.`, 'warn');
  }
  return d;
}

// ---- Saved designs -------------------------------------------------------

async function refreshSaved(selected = '') {
  const list = await listDesigns();
  const first = document.createElement('option');
  first.value = '';
  first.textContent = list.length ? `Choose one of ${list.length}…` : 'None yet: import a library';
  $('savedSelect').replaceChildren(first, ...list.map(({ slug, name }) => {
    const o = document.createElement('option');
    o.value = slug;
    o.textContent = name;
    return o;
  }));
  $('savedSelect').value = selected;
}

$('libraryInput').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    $('savedNote').textContent = 'Importing…';
    const { count, kept } = await importLibrary(f);
    $('savedNote').textContent = kept
      ? `${count} designs saved on this device.`
      : `${count} designs loaded, but this browser won't keep them (private mode?). They last until you close the page.`;
    await refreshSaved();
  } catch (err) {
    $('savedNote').textContent = err.message;
  }
});

// A saved design fills front, back and the props pack in one go.
$('savedSelect').addEventListener('change', async (e) => {
  const d = e.target.value && await getDesign(e.target.value);
  if (!d) return;
  try {
    const file = (blob, side) => new File([blob], `${d.slug}-${side}.jpg`, { type: blob.type });
    const front = await openDesign(file(d.front, 'front'), 'front');
    promptPanel.setDesign(front.canvas);
    if (d.back) await openDesign(file(d.back, 'back'), 'back');
    else { state.back = null; $('backName').textContent = 'Only for Hand and Pile scenes'; }
    if (d.pack) promptPanel.usePack(d.pack);
    $('savedNote').textContent = `${d.name}: front${d.back ? ', back' : ''}${d.pack ? ' and props pack' : ''} loaded.`;
    if (state.layout) refreshStage();
    else if (state.scene) detect(true);
    else setStatus('Design loaded. Pick a shot, copy the Gemini prompt, make the scene in Gemini, then open it under Scene.', 'ok');
  } catch (err) {
    setStatus(err.message, 'error');
  }
});

refreshSaved();

$('designInput').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const d = await openDesign(f, 'front');
    promptPanel.setDesign(d.canvas);
    if (state.layout) return refreshStage();
    if (Math.min(d.canvas.width, d.canvas.height) >= 1400 && !state.scene) {
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
    if (state.layout) refreshStage();
    else if (state.scene && !two()) detect(true);
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
    if (state.layout) refreshStage();
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
  setHint('');

  let best;
  if (autoKey) {
    const multi = detectCards(img);
    if (multi.found && state.back) {
      state.cards = multi.cards.map((c) => ({ role: c.role, key: c.key, corners: toScene(c.corners) }));
      state.active = 0;
      state.key = state.cards[0].key;
      updateModeUI();
      updateKeySeg();
      const fronts = state.cards.filter((c) => c.role === 'front').length, backs = state.cards.length - fronts;
      const what = state.cards.length === 2 ? 'Front (green) and back (magenta) found' : `${state.cards.length} cards found: ${fronts} front${fronts > 1 ? 's' : ''} (green), ${backs} back${backs > 1 ? 's' : ''} (magenta)`;
      setStatus(`${what}. Check each card's corners with the buttons below.${state.front ? '' : ' Now choose the front design.'}`, 'ok');
      syncHandles();
      orientationHint();
      schedule();
      return;
    }
    if (multi.found) setHint('This looks like a hand or pile scene with magenta back cards. Choose the back design to fill them.');
    const green = detectRegion(img, KEYS.green.hue);
    const magenta = detectRegion(img, KEYS.magenta.hue);
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
  if (state.layout) return setHint('');
  const off = state.cards.filter((c) => {
    const d = designOf(c)?.design.canvas;
    if (!d || !c.corners) return false;
    const q = quadSize(rotateCorners(c.corners, state.rotation));
    return (q.w > q.h) !== (d.width > d.height);
  });
  if (!off.length) return setHint('');
  const which = two() ? ` (${off.map(cardLabel).join(', ')})` : '';
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

// A layout always exports at its own shape; the crop setting only applies to scenes.
function renderFull(aspect) {
  if (state.layout) {
    const { w, h } = layoutSize(LAYOUTS[state.layout]);
    return renderLayout(layoutParams(w, h));
  }
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
const signature = () => JSON.stringify([state.layout, state.cards, state.rotation, state.lighting, state.texture, state.aspect, state.front.design.name, state.back?.design.name, state.scene?.name]);

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
  const pair = (d, quad, label) => {
    const flat = flattenCard(r.canvas, quad, d.width, d.height);
    const original = document.createElement('canvas');
    original.width = flat.width;
    original.height = flat.height;
    original.getContext('2d').drawImage(d, 0, 0, flat.width, flat.height);
    figures.push(figure(original, `${label}your original file`), figure(flat, `${label}flattened from the mockup`));
  };
  // In a layout only the hero card is whole, so it is the one to compare.
  if (state.layout) pair(state.front.design.canvas, r.quads[LAYOUTS[state.layout].cards.findIndex((c) => c.hero)], 'Hero card: ');
  else state.cards.forEach((card, i) => pair(designOf(card).design.canvas, r.quads[i], two() ? `${cardLabel(card)}: ` : ''));
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
