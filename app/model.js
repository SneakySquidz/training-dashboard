// Provider-agnostic internal schemas + normalisers.
// Every record carries `source` so the UI can show provenance.
//
// Activity   {id,name,date,start,type,sport,rideType,ebike,distKm,durS,movS,elevM,avgKmh,avgHR,maxHR,
//             avgPower,np,kcal,tMin,tMax,zones[5] (s),aeTE,anTE,garminLoad,trimp,indoor,location,source}
// Wellness   {date,hrv,hrvWeekly,hrvStatus,rhr,sleepS,sleepScore,stress,bbWake,bbHigh,resp,spo2,steps,source}
// BodyComp   {date,time,weightKg,bmi,fatPct,muscleKg,visceral,boneKg,waterPct,bmrKcal,proteinPct,source}
import { sum } from './util.js';

export const SPORT = t => {
  if (/bik|cycl|ride|gravel/.test(t)) return 'ride';
  if (/hik|walk|mountaineer|trail_run/.test(t)) return 'hike';
  if (/run/.test(t)) return 'run';
  if (/strength|training|yoga|pilates|hiit/.test(t)) return 'strength';
  if (/ski/.test(t)) return 'ski';
  if (/swim/.test(t)) return 'swim';
  return 'other';
};

// Every cycling discipline lives in the Bicycle tab; these are filters, not separate sports.
export const RIDE_TYPES = [
  ['road', 'Road'], ['gravel', 'Gravel'], ['mtb', 'MTB'], ['emtb', 'eMTB'], ['ebike', 'eBike (road/city)'],
  ['commute', 'Commute'], ['indoor', 'Indoor / trainer'], ['other', 'Other / unspecified'],
];
export const ASSISTED = new Set(['emtb', 'ebike']);

export function rideType(t, name = '') {
  if (/commut/i.test(name) || /commut/.test(t)) return 'commute';
  if (/^e_?bike_mountain|emtb/.test(t)) return 'emtb';
  if (/^e_?bike/.test(t)) return 'ebike';
  if (/indoor|virtual|trainer|spin/.test(t)) return 'indoor';
  if (/gravel/.test(t)) return 'gravel';
  if (/mountain|mtb|bmx|cyclocross|downhill|enduro/.test(t)) return 'mtb';
  if (/road/.test(t)) return 'road';
  return 'other'; // Garmin's generic "cycling" – we do not guess the surface
}

// Edwards TRIMP: minutes in HR zone × zone number. Chosen over Garmin's load because it is
// reproducible from exported data and comparable across providers. Null without HR zones.
export function trimp(z) {
  if (!z || !z.some(v => v > 0)) return null;
  return Math.round(sum(z.map((s, i) => (s || 0) / 60 * (i + 1))));
}

export function normGarminActivity(a) {
  const zones = [1, 2, 3, 4, 5].map(i => a['hrTimeInZone_' + i] || 0);
  const type = a.type || a.activityType?.typeKey || 'other';
  const sport = SPORT(type);
  return {
    id: a.activityId, name: a.activityName || '', start: a.startTimeLocal, date: a.startTimeLocal.slice(0, 10), type, sport,
    rideType: sport === 'ride' ? rideType(type, a.activityName) : null,
    ebike: /^e_bike|ebike|e_bike/.test(type),
    indoor: /indoor|virtual|trainer/.test(type),
    noGps: !a.startLatitude,
    distKm: (a.distance || 0) / 1000, durS: a.duration || 0, movS: a.movingDuration || a.duration || 0,
    elevM: a.elevationGain || 0, maxElev: a.maxElevation, elevLoss: a.elevationLoss,
    avgKmh: a.averageSpeed ? a.averageSpeed * 3.6 : null, maxKmh: a.maxSpeed ? a.maxSpeed * 3.6 : null,
    avgHR: a.averageHR || null, maxHR: a.maxHR || null,
    avgPower: a.avgPower || a.averagePower || null, np: a.normPower || null,
    kcal: a.calories || null, tMin: a.minTemperature ?? null, tMax: a.maxTemperature ?? null,
    zones, trimp: trimp(zones), garminLoad: a.activityTrainingLoad || null,
    aeTE: a.aerobicTrainingEffect || null, anTE: a.anaerobicTrainingEffect || null, teLabel: a.trainingEffectLabel || null,
    location: a.locationName || '', lat: a.startLatitude, lon: a.startLongitude,
    elapsedS: a.elapsedDuration || a.duration || 0,
    source: 'garmin',
  };
}

/** A session that should block hard intensity the next day. Thresholds are deliberately simple. */
export const isHard = a => (a.anTE >= 2.5) || (a.aeTE >= 4) || (a.trimp >= 180) ||
  (a.zones && (a.zones[3] + a.zones[4]) >= 20 * 60);
export const isLong = a => a.durS >= 2 * 3600 || (a.sport === 'ride' && a.distKm >= 60);

// ---- body composition -------------------------------------------------------
export const BODY_FIELDS = [
  ['weightKg', 'Weight', 'kg', 1], ['bmi', 'BMI', '', 1], ['fatPct', 'Body fat', '%', 1], ['muscleKg', 'Muscle mass', 'kg', 1],
  ['visceral', 'Visceral fat', '', 0], ['boneKg', 'Bone mass', 'kg', 1], ['waterPct', 'Body water', '%', 1],
  ['bmrKcal', 'BMR', 'kcal', 0], ['proteinPct', 'Protein', '%', 1],
];

// Header aliases seen across Renpho / Garmin / generic exports. Matching is case- and
// punctuation-insensitive, and unit suffixes such as "(kg)" are stripped first.
const ALIASES = {
  date: ['date', 'time of measurement', 'measurement time', 'datetime', 'time', 'timestamp'],
  weightKg: ['weight', 'weight kg', 'body weight'],
  bmi: ['bmi'],
  fatPct: ['body fat', 'bodyfat', 'body fat %', 'fat', 'body fat rate'],
  muscleKg: ['muscle mass', 'skeletal muscle mass', 'muscle'],
  visceral: ['visceral fat', 'visceral fat rating', 'visceral fat index'],
  boneKg: ['bone mass', 'bone'],
  waterPct: ['body water', 'water', 'body water %', 'water %'],
  bmrKcal: ['bmr', 'basal metabolic rate', 'bmr kcal'],
  proteinPct: ['protein', 'protein %'],
  source: ['source'],
};
const key = h => h.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z% ]/g, ' ').replace(/\s+/g, ' ').trim();

export function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',' || c === ';' || c === '\t') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); if (row.some(x => x.trim())) rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  row.push(cur); if (row.some(x => x.trim())) rows.push(row);
  return rows;
}

const num = v => { if (v == null) return null; const s = String(v).replace(',', '.').replace(/[^0-9.\-]/g, ''); const n = parseFloat(s); return isFinite(n) ? n : null; };

function toISODate(s) {
  s = String(s).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return [`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`, m[4] ? `${m[4].padStart(2, '0')}:${m[5]}` : null];
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ ,]+(\d{1,2}):(\d{2}))?/); // assume D/M/Y (European exports)
  if (m) return [`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`, m[4] ? `${m[4].padStart(2, '0')}:${m[5]}` : null];
  const d = new Date(s); if (!isNaN(d)) return [d.toISOString().slice(0, 10), null];
  return [null, null];
}

/** Returns {rows, mapped:{field:header}, unmapped:[headers], skipped:n}. Weight in lb is converted. */
export function parseBodyCSV(text, source = 'renpho') {
  const t = parseCSV(text); if (t.length < 2) return { rows: [], mapped: {}, unmapped: [], skipped: 0 };
  const head = t[0].map(key), mapped = {}, idx = {};
  for (const [f, al] of Object.entries(ALIASES)) {
    const i = head.findIndex(h => al.includes(h) || al.includes(h.replace(/ %$/, '')));
    if (i >= 0) { idx[f] = i; mapped[f] = t[0][i]; }
  }
  const lb = /lb/i.test(t[0][idx.weightKg] || '');
  const rows = []; let skipped = 0;
  for (const r of t.slice(1)) {
    const [date, time] = toISODate(r[idx.date] ?? '');
    const w = num(r[idx.weightKg]);
    if (!date || w == null) { skipped++; continue; }
    const o = { date, time, source: r[idx.source] ? String(r[idx.source]).toLowerCase() : source };
    for (const [f] of BODY_FIELDS) if (idx[f] != null) o[f] = num(r[idx[f]]);
    if (lb) { o.weightKg = round1(o.weightKg * 0.45359237); if (o.muscleKg) o.muscleKg = round1(o.muscleKg * 0.45359237); if (o.boneKg) o.boneKg = round1(o.boneKg * 0.45359237); }
    if (o.weightKg < 25 || o.weightKg > 300) { skipped++; continue; }
    rows.push(o);
  }
  return { rows, mapped, unmapped: t[0].filter((h, i) => !Object.values(idx).includes(i)), skipped };
}
const round1 = v => v == null ? null : Math.round(v * 10) / 10;

export function bodyToCSV(rows) {
  const cols = ['date', 'time', ...BODY_FIELDS.map(f => f[0]), 'source'];
  return [cols.join(','), ...rows.map(r => cols.map(c => r[c] ?? '').join(','))].join('\n');
}

/** One reading per day: keep the earliest morning weigh-in (most comparable day to day). */
export function dailyBody(rows) {
  const by = {};
  for (const r of rows) { const k = r.date; if (!by[k] || (r.time || '99') < (by[k].time || '99')) by[k] = r; }
  return Object.values(by).sort((a, b) => a.date.localeCompare(b.date));
}
