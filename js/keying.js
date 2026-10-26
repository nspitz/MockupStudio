// Finding the chroma-key card in a scene: which pixels are "card", as a mask.

export const KEYS = {
  green: { label: 'Green', hex: '#00FF00', hue: 120 },
  magenta: { label: 'Magenta', hex: '#FF00FF', hue: 300 },
};

// A pixel is card if its hue is within ±25° of the key, saturation > 0.35, value > 0.2.
export const KEY_TEST = { hueTol: 25, minS: 0.35, minV: 0.2 };

export function hue(r, g, b) {
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

export function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function keyCandidates(img, keyHue, test = KEY_TEST) {
  const { data } = img;
  const mask = new Uint8Array(img.width * img.height);
  const minS = test.minS, minV = test.minV * 255;
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    const max = Math.max(r, g, b);
    if (max <= minV) continue;
    if ((max - Math.min(r, g, b)) / max <= minS) continue;
    if (hueDistance(hue(r, g, b), keyHue) <= test.hueTol) mask[i] = 1;
  }
  return mask;
}

// Visits the 4-connected component of pixels equal to `value` starting at `start`.
function flood(mask, w, h, start, value, seen, stack, visit) {
  let sp = 0;
  stack[sp++] = start;
  seen[start] = 1;
  while (sp > 0) {
    const p = stack[--sp];
    visit(p);
    const x = p % w;
    if (x > 0 && !seen[p - 1] && mask[p - 1] === value) { seen[p - 1] = 1; stack[sp++] = p - 1; }
    if (x < w - 1 && !seen[p + 1] && mask[p + 1] === value) { seen[p + 1] = 1; stack[sp++] = p + 1; }
    if (p >= w && !seen[p - w] && mask[p - w] === value) { seen[p - w] = 1; stack[sp++] = p - w; }
    if (p < w * (h - 1) && !seen[p + w] && mask[p + w] === value) { seen[p + w] = 1; stack[sp++] = p + w; }
  }
}

export function largestComponent(mask, w, h) {
  const seen = new Uint8Array(mask.length), stack = new Int32Array(mask.length);
  let bestStart = -1, bestSize = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    let size = 0;
    flood(mask, w, h, i, 1, seen, stack, () => size++);
    if (size > bestSize) { bestSize = size; bestStart = i; }
  }
  const out = new Uint8Array(mask.length);
  if (bestStart >= 0) flood(mask, w, h, bestStart, 1, new Uint8Array(mask.length), stack, (p) => { out[p] = 1; });
  return { mask: out, area: bestSize };
}

// Every component at least `minShare` of the largest one, merged. A back card seen around
// the front card shows up in separate pieces; dropping all but the largest loses its corners.
export function mergedComponents(mask, w, h, minShare = 0.01) {
  const seen = new Uint8Array(mask.length), stack = new Int32Array(mask.length);
  const comps = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    let size = 0;
    flood(mask, w, h, i, 1, seen, stack, () => size++);
    comps.push([i, size]);
  }
  const biggest = Math.max(0, ...comps.map((c) => c[1]));
  const out = new Uint8Array(mask.length), mark = new Uint8Array(mask.length);
  let area = 0;
  for (const [start, size] of comps) {
    if (size < biggest * minShare) continue;
    flood(mask, w, h, start, 1, mark, stack, (p) => { out[p] = 1; });
    area += size;
  }
  return { mask: out, area };
}

// Fills enclosed gaps up to maxHole pixels (specks of noise). Larger gaps stay
// open — they are things in front of the card, such as a thumb.
export function fillSmallHoles(mask, w, h, maxHole) {
  const seen = new Uint8Array(mask.length), stack = new Int32Array(mask.length);
  const comp = new Int32Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] || seen[i]) continue;
    let len = 0, border = false;
    flood(mask, w, h, i, 0, seen, stack, (p) => {
      comp[len++] = p;
      const x = p % w, y = (p / w) | 0;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
    });
    if (!border && len <= maxHole) for (let k = 0; k < len; k++) mask[comp[k]] = 1;
  }
  return mask;
}

// merge: keep every sizeable piece of the key colour (a partly hidden back card), not just the largest.
export function detectRegion(img, keyHue, merge = false) {
  const { width: w, height: h } = img;
  const candidates = keyCandidates(img, keyHue);
  const { mask, area } = merge ? mergedComponents(candidates, w, h) : largestComponent(candidates, w, h);
  fillSmallHoles(mask, w, h, Math.max(4, area * 0.003));
  let filled = 0;
  for (let i = 0; i < mask.length; i++) filled += mask[i];
  return { mask, area: filled };
}

export function medianValue(img, mask) {
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    if (!mask[i]) continue;
    hist[Math.max(img.data[p], img.data[p + 1], img.data[p + 2])]++;
    n++;
  }
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc * 2 >= n) return Math.max(1, v);
  }
  return 255;
}

// Hue of the average colour of a small patch, or null if it isn't a strong colour.
export function sampleHue(img) {
  let r = 0, g = 0, b = 0;
  const n = img.width * img.height;
  for (let p = 0; p < n * 4; p += 4) { r += img.data[p]; g += img.data[p + 1]; b += img.data[p + 2]; }
  r /= n; g /= n; b /= n;
  const max = Math.max(r, g, b);
  if (max < 50 || (max - Math.min(r, g, b)) / max < 0.3) return null;
  return hue(r, g, b);
}
