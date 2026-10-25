// Builds the Gemini scene prompt. The key-colour blank and the no-text rules are fixed text,
// added in code, so they can't be dropped by accident.

import { KEYS } from './keying.js';

export const TYPES = {
  main: {
    label: 'Main flat-lay',
    target: 'card',
    template: 'Overhead flat-lay product photo, portrait 3:4. One blank 5x7 inch invitation card lies centred and fully visible on {SURFACE}. {PROPS} Soft natural daylight, gentle realistic shadows.',
  },
  stand: {
    label: 'Stand',
    target: 'card',
    template: 'Product photo, portrait 3:4, of one blank 5x7 inch invitation card standing upright in a clear acrylic stand on {SURFACE}, the card fully visible and facing the camera, a party softly blurred in the background. {PROPS} Warm natural light.',
  },
  phone: {
    label: 'Phone',
    target: 'screen',
    template: 'Overhead flat-lay product photo, portrait 3:4, of a modern smartphone lying flat on {SURFACE}, its screen fully visible and facing up. {PROPS} Soft even light.',
  },
};

export function joinList(items) {
  if (items.length <= 1) return items[0] || '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// props: prompt phrases; colours: colour names.
export function buildPrompt({ type, surface, props, colours, key }) {
  const t = TYPES[type], k = KEYS[key];
  const keyText = `pure chroma-key ${k.label.toLowerCase()} colour (${k.hex})`;
  let propsText = 'Keep the surface simple, with no other props.';
  if (props.length) {
    propsText = `Around it: ${joinList(props)}.`;
    if (colours.length) propsText += ` Props in a palette of ${joinList(colours)}.`;
  }
  const blank = t.target === 'card'
    ? `The ENTIRE front surface of the card is one flat, solid, ${keyText}, edge to edge, with no text, pattern, border or texture on it.`
    : `The ENTIRE phone screen is one flat, solid, ${keyText}, edge to edge, with no icons, text, reflections or glare on it.`;
  const rules = `Nothing covers or overlaps the ${t.target}. No text, letters, signs, logos or watermarks anywhere in the image. If a reference image is attached, copy only its composition and camera angle, not its card or its content.`;
  return `${t.template.replace('{SURFACE}', surface).replace('{PROPS}', propsText)} ${blank} ${rules}`;
}
