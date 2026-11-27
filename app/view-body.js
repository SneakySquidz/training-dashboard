// Body composition: latest reading with provenance, 7/30/90-day changes, trends, flags, manual entry, CSV.
import { BODY_FIELDS, parseBodyCSV, bodyToCSV } from './model.js';
import { bodyContext } from './engine.js';
import { LS } from './store.js';
import { esc, fdate, fshort, n0, n1, addDays, daysBetween } from './util.js';
import { $, $$, badge, empty, chart, onRedraw, axes, opts, tipOpts, css, srcBadge, download } from './ui.js';

let range = 90;

export function renderBody(D, R, refresh) {
  const el = $('#body'); const rows = D.body; const last = rows[rows.length - 1];
  const B = bodyContext(rows, D.today);
  const change = (f, days) => {
    if (!last || last[f] == null) return null;
    const ref = rows.filter(r => r[f] != null && daysBetween(r.date, last.date) >= days * 0.7 && daysBetween(r.date, last.date) <= days * 1.3)
      .sort((a, b) => Math.abs(daysBetween(a.date, last.date) - days) - Math.abs(daysBetween(b.date, last.date) - days))[0];
    return ref ? last[f] - ref[f] : null;
  };
  const fmtΔ = (v, u, d) => v == null ? '<span class="muted">–</span>' : `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(d)}${u ? ' ' + u : ''}`;
  const flags = R.warnings.filter(w => /weight|muscle|kg|Weight/.test(w.text));

  el.innerHTML = `
  ${D.demo.body ? '<div class="banner"><b>Demo body data.</b> These are generated numbers to show the layout, not your readings. Import a Renpho CSV or add a weigh-in below.</div>' : ''}
  <div class="grid g2">
    <div class="card"><div class="card-h"><h2>Latest reading</h2>${last ? srcBadge(last.source) : ''}</div>
      ${last ? `<div class="sub">${fdate(last.date)}${last.time ? ' · ' + last.time : ''}${B.age > 7 ? ` · ${badge(B.age + ' days old', 'warn')}` : ''}</div>
      <div class="kv mt">${BODY_FIELDS.filter(([f]) => last[f] != null).map(([f, l, u, d]) => `<div><b>${d ? n1(last[f]) : n0(last[f])}${u ? ' ' + u : ''}</b><span>${l}</span></div>`).join('')}</div>` : empty('No weigh-ins yet. Add one below or import a CSV.')}
      ${flags.length ? `<ul class="tight small mt">${flags.map(w => `<li>${badge(w.level === 'info' ? 'Note' : 'Review', w.level === 'info' ? '' : 'warn')} ${esc(w.text)}</li>`).join('')}</ul>` : last ? '<p class="small muted mt">No rapid changes flagged.</p>' : ''}
      <p class="disclaimer">Signals to review, not diagnoses. Bioimpedance body-fat, muscle and water estimates swing by 1–2% with hydration, meals and time of day. Weigh in at the same time each morning, after the toilet and before eating, and read trends rather than single days.</p></div>
    <div class="card"><h2>Changes</h2>${last ? `<div class="scroll"><table><thead><tr><th>Metric</th><th>7 d</th><th>30 d</th><th>90 d</th></tr></thead><tbody>
      ${BODY_FIELDS.filter(([f]) => last[f] != null && f !== 'bmi').map(([f, l, u, d]) => `<tr><td>${l}</td><td>${fmtΔ(change(f, 7), u, d || 1)}</td><td>${fmtΔ(change(f, 30), u, d || 1)}</td><td>${fmtΔ(change(f, 90), u, d || 1)}</td></tr>`).join('')}</tbody></table></div>
      <p class="small muted">Compared with the reading closest to 7, 30 and 90 days before the latest one. "–" means no reading near that date.</p>` : empty('Needs at least two readings.')}</div>
  </div>

  <div class="controls mt2"><h2 style="margin:0">Trends</h2><div class="seg" id="br">${[30, 90, 365].map(n => `<button data-n="${n}" aria-pressed="${n === range}">${n} days</button>`).join('')}</div></div>
  <div class="grid g2">${[['weightKg', 'Weight (kg)', '--s1'], ['fatPct', 'Body fat (%)', '--s2'], ['muscleKg', 'Muscle mass (kg)', '--s3'], ['visceral', 'Visceral fat (rating)', '--s4']].map(([f, l]) => `<div class="card"><h3>${l}</h3><div class="chart sm"><canvas id="cb-${f}"></canvas></div></div>`).join('')}</div>

  <div class="grid g2 mt2">
    <div class="card"><h2>Add a weigh-in</h2>
      <form id="bform" class="grid g3" autocomplete="off">
        <label class="f">Date<input type="date" name="date" value="${D.today}" max="${D.today}" required></label>
        ${BODY_FIELDS.map(([f, l, u]) => `<label class="f">${l}${u ? ` (${u})` : ''}<input name="${f}" inputmode="decimal" ${f === 'weightKg' ? 'required' : ''} placeholder="${f === 'weightKg' ? 'required' : 'optional'}"></label>`).join('')}
        <div style="align-self:end"><button class="btn pri" type="submit">Save</button></div>
      </form><div class="small" id="bmsg" role="status"></div></div>
    <div class="card"><h2>Import / export</h2>
      <p class="small">Renpho app → Me → Data export (CSV). Column names are matched loosely (weight, BMI, body fat, muscle mass, visceral fat, bone mass, body water, BMR, protein); weights in lb are converted.</p>
      <div class="chips"><label class="btn sm">Import CSV<input type="file" id="bcsv" accept=".csv,text/csv" hidden></label>
        <button class="btn sm" id="bexp" type="button">Export all (CSV)</button>
        ${D.importedBody.length ? `<button class="btn sm" id="bclr" type="button">Remove ${D.importedBody.length} imported rows</button>` : ''}</div>
      <div class="small mt" id="bimsg" role="status"></div>
      <p class="small muted mt">Imported and manual entries stay in this browser (localStorage). They are never uploaded or committed to the public repo.</p>
      <h3 class="mt">Manual entries</h3>${D.manualBody.length ? `<table><tbody>${D.manualBody.slice().reverse().slice(0, 10).map((r, i) => `<tr><td>${fshort(r.date)}</td><td>${n1(r.weightKg)} kg</td><td><button class="btn sm" data-del="${D.manualBody.length - 1 - i}" type="button" aria-label="Delete entry">Delete</button></td></tr>`).join('')}</tbody></table>` : '<p class="small muted">None.</p>'}
    </div>
  </div>`;

  $$('#br button').forEach(b => b.onclick = () => { range = +b.dataset.n; $$('#br button').forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); });
  const draw = () => {
    const from = addDays(D.today, -range); const r = rows.filter(x => x.date >= from);
    for (const [f, c] of [['weightKg', '--s1'], ['fatPct', '--s2'], ['muscleKg', '--s3'], ['visceral', '--s4']]) {
      const pts = r.filter(x => x[f] != null);
      const cv = document.getElementById('cb-' + f); if (!cv) continue;
      if (pts.length < 2) { cv.parentElement.innerHTML = empty(pts.length ? 'One reading so far.' : 'No data for this metric.'); continue; }
      chart('cb-' + f, { type: 'line', data: { labels: pts.map(x => fshort(x.date)), datasets: [{ data: pts.map(x => x[f]), borderColor: css(c), backgroundColor: css(c), borderWidth: 1.8, pointRadius: pts.length < 40 ? 2.5 : 0, tension: .25 }] }, options: opts({ scales: axes(), plugins: { legend: { display: false }, tooltip: tipOpts({ afterLabel: it => `Source: ${pts[it.dataIndex].source}` }) } }) });
    }
  };
  onRedraw('body', draw);

  $('#bform').onsubmit = e => {
    e.preventDefault(); const fd = new FormData(e.target); const o = { date: fd.get('date'), time: new Date().toTimeString().slice(0, 5), source: 'manual' };
    for (const [f] of BODY_FIELDS) { const v = parseFloat(String(fd.get(f) || '').replace(',', '.')); if (isFinite(v)) o[f] = v; }
    if (!(o.weightKg >= 25 && o.weightKg <= 300)) { $('#bmsg').textContent = 'Weight must be between 25 and 300 kg.'; return; }
    if (o.fatPct != null && (o.fatPct < 2 || o.fatPct > 70)) { $('#bmsg').textContent = 'Body fat must be between 2 and 70%.'; return; }
    const m = LS.get('body.manual', []); m.push(o); LS.set('body.manual', m) ? refresh('body') : ($('#bmsg').textContent = 'Could not save: browser storage is unavailable.');
  };
  $('#bcsv').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const res = parseBodyCSV(await f.text(), 'renpho');
    if (!res.rows.length) { $('#bimsg').innerHTML = `No rows imported. Columns found: ${esc(res.unmapped.join(', ') || 'none')}. Need at least a date and a weight column.`; return; }
    const prev = LS.get('body.import', []); const key = r => r.date + (r.time || '');
    const seen = new Set(prev.map(key)); const add = res.rows.filter(r => !seen.has(key(r)));
    LS.set('body.import', [...prev, ...add]);
    $('#bimsg').textContent = `Imported ${add.length} rows (${res.rows.length - add.length} duplicates, ${res.skipped} skipped).`;
    setTimeout(() => refresh('body'), 600);
  };
  $('#bexp').onclick = () => download(`body-composition-${D.today}.csv`, bodyToCSV([...D.importedBody, ...D.manualBody, ...(D.health?.body || [])].sort((a, b) => a.date.localeCompare(b.date))), 'text/csv');
  $('#bclr')?.addEventListener('click', () => { if (confirm('Remove all imported body-composition rows from this browser?')) { LS.del('body.import'); refresh('body'); } });
  $$('[data-del]', el).forEach(b => b.onclick = () => { const m = LS.get('body.manual', []); m.splice(+b.dataset.del, 1); LS.set('body.manual', m); refresh('body'); });
}
