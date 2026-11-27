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
import { renderStory } from './view-story.js';
import { renderData } from './view-data.js';
import { renderEvents } from './view-events.js';
import { $, $$, badge, redrawAll, invalidateMaps } from './ui.js';
import { esc } from './util.js';
import { routeFor, unlockKeyFrom, tryKey } from './privacy.js';

const GROUPS = [
  { id: 'home', label: 'Home', icon: 'home', pages: [['home', 'Home']] },
  { id: 'act', label: 'Activities', icon: 'act', pages: [['bike', 'Bicycle'], ['activities', 'All activities'], ['trips', 'Trips'], ['story', 'HRP story']] },
  { id: 'health', label: 'Health & nutrition', short: 'Health', icon: 'heart', pages: [['readiness', 'Readiness'], ['body', 'Body'], ['nutrition', 'Nutrition'], ['tips', 'Plan & tips']] },
  { id: 'events', label: 'Events', icon: 'flag', pages: [['events', 'Events']] },
];
const TABS = [...GROUPS.flatMap(g => g.pages.map(p => p[0])), 'data'];
const groupOf = tab => GROUPS.find(g => g.pages.some(p => p[0] === tab)) || null;
// Old links keep working.
const ALIAS = { today: 'home', overview: 'home', improve: 'tips', hrp: 'trips', barcelona: 'events' };
let BASE, D, R, current, curArg = '', PASS = null; // PASS: the unlock passphrase, kept in memory only for this tab

// ---------- navigation chrome ----------
$('#tabs').innerHTML = GROUPS.map(g => `<a href="#${g.pages[0][0]}" data-g="${g.id}"${g.id === 'health' ? ' class="priv"' : ''}><span class="ic">${ICON[g.icon]}</span><span class="lbl-l">${esc(g.label)}</span><span class="lbl-s">${esc(g.short || g.label)}</span></a>`).join('');
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
function parse() { const [h, ...rest] = location.hash.slice(1).split('/'); if (h === 'hrp') return ['trips', 'hrp']; const tab = ALIAS[h] || (TABS.includes(h) ? h : 'home'); return [tab, rest.join('/')]; }
// Guest = no key on this device (and none typed in this tab): health stays hidden.
const isGuest = () => !PASS;
function setGuest() { document.body.classList.toggle('guest', isGuest()); }
function show(tab, arg) {
  const to = routeFor(tab, isGuest());
  if (to !== tab) { history.replaceState(null, '', location.pathname + location.search + '#' + to); tab = to; arg = ''; }
  current = tab; curArg = arg || '';
  navState(tab);
  TABS.forEach(t => $('#' + t).hidden = t !== tab);
  const V = {
    home: () => renderHome(D, R), tips: () => renderTips(D, R), nutrition: () => renderNutrition(D, R),
    readiness: () => renderReadiness(D, R), bike: () => renderBike(D, arg), body: () => renderBody(D, R, refresh),
    activities: () => renderActivities(D, arg), trips: () => renderTrips(D, arg), story: () => renderStory(arg), events: () => renderEvents(D), data: () => renderData(D, { unlock, refresh, forget, pass: () => PASS }),
  };
  try { V[tab](); } catch (e) { console.error(e); $('#' + tab).innerHTML = `<div class="banner err">This section failed to render: ${esc(e.message)}</div>`; }
  setTimeout(invalidateMaps, 60);
}
addEventListener('data-changed', () => { applyOverrides(); refresh(current); });
function applyOverrides() { store.applyRideOverrides(BASE.acts); }
// curArg: leaving a detail view on the same tab (#trips/hrp → #trips) must re-render the list.
addEventListener('hashchange', async () => { if (unlockKeyFrom(location.hash)) { const h = await unlockFromLink(); compute(h || D.health); show('home', ''); return; } const [t, a] = parse(); if (t !== current || a || curArg) { show(t, a); if (!a) scrollTo({ top: 0 }); } });

// ---------- state ----------
function compute(health) {
  const today = store.today();
  D = { ...store.compose(BASE, health, today), today };
  R = assess({ ...D, events: D.events.events || [] }, today);
  setGuest(); header();
}
function header() {
  const bits = [];
  const ago = D.meta.refreshed ? (Date.now() - new Date(D.meta.refreshed)) / 36e5 : null;
  bits.push(badge(`Synced ${D.meta.refreshed ? new Date(D.meta.refreshed).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–'}`, ago > 36 ? 'warn' : ''));
  const guest = isGuest();
  if (guest) { /* guests see no health badge */ }
  else if (D.demo.wellness) bits.push(badge('Health: demo data', 'demo'));
  else if (D.lastWellness) bits.push(badge(`Health data to ${new Date(D.lastWellness + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`, D.lastWellness < store.today() ? 'warn' : 'good'));
  $('#sync').innerHTML = bits.join('');
  const b = [];
  if (linkMsg) b.push(linkMsg);
  if (!guest && (D.demo.wellness || D.demo.body)) b.push(`<div class="banner"><b>Demo mode.</b> Sleep, HRV, stress and body data are simulated so you can see how the dashboard works. Activities are real. Connect real data in <a href="#data">Data &amp; privacy</a>.</div>`);
  if (!guest && BASE.healthEnc && !D.health) b.push(`<div class="banner">Your synced health data (Renpho weigh-ins) is encrypted. <a href="#data">Unlock it</a> to use it here.</div>`);
  if (ago > 48) b.push(`<div class="banner err">Activity data is ${Math.round(ago / 24)} days old. The daily GitHub Action may be failing.</div>`);
  $('#banners').innerHTML = b.join('');
}
function refresh(tab = current) { compute(D.health); show(tab, tab === current ? parse()[1] : ''); }
async function unlock(pass, remember) {
  try { const h = await store.decryptBundle(BASE.healthEnc, pass); PASS = pass; if (remember) store.LS.set('pass', pass); compute(h); show(current, ''); return true; }
  catch { return false; }
}
function forget() { store.LS.del('pass'); PASS = null; compute(null); show(current, ''); }

// Unlock link (#unlock=<key>): the key leaves the address bar first, then is kept only if it decrypts the bundle.
let linkMsg = '';
async function unlockFromLink() {
  const key = unlockKeyFrom(location.hash);
  if (!key) return null;
  history.replaceState(null, '', location.pathname + location.search + '#home');
  const h = await tryKey(BASE.healthEnc, key, { decrypt: store.decryptBundle, save: k => store.LS.set('pass', k) });
  if (h) { PASS = key; linkMsg = ''; }
  else linkMsg = `<div class="banner err">That unlock link didn't work on this device, so nothing was saved. Check that the whole link was copied.</div>`;
  return h;
}

// ---------- boot ----------
(async () => {
  applyTheme(store.LS.get('theme', 'auto'));
  BASE = await store.load();
  let health = await unlockFromLink();
  const saved = store.LS.get('pass'); if (!health && BASE.healthEnc && saved) { try { health = await store.decryptBundle(BASE.healthEnc, saved); PASS = saved; } catch { store.LS.del('pass'); } }
  compute(health);
  const [tab, arg] = parse(); show(tab, arg);
})().catch(e => { console.error(e); $('#home').innerHTML = `<div class="banner err">Could not load the dashboard: ${esc(e.message)}. Reload, or check that the data files exist.</div>`; });
