// What each data source holds and how current it is. Pure: the Home page and the tests both use it.
import { addDays } from './util.js';

const GARMIN = [['rhr', 'resting HR'], ['stress', 'stress'], ['bbWake', 'Body Battery'], ['steps', 'steps'], ['sleepS', 'sleep nights']];
const APPLE = [['rhr', 'resting HR'], ['hrAvg', 'avg HR'], ['steps', 'steps'], ['sleepS', 'sleep nights'], ['inBedS', 'in-bed nights'], ['hrvSdnn', 'HRV days']];
const has = (r, fields) => fields.some(([f]) => r[f] != null);

/** "260 resting HR · 324 stress": counts per metric, skipping metrics with no days. */
export function metricLine(rows, fields) {
  return fields.map(([f, label]) => [rows.filter(r => r[f] != null).length, label]).filter(([n]) => n)
    .map(([n, label]) => `${n.toLocaleString('en-GB')} ${label}`).join(' · ');
}

/** One entry per source: {key, name, state: ok | stale | locked | none, last, days, detail}. */
export function sourceStatus(D, apple, today) {
  const locked = !D.health && !!D.healthEnc;
  const garminRows = [...(D.health?.wellness || []), ...(D.importedWell || []).filter(r => r.source === 'garmin-export')];
  const appleRows = [...(D.health?.appleWellness || []), ...(apple?.wellness || [])];
  const renphoRows = (D.health?.body || []).filter(r => r.source === 'renpho');
  const latest = rows => rows.reduce((m, r) => (r.date > (m || '') ? r.date : m), null);
  const state = (last, days, isLocked) => isLocked && !days ? 'locked' : !days ? 'none' : last < addDays(today, -2) ? 'stale' : 'ok';

  const acts = D.acts || [];
  const act = { key: 'activities', name: 'Garmin activities', days: acts.length, last: acts[0]?.date || null, detail: `${acts.length} activities` };
  act.state = state(act.last, acts.length, false);

  const gRows = garminRows.filter(r => has(r, GARMIN));
  const garmin = { key: 'garmin', name: 'Garmin health', days: gRows.length, last: latest(gRows), detail: metricLine(gRows, GARMIN) };
  garmin.state = state(garmin.last, gRows.length, locked);

  const aRows = appleRows.filter(r => has(r, APPLE));
  const appleS = { key: 'apple', name: 'Apple Health', days: aRows.length, last: latest(aRows), detail: metricLine(aRows, APPLE) };
  appleS.state = state(appleS.last, aRows.length, locked && !(apple?.wellness?.length));

  const renpho = { key: 'renpho', name: 'Renpho scale', days: renphoRows.length, last: latest(renphoRows), detail: `${renphoRows.length} weigh-ins` };
  renpho.state = state(renpho.last, renphoRows.length, locked);

  return [act, garmin, appleS, renpho];
}
