// Ride analytics: aggregates, best efforts, fitness/fatigue, maintenance. Pure functions.
import { addDays, daysBetween, isoD, sum, mean } from './util.js';

export const EFFORT_KM = [10, 20, 40, 60, 100];
export const POWER_S = [60, 300, 1200, 3600];

/** Fastest window covering `km` inside one ride, from cumulative distance (km) + elapsed time (s).
 *  Tracks are downsampled to ~300 points, so windows are interpolated and labelled "estimated". */
export function fastestWindow(dist, time, km) {
  const n = Math.min(dist.length, time.length); if (n < 2) return null;
  const D = [], T = []; for (let i = 0; i < n; i++) if (dist[i] != null && time[i] != null) { D.push(dist[i]); T.push(time[i]); }
  if (!D.length || D[D.length - 1] - D[0] < km) return null;
  let best = null, j = 0;
  for (let i = 0; i < D.length; i++) {
    while (j < D.length && D[j] - D[i] < km) j++;
    if (j >= D.length) break;
    const f = (D[i] + km - D[j - 1]) / ((D[j] - D[j - 1]) || 1); // interpolate the crossing point
    const t = T[j - 1] + f * (T[j] - T[j - 1]) - T[i];
    if (t > 0 && (!best || t < best)) best = t;
  }
  return best;
}

export function bestPower(power, time, secs) {
  if (!power?.length || !time?.length) return null;
  const n = Math.min(power.length, time.length);
  const step = (time[n - 1] - time[0]) / (n - 1);
  if (!(step > 0) || secs < 3 * step) return null; // can't resolve short durations from coarse samples
  const pre = [0]; for (let i = 0; i < n; i++) pre.push(pre[i] + (power[i] || 0));
  let best = null, j = 0;
  for (let i = 0; i < n; i++) {
    if (j < i) j = i;
    while (j < n - 1 && time[j] - time[i] < secs) j++;
    if (time[j] - time[i] < secs) break;
    const avg = (pre[j + 1] - pre[i]) / (j - i + 1);
    if (best == null || avg > best) best = avg;
  }
  return best;
}

/** Best efforts across rides. tracks: {id: track}. Separate pools for assisted (eBike) and unassisted. */
export function bestEfforts(rides, tracks) {
  const pools = { unassisted: rides.filter(r => !r.ebike && !r.indoor), ebike: rides.filter(r => r.ebike), indoor: rides.filter(r => r.indoor) };
  const out = {};
  for (const [k, list] of Object.entries(pools)) {
    if (!list.length) continue;
    const longest = list.reduce((b, r) => r.distKm > b.distKm ? r : b, list[0]);
    const climb = list.reduce((b, r) => r.elevM > b.elevM ? r : b, list[0]);
    const eff = EFFORT_KM.map(km => {
      let best = null, src = null, est = 'segment';
      for (const r of list) {
        const t = tracks[r.id];
        const s = t?.time ? fastestWindow(t.dist, t.time, km) : null;
        if (s && (!best || s < best)) { best = s; src = r; }
      }
      if (!best) { // fall back to whole-ride average speed for rides at least this long
        const cand = list.filter(r => r.distKm >= km && r.movS > 0);
        const r = cand.reduce((b, r) => (r.distKm / r.movS) > (b ? b.distKm / b.movS : 0) ? r : b, null);
        if (r) { best = km / (r.distKm / r.movS); src = r; est = 'ride-average'; }
      }
      return { km, s: best, ride: src, est };
    });
    const power = POWER_S.map(secs => {
      let best = null, src = null;
      for (const r of list) { const t = tracks[r.id]; const p = t?.power ? bestPower(t.power, t.time, secs) : null; if (p && (!best || p > best)) { best = p; src = r; } }
      return { secs, w: best, ride: src };
    });
    out[k] = { count: list.length, longest, climb, eff, power, hasPower: power.some(p => p.w) };
  }
  return out;
}

/** Weekly / monthly aggregates. key: 'week' (ISO Monday) or 'month' */
export function aggregate(rides, key, n, today) {
  const start = key === 'week' ? mondayOf(addDays(today, -7 * (n - 1))) : `${monthShift(today, -(n - 1))}-01`;
  const buckets = [];
  if (key === 'week') for (let i = 0; i < n; i++) buckets.push(addDays(start, 7 * i));
  else for (let i = n - 1; i >= 0; i--) buckets.push(monthShift(today, -i));
  const k = r => key === 'week' ? mondayOf(r.date) : r.date.slice(0, 7);
  const by = Object.fromEntries(buckets.map(b => [b, []]));
  for (const r of rides) { const b = k(r); if (by[b]) by[b].push(r); }
  return buckets.map(b => {
    const l = by[b]; const z = [0, 1, 2, 3, 4].map(i => sum(l, r => r.zones?.[i]));
    return { key: b, rides: l.length, km: sum(l, r => r.distKm), h: sum(l, r => r.durS) / 3600, elev: sum(l, r => r.elevM), trimp: sum(l, r => r.trimp), low: z[0] + z[1], mid: z[2], high: z[3] + z[4] };
  });
}
export const mondayOf = d => { const x = new Date(d + 'T12:00'); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return isoD(x); };
const monthShift = (d, n) => { const x = new Date(d.slice(0, 7) + '-15T12:00'); x.setMonth(x.getMonth() + n); return isoD(x).slice(0, 7); };

/** Banister-style fitness (42 d EWMA), fatigue (7 d EWMA), form = fitness − fatigue, on TRIMP from ALL
 *  activities (the body doesn't care which sport). Returns {series, reliable, reason}. */
export function pmc(acts, today, days = 120) {
  const from = addDays(today, -(days + 42));
  const daily = {}; for (const a of acts) if (a.date >= from && a.date <= today) daily[a.date] = (daily[a.date] || 0) + (a.trimp || 0);
  let ctl = 0, atl = 0; const series = [];
  for (let d = from; d <= today; d = addDays(d, 1)) {
    const l = daily[d] || 0; ctl += (l - ctl) / 42; atl += (l - atl) / 7;
    if (d > addDays(today, -days)) series.push({ date: d, ctl, atl, tsb: ctl - atl });
  }
  // Reliability: needs HR on most sessions and no long recording gaps in the last 12 weeks.
  const recent = acts.filter(a => a.date > addDays(today, -84));
  const weeks = new Set(recent.map(a => mondayOf(a.date))).size;
  const hrShare = recent.length ? recent.filter(a => a.trimp != null).length / recent.length : 0;
  const reliable = weeks >= 9 && hrShare >= 0.8;
  const reason = reliable ? '' : `Needs activity in at least 9 of the last 12 weeks with heart rate on 80%+ of sessions. You have ${weeks}/12 weeks and ${Math.round(hrShare * 100)}% with HR. Unrecorded training would make "fitness" look lower than it is.`;
  return { series, reliable, reason, weeks, hrShare };
}

// ---------------- maintenance ----------------
// Intervals are practical defaults for dry-ish Mediterranean riding. eMTB drivetrains wear faster
// (more torque), so chain intervals are shorter for eBikes.
export const TASKS = [
  { id: 'lube', name: 'Chain clean & lube', km: 200, kmE: 150, days: 30, tip: 'Sooner after wet or dusty rides. Wipe off the excess.' },
  { id: 'chain', name: 'Chain wear check / replace', km: 1000, kmE: 700, days: 120, tip: 'Use a wear checker: replace at 0.5% (11-speed+) to protect the cassette.' },
  { id: 'cassette', name: 'Cassette & chainring check', km: 3000, kmE: 2000, days: 365, tip: 'Look for shark-fin teeth and chain skip under load.' },
  { id: 'pads', name: 'Brake pads check', km: 500, kmE: 400, days: 90, tip: 'Replace below ~1 mm of pad material, or if they squeal and lose bite.' },
  { id: 'tyres', name: 'Tyre pressure check', km: null, days: 7, tip: 'Before each ride ideally. Tubeless loses pressure slowly.' },
  { id: 'sealant', name: 'Tubeless sealant refresh', km: null, days: 90, tip: 'Dries faster in heat: every 2–3 months in summer.' },
  { id: 'service', name: 'Full service', km: 3000, kmE: 2000, days: 365, tip: 'Bearings, cables, suspension, bolts torque check.' },
];

/** status for one task: {kmSince, daysSince, pct, state:'ok'|'soon'|'due'|'unset'} */
export function taskStatus(task, last, rides, today, ebike) {
  if (!last) return { state: 'unset' };
  const since = rides.filter(r => r.date >= last.date && !r.indoor);
  const kmSince = sum(since, r => r.distKm), daysSince = daysBetween(last.date, today);
  const kmLim = task.km == null ? null : (ebike ? task.kmE : task.km);
  const pct = Math.max(kmLim ? kmSince / kmLim : 0, task.days ? daysSince / task.days : 0);
  return { kmSince, daysSince, kmLim, pct, state: pct >= 1 ? 'due' : pct >= 0.8 ? 'soon' : 'ok' };
}

/** Speed + splits from a v2 track. Returns null without time data. */
export function splits(t, every = 5) {
  if (!t?.time || !t.dist) return null;
  const out = []; let next = every, i0 = 0;
  for (let i = 1; i < t.dist.length; i++) {
    if (t.dist[i] == null || t.time[i] == null) continue;
    if (t.dist[i] >= next || i === t.dist.length - 1) {
      const dk = t.dist[i] - t.dist[i0], dt = t.time[i] - t.time[i0];
      const hr = mean(t.hr?.slice(i0, i + 1) || []);
      const el = (t.elev || []).slice(i0, i + 1).filter(x => x != null);
      let gain = 0; for (let k = 1; k < el.length; k++) if (el[k] > el[k - 1]) gain += el[k] - el[k - 1];
      if (dk > 0.2) out.push({ to: t.dist[i], km: dk, s: dt, kmh: dt ? dk / dt * 3600 : null, hr, gain });
      i0 = i; next += every;
    }
  }
  return out;
}
