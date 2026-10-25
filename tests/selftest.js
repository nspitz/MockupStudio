// Synthetic end-to-end checks of the compositing maths. Open tests/selftest.html
// (served over http, not file://); the page title ends up SELFTEST PASS or SELFTEST FAIL.

import { homography, applyH } from '../js/geometry.js';
import { KEYS, detectRegion } from '../js/keying.js';
import { findCorners } from '../js/corners.js';
import { designLevels, renderComposite, flattenCard } from '../js/compose.js';
import { cropFor, outputSize } from '../js/export.js';
import { pixels } from '../js/files.js';
import { NAMED, extractColours, chooseKey } from '../js/palette.js';
import { buildPrompt, joinList } from '../js/prompt.js';

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// A beige table, a perspective card in the key colour with uneven light, a "thumb" over its bottom edge, and props.
function makeScene(W, H, quad, keyHex, thumb = true) {
  const c = canvas(W, H), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#e8dfd0');
  g.addColorStop(1, '#cfc3ae');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  x.fillStyle = '#c0392b';
  x.beginPath(); x.arc(W * 0.1, H * 0.1, 40, 0, 7); x.fill();
  x.fillStyle = '#2e5aa8';
  x.beginPath(); x.arc(W * 0.9, H * 0.9, 50, 0, 7); x.fill();
  const path = () => { x.beginPath(); quad.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.closePath(); };
  path();
  x.fillStyle = keyHex;
  x.fill();
  x.save();
  path();
  x.clip();
  x.globalCompositeOperation = 'multiply';
  const l = x.createLinearGradient(quad[0][0], quad[0][1], quad[2][0], quad[2][1]);
  l.addColorStop(0, '#ffffff');
  l.addColorStop(1, '#a0a0a0');
  x.fillStyle = l;
  x.fillRect(0, 0, W, H);
  x.restore();
  if (thumb) {
    x.fillStyle = '#d9a383';
    const bx = (quad[2][0] + quad[3][0]) / 2, by = (quad[2][1] + quad[3][1]) / 2;
    x.beginPath(); x.ellipse(bx, by, 45, 70, 0, 0, 7); x.fill();
  }
  return c;
}

function makeDesign(w, h) {
  const c = canvas(w, h), x = c.getContext('2d');
  x.fillStyle = '#fbf7f0'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#9b1c2e'; x.fillRect(0, 0, w, h * 0.12);
  x.fillStyle = '#1d4d3a'; x.fillRect(w * 0.1, h * 0.75, w * 0.8, h * 0.05);
  x.fillStyle = '#222';
  x.font = `bold ${Math.round(w * 0.07)}px serif`;
  x.textAlign = 'center';
  x.fillText('123 LINCOLN STREET', w / 2, h * 0.35);
  x.font = `${Math.round(w * 0.05)}px serif`;
  x.fillText('DECEMBER 15 AT 4:30 PM', w / 2, h * 0.48);
  return c;
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// 1. Homography maps the 4 points exactly.
{
  const src = [[0, 0], [600, 0], [600, 840], [0, 840]];
  const dst = [[210, 140], [700, 190], [660, 1010], [170, 960]];
  const H = homography(src, dst);
  const err = Math.max(...src.map((p, i) => dist(applyH(H, ...p), dst[i])));
  check('homography maps corners', err < 1e-6, `max err ${err.toExponential(2)}`);
}

const W = 900, Hh = 1200;
const truth = [[210, 140], [700, 190], [660, 1010], [170, 960]];
const design = makeDesign(600, 840);
const levels = designLevels(design);

for (const [name, hex] of [['green', '#00ff00'], ['magenta', '#ff00ff']]) {
  const scene = makeScene(W, Hh, truth, hex);

  // 2. Detection finds the card's corners despite the thumb and the lighting.
  const img = pixels(scene);
  const region = detectRegion(img, KEYS[name].hue);
  const q = findCorners(region.mask, W, Hh);
  const err = q ? Math.max(...q.map((p, i) => dist(p, truth[i]))) : Infinity;
  check(`${name}: corners within 4px`, err <= 4, `max err ${err.toFixed(2)}px`);

  // 3. With lighting and texture at 0, the flattened card equals the design (R5 neutral).
  const crop = cropFor(W, Hh, 'original', q);
  const size = outputSize(crop);
  const r = renderComposite({ scene, crop, outW: size.w, outH: size.h, corners: q, keyHue: KEYS[name].hue, levels, lighting: 0, texture: 0 });
  check(`${name}: export long side >= 2000`, Math.max(r.canvas.width, r.canvas.height) >= 2000, `${r.canvas.width}x${r.canvas.height}`);
  const flat = flattenCard(r.canvas, r.quad, 600, 840);
  const A = pixels(flat).data, B = pixels(design).data;
  let sum = 0, n = 0;
  for (let y = 6; y < 840 * 0.8; y++) {
    for (let x = 6; x < 594; x++) {
      const p = (y * 600 + x) * 4;
      sum += Math.abs(A[p] - B[p]) + Math.abs(A[p + 1] - B[p + 1]) + Math.abs(A[p + 2] - B[p + 2]);
      n += 3;
    }
  }
  check(`${name}: flattened card matches design`, sum / n < 6, `mean abs diff ${(sum / n).toFixed(2)}/255`);

  // 4. No key colour left visible around the card.
  const D = pixels(r.canvas).data;
  let spill = 0;
  for (let p = 0; p < D.length; p += 4) {
    const [R, G, B2] = [D[p], D[p + 1], D[p + 2]];
    if (name === 'green' ? G > R + 70 && G > B2 + 70 : R > G + 70 && B2 > G + 70 && Math.abs(R - B2) < 60) spill++;
  }
  check(`${name}: no key-colour fringe`, spill <= 30, `${spill} key-coloured pixels`);

  // 5. Default lighting and texture still render.
  const lit = renderComposite({ scene, crop, outW: 900, outH: 1200, corners: q, keyHue: KEYS[name].hue, levels, lighting: 0.8, texture: 0.12 });
  check(`${name}: default render`, lit.maskArea > 1000, `mask ${lit.maskArea}px`);
}

// 6. R4: a crop that can't hold the card throws instead of trimming it.
{
  const tall = [[100, 100], [800, 100], [800, 1100], [100, 1100]];
  let threw = false;
  try { cropFor(W, Hh, '4:3', tall); } catch (e) { threw = /R4/.test(e.message); }
  check('R4: crop that would cut the card throws', threw);
  const c = cropFor(W, Hh, '1:1', truth);
  const inside = truth.every(([x, y]) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h);
  check('crop that fits keeps the whole card', inside, JSON.stringify(c));
}

// 7. Palette: names known colours, biggest first, and picks the key furthest from them.
function blocks(parts) {
  const c = canvas(200, 200), x = c.getContext('2d');
  let y = 0;
  for (const [rgb, share] of parts) {
    x.fillStyle = `rgb(${rgb.join(',')})`;
    x.fillRect(0, y, 200, 200 * share + 1);
    y += 200 * share;
  }
  return c;
}
const rgbOf = (name) => NAMED.find((n) => n[0] === name).slice(1);
{
  const red = extractColours(blocks([[rgbOf('cream'), 0.6], [rgbOf('deep red'), 0.3], [rgbOf('gold'), 0.1]]));
  const names = red.map((c) => c.name).join(', ');
  check('palette names cream, deep red, gold in order', names === 'cream, deep red, gold', names);
  check('red design gets green key', chooseKey(red) === 'green', chooseKey(red));
  const green = extractColours(blocks([[rgbOf('white'), 0.5], [rgbOf('emerald green'), 0.5]]));
  check('green design gets magenta key', chooseKey(green) === 'magenta', green.map((c) => c.name).join(', '));
  const plain = extractColours(blocks([[rgbOf('white'), 0.7], [rgbOf('black'), 0.3]]));
  check('black and white design gets green key', chooseKey(plain) === 'green');
}

// 8. Prompts carry the type, surface, props, colours and the fixed key-colour rules.
{
  const base = { surface: 'a white linen tablecloth', props: ['a loose silk ribbon', 'silver tinsel'], colours: ['deep red', 'cream'], key: 'green' };
  const main = buildPrompt({ ...base, type: 'main' });
  check('main prompt', main.includes('flat-lay') && main.includes('portrait 3:4') && main.includes('on a white linen tablecloth')
    && main.includes('Around it: a loose silk ribbon and silver tinsel.') && main.includes('palette of deep red and cream')
    && main.includes('(#00FF00)') && main.includes('front surface of the card') && main.includes('No text'), main);
  const stand = buildPrompt({ ...base, type: 'stand', key: 'magenta' });
  check('stand prompt', stand.includes('acrylic stand') && stand.includes('(#FF00FF)') && stand.includes('magenta'), stand);
  const phone = buildPrompt({ ...base, type: 'phone', props: [] });
  check('phone prompt', phone.includes('smartphone') && phone.includes('ENTIRE phone screen') && phone.includes('overlaps the screen')
    && phone.includes('no other props') && !phone.includes('palette'), phone);
  check('list joining', joinList(['a']) === 'a' && joinList(['a', 'b', 'c']) === 'a, b and c');
}

const pass = results.every((r) => r.ok);
document.getElementById('out').textContent = results.map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  ${r.detail}`).join('\n');
document.title = pass ? 'SELFTEST PASS' : 'SELFTEST FAIL';
