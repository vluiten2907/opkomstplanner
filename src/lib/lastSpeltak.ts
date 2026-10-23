/**
 * De laatst geopende speltak op dit apparaat (de startpagina gaat daar meteen heen).
 * Opslag kan geblokkeerd zijn (bijv. "alle cookies blokkeren"): dan onthouden we gewoon niets, zonder fout.
 */
const KEY = 'opk.sid';
export const lastSpeltak = {
  get: (): string | null => { try { return localStorage.getItem(KEY); } catch { return null; } },
  set: (sid: string) => { try { localStorage.setItem(KEY, sid); } catch { /* geen opslag */ } },
  clear: () => { try { localStorage.removeItem(KEY); } catch { /* geen opslag */ } },
  /** Vergeten, als het (nog) deze speltak is. */
  clearIf: (sid: string) => { try { if (localStorage.getItem(KEY) === sid) localStorage.removeItem(KEY); } catch { /* geen opslag */ } },
};
