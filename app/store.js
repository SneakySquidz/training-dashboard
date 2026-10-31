// Data layer: loads every source, merges into the internal schemas, records provenance and freshness.
// Sources, in priority order for the same date:  manual > renpho/csv import > garmin (encrypted sync) > demo.
import { normGarminActivity, dailyBody } from './model.js';
import { addDays, isoD } from './util.js';

const LS = {
  get(k, d) { try { const v = localStorage.getItem('gd.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('gd.' + k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem('gd.' + k); } catch { } },
};
export { LS };

const getJSON = async (u, opt) => { const r = await fetch(u, { cache: 'no-cache', ...opt }); if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`); return r.json(); };

// ---------- encrypted health bundle (AES-256-GCM, PBKDF2-SHA256) ----------
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export async function decryptBundle(enc, pass) {
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(enc.salt), iterations: enc.iter, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(enc.iv) }, key, b64(enc.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

/** Same format as scripts/fetch.py encrypt(): the daily job can decrypt it with HEALTH_PASSPHRASE. */
export async function encryptBundle(obj, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), iter = 310000;
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
  const b = u => btoa(String.fromCharCode(...u));
  return { v: 1, alg: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iter, salt: b(salt), iv: b(iv), ct: btoa(Array.from(ct, c => String.fromCharCode(c)).join('')), syncedAt: obj.syncedAt };
}

// ---------- demo data: deterministic, clearly flagged, never mixed with real rows of the same kind ----------
function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
export function demoData(acts, today, days = 120) {
  const r = rng(42), wellness = [], body = [];
  const load = {}; acts.forEach(a => load[a.date] = (load[a.date] || 0) + (a.trimp || 0));
  let w = 74.0, mus = 34.0, hrvCarry = 0;
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(today, -i), y = load[addDays(d, -1)] || 0;
    hrvCarry = hrvCarry * 0.6 + y / 25;
    const sleep = 6.1 + r() * 2.0 - (r() < 0.12 ? 1.2 : 0);
    wellness.push({
      date: d, source: 'demo',
      hrv: Math.round(58 - hrvCarry + (r() - 0.5) * 10 + (sleep - 7) * 2),
      rhr: Math.round(52 + hrvCarry / 3 + (r() - 0.5) * 3),
      sleepS: Math.round(sleep * 3600), sleepScore: Math.round(Math.min(95, 45 + (sleep - 5) * 15 + (r() - 0.5) * 10)),
      stress: Math.round(22 + r() * 30), bbWake: Math.round(Math.min(100, 40 + (sleep - 5) * 18 - hrvCarry + r() * 10)),
      steps: Math.round(6000 + r() * 8000), resp: 14 + Math.round(r() * 20) / 10, spo2: 95 + Math.round(r() * 3),
    });
    w += (r() - 0.52) * 0.35 - y / 4000; mus += (r() - 0.5) * 0.12;
    if (r() < 0.7) body.push({ date: d, time: '07:3' + Math.floor(r() * 10), source: 'demo', weightKg: +w.toFixed(1), bmi: +(w / 1.78 ** 2).toFixed(1), fatPct: +(17 + (w - 74) * 0.6 + (r() - 0.5)).toFixed(1), muscleKg: +mus.toFixed(1), visceral: 7, boneKg: 3.2, waterPct: +(57 + (r() - 0.5) * 2).toFixed(1), bmrKcal: Math.round(1650 + (w - 74) * 15), proteinPct: +(18 + (r() - 0.5)).toFixed(1) });
  }
  return { wellness, body };
}

// ---------- main loader ----------
export async function load() {
  const errors = [];
  const safe = async (u, fallback) => { try { return await getJSON(u); } catch (e) { errors.push(e.message); return fallback; } };
  const [rawActs, meta, cfg, ev, healthEnc] = await Promise.all([
    safe('data/activities.json', []), safe('data/meta.json', {}), safe('config.json', {}), safe('data/events.json', { events: [], calendars: [] }),
    fetch('data/health.enc.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null),
  ]);
  const acts = rawActs.map(normGarminActivity).sort((a, b) => b.start.localeCompare(a.start));
  applyRideOverrides(acts);
  return { acts, meta, cfg, events: ev, healthEnc, errors };
}

/** User-set ride types (e.g. Garmin's generic "cycling" that was really MTB). Stored per device. */
export function applyRideOverrides(acts) {
  const o = LS.get('rideType', {});
  for (const a of acts) {
    if (a.sport !== 'ride') continue;
    a.rideTypeGarmin ??= a.rideType;
    a.rideType = o[a.id] || a.rideTypeGarmin;
    a.ebike = ['emtb', 'ebike'].includes(a.rideType) || /^e_?bike/.test(a.type);
    if (a.rideType === 'commute' && /^e_?bike/.test(a.type)) a.ebike = true;
  }
  return acts;
}

/** Build the wellness/body view from the sources currently available. */
export function compose(base, health, today) {
  const settings = LS.get('settings', { demo: 'off' });
  const manualBody = LS.get('body.manual', []);
  const importedBody = LS.get('body.import', []);
  const importedWell = LS.get('wellness.import', []);
  const apple = LS.get('apple.import', null);
  // Later sources win field by field: Garmin (live sync, then the Garmin export) over Apple Health.
  const real = {
    wellness: mergeByDate([...(health?.appleWellness || []), ...(apple?.wellness || []), ...(health?.wellness || []), ...importedWell]),
    body: [...(apple?.body || []), ...(health?.body || []), ...importedBody, ...manualBody],
  };
  const useDemo = false;  // real data only; demoData() is kept for the tests
  const demo = useDemo ? demoData(base.acts, today) : { wellness: [], body: [] };
  const wellness = real.wellness.length ? real.wellness : demo.wellness;
  const body = dailyBody(real.body.length ? real.body : demo.body);
  const lastW = wellness[wellness.length - 1];
  return {
    ...base, wellness, body, demo: { wellness: !real.wellness.length && useDemo, body: !real.body.length && useDemo },
    health, healthSynced: health?.syncedAt || null, lastWellness: lastW?.date || null,
    manualBody, importedBody, importedWell, settings, garminFitness: LS.get('garmin.fitness', null) || health?.fitness || null, importedApple: apple,
  };
}

function mergeByDate(rows) {
  const by = {}; for (const r of rows) by[r.date] = { ...(by[r.date] || {}), ...Object.fromEntries(Object.entries(r).filter(([, v]) => v != null)) };
  return Object.values(by).sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- tracks: concurrent, cached, failure-tolerant ----------
const tcache = {};
export function track(id) {
  if (!tcache[id]) tcache[id] = fetch(`data/tracks/${id}.json`).then(r => r.ok ? r.json() : null).catch(() => null);
  return tcache[id];
}
export async function tracks(ids, conc = 6) {
  const out = {}; let i = 0;
  await Promise.all(Array.from({ length: conc }, async () => { while (i < ids.length) { const id = ids[i++]; out[id] = await track(id); } }));
  return out;
}

export const today = () => isoD(new Date());
