// The card's 4 corners from its key mask: convex hull, then the card's 4 edges extended to meet.
// Extending the edges finds a corner a hand is covering; the largest quadrilateral on the hull is the fallback.

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
  const hull = simplifyHull(convexHull(pts));
  const quad = largestQuad(hull);
  if (!quad) return null;
  const onHull = orderCorners(quad);
  const fromEdges = edgeCorners(hull, quad);
  if (!fromEdges) return onHull;
  // Nothing hidden: hull vertices are exact, while extended edges carry the pixel staircase's ~1px wobble.
  const ordered = orderCorners(fromEdges);
  return ordered.some((p, i) => Math.hypot(p[0] - onHull[i][0], p[1] - onHull[i][1]) > 3) ? ordered : onHull;
}

const MERGE_ANGLE = (4 * Math.PI) / 180;

function polyArea(q) {
  let a = 0;
  for (let i = 0; i < q.length; i++) {
    const p = q[i], n = q[(i + 1) % q.length];
    a += p[0] * n[1] - n[0] * p[1];
  }
  return Math.abs(a) / 2;
}

function intersect([a, b], [c, d]) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  return [a[0] + t * r[0], a[1] + t * r[1]];
}

// The hull's 4 longest straight runs are the card's edges; where a hand hides a corner the hull
// cuts across it with a short chord, which is left out. Returns null when the result looks wrong.
function edgeCorners(hull, quad) {
  const n = hull.length;
  if (n < 4) return null;
  const angle = ([a, b]) => Math.atan2(b[1] - a[1], b[0] - a[0]);
  const turn = (e, f) => {
    const d = Math.abs(angle(e) - angle(f)) % (2 * Math.PI);
    return Math.min(d, 2 * Math.PI - d);
  };
  // Join near-collinear neighbours (pixel steps along one edge, or a chord across a thumb mid-edge).
  const runs = [];
  for (let i = 0; i < n; i++) {
    const e = [hull[i], hull[(i + 1) % n]];
    const last = runs[runs.length - 1];
    if (last && turn(last, e) < MERGE_ANGLE) last[1] = e[1];
    else runs.push(e);
  }
  if (runs.length > 1 && turn(runs[runs.length - 1], runs[0]) < MERGE_ANGLE) runs[0][0] = runs.pop()[0];
  if (runs.length < 4) return null;

  const len = ([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const edges = runs.map((e, i) => [i, len(e)]).sort((x, y) => y[1] - x[1]).slice(0, 4).sort((x, y) => x[0] - y[0]).map(([i]) => runs[i]);
  const corners = edges.map((e, i) => intersect(edges[(i + 3) % 4], e));
  if (corners.some((c) => !c)) return null;

  // It may only add what the hand hides: at least the fallback's area, not much more than the hull's.
  const area = polyArea(corners);
  if (area < polyArea(quad) * 0.999 || area > polyArea(hull) * 1.25) return null;
  const diag = Math.max(...quad.map((p) => Math.max(...quad.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])))));
  if (corners.some((c) => Math.min(...hull.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1]))) > diag * 0.25)) return null;
  return corners;
}

export function defaultCorners(w, h) {
  const mx = w * 0.25, my = h * 0.2;
  return [[mx, my], [w - mx, my], [w - mx, h - my], [mx, h - my]];
}
