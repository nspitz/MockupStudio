// On-device memory (this browser only): custom props, the current props pack and the last choices
// per mockup type. Storage can be missing or blocked (private mode), so everything falls back to defaults.

const KEY = 'mockup-studio-prefs-v1';

export function loadPrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* use defaults */ }
  return { lastType: 'main', customProps: [], byType: {}, pack: null, ...p };
}

export function savePrefs(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* not saved; still works this session */ }
}
