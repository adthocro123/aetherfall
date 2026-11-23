// Progress lives in this browser's localStorage. If storage is blocked the game still runs; it just forgets.
const KEY = 'aetherfall.save.v1';

export const Save = {
  read() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch { return null; } },
  write(data) { try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch { return false; } },
  clear() { try { localStorage.removeItem(KEY); } catch {} },
  name() { try { return localStorage.getItem('aetherfall.name') || ''; } catch { return ''; } },
  setName(n) { try { localStorage.setItem('aetherfall.name', n); } catch {} },
  settings() { try { return JSON.parse(localStorage.getItem('aetherfall.settings') || '{}'); } catch { return {}; } },
  setSettings(s) { try { localStorage.setItem('aetherfall.settings', JSON.stringify(s)); } catch {} },
};
