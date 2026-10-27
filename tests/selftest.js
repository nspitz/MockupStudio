// Synthetic end-to-end checks of the compositing maths. Open tests/selftest.html
// (served over http, not file://); the page title ends up SELFTEST PASS or SELFTEST FAIL.

import { homography, applyH, expandQuad, pointInConvex } from '../js/geometry.js';
import { KEYS, detectRegion } from '../js/keying.js';
import { findCorners } from '../js/corners.js';
import { detectCards } from '../js/detect.js';
import { designLevels, renderComposite, renderLayout, flattenCard } from '../js/compose.js';
import { LAYOUTS, layoutSize, layoutCards } from '../js/layouts.js';
import { cropFor, outputSize } from '../js/export.js';
import { pixels } from '../js/files.js';
import { NAMED, extractColours, chooseKey } from '../js/palette.js';
import { buildPrompt, joinList } from '../js/prompt.js';
import { parsePack, packColours, packProps } from '../js/pack.js';
import { importLibrary, listDesigns, getDesign } from '../js/library.js';

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
    && main.includes('casually set down: a loose silk ribbon and silver tinsel.') && main.includes('mostly cut off by the frame')
    && main.includes('clearly lopsided') && main.includes('computer-generated') && main.includes('long side vertical')
    && !main.includes('Only a little bare surface')
    && main.includes('passes under, behind or over the card') && main.includes('true real-world size') && main.includes('two thirds of the frame')
    && main.includes('not washed out') && main.includes('palette of deep red and cream') && !main.includes('scatter')
    && main.includes('(#00FF00)') && main.includes('front surface of the card') && main.includes('No text'), main);
  const stand = buildPrompt({ ...base, type: 'stand', key: 'magenta' });
  check('stand prompt', stand.includes('acrylic stand') && stand.includes('(#FF00FF)') && stand.includes('magenta')
    && stand.includes('evenly spaced: a loose silk ribbon and silver tinsel.') && !stand.includes('lopsided'), stand);
  const phone = buildPrompt({ ...base, type: 'phone', props: [] });
  check('phone prompt', phone.includes('smartphone') && phone.includes('ENTIRE phone screen') && phone.includes('on top of the screen')
    && phone.includes('no other props') && !phone.includes('palette'), phone);
  check('list joining', joinList(['a']) === 'a' && joinList(['a', 'b', 'c']) === 'a, b and c');
  check('main prompt is head-on', main.includes('straight-down') && main.includes('square to the frame'), main);
  const party = buildPrompt({ ...base, type: 'stand', backdrop: 'cosy Christmas baby shower' });
  check('stand prompt uses the party', party.includes('a cosy Christmas baby shower softly blurred') && !party.includes('{'), party);
  check('stand prompt falls back to "party"', stand.includes('with a party softly blurred'), stand);
  const scattered = buildPrompt({ ...base, type: 'main', scatter: 'small gold wooden stars' });
  check('scatter: sparse, around the card, never on it', scattered.includes('A sparse scatter of small gold wooden stars lies on the surface around the card, a few pieces only, never on it.'), scattered);
  check('pile has no Gemini prompt (the app lays it out)', buildPrompt({ ...base, type: 'pile' }) === '');
  const hand = buildPrompt({ ...base, type: 'hand', backdrop: '' });
  check('hand prompt: landscape, fanned wide, front green, back magenta, wall fallback, no props', hand.includes('landscape 4:3')
    && hand.includes('fanned apart as wide as a natural one-handed hold allows') && hand.includes('all four of its corners are visible')
    && hand.includes('front card is one flat, solid pure chroma-key green')
    && hand.includes('back card is one flat, solid pure chroma-key magenta') && hand.includes('a plain warm off-white wall')
    && hand.includes('thumb') && !hand.includes('silk ribbon') && !hand.includes('{'), hand);
}

// 9. Props pack: parses a pack, rejects junk with a readable message, names known colours.
{
  const p = parsePack('{"name":"Lace","surface":"a cream linen cloth","props":["a red velvet ribbon"," ",""],"scatter":" gold stars ","party":"Christmas shower","colours":["Deep red","not-a-colour"]}');
  check('pack parses and drops blank props', p.name === 'Lace' && p.props.length === 1 && p.wall === '' && p.party === 'Christmas shower' && p.scatter === 'gold stars', JSON.stringify(p));
  const m = parsePack('{"props":["a red velvet ribbon"],"mainProps":["a thin red ribbon",""]}');
  check('mainProps: Main only, others fall back to props', packProps(m, 'main')[0] === 'a thin red ribbon' && m.mainProps.length === 1
    && packProps(m, 'stand')[0] === 'a red velvet ribbon' && packProps(p, 'main')[0] === 'a red velvet ribbon', JSON.stringify(m));
  const cs = packColours(p);
  check('pack colours: known name gets rgb, unknown does not', !!cs[0].rgb && cs[1].rgb === null, JSON.stringify(cs));
  const err = (t) => { try { parsePack(t); return ''; } catch (e) { return e.message; } };
  check('pack rejects bad JSON and missing props', /valid JSON/.test(err('{nope')) && /props/.test(err('{"name":"x"}')) && /object/.test(err('[1]')));
}

// 10. Hand shot: a green front card over a magenta back card, which shows in three separate
// pieces around it, plus a thumb on the front. The back design is full of key-range green.
{
  const backQ = [[170, 430], [510, 270], [740, 745], [400, 905]];
  const frontQ = [[340, 355], [700, 355], [700, 870], [340, 870]];
  const c = canvas(W, Hh), x = c.getContext('2d');
  x.fillStyle = '#e6ded3';
  x.fillRect(0, 0, W, Hh);
  const card = (q, hex) => {
    const path = () => { x.beginPath(); q.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.closePath(); };
    path();
    x.fillStyle = hex;
    x.fill();
    x.save();
    path();
    x.clip();
    x.globalCompositeOperation = 'multiply';
    const l = x.createLinearGradient(q[0][0], q[0][1], q[2][0], q[2][1]);
    l.addColorStop(0, '#ffffff');
    l.addColorStop(1, '#b0b0b0');
    x.fillStyle = l;
    x.fillRect(0, 0, W, Hh);
    x.restore();
  };
  card(backQ, '#ff00ff');
  card(frontQ, '#00ff00');
  x.fillStyle = '#d9a383';
  x.beginPath(); x.ellipse(620, 850, 45, 70, 0, 0, 7); x.fill();

  const back = canvas(600, 840), bx = back.getContext('2d');
  bx.fillStyle = '#50a060'; bx.fillRect(0, 0, 600, 840);
  bx.fillStyle = '#fbf7f0';
  for (let i = 0; i < 6; i++) bx.fillRect(i * 100 + 30, 0, 30, 840);
  bx.fillStyle = '#7a1f3d'; bx.fillRect(0, 380, 600, 80);

  const img = pixels(c);
  const largest = findCorners(detectRegion(img, KEYS.magenta.hue).mask, W, Hh);
  const found = detectCards(img);
  const merged = found.cards.find((k) => k.role === 'back')?.corners;
  const front = found.cards.find((k) => k.role === 'front')?.corners;
  const errOf = (q) => (q ? Math.max(...q.map((p, i) => dist(p, backQ[i]))) : Infinity);
  check('hand: two cards found', found.found && found.cards.length === 2, found.cards.map((k) => k.role).join(', '));
  check('hand: back corners from merged pieces within 4px', errOf(merged) <= 4, `merged ${errOf(merged).toFixed(2)}px, largest piece only ${errOf(largest).toFixed(0)}px`);
  const fErr = front ? Math.max(...front.map((p, i) => dist(p, frontQ[i]))) : Infinity;
  check('hand: front corners within 4px despite the thumb', fErr <= 4, `${fErr.toFixed(2)}px`);

  const crop = cropFor(W, Hh, 'original', [...front, ...merged]);
  const size = outputSize(crop);
  const cards = [
    { corners: front, keyHue: KEYS.green.hue, levels },
    { corners: merged, keyHue: KEYS.magenta.hue, levels: designLevels(back) },
  ];
  const r = renderComposite({ scene: c, crop, outW: size.w, outH: size.h, cards, lighting: 0, texture: 0 });
  const D = pixels(r.canvas).data;
  let g = 0, m = 0;
  for (let p = 0; p < D.length; p += 4) {
    if (D[p] < 60 && D[p + 2] < 60 && D[p + 1] > 150) g++;
    if (D[p] > 150 && D[p + 2] > 150 && D[p + 1] < 60) m++;
  }
  check('hand: no green or magenta key left', g <= 30 && m <= 30, `${g} green, ${m} magenta`);

  const flatF = flattenCard(r.canvas, r.quads[0], 600, 840);
  const A = pixels(flatF).data, B = pixels(design).data;
  let sum = 0, n = 0;
  for (let y = 6; y < 840 * 0.7; y++) {
    for (let xx = 6; xx < 594; xx++) {
      const p = (y * 600 + xx) * 4;
      sum += Math.abs(A[p] - B[p]) + Math.abs(A[p + 1] - B[p + 1]) + Math.abs(A[p + 2] - B[p + 2]);
      n += 3;
    }
  }
  check('hand: front matches its design', sum / n < 6, `mean abs diff ${(sum / n).toFixed(2)}/255`);

  // The back only where it shows: map each flat pixel into the export and skip what's behind the front card.
  const flatB = flattenCard(r.canvas, r.quads[1], 600, 840);
  const FB = pixels(flatB).data, BB = pixels(back).data;
  const toOut = homography([[0, 0], [600, 0], [600, 840], [0, 840]], r.quads[1]);
  const frontOut = expandQuad(r.quads[0], 2 * size.w / W);
  const edge = expandQuad(r.quads[1], -3 * size.w / W);
  sum = 0; n = 0;
  for (let y = 0; y < 840; y += 2) {
    for (let xx = 0; xx < 600; xx += 2) {
      const [ox, oy] = applyH(toOut, xx + 0.5, y + 0.5);
      if (pointInConvex(frontOut, ox, oy) || !pointInConvex(edge, ox, oy)) continue;
      const p = (y * 600 + xx) * 4;
      sum += Math.abs(FB[p] - BB[p]) + Math.abs(FB[p + 1] - BB[p + 1]) + Math.abs(FB[p + 2] - BB[p + 2]);
      n += 3;
    }
  }
  check('hand: visible back matches its design', n > 3000 && sum / n < 6, `mean abs diff ${(sum / n).toFixed(2)}/255 over ${n / 3} px`);
}

// 11. A hand covering a corner: the visible parts of the two edges, extended, give the hidden corner.
{
  const q = [[200, 180], [660, 230], [630, 900], [170, 860]];
  for (const [label, cx, cy] of [['bottom-left', 175, 860], ['top-right', 660, 232]]) {
    const scene = makeScene(W, Hh, q, '#00ff00', false);
    const x = scene.getContext('2d');
    x.fillStyle = '#d9a383';
    x.beginPath(); x.ellipse(cx, cy, 70, 60, 0.4, 0, 7); x.fill();
    const found = findCorners(detectRegion(pixels(scene), KEYS.green.hue).mask, W, Hh);
    const err = found ? Math.max(...found.map((p, i) => dist(p, q[i]))) : Infinity;
    check(`hidden ${label} corner found within 4px`, err <= 4, `max err ${err.toFixed(2)}px`);
  }
}

// 12. Four fanned key cards, stacked green, magenta, green, magenta from the bottom. Each card
// but the top one has a corner hidden under the next, and the edge hiding it is a long straight line.
{
  const truth = [
    ['front', [[80, 322], [335, 190], [523, 557], [268, 689]]],
    ['back', [[385, 205], [678, 232], [645, 640], [352, 613]]],
    ['front', [[540, 307], [806, 410], [658, 800], [392, 697]]],
    ['back', [[520, 570], [773, 677], [612, 1048], [359, 941]]],
  ];
  const c = canvas(W, Hh), x = c.getContext('2d');
  x.fillStyle = '#efece6';
  x.fillRect(0, 0, W, Hh);
  for (const [role, q] of truth) {
    x.beginPath(); q.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.closePath();
    x.fillStyle = role === 'front' ? '#00ff00' : '#ff00ff';
    x.fill();
  }
  const found = detectCards(pixels(c));
  check('four-card scene: 4 cards found, 2 fronts and 2 backs', found.cards.length === 4 && found.cards.filter((k) => k.role === 'front').length === 2,
    found.cards.map((k) => k.role).join(', '));
  // Match each truth card to the found card of the same role nearest its centre.
  const centre = (q) => [q.reduce((s, p) => s + p[0], 0) / 4, q.reduce((s, p) => s + p[1], 0) / 4];
  const errs = truth.map(([role, q]) => {
    const [cx, cy] = centre(q);
    const k = found.cards.filter((f) => f.role === role).sort((a, b) => dist(centre(a.corners), [cx, cy]) - dist(centre(b.corners), [cx, cy]))[0];
    return k ? Math.max(...k.corners.map((p, i) => dist(p, q[i]))) : Infinity;
  });
  check('four-card scene: every card within 4px, hidden corners included', errs.every((e) => e <= 4), errs.map((e) => `${e.toFixed(1)}px`).join(', '));
}

// 13. Saved designs: a library file imports into IndexedDB, lists, loads back as images, and a
// re-import replaces by slug instead of adding a duplicate.
{
  const png = (hex) => {
    const c = canvas(14, 20), x = c.getContext('2d');
    x.fillStyle = hex; x.fillRect(0, 0, 14, 20);
    return c.toDataURL('image/png');
  };
  const lib = (name) => new File([JSON.stringify({
    format: 'mockup-studio-library', version: 1,
    designs: [{ slug: 'selftest-design', name, front: png('#aa2233'), back: png('#223388'), pack: { name, props: ['a red ribbon'], surface: 'a linen cloth' } }],
  })], 'mockup-library.json', { type: 'application/json' });
  const first = await importLibrary(lib('Selftest A'));
  await importLibrary(lib('Selftest B'));
  const listed = (await listDesigns()).filter((d) => d.slug === 'selftest-design');
  const d = await getDesign('selftest-design');
  const bmp = d && await createImageBitmap(d.front);
  check('library: imports, replaces by slug, keeps images and pack', first.count === 1 && listed.length === 1 && listed[0].name === 'Selftest B'
    && bmp?.width === 14 && d.back instanceof Blob && d.pack?.props[0] === 'a red ribbon', `kept=${first.kept}, listed=${JSON.stringify(listed)}`);
  let rejected = '';
  try { await importLibrary(new File(['{"format":"other"}'], 'x.json')); } catch (e) { rejected = e.message; }
  check('library: rejects a file that is not a library', /library file/.test(rejected), rejected);
}

// 15. Wide-fan hand: the back card's bottom-left corner is hidden under the front card, and the thumb
// on the front card sits inside that hidden part. The thumb must count as covered, not as bare wall.
{
  const backQ = [[600, 100], [950, 250], [760, 730], [410, 580]];
  const frontQ = [[160, 180], [560, 140], [600, 680], [200, 720]];
  const c = canvas(1200, 900), x = c.getContext('2d');
  x.fillStyle = '#e6ded3';
  x.fillRect(0, 0, 1200, 900);
  for (const [q, hex] of [[backQ, '#ff00ff'], [frontQ, '#00ff00']]) {
    x.beginPath(); q.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.closePath();
    x.fillStyle = hex;
    x.fill();
  }
  x.fillStyle = '#d9a383';
  x.beginPath(); x.ellipse(520, 600, 40, 90, 0, 0, 7); x.fill();
  const back = detectCards(pixels(c)).cards.find((k) => k.role === 'back')?.corners;
  const err = back ? Math.max(...back.map((p, i) => dist(p, backQ[i]))) : Infinity;
  check('wide-fan hand: back corner under the front card found despite the thumb', err <= 4, `${err.toFixed(1)}px`);
}

// 14. Pile layout: cards cover the whole frame, the hero is whole and matches its design, and a
// layout that would cut the hero throws (R4).
{
  const lay = LAYOUTS.pile;
  const { w, h } = layoutSize(lay);
  const backD = canvas(600, 840), bx = backD.getContext('2d');
  bx.fillStyle = '#8a1c24'; bx.fillRect(0, 0, 600, 840);
  bx.fillStyle = '#c4d4f0';
  for (let i = 0; i < 6; i++) bx.fillRect(i * 100 + 40, 0, 24, 840);
  const designs = { front: { design, levels }, back: { design: backD, levels: designLevels(backD) } };
  const cards = layoutCards(lay, w, h, designs);
  check('pile layout: 4:3 at 2000px, 12 cards, hero last and whole', w === 2000 && h === 1500 && cards.length === 12 && cards[11].hero
    && cards[11].corners.every(([x, y]) => x >= 0 && y >= 0 && x <= w && y <= h), `${w}x${h}, ${cards.length} cards`);
  check('pile layout: fronts and backs mixed, some cards run off the frame',
    cards.filter((c) => c.role === 'back').length >= 4 && cards.some((c) => c.corners.some(([x, y]) => x < 0 || y < 0 || x > w || y > h)));

  const r = renderLayout({ outW: w, outH: h, cards, lighting: 0, texture: 0, background: '#00ff00' });
  const D = pixels(r.canvas).data;
  let bare = 0;
  for (let p = 0; p < D.length; p += 4) if (D[p + 1] > 200 && D[p] < 60 && D[p + 2] < 60) bare++;
  check('pile layout: no background showing anywhere', bare === 0, `${bare} background pixels`);

  const flat = flattenCard(r.canvas, r.quads[11], 600, 840);
  const A = pixels(flat).data, B = pixels(design).data;
  let sum = 0, n = 0;
  for (let y = 6; y < 834; y++) {
    for (let x = 6; x < 594; x++) {
      const p = (y * 600 + x) * 4;
      sum += Math.abs(A[p] - B[p]) + Math.abs(A[p + 1] - B[p + 1]) + Math.abs(A[p + 2] - B[p + 2]);
      n += 3;
    }
  }
  check('pile layout: hero matches its design edge to edge', sum / n < 6, `mean abs diff ${(sum / n).toFixed(2)}/255`);

  const lit = renderLayout({ outW: w, outH: h, cards, lighting: 0.8, texture: 0.12 });
  check('pile layout: default render with shadows', lit.canvas.width === w, `${lit.canvas.width}x${lit.canvas.height}`);

  let threw = '';
  const off = { ...lay, cards: lay.cards.map((c) => (c.hero ? { ...c, cx: 60 } : c)) };
  try { renderLayout({ outW: w, outH: h, cards: layoutCards(off, w, h, designs), lighting: 0, texture: 0 }); } catch (e) { threw = e.message; }
  check('R4: a layout that would cut the hero throws', /R4/.test(threw), threw);
}

const pass = results.every((r) => r.ok);
document.getElementById('out').textContent = results.map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  ${r.detail}`).join('\n');
document.title = pass ? 'SELFTEST PASS' : 'SELFTEST FAIL';
