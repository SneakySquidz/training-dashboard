// Events: the curated list from data/events.json, filterable, with e-bike status and fit to your riding.
import { esc, fdate, fshort, n0, addDays, daysBetween, isoD } from './util.js';
import { $, $$, badge, empty, download } from './ui.js';

let kind = 'All';

export function renderEvents(D) {
  const el = $('#events'); const E = D.events;
  const up = (E.events || []).filter(e => (e.end || e.date) >= D.today.slice(0, (e.end || e.date).length)).sort((a, b) => (a.date.length === 7 ? a.date + '-99' : a.date).localeCompare(b.date.length === 7 ? b.date + '-99' : b.date));
  const rides90 = D.acts.filter(a => a.sport === 'ride' && a.date > addDays(D.today, -90));
  const emtb = rides90.filter(a => a.rideType === 'emtb').length, mtb = rides90.filter(a => a.rideType === 'mtb' || a.rideType === 'other').length;
  const longest = Math.max(0, ...rides90.map(a => a.distKm)), climb = Math.max(0, ...rides90.map(a => a.elevM));
  const kinds = ['All', 'E-bike OK', ...new Set(up.map(e => e.kind))];
  const list = up.filter(e => kind === 'All' || (kind === 'E-bike OK' ? e.ebike === true : e.kind === kind));

  el.innerHTML = `<div class="card"><div class="card-h"><h2>Upcoming events</h2><div class="chips" id="evk" role="group" aria-label="Filter events">${kinds.map(k => `<button class="chip" data-k="${esc(k)}" aria-pressed="${k === kind}">${esc(k)}</button>`).join('')}</div></div>
    <p class="small muted">${esc(E.note || '')} Last checked ${E.checked ? fdate(E.checked) : '–'}.</p>
    <p class="small">Your last 90 days: ${rides90.length} rides (${emtb} eMTB, ${mtb} MTB/unspecified); longest ${n0(longest)} km, biggest climb +${n0(climb)} m.</p>
    ${list.length ? list.map(e => row(e, D.today, longest)).join('') : empty(kind === 'E-bike OK' ? 'No listed event has a confirmed e-bike category yet. Check the e-bike calendars below.' : 'No upcoming events in this filter.')}</div>
  <div class="grid g2 mt">
    <div class="card"><h2>eMTB / e-bike calendars</h2><ul class="tight small">${(E.calendars || []).filter(c => c.ebike).map(c => `<li><a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.name)}</a></li>`).join('') || '<li>None listed.</li>'}</ul>
      <p class="small muted mt">Many MTB marathons and marxes accept e-bikes in a separate category or non-competitive ride, but it varies by edition. Where "E-bikes: unknown" shows, check the rules before entering.</p></div>
    <div class="card"><h2>General calendars</h2><ul class="tight small">${(E.calendars || []).filter(c => !c.ebike).map(c => `<li><a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.name)}</a></li>`).join('')}</ul>
      <p class="small muted mt">To add an event, edit <code>data/events.json</code>: <code>name, date (YYYY-MM-DD or YYYY-MM), place, kind, detail, source, ebike, registered</code>.</p></div>
  </div>`;
  $$('#evk .chip').forEach(b => b.onclick = () => { kind = b.dataset.k; renderEvents(D); });
  $$('[data-ics]', el).forEach(b => b.onclick = () => { const e = up[+b.dataset.ics]; download(`${e.name.replace(/\W+/g, '-')}.ics`, ics(e), 'text/calendar'); });

  function row(e, today, longest) {
    const exact = e.date.length === 10; const d = new Date((exact ? e.date : e.date + '-01') + 'T12:00');
    const left = exact ? daysBetween(today, e.date) : null;
    const when = left === null ? 'date to be confirmed' : left < 0 ? 'on now' : left === 0 ? 'today' : left === 1 ? 'tomorrow' : `in ${left} days`;
    const kms = (e.detail.match(/\d+(?=\s*(?:\/|km))/g) || []).map(Number).filter(n => n >= 10 && n <= 300).sort((a, b) => a - b);
    const fit = /MTB|BTT|bike|Gravel/i.test(e.kind + e.detail) && kms.length
      ? (longest >= kms[0] ? `Your longest recent ride (${n0(longest)} km) covers the ${kms[0]} km option.` : `The shortest option is ${kms[0]} km; your longest ride in 90 days is ${n0(longest)} km. Build up first.`) : '';
    const eb = e.ebike === true ? badge('E-bikes allowed', 'good') : e.ebike === false ? badge('No e-bikes', 'bad') : /MTB|BTT|bike/i.test(e.kind) ? badge('E-bikes: unknown') : '';
    return `<div class="ev"><div class="dt"><span>${d.toLocaleDateString('en-GB', { month: 'short' })}</span><b>${exact ? d.getDate() : '?'}</b></div>
      <div style="min-width:0;flex:1"><h3>${esc(e.name)} ${badge(e.kind)} ${eb} ${e.registered ? badge('Entered', 'good') : ''}</h3>
      <div class="small">${when} · ${esc(e.place)}${e.end ? ` · until ${fshort(e.end)}` : ''}</div><div class="small">${esc(e.detail)}</div>
      ${fit ? `<div class="small" style="margin-top:3px"><b>Fit:</b> ${esc(fit)}</div>` : ''}
      <div class="chips" style="margin-top:6px"><a class="btn sm" href="${esc(e.source)}" target="_blank" rel="noopener noreferrer">Source ↗</a>${exact ? `<button class="btn sm" type="button" data-ics="${up.indexOf(e)}">Add to calendar</button>` : ''}</div></div></div>`;
  }
}

function ics(e) {
  const d = e.date.replace(/-/g, ''); const end = new Date((e.end || e.date) + 'T12:00'); end.setDate(end.getDate() + 1);
  const x = s => String(s).replace(/[,;\\]/g, m => '\\' + m);
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//training-dashboard//EN', 'BEGIN:VEVENT', `UID:${d}-${e.name.replace(/\W+/g, '')}@dashboard`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${isoD(end).replace(/-/g, '')}`,
    `SUMMARY:${x(e.name)}`, `LOCATION:${x(e.place)}`, `DESCRIPTION:${x(e.detail + ' ' + e.source)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}
