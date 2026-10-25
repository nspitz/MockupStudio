// The card's 4 corners from its key mask: convex hull, then the largest quadrilateral on it.

import { convexHull, simplifyHull, largestQuad, orderCorners } from './geometry.js';

export function findCorners(mask, w, h) {
  // The left and right edge of each row is enough to build the hull.
  const pts = [];
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let xl = -1, xr = -1;
    for (let x = 0; x < w; x++) if (mask[row + x]) { xl = x; break; }
    if (xl < 0) continue;
    for (let x = w - 1; x >= xl; x--) if (mask[row + x]) { xr = x; break; }
    pts.push([xl, y], [xl, y + 1], [xr + 1, y], [xr + 1, y + 1]);
  }
  if (pts.length < 8) return null;
  const quad = largestQuad(simplifyHull(convexHull(pts)));
  return quad && orderCorners(quad);
}

export function defaultCorners(w, h) {
  const mx = w * 0.25, my = h * 0.2;
  return [[mx, my], [w - mx, my], [w - mx, h - my], [mx, h - my]];
}
