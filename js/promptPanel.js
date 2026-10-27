// The "Gemini prompt" section: props pack, mockup type, surface, prop checkboxes, colours → a prompt to copy.

import { PROP_GROUPS, SURFACES } from './props.js';
import { extractColours, chooseKey } from './palette.js';
import { TYPES, buildPrompt } from './prompt.js';
import { loadPrefs, savePrefs } from './prefs.js';
import { parsePack, packColours } from './pack.js';
import { KEYS } from './keying.js';

const $ = (id) => document.getElementById(id);

function make(tag, attrs = {}, text) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
}

// onType(type): called with the picked shot type, at start and on every change.
export function createPromptPanel({ onType = () => {} } = {}) {
  const prefs = loadPrefs();
  let type = prefs.lastType in TYPES ? prefs.lastType : 'main';
  let designColours = [];
  let colours = [];
  let key = 'green';

  // Remembered per mockup type, on this device.
  const fresh = () => ({ props: [], surface: 'linen', surfaceOther: '', other: '', backdrop: '', packOff: [] });
  const selOf = (t) => (prefs.byType[t] = { ...fresh(), ...prefs.byType[t] });
  const sel = () => selOf(type);
  const allProps = () => [...PROP_GROUPS.flatMap((g) => g.props), ...prefs.customProps];
  const persist = () => savePrefs(prefs);

  // Pack colours win over colours read from the design: they're the props palette chosen for the theme.
  function refreshColours() {
    const base = prefs.pack?.colours.length ? packColours(prefs.pack) : designColours;
    colours = base.map((c) => ({ ...c, on: true }));
    const known = colours.filter((c) => c.rgb);
    key = known.length ? chooseKey(known) : 'green';
  }

  function renderPack() {
    const p = prefs.pack;
    $('packStatus').textContent = p ? `Using: ${p.name}` : 'No pack. Props come from the list below.';
    $('packStatus').dataset.kind = p ? 'ok' : 'info';
    $('clearPack').hidden = !p;
  }

  function renderType() {
    for (const b of $('typeSeg').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.type === type));
    const t = TYPES[type];
    $('propsBlock').hidden = type === 'hand' || !!t.layout;
    for (const id of ['promptBlock', 'packBox']) $(id).hidden = !!t.layout;
    $('layoutNote').hidden = !t.layout;
    $('backdropRow').hidden = !t.backdrop;
    if (t.backdrop) {
      $('backdropLabel').textContent = t.backdrop.label;
      $('backdrop').placeholder = t.backdrop.fallback;
      $('backdrop').value = sel().backdrop;
    }
  }

  function renderSurface() {
    const s = $('surface');
    const opts = SURFACES.map((x) => make('option', { value: x.id }, x.label));
    if (prefs.pack?.surface) opts.unshift(make('option', { value: 'pack' }, `From pack: ${prefs.pack.surface}`));
    s.replaceChildren(...opts, make('option', { value: 'custom' }, 'Other…'));
    if (sel().surface === 'pack' && !prefs.pack?.surface) sel().surface = 'linen';
    s.value = sel().surface;
    $('surfaceOther').hidden = sel().surface !== 'custom';
    $('surfaceOther').value = sel().surfaceOther;
  }

  function checkbox(attrs, label, checked) {
    const row = make('label', { class: 'prop' });
    const cb = make('input', { type: 'checkbox', ...attrs });
    cb.checked = checked;
    row.append(cb, make('span', {}, label));
    return row;
  }

  function renderProps() {
    const sets = [];
    if (prefs.pack) {
      const fs = make('fieldset', { class: 'pack-props' });
      fs.append(make('legend', {}, 'This design'));
      prefs.pack.props.forEach((phrase, i) => fs.append(checkbox({ 'data-pack': i }, phrase, !sel().packOff.includes(i))));
      sets.push(fs);
    }
    const groups = [...PROP_GROUPS];
    if (prefs.customProps.length) groups.push({ name: 'My props', props: prefs.customProps, custom: true });
    for (const g of groups) {
      const fs = make('fieldset');
      fs.append(make('legend', {}, g.name));
      for (const p of g.props) {
        const row = checkbox({ 'data-id': p.id }, p.label, sel().props.includes(p.id));
        if (g.custom) row.append(make('button', { class: 'remove', 'data-remove': p.id, 'aria-label': `Remove ${p.label}`, type: 'button' }, '×'));
        fs.append(row);
      }
      sets.push(fs);
    }
    $('propGroups').replaceChildren(...sets);
    $('otherProps').value = sel().other;
  }

  function renderChips() {
    if (!colours.length) {
      $('colourChips').replaceChildren(make('span', { class: 'note' }, 'Open a design or paste a pack to set the colours.'));
      return;
    }
    $('colourChips').replaceChildren(...colours.map((c, i) => {
      const b = make('button', { class: 'chip', type: 'button', 'data-i': i, 'aria-pressed': String(c.on) });
      const sw = make('span', { class: 'swatch' });
      sw.style.background = c.hex;
      b.append(sw, c.name);
      return b;
    }));
  }

  function update() {
    const s = sel();
    let surface;
    if (s.surface === 'pack') surface = prefs.pack.surface;
    else if (s.surface === 'custom') surface = s.surfaceOther.trim() || 'a plain surface';
    else surface = SURFACES.find((x) => x.id === s.surface)?.phrase || SURFACES[0].phrase;
    const props = prefs.pack ? prefs.pack.props.filter((_, i) => !s.packOff.includes(i)) : [];
    props.push(...allProps().filter((p) => s.props.includes(p.id)).map((p) => p.phrase));
    if (s.other.trim()) props.push(s.other.trim());
    $('promptText').value = buildPrompt({
      type, surface, props, key, backdrop: s.backdrop,
      scatter: type === 'hand' ? '' : prefs.pack?.scatter || '',
      colours: colours.filter((c) => c.on).map((c) => c.name),
    });
    const two = TYPES[type].keys === 2;
    $('keyNote').textContent = two ? 'Fronts green, backs magenta' : `${KEYS[key].label} ${KEYS[key].hex}`;
    $('keyNote').style.setProperty('--key', two ? `linear-gradient(90deg, ${KEYS.green.hex} 50%, ${KEYS.magenta.hex} 50%)` : KEYS[key].hex);
  }

  function renderAll() {
    renderPack();
    renderType();
    renderSurface();
    renderProps();
    renderChips();
    update();
  }

  // A new pack replaces the ticked list props on every type, so the last design's props don't carry over.
  function usePack(pack) {
    prefs.pack = pack;
    for (const t of Object.keys(TYPES)) {
      const s = selOf(t);
      s.props = [];
      s.packOff = [];
      s.other = '';
      if (pack.surface) s.surface = 'pack';
      if (t === 'stand') s.backdrop = pack.party;
      if (t === 'hand') s.backdrop = pack.wall;
    }
    persist();
    refreshColours();
    renderAll();
  }

  $('applyPack').addEventListener('click', () => {
    try {
      usePack(parsePack($('packText').value));
      $('packText').value = '';
      $('packError').hidden = true;
      $('packBox').open = false;
    } catch (err) {
      $('packError').textContent = err.message;
      $('packError').hidden = false;
    }
  });

  $('clearPack').addEventListener('click', () => {
    prefs.pack = null;
    for (const t of Object.keys(TYPES)) selOf(t).backdrop = '';
    persist();
    refreshColours();
    renderAll();
  });

  $('typeSeg').addEventListener('click', (e) => {
    const t = e.target.closest('button')?.dataset.type;
    if (!t) return;
    type = prefs.lastType = t;
    persist();
    renderAll();
    onType(type);
  });

  $('surface').addEventListener('change', (e) => {
    sel().surface = e.target.value;
    $('surfaceOther').hidden = e.target.value !== 'custom';
    persist();
    update();
  });
  $('surfaceOther').addEventListener('input', (e) => { sel().surfaceOther = e.target.value; persist(); update(); });
  $('backdrop').addEventListener('input', (e) => { sel().backdrop = e.target.value; persist(); update(); });

  $('propGroups').addEventListener('change', (e) => {
    const { id, pack } = e.target.dataset;
    if (pack !== undefined) {
      const i = Number(pack), off = sel().packOff;
      sel().packOff = e.target.checked ? off.filter((x) => x !== i) : [...off, i];
    } else if (id) {
      const list = sel().props;
      sel().props = e.target.checked ? [...list, id] : list.filter((x) => x !== id);
    } else return;
    persist();
    update();
  });
  $('propGroups').addEventListener('click', (e) => {
    const id = e.target.dataset.remove;
    if (!id) return;
    e.preventDefault();
    prefs.customProps = prefs.customProps.filter((p) => p.id !== id);
    for (const s of Object.values(prefs.byType)) s.props = s.props.filter((x) => x !== id);
    persist();
    renderProps();
    update();
  });

  function addProp() {
    const text = $('newProp').value.trim();
    if (!text) return;
    const id = `my-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    if (!prefs.customProps.some((p) => p.id === id)) prefs.customProps.push({ id, label: text, phrase: text });
    if (!sel().props.includes(id)) sel().props.push(id);
    $('newProp').value = '';
    persist();
    renderProps();
    update();
  }
  $('addProp').addEventListener('click', addProp);
  $('newProp').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addProp(); } });

  $('otherProps').addEventListener('input', (e) => { sel().other = e.target.value; persist(); update(); });

  $('colourChips').addEventListener('click', (e) => {
    const i = e.target.closest('.chip')?.dataset.i;
    if (i === undefined) return;
    colours[i].on = !colours[i].on;
    renderChips();
    update();
  });

  $('copyPrompt').addEventListener('click', async () => {
    const text = $('promptText').value;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      $('promptText').select();
      document.execCommand('copy');
    }
    $('copyPrompt').textContent = 'Copied ✓';
    setTimeout(() => { $('copyPrompt').textContent = 'Copy Gemini prompt'; }, 2000);
  });

  refreshColours();
  renderAll();
  onType(type);

  return {
    usePack,
    setDesign(canvas) {
      designColours = extractColours(canvas);
      refreshColours();
      renderChips();
      update();
    },
  };
}
