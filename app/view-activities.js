// Activities (all sports) and Trips (named multi-day blocks such as the HRP traverse, plus suggested ones).
import { renderDetail } from './view-detail.js';
import { track, tracks } from './store.js';
import { esc, fdate, fshort, hmShort, n0, n1, sum, addDays, daysBetween } from './util.js';
import { $, $$, badge, empty, table, map, fit, chart, onRedraw, axes, opts, tipOpts, css, routeLayer } from './ui.js';

// Distinct stage colours that stay readable on both light and dark topo tiles.
const STAGE = ['#2a78d6', '#eb6834', '#1baf7a', '#9b59b6', '#d4a100', '#e34948', '#17a2b8', '#8e5a2b'];

const LABEL = t => ({ e_bike_mountain: 'eMTB', resort_skiing: 'Skiing', strength_training: 'Strength', lap_swimming: 'Pool swim', open_water_swimming: 'Open water', kayaking_v2: 'Kayak', tennis_v2: 'Tennis', paddelball: 'Padel' }[t] || t.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()));
const F = { type: '', year: '', q: '', sort: { key: 'date', dir: 'desc' } };

export function renderActivities(D, arg) {
  const el = $('#activities'); const A = D.acts;
  const types = [...new Set(A.map(a => a.type))].sort((x, y) => A.filter(a => a.type === y).length - A.filter(a => a.type === x).length);
  const years = [...new Set(A.map(a => a.date.slice(0, 4)))].sort().reverse();
  el.innerHTML = `<div class="card glob"><div class="card-h"><h2>Everything you've done</h2><span class="sub" id="globsub"></span></div>
    <div class="globgrid"><div>${heatYears(A)}</div><div><div id="glob-map" class="map"></div><p class="small muted" id="globnote"></p></div></div></div>
    <div class="card"><div class="controls">
    <select id="ft" aria-label="Activity type"><option value="">All types</option>${types.map(t => `<option value="${t}" ${F.type === t ? 'selected' : ''}>${LABEL(t)} (${A.filter(a => a.type === t).length})</option>`).join('')}</select>
    <select id="fy" aria-label="Year"><option value="">All years</option>${years.map(y => `<option ${F.year === y ? 'selected' : ''}>${y}</option>`).join('')}</select>
    <input id="fq" type="search" placeholder="Search" aria-label="Search activities" value="${esc(F.q)}" style="flex:1;min-width:140px"></div>
    <div class="sub" id="asum"></div><div class="scroll" style="max-height:520px;overflow:auto"><table id="atab"></table></div></div><div id="adetail" class="mt"></div>`;
  const open = id => { const a = A.find(x => x.id === +id); if (!a) return; history.replaceState(null, '', '#activities/' + id); renderDetail($('#adetail'), a, D); $('#adetail').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const draw = () => {
    const rows = A.filter(a => (!F.type || a.type === F.type) && (!F.year || a.date.startsWith(F.year)) && (!F.q || (a.name + ' ' + a.location + ' ' + LABEL(a.type)).toLowerCase().includes(F.q.toLowerCase())));
    $('#asum').textContent = `${rows.length} activities · ${n0(sum(rows, a => a.distKm))} km · +${n0(sum(rows, a => a.elevM))} m · ${n0(sum(rows, a => a.durS) / 3600)} h`;
    table($('#atab'), rows, [
      { k: 'date', label: 'Date', v: a => a.start, f: a => fdate(a.date) },
      { k: 'n', label: 'Activity', cls: 'l wrap', f: a => `${esc(a.name)} ${badge(LABEL(a.type))}` },
      { k: 'km', label: 'km', v: a => a.distKm, f: a => a.distKm ? n1(a.distKm) : '–' },
      { k: 't', label: 'Time', v: a => a.durS, f: a => hmShort(a.durS) },
      { k: 'e', label: 'Gain', v: a => a.elevM, f: a => a.elevM ? n0(a.elevM) : '–', cls: 'hide-sm' },
      { k: 'l', label: 'Load', v: a => a.trimp || 0, f: a => a.trimp != null ? n0(a.trimp) : '–' },
    ], F.sort, open);
  };
  $('#ft').onchange = e => { F.type = e.target.value; draw(); }; $('#fy').onchange = e => { F.year = e.target.value; draw(); }; $('#fq').oninput = e => { F.q = e.target.value; draw(); };
  draw(); if (arg) open(arg);
  allRoutes(A);
}

// ---------------- Trips ----------------
// Consecutive stages with the same name on the same day are one stage (a split day, e.g. two Aldudes legs).
// The raw activities are untouched; this only changes how the trip is shown.
export function mergeStages(S, enabled = true) {
  const groups = [];
  for (const a of S) {
    const name = a.name.replace(/ Hiking$/, '');
    const last = groups[groups.length - 1];
    if (enabled && last && last.date === a.date && last.name === name) last.parts.push(a);
    else groups.push({ date: a.date, name, parts: [a] });
  }
  return groups.map(g => {
    const p = g.parts, dur = sum(p, a => a.durS) || 1;
    return {
      ...g, start: p[0].start,
      distKm: sum(p, a => a.distKm), elevM: sum(p, a => a.elevM), elapsedS: sum(p, a => a.elapsedS), movS: sum(p, a => a.movS),
      trimp: sum(p, a => a.trimp || 0), maxElev: Math.max(...p.map(a => a.maxElev || 0)),
      avgHR: p.some(a => a.avgHR) ? sum(p, a => (a.avgHR || 0) * a.durS) / dur : null,
    };
  });
}

// Trips live in config.json → `trips` (a list). An older config with a single `hrp` block still works.
export function tripsOf(cfg) {
  const L = Array.isArray(cfg?.trips) ? cfg.trips : cfg?.hrp ? [{ id: 'hrp', story: 'story', ...cfg.hrp }] : [];
  return L.filter(t => t && t.start && t.end).map((t, i) => ({ mergeSameDay: true, types: [], ...t, id: String(t.id || 'trip-' + (i + 1)) }))
    .sort((a, b) => b.start.localeCompare(a.start));
}
const inTrip = (a, T) => a.date >= T.start && a.date <= T.end && (!T.types?.length || T.types.includes(a.type));
const tripActs = (A, T) => A.filter(a => inTrip(a, T)).sort((a, b) => a.start.localeCompare(b.start));
const spanDays = T => daysBetween(T.start, T.end) + 1;

/** Multi-day blocks away from home that have no name yet: 3+ days with activities, gaps of 3 days or less,
 *  outside the most common location. Suggestions only; nothing is saved. */
export function detectTrips(A, named = [], { minDays = 3, maxGap = 3 } = {}) {
  const cnt = {}; A.forEach(a => { if (a.location) cnt[a.location] = (cnt[a.location] || 0) + 1; });
  const home = Object.entries(cnt).sort((x, y) => y[1] - x[1])[0]?.[0];
  const away = A.filter(a => a.location && a.location !== home && !named.some(t => a.date >= t.start && a.date <= t.end))
    .sort((a, b) => a.start.localeCompare(b.start));
  const blocks = [];
  for (const a of away) {
    const b = blocks[blocks.length - 1];
    if (b && daysBetween(b.end, a.date) <= maxGap) { b.acts.push(a); b.end = a.date; } else blocks.push({ start: a.date, end: a.date, acts: [a] });
  }
  return blocks.filter(b => new Set(b.acts.map(a => a.date)).size >= minDays).map(b => {
    const pl = {}; b.acts.forEach(a => { pl[a.location] = (pl[a.location] || 0) + 1; });
    const sp = {}; b.acts.forEach(a => { sp[a.sport] = (sp[a.sport] || 0) + 1; });
    return { ...b, places: Object.keys(pl).sort((x, y) => pl[y] - pl[x]), sport: Object.keys(sp).sort((x, y) => sp[y] - sp[x])[0],
      actDays: new Set(b.acts.map(a => a.date)).size, distKm: sum(b.acts, a => a.distKm), elevM: sum(b.acts, a => a.elevM) };
  }).reverse();
}
const SPORT_WORD = { hike: 'Hiking', ride: 'Cycling', run: 'Running', moto: 'Motorcycle', ski: 'Skiing', swim: 'Swimming', strength: 'Strength', other: 'Mixed' };

/** #trips → list of trips; #trips/<id> → one trip in full. */
export function renderTrips(D, arg) {
  const T = tripsOf(D.cfg);
  if (arg) { const t = T.find(x => x.id === arg); if (t) return renderTrip(D, t); }
  const el = $('#trips');
  const cards = T.map(t => {
    const S = tripActs(D.acts, t), G = mergeStages(S, t.mergeSameDay !== false);
    return `<a class="trip" href="#trips/${esc(t.id)}"><div class="trip-h"><h3>${esc(t.name || 'Trip')}</h3><span class="sub">${fdate(t.start)} – ${fdate(t.end)}</span></div>
      <div class="kv"><div><b>${G.length}</b><span>stages in ${spanDays(t)} days</span></div><div><b>${n0(sum(S, a => a.distKm))} km</b><span>distance</span></div>
      <div><b>+${n0(sum(S, a => a.elevM))} m</b><span>ascent</span></div><div><b>${hmShort(sum(S, a => a.elapsedS))}</b><span>elapsed</span></div></div>
      <span class="trip-go">Open summary →</span></a>`;
  }).join('');
  const sug = detectTrips(D.acts, T);
  el.innerHTML = `<div class="card"><div class="card-h"><h2>Trips</h2><span class="sub">${T.length} named · multi-day blocks, each with its own map, profile and summary</span></div>
      ${T.length ? `<div class="trips">${cards}</div>` : empty('No trips named yet.')}</div>
    ${sug.length ? `<div class="card mt"><div class="card-h"><h2>Other multi-day blocks</h2><span class="sub">${sug.length} found: 3+ active days away from home</span></div>
      <p class="small muted">Found automatically from dates and places. Name one in <code>config.json</code> → <code>trips</code> and it gets a full page like the ones above.</p>
      ${sug.map((b, i) => `<details class="blk"><summary><span>${fdate(b.start)}${b.end !== b.start ? ' – ' + fdate(b.end) : ''}</span> <b>${esc(b.places.slice(0, 3).join(', '))}${b.places.length > 3 ? ' …' : ''}</b>
        <span class="sub">${SPORT_WORD[b.sport] || 'Mixed'} · ${b.actDays} active days · ${n0(b.distKm)} km · +${n0(b.elevM)} m</span></summary>
        <div class="scroll"><table id="sug${i}"></table></div></details>`).join('')}</div>` : ''}`;
  sug.forEach((b, i) => table($('#sug' + i), b.acts, [
    { k: 'd', label: 'Date', v: a => a.start, f: a => fshort(a.date) }, { k: 'n', label: 'Activity', cls: 'l wrap', f: a => esc(a.name) },
    { k: 'km', label: 'km', v: a => a.distKm, f: a => a.distKm ? n1(a.distKm) : '–' }, { k: 'e', label: 'Gain', v: a => a.elevM, f: a => a.elevM ? n0(a.elevM) : '–' },
  ], { key: 'd', dir: 'asc' }, id => { location.hash = '#activities/' + id; }));
}

/** Plain-language findings for one trip. Every line is computed from the stages; nothing is assumed. */
function findings(S, G, T) {
  const by = f => [...G].sort((a, b) => f(b) - f(a))[0];
  const nm = g => `${esc(g.name)} (${fshort(g.date)})`;
  const z = [0, 1, 2, 3, 4].map(i => sum(S, a => a.zones?.[i] || 0)); const zt = sum(z) || 0;
  const days = spanDays(T), stageDays = new Set(G.map(g => g.date)).size;
  const L = [];
  const far = by(g => g.distKm), up = by(g => g.elevM), long = by(g => g.elapsedS), hard = by(g => g.trimp || 0);
  L.push(`<b>Longest stage:</b> ${nm(far)}, ${n1(far.distKm)} km.`);
  L.push(`<b>Biggest climb:</b> ${nm(up)}, +${n0(up.elevM)} m.`);
  if (long !== far) L.push(`<b>Longest day on the trail:</b> ${nm(long)}, ${hmShort(long.elapsedS)} elapsed.`);
  if (hard?.trimp) L.push(`<b>Hardest by load:</b> ${nm(hard)}, TRIMP ${n0(hard.trimp)}.`);
  const kmh = sum(G, g => g.distKm) / (sum(G, g => g.elapsedS) / 3600 || 1);
  L.push(`<b>Pace:</b> ${n1(kmh)} km/h on average including stops, ${n0(sum(G, g => g.elevM) / sum(G, g => g.distKm || 0) * 10 || 0)} m of climbing per 10 km.`);
  if (zt) L.push(`<b>Effort:</b> ${Math.round((z[0] + z[1]) / zt * 100)}% of the time in Z1–2, ${Math.round((z[3] + z[4]) / zt * 100)}% in Z4–5. ${(z[3] + z[4]) / zt > 0.15 ? 'That is high for multi-day trekking: arriving fitter or slowing the climbs would cut the cost.' : 'Mostly easy, which is what you want on a multi-day trek.'}`);
  if (G.length >= 4) {
    const h = Math.floor(G.length / 2), a = G.slice(0, h), b = G.slice(h);
    const ka = sum(a, g => g.distKm) / a.length, kb = sum(b, g => g.distKm) / b.length;
    L.push(`<b>First half vs second half:</b> ${n1(ka)} vs ${n1(kb)} km per stage, +${n0(sum(a, g => g.elevM) / a.length)} vs +${n0(sum(b, g => g.elevM) / b.length)} m.`);
  }
  if (days > stageDays) L.push(`<b>Days without a stage:</b> ${days - stageDays} of ${days}.`);
  L.push('<b>Planning note:</b> plan on elapsed time. Garmin\'s moving time undercounts slow, steep ground.');
  return L;
}

async function renderTrip(D, T) {
  const el = $('#trips');
  const S = tripActs(D.acts, T);
  const head = `<p class="mb"><a class="btn sm" href="#trips">← All trips</a></p>`;
  if (!S.length) { el.innerHTML = head + empty('No activities in this trip\'s dates.'); return; }
  const G = mergeStages(S, T.mergeSameDay !== false);
  const tot = f => sum(S, f), days = spanDays(T);
  const z = [0, 1, 2, 3, 4].map(i => sum(S, a => a.zones?.[i] || 0)); const zt = sum(z);
  el.innerHTML = `${head}<div class="card"><div class="card-h"><h2>${esc(T.name || 'Trip')}</h2><span class="sub">${fdate(T.start)} – ${fdate(T.end)} · ${G.length} stages in ${days} days</span></div>
    <div class="kv kv-lg"><div><b>${n0(tot(a => a.distKm))} km</b><span>${n1(tot(a => a.distKm) / G.length)} km per stage</span></div><div><b>+${n0(tot(a => a.elevM))} m</b><span>ascent</span></div>
    <div><b>−${n0(tot(a => a.elevLoss || 0))} m</b><span>descent</span></div><div><b>${hmShort(tot(a => a.elapsedS))}</b><span>elapsed</span></div>
    <div><b>${n0(Math.max(...S.map(a => a.maxElev || 0)))} m</b><span>high point</span></div>${zt ? `<div><b>${Math.round((z[0] + z[1]) / zt * 100)}%</b><span>time in Z1–2</span></div>` : ''}</div>
    <h3 class="mt">Summary</h3><ul class="findings">${findings(S, G, T).map(l => `<li>${l}</li>`).join('')}</ul>
    ${T.story ? `<p class="mt"><a class="btn pri" href="#${esc(T.story)}">Read the day-by-day story</a></p>` : ''}</div>
    <div class="card mt"><h2>Route</h2><div class="legend" id="tlegend"></div><div class="map" id="tmap" style="height:480px"></div>
    <div class="sub mt">Elevation profile across all stages</div><div class="chart"><canvas id="tprof"></canvas></div>
    <div class="sub mt">Distance and ascent per stage</div><div class="chart"><canvas id="tbars"></canvas></div></div>
    <div class="card mt"><h2>Stages</h2><div class="scroll"><table id="ttab"></table></div>${G.length < S.length ? `<p class="small muted">${S.length - G.length} split day${S.length - G.length === 1 ? '' : 's'} merged into one stage (same name, same day).</p>` : ''}</div>`;
  table($('#ttab'), G.map((g, i) => ({ ...g, i: i + 1 })), [
    { k: 'i', label: '#', v: g => g.i, f: g => g.i }, { k: 'd', label: 'Date', v: g => g.start, f: g => fshort(g.date) }, { k: 'n', label: 'Stage', cls: 'l wrap', f: g => esc(g.name) },
    { k: 'km', label: 'km', v: g => g.distKm, f: g => n1(g.distKm) }, { k: 'up', label: 'Ascent', v: g => g.elevM, f: g => n0(g.elevM) }, { k: 'el', label: 'Elapsed', v: g => g.elapsedS, f: g => hmShort(g.elapsedS) },
    { k: 'hr', label: 'Avg HR', v: g => g.avgHR || 0, f: g => g.avgHR ? n0(g.avgHR) : '–', cls: 'hide-sm' }, { k: 'l', label: 'Load', v: g => g.trimp || 0, f: g => n0(g.trimp), cls: 'hide-sm' },
  ], { key: 'i', dir: 'asc' }, id => { location.hash = '#activities/' + id; });
  $('#tlegend').innerHTML = G.map((g, i) => `<span><i style="background:${STAGE[i % STAGE.length]}"></i>${i + 1}. ${esc(g.name)}</span>`).join('');
  const lbl = G.map((g, i) => `${i + 1}`);
  onRedraw('tripbars', () => chart('tbars', { type: 'bar', data: { labels: lbl, datasets: [
    { label: 'km', data: G.map(g => +g.distKm.toFixed(1)), backgroundColor: css('--s1'), yAxisID: 'y', borderRadius: 3 },
    { label: 'Ascent (m)', data: G.map(g => Math.round(g.elevM)), backgroundColor: css('--s2') || '#eb6834', yAxisID: 'y2', borderRadius: 3 }] },
    options: opts({ scales: axes({ extra: { y2: { position: 'right', grid: { display: false }, border: { display: false }, ticks: { color: css('--text-2') } } } }), plugins: { legend: { display: true, labels: { color: css('--text-2'), boxWidth: 10 } }, tooltip: tipOpts({ title: it => `${it[0].dataIndex + 1}. ${G[it[0].dataIndex].name}` }) } }) }));
  const TR = await tracks(S.map(a => a.id));
  try {
    const m = await map('tmap'); const L = window.L; const all = [];
    G.forEach((g, i) => g.parts.forEach(a => { const t = TR[a.id]; if (!t?.line?.length) return; routeLayer(L, t.line, STAGE[i % STAGE.length], `Stage ${i + 1}`).addTo(m).bindTooltip(`${i + 1}. ${esc(g.name)} · ${n1(g.distKm)} km · +${n0(g.elevM)} m`, { sticky: true }); all.push(...t.line); }));
    if (all.length) fit(m, L.latLngBounds(all));
  } catch { $('#tmap').outerHTML = empty('Map could not load.'); }
  let off = 0; const pts = [];
  G.forEach((g, i) => g.parts.forEach(a => { const t = TR[a.id]; if (t) t.dist.forEach((d, j) => { if (d != null && t.elev[j] != null) pts.push({ x: +(off + d).toFixed(2), y: t.elev[j], i }); }); off += a.distKm; }));
  onRedraw('trips', () => chart('tprof', { type: 'line', data: { datasets: [{ data: pts, borderColor: css('--s1'), backgroundColor: css('--s1') + '22', fill: true, borderWidth: 1.5, pointRadius: 0 }] }, options: opts({ parsing: false, scales: axes({ x: { type: 'linear', min: 0, max: Math.ceil(off), ticks: { color: css('--text-2'), callback: v => v + ' km' } } }), plugins: { legend: { display: false }, tooltip: tipOpts({ title: it => `${it[0].raw.i + 1}. ${G[it[0].raw.i].name}`, label: it => ` km ${n1(it.raw.x)} · ${n0(it.raw.y)} m` }) } }) }));
}

// ---------------- Everything: calendar heatmap and all routes on one map ----------------
const SPORT_COLOR = { ride: '#2a78d6', hike: '#eb6834', run: '#1baf7a', moto: '#c0392b', other: '#9b59b6' };

/** One calendar per year, weeks as columns, shaded by hours that day. Hover a square for the day's totals. */
function heatYears(A) {
  const years = [...new Set(A.map(a => a.date.slice(0, 4)))].sort().reverse().slice(0, 3);
  const by = {}, cnt = {};
  for (const a of A) { by[a.date] = (by[a.date] || 0) + a.durS / 3600; cnt[a.date] = (cnt[a.date] || 0) + 1; }
  const max = Math.max(1, ...Object.values(by));
  const lvl = h => !h ? 0 : Math.min(4, Math.ceil(h / max * 4));
  const cal = y => {
    const dow = (new Date(y + '-01-01T12:00').getDay() + 6) % 7, first = addDays(y + '-01-01', -dow);
    let cells = '';
    for (let i = 0; i < 371; i++) {
      const d = addDays(first, i);
      if (!d.startsWith(y)) { cells += '<i class="off"></i>'; continue; }
      const h = by[d] || 0;
      cells += `<i class="l${lvl(h)}" title="${fdate(d)}: ${cnt[d] || 0} ${cnt[d] === 1 ? 'activity' : 'activities'}${h ? `, ${hmShort(h * 3600)}` : ''}"></i>`;
    }
    const total = A.filter(a => a.date.startsWith(y));
    return `<div class="cal"><div class="cal-h"><b>${y}</b><span class="sub">${total.length} activities · ${n0(sum(total, a => a.durS) / 3600)} h</span></div>
      <div class="heat">${cells}</div></div>`;
  };
  return `<div class="cals">${years.map(cal).join('')}</div>
    <div class="legend mt">${Object.entries(SPORT_COLOR).map(([k, c]) => `<span><i style="background:${c}"></i>${k === 'other' ? 'other' : k}</span>`).join('')}<span class="muted">Darker = more hours that day</span></div>`;
}

/** Every track overlaid, colour by sport. Shows how far you have ridden and walked, in one picture. */
async function allRoutes(A) {
  const withTrack = A.filter(a => a.sport && a.date); const m = await map('glob-map'); if (!m) return;
  const ts = await tracks(withTrack.map(a => a.id));
  const g = window.L.featureGroup().addTo(m); let shown = 0;
  for (const a of withTrack) {
    const t = ts[a.id]; if (!t?.line?.length) continue;
    shown++;
    window.L.polyline(t.line, { color: SPORT_COLOR[a.sport] || SPORT_COLOR.other, weight: 2, opacity: .55, lineJoin: 'round' }).addTo(g);
  }
  if (shown) fit(m, g.getBounds());
  $('#globsub').textContent = `${shown} routes`;
  $('#globnote').textContent = shown < A.length ? `${shown} of ${A.length} activities have a GPS track. Others are shown in the calendar only.` : `All ${A.length} activities.`;
}
