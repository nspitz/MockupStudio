// The card's 4 corners from its key mask: convex hull, then the card's 4 edges extended to meet.
// Extending the edges finds a corner a hand or another card is covering; the largest
// quadrilateral on the hull is the fallback.

import { convexHull, simplifyHull, largestQuad, orderCorners, polygonArea, expandQuad, pointInConvex, bbox } from './geometry.js';

// others (optional): pixels of other cards in the scene, same size as mask. With it, the edges a
// card on top of this one draws across it are left out too, and the reading that fits best wins.
// cover (optional, defaults to others): what counts as hidden rather than bare table when judging
// that fit, e.g. other cards' whole outlines so a thumb on the front card isn't read as table.
export function findCorners(mask, w, h, others = null, cover = others) {
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
  let best = onHull;
  const fromEdges = edgeCorners(hull, quad);
  // Nothing hidden: hull vertices are exact, while extended edges carry the pixel staircase's ~1px wobble.
  if (fromEdges) {
    const ordered = orderCorners(fromEdges);
    if (ordered.some((p, i) => Math.hypot(p[0] - onHull[i][0], p[1] - onHull[i][1]) > 3)) best = ordered;
  }
  if (!others) return best;

  // Under another card, the hull runs along that card's edge for a while. Leave out every hull edge
  // whose two ends both touch another card, and keep that reading only if it fits clearly better.
  const touches = ([x, y]) => {
    for (let yy = Math.max(0, Math.round(y) - 3); yy <= Math.min(h - 1, Math.round(y) + 3); yy++) {
      for (let xx = Math.max(0, Math.round(x) - 3); xx <= Math.min(w - 1, Math.round(x) + 3); xx++) if (others[yy * w + xx]) return true;
    }
    return false;
  };
  const under = edgeCorners(hull, quad, ([a, b]) => touches(a) && touches(b), true);
  if (!under) return best;
  const u = orderCorners(under);
  const fit = (q) => misfit(q, mask, cover, w, h);
  return fit(u) < fit(best) * 0.5 ? u : best;
}

// How badly a quad explains the scene: this card's pixels left outside it, plus plain background
// inside it (a hidden part should be hidden by another card, not show the table).
function misfit(q, mask, others, w, h) {
  const inner = expandQuad(q, -2), outer = expandQuad(q, 2);
  const b = bbox(outer, w, h);
  let bad = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const inBox = x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1;
      if (mask[i] && !(inBox && pointInConvex(outer, x + 0.5, y + 0.5))) bad++;
      else if (inBox && !mask[i] && !others[i] && pointInConvex(inner, x + 0.5, y + 0.5)) bad++;
    }
  }
  return bad;
}

const MERGE_ANGLE = (4 * Math.PI) / 180;

function intersect([a, b], [c, d]) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  return [a[0] + t * r[0], a[1] + t * r[1]];
}

// A convex quad with every angle between 45° and 135°: a card seen from above, not a sliver.
function cardShaped(q) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[(i + 3) % 4], p = q[i], b = q[(i + 1) % 4];
    const ux = a[0] - p[0], uy = a[1] - p[1], vx = b[0] - p[0], vy = b[1] - p[1];
    const cross = ux * vy - uy * vx;
    if (sign && Math.sign(cross) !== sign) return false;
    sign = Math.sign(cross);
    const ang = Math.acos((ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1));
    if (ang < Math.PI / 4 || ang > (3 * Math.PI) / 4) return false;
  }
  return true;
}

// The hull's 4 longest straight runs are the card's edges; where a hand hides a corner the hull
// cuts across it with a short chord, which is left out. skip drops hull edges up front (edges
// another card draws). loose allows a card mostly hidden under others. Null when it looks wrong.
function edgeCorners(hull, quad, skip = null, loose = false) {
  const n = hull.length;
  if (n < 4) return null;
  const angle = ([a, b]) => Math.atan2(b[1] - a[1], b[0] - a[0]);
  const turn = (e, f) => {
    const d = Math.abs(angle(e) - angle(f)) % (2 * Math.PI);
    return Math.min(d, 2 * Math.PI - d);
  };
  // Join near-collinear neighbours (pixel steps along one edge, or a chord across a thumb mid-edge).
  const runs = [];
  let gap = false;
  for (let i = 0; i < n; i++) {
    const e = [hull[i], hull[(i + 1) % n]];
    if (skip && skip(e)) { gap = true; continue; }
    const last = runs[runs.length - 1];
    if (last && !gap && turn(last, e) < MERGE_ANGLE) last[1] = e[1];
    else runs.push(e);
    gap = false;
  }
  if (runs.length > 1 && turn(runs[runs.length - 1], runs[0]) < MERGE_ANGLE) runs[0][0] = runs.pop()[0];
  if (runs.length < 4) return null;

  const len = ([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const edges = runs.map((e, i) => [i, len(e)]).sort((x, y) => y[1] - x[1]).slice(0, 4).sort((x, y) => x[0] - y[0]).map(([i]) => runs[i]);
  const corners = edges.map((e, i) => intersect(edges[(i + 3) % 4], e));
  if (corners.some((c) => !c)) return null;

  // It may only add what is hidden: at least the fallback's area, and not far beyond what shows.
  const area = polygonArea(corners);
  if (area < polygonArea(quad) * 0.999) return null;
  if (loose) return cardShaped(corners) && area <= polygonArea(hull) * 3 ? corners : null;
  if (area > polygonArea(hull) * 1.25) return null;
  const diag = Math.max(...quad.map((p) => Math.max(...quad.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])))));
  if (corners.some((c) => Math.min(...hull.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1]))) > diag * 0.25)) return null;
  return corners;
}

export function defaultCorners(w, h) {
  const mx = w * 0.25, my = h * 0.2;
  return [[mx, my], [w - mx, my], [w - mx, h - my], [mx, h - my]];
}
