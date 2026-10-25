// Corner handles over the scene: drag with finger or mouse, with a magnifier while dragging.
// Coordinates are scene pixels (the SVG viewBox is the scene's size).

const NS = 'http://www.w3.org/2000/svg';
const KNOB_PX = 11, HIT_PX = 24;

function el(name, attrs = {}) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

export function createHandles({ svg, magnifier, getScene, onCommit, onPick }) {
  let W = 1, H = 1, corners = null, crop = null, drag = -1, pickMode = false;

  const shade = el('path', { class: 'crop-shade', 'fill-rule': 'evenodd' });
  const cropLine = el('rect', { class: 'crop-line' });
  const poly = el('polygon', { class: 'quad' });
  const knobs = [0, 1, 2, 3].map((i) => {
    const g = el('g', { class: 'knob' });
    g.append(el('circle', { class: 'hit' }), el('circle', { class: 'dot' }));
    g.addEventListener('pointerdown', (e) => {
      if (pickMode) return;
      e.preventDefault();
      e.stopPropagation();
      drag = i;
      g.setPointerCapture(e.pointerId);
      showMagnifier(...corners[i]);
    });
    return g;
  });
  svg.append(shade, cropLine, poly, ...knobs);

  const unit = () => W / (svg.getBoundingClientRect().width || W);

  function toScene(e) {
    const r = svg.getBoundingClientRect();
    return [
      Math.min(W, Math.max(0, ((e.clientX - r.left) / r.width) * W)),
      Math.min(H, Math.max(0, ((e.clientY - r.top) / r.height) * H)),
    ];
  }

  function draw() {
    const u = unit();
    poly.setAttribute('points', corners ? corners.map((p) => p.join(',')).join(' ') : '');
    knobs.forEach((g, i) => {
      g.style.display = corners ? '' : 'none';
      if (!corners) return;
      g.setAttribute('transform', `translate(${corners[i][0]},${corners[i][1]})`);
      g.children[0].setAttribute('r', HIT_PX * u);
      g.children[1].setAttribute('r', KNOB_PX * u);
    });
    if (crop) {
      const { x, y, w, h } = crop;
      shade.setAttribute('d', `M0 0H${W}V${H}H0Z M${x} ${y}h${w}v${h}h${-w}Z`);
      Object.entries({ x, y, width: w, height: h }).forEach(([k, v]) => cropLine.setAttribute(k, v));
    }
    shade.style.display = cropLine.style.display = crop ? '' : 'none';
  }

  function showMagnifier(x, y) {
    const scene = getScene();
    if (!scene) return;
    const S = magnifier.width, region = Math.max(40, Math.max(W, H) / 25);
    const ctx = magnifier.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, S, S);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(scene, x - region / 2, y - region / 2, region, region, 0, 0, S, S);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S);
    ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2);
    ctx.stroke();
    // Keep it away from the finger.
    magnifier.classList.toggle('right', x < W / 2);
    magnifier.hidden = false;
  }

  svg.addEventListener('pointermove', (e) => {
    if (drag < 0) return;
    corners[drag] = toScene(e);
    draw();
    showMagnifier(...corners[drag]);
  });
  const end = () => {
    if (drag < 0) return;
    drag = -1;
    magnifier.hidden = true;
    onCommit(corners.map((p) => p.slice()));
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('click', (e) => { if (pickMode) onPick(...toScene(e)); });

  new ResizeObserver(draw).observe(svg);

  return {
    setScene(w, h) {
      W = w; H = h;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      draw();
    },
    setCorners(c) { corners = c && c.map((p) => p.slice()); draw(); },
    setCrop(rect) { crop = rect; draw(); },
    setPickMode(on) { pickMode = on; svg.classList.toggle('picking', on); },
  };
}
