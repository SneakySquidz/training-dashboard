// Readiness + daily coaching engine. Pure functions: (data, date) -> decision.
// Every decision carries the inputs that produced it so the UI never shows an unexplained score.
//
// Thresholds are practical heuristics, not validated clinical cut-offs. Where the literature
// gives a method (HRV vs a rolling baseline with a "smallest worthwhile change" of 0.5 SD, as in
// Plews et al. and Kiviniemi et al.), we use it; elsewhere the threshold is stated in the UI.
import { addDays, between, mean, sd, sum, daysBetween, hm, n0, n1, fshort } from './util.js';
const an = w => /^[aeiou]/i.test(w) ? 'an' : 'a';
import { isHard, isLong } from './model.js';

export const STATUS = {
  ready: { label: 'Ready', tone: 'good' },
  moderate: { label: 'Moderate', tone: 'warn' },
  recover: { label: 'Recover', tone: 'bad' },
  rest: { label: 'Rest', tone: 'bad' },
  unknown: { label: 'No call', tone: 'muted' },
};
const W = { good: 0, caution: 1, poor: 2 };

const lnMean = v => mean(v.filter(x => x > 0).map(Math.log));
const lnSd = v => sd(v.filter(x => x > 0).map(Math.log));

/** Wellness row for `date`, falling back to the day before (Garmin often syncs late). */
function wellnessFor(W_, date) {
  const t = W_.find(r => r.date === date);
  if (t) return { row: t, lag: 0 };
  const y = W_.find(r => r.date === addDays(date, -1));
  if (y) return { row: y, lag: 1 };
  return { row: null, lag: null };
}

export function loadSeries(acts, from, to) {
  const by = {};
  for (const a of acts) if (a.date >= from && a.date <= to) by[a.date] = (by[a.date] || 0) + (a.trimp || 0);
  return by;
}

/** Load context for `date`: acute (7 d), chronic (28 d / 4), hard sessions in the last 48 h. */
export function loadContext(acts, date) {
  const recent = acts.filter(a => a.date <= date && a.date > addDays(date, -28));
  const acute = sum(recent.filter(a => a.date > addDays(date, -7)), a => a.trimp);
  const chronicWk = sum(recent, a => a.trimp) / 4;
  const withHR = recent.filter(a => a.trimp != null).length;
  const hard48 = recent.filter(a => a.date >= addDays(date, -2) && a.date < date && isHard(a));
  const hardToday = recent.filter(a => a.date === date && isHard(a));
  const longYday = recent.filter(a => a.date === addDays(date, -1) && isLong(a));
  const hard3 = recent.filter(a => a.date >= addDays(date, -3) && a.date <= date && isHard(a)).length;
  const lastStrength = acts.filter(a => a.sport === 'strength' && a.date <= date).sort((a, b) => b.date.localeCompare(a.date))[0];
  return {
    acute, chronicWk, ratio: chronicWk > 0 ? acute / chronicWk : null, sessions28: recent.length, withHR,
    hard48, hardToday, longYday, hard3, daysSinceStrength: lastStrength ? daysBetween(lastStrength.date, date) : null,
    yesterday: recent.filter(a => a.date === addDays(date, -1)),
  };
}

export function bodyContext(body, date) {
  const rows = body.filter(r => r.date <= date && r.weightKg);
  const last = rows[rows.length - 1] || null;
  if (!last) return { last: null };
  const age = daysBetween(last.date, date);
  const near = (target, lo, hi) => rows.filter(r => { const d = daysBetween(r.date, last.date); return d >= lo && d <= hi; })
    .sort((a, b) => Math.abs(daysBetween(a.date, last.date) - target) - Math.abs(daysBetween(b.date, last.date) - target))[0];
  const pct = (a, b, f) => a && b && a[f] && b[f] ? (a[f] - b[f]) / b[f] * 100 : null;
  const w7 = near(7, 5, 10), w30 = near(30, 21, 40), w90 = near(90, 70, 110);
  const prev7 = rows.filter(r => r.date < last.date && r.date >= addDays(last.date, -7));
  const prev7Mean = mean(prev7.map(r => r.weightKg));
  return {
    last, age,
    weightChange7: pct(last, w7, 'weightKg'), weightChange30: pct(last, w30, 'weightKg'), weightChange90: pct(last, w90, 'weightKg'),
    muscleChange30: pct(last, w30, 'muscleKg'), fatChange30: w30 && last.fatPct != null && w30.fatPct != null ? last.fatPct - w30.fatPct : null,
    vsWeek: prev7Mean && prev7.length >= 2 ? (last.weightKg - prev7Mean) / prev7Mean * 100 : null,
    // weight to use for g/kg targets: a real reading within 30 days
    refWeight: age <= 30 ? last.weightKg : null,
  };
}

/** Core readiness computation. Returns the full explanation, not just a label. */
export function assess({ wellness = [], body = [], acts = [], events = [] }, date) {
  if (!Array.isArray(events)) events = events?.events || [];
  const W_ = wellness.slice().sort((a, b) => a.date.localeCompare(b.date));
  const { row: w, lag } = wellnessFor(W_, date);
  const base = between(W_, addDays(date, -28), addDays(date, -1));
  const signals = [];
  const S = (key, label, state, value, detail, extra = {}) => signals.push({ key, label, state, value, detail, ...extra });

  // --- HRV: last night vs 28-day ln baseline, plus 7-day rolling mean vs baseline ---
  const hrvBase = base.map(r => r.hrv).filter(Boolean);
  if (w?.hrv && hrvBase.length >= 14) {
    const m = lnMean(hrvBase), s = lnSd(hrvBase) || 0.05;
    const last7 = between(W_, addDays(date, -6), date).map(r => r.hrv).filter(Boolean);
    const roll = lnMean(last7);
    const lowToday = Math.log(w.hrv) < m - s, low7 = roll != null && roll < m - 0.5 * s;
    const pct = (w.hrv / Math.exp(m) - 1) * 100;
    const state = lowToday && low7 ? 'poor' : (lowToday || low7) ? 'caution' : 'good';
    S('hrv', 'HRV', state, `${n0(w.hrv)} ms`,
      `${pct >= 0 ? '+' : ''}${n0(pct)}% vs 28-day baseline (${n0(Math.exp(m))} ms); 7-day average ${n0(Math.exp(roll))} ms${low7 ? ', below the normal range' : ''}.`,
      { pct });
  } else if (w?.hrv) S('hrv', 'HRV', 'missing', `${n0(w.hrv)} ms`, `Only ${hrvBase.length} nights of HRV history; 14 are needed for a baseline.`);
  else S('hrv', 'HRV', 'missing', '–', 'No overnight HRV for last night.');

  // --- Resting HR vs 28-day mean ---
  const rhrBase = mean(base.map(r => r.rhr));
  if (w?.rhr && rhrBase && base.filter(r => r.rhr).length >= 7) {
    const d = w.rhr - rhrBase;
    S('rhr', 'Resting HR', d >= 5 ? 'poor' : d >= 3 ? 'caution' : 'good', `${n0(w.rhr)} bpm`,
      `${d >= 0 ? '+' : ''}${n1(d)} bpm vs 28-day average (${n0(rhrBase)} bpm).`, { delta: d });
  } else S('rhr', 'Resting HR', 'missing', w?.rhr ? `${n0(w.rhr)} bpm` : '–', w?.rhr ? 'Not enough resting-HR history for a baseline (7 days needed).' : 'No resting HR for today.');

  // --- Sleep: duration and Garmin score; the worse of the two wins ---
  if (w?.sleepS) {
    const h = w.sleepS / 3600;
    const dState = h < 6 ? 'poor' : h < 7 ? 'caution' : 'good';
    const sState = w.sleepScore == null ? 'good' : w.sleepScore < 60 ? 'poor' : w.sleepScore < 75 ? 'caution' : 'good';
    const state = W[dState] >= W[sState] ? dState : sState;
    const avg7 = mean(between(W_, addDays(date, -7), addDays(date, -1)).map(r => r.sleepS));
    S('sleep', 'Sleep', state, hm(w.sleepS).replace(' 0', ' '),
      `${w.sleepScore != null ? `Score ${w.sleepScore}. ` : ''}${avg7 ? `7-night average ${hm(avg7)}.` : ''} Target ≥ 7 h.`, { hours: h });
  } else S('sleep', 'Sleep', 'missing', '–', 'No sleep record for last night.');

  // --- Stress: yesterday's full-day average (today's is incomplete in the morning) ---
  const ys = W_.find(r => r.date === addDays(date, -1));
  if (ys?.stress != null) {
    S('stress', 'Stress', ys.stress > 50 ? 'poor' : ys.stress > 35 ? 'caution' : 'good', `${n0(ys.stress)} / 100`,
      `Yesterday's average Garmin stress. Above 50 counts as high, 36–50 as raised.`, { v: ys.stress });
  } else S('stress', 'Stress', 'missing', '–', "No stress average for yesterday.");

  // --- Body Battery at wake ---
  if (w?.bbWake != null) {
    S('bb', 'Body Battery', w.bbWake < 25 ? 'poor' : w.bbWake < 50 ? 'caution' : 'good', `${n0(w.bbWake)} at wake`,
      `Below 25 counts as depleted, 25–49 as partly charged.`, { v: w.bbWake });
  } else S('bb', 'Body Battery', 'missing', '–', 'No Body Battery reading at wake.');

  // --- Training load: 7-day vs 28-day weekly average (Edwards TRIMP) ---
  const L = loadContext(acts, date);
  if (L.sessions28 >= 3 && L.chronicWk > 0) {
    const r = L.ratio;
    const state = r > 1.5 ? 'poor' : r > 1.3 ? 'caution' : 'good';
    S('load', 'Training load', state, `${n0(L.acute)} (7 d)`,
      `${n1(r)}× your 28-day weekly average (${n0(L.chronicWk)}).${r > 1.3 ? ' A sharp rise.' : r < 0.8 ? ' Lighter than usual.' : ''}${L.hard48.length ? ` Hard session in the last 48 h: ${L.hard48[0].name}.` : ''}`,
      { ratio: r, low: r < 0.8 });
  } else S('load', 'Training load', 'missing', `${n0(L.acute)} (7 d)`, `${L.sessions28} session${L.sessions28 === 1 ? '' : 's'} in 28 days; too few to compare with a baseline.`);

  // --- Body composition: only a warning source. BIA scales are too noisy to drive readiness. ---
  const B = bodyContext(body, date);
  const bodyFlags = [];
  if (B.last) {
    const bits = [`${n1(B.last.weightKg)} kg (${fshort(B.last.date)})`];
    if (B.weightChange7 != null) bits.push(`${B.weightChange7 >= 0 ? '+' : ''}${n1(B.weightChange7)}% in 7 days`);
    let state = 'good';
    if (B.weightChange7 != null && Math.abs(B.weightChange7) >= 2) { state = 'caution'; bodyFlags.push(B.weightChange7 < 0 ? 'rapidLoss' : 'rapidGain'); }
    if (B.vsWeek != null && B.vsWeek <= -1.5 && B.age <= 1) { state = 'caution'; bodyFlags.push('dehydration'); }
    if (B.muscleChange30 != null && B.muscleChange30 <= -2 && (B.weightChange30 ?? 0) < 0) { state = 'caution'; bodyFlags.push('muscleLoss'); }
    if (B.vsWeek != null && B.vsWeek >= 1 && L.hard3 >= 2) bodyFlags.push('glycogenGain');
    S('body', 'Body composition', B.age > 14 ? 'missing' : state, bits.join(' · '), B.age > 14 ? `Last weigh-in ${B.age} days ago.` : 'Informational. Does not change the readiness call.', { info: true });
  } else S('body', 'Body composition', 'missing', '–', 'No weigh-ins. Import Renpho CSV or add one manually.', { info: true });

  // ---------------- status ----------------
  const core = signals.filter(s => ['hrv', 'rhr', 'sleep', 'stress', 'bb', 'load'].includes(s.key));
  const have = core.filter(s => s.state !== 'missing');
  const keyHave = have.filter(s => ['hrv', 'rhr', 'sleep'].includes(s.key)).length;
  const score = sum(have, s => W[s.state]);
  const st = k => signals.find(s => s.key === k)?.state;
  let status, confidence;
  if (keyHave < 2) { status = 'unknown'; confidence = 'none'; }
  else {
    if ((st('hrv') === 'poor' && st('rhr') === 'poor') || score >= 6) status = 'rest';
    else if (['hrv', 'rhr', 'sleep'].some(k => st(k) === 'poor') || score >= 4) status = 'recover';
    else if (score >= 2) status = 'moderate';
    else status = 'ready';
    confidence = have.length >= 5 && lag === 0 ? 'high' : have.length >= 3 ? 'medium' : 'low';
    if (lag === 1) confidence = confidence === 'high' ? 'medium' : 'low';
  }

  // Only events you've entered (registered: true in events.json) change the plan; the rest are ideas.
  const nextEvent = events.filter(e => e.registered && e.date >= date).sort((a, b) => a.date.localeCompare(b.date))[0];
  const evDays = nextEvent && nextEvent.date.length === 10 ? daysBetween(date, nextEvent.date) : null;

  const plan = prescribe(status, signals, L, evDays, nextEvent);
  const nutrition = nutritionFor(plan, B, L);
  const warnings = buildWarnings(signals, L, B, bodyFlags, lag);
  const suggestions = buildSuggestions(status, signals, L, B, bodyFlags, plan);
  return {
    date, status, confidence, score, lag, signals, load: L, body: B, plan, nutrition, warnings, suggestions,
    nextEvent: nextEvent ? { ...nextEvent, days: evDays } : null,
    summary: summarise(status, signals, plan, nutrition, warnings, lag),
  };
}

// ---------------- session prescription ----------------
const SESSIONS = {
  intervals: { type: 'intervals', label: 'Hard intervals', duration: '60–75 min', intensity: 'Warm up 15 min Z1–2, then 4 × 6 min in Zone 4 with 4 min easy; cool down 10 min', zone: 'Z4' },
  tempo: { type: 'tempo', label: 'Tempo ride', duration: '60–90 min', intensity: '2 × 15 min in Zone 3 inside an otherwise Zone 2 ride', zone: 'Z3' },
  endurance: { type: 'endurance', label: 'Endurance ride', duration: '75–150 min', intensity: 'Zone 2: steady, able to speak in sentences. Keep climbs below Zone 3', zone: 'Z2' },
  easy: { type: 'easy', label: 'Easy spin', duration: '30–45 min', intensity: 'Zone 1–2, flat or rolling terrain. On an eMTB use a high assist level so HR stays down', zone: 'Z1–2' },
  strength: { type: 'strength', label: 'Strength session', duration: '35–40 min', intensity: 'RPE 7, 2–3 reps in reserve. No sets to failure', zone: '—', routine: 'strength' },
  walk: { type: 'walk', label: 'Walk', duration: '20–30 min', intensity: 'Easy, outdoors, nasal breathing', zone: 'Z1' },
  mobility: { type: 'mobility', label: 'Mobility', duration: '15–20 min', intensity: 'Gentle', zone: '—', routine: 'mobility10' },
  rest: { type: 'rest', label: 'Full rest', duration: '—', intensity: 'No training. A short walk is fine', zone: '—' },
  opener: { type: 'opener', label: 'Pre-event opener', duration: '30–40 min', intensity: 'Easy riding with 3 × 1 min at race effort and 4 spin-ups', zone: 'Z1–2 + short Z4' },
};

function prescribe(status, signals, L, evDays, ev) {
  const st = k => signals.find(s => s.key === k)?.state;
  const lowLoad = signals.find(s => s.key === 'load')?.low;
  const needStrength = L.daysSinceStrength == null || L.daysSinceStrength >= 7;
  let main, alt, extra = 'mobility10', why;
  if (status === 'rest') { main = SESSIONS.rest; alt = SESSIONS.walk; extra = 'restday'; why = 'Several recovery markers are off at once.'; }
  else if (status === 'recover') {
    main = st('sleep') === 'poor' || st('stress') === 'poor' ? SESSIONS.walk : SESSIONS.easy; alt = SESSIONS.mobility; extra = 'recovery';
    why = 'At least one key recovery marker is clearly off.';
  } else if (status === 'moderate') {
    main = L.hard48.length ? SESSIONS.easy : SESSIONS.endurance; alt = SESSIONS.walk;
    why = L.hard48.length ? 'Moderate readiness and you trained hard in the last 48 h.' : 'Moderate readiness: aerobic work without intensity.';
  } else if (status === 'ready') {
    if (L.hard48.length) { main = SESSIONS.endurance; alt = needStrength ? SESSIONS.strength : SESSIONS.easy; why = 'Recovered, but a hard session in the last 48 h means no back-to-back intensity.'; }
    else if (lowLoad || L.ratio == null || L.ratio < 1.1) { main = SESSIONS.intervals; alt = needStrength ? SESSIONS.strength : SESSIONS.tempo; why = 'Recovered and recent load is at or below normal, so this is a good day for quality.'; }
    else { main = SESSIONS.tempo; alt = needStrength ? SESSIONS.strength : SESSIONS.endurance; why = 'Recovered, but load is already rising, so tempo rather than maximal intervals.'; }
    extra = 'activation';
  } else { // unknown: fall back on load only and say so
    main = L.hard48.length ? SESSIONS.easy : SESSIONS.endurance; alt = SESSIONS.mobility;
    why = 'Not enough recovery data for a readiness call. Based on training load only, so keep it aerobic.';
  }
  // Event taper overrides
  if (evDays != null && evDays >= 0 && evDays <= 7 && status !== 'rest') {
    if (evDays === 0) { main = { ...SESSIONS.rest, type: 'event', label: 'Event day', intensity: `Race day: ${ev.name}. Warm up 15 min, start conservatively` }; why = `${ev.name} is today.`; }
    else if (evDays === 1) { main = SESSIONS.opener; why = `${ev.name} is tomorrow.`; }
    else if (main.type === 'intervals' || main.type === 'tempo') { main = { ...SESSIONS.endurance, duration: '45–60 min', intensity: 'Zone 2 with 3 × 2 min at event pace' }; why = `${ev.name} is in ${evDays} days: keep some intensity, cut volume.`; }
    if (alt?.type === 'strength') alt = SESSIONS.mobility;
  }
  return { main, alt, routine: extra, why };
}

// ---------------- nutrition ----------------
function nutritionFor(plan, B, L) {
  const kg = B.refWeight;
  const t = plan.main.type;
  const hard = ['intervals', 'tempo', 'opener'].includes(t);
  const long = t === 'endurance';
  const carb = hard ? [6, 8] : long ? [5, 7] : ['easy', 'strength'].includes(t) ? [4, 5] : [3, 5];
  const protein = [1.6, 2.0];
  const out = {
    weightKg: kg, weightDate: kg ? B.last.date : null,
    protein: kg ? `${n0(kg * protein[0])}–${n0(kg * protein[1])} g` : '1.6–2.0 g/kg',
    proteinPerMeal: kg ? `${n0(kg * 0.3)}–${n0(kg * 0.4)} g` : '0.3–0.4 g/kg',
    carbs: kg ? `${n0(kg * carb[0])}–${n0(kg * carb[1])} g` : `${carb[0]}–${carb[1]} g/kg`,
    carbRange: carb,
    timing: hard ? 'Eat a carbohydrate-based meal 2–3 h before. Take in carbohydrate and protein within ~1 h after.'
      : long ? 'For rides over 90 min take 30–60 g carbohydrate per hour from the first hour.'
        : 'Timing matters little today; spread protein across 3–4 meals.',
    hydration: long ? 'Drink 400–800 ml per hour on the bike. Over 90 min, or above 25 °C, add electrolytes (around 300–600 mg sodium per litre).'
      : 'Drink regularly through the day; pale-straw urine is a practical check.',
    action: '',
  };
  out.action = L.longYday.length
    ? `Recovery focus after yesterday's long session: ${out.protein} protein and ${out.carbs} carbohydrate today, plus fluids with electrolytes.`
    : `Target ${out.protein} protein today (~${out.proteinPerMeal} per meal) and ${out.carbs} carbohydrate.`;
  if (!kg) out.action += ' Add a weigh-in for gram targets.';
  return out;
}

// ---------------- warnings ----------------
function buildWarnings(signals, L, B, flags, lag) {
  const w = [], st = k => signals.find(s => s.key === k);
  if (st('hrv')?.state === 'poor') w.push({ level: 'bad', text: 'HRV is below your normal range on both the nightly and 7-day measures.' });
  if (st('rhr')?.state === 'poor') w.push({ level: 'bad', text: `Resting HR is ${n1(st('rhr').delta)} bpm above your average. If you also feel unwell (sore throat, fever, unusual fatigue), take the day off.` });
  if (st('sleep')?.state === 'poor') w.push({ level: 'warn', text: 'Short or poor sleep. Avoid hard intensity today.' });
  if (st('stress')?.state === 'poor') w.push({ level: 'warn', text: 'High stress yesterday. Training stress adds to it; keep today easy.' });
  if (st('load')?.state !== 'good' && st('load')?.state !== 'missing') w.push({ level: st('load').state === 'poor' ? 'bad' : 'warn', text: `Training load has risen sharply: the last 7 days are ${n1(L.ratio)}× your usual week.` });
  if (st('load')?.ratio > 1.3 && (st('hrv')?.state !== 'good' || st('rhr')?.state !== 'good') && st('hrv')?.state !== 'missing')
    w.push({ level: 'bad', text: 'High load alongside falling HRV or rising resting HR suggests accumulated fatigue. Plan a recovery day and keep watching both.' });
  if (flags.includes('dehydration')) w.push({ level: 'warn', text: `This morning's weight is ${n1(-B.vsWeek)}% below your 7-day average. Likely fluid; rehydrate before training.` });
  if (flags.includes('rapidLoss')) w.push({ level: 'warn', text: `Weight is down ${n1(-B.weightChange7)}% in 7 days. Worth a look if unintended. This is a signal to review, not a diagnosis.` });
  if (flags.includes('rapidGain')) w.push({ level: 'info', text: `Weight is up ${n1(B.weightChange7)}% in 7 days. Over a few days this is usually water and glycogen, not fat.` });
  if (flags.includes('muscleLoss')) w.push({ level: 'warn', text: `Scale muscle mass is down ${n1(-B.muscleChange30)}% over ~30 days while weight is falling. Review protein and energy intake and keep strength work going.` });
  if (lag === 1) w.push({ level: 'info', text: "Today's Garmin data hasn't arrived yet, so this uses yesterday's. Sync the watch and reload." });
  return w;
}

// ---------------- rule-based suggestions ----------------
function buildSuggestions(status, signals, L, B, flags, plan) {
  const st = k => signals.find(s => s.key === k)?.state;
  const out = [];
  const add = (id, title, trigger, actions, routine) => out.push({ id, title, trigger, actions, routine });
  if (['recover', 'rest'].includes(status) || st('hrv') === 'poor' || st('rhr') === 'poor')
    add('lowready', 'Recover first', 'Low HRV, raised resting HR, or a recover/rest status',
      ['Easy ride in Zone 1–2 or a walk instead of anything structured', 'No high-intensity work today', 'Bed 30–45 min earlier tonight', 'No caffeine after midday', 'Drink steadily through the day'], 'recovery');
  if (status === 'ready' && signals.find(s => s.key === 'load')?.low)
    add('quality', 'Use the fresh legs', 'Ready status and recent load below normal',
      ['Structured intervals or a tempo ride today', 'Or a full strength session if none in the last 7 days', 'Fuel the session: carbohydrate before and after'], 'activation');
  if (st('stress') === 'poor' || st('stress') === 'caution')
    add('stress', 'Lower the overall stress', `Average stress ${signals.find(s => s.key === 'stress').value} yesterday`,
      ['Easy outdoor ride or walk; daylight and green space help', '5 min slow nasal breathing this evening', 'Cut stimulants after midday', 'Lower today’s training intensity by one zone'], null);
  if (st('sleep') === 'poor' || st('sleep') === 'caution')
    add('sleep', 'Protect tonight’s sleep', `Last night: ${signals.find(s => s.key === 'sleep').value}`,
      ['Lower today’s intensity', 'Get 10–20 min of morning daylight', 'Keep wake time fixed, including weekends', 'No large meal or alcohol in the 3 h before bed'], null);
  const loadSig = signals.find(s => s.key === 'load');
  if (loadSig.state !== 'missing' && loadSig.ratio > 1.3 && (st('hrv') === 'poor' || st('hrv') === 'caution' || st('rhr') === 'poor' || st('rhr') === 'caution'))
    add('fatigue', 'Fatigue is building', `7-day load ${n1(L.ratio)}× normal with HRV/RHR moving the wrong way`,
      ['Make today a recovery day', 'Watch the next 2–3 mornings; if HRV and resting HR don’t recover, cut weekly volume by 30–40%'], 'recovery');
  if (flags.includes('muscleLoss') || (flags.includes('rapidLoss')))
    add('muscle', 'Protect muscle while weight drops', 'Weight and/or scale muscle mass falling',
      ['Hit the protein target every day, spread over 3–4 meals', 'Two strength sessions a week', 'Check you are eating enough on big training days', 'Not a diagnosis; if the loss is unintended, speak to a GP'], 'strength');
  if (flags.includes('glycogenGain'))
    add('glycogen', 'Weight jump after hard days', 'Weight up ≥ 1% vs your 7-day mean after 2+ hard sessions',
      ['Likely glycogen and water stored after hard training, not fat', 'Hydrate normally and re-check in 3–4 days before reading anything into it'], null);
  if (L.longYday.length) {
    const a = L.longYday[0];
    add('longride', 'Recover from yesterday’s long session', `${a.name}: ${hm(a.durS)}${a.distKm ? `, ${n1(a.distKm)} km` : ''}`,
      ['Carbohydrate + protein meal (e.g. rice, eggs and tuna: ~40 g P / 80 g C)', 'Replace fluids; add electrolytes if it was hot or you sweated heavily', st('hrv') === 'good' ? 'Easy spin or walk is fine today' : 'Easy spin or walk only; fatigue markers are up'], 'recovery');
  }
  if (plan.main.type === 'rest' || plan.main.type === 'walk')
    add('restday', 'Make the rest day count', 'Rest or walk prescribed',
      ['20–30 min walk', 'Hip and thoracic mobility', 'Core and glute activation', 'Protein at every meal'], 'restday');
  if (L.daysSinceStrength == null || L.daysSinceStrength >= 10)
    add('strengthgap', 'Strength work is overdue', L.daysSinceStrength == null ? 'No strength sessions recorded' : `${L.daysSinceStrength} days since the last strength session`,
      ['Fit in 2 short sessions a week on easy days, at least 48 h before intervals', 'Prioritise single-leg and hinge patterns for descents and climbing'], 'strength');
  return out;
}

// ---------------- plain-language summary ----------------
function summarise(status, signals, plan, nutr, warnings, lag) {
  const s = k => signals.find(x => x.key === k);
  const why = [];
  const hrv = s('hrv'), sl = s('sleep'), rhr = s('rhr'), str = s('stress'), ld = s('load');
  if (hrv.state !== 'missing') why.push(hrv.state === 'good' ? `HRV is within your normal range (${hrv.value})` : `HRV is below your normal range (${hrv.value}, ${n0(hrv.pct)}% vs baseline)`);
  if (rhr.state !== 'missing' && rhr.state !== 'good') why.push(`resting HR is up ${n1(rhr.delta)} bpm`);
  if (sl.state !== 'missing') why.push(`sleep was ${sl.value}`);
  if (str.state === 'poor') why.push(`stress averaged ${str.value} yesterday`);
  if (ld.state !== 'missing' && ld.ratio != null && (ld.ratio > 1.3 || ld.ratio < 0.8)) why.push(`7-day load is ${n1(ld.ratio)}× normal`);
  const lead = status === 'unknown' ? 'No readiness call: not enough recovery data.' : `${STATUS[status].label} readiness${lag ? ' (from yesterday’s data)' : ''}.`;
  const reason = why.length ? ' ' + why.join(', ').replace(/^./, c => c.toUpperCase()) + '.' : '';
  const m = plan.main;
  const sess = m.type === 'rest' ? ` ${m.label}${plan.alt ? `, or a ${plan.alt.label.toLowerCase()} (${plan.alt.duration})` : ''}.` : ` Do ${an(m.label)} ${m.label.toLowerCase()} of ${m.duration}: ${m.intensity.charAt(0).toLowerCase() + m.intensity.slice(1)}.`;
  const caution = warnings.find(w => w.level === 'bad' || w.level === 'warn');
  return `${lead}${reason}${sess} ${nutr.action}${caution ? ' ' + caution.text : ''}`;
}

/** Status for each of the last n days, for the trend strip. */
export function history(data, today, n = 28) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) { const d = addDays(today, -i); const r = assess(data, d); out.push({ date: d, status: r.status, score: r.score, confidence: r.confidence }); }
  return out;
}
