// Boot, routing, and render orchestration. Views render lazily: only the visible tab is built.
// Navigation is two-level: a section (Home, Activities, Health & nutrition, Events) and, inside it, its pages.
import * as store from './store.js';
import { assess } from './engine.js';
import { renderHome, ICON } from './view-home.js';
import { renderTips, renderNutrition } from './view-health.js';
import { renderReadiness } from './view-readiness.js';
import { renderBike } from './view-bike.js';
import { renderBody } from './view-body.js';
import { renderActivities, renderTrips } from './view-activities.js';
import { renderData } from './view-data.js';
import { renderEvents } from './view-events.js';
import { $, $$, badge, redrawAll, invalidateMaps } from './ui.js';
import { esc } from './util.js';

const GROUPS = [
  { id: 'home', label: 'Home', icon: 'home', pages: [['home', 'Home']] },
  { id: 'act', label: 'Activities', icon: 'act', pages: [['bike', 'Bicycle'], ['activities', 'All activities'], ['trips', 'Trips']] },
  { id: 'health', label: 'Health & nutrition', short: 'Health', icon: 'heart', pages: [['readiness', 'Readiness'], ['body', 'Body'], ['nutrition', 'Nutrition'], ['tips', 'Plan & tips']] },
  { id: 'events', label: 'Events', icon: 'flag', pages: [['events', 'Events']] },
];
const TABS = [...GROUPS.flatMap(g => g.pages.map(p => p[0])), 'data'];
const groupOf = tab => GROUPS.find(g => g.pages.some(p => p[0] === tab)) || null;
// Old links keep working.
const ALIAS = { today: 'home', overview: 'home', improve: 'tips', hrp: 'trips', barcelona: 'events' };
let BASE, D, R, current, PASS = null; // PASS: the unlock passphrase, kept in memory only for this tab

// ---------- navigation chrome ----------
$('#tabs').innerHTML = GROUPS.map(g => `<a href="#${g.pages[0][0]}" data-g="${g.id}"><span class="ic">${ICON[g.icon]}</span><span class="lbl-l">${esc(g.label)}</span><span class="lbl-s">${esc(g.short || g.label)}</span></a>`).join('');
function navState(tab) {
  const g = groupOf(tab);
  $$('#tabs a').forEach(a => a.setAttribute('aria-current', a.dataset.g === g?.id ? 'page' : 'false'));
  const sub = $('#subnav');
  if (g && g.pages.length > 1) {
    sub.hidden = false;
    sub.innerHTML = `<div class="in"><span class="sub-t">${esc(g.label)}</span>${g.pages.map(([k, l]) => `<a href="#${k}" aria-current="${k === tab ? 'page' : 'false'}">${esc(l)}</a>`).join('')}</div>`;
  } else if (tab === 'data') {
    sub.hidden = false; sub.innerHTML = `<div class="in"><span class="sub-t">Settings</span><a href="#data" aria-current="page">Data &amp; privacy</a></div>`;
  } else { sub.hidden = true; sub.innerHTML = ''; }
  $('#datalink').setAttribute('aria-current', tab === 'data' ? 'page' : 'false');
  const page = g?.pages.find(p => p[0] === tab)?.[1] || 'Data & privacy';
  document.title = tab === 'home' ? 'Training Dashboard' : `${page} · Training Dashboard`;
}

// ---------- theme ----------
const themes = ['auto', 'light', 'dark'];
function applyTheme(t) {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
  $('#theme').title = 'Theme: ' + t; $('#theme').setAttribute('aria-label', 'Theme: ' + t); $('#theme').dataset.t = t;
  store.LS.set('theme', t); redrawAll();
}
$('#theme').onclick = () => applyTheme(themes[(themes.indexOf(store.LS.get('theme', 'auto')) + 1) % 3]);
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => redrawAll());
addEventListener('stylepanel:change', () => redrawAll()); // 🎨 panel changed a colour

// ---------- routing ----------
function parse() { const [h, ...rest] = location.hash.slice(1).split('/'); const tab = ALIAS[h] || (TABS.includes(h) ? h : 'home'); return [tab, rest.join('/')]; }
function show(tab, arg) {
  current = tab;
  navState(tab);
  TABS.forEach(t => $('#' + t).hidden = t !== tab);
  const V = {
    home: () => renderHome(D, R), tips: () => renderTips(D, R), nutrition: () => renderNutrition(D, R),
    readiness: () => renderReadiness(D, R), bike: () => renderBike(D, arg), body: () => renderBody(D, R, refresh),
    activities: () => renderActivities(D, arg), trips: () => renderTrips(D), events: () => renderEvents(D), data: () => renderData(D, { unlock, refresh, pass: () => PASS }),
  };
  try { V[tab](); } catch (e) { console.error(e); $('#' + tab).innerHTML = `<div class="banner err">This section failed to render: ${esc(e.message)}</div>`; }
  setTimeout(invalidateMaps, 60);
}
addEventListener('data-changed', () => { applyOverrides(); refresh(current); });
function applyOverrides() { store.applyRideOverrides(BASE.acts); }
addEventListener('hashchange', () => { const [t, a] = parse(); if (t !== current || a) { show(t, a); if (!a) scrollTo({ top: 0 }); } });

// ---------- state ----------
function compute(health) {
  const today = store.today();
  D = { ...store.compose(BASE, health, today), today };
  R = assess({ ...D, events: D.events.events || [] }, today);
  header();
}
function header() {
  const bits = [];
  const ago = D.meta.refreshed ? (Date.now() - new Date(D.meta.refreshed)) / 36e5 : null;
  bits.push(badge(`Synced ${D.meta.refreshed ? new Date(D.meta.refreshed).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–'}`, ago > 36 ? 'warn' : ''));
  if (D.demo.wellness) bits.push(badge('Health: demo data', 'demo'));
  else if (D.lastWellness) bits.push(badge(`Health data to ${new Date(D.lastWellness + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`, D.lastWellness < store.today() ? 'warn' : 'good'));
  $('#sync').innerHTML = bits.join('');
  const b = [];
  if (D.demo.wellness || D.demo.body) b.push(`<div class="banner"><b>Demo mode.</b> Sleep, HRV, stress and body data are simulated so you can see how the dashboard works. Activities are real. Connect real data in <a href="#data">Data &amp; privacy</a>.</div>`);
  if (BASE.healthEnc && !D.health) b.push(`<div class="banner">Your synced health data (Renpho weigh-ins) is encrypted. <a href="#data">Unlock it</a> to use it here.</div>`);
  if (ago > 48) b.push(`<div class="banner err">Activity data is ${Math.round(ago / 24)} days old. The daily GitHub Action may be failing.</div>`);
  $('#banners').innerHTML = b.join('');
}
function refresh(tab = current) { compute(D.health); show(tab, tab === current ? parse()[1] : ''); }
async function unlock(pass, remember) {
  try { const h = await store.decryptBundle(BASE.healthEnc, pass); PASS = pass; if (remember) store.LS.set('pass', pass); compute(h); show(current, ''); return true; }
  catch { return false; }
}

// ---------- boot ----------
(async () => {
  applyTheme(store.LS.get('theme', 'auto'));
  BASE = await store.load();
  let health = null;
  const saved = store.LS.get('pass'); if (BASE.healthEnc && saved) { try { health = await store.decryptBundle(BASE.healthEnc, saved); PASS = saved; } catch { store.LS.del('pass'); } }
  compute(health);
  const [tab, arg] = parse(); show(tab, arg);
})().catch(e => { console.error(e); $('#home').innerHTML = `<div class="banner err">Could not load the dashboard: ${esc(e.message)}. Reload, or check that the data files exist.</div>`; });
