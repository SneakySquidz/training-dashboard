// Bicycle tab: overview, history, trends, best efforts, maintenance, ride detail.
import { RIDE_TYPES } from './model.js';
import { aggregate, bestEfforts, pmc, TASKS, taskStatus, mondayOf } from './cycling.js';
import { LS, tracks } from './store.js';
import { renderDetail } from './view-detail.js';
import { esc, fdate, fshort, hmShort, n0, n1, sum, addDays } from './util.js';
import { $, $$, badge, empty, chart, onRedraw, axes, opts, tipOpts, css, table } from './ui.js';

const P = { panel: 'overview', types: new Set(), q: '', sort: { key: 'date', dir: 'desc' }, agg: 'week', metric: 'km' };
const PANELS = [['overview', 'Overview'], ['history', 'Ride history'], ['trends', 'Trends'], ['best', 'Best efforts'], ['maint', 'Maintenance']];

export function bikes(rides) {
  const saved = LS.get('bikes', null); if (saved) return saved;
  const out = [];
  if (rides.some(r => r.ebike)) out.push({ id: 'ebike', name: 'eMTB', ebike: true });
  if (rides.some(r => !r.ebike && !r.indoor)) out.push({ id: 'bike', name: 'Bike', ebike: false });
  return out;
}
const bikeFor = (r, B) => B.find(b => b.ebike === !!r.ebike) || B[0];

export function renderBike(D, arg) {
  const el = $('#bike');
  const rides = D.acts.filter(a => a.sport === 'ride');
  if (!rides.length) { el.innerHTML = empty('No rides recorded yet.'); return; }
  if (arg && arg.startsWith('ride/')) { P.panel = 'history'; }
  el.innerHTML = `<div class="controls"><div class="seg" id="bp" role="group" aria-label="Bicycle sections">${PANELS.map(([k, l]) => `<button data-p="${k}" aria-pressed="${k === P.panel}">${l}</button>`).join('')}</div></div><div id="bpanel"></div><div id="bdetail" class="mt"></div>`;
  $$('#bp button').forEach(b => b.onclick = () => { P.panel = b.dataset.p; $$('#bp button').forEach(x => x.setAttribute('aria-pressed', x === b)); $('#bdetail').innerHTML = ''; panel(D, rides); });
  panel(D, rides);
  if (arg && arg.startsWith('ride/')) openRide(D, +arg.slice(5));
}

function openRide(D, id) {
  const a = D.acts.find(x => x.id === id); if (!a) return;
  history.replaceState(null, '', `#bike/ride/${id}`);
  const B = bikes(D.acts.filter(x => x.sport === 'ride'));
  renderDetail($('#bdetail'), a, D, a.sport === 'ride' ? bikeFor(a, B)?.name : null);
  $('#bdetail').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function panel(D, rides) {
  const el = $('#bpanel');
  ({ overview, history: historyP, trends, best, maint })[P.panel](el, D, rides);
}

// ---------------- overview ----------------
function overview(el, D, rides) {
  const a = rides[0];
  const wk = rides.filter(r => r.date > addDays(D.today, -7)), m4 = rides.filter(r => r.date > addDays(D.today, -28));
  el.innerHTML = `<div class="grid g2">
    <div class="card"><div class="card-h"><h2>Latest ride</h2><span class="sub">${fdate(a.date)}</span></div>
      <h3>${esc(a.name)}</h3><div class="chips" style="margin:6px 0 10px">${badge(RIDE_TYPES.find(t => t[0] === a.rideType)[1])}${a.ebike ? badge('eBike', 'warn') : ''}</div>
      <div class="kv">${[[n1(a.distKm) + ' km', 'Distance'], [hmShort(a.durS), 'Duration'], ['+' + n0(a.elevM) + ' m', 'Elevation'], [a.avgKmh ? n1(a.avgKmh) + ' km/h' : '–', 'Avg speed'], [a.avgHR ? n0(a.avgHR) + ' bpm' : '–', 'Avg HR'],
        [a.avgPower ? n0(a.avgPower) + ' W' : 'No meter', 'Power'], [a.trimp != null ? n0(a.trimp) : '–', 'Load (TRIMP)'], [a.kcal ? n0(a.kcal) : '–', 'kcal'], [a.tMax != null ? `${n0(a.tMin)}–${n0(a.tMax)} °C` : '–', 'Temp (device)']].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>
      <p class="small muted mt">TSS needs power and FTP, and there's no power meter in this data, so load is HR-based TRIMP. Temperature comes from the watch sensor, not a weather service.</p>
      <button class="btn sm" id="openlatest" type="button">Ride detail</button></div>
    <div class="card"><h2>Recent volume</h2><div class="kv">
      <div><b>${wk.length}</b><span>rides, 7 d</span></div><div><b>${n0(sum(wk, r => r.distKm))} km</b><span>7 d</span></div><div><b>${n1(sum(wk, r => r.durS) / 3600)} h</b><span>7 d</span></div>
      <div><b>${m4.length}</b><span>rides, 28 d</span></div><div><b>${n0(sum(m4, r => r.distKm))} km</b><span>28 d</span></div><div><b>+${n0(sum(m4, r => r.elevM))} m</b><span>28 d</span></div></div>
      <p class="small mt">${rides.filter(r => r.ebike).length} of ${rides.length} rides are on the eBike. Assisted speed and climbing are not comparable with unassisted rides, so best efforts are kept separate. HR and load still reflect your own effort.</p></div>
  </div>`;
  $('#openlatest').onclick = () => openRide(D, a.id);
}

// ---------------- history ----------------
function historyP(el, D, rides) {
  const present = RIDE_TYPES; // show every discipline, even at 0, so the filters are predictable
  el.innerHTML = `<div class="card"><div class="controls">
      <div class="chips" id="rtf" role="group" aria-label="Ride type">${present.map(([k, l]) => `<button class="chip" data-k="${k}" aria-pressed="${P.types.has(k)}">${l} (${rides.filter(r => r.rideType === k).length})</button>`).join('')}
      <button class="chip" data-k="ebike" aria-pressed="${P.types.has('ebike')}">Assisted only</button></div>
      <input id="rq" type="search" placeholder="Search name or place" aria-label="Search rides" value="${esc(P.q)}" style="flex:1;min-width:160px">
    </div>
    ${rides.some(r => r.rideType === 'other') ? `<div class="controls small" style="margin-top:-4px"><span>${rides.filter(r => r.rideType === 'other').length} rides are Garmin's generic "Cycling" (surface unknown). Reclassify them all as</span>
      <select id="bulkrt" aria-label="New ride type">${RIDE_TYPES.filter(([k]) => k !== 'other').map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><button class="btn sm" id="bulkgo" type="button">Apply</button>
      <span class="muted">Or change single rides in the ride detail. Saved on this device.</span></div>` : ''}
    <div class="sub" id="rsum"></div><div class="scroll" style="max-height:560px;overflow:auto"><table id="rtab"></table></div></div>`;
  const draw = () => {
    const rows = rides.filter(r => { const ty = [...P.types].filter(t => t !== 'ebike'); return (!ty.length || ty.includes(r.rideType)) && (!P.types.has('ebike') || r.ebike) && (!P.q || (r.name + ' ' + r.location).toLowerCase().includes(P.q.toLowerCase())); });
    $('#rsum').textContent = `${rows.length} rides · ${n0(sum(rows, r => r.distKm))} km · +${n0(sum(rows, r => r.elevM))} m · ${n0(sum(rows, r => r.durS) / 3600)} h`;
    table($('#rtab'), rows, [
      { k: 'date', label: 'Date', v: r => r.start, f: r => fshort(r.date) + ` <span class="muted">${r.date.slice(2, 4)}</span>` },
      { k: 'name', label: 'Ride', cls: 'l wrap', f: r => `${esc(r.name)} ${badge(RIDE_TYPES.find(t => t[0] === r.rideType)[1], r.ebike ? 'warn' : '')}` },
      { k: 'km', label: 'km', v: r => r.distKm, f: r => n1(r.distKm) },
      { k: 'dur', label: 'Time', v: r => r.durS, f: r => hmShort(r.durS) },
      { k: 'elev', label: 'Gain m', v: r => r.elevM, f: r => n0(r.elevM), cls: 'hide-sm' },
      { k: 'spd', label: 'km/h', v: r => r.avgKmh || 0, f: r => n1(r.avgKmh), cls: 'hide-sm' },
      { k: 'hr', label: 'HR', v: r => r.avgHR || 0, f: r => r.avgHR ? n0(r.avgHR) : '–', cls: 'hide-sm' },
      { k: 'load', label: 'Load', v: r => r.trimp || 0, f: r => r.trimp != null ? n0(r.trimp) : '–' },
    ], P.sort, id => openRide(D, +id));
  };
  $$('#rtf .chip').forEach(b => b.onclick = () => { const k = b.dataset.k; P.types.has(k) ? P.types.delete(k) : P.types.add(k); b.setAttribute('aria-pressed', P.types.has(k)); draw(); });
  $('#rq').oninput = e => { P.q = e.target.value; draw(); };
  $('#bulkgo')?.addEventListener('click', () => {
    const o = LS.get('rideType', {}); const t = $('#bulkrt').value;
    rides.filter(r => r.rideType === 'other').forEach(r => o[r.id] = t); LS.set('rideType', o); dispatchEvent(new CustomEvent('data-changed'));
  });
  draw();
}

// ---------------- trends ----------------
function trends(el, D, rides) {
  const PM = pmc(D.acts, D.today, 180);
  const indoor = rides.filter(r => r.indoor), outdoor = rides.filter(r => !r.indoor);
  const yr = rides.filter(r => r.date > addDays(D.today, -365));
  const zt = [0, 1, 2, 3, 4].map(i => sum(yr, r => r.zones[i]));
  const ztot = sum(zt) || 1;
  el.innerHTML = `<div class="controls"><div class="seg" id="tagg">${[['week', 'Weekly (16)'], ['month', 'Monthly (12)']].map(([k, l]) => `<button data-k="${k}" aria-pressed="${P.agg === k}">${l}</button>`).join('')}</div>
    <div class="seg" id="tmet">${[['km', 'Distance'], ['h', 'Duration'], ['elev', 'Elevation'], ['rides', 'Rides']].map(([k, l]) => `<button data-k="${k}" aria-pressed="${P.metric === k}">${l}</button>`).join('')}</div></div>
  <div class="grid g2">
    <div class="card"><h3 id="tvt">Volume</h3><div class="chart"><canvas id="c-vol"></canvas></div></div>
    <div class="card"><h3>Intensity distribution (hours by HR zone)</h3><div class="legend"><span><i style="background:var(--z2)"></i>Z1–2 easy</span><span><i style="background:var(--z3)"></i>Z3 tempo</span><span><i style="background:var(--z5)"></i>Z4–5 hard</span></div><div class="chart"><canvas id="c-int"></canvas></div></div>
    <div class="card"><h3>Rolling load (rides only, TRIMP)</h3><div class="legend"><span><i style="background:var(--s2)"></i>7-day</span><span><i style="background:var(--s1)"></i>28-day ÷ 4</span></div><div class="chart"><canvas id="c-roll"></canvas></div></div>
    <div class="card"><h3>Fitness, fatigue, form</h3>${PM.reliable ? `<div class="legend"><span><i style="background:var(--s1)"></i>Fitness (42 d)</span><span><i style="background:var(--s2)"></i>Fatigue (7 d)</span><span><i style="background:var(--s3)"></i>Form</span></div><div class="chart"><canvas id="c-pmc"></canvas></div><p class="small muted">From TRIMP across all activities. Relative trend only; not comparable with TrainingPeaks CTL.</p>` : empty(`<b>Not shown: data too patchy to be reliable.</b><br>${esc(PM.reason)}`)}</div>
  </div>
  <div class="grid g2 mt">
    <div class="card"><h3>Time in HR zones, last 12 months</h3>${ztot > 1 ? zt.map((z, i) => `<div class="small" style="display:flex;gap:8px;align-items:center;margin:5px 0"><span style="width:28px">Z${i + 1}</span><div class="bar" style="flex:1"><i style="width:${z / ztot * 100}%;background:var(--z${i + 1})"></i></div><span style="width:90px;text-align:right">${n1(z / 3600)} h · ${Math.round(z / ztot * 100)}%</span></div>`).join('') : empty('No HR zone data.')}
      <p class="small muted">Power zones: none, as there is no power meter in the data.</p></div>
    <div class="card"><h3>Indoor vs outdoor (all time)</h3>${indoor.length ? `<table><thead><tr><th></th><th>Rides</th><th>Hours</th><th>Avg HR</th><th>Load / h</th></tr></thead><tbody>${[['Outdoor', outdoor], ['Indoor', indoor]].map(([l, x]) => `<tr><td>${l}</td><td>${x.length}</td><td>${n1(sum(x, r => r.durS) / 3600)}</td><td>${n0(sum(x, r => r.avgHR) / (x.filter(r => r.avgHR).length || 1))}</td><td>${n0(sum(x, r => r.trimp) / (sum(x, r => r.durS) / 3600 || 1))}</td></tr>`).join('')}</tbody></table>` : empty(`All ${outdoor.length} rides are outdoor. Indoor rides will appear here once recorded as Indoor Cycling.`)}</div>
  </div>`;
  $$('#tagg button').forEach(b => b.onclick = () => { P.agg = b.dataset.k; trends(el, D, rides); });
  $$('#tmet button').forEach(b => b.onclick = () => { P.metric = b.dataset.k; trends(el, D, rides); });
  const draw = () => {
    const n = P.agg === 'week' ? 16 : 12; const ag = aggregate(rides, P.agg, n, D.today);
    const lab = ag.map(x => P.agg === 'week' ? fshort(x.key) : new Date(x.key + '-15').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }));
    const unit = { km: 'km', h: 'h', elev: 'm', rides: '' }[P.metric];
    $('#tvt').textContent = `${{ km: 'Distance', h: 'Duration', elev: 'Elevation gain', rides: 'Rides' }[P.metric]} per ${P.agg}${unit ? ` (${unit})` : ''}`;
    const tt = tipOpts({});
    chart('c-vol', { type: 'bar', data: { labels: lab, datasets: [{ data: ag.map(x => +x[P.metric].toFixed(1)), backgroundColor: css('--s2'), borderRadius: 3, maxBarThickness: 26 }] }, options: opts({ scales: axes({ y: { beginAtZero: true } }), plugins: { legend: { display: false }, tooltip: tt } }) });
    chart('c-int', { type: 'bar', data: { labels: lab, datasets: [['low', '--z2'], ['mid', '--z3'], ['high', '--z5']].map(([k, c]) => ({ data: ag.map(x => +(x[k] / 3600).toFixed(2)), backgroundColor: css(c), borderRadius: 2, maxBarThickness: 26 })) }, options: opts({ scales: axes({ x: { stacked: true }, y: { stacked: true, beginAtZero: true } }), plugins: { legend: { display: false }, tooltip: tt } }) });
    const days = []; for (let d = addDays(D.today, -119); d <= D.today; d = addDays(d, 1)) days.push(d);
    const L = {}; rides.forEach(r => L[r.date] = (L[r.date] || 0) + (r.trimp || 0));
    const rs = (d, k) => { let s = 0; for (let i = 0; i < k; i++) s += L[addDays(d, -i)] || 0; return s; };
    chart('c-roll', { type: 'line', data: { labels: days.map(fshort), datasets: [{ data: days.map(d => rs(d, 7)), borderColor: css('--s2'), borderWidth: 1.8, pointRadius: 0 }, { data: days.map(d => rs(d, 28) / 4), borderColor: css('--s1'), borderWidth: 1.8, pointRadius: 0, borderDash: [5, 4] }] }, options: opts({ scales: axes({ y: { beginAtZero: true } }), plugins: { legend: { display: false }, tooltip: tt } }) });
    if (PM.reliable) chart('c-pmc', { type: 'line', data: { labels: PM.series.map(s => fshort(s.date)), datasets: [['ctl', '--s1'], ['atl', '--s2'], ['tsb', '--s3']].map(([k, c]) => ({ data: PM.series.map(s => +s[k].toFixed(1)), borderColor: css(c), borderWidth: 1.8, pointRadius: 0 })) }, options: opts({ scales: axes(), plugins: { legend: { display: false }, tooltip: tt } }) });
  };
  onRedraw('bike', draw);
}

// ---------------- best efforts ----------------
async function best(el, D, rides) {
  el.innerHTML = '<div class="skel"></div>';
  const T = await tracks(rides.map(r => r.id));
  const B = bestEfforts(rides, T);
  const labels = { unassisted: 'Unassisted outdoor', ebike: 'eBike (assisted)', indoor: 'Indoor' };
  const link = r => r ? `<a href="#bike/ride/${r.id}" data-ride="${r.id}">${esc(r.name)}</a> · ${fshort(r.date)}` : '';
  el.innerHTML = `<div class="grid g2">${Object.entries(B).map(([k, b]) => `<div class="card"><div class="card-h"><h2>${labels[k]}</h2><span class="sub">${b.count} ride${b.count === 1 ? '' : 's'}</span></div>
    <div class="kv"><div><b>${n1(b.longest.distKm)} km</b><span>Longest ride</span></div><div><b>+${n0(b.climb.elevM)} m</b><span>Biggest climbing day</span></div></div>
    <p class="small">${link(b.longest)}<br>${link(b.climb)}</p>
    <div class="scroll mt"><table><thead><tr><th>Distance</th><th>Time</th><th>km/h</th><th class="l">Basis</th></tr></thead><tbody>${b.eff.map(e => `<tr><td>${e.km} km</td><td>${e.s ? hmShort(e.s) : '–'}</td><td>${e.s ? n1(e.km / e.s * 3600) : '–'}</td><td class="l small">${!e.s ? 'No ride this long' : e.est === 'segment' ? 'Estimated segment' : 'Whole-ride average'}<br>${link(e.ride)}</td></tr>`).join('')}</tbody></table></div>
    ${b.hasPower ? `<h3 class="mt">Best average power</h3><table><tbody>${b.power.map(p => `<tr><td>${p.secs >= 60 ? p.secs / 60 + ' min' : p.secs + ' s'}</td><td>${p.w ? n0(p.w) + ' W' : '–'}</td><td class="l small">${link(p.ride)}</td></tr>`).join('')}</tbody></table>` : '<p class="small muted mt">Best power: no power data.</p>'}
  </div>`).join('')}</div>
  <p class="small muted mt"><b>Estimated segment</b> = fastest stretch within a ride, interpolated from ~300 samples per ride (±2–3%). <b>Whole-ride average</b> = average moving speed of the fastest ride at least that long; it understates your true best and isn't a segment PR. eBike times are kept separate because the motor makes them non-comparable.</p>`;
  $$('[data-ride]', el).forEach(a => a.onclick = e => { e.preventDefault(); openRide(D, +a.dataset.ride); });
}

// ---------------- maintenance ----------------
function maint(el, D, rides) {
  const B = bikes(rides); const M = LS.get('maint', {});
  el.innerHTML = B.map(b => {
    const br = rides.filter(r => bikeFor(r, B) === b);
    return `<div class="card mt"><div class="card-h"><h2><input aria-label="Bike name" data-bike="${b.id}" value="${esc(b.name)}" style="font-weight:700;font-size:15px;border-color:transparent;background:transparent;padding:2px 4px;min-height:0;width:12ch"></h2><span class="sub">${br.length} rides · ${n0(sum(br, r => r.distKm))} km recorded</span></div>
    <div class="grid">${TASKS.map(t => {
      const last = M[b.id]?.[t.id]; const s = taskStatus(t, last, br, D.today, b.ebike);
      const lim = [s.kmLim ? `${n0(s.kmLim)} km` : null, t.days ? `${t.days} days` : null].filter(Boolean).join(' or ');
      return `<div style="border-top:1px solid var(--grid);padding-top:10px">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>${t.name}</b>${s.state === 'unset' ? badge('Not set') : s.state === 'due' ? badge('Due', 'bad') : s.state === 'soon' ? badge('Soon', 'warn') : badge('OK', 'good')}</div>
        ${s.state === 'unset' ? `<div class="small muted">Enter the date you last did this; the dashboard counts from there.</div>` : `<div class="bar ${s.state}" style="margin:6px 0" role="progressbar" aria-valuenow="${Math.round(s.pct * 100)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.min(100, s.pct * 100)}%"></i></div>
        <div class="small">${n0(s.kmSince)} km · ${s.daysSince} days since ${fshort(last.date)}. Interval: ${lim}.</div>`}
        <div class="small muted">${t.tip}</div>
        <div class="chips mt"><button class="btn sm" data-done="${b.id}|${t.id}" type="button">Done today</button><label class="small">or last done <input type="date" data-set="${b.id}|${t.id}" value="${last?.date || ''}" max="${D.today}" style="min-height:30px;padding:3px 6px"></label></div></div>`;
    }).join('')}</div></div>`;
  }).join('') + `<p class="small muted mt">Counters use recorded outdoor rides only and are saved on this device. Rides not recorded on the watch won't count, so treat the numbers as a minimum. Intervals are practical defaults; eBike drivetrains get shorter ones because the motor adds torque.</p>`;
  const save = (b, t, date) => { const m = LS.get('maint', {}); (m[b] = m[b] || {})[t] = date ? { date } : undefined; if (!date) delete m[b][t]; LS.set('maint', m); maint(el, D, rides); };
  $$('[data-done]', el).forEach(x => x.onclick = () => { const [b, t] = x.dataset.done.split('|'); save(b, t, D.today); });
  $$('[data-set]', el).forEach(x => x.onchange = () => { const [b, t] = x.dataset.set.split('|'); save(b, t, x.value || null); });
  $$('[data-bike]', el).forEach(x => x.onchange = () => { const list = bikes(rides).map(b => b.id === x.dataset.bike ? { ...b, name: x.value || b.name } : b); LS.set('bikes', list); });
}
export { mondayOf };
