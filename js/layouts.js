// Fixed card layouts drawn by the app itself, with no Gemini scene.
// Measured off the inspiration photo at its own size (ref), centred in the output frame (frame: its aspect). Cards are `width` wide (times an
// optional size) and as tall as their design's aspect makes them. Listed bottom to top.
// cx, cy: card centre; angle: degrees, clockwise. The hero is drawn last and must stay whole (R4).

export const LAYOUTS = {
  pile: {
    frame: [4, 3],
    ref: [951, 713],
    width: 356,
    cards: [
      { role: 'back', cx: 1080, cy: 150, angle: 15 }, // far right, mostly under the top-right front
      { role: 'front', cx: 411, cy: 839, angle: -12 }, // bottom middle, a strip of photo
      { role: 'back', cx: 680, cy: 560, angle: 12 }, // under the hero, showing at the bottom
      { role: 'back', cx: 318, cy: 348, angle: -13 }, // under the hero's left edge
      { role: 'front', cx: 155, cy: 53, angle: -10 }, // top left
      { role: 'back', cx: 440, cy: -115, angle: -9 }, // top middle
      { role: 'front', cx: 725, cy: 129, angle: 16 }, // top right
      { role: 'back', cx: 914, cy: 429, angle: 11 }, // right
      { role: 'back', cx: 80, cy: 363, angle: -16, size: 0.84 }, // left
      { role: 'front', cx: 30, cy: 650, angle: -12 }, // bottom left
      { role: 'front', cx: 899, cy: 632, angle: -16 }, // bottom right
      { role: 'front', cx: 483, cy: 361, angle: -1.5, hero: true },
    ],
  },
};

// Export size: the layout's frame shape at a 2000px long side (Etsy wants 2000px+).
export function layoutSize(layout, long = 2000) {
  const [w, h] = layout.frame;
  return w >= h ? { w: long, h: Math.round((long * h) / w) } : { w: Math.round((long * w) / h), h: long };
}

// The cards for renderLayout. designs: { front, back }, each { design: canvas, levels }.
export function layoutCards(layout, outW, outH, designs) {
  const aspect = (r) => designs[r].design.height / designs[r].design.width;
  return layoutQuads(layout, outW, outH, { front: aspect('front'), back: aspect('back') })
    .map((c) => ({ corners: c.corners, levels: designs[c.role].levels, role: c.role, hero: !!c.hero }));
}

// Corners [TL, TR, BR, BL] of every card in an outW x outH frame. aspect: { front, back } as height / width.
export function layoutQuads(layout, outW, outH, aspect) {
  const s = Math.min(outW / layout.ref[0], outH / layout.ref[1]);
  const ox = (outW - layout.ref[0] * s) / 2, oy = (outH - layout.ref[1] * s) / 2;
  return layout.cards.map((c) => {
    const w = layout.width * (c.size || 1) * s, h = w * aspect[c.role];
    const a = (c.angle * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
    const x = ox + c.cx * s, y = oy + c.cy * s;
    const corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
      .map(([u, v]) => [x + u * cos - v * sin, y + u * sin + v * cos]);
    return { ...c, corners };
  });
}
