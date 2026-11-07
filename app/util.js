// Small pure helpers shared by the engine and the UI. No DOM access here.
export const DAY = 864e5;
export const isoD = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (iso, n) => { const d = new Date(iso + 'T12:00'); d.setDate(d.getDate() + n); return isoD(d); };
export const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / DAY);
export const sum = (arr, f = x => x) => arr.reduce((s, x) => s + (f(x) || 0), 0);
export const mean = arr => { const v = arr.filter(x => x != null && isFinite(x)); return v.length ? sum(v) / v.length : null; };
export const sd = arr => { const v = arr.filter(x => x != null && isFinite(x)); if (v.length < 2) return null; const m = mean(v); return Math.sqrt(sum(v, x => (x - m) ** 2) / (v.length - 1)); };
export const round = (v, d = 0) => v == null ? null : Math.round(v * 10 ** d) / 10 ** d;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const hm = s => { s = Math.round(s || 0); return `${Math.floor(s / 3600)} h ${String(Math.floor(s % 3600 / 60)).padStart(2, '0')} min`; };
export const hmShort = s => { s = Math.round(s || 0); return `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}`; };
export const n0 = v => v == null ? '–' : Math.round(v).toLocaleString('en-GB');
export const n1 = v => v == null ? '–' : v.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fdate = d => new Date(d.slice(0, 10) + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const fshort = d => new Date(d.slice(0, 10) + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const fweekday = d => new Date(d.slice(0, 10) + 'T12:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
/** Values on dates in [from, to] inclusive. rows must have .date */
export const between = (rows, from, to) => rows.filter(r => r.date >= from && r.date <= to);
