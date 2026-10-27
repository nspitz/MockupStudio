// Builds the Gemini scene prompt. The key-colour blanks and the no-text rules are fixed text,
// added in code, so they can't be dropped by accident.

import { KEYS } from './keying.js';

// Like real styled listing photos: a calm surface, side light, and the colour carried by the props.
const MOOD = 'Soft natural window light from one side with gentle realistic shadows. The surface stays calm and neutral; the colour comes from the props and decorations, rich, warm and true to life, not washed out, faded or pastel.';

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
    // Props pushed to the frame edges and mostly cut off, so the card has open space (see EDGE_PROPS).
    edgeProps: true,
    template: `Overhead, straight-down flat-lay product photo, portrait 3:4. One blank 5x7 inch invitation card, upright in portrait orientation with its long side vertical, filling about two thirds of the frame's width, lies flat, centred, square to the frame and fully visible on {SURFACE}. {PROPS} ${MOOD}`,
  },
  hand: {
    label: 'Hand',
    keys: 2,
    backdrop: { label: 'Wall', fallback: 'a plain warm off-white wall' },
    // Hand stays prop-free: the fan of two cards is the subject.
    template: `Product photo, landscape 4:3, of one hand holding two blank 5x7 inch invitation cards upright in front of {BACKDROP}. The two cards are fanned apart as wide as a natural one-handed hold allows: the back card is rotated about 20 degrees and shifted well up and to the side, so most of it shows beside the front card and all four of its corners are visible, while the two cards still overlap near the hand. The hand holds both cards from the lower edge, with only the thumb resting on the bottom margin of the front card. Natural window light, the wall slightly out of focus. ${MOOD}`,
    blank: 'The ENTIRE front card is one flat, solid {GREEN} and the ENTIRE back card is one flat, solid {MAGENTA}, each edge to edge, with no text, pattern, border or texture on them.',
    rules: 'Apart from the thumb and fingers holding them, nothing covers the cards.',
  },
  stand: {
    label: 'Stand',
    keys: 1,
    backdrop: { label: 'Party', fallback: 'party' },
    template: `Product photo, portrait 3:4, of one blank 5x7 inch invitation card standing upright in a clear acrylic stand on {SURFACE}, the card fully visible and facing the camera, with a {BACKDROP} softly blurred in the background. {PROPS} ${MOOD}`,
  },
  phone: {
    label: 'Phone',
    keys: 1,
    target: 'screen',
    template: `Overhead flat-lay product photo, portrait 3:4, of a modern smartphone lying flat on {SURFACE}, its screen fully visible and facing up. {PROPS} ${MOOD}`,
  },
};

export function joinList(items) {
  if (items.length <= 1) return items[0] || '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// Main: props crowding the card in matched patches read as staged, and heavy props read as too much.
// Pushed to the edges, mostly out of frame, lopsided, and with real worn texture instead of smooth AI surfaces.
const EDGE_PROPS = (list) => `The props sit right at the edges of the frame, each one mostly cut off by the frame so only part of it reaches into the picture, styled loosely as if casually set down: ${list}. The arrangement is clearly lopsided: the props gather more heavily along one side and around one corner, the opposite side stays lighter, and nothing mirrors or balances anything else. Open surface shows between the props and the card. Every prop is a real, photographed object at its true real-world size next to a 5x7 inch card, never oversized or toy-like. Each one looks natural, slightly imperfect and lived-in, with real material texture such as visible knit stitches, wood grain, creased fabric and soft fraying edges; nothing glossy, plastic, overly smooth, perfectly clean, kitsch or computer-generated looking. No prop or ribbon passes under, behind or over the card.`;

const keyText = (k) => `pure chroma-key ${KEYS[k].label.toLowerCase()} colour (${KEYS[k].hex})`;

// props: prompt phrases; colours: colour names; scatter: a sparse sprinkle around the card ('' for none);
// backdrop: '' means the type's fallback.
export function buildPrompt({ type, surface, props, colours, key, scatter = '', backdrop = '' }) {
  const t = TYPES[type];
  if (t.layout) return '';
  const hero = t.keys === 2 ? 'the cards' : t.target === 'screen' ? 'the phone' : 'the card';
  let propsText = 'Keep the surface simple, with no other props.';
  if (props.length && t.edgeProps) {
    propsText = EDGE_PROPS(joinList(props));
    if (colours.length) propsText += ` Props in a palette of ${joinList(colours)}.`;
  } else if (props.length) {
    // Close, cropped, overlapping and uneven: one prop per corner with bare surface between reads as staged.
    propsText = `A few props, styled loosely and asymmetrically as if casually set down, sit close around ${hero} and run off the edges of the frame, so each one is partly cropped. They overlap each other and are never lined up, centred or evenly spaced: ${joinList(props)}. Every prop is a real, photographed object at its true real-world size next to a 5x7 inch card, never oversized or toy-like. Only a little bare surface shows. No prop or ribbon passes under, behind or over ${hero}; each stays clear of its edges.`;
    if (colours.length) propsText += ` Props in a palette of ${joinList(colours)}.`;
  }
  if (scatter.trim()) propsText += ` A sparse scatter of ${scatter.trim()} lies on the surface around ${hero}, a few pieces only, never on it.`;
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
  return `${scene} ${blank} Nothing lies on top of the ${target} or covers any part of it. ${noText} ${reference}`;
}
