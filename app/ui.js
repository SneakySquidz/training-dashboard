// DOM + chart helpers shared by the views.
import { esc } from './util.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

export const STATE_LABEL = { good: 'Normal', caution: 'Watch', poor: 'Off', missing: 'No data', stale: 'Stale' };
export const STATE_TONE = { good: 'good', caution: 'warn', poor: 'bad', missing: '', stale: '' };
export const badge = (text, tone = '') => `<span class="badge ${tone}">${esc(text)}</span>`;
export const SOURCE_LABEL = { garmin: 'Garmin', 'garmin-export': 'Garmin export', 'apple-health': 'Apple Health', apple: 'Apple Health', renpho: 'Renpho scale', manual: 'Manual entry', demo: 'Demo data', estimated: 'Estimated', csv: 'CSV import' };
export const srcBadge = s => badge(SOURCE_LABEL[s] || s, s === 'demo' ? 'demo' : '');
export const empty = msg => `<div class="empty">${msg}</div>`;

// ---- charts: one registry so theme switches and re-renders destroy old instances ----
const charts = {}, redraw = {};
export function chart(id, cfg) {
  const el = document.getElementById(id); if (!el || !window.Chart) return null;
  charts[id]?.destroy();
  charts[id] = new Chart(el, cfg); return charts[id];
}
export function onRedraw(key, fn) { redraw[key] = fn; fn(); }
export function redrawAll() { Object.values(redraw).forEach(f => { try { f(); } catch (e) { console.error(e); } }); }
export function tipOpts(cb) { return { backgroundColor: css('--surface'), titleColor: css('--text'), bodyColor: css('--text-2'), borderColor: css('--border'), borderWidth: 1, padding: 9, callbacks: cb }; }
export function axes(o = {}) {
  return {
    x: { grid: { display: false }, ticks: { color: css('--text-2'), maxRotation: 0, autoSkipPadding: 12 }, border: { color: css('--border') }, ...(o.x || {}) },
    y: { grid: { color: css('--grid') }, ticks: { color: css('--text-2') }, border: { display: false }, ...(o.y || {}) },
    ...(o.extra || {}),
  };
}
export function opts(o) {
  return Object.assign({ responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false } } }, o);
}

// ---- Leaflet, loaded only when a map is first needed ----
let leaflet;
export function loadLeaflet() {
  if (!leaflet) leaflet = new Promise((res, rej) => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'vendor/leaflet-1.9.4.css'; document.head.appendChild(l);
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    s.onload = () => res(window.L); s.onerror = () => rej(new Error('Map library failed to load')); document.head.appendChild(s);
  });
  return leaflet;
}
const maps = {};
// Two base layers: topo for terrain and climbs, streets for roads and place names. Remembered per device.
export async function map(id) {
  const L = await loadLeaflet(); const el = document.getElementById(id); if (!el) return null;
  if (maps[id] && maps[id]._container === el) return maps[id];
  maps[id]?.remove();
  const m = L.map(el, { scrollWheelZoom: false, attributionControl: true }).setView([41.4, 2.15], 10);
  const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '© OpenStreetMap, SRTM | OpenTopoMap' });
  const streets = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' });
  const pick = (LS_get('basemap', 'topo') === 'streets') ? streets : topo;
  pick.addTo(m);
  L.control.layers({ 'Terrain': topo, 'Streets': streets }, null, { position: 'topright', collapsed: false }).addTo(m);
  m.on('baselayerchange', e => LS_set('basemap', e.name === 'Streets' ? 'streets' : 'topo'));
  m.on('focus', () => m.scrollWheelZoom.enable()); m.on('blur', () => m.scrollWheelZoom.disable());
  return (maps[id] = m);
}
const LS_get = (k, d) => { try { return JSON.parse(localStorage.getItem('gd.' + k)) ?? d; } catch { return d; } };
const LS_set = (k, v) => { try { localStorage.setItem('gd.' + k, JSON.stringify(v)); } catch { } };

/** A route drawn for readability: white casing under the colour, start (green) and finish (dark) markers. */
export function routeLayer(L, line, color, label = '') {
  const casing = L.polyline(line, { color: '#fff', weight: 8, opacity: .9, lineJoin: 'round', lineCap: 'round' });
  const main = L.polyline(line, { color, weight: 4.5, opacity: 1, lineJoin: 'round', lineCap: 'round' });
  const start = L.circleMarker(line[0], { radius: 6, color: '#fff', weight: 2, fillColor: '#1a7f37', fillOpacity: 1 }).bindTooltip(`${label ? label + ': ' : ''}start`);
  const end = L.circleMarker(line[line.length - 1], { radius: 6, color: '#fff', weight: 2, fillColor: '#0b0b0b', fillOpacity: 1 }).bindTooltip(`${label ? label + ': ' : ''}finish`);
  return L.featureGroup([casing, main, start, end]);
}
export const invalidateMaps = () => Object.values(maps).forEach(m => m.invalidateSize());
export function fit(m, b) { const f = () => { m.invalidateSize(); m.fitBounds(b, { padding: [20, 20] }); }; f(); setTimeout(f, 250); }

// ---- sortable table helper ----
/** cols: [{k,label,v:row=>sortValue,f:row=>html,cls}] */
export function table(el, rows, cols, state, onRow) {
  const sorted = rows.slice().sort((a, b) => { const c = cols.find(c => c.k === state.key); const x = c.v(a), y = c.v(b); return (x < y ? -1 : x > y ? 1 : 0) * (state.dir === 'asc' ? 1 : -1); });
  el.innerHTML = `<thead><tr>${cols.map(c => `<th class="${c.cls || ''}" ${c.v ? `aria-sort="${state.key === c.k ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"` : ''}>${c.v ? `<button data-k="${c.k}">${c.label}</button>` : c.label}</th>`).join('')}</tr></thead>
  <tbody>${sorted.map(r => `<tr class="${onRow ? 'click' : ''}" ${onRow ? `tabindex="0" data-id="${r.id}"` : ''}>${cols.map(c => `<td class="${c.cls || ''}">${c.f(r)}</td>`).join('')}</tr>`).join('')}</tbody>`;
  $$('th button', el).forEach(b => b.onclick = () => { const k = b.dataset.k; state.dir = state.key === k && state.dir === 'desc' ? 'asc' : 'desc'; state.key = k; table(el, rows, cols, state, onRow); });
  if (onRow) $$('tr.click', el).forEach(tr => { tr.onclick = () => onRow(tr.dataset.id); tr.onkeydown = e => { if (e.key === 'Enter') onRow(tr.dataset.id); }; });
}

export function download(name, text, type = 'text/plain') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
