// Activity / ride detail panel, shared by Bicycle and Activities.
import { track, LS } from './store.js';
import { splits } from './cycling.js';
import { RIDE_TYPES } from './model.js';
import { esc, fdate, hmShort, n0, n1, mean } from './util.js';
import { $, chart, onRedraw, axes, opts, tipOpts, css, map, fit, empty, badge, routeLayer } from './ui.js';

const hav = (a, b) => { const R = 6371, r = Math.PI / 180, dl = (b[0] - a[0]) * r, dn = (b[1] - a[1]) * r; const x = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

export async function renderDetail(el, a, D, bikeName) {
  const id = `d${a.id}`;
  const notes = LS.get('notes', {});
  const rt = RIDE_TYPES.find(r => r[0] === a.rideType)?.[1];
  el.innerHTML = `<div class="card">
    <div class="card-h"><h2>${esc(a.name)} <span class="sub" style="font-weight:400">· ${fdate(a.date)} ${a.start.slice(11, 16)}</span></h2>
      <a class="btn sm" href="https://connect.garmin.com/modern/activity/${a.id}" target="_blank" rel="noopener noreferrer">Open in Garmin ↗</a></div>
    <div class="chips" style="margin-bottom:10px">${rt ? badge(rt) : ''}${a.ebike ? badge('eBike: assisted', 'warn') : ''}${a.indoor ? badge('Indoor') : ''}${bikeName ? badge('Bike: ' + bikeName) : ''}</div>
    ${a.sport === 'ride' ? `<label class="f" style="max-width:260px;margin-bottom:10px">Ride type (Garmin: ${esc(RIDE_TYPES.find(r => r[0] === a.rideTypeGarmin)?.[1] || '–')})
      <select id="${id}-rt">${RIDE_TYPES.map(([k, l]) => `<option value="${k}" ${k === a.rideType ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
    <div class="kv">${[
      [a.distKm ? n1(a.distKm) + ' km' : null, 'Distance'], [hmShort(a.durS), 'Duration'], [a.movS && a.movS !== a.durS ? hmShort(a.movS) : null, 'Moving'],
      [a.elevM ? '+' + n0(a.elevM) + ' m' : null, 'Elevation gain'], [a.avgKmh ? n1(a.avgKmh) + ' km/h' : null, 'Avg speed'],
      [a.avgHR ? `${n0(a.avgHR)} / ${n0(a.maxHR)}` : null, 'Avg / max HR'], [a.avgPower ? n0(a.avgPower) + ' W' : null, 'Avg power'],
      [a.trimp != null ? n0(a.trimp) : null, 'Load (TRIMP)'], [a.garminLoad ? n0(a.garminLoad) : null, 'Garmin load'],
      [a.kcal ? n0(a.kcal) : null, 'kcal'], [a.tMax != null ? `${n0(a.tMin)}–${n0(a.tMax)} °C` : null, 'Temp (device)'],
    ].filter(x => x[0]).map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>
    ${a.tMax != null ? '<p class="small muted mt">Temperature comes from the watch sensor, which body heat skews upwards. No weather service is connected.</p>' : ''}
    <div class="map mt" id="${id}-map"></div>
    <div id="${id}-charts" class="grid mt"><div class="skel"></div></div>
    <div id="${id}-splits" class="mt"></div>
    <label class="f mt">Notes (saved on this device only)<textarea id="${id}-notes" rows="2" placeholder="How did it feel? Surface, kit, fuelling…">${esc(notes[a.id] || '')}</textarea></label>
  </div>`;
  $(`#${id}-rt`)?.addEventListener('change', e => {
    const o = LS.get('rideType', {}); if (e.target.value === a.rideTypeGarmin) delete o[a.id]; else o[a.id] = e.target.value;
    LS.set('rideType', o); dispatchEvent(new CustomEvent('data-changed'));
  });
  $(`#${id}-notes`).onchange = e => { const n = LS.get('notes', {}); n[a.id] = e.target.value; LS.set('notes', n); };

  const t = await track(a.id);
  // map
  try {
    const m = await map(`${id}-map`);
    if (m && t?.line?.length) { const g = routeLayer(window.L, t.line, css('--s2'), a.name).addTo(m); fit(m, g.getBounds()); }
    else $(`#${id}-map`).outerHTML = empty(a.indoor ? 'Indoor session: no route.' : 'No GPS track for this activity.');
  } catch (e) { $(`#${id}-map`).outerHTML = empty('Map could not load (offline or blocked).'); }

  const ch = $(`#${id}-charts`);
  if (!t || !t.dist?.some(x => x != null)) { ch.innerHTML = empty('No detailed samples for this activity.'); return; }
  const has = k => t[k]?.some(v => v != null && v !== 0);
  const speed = t.time ? t.dist.map((d, i) => { if (i === 0 || t.time[i] == null || t.time[i - 1] == null) return null; const dt = t.time[i] - t.time[i - 1]; return dt > 0 ? (d - t.dist[i - 1]) / dt * 3600 : null; }) : null;
  const sm = speed ? speed.map((_, i) => mean(speed.slice(Math.max(0, i - 2), i + 3))) : null; // 5-point smoothing
  const blocks = [];
  if (sm) blocks.push(['spd', 'Speed (km/h)', sm, '--s1']); else blocks.push(['spd', 'Speed', null]);
  if (has('hr')) blocks.push(['hr', 'Heart rate (bpm)', t.hr, '--bad']);
  if (has('power')) blocks.push(['pwr', 'Power (W)', t.power, '--s4']);
  if (has('elev')) blocks.push(['ele', 'Elevation (m)', t.elev, '--s3']);
  ch.innerHTML = blocks.map(([k, l, data]) => `<div><div class="sub">${l}</div>${data ? `<div class="chart sm"><canvas id="${id}-${k}"></canvas></div>` : empty('Speed needs time samples. This track predates the v2 sync and will be re-fetched on the next run.')}</div>`).join('');
  const draw = () => blocks.forEach(([k, , data, col]) => data && chart(`${id}-${k}`, {
    type: 'line', data: { datasets: [{ data: t.dist.map((x, i) => ({ x, y: data[i] })).filter(p => p.x != null && p.y != null), borderColor: css(col), backgroundColor: css(col) + '22', fill: k === 'ele', borderWidth: 1.5, pointRadius: 0, tension: .2 }] },
    options: opts({ parsing: false, scales: axes({ x: { type: 'linear', min: 0, max: Math.max(...t.dist.filter(x => x != null)), ticks: { color: css('--text-2'), callback: v => v + ' km' } } }), plugins: { legend: { display: false }, tooltip: tipOpts({ title: it => `km ${n1(it[0].raw.x)}`, label: it => ` ${n0(it.raw.y)}` }) } }),
  }));
  onRedraw('detail', draw);

  const sp = splits(t, a.distKm > 40 ? 10 : 5);
  $(`#${id}-splits`).innerHTML = sp?.length ? `<h3>Splits</h3><div class="scroll"><table><thead><tr><th>To km</th><th>Time</th><th>km/h</th><th>Avg HR</th><th>Gain</th></tr></thead><tbody>${sp.map(s => `<tr><td>${n1(s.to)}</td><td>${hmShort(s.s)}</td><td>${n1(s.kmh)}</td><td>${s.hr ? n0(s.hr) : '–'}</td><td>+${n0(s.gain)} m</td></tr>`).join('')}</tbody></table></div><p class="small muted">From ~300 downsampled points, so expect ±2–3% versus Garmin's own laps.</p>` : '';
}
export { hav };
