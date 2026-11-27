// Apple Health export (iPhone: Health → profile picture → Export All Health Data), read in the browser.
// The file is streamed in pieces, so multi-GB exports work. Nothing is uploaded.
//
// Mapping (per local calendar day, as written in the export):
//   resting HR   → rhr (average of the day's readings)
//   heart rate   → hrAvg, hrMax (all-day readings; shown in the monthly table only)
//   HRV (SDNN)   → hrvSdnn (average). SDNN is not Garmin's RMSSD, so it is stored separately and not used by the readiness baseline.
//   steps        → steps (sum per source; the day takes the source with the most steps, so iPhone + Watch don't double count)
//   sleep        → sleepS (asleep time, merged across sources; assigned to the morning the sleep ends)
//   in bed       → inBedS (time in bed; not sleep, and not used by the readiness engine)
//   body mass    → body rows (latest reading of the day, converted to kg)
import { findEntries, openEntry } from './zip.js';

const RANGE = { hrAvg: [30, 220], hrMax: [30, 230], rhr: [25, 120], hrvSdnn: [5, 300], steps: [0, 100000], sleepS: [0, 16 * 3600], inBedS: [0, 20 * 3600], weightKg: [30, 250] };
const QUANTITY = {
  HKQuantityTypeIdentifierRestingHeartRate: 'rhr',
  HKQuantityTypeIdentifierHeartRate: 'hr',
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: 'hrvSdnn',
  HKQuantityTypeIdentifierStepCount: 'steps',
  HKQuantityTypeIdentifierBodyMass: 'weight',
};
const SLEEP = 'HKCategoryTypeIdentifierSleepAnalysis';

/** Apple's "2026-10-20 07:01:02 +0200" → epoch ms. */
export function appleMs(s) {
  const m = /^(\S+) (\S+) ([+-]\d{2})(\d{2})$/.exec(s || '');
  return m ? Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4]}`) : NaN;
}
const attrs = tag => Object.fromEntries([...tag.matchAll(/(\w+)="([^"]*)"/g)].map(([, k, v]) => [k, v]));

/** Parses an export.xml byte stream. Returns {wellness, body, counts}. onBytes(n) is called as bytes arrive. */
export async function parseAppleStream(stream, onBytes = () => {}) {
  const per = { rhr: {}, hr: {}, hrMax: {}, hrvSdnn: {}, steps: {}, weight: {}, sleep: {}, inBed: {} };
  const add = (k, d, v) => { const x = (per[k][d] ||= { sum: 0, n: 0 }); x.sum += v; x.n++; };
  let total = 0;
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  const record = tag => {
    const a = attrs(tag);
    if (a.type === SLEEP) {
      const s = appleMs(a.startDate), e = appleMs(a.endDate);
      if (!(e > s)) return;
      const d = a.endDate.slice(0, 10);
      if (a.value?.startsWith('HKCategoryValueSleepAnalysisAsleep')) (per.sleep[d] ||= []).push([s, e]);
      else if (a.value === 'HKCategoryValueSleepAnalysisInBed') (per.inBed[d] ||= []).push([s, e]);
      return;
    }
    const k = QUANTITY[a.type]; if (!k) return;
    const v = parseFloat(a.value); if (!isFinite(v)) return;
    const d = a.startDate.slice(0, 10);
    if (k === 'hr') { add('hr', d, v); per.hrMax[d] = Math.max(per.hrMax[d] ?? -Infinity, v); }
    else if (k === 'steps') add('steps', d + '|' + (a.sourceName || ''), v);
    else if (k === 'weight') {
      const kg = a.unit === 'lb' ? v * 0.45359237 : v;
      const cur = per.weight[d];
      if (!cur || a.startDate > cur.t) per.weight[d] = { t: a.startDate, v: kg };
    } else add(k, d, v);
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.length; onBytes(total);
    buf += value;
    let pos = 0, cut;
    for (;;) {
      const i = buf.indexOf('<Record ', pos);
      if (i < 0) { cut = Math.max(pos, buf.length - 16); break; }
      const e = buf.indexOf('>', i);
      if (e < 0) { cut = i; break; }
      record(buf.slice(i, e + 1)); pos = e + 1;
    }
    buf = buf.slice(cut);
  }
  return summarise(per);
}

function summarise(per) {
  const days = new Set([...Object.keys(per.rhr), ...Object.keys(per.hr), ...Object.keys(per.hrvSdnn), ...Object.keys(per.steps).map(k => k.split('|')[0]), ...Object.keys(per.sleep), ...Object.keys(per.inBed), ...Object.keys(per.weight)]);
  const wellness = [], body = [];
  const bad = {};
  const ok = (f, v) => { if (v == null) return null; const [lo, hi] = RANGE[f]; if (v < lo || v > hi) { bad[f] = (bad[f] || 0) + 1; return null; } return v; };
  const stepDay = {};
  for (const k of Object.keys(per.steps)) { const [d, src] = k.split('|'); const t = per.steps[k].sum; stepDay[d] = Math.max(stepDay[d] || 0, t); }
  for (const d of [...days].sort()) {
    const r = { date: d, source: 'apple-health' };
    const avg = x => x ? x.sum / x.n : null;
    const rhr = ok('rhr', avg(per.rhr[d])); if (rhr != null) r.rhr = Math.round(rhr);
    // All-day heart rate: average and maximum of the day's readings (watch and other sources; every reading counts once).
    const hrAvg = ok('hrAvg', avg(per.hr[d])); if (hrAvg != null) r.hrAvg = Math.round(hrAvg);
    const hrMax = ok('hrMax', per.hrMax[d] ?? null); if (hrMax != null) r.hrMax = Math.round(hrMax);
    const hrv = ok('hrvSdnn', avg(per.hrvSdnn[d])); if (hrv != null) r.hrvSdnn = Math.round(hrv * 10) / 10;
    const st = ok('steps', stepDay[d] ?? null); if (st != null) r.steps = Math.round(st);
    if (per.sleep[d]) {
      const sl = mergeIntervals(per.sleep[d]); const s = ok('sleepS', Math.round(sl / 1000)); if (s != null) r.sleepS = s;
    }
    // In bed is time in bed, not sleep. Kept for bedtimes and trends; the readiness engine does not use it.
    if (per.inBed[d]) { const ib = ok('inBedS', Math.round(mergeIntervals(per.inBed[d]) / 1000)); if (ib != null) r.inBedS = ib; }
    if (Object.keys(r).length > 2) wellness.push(r);
    if (per.weight[d]) { const w = ok('weightKg', Math.round(per.weight[d].v * 10) / 10); if (w != null) body.push({ date: d, time: '', source: 'apple', weightKg: w }); }
  }
  const counts = { days: wellness.length, rhr: wellness.filter(r => r.rhr != null).length, hr: wellness.filter(r => r.hrAvg != null).length, hrvSdnn: wellness.filter(r => r.hrvSdnn != null).length,
    steps: wellness.filter(r => r.steps != null).length, sleep: wellness.filter(r => r.sleepS != null).length, inBed: wellness.filter(r => r.inBedS != null).length, weight: body.length, outOfRange: bad };
  return { wellness, body, counts };
}

/** Total length in ms of the union of [start, end] intervals. */
function mergeIntervals(iv) {
  iv.sort((a, b) => a[0] - b[0]);
  let total = 0, cs = null, ce = null;
  for (const [s, e] of iv) {
    if (cs == null || s > ce) { if (cs != null) total += ce - cs; cs = s; ce = e; }
    else ce = Math.max(ce, e);
  }
  return cs == null ? 0 : total + (ce - cs);
}

/** Accepts the export zip (apple_health_export/export.xml inside) or a raw export.xml. */
export async function parseAppleFile(file, onBytes) {
  if (/\.xml$/i.test(file.name)) return parseAppleStream(file.stream(), onBytes);
  const [entry] = await findEntries(file, /(^|\/)export\.xml$/);
  if (!entry) throw new Error('no export.xml inside this zip. Use Health → profile → Export All Health Data on the iPhone.');
  return parseAppleStream(openEntry(file, entry), onBytes);
}
