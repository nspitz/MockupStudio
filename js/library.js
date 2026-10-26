// Saved designs: a library file (front, back and props pack per design) imported once and kept
// in this browser's IndexedDB. Nothing is uploaded; the files never live in this public repo.
// If IndexedDB is unavailable (private mode), the library lasts until the page is closed.

import { parsePack } from './pack.js';

const DB = 'mockup-studio', STORE = 'designs';
const memory = new Map();

// Gives up after 3s: a blocked or stalled database falls back to memory instead of hanging the page.
function open() {
  return new Promise((resolve, reject) => {
    setTimeout(() => reject(new Error('IndexedDB timed out')), 3000);
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'slug' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// { result } when IndexedDB worked, null when it didn't.
async function run(mode, fn) {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve({ result: req?.result });
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return null;
  }
}

function blobOf(dataUrl) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || '');
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}

// [{ slug, name }], by name.
export async function listDesigns() {
  const all = [...((await run('readonly', (s) => s.getAll()))?.result || []), ...memory.values()];
  return all.map(({ slug, name }) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name));
}

// { slug, name, front: Blob, back: Blob|null, pack: object|null }
export async function getDesign(slug) {
  return (await run('readonly', (s) => s.get(slug)))?.result || memory.get(slug) || null;
}

// Adds or replaces every design in the file (by slug). Returns { count, kept }: kept is false
// when the browser wouldn't store them, so they last only until the page closes.
export async function importLibrary(file) {
  let raw;
  try { raw = JSON.parse(await file.text()); } catch { throw new Error("That isn't a library file. Choose the mockup-library.json Claude made."); }
  if (raw?.format !== 'mockup-studio-library' || !Array.isArray(raw.designs)) throw new Error("That isn't a Mockup Studio library file.");
  const designs = raw.designs.map((d) => {
    const front = blobOf(d.front);
    if (!d.slug || !front) throw new Error(`Design "${d.slug || '?'}" has no front image.`);
    let pack = null;
    try { pack = d.pack ? parsePack(JSON.stringify(d.pack)) : null; } catch { /* keep the images, skip a bad pack */ }
    return { slug: String(d.slug), name: String(d.name || d.slug), front, back: blobOf(d.back), pack };
  });
  const saved = await run('readwrite', (s) => { for (const d of designs) s.put(d); return null; });
  if (!saved) for (const d of designs) memory.set(d.slug, d);
  return { count: designs.length, kept: !!saved };
}
