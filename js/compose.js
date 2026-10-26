// The compositor: draws the scene, then puts the ORIGINAL design onto the key-colour card.
// Per R2/R5 the design pixels only ever get warped, lit and textured here — nothing else.

import { homography, expandQuad, pointInConvex, bbox, rotateCorners } from './geometry.js';
import { keyCandidates, fillSmallHoles, medianValue, hue, hueDistance } from './keying.js';
import { scaledCanvas, pixels } from './files.js';

// Half-size copies of the design, so a small card on screen is sampled from a
// level near its size instead of aliasing from the full file.
export function designLevels(canvas) {
  const levels = [canvas];
  let c = canvas;
  while (Math.min(c.width, c.height) > 128) {
    c = scaledCanvas(c, Math.round(c.width / 2), Math.round(c.height / 2));
    levels.push(c);
  }
  return levels;
}

const levelData = new WeakMap();
function dataOf(level) {
  if (!levelData.has(level)) levelData.set(level, pixels(level).data);
  return levelData.get(level);
}

function pickLevel(levels, q) {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const full = levels[0];
  const need = Math.max(
    Math.max(d(q[0], q[1]), d(q[3], q[2])) / full.width,
    Math.max(d(q[0], q[3]), d(q[1], q[2])) / full.height,
  );
  let pick = full;
  for (const l of levels) if (l.width / full.width >= need) pick = l;
  return pick;
}

function dilate(mask, w, h, r) {
  const tmp = new Uint8Array(mask.length), out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) {
        if (mask[y * w + k]) { tmp[y * w + x] = 1; break; }
      }
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) {
        if (tmp[k * w + x]) { out[y * w + x] = 1; break; }
      }
    }
  }
  return out;
}

function hash(x, y) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

// Cardstock: fine grain plus faint horizontal fibres, in paper pixels (5x7 at 300dpi).
// Tied to the design's own coordinates, so it follows the card's perspective. About ±0.5.
export function paperNoise(px, py) {
  const grain = valueNoise(px * 0.7, py * 0.7) - 0.5;
  const fibre = valueNoise(px * 0.03, py * 0.25 + 17.3) - 0.5;
  return grain * 0.6 + fibre * 0.4;
}

/**
 * Renders `crop` of the scene at outW×outH and composites each design onto its card.
 * cards: [{ corners, rotation, keyHue, levels }], corners [TL, TR, BR, BL] in scene pixels.
 * A single card can also be passed flat (corners, rotation, keyHue, levels).
 * Returns { canvas, quads, areas } plus quad / maskArea for the first card.
 */
export function renderComposite({ scene, crop, outW, outH, cards, corners, rotation = 0, keyHue, levels, lighting, texture }) {
  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // The scene is upscaled first and the design drawn into it at final size: the design is never upscaled afterwards.
  ctx.drawImage(scene, crop.x, crop.y, crop.w, crop.h, 0, 0, outW, outH);
  const list = (cards || [{ corners, rotation, keyHue, levels }]).filter((c) => c.levels && c.corners);

  // Every card's mask is read from the untouched scene before any design is drawn, so one
  // card's design (a tartan back full of green) can't be mistaken for another card's key.
  const k = outW / crop.w;
  const prepared = list.map((c) => prepareCard(ctx, c, crop, k, outW, outH));
  for (const p of prepared) if (p.box) drawCard(ctx, p, lighting, texture);
  return { canvas: out, quads: prepared.map((p) => p.quad), areas: prepared.map((p) => p.area), quad: prepared[0]?.quad || null, maskArea: prepared[0]?.area || 0 };
}

function prepareCard(ctx, card, crop, k, outW, outH) {
  const quad = rotateCorners(card.corners.map(([x, y]) => [(x - crop.x) * k, (y - crop.y) * k]), card.rotation || 0);
  const box = bbox(expandQuad(quad, 3), outW, outH);
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  if (bw <= 1 || bh <= 1) return { quad, area: 0, box: null };

  const region = ctx.getImageData(box.x0, box.y0, bw, bh);
  const src = region.data;
  const local = quad.map(([x, y]) => [x - box.x0, y - box.y0]);
  const grown = expandQuad(local, 3);

  // Visibility: key-coloured AND on this card. Anything covering the card (a thumb, the front card) isn't this key colour, so it stays on top.
  const mask = keyCandidates(region, card.keyHue);
  let area = 0;
  for (let y = 0, i = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++, i++) {
      if (mask[i] && !pointInConvex(grown, x + 0.5, y + 0.5)) mask[i] = 0;
      area += mask[i];
    }
  }
  fillSmallHoles(mask, bw, bh, Math.max(4, area * 0.003));

  // 1px feather.
  const alpha = new Float32Array(mask.length);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = Math.min(bh - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx++) s += mask[yy * bw + Math.min(bw - 1, Math.max(0, x + dx))];
      }
      alpha[y * bw + x] = s / 9;
    }
  }
  return { card, quad, local, box, bw, bh, src, mask, alpha, area, medV: medianValue(region, mask) };
}

function drawCard(ctx, { card, quad, local, box, bw, bh, src, mask, alpha, medV }, lighting, texture) {
  const { keyHue, levels } = card;
  const region = ctx.getImageData(box.x0, box.y0, bw, bh);
  const base = region.data;

  // Despill: within 3px of the card, take the key-coloured tint out of the scene's edge pixels.
  // The hue test reads the untouched scene, so a design another card already drew here is left alone.
  const near = dilate(mask, bw, bh, 3);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    if (!near[i] || alpha[i] >= 1) continue;
    const sr = src[p], sg = src[p + 1], sb = src[p + 2];
    const smax = Math.max(sr, sg, sb);
    if (!smax || (smax - Math.min(sr, sg, sb)) / smax < 0.12 || hueDistance(hue(sr, sg, sb), keyHue) > 45) continue;
    const r = base[p], g = base[p + 1], b = base[p + 2];
    const max = Math.max(r, g, b);
    const s = max ? (max - Math.min(r, g, b)) / max : 0;
    if (s < 0.12) continue;
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    const t = Math.min(1, (s - 0.12) * 2.5);
    base[p] = r + (gray - r) * t;
    base[p + 1] = g + (gray - g) * t;
    base[p + 2] = b + (gray - b) * t;
  }

  // Warp: each card pixel looks up where it lands on the design (inverse homography, bilinear).
  const level = pickLevel(levels, quad);
  const lw = level.width, lh = level.height, L = dataOf(level);
  const H = homography(local, [[0, 0], [lw, 0], [lw, lh], [0, lh]]);
  const paperX = 1500 / lw, paperY = 2100 / lh;
  for (let y = 0, i = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++, i++) {
      const a = alpha[i];
      if (a <= 0) continue;
      const px = x + 0.5, py = y + 0.5;
      const w = H[6] * px + H[7] * py + H[8];
      const u = (H[0] * px + H[1] * py + H[2]) / w;
      const v = (H[3] * px + H[4] * py + H[5]) / w;
      const su = Math.min(lw - 1.0001, Math.max(0, u - 0.5));
      const sv = Math.min(lh - 1.0001, Math.max(0, v - 0.5));
      const x0 = su | 0, y0 = sv | 0, fx = su - x0, fy = sv - y0;
      const i00 = (y0 * lw + x0) * 4, i10 = i00 + 4, i01 = i00 + lw * 4, i11 = i01 + 4;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;

      let m = 1;
      if (mask[i]) {
        const p = i * 4;
        const factor = Math.min(1.15, Math.max(0.55, Math.max(src[p], src[p + 1], src[p + 2]) / medV));
        m = 1 + (factor - 1) * lighting;
      }
      if (texture > 0) m *= 1 + texture * paperNoise(su * paperX, sv * paperY);

      const p = i * 4;
      for (let c = 0; c < 3; c++) {
        const d = (L[i00 + c] * w00 + L[i10 + c] * w10 + L[i01 + c] * w01 + L[i11 + c] * w11) * m;
        base[p + c] = base[p + c] * (1 - a) + d * a;
      }
    }
  }
  ctx.putImageData(region, box.x0, box.y0);
}

// Un-warps the card back to a flat design-sized image, for Compare.
export function flattenCard(composite, quad, dw, dh, maxW = 1600) {
  const s = Math.min(1, maxW / dw);
  const w = Math.round(dw * s), h = Math.round(dh * s);
  const H = homography([[0, 0], [w, 0], [w, h], [0, h]], quad);
  const S = pixels(composite).data, cw = composite.width, ch = composite.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  for (let y = 0, p = 0; y < h; y++) {
    for (let x = 0; x < w; x++, p += 4) {
      const px = x + 0.5, py = y + 0.5;
      const ww = H[6] * px + H[7] * py + H[8];
      const u = Math.min(cw - 1.0001, Math.max(0, (H[0] * px + H[1] * py + H[2]) / ww - 0.5));
      const v = Math.min(ch - 1.0001, Math.max(0, (H[3] * px + H[4] * py + H[5]) / ww - 0.5));
      const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0;
      const i00 = (y0 * cw + x0) * 4, i10 = i00 + 4, i01 = i00 + cw * 4, i11 = i01 + 4;
      for (let c = 0; c < 3; c++) {
        img.data[p + c] = (S[i00 + c] * (1 - fx) + S[i10 + c] * fx) * (1 - fy) + (S[i01 + c] * (1 - fx) + S[i11 + c] * fx) * fy;
      }
      img.data[p + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}
