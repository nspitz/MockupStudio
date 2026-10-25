// Export crop, output size and saving the JPG.

import { bbox } from './geometry.js';
import { FidelityError } from './rules.js';

export const ASPECTS = { original: null, '3:4': 3 / 4, '4:5': 4 / 5, '1:1': 1, '4:3': 4 / 3 };

// The largest crop of that aspect that still holds the whole card (R4), kept as central as possible.
export function cropFor(sceneW, sceneH, aspectKey, corners) {
  const ratio = ASPECTS[aspectKey];
  if (!ratio) return { x: 0, y: 0, w: sceneW, h: sceneH };
  let w, h;
  if (sceneW / sceneH > ratio) { h = sceneH; w = h * ratio; } else { w = sceneW; h = w / ratio; }
  const b = bbox(corners, sceneW, sceneH);
  if (b.x1 - b.x0 > w + 0.5 || b.y1 - b.y0 > h + 0.5) {
    throw new FidelityError(`R4: a ${aspectKey} crop would cut the card. Choose another crop or "Original".`);
  }
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const x = clamp(clamp((sceneW - w) / 2, b.x1 - w, b.x0), 0, sceneW - w);
  const y = clamp(clamp((sceneH - h) / 2, b.y1 - h, b.y0), 0, sceneH - h);
  return { x, y, w, h };
}

// Etsy wants 2000px+; long side 2000–2700.
export function outputSize(crop, minLong = 2000, maxLong = 2700) {
  const long = Math.max(crop.w, crop.h);
  const s = Math.max(minLong, Math.min(long, maxLong)) / long;
  return { w: Math.round(crop.w * s), h: Math.round(crop.h * s) };
}

// Quality steps down from 0.92 (never below 0.8) to aim under 1MB.
export async function toJpegBlob(canvas) {
  let blob;
  for (const q of [0.92, 0.88, 0.84, 0.8]) {
    blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', q));
    if (blob.size <= 1_000_000) break;
  }
  return blob;
}

export function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export function canShareFiles() {
  try {
    return !!navigator.canShare && navigator.canShare({ files: [new File([new Blob()], 'x.jpg', { type: 'image/jpeg' })] });
  } catch {
    return false;
  }
}

export function shareBlob(blob, name) {
  return navigator.share({ files: [new File([blob], name, { type: 'image/jpeg' })] });
}
