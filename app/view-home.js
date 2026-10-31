// Home: the welcome dashboard. One glance at today's call, recent activity, health, events and a tip;
// every block links to the section that holds the detail.
import { STATUS } from './engine.js';
import { LS } from './store.js';
import { sourceStatus } from './sources.js';
import { ROUTINES } from './library.js';
import { track } from './store.js';
import { esc, fdate, fshort, fweekday, n0, n1, sum, addDays, daysBetween, hmShort, isoD } from './util.js';
import { $, badge, empty, chart, onRedraw, axes, opts, tipOpts, css, map, fit, routeLayer } from './ui.js';
import { wireRoutines } from './view-health.js';

const SPORT_LABEL = { ride: 'Ride', hike: 'Hike / walk', run: 'Run', strength: 'Strength', ski: 'Ski', swim: 'Swim', other: 'Other' };
const evKey = e => e.date.length === 7 ? e.date + '-99' : e.date; // month-only dates sort after exact dates in that month
const actLink = a => a.sport === 'ride' ? `#bike/ride/${a.id}` : `#activities/${a.id}`;
const delta = (now, before, unit = '', d = 0) => {
  if (!before) return '';
  const v = now - before; if (Math.abs(v) < (d ? 0.05 : 0.5)) return `<span class="dl">± same as previous 7 d</span>`;
  return `<span class="dl ${v > 0 ? 'up' : 'down'}">${v > 0 ? '▲' : '▼'} ${d ? n1(Math.abs(v)) : n0(Math.abs(v))}${unit} vs previous 7 d</span>`;
};

export function renderHome(D, R) {
  const el = $('#home'); const s = STATUS[R.status]; const p = R.plan;
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 19 ? 'Good afternoon' : 'Good evening';
  const A = D.acts, last = A[0];
  const wk = A.filter(a => a.date > addDays(D.today, -7)), prev = A.filter(a => a.date > addDays(D.today, -14) && a.date <= addDays(D.today, -7));
  const W = { n: wk.length, h: sum(wk, a => a.durS) / 3600, km: sum(wk, a => a.distKm), up: sum(wk, a => a.elevM) };
  const P = { n: prev.length, h: sum(prev, a => a.durS) / 3600, km: sum(prev, a => a.distKm), up: sum(prev, a => a.elevM) };
  const evs = (D.events.events || []).filter(e => (e.end || e.date) >= D.today.slice(0, (e.end || e.date).length)).sort((a, b) => evKey(a).localeCompare(evKey(b))).slice(0, 3);
  const bw = D.body.filter(r => r.weightKg != null), bl = bw[bw.length - 1];
  const b30 = bl && bw.filter(r => daysBetween(r.date, bl.date) >= 21 && daysBetween(r.date, bl.date) <= 45).pop();
  const sigs = R.signals.filter(x => x.state !== 'missing' && !x.info).slice(0, 3);
  const tip = R.suggestions[0];
  const lastRhr = D.wellness.filter(r => r.rhr).pop();
  const rides30 = A.filter(a => a.sport === 'ride' && a.date > addDays(D.today, -30));

  el.innerHTML = `
  <section class="hero ${s.tone}" aria-labelledby="hello">
    <div class="hero-main">
      <div class="sub">${hello} · ${fweekday(D.today)}</div>
      <h2 id="hello" class="hero-h">${R.status === 'unknown' ? `Today: ${esc(p.main.label)}` : `Today: <span class="tone-${s.tone}">${s.label}</span>`}</h2>
      <p class="hero-p"><b>${R.status === 'unknown' ? '' : esc(p.main.label) + ' · '}${p.main.duration !== '—' ? esc(p.main.duration) + '.' : ''}</b> ${esc(p.main.intensity)}.</p>
      <div class="chips">${R.confidence === 'none' ? badge('Based on training load only (no sleep/HRV data)') : badge(`Confidence: ${R.confidence}`)}${D.demo.wellness ? badge('Demo data', 'demo') : ''}</div>
    </div>
    <div class="hero-act"><a class="btn pri" href="#tips">Today's plan &amp; tips</a><a class="btn" href="#readiness">Why this call</a></div>
  </section>

  ${sourcesBlock(D)}

  <nav class="jump" aria-label="Sections">
    <a href="#bike"><span class="ic">${ICON.bike}</span><b>Bicycle</b><span>${rides30.length} ride${rides30.length === 1 ? '' : 's'} · ${n0(sum(rides30, a => a.distKm))} km in 30 d</span></a>
    <a href="#activities"><span class="ic">${ICON.list}</span><b>All activities</b><span>${A.length} recorded</span></a>
    <a href="#readiness"><span class="ic">${ICON.heart}</span><b>Health</b><span>Readiness, body, nutrition</span></a>
    <a href="#events"><span class="ic">${ICON.flag}</span><b>Events</b><span>${evs.length ? `Next: ${esc(evs[0].name)}` : 'None listed'}</span></a>
  </nav>

  <div class="sec-h"><h2>Activity &amp; tracking</h2><a href="#activities">All activities →</a></div>
  <div class="grid g2">
    <div class="card">${last ? `<div class="card-h"><h3 style="margin:0">Latest: ${esc(last.name)}</h3><span class="sub">${fdate(last.date)}</span></div>
      <div class="chips" style="margin-bottom:8px">${badge(SPORT_LABEL[last.sport] || last.type)}${last.ebike ? badge('eBike', 'warn') : ''}</div>
      <div class="kv">${[[last.distKm ? n1(last.distKm) + ' km' : '–', 'Distance'], [hmShort(last.durS), 'Time'], [last.elevM ? '+' + n0(last.elevM) + ' m' : '–', 'Ascent'], [last.avgHR ? n0(last.avgHR) + ' bpm' : '–', 'Avg HR']].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>
      <div class="map sm mt" id="home-map" hidden></div>
      <a class="btn sm mt" href="${actLink(last)}">Open activity</a>` : empty('No activities synced yet.')}</div>
    <div class="card"><div class="card-h"><h3 style="margin:0">Last 7 days</h3><span class="sub">all sports</span></div>
      <div class="kv kv2">
        <div><b>${W.n}</b><span>sessions</span>${delta(W.n, P.n)}</div>
        <div><b>${n1(W.h)} h</b><span>moving time</span>${delta(W.h, P.h, ' h', 1)}</div>
        <div><b>${n0(W.km)} km</b><span>distance</span>${delta(W.km, P.km, ' km')}</div>
        <div><b>+${n0(W.up)} m</b><span>ascent</span>${delta(W.up, P.up, ' m')}</div></div>
      <div class="sub mt">Weekly hours, last 12 weeks</div>
      <div class="chart sm"><canvas id="home-weeks" role="img" aria-label="Weekly training hours by sport, last 12 weeks"></canvas></div>
      <div class="legend" id="home-leg"></div></div>
  </div>

  <div class="sec-h"><h2>Health &amp; nutrition</h2><a href="#readiness">Readiness →</a></div>
  <div class="grid g3">
    <a class="card tile" href="#readiness"><div class="sub">Readiness</div><div class="tile-v tone-${s.tone}">${R.status === 'unknown' ? 'No data' : s.label}</div>
      ${sigs.length ? `<ul class="tight small">${sigs.map(x => `<li>${x.label}: <b>${esc(x.value)}</b></li>`).join('')}</ul>` : `<p class="small muted">${lastRhr ? `Latest resting HR ${lastRhr.rhr} bpm (${fshort(lastRhr.date)}). Too old for today's call.` : 'No sleep or HRV data synced.'} ${R.load.ratio != null && R.load.sessions28 >= 3 ? `Load this week is ${n1(R.load.ratio)}× your usual.` : ''}</p>`}</a>
    <a class="card tile" href="#body"><div class="sub">Body</div>${bl ? `<div class="tile-v">${n1(bl.weightKg)} kg</div>
      <p class="small">${b30 ? `${bl.weightKg - b30.weightKg >= 0 ? '+' : '−'}${n1(Math.abs(bl.weightKg - b30.weightKg))} kg since ${fshort(b30.date)}` : 'No reading ~30 days earlier'}${bl.fatPct != null ? ` · ${n1(bl.fatPct)}% fat` : ''}</p>
      <p class="small muted">Last weigh-in ${fshort(bl.date)}${daysBetween(bl.date, D.today) > 7 ? ` (${daysBetween(bl.date, D.today)} d ago)` : ''}</p>` : `<div class="tile-v muted">–</div><p class="small muted">${D.healthEnc && !D.health ? 'Renpho weigh-ins are locked. Unlock them in Data &amp; privacy.' : 'No weigh-ins yet.'}</p>`}</a>
    <a class="card tile" href="#nutrition"><div class="sub">Nutrition today</div><div class="tile-v">${R.nutrition.protein}</div>
      <p class="small">protein · ${R.nutrition.carbs} carbs</p><p class="small muted">${esc(R.nutrition.action)}</p></a>
  </div>

  <div class="sec-h"><h2>Coming up &amp; tips</h2><a href="#events">All events →</a></div>
  <div class="grid g2">
    <div class="card">${evs.length ? evs.map(e => evRow(e, D.today)).join('') : empty('No upcoming events in your list.')}</div>
    <div class="card">${tip ? `<div class="sub">Tip of the day</div><h3>${esc(tip.title)}</h3><div class="small muted" style="margin-bottom:6px">Because: ${esc(tip.trigger)}</div>
      <ul class="tight small">${tip.actions.slice(0, 3).map(a => `<li>${esc(a)}</li>`).join('')}</ul>`
      : `<div class="sub">Tip of the day</div><h3>${esc(ROUTINES[p.routine]?.name || 'Mobility')}</h3><p class="small">A short routine to pair with today's plan.</p>`}
      <div class="chips mt"><button class="btn sm" type="button" data-routine="${tip?.routine || p.routine}">Show routine</button><a class="btn sm" href="#tips">More tips</a></div>
      <div id="home-routine" class="mt" hidden></div></div>
  </div>`;

  wireRoutines(el, $('#home-routine'));
  drawWeeks(D);
  if (last) drawMap(last);
}

/** The Today line (how current each source is) and the source strip (what each one contributes). */
function sourcesBlock(D) {
  const S = sourceStatus(D, LS.get('apple.import', null), D.today).filter(x => x.state !== 'none');
  if (!S.length) return '';
  const ageOf = x => x.state === 'stale' ? ' warn' : '';
  const line = S.map(x => x.state === 'locked'
    ? `<span class="muted">${esc(x.name)} locked</span>`
    : `<span class="${ageOf(x).trim()}">${esc(x.name)} ${x.last ? fshort(x.last) : '–'}${x.state === 'stale' ? ' (old)' : ''}</span>`).join(' · ');
  return `<div class="today-line" role="status"><b>Data current to:</b> ${line}</div>
  <div class="srcs">${S.map(x => `<a class="src ${x.state}" href="#data">
      <div class="src-h"><b>${esc(x.name)}</b>${x.state === 'locked' ? badge('Locked', 'warn') : x.state === 'stale' ? badge('Old', 'warn') : badge(`${x.days} days`, 'good')}</div>
      <div class="small">${x.state === 'locked' ? 'Unlock to see your readings.' : esc(x.detail || '')}</div>
      ${x.last && x.state !== 'locked' ? `<div class="small muted">Latest ${fshort(x.last)}</div>` : ''}
    </a>`).join('')}</div>`;
}

function evRow(e, today) {
  const exact = e.date.length === 10; const d = new Date((exact ? e.date : e.date + '-01') + 'T12:00');
  const left = exact ? daysBetween(today, e.date) : null;
  const when = left === null ? 'date TBC' : left < 0 ? 'on now' : left === 0 ? 'today' : left === 1 ? 'tomorrow' : `in ${left} days`;
  return `<div class="ev"><div class="dt"><span>${d.toLocaleDateString('en-GB', { month: 'short' })}</span><b>${exact ? d.getDate() : '?'}</b></div>
    <div style="min-width:0"><h3>${esc(e.name)}</h3><div class="small">${when} · ${esc(e.place)} ${badge(e.kind)}${e.ebike === true ? badge('E-bikes OK', 'good') : ''}${e.registered ? badge('Entered', 'good') : ''}</div></div></div>`;
}

function drawWeeks(D) {
  const mon = iso => { const d = new Date(iso + 'T12:00'); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return isoD(d); };
  const end = mon(D.today), weeks = Array.from({ length: 12 }, (_, i) => addDays(end, -7 * (11 - i)));
  const groups = [['ride', 'Ride', '--s1'], ['hike', 'Hike / walk', '--s3'], ['other', 'Other', '--s2']];
  const g = a => a.sport === 'ride' ? 'ride' : a.sport === 'hike' ? 'hike' : 'other';
  const hrs = Object.fromEntries(groups.map(([k]) => [k, weeks.map(() => 0)]));
  for (const a of D.acts) { const i = weeks.indexOf(mon(a.date)); if (i >= 0) hrs[g(a)][i] += a.durS / 3600; }
  const used = groups.filter(([k]) => hrs[k].some(v => v > 0));
  $('#home-leg').innerHTML = used.map(([, l, c]) => `<span><i style="background:var(${c})"></i>${l}</span>`).join('');
  onRedraw('home-weeks', () => chart('home-weeks', {
    type: 'bar',
    data: { labels: weeks.map(w => fshort(w)), datasets: used.map(([k, l, c]) => ({ label: l, data: hrs[k].map(v => +v.toFixed(1)), backgroundColor: css(c), borderRadius: 3, stack: 'h' })) },
    options: opts({ scales: axes({ x: { stacked: true, ticks: { color: css('--text-2'), maxRotation: 0, autoSkipPadding: 8 } }, y: { stacked: true, title: { display: true, text: 'h', color: css('--text-2') } } }), plugins: { legend: { display: false }, tooltip: tipOpts({ title: i => `Week of ${i[0].label}`, label: c => `${c.dataset.label}: ${n1(c.raw)} h` }) } }),
  }));
}

async function drawMap(a) {
  const t = await track(a.id); const box = $('#home-map');
  if (!box || !t?.line?.length) return;
  box.hidden = false;
  try { const m = await map('home-map'); if (m) { const gr = routeLayer(window.L, t.line, css('--s2'), a.name).addTo(m); fit(m, gr.getBounds()); } }
  catch { box.hidden = true; }
}

const svg = d => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON = {
  home: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>'),
  bike: svg('<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-8h5l3 8M10 8l3 8h-3M14 5h2"/>'),
  list: svg('<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>'),
  heart: svg('<path d="M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10z"/><path d="M7 12h3l1.5-2 2 4 1.5-2h2"/>'),
  flag: svg('<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>'),
  act: svg('<path d="M3 12h4l3-8 4 16 3-8h4"/>'),
};
