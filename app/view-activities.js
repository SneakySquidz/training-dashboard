// Activities (all sports) and Trips (multi-day blocks such as the HRP traverse).
import { renderDetail } from './view-detail.js';
import { track, tracks } from './store.js';
import { esc, fdate, fshort, hmShort, n0, n1, sum, addDays } from './util.js';
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

export async function renderTrips(D) {
  const el = $('#trips'); const T = D.cfg.hrp;
  if (!T) { el.innerHTML = empty('No trip configured in config.json.'); return; }
  const S = D.acts.filter(a => a.date >= T.start && a.date <= T.end && T.types.includes(a.type)).sort((a, b) => a.start.localeCompare(b.start));
  if (!S.length) { el.innerHTML = empty('No activities in the configured trip dates.'); return; }
  const G = mergeStages(S, T.mergeSameDay !== false);
  const tot = f => sum(S, f); const days = Math.round((new Date(T.end) - new Date(T.start)) / 864e5) + 1;
  const z = [0, 1, 2, 3, 4].map(i => sum(S, a => a.zones[i])); const zt = sum(z) || 1;
  const hardest = [...S].sort((a, b) => (b.trimp || 0) - (a.trimp || 0))[0];
  el.innerHTML = `<div class="card"><div class="card-h"><h2>${esc(T.name)}</h2><span class="sub">${fdate(T.start)} – ${fdate(T.end)} · ${G.length} stages in ${days} days</span></div>
    <div class="kv"><div><b>${n0(tot(a => a.distKm))} km</b><span>${n1(tot(a => a.distKm) / G.length)} km/stage</span></div><div><b>+${n0(tot(a => a.elevM))} m</b><span>ascent</span></div>
    <div><b>${hmShort(tot(a => a.elapsedS))}</b><span>elapsed</span></div><div><b>${n0(Math.max(...S.map(a => a.maxElev || 0)))} m</b><span>high point</span></div>
    <div><b>${Math.round((z[0] + z[1]) / zt * 100)}%</b><span>time in Z1–2</span></div></div>
    <p class="small mt"><b>What it tells you:</b> the hardest stage by load was ${esc(hardest.name.replace(/ Hiking$/, ''))} (${fshort(hardest.date)}, TRIMP ${n0(hardest.trimp)}). ${(z[3] + z[4]) / zt > 0.15 ? 'More than 15% of the time was in Z4–5, which is high for multi-day trekking. Arriving fitter or slowing the climbs would cut the cost.' : 'Effort stayed mostly easy, which is what you want on a multi-day trek.'} Plan future stages on elapsed time: Garmin's moving time undercounts slow, steep ground.</p>
    <div class="legend mt" id="tlegend"></div><div class="map" id="tmap" style="height:420px"></div>
    <div class="sub mt">Elevation profile across all stages</div><div class="chart"><canvas id="tprof"></canvas></div></div>
    <div class="card mt"><h2>Stages</h2><div class="scroll"><table id="ttab"></table></div>${G.length < S.length ? `<p class="small muted">${S.length - G.length} split day${S.length - G.length === 1 ? '' : 's'} merged into one stage (same name, same day).</p>` : ''}</div>`;
  table($('#ttab'), G.map((g, i) => ({ ...g, i: i + 1 })), [
    { k: 'i', label: '#', v: g => g.i, f: g => g.i }, { k: 'd', label: 'Date', v: g => g.start, f: g => fshort(g.date) }, { k: 'n', label: 'Stage', cls: 'l wrap', f: g => esc(g.name) },
    { k: 'km', label: 'km', v: g => g.distKm, f: g => n1(g.distKm) }, { k: 'up', label: 'Ascent', v: g => g.elevM, f: g => n0(g.elevM) }, { k: 'el', label: 'Elapsed', v: g => g.elapsedS, f: g => hmShort(g.elapsedS) },
    { k: 'hr', label: 'Avg HR', v: g => g.avgHR || 0, f: g => g.avgHR ? n0(g.avgHR) : '–', cls: 'hide-sm' }, { k: 'l', label: 'Load', v: g => g.trimp || 0, f: g => n0(g.trimp), cls: 'hide-sm' },
  ], { key: 'i', dir: 'asc' }, id => { location.hash = '#activities/' + id; });
  $('#tlegend').innerHTML = G.map((g, i) => `<span><i style="background:${STAGE[i % STAGE.length]}"></i>${i + 1}. ${esc(g.name)}</span>`).join('');
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
const SPORT_COLOR = { ride: '#2a78d6', hike: '#eb6834', run: '#1baf7a', other: '#9b59b6' };

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
