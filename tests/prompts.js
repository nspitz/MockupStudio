// Same pack → prompt path as promptPanel.js usePack(): pack surface, scatter (not on Hand), party for Stand, wall for Hand,
// pack colours for the palette and the single-card key.
// tests/local/batch/packs.json: [{ slug, pack }]. Writes [{ slug, name, key, pack, prompts: [{ type, text }] }].

import { TYPES, buildPrompt } from '../js/prompt.js';
import { parsePack, packColours } from '../js/pack.js';
import { chooseKey } from '../js/palette.js';

const BACKDROP = { stand: 'party', hand: 'wall' };

const packs = await (await fetch('local/batch/packs.json', { cache: 'no-store' })).json();
const results = packs.map(({ slug, pack: raw }) => {
  const pack = parsePack(JSON.stringify(raw));
  const known = packColours(pack).filter((c) => c.rgb);
  const key = known.length ? chooseKey(known) : 'green';
  // Layout shots (Pile) are drawn by the app: no Gemini prompt.
  const prompts = Object.keys(TYPES).filter((type) => !TYPES[type].layout).map((type) => ({
    type,
    text: buildPrompt({
      type, surface: pack.surface || 'a plain surface', props: type === 'hand' ? [] : pack.props,
      scatter: type === 'hand' ? '' : pack.scatter,
      colours: pack.colours, key, backdrop: BACKDROP[type] ? pack[BACKDROP[type]] : '',
    }),
  }));
  return { slug, name: pack.name, key, pack: raw, prompts };
});
document.getElementById('result').textContent = JSON.stringify(results);
document.title = 'PROMPTS DONE';
