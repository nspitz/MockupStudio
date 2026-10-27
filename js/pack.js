// A design's props pack: theme-matched surface, props, scatter, party and wall, written per design
// outside this app and pasted in as JSON. Only text, never the design itself (R1).

import { NAMED } from './palette.js';

const str = (v) => (typeof v === 'string' ? v.trim() : '');

// Returns a clean pack, or throws with a message fit to show the user.
export function parsePack(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error("That isn't valid JSON. Paste the whole props pack, including the { } braces."); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('A props pack is a JSON object with at least a "props" list.');
  const props = Array.isArray(raw.props) ? raw.props.map(str).filter(Boolean) : [];
  if (!props.length) throw new Error('The pack has no "props" list.');
  return {
    name: str(raw.name) || 'Unnamed design',
    surface: str(raw.surface),
    props,
    // Optional lighter set for Main only; empty means Main uses props.
    mainProps: Array.isArray(raw.mainProps) ? raw.mainProps.map(str).filter(Boolean) : [],
    // Sparse small pieces on the surface around the card (stars, confetti); never on it.
    scatter: str(raw.scatter),
    party: str(raw.party),
    wall: str(raw.wall),
    colours: Array.isArray(raw.colours) ? raw.colours.map(str).filter(Boolean) : [],
  };
}

// The pack's props for one shot type: Main takes mainProps when the pack has them.
export function packProps(pack, type) {
  return type === 'main' && pack.mainProps?.length ? pack.mainProps : pack.props;
}

// Pack colour names as chips. Names from the palette list get a swatch and count for the key choice.
export function packColours(pack) {
  return pack.colours.map((name) => {
    const n = NAMED.find((x) => x[0] === name.toLowerCase());
    const rgb = n ? n.slice(1) : null;
    return { name, rgb, hex: rgb ? `rgb(${rgb.join(',')})` : 'transparent' };
  });
}
