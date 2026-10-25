// Pure geometry: convex hull, largest inscribed quadrilateral, corner order, homographies.
// Points are [x, y] in image pixels, y pointing down.

export function convexHull(points) {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const out = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return half(pts).concat(half(pts.slice().reverse()));
}

// Drops hull vertices that barely turn (pixel staircase along a straight edge),
// keeping the sharp ones — the card corners are always kept.
export function simplifyHull(hull, minTurn = 0.03, maxPoints = 300) {
  const n = hull.length;
  if (n <= 4) return hull;
  let out = hull.filter((p, i) => {
    const a = hull[(i + n - 1) % n], b = hull[(i + 1) % n];
    const ux = p[0] - a[0], uy = p[1] - a[1], vx = b[0] - p[0], vy = b[1] - p[1];
    const sin = Math.abs(ux * vy - uy * vx) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1);
    return sin >= minTurn;
  });
  if (out.length < 4) out = hull;
  if (out.length > maxPoints) {
    const step = out.length / maxPoints;
    out = Array.from({ length: maxPoints }, (_, i) => out[Math.floor(i * step)]);
  }
  return out;
}

function triArea(a, b, c) {
  return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
}

// The 4 hull vertices enclosing the largest area: for every diagonal i–j,
// the best apex on each side.
export function largestQuad(hull) {
  const n = hull.length;
  if (n < 4) return null;
  let best = 0, quad = null;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      let a1 = 0, k1 = -1;
      for (let k = i + 1; k < j; k++) {
        const a = triArea(hull[i], hull[k], hull[j]);
        if (a > a1) { a1 = a; k1 = k; }
      }
      let a2 = 0, k2 = -1;
      for (let k = j + 1; k < n + i; k++) {
        const a = triArea(hull[i], hull[j], hull[k % n]);
        if (a > a2) { a2 = a; k2 = k % n; }
      }
      if (k1 >= 0 && k2 >= 0 && a1 + a2 > best) {
        best = a1 + a2;
        quad = [hull[i], hull[k1], hull[j], hull[k2]];
      }
    }
  }
  return quad;
}

// Returns [TL, TR, BR, BL].
export function orderCorners(q) {
  const cx = q.reduce((s, p) => s + p[0], 0) / 4;
  const cy = q.reduce((s, p) => s + p[1], 0) / 4;
  const s = q.slice().sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  let start = 0;
  for (let i = 1; i < 4; i++) if (s[i][0] + s[i][1] < s[start][0] + s[start][1]) start = i;
  return [0, 1, 2, 3].map((i) => s[(start + i) % 4].slice());
}

// Which detected corner the design's top-left goes to; turns the design in 90° steps.
export function rotateCorners(q, r) {
  return [0, 1, 2, 3].map((i) => q[(i + r) % 4]);
}

// H such that dst[i] = H · src[i], for 4 point pairs.
export function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [X, Y] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]); b.push(X);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]); b.push(Y);
  }
  return [...solve(A, b), 1];
}

function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) throw new Error('Corners are degenerate (three in a line).');
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

export function applyH(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

export function expandQuad(q, px) {
  const cx = q.reduce((s, p) => s + p[0], 0) / 4;
  const cy = q.reduce((s, p) => s + p[1], 0) / 4;
  return q.map(([x, y]) => {
    const d = Math.hypot(x - cx, y - cy) || 1;
    return [x + ((x - cx) / d) * px, y + ((y - cy) / d) * px];
  });
}

export function pointInConvex(q, x, y) {
  let sign = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i], b = q[(i + 1) % q.length];
    const c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (c !== 0) {
      if (sign === 0) sign = Math.sign(c);
      else if (Math.sign(c) !== sign) return false;
    }
  }
  return true;
}

export function bbox(q, W = Infinity, H = Infinity) {
  const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
  return {
    x0: Math.max(0, Math.floor(Math.min(...xs))),
    y0: Math.max(0, Math.floor(Math.min(...ys))),
    x1: Math.min(W, Math.ceil(Math.max(...xs))),
    y1: Math.min(H, Math.ceil(Math.max(...ys))),
  };
}

// Average width and height of a [TL, TR, BR, BL] quad.
export function quadSize(q) {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  return { w: (d(q[0], q[1]) + d(q[3], q[2])) / 2, h: (d(q[0], q[3]) + d(q[1], q[2])) / 2 };
}
