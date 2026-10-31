// Garmin account data export (the zip from Garmin's "Request data export"), read entirely in the browser.
// Only the files listed in WANT are inflated; nothing is uploaded anywhere.
//
// Files used (DI_CONNECT/...):
//   DI-Connect-Aggregator/UDSFile_*.json        daily summary: resting HR, stress, Body Battery, steps, respiration
//   DI-Connect-Wellness/*_sleepData.json         nightly sleep: duration and score
//   DI-Connect-Metrics/MetricsMaxMetData_*.json  VO2max estimates
//   DI-Connect-Metrics/MetricsAcuteTrainingLoad_*.json  Garmin's acute/chronic load
// HRV is not part of this export format, so it stays empty.

export const WANT = /DI_CONNECT\/.*(UDSFile_[^/]*\.json|_sleepData\.json|MetricsMaxMetData_[^/]*\.json|MetricsAcuteTrainingLoad_[^/]*\.json)$/;

import { readZip as readZipAll } from './zip.js';

/** Garmin export files only, see WANT. */
export const readZip = (blob, want = WANT) => readZipAll(blob, want);

// ---------- parsing into the internal schemas ----------
const pos = v => (typeof v === 'number' && v > 0 ? v : null);
const dateOf = v => typeof v === 'number' ? new Date(v).toISOString().slice(0, 10) : String(v || '').slice(0, 10);

/** files: {name: text}. Returns {wellness:[{date,…}], fitness:{vo2:[{date,v}], load:[{date,acute,chronic,ratio,status}]}, counts}. */
export function parseExport(files) {
  const days = {}; const vo2 = {}; const load = {};
  const row = d => (days[d] ||= { date: d, source: 'garmin-export' });
  const counts = { summaryFiles: 0, sleepFiles: 0 };
  for (const [name, text] of Object.entries(files)) {
    let j; try { j = JSON.parse(text); } catch { continue; }
    const list = Array.isArray(j) ? j : [j];
    if (/UDSFile_/.test(name)) {
      counts.summaryFiles++;
      for (const u of list) {
        const d = dateOf(u.calendarDate); if (!/^\d{4}-\d\d-\d\d$/.test(d)) continue;
        const r = row(d);
        r.rhr = pos(u.restingHeartRate) ?? r.rhr ?? null;
        const st = (u.allDayStress?.aggregatorList || []).find(a => a.type === 'TOTAL');
        if (pos(st?.averageStressLevel) != null) r.stress = st.averageStressLevel;
        const bb = Object.fromEntries((u.bodyBattery?.bodyBatteryStatList || []).map(s => [s.bodyBatteryStatType, s.statsValue]));
        // "At wake" when Garmin recorded the end of sleep; otherwise the day's peak, which on most days is reached at waking.
        if (pos(bb.SLEEPEND) != null || pos(bb.HIGHEST) != null) { r.bbWake = pos(bb.SLEEPEND) ?? bb.HIGHEST; r.bbWakeProxy = pos(bb.SLEEPEND) == null; }
        if (pos(bb.LOWEST) != null) r.bbLow = bb.LOWEST;
        if (pos(u.totalSteps) != null) r.steps = u.totalSteps;
        if (pos(u.respiration?.avgWakingRespirationValue) != null) r.resp = u.respiration.avgWakingRespirationValue;
      }
    } else if (/_sleepData\.json$/.test(name)) {
      counts.sleepFiles++;
      for (const s of list) {
        const d = dateOf(s.calendarDate); if (!/^\d{4}-\d\d-\d\d$/.test(d)) continue;
        const secs = (s.deepSleepSeconds || 0) + (s.lightSleepSeconds || 0) + (s.remSleepSeconds || 0);
        if (secs > 0) { const r = row(d); r.sleepS = secs; if (pos(s.sleepScores?.overallScore) != null) r.sleepScore = s.sleepScores.overallScore; }
      }
    } else if (/MetricsMaxMetData_/.test(name)) {
      for (const m of list) if (pos(m.vo2MaxValue) != null) vo2[dateOf(m.calendarDate)] = m.vo2MaxValue;
    } else if (/MetricsAcuteTrainingLoad_/.test(name)) {
      for (const m of list.slice().sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))) {
        if (m.dailyTrainingLoadAcute == null) continue;
        load[dateOf(m.calendarDate)] = { acute: m.dailyTrainingLoadAcute, chronic: m.dailyTrainingLoadChronic ?? null, ratio: m.dailyAcuteChronicWorkloadRatio ?? null, status: m.acwrStatus || null };
      }
    }
  }
  // Drop days that carry nothing useful (Garmin writes empty summaries for days the watch wasn't worn).
  const keep = r => ['rhr', 'stress', 'bbWake', 'steps', 'resp', 'sleepS'].some(k => r[k] != null);
  const wellness = Object.values(days).filter(keep).map(r => Object.fromEntries(Object.entries(r).filter(([, v]) => v != null))).sort((a, b) => a.date.localeCompare(b.date));
  return {
    wellness,
    fitness: {
      vo2: Object.entries(vo2).map(([date, v]) => ({ date, v })).sort((a, b) => a.date.localeCompare(b.date)),
      load: Object.entries(load).map(([date, x]) => ({ date, ...x })).sort((a, b) => a.date.localeCompare(b.date)),
    },
    counts: { ...counts, days: wellness.length, rhr: wellness.filter(r => r.rhr).length, stress: wellness.filter(r => r.stress != null).length, bb: wellness.filter(r => r.bbWake != null).length, sleep: wellness.filter(r => r.sleepS).length, vo2: Object.keys(vo2).length, load: Object.keys(load).length },
  };
}

/** Merge new rows into existing ones by date; fields from `add` win. */
export function mergeWellness(old, add) {
  const by = {}; for (const r of [...old, ...add]) by[r.date] = { ...(by[r.date] || {}), ...r };
  return Object.values(by).sort((a, b) => a.date.localeCompare(b.date));
}
