// The "Gemini prompt" section: mockup type, surface, prop checkboxes, colours → a prompt to copy.

import { PROP_GROUPS, SURFACES } from './props.js';
import { extractColours, chooseKey } from './palette.js';
import { TYPES, buildPrompt } from './prompt.js';
import { loadPrefs, savePrefs } from './prefs.js';
import { KEYS } from './keying.js';

const $ = (id) => document.getElementById(id);

function make(tag, attrs = {}, text) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
}

export function createPromptPanel() {
  const prefs = loadPrefs();
  let type = prefs.lastType in TYPES ? prefs.lastType : 'main';
  let colours = [];
  let key = 'green';

  // Remembered per mockup type, on this device.
  const sel = () => (prefs.byType[type] ||= { props: [], surface: 'linen', surfaceOther: '', other: '' });
  const allProps = () => [...PROP_GROUPS.flatMap((g) => g.props), ...prefs.customProps];
  const persist = () => savePrefs(prefs);

  function renderType() {
    for (const b of $('typeSeg').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.type === type));
  }

  function renderSurface() {
    const s = $('surface');
    s.replaceChildren(...SURFACES.map((x) => make('option', { value: x.id }, x.label)), make('option', { value: 'custom' }, 'Other…'));
    s.value = sel().surface;
    $('surfaceOther').hidden = sel().surface !== 'custom';
    $('surfaceOther').value = sel().surfaceOther;
  }

  function renderProps() {
    const groups = [...PROP_GROUPS];
    if (prefs.customProps.length) groups.push({ name: 'My props', props: prefs.customProps, custom: true });
    $('propGroups').replaceChildren(...groups.map((g) => {
      const fs = make('fieldset');
      fs.append(make('legend', {}, g.name));
      for (const p of g.props) {
        const row = make('label', { class: 'prop' });
        const cb = make('input', { type: 'checkbox', 'data-id': p.id });
        cb.checked = sel().props.includes(p.id);
        row.append(cb, make('span', {}, p.label));
        if (g.custom) row.append(make('button', { class: 'remove', 'data-remove': p.id, 'aria-label': `Remove ${p.label}`, type: 'button' }, '×'));
        fs.append(row);
      }
      return fs;
    }));
    $('otherProps').value = sel().other;
  }

  function renderChips() {
    if (!colours.length) {
      $('colourChips').replaceChildren(make('span', { class: 'note' }, 'Open a design to read its colours.'));
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
    const surface = s.surface === 'custom'
      ? s.surfaceOther.trim() || 'a plain surface'
      : SURFACES.find((x) => x.id === s.surface)?.phrase || SURFACES[0].phrase;
    const props = allProps().filter((p) => s.props.includes(p.id)).map((p) => p.phrase);
    if (s.other.trim()) props.push(s.other.trim());
    $('promptText').value = buildPrompt({ type, surface, props, colours: colours.filter((c) => c.on).map((c) => c.name), key });
    $('keyNote').textContent = `${KEYS[key].label} ${KEYS[key].hex}`;
    $('keyNote').style.setProperty('--key', KEYS[key].hex);
  }

  function renderAll() {
    renderType();
    renderSurface();
    renderProps();
    renderChips();
    update();
  }

  $('typeSeg').addEventListener('click', (e) => {
    const t = e.target.closest('button')?.dataset.type;
    if (!t) return;
    type = prefs.lastType = t;
    persist();
    renderAll();
  });

  $('surface').addEventListener('change', (e) => {
    sel().surface = e.target.value;
    $('surfaceOther').hidden = e.target.value !== 'custom';
    persist();
    update();
  });
  $('surfaceOther').addEventListener('input', (e) => { sel().surfaceOther = e.target.value; persist(); update(); });

  $('propGroups').addEventListener('change', (e) => {
    const id = e.target.dataset.id;
    if (!id) return;
    const list = sel().props;
    sel().props = e.target.checked ? [...list, id] : list.filter((x) => x !== id);
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

  renderAll();

  return {
    setDesign(canvas) {
      colours = extractColours(canvas).map((c) => ({ ...c, on: true }));
      key = chooseKey(colours);
      renderChips();
      update();
    },
  };
}
