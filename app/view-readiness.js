// Readiness & Training: status, every input with its baseline, 7/28-day trends, method, data quality.
import { STATUS, history, loadSeries } from './engine.js';
import { esc, fshort, fdate, n0, n1, addDays, mean, between } from './util.js';
import { $, $$, badge, empty, chart, onRedraw, axes, opts, tipOpts, css, STATE_LABEL, STATE_TONE, srcBadge } from './ui.js';

let range = 90;

export function renderReadiness(D, R) {
  const el = $('#readiness'); const s = STATUS[R.status];
  const has = f => D.wellness.some(r => r[f] != null);
  const H = history(D, D.today, 28);
  const GF = D.garminFitness;
  el.innerHTML = `
  <div class="card focus ${s.tone}">
    <div class="card-h"><div><div class="sub">Readiness · ${fdate(D.today)}</div><div class="stat-big ${s.tone}">${s.label}</div></div>
      <div class="chips">${badge(R.confidence === 'none' ? 'No readiness data' : `Confidence: ${R.confidence}`)}${D.demo.wellness ? badge('Demo data', 'demo') : ''}</div></div>
    <p class="summary" style="margin-bottom:6px">${esc(R.plan.why)} <b>Today: ${esc(R.plan.main.label)}${R.plan.main.duration !== '—' ? `, ${esc(R.plan.main.duration)}` : ''}.</b></p>
    ${R.warnings.length ? `<ul class="tight small">${R.warnings.map(w => `<li>${badge(w.level === 'bad' ? 'Warning' : w.level === 'warn' ? 'Caution' : 'Note', w.level === 'info' ? '' : w.level)} ${esc(w.text)}</li>`).join('')}</ul>` : ''}
  </div>

  <h2 class="mt2">Contributing signals</h2>
  ${R.signals.some(x => x.state !== 'missing') ? '' : empty(D.wellness.length ? `No recent recovery data: the latest health record is from ${fshort(D.wellness[D.wellness.length - 1].date)}. Signals need readings from the last 1–2 days; the trends below show your history.` : 'No recovery data yet. Import your Garmin data export on <a href="#data">Data &amp; privacy</a> to fill resting HR, stress and Body Battery history.')}
  <div class="grid g3">${R.signals.filter(x => x.state !== 'missing').map(x => `<div class="sig ${x.state}"><div class="row"><span class="sub">${x.label}${x.info ? ' (info only)' : ''}</span>${badge(STATE_LABEL[x.state], STATE_TONE[x.state])}</div><div class="v">${esc(x.value)}</div><p>${esc(x.detail)}</p></div>`).join('')}</div>

  ${H.some(h => h.status !== 'unknown') ? `<div class="card mt">
    <div class="card-h"><h2>Status history</h2><span class="sub">each day recalculated with the same rules</span></div>
    <div class="small sub">Last 28 days (oldest → today)</div>
    <div class="strip" role="img" aria-label="${H.map(h => `${h.date}: ${STATUS[h.status].label}`).join(', ')}">${H.map(h => `<span class="st-${h.status}" title="${fshort(h.date)}: ${STATUS[h.status].label}">${STATUS[h.status].label[0]}</span>`).join('')}</div>
    <div class="legend mt">${Object.entries(STATUS).map(([k, v]) => `<span><i class="st-${k}"></i>${v.label}: ${H.filter(h => h.status === k).length} d (28) · ${H.slice(-7).filter(h => h.status === k).length} d (7)</span>`).join('')}</div>
  </div>` : ''}
  <div class="controls mt2"><h2 style="margin:0">Trends</h2><div class="seg" id="rr">${[[7, '7 d'], [28, '28 d'], [90, '90 d'], [365, '1 year'], [1100, '3 years']].map(([n, l]) => `<button data-n="${n}" aria-pressed="${n === range}">${l}</button>`).join('')}</div></div>
  <div class="grid g2">
    ${has('hrv') ? `<div class="card"><h3>HRV (ms)</h3><div class="legend"><span><i style="background:var(--s1)"></i>nightly</span><span><i style="background:var(--text)"></i>7-day mean</span><span><i style="background:var(--accent-soft)"></i>normal range (28-day ±1 SD)</span></div><div class="chart sm"><canvas id="c-hrv" aria-label="HRV trend"></canvas></div></div>` : ''}
    ${has('rhr') ? `<div class="card"><h3>Resting HR (bpm)</h3><div class="chart sm"><canvas id="c-rhr" aria-label="Resting heart rate trend"></canvas></div></div>` : ''}
    ${D.wellness.filter(r => r.sleepS).length >= 3 ? `<div class="card"><h3>Sleep (h)</h3><div class="legend"><span><i style="background:var(--s1)"></i>duration</span><span><i style="background:var(--bad)"></i>under 6 h</span></div><div class="chart sm"><canvas id="c-sleep" aria-label="Sleep duration"></canvas></div></div>` : ''}
    ${has('stress') || has('bbWake') ? `<div class="card"><h3>Stress and Body Battery</h3><div class="legend"><span><i style="background:var(--s2)"></i>avg stress</span><span><i style="background:var(--s3)"></i>Body Battery at wake (export: daily peak when wake isn't recorded)</span></div><div class="chart sm"><canvas id="c-stress" aria-label="Stress and body battery"></canvas></div></div>` : ''}
    ${GF?.vo2?.length || GF?.load?.length ? `<div class="card" style="grid-column:1/-1"><div class="card-h"><h3 style="margin:0">Garmin fitness (from your data export)</h3><span class="sub">${GF.vo2.length ? `VO2max ${n0(GF.vo2[GF.vo2.length - 1].v)} on ${fshort(GF.vo2[GF.vo2.length - 1].date)}` : ''}${GF.load.length ? ` · Garmin acute/chronic ${n1(GF.load[GF.load.length - 1].ratio)} on ${fshort(GF.load[GF.load.length - 1].date)}` : ''}</span></div>
      <div class="legend"><span><i style="background:var(--s4)"></i>Garmin acute load</span><span><i style="background:var(--s1)"></i>chronic load</span>${GF.vo2.length ? '<span><i style="background:var(--s3)"></i>VO2max (right axis)</span>' : ''}</div>
      <div class="chart"><canvas id="c-gfit" aria-label="Garmin acute and chronic training load and VO2max"></canvas></div>
      <p class="small muted">Garmin's own load model (EPOC-based), shown for comparison with the TRIMP load below. It is a snapshot from the export and does not update daily.</p></div>` : ''}
    <div class="card" style="grid-column:1/-1"><h3>Training load (TRIMP)</h3><div class="legend"><span><i style="background:var(--s4)"></i>daily</span><span><i style="background:var(--text)"></i>7-day sum</span><span><i style="background:var(--s1)"></i>28-day weekly average</span></div><div class="chart"><canvas id="c-load" aria-label="Training load"></canvas></div></div>
  </div>

  ${monthTable(D)}

  <div class="grid g2 mt">
    <div class="card"><h2>How the call is made</h2><ul class="tight small">
      <li><b>HRV:</b> last night and the 7-day mean (log scale) against a 28-day baseline. Below baseline −1 SD (nightly) or −0.5 SD (7-day mean) counts as off. Needs 14 nights.</li>
      <li><b>Resting HR:</b> +3 bpm over the 28-day mean = watch, +5 bpm = off.</li>
      <li><b>Sleep:</b> under 7 h or a score under 75 = watch; under 6 h or under 60 = off.</li>
      <li><b>Stress:</b> yesterday's average; 36–50 = watch, above 50 = off. <b>Body Battery at wake:</b> under 50 = watch, under 25 = off.</li>
      <li><b>Load:</b> Edwards TRIMP (minutes in each HR zone × zone number). 7-day load above 1.3× the 28-day weekly average = watch; above 1.5× = off.</li>
      <li><b>Status:</b> each "watch" = 1 point, each "off" = 2. Rest if HRV and resting HR are both off, or ≥ 6 points. Recover if HRV, resting HR or sleep is off, or ≥ 4 points. Moderate at 2–3. Ready at 0–1. No call unless at least 2 of HRV, resting HR and sleep are present.</li>
      <li><b>Body composition</b> creates warnings but never changes the status. Bioimpedance scales shift with hydration.</li>
    </ul><p class="disclaimer">These thresholds are practical heuristics for decision support, not validated clinical cut-offs. Your own perception (legs, mood, illness symptoms) overrides the dashboard.</p></div>
    <div class="card"><h2>Data quality</h2>${quality(D)}</div>
  </div>`;

  $$('#rr button').forEach(b => b.onclick = () => { range = +b.dataset.n; $$('#rr button').forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); });
  const draw = () => drawTrends(D);
  onRedraw('readiness', draw);
}

function drawTrends(D) {
  const from = addDays(D.today, -(range - 1));
  const days = []; for (let d = from; d <= D.today; d = addDays(d, 1)) days.push(d);
  const W = Object.fromEntries(D.wellness.map(r => [r.date, r]));
  const labels = days.map(fshort);
  const v = f => days.map(d => W[d]?.[f] ?? null);
  const hrv = v('hrv');
  const roll = days.map((d, i) => mean(between(D.wellness, addDays(d, -6), d).map(r => r.hrv)));
  const band = days.map(d => { const b = between(D.wellness, addDays(d, -28), addDays(d, -1)).map(r => r.hrv).filter(Boolean); if (b.length < 14) return [null, null]; const l = b.map(Math.log); const m = mean(l), s = Math.sqrt(l.reduce((a, x) => a + (x - m) ** 2, 0) / (l.length - 1)); return [Math.exp(m - s), Math.exp(m + s)]; });
  const line = (data, col, extra = {}) => ({ data, borderColor: css(col), backgroundColor: css(col), borderWidth: 1.8, pointRadius: range <= 28 ? 2 : range <= 90 ? 1.5 : 1, spanGaps: true, tension: .25, ...extra });
  const base = (y = {}) => opts({ scales: axes({ y }), plugins: { legend: { display: false }, tooltip: tipOpts({}) } });
  chart('c-hrv', { type: 'line', data: { labels, datasets: [
    { data: band.map(b => b[1]), borderWidth: 0, pointRadius: 0, backgroundColor: css('--s1') + '1f', fill: '+1', spanGaps: true, order: 3 },
    { data: band.map(b => b[0]), borderWidth: 0, pointRadius: 0, fill: false, spanGaps: true, order: 3 },
    line(hrv, '--s1', { order: 1 }), line(roll, '--text', { pointRadius: 0, borderDash: [4, 3], order: 2 })] }, options: base() });
  chart('c-rhr', { type: 'line', data: { labels, datasets: [line(v('rhr'), '--bad')] }, options: base() });
  const sl = v('sleepS').map(x => x == null ? null : +(x / 3600).toFixed(2));
  chart('c-sleep', { type: 'bar', data: { labels, datasets: [{ data: sl, backgroundColor: sl.map(x => css(x != null && x < 6 ? '--bad' : '--s1')), borderRadius: 3, maxBarThickness: 18 }] }, options: base({ beginAtZero: true, suggestedMax: 9 }) });
  chart('c-stress', { type: 'line', data: { labels, datasets: [line(v('stress'), '--s2'), line(v('bbWake'), '--s3')] }, options: base({ min: 0, max: 100 }) });
  const GF = D.garminFitness;
  if (GF) {
    const G = Object.fromEntries(GF.load.map(r => [r.date, r])), V = Object.fromEntries(GF.vo2.map(r => [r.date, r.v]));
    chart('c-gfit', { type: 'line', data: { labels, datasets: [
      line(days.map(d => G[d]?.acute ?? null), '--s4', { pointRadius: 0 }), line(days.map(d => G[d]?.chronic ?? null), '--s1', { pointRadius: 0 }),
      ...(GF.vo2.length ? [line(days.map(d => V[d] ?? null), '--s3', { yAxisID: 'y2', pointRadius: 3 })] : [])] },
      options: opts({ scales: axes({ y: { beginAtZero: true }, extra: { y2: { position: 'right', grid: { display: false }, ticks: { color: css('--text-2') }, border: { display: false }, suggestedMin: 35, suggestedMax: 55 } } }), plugins: { legend: { display: false }, tooltip: tipOpts({}) } }) });
  }
  const L = loadSeries(D.acts, addDays(from, -28), D.today);
  const daily = days.map(d => L[d] || 0);
  const sumR = (d, n) => { let s = 0; for (let i = 0; i < n; i++) s += L[addDays(d, -i)] || 0; return s; };
  chart('c-load', { type: 'bar', data: { labels, datasets: [
    { type: 'bar', data: daily, backgroundColor: css('--s4'), borderRadius: 3, maxBarThickness: 18, order: 2 },
    { type: 'line', data: days.map(d => sumR(d, 7)), borderColor: css('--text'), borderWidth: 1.8, pointRadius: 0, order: 1 },
    { type: 'line', data: days.map(d => sumR(d, 28) / 4), borderColor: css('--s1'), borderWidth: 1.8, pointRadius: 0, borderDash: [5, 4], order: 1 }] }, options: base({ beginAtZero: true }) });
}

function quality(D) {
  const last = f => { for (let i = D.wellness.length - 1; i >= 0; i--) if (D.wellness[i][f] != null) return D.wellness[i]; return null; };
  const rows = [['HRV', 'hrv'], ['Resting HR', 'rhr'], ['Sleep', 'sleepS'], ['Stress', 'stress'], ['Body Battery', 'bbWake']].filter(([, f]) => last(f)).map(([l, f]) => {
    const r = last(f); const age = r ? Math.round((new Date(D.today) - new Date(r.date)) / 864e5) : null;
    const n28 = between(D.wellness, addDays(D.today, -27), D.today).filter(x => x[f] != null).length;
    return `<tr><td>${l}</td><td>${r ? fshort(r.date) : '–'}</td><td>${age == null ? badge('Missing') : age <= 1 ? badge('Fresh', 'good') : age <= 3 ? badge('Delayed', 'warn') : badge('Stale', 'bad')}</td><td>${n28}/28</td><td>${r ? srcBadge(r.source) : ''}</td></tr>`;
  });
  const lb = D.body[D.body.length - 1];
  rows.push(`<tr><td>Weight</td><td>${lb ? fshort(lb.date) : '–'}</td><td>${lb ? badge(`${Math.round((new Date(D.today) - new Date(lb.date)) / 864e5)} d old`) : badge('Missing')}</td><td>${between(D.body, addDays(D.today, -27), D.today).length}/28</td><td>${lb ? srcBadge(lb.source) : ''}</td></tr>`);
  const la = D.acts[0];
  rows.push(`<tr><td>Activities</td><td>${la ? fshort(la.date) : '–'}</td><td>${badge('Synced ' + (D.meta.refreshed ? fshort(D.meta.refreshed) : '?'))}</td><td>${D.acts.filter(a => a.date > addDays(D.today, -28)).length} in 28 d</td><td>${srcBadge('garmin')}</td></tr>`);
  return `<div class="scroll"><table><thead><tr><th>Signal</th><th>Latest</th><th>Freshness</th><th>Days (28)</th><th>Source</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
  <p class="small muted mt">"Delayed" means the watch hasn't synced today's record yet; the call then uses yesterday's and confidence drops. Activities without heart rate add no training load.</p>`;
}

// Month by month: training next to recovery and body data, so the long view is one table.
function monthTable(D) {
  const M = {};
  const m = d => (M[d.slice(0, 7)] ||= { acts: [], well: [], body: [] });
  D.acts.forEach(a => m(a.date).acts.push(a));
  D.wellness.forEach(r => m(r.date).well.push(r));
  D.body.forEach(r => m(r.date).body.push(r));
  const avg = (rows, f) => mean(rows.map(r => r[f]));
  const months = Object.keys(M).sort().reverse().slice(0, 24);
  if (!months.length) return '';
  const cols = [
    ['Sessions', x => x.acts.length || '–'], ['Hours', x => x.acts.length ? n1(x.acts.reduce((s, a) => s + a.durS, 0) / 3600) : '–'],
    ['km', x => x.acts.length ? n0(x.acts.reduce((s, a) => s + (a.distKm || 0), 0)) : '–'], ['Ascent', x => x.acts.length ? n0(x.acts.reduce((s, a) => s + (a.elevM || 0), 0)) : '–', 'hide-sm'],
    ['Rest. HR', x => fmt(avg(x.well, 'rhr'), 0)], ['Stress', x => fmt(avg(x.well, 'stress'), 0), 'hide-sm'], ['Body Batt.', x => fmt(avg(x.well, 'bbWake'), 0), 'hide-sm'],
    ['Steps/day', x => fmt(avg(x.well, 'steps'), 0), 'hide-sm'], ['Avg HR', x => fmt(avg(x.well, 'hrAvg'), 0), 'hide-sm'], ['Weight', x => fmt(avg(x.body, 'weightKg'), 1)], ['Body fat', x => { const v = avg(x.body, 'fatPct'); return v == null ? '–' : n1(v) + '%'; }, 'hide-sm'],
  ];
  return `<div class="card mt2"><div class="card-h"><h2>Month by month</h2><span class="sub">training, recovery and body averages · last ${months.length} months with data</span></div>
    <div class="scroll" style="max-height:460px;overflow:auto"><table><thead><tr><th>Month</th>${cols.map(([l, , c]) => `<th class="${c || ''}">${l}</th>`).join('')}</tr></thead><tbody>
    ${months.map(k => `<tr><td>${new Date(k + '-15T12:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</td>${cols.map(([, f, c]) => `<td class="${c || ''}">${f(M[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="small muted">Averages over the days that have a reading. Resting HR, stress, Body Battery and steps come from Garmin (heart rate average from Apple Health) (export history and live sync); weight and body fat from Renpho and manual entries. Body Battery is the at-wake value, or the daily peak where wake wasn't recorded.</p></div>`;
}
const fmt = (v, d) => v == null ? '–' : d ? n1(v) : n0(v);
