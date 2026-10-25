// Opening images from the device and resizing canvases. Nothing here touches the network.

// iOS Safari refuses canvases above ~16.7M pixels.
const MAX_AREA = 16_000_000;

export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth, h = img.naturalHeight;
      const shrink = Math.min(1, Math.sqrt(MAX_AREA / (w * h)));
      w = Math.round(w * shrink);
      h = Math.round(h * shrink);
      resolve({ name: file.name, canvas: drawTo(img, w, h), shrunk: shrink < 1 });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not open ${file.name}. Use a JPG or PNG.`));
    };
    img.src = url;
  });
}

// High-quality resize; halves step by step when shrinking a lot, so text stays clean.
export function scaledCanvas(src, w, h) {
  let cur = src, cw = src.width, ch = src.height;
  while (cw / 2 >= w && ch / 2 >= h) {
    cw = Math.round(cw / 2);
    ch = Math.round(ch / 2);
    cur = drawTo(cur, cw, ch);
  }
  return drawTo(cur, w, h);
}

function drawTo(src, w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return c;
}

export function fitLongSide(w, h, long) {
  const s = long / Math.max(w, h);
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)), scale: s };
}

export function pixels(canvas, x = 0, y = 0, w = canvas.width, h = canvas.height) {
  return canvas.getContext('2d', { willReadFrequently: true }).getImageData(x, y, w, h);
}

export function slugify(name) {
  return name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design';
}
