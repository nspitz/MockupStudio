// Builds the Gemini scene prompt. The key-colour blanks and the no-text rules are fixed text,
// added in code, so they can't be dropped by accident.

import { KEYS } from './keying.js';

// Rich enough to set the theme's mood, without pulling the eye off the card.
const MOOD = 'Rich, warm, true-to-life colour that sets the mood of the theme, not washed out, faded or pastel; gentle realistic shadows.';

// keys: 1 = one blank in the auto-chosen key; 2 = fronts green, backs magenta (hand).
// layout: drawn by the app from js/layouts.js, so there is no Gemini scene and no prompt.
// backdrop: what the "Background" field fills in, and its default.
export const TYPES = {
  pile: {
    label: 'Pile',
    layout: 'pile',
  },
  main: {
    label: 'Main',
    keys: 1,
    template: `Overhead, straight-down flat-lay product photo, portrait 3:4. One blank 5x7 inch invitation card lies flat, centred, square to the frame and fully visible on {SURFACE}. {PROPS} Natural daylight. ${MOOD}`,
  },
  hand: {
    label: 'Hand',
    keys: 2,
    backdrop: { label: 'Wall', fallback: 'a plain warm off-white wall' },
    template: `Product photo, landscape 4:3, of one hand holding two blank 5x7 inch invitation cards upright in front of {BACKDROP}. The two cards are fanned apart as wide as a natural one-handed hold allows: the back card is rotated about 20 degrees and shifted well up and to the side, so most of it shows beside the front card and all four of its corners are visible, while the two cards still overlap near the hand. The hand holds both cards from the lower edge, with only the thumb resting on the bottom margin of the front card. Natural window light, the wall slightly out of focus. ${MOOD}`,
    blank: 'The ENTIRE front card is one flat, solid {GREEN} and the ENTIRE back card is one flat, solid {MAGENTA}, each edge to edge, with no text, pattern, border or texture on them.',
    rules: 'Apart from the thumb and fingers holding them, nothing covers the cards.',
  },
  stand: {
    label: 'Stand',
    keys: 1,
    backdrop: { label: 'Party', fallback: 'party' },
    template: `Product photo, portrait 3:4, of one blank 5x7 inch invitation card standing upright in a clear acrylic stand on {SURFACE}, the card fully visible and facing the camera, with a {BACKDROP} softly blurred in the background. {PROPS} Warm natural light. ${MOOD}`,
  },
  phone: {
    label: 'Phone',
    keys: 1,
    target: 'screen',
    template: `Overhead flat-lay product photo, portrait 3:4, of a modern smartphone lying flat on {SURFACE}, its screen fully visible and facing up. {PROPS} Even natural light. ${MOOD}`,
  },
};

export function joinList(items) {
  if (items.length <= 1) return items[0] || '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const keyText = (k) => `pure chroma-key ${KEYS[k].label.toLowerCase()} colour (${KEYS[k].hex})`;

// props: prompt phrases; colours: colour names; backdrop: '' means the type's fallback.
export function buildPrompt({ type, surface, props, colours, key, backdrop = '' }) {
  const t = TYPES[type];
  if (t.layout) return '';
  let propsText = 'Keep the surface simple, with no other props.';
  if (props.length) {
    // Props at the frame edges, partly cropped: they set the theme without staging a display around the card.
    const hero = t.keys === 2 ? 'the cards' : t.target === 'screen' ? 'the phone' : 'the card';
    propsText = `A few props, styled naturally as if casually set down, sit at the edges and corners of the frame and are partly cropped off by it, so mostly only an edge or a corner of each shows: ${joinList(props)}. Leave open surface around ${hero}.`;
    if (colours.length) propsText += ` Props in a palette of ${joinList(colours)}.`;
  }
  const scene = t.template
    .replace('{SURFACE}', surface)
    .replace('{PROPS}', propsText)
    .replace('{BACKDROP}', backdrop.trim() || t.backdrop?.fallback || '');
  const noText = 'No text, letters, signs, logos or watermarks anywhere in the image.';
  const reference = 'If a reference image is attached, copy only its composition and camera angle, not its cards or their content.';

  if (t.keys === 2) {
    const blank = t.blank.replace('{GREEN}', keyText('green')).replace('{MAGENTA}', keyText('magenta'));
    return `${scene} ${blank} ${t.rules} No other bright green or magenta objects anywhere in the image. ${noText} ${reference}`;
  }
  const target = t.target || 'card';
  const blank = target === 'card'
    ? `The ENTIRE front surface of the card is one flat, solid, ${keyText(key)}, edge to edge, with no text, pattern, border or texture on it.`
    : `The ENTIRE phone screen is one flat, solid, ${keyText(key)}, edge to edge, with no icons, text, reflections or glare on it.`;
  return `${scene} ${blank} Nothing covers or overlaps the ${target}. ${noText} ${reference}`;
}
