// Data & privacy: sources, freshness, unlock encrypted health data, imports, backup, wipe.
import { LS, encryptBundle } from './store.js';
import { readZip, parseExport, mergeWellness } from './garmin-export.js';
import { parseAppleFile } from './apple-health.js';
import { coverage } from './coverage.js';
import { esc, fdate, fshort } from './util.js';
import { $, badge, download, SOURCE_LABEL } from './ui.js';

export function renderData(D, actions) {
  const el = $('#data');
  const s = D.settings; const enc = D.healthEnc;
  const GX = LS.get('garmin.export', null);
  const AX = LS.get('apple.import', null);
  const jsonDays = D.importedWell.filter(r => r.source !== 'garmin-export').length;
  const ago = D.meta.refreshed ? Math.round((Date.now() - new Date(D.meta.refreshed)) / 36e5) : null;
  el.innerHTML = `
  <div class="grid g2">
    <div class="card"><h2>Sources</h2><div class="scroll"><table><thead><tr><th>Source</th><th class="l">Status</th><th class="l">Last synced</th></tr></thead><tbody>
      <tr><td>Garmin activities</td><td class="l">${D.acts.length ? badge(`${D.acts.length} activities`, 'good') : badge('None', 'bad')}</td><td class="l">${D.meta.refreshed ? new Date(D.meta.refreshed).toLocaleString('en-GB') : '–'}${ago > 36 ? ' ' + badge(`${Math.round(ago / 24)} d old`, 'warn') : ''}</td></tr>
      ${D.health?.wellness?.length ? `<tr><td>Garmin health (sleep, HRV, stress…)</td><td class="l">${D.health ? badge(`${D.health.wellness?.length || 0} days`, 'good') : enc ? badge('Encrypted. Locked', 'warn') : badge('Not synced', '')}</td><td class="l">${D.health?.syncedAt ? new Date(D.health.syncedAt).toLocaleString('en-GB') : enc?.syncedAt ? new Date(enc.syncedAt).toLocaleString('en-GB') : '–'}</td></tr>` : ''}
      <tr><td>Renpho cloud (daily sync)</td><td class="l">${D.health?.body?.some(r => r.source === 'renpho') ? badge(`${D.health.body.filter(r => r.source === 'renpho').length} weigh-ins`, 'good') : badge(enc ? 'Locked or not set up' : 'Not set up')}</td><td class="l">with health sync</td></tr>
      <tr><td>Renpho / CSV import</td><td class="l">${D.importedBody.length ? badge(`${D.importedBody.length} rows`, 'good') : badge('None')}</td><td class="l">this browser</td></tr>
      <tr><td>Manual entries</td><td class="l">${D.manualBody.length ? badge(`${D.manualBody.length} rows`, 'good') : badge('None')}</td><td class="l">this browser</td></tr>
      ${D.health?.fitness ? `<tr><td>Garmin history (synced, encrypted)</td><td class="l">${badge(`${D.health.wellness.filter(r => r.source === 'garmin-export').length} days`, 'good')}</td><td class="l">all devices after unlock</td></tr>` : ''}
      <tr><td>Apple Health (export)</td><td class="l">${AX ? badge(`${AX.counts.days} days`, 'good') : badge('Not imported')}</td><td class="l">${AX ? `${fdate(AX.from)} to ${fdate(AX.to)}, this browser` : 'this browser'}</td></tr>
      <tr><td>Garmin data export (zip)</td><td class="l">${GX ? badge(`${GX.days} days`, 'good') : badge('Not imported')}</td><td class="l">${GX ? `${fdate(GX.from)} to ${fdate(GX.to)}, this browser` : 'this browser'}</td></tr>
      <tr><td>Wellness JSON import</td><td class="l">${jsonDays ? badge(`${jsonDays} days`, 'good') : badge('None')}</td><td class="l">this browser</td></tr>
    </tbody></table></div>
    ${D.errors.length ? `<div class="banner err mt">Some files failed to load: ${esc(D.errors.join('; '))}</div>` : ''}</div>

    <div class="card"><h2>Unlock synced health data</h2>
      ${enc ? `<p class="small">Sleep, HRV, stress, Body Battery and Garmin weight data are published <b>encrypted</b> (AES-256-GCM). Only someone with the passphrase can read them. Decryption happens in this browser.</p>
      <form id="unlock" class="controls"><input type="password" id="pass" autocomplete="current-password" placeholder="Passphrase" aria-label="Passphrase" required style="flex:1;min-width:160px">
      <label class="small"><input type="checkbox" id="remember" ${LS.get('pass') ? 'checked' : ''}> Remember on this device</label><button class="btn pri" type="submit">${D.health ? 'Re-unlock' : 'Unlock'}</button></form><div class="small" id="umsg" role="status"></div>
      ${LS.get('pass') ? '<button class="btn sm" id="forget" type="button">Forget passphrase</button>' : ''}`
      : `<p class="small">No encrypted health bundle found. For Renpho, also add <code>RENPHO_EMAIL</code> and <code>RENPHO_PASSWORD</code> (unofficial API; see docs). To sync sleep, HRV, stress and Body Battery, add an Actions secret <code>HEALTH_PASSPHRASE</code> (and keep <code>GARMIN_PERSONAL_API_KEY</code>). The next daily run writes <code>data/health.enc.json</code>. See <code>docs/ARCHITECTURE.md</code>.</p>`}</div>
  </div>

  <div class="card mt" id="imports"><h2>Imports</h2>
  <p class="small muted">Each source is read in this browser and kept apart. Where two sources have a value for the same day, Garmin wins, then Apple Health.</p>
  <div class="imp" id="gx"><h3>Garmin data export ${GX ? badge('Imported', 'good') : ''}</h3>
    <p class="small">${D.health?.fitness ? '<b>Your export history is already synced (encrypted) and appears on every device after unlocking.</b> Use this only to load a newer export in this browser. ' : ''}Fills the history the daily sync can't reach: resting HR, stress, Body Battery, steps, respiration, any sleep records, VO2max and Garmin's training load. Choose the <code>.zip</code> Garmin emailed you. It is read <b>in this browser only</b>: only the summary files are opened, and nothing is uploaded or committed to the public repo.</p>
    <div class="chips"><label class="btn pri">Choose Garmin export .zip<input type="file" id="gxf" accept=".zip,application/zip" hidden></label>
    ${GX ? '<button class="btn sm" id="gxclr" type="button">Remove imported export</button>' : ''}</div>
    <div class="small mt" id="gxmsg" role="status">${GX ? `Last import: ${GX.days} days with data (${GX.rhr} resting HR, ${GX.stress} stress, ${GX.bb} Body Battery, ${GX.sleep} sleep), ${GX.vo2} VO2max readings, ${GX.load} days of Garmin load. HRV is not included in Garmin's export.` : ''}</div>
    ${(GX || AX) && !D.health?.fitness ? `<div class="banner mt" style="margin-bottom:0"><b>Show it on every device:</b> ${actions.pass() ? `<button class="btn sm" id="gxsave" type="button">Save encrypted history file</button> then upload it to the repo's <code>data/</code> folder (<a href="https://github.com/SneakySquidz/garmin-dashboard/upload/main/data" target="_blank" rel="noopener noreferrer">upload page ↗</a>) and run the refresh workflow. It is encrypted with your health passphrase, so the public repo only holds ciphertext.` : 'unlock your synced health data above first; the history file is encrypted with the same passphrase.'}</div>` : ''}
    <p class="small muted">Garmin Connect → Account → Data management → Export your data. Without the synced file, import on each device or move it with <b>Export backup</b> / <b>Restore backup</b>.</p></div>

  <div class="imp" id="ax"><h3>Apple Health ${AX ? badge('Imported', 'good') : ''}</h3>
    <p class="small">On the iPhone: Health → profile picture → <b>Export All Health Data</b>. Choose the <code>export.zip</code> (or <code>export.xml</code>). Adds resting HR, HRV (SDNN), steps, sleep and weight per day. Read <b>in this browser only</b>; large files are streamed, so this can take a minute.</p>
    <p class="small muted">Apple HRV is SDNN, Garmin's is RMSSD. They are shown separately and are not mixed into the readiness baseline. Where Garmin and Apple both have a value for a day, Garmin wins.</p>
    <div class="chips"><label class="btn pri">Choose Apple Health export<input type="file" id="axf" accept=".zip,.xml,application/zip,text/xml" hidden></label>
    ${AX ? '<button class="btn sm" id="axclr" type="button">Remove Apple Health</button>' : ''}</div>
    <div class="small mt" id="axmsg" role="status">${AX ? `Last import ${fdate(AX.at)}: ${AX.counts.days} days (${AX.counts.rhr} resting HR, ${AX.counts.hrvSdnn} HRV, ${AX.counts.steps} steps, ${AX.counts.sleep} sleep nights, ${AX.counts.weight} weigh-ins).${Object.keys(AX.counts.outOfRange || {}).length ? ' Some readings were outside plausible ranges and were skipped.' : ''}` : ''}</div>

  <div class="imp" id="wj"><h3>Wellness JSON</h3>
      <p class="small">For use before the API sync works: run <code>python3 scripts/fetch.py --health-out health.json</code> locally and import the file here. Rows use the internal schema (<code>date, hrv, rhr, sleepS, sleepScore, stress, bbWake…</code>).</p>
      <div class="chips"><label class="btn sm">Import JSON<input type="file" id="wjson" accept=".json,application/json" hidden></label>
      ${jsonDays ? '<button class="btn sm" id="wclr" type="button">Remove imported wellness</button>' : ''}</div><div class="small mt" id="wmsg" role="status"></div></div>
  </div>

  <div class="grid g2 mt">
    <div class="card"><h2>Your data on this device</h2>
      <p class="small">Stored in this browser only: manual weigh-ins, CSV imports, maintenance counters, ride notes, bike names and settings.</p>
      <div class="chips"><button class="btn sm" id="dexp" type="button">Export backup (JSON)</button><label class="btn sm">Restore backup<input type="file" id="dimp" accept=".json" hidden></label><button class="btn sm" id="wipe" type="button">Delete all local data</button></div></div>
  </div>


  ${coverageCard(D)}
  <div class="card mt"><h2>Privacy</h2><ul class="tight small">
    <li><b>This site is public.</b> GitHub Pages serves everything in the repo to anyone with the URL, and the repo itself is public. Activity summaries and GPS tracks are visible to anyone who finds it.</li>
    <li><b>Home and work locations.</b> Many rides start and end at the same point. Set an Actions secret <code>PRIVACY_ZONES</code> (e.g. <code>41.419,2.169,400;41.401,2.130,400</code>) and the sync trims tracks and blanks start/end coordinates inside those circles. Coordinates already committed stay in git history until it is rewritten.</li>
    <li><b>Health data</b> is never committed in plain text: only the encrypted bundle. Manual and imported data never leave the browser.</li>
    <li><b>No tracking.</b> No analytics or cookies. External requests: Google Fonts, cdnjs (Chart.js, Leaflet), OpenTopoMap tiles (only when a map is shown).</li>
    <li><b>Medical.</b> General wellness information only. It is not a medical device and does not diagnose anything.</li>
  </ul></div>
  <div class="card mt"><h2>Events list</h2><p class="small">Upcoming events come from <code>data/events.json</code> in the repo (hand-curated, last checked ${D.events.checked ? fdate(D.events.checked) : '–'}). Edit that file to add or remove events; past events hide automatically.</p></div>`;

  el.querySelector('#unlock')?.addEventListener('submit', async e => {
    e.preventDefault(); const p = $('#pass').value; $('#umsg').textContent = 'Decrypting…';
    const ok = await actions.unlock(p, $('#remember').checked);
    $('#umsg').textContent = ok ? 'Unlocked.' : 'Wrong passphrase or damaged file.';
  });
  $('#forget')?.addEventListener('click', () => { LS.del('pass'); actions.refresh('data'); });
  $('#wjson').onchange = async e => {
    try {
      const j = JSON.parse(await e.target.files[0].text()); const rows = (Array.isArray(j) ? j : j.wellness || []).filter(r => /^\d{4}-\d\d-\d\d$/.test(r.date)).map(r => ({ ...r, source: r.source || 'garmin' }));
      if (!rows.length) throw new Error('no rows with a date');
      LS.set('wellness.import', rows); if (j.body?.length) LS.set('body.import', [...LS.get('body.import', []), ...j.body]);
      $('#wmsg').textContent = `Imported ${rows.length} days.`; setTimeout(() => actions.refresh('data'), 500);
    } catch (err) { $('#wmsg').textContent = 'Import failed: ' + err.message; }
  };
  $('#gxf').onchange = async e => {
    const f = e.target.files[0]; if (!f) return; const msg = $('#gxmsg'); msg.textContent = `Reading ${f.name}…`;
    try {
      const files = await readZip(f);
      if (!Object.keys(files).length) throw new Error('no Garmin summary files found. Is this the Garmin Connect export zip?');
      const { wellness, fitness, counts } = parseExport(files);
      if (!wellness.length && !fitness.load.length) throw new Error('the export contains no daily health data');
      const prior = LS.get('wellness.import', []).filter(r => r.source !== 'garmin-export');
      const ok = LS.set('wellness.import', mergeWellness(prior, wellness)) && LS.set('garmin.fitness', fitness)
        && LS.set('garmin.export', { ...counts, from: wellness[0]?.date, to: wellness[wellness.length - 1]?.date, at: D.today });
      if (!ok) throw new Error('browser storage is full or blocked');
      msg.textContent = `Imported ${counts.days} days. Reloading views…`; setTimeout(() => actions.refresh('data'), 400);
    } catch (err) { msg.textContent = 'Import failed: ' + err.message; }
  };
  $('#gxsave')?.addEventListener('click', async () => {
    const apple = LS.get('apple.import', null) || { wellness: [], body: [] };
    const wellness = LS.get('wellness.import', []).filter(r => r.source === 'garmin-export');
    const enc = await encryptBundle({ syncedAt: new Date().toISOString().slice(0, 16), wellness, apple: apple.wellness, body: apple.body, fitness: LS.get('garmin.fitness', {}) }, actions.pass());
    download('garmin-history.enc.json', JSON.stringify(enc), 'application/json');
  });
  $('#axf').onchange = async e => {
    const f = e.target.files[0]; if (!f) return; const msg = $('#axmsg'); let last = 0;
    msg.textContent = `Reading ${f.name}…`;
    try {
      const { wellness, body, counts } = await parseAppleFile(f, n => { if (n - last > 50e6) { last = n; msg.textContent = `Reading ${f.name}… ${Math.round(n / 1e6)} MB`; } });
      if (!wellness.length && !body.length) throw new Error('no resting HR, HRV, steps, sleep or weight records found');
      if (!LS.set('apple.import', { wellness, body, counts, at: D.today, from: wellness[0]?.date, to: wellness[wellness.length - 1]?.date }))
        throw new Error('browser storage is full or blocked');
      msg.textContent = `Imported ${counts.days} days. Reloading views…`; setTimeout(() => actions.refresh('data'), 400);
    } catch (err) { msg.textContent = 'Import failed: ' + err.message; }
  };
  $('#axclr')?.addEventListener('click', () => { LS.del('apple.import'); actions.refresh('data'); });
  $('#gxclr')?.addEventListener('click', () => { LS.set('wellness.import', LS.get('wellness.import', []).filter(r => r.source !== 'garmin-export')); LS.del('garmin.fitness'); LS.del('garmin.export'); actions.refresh('data'); });
  $('#wclr')?.addEventListener('click', () => { LS.set('wellness.import', LS.get('wellness.import', []).filter(r => r.source === 'garmin-export')); actions.refresh('data'); });
  const KEYS = ['body.manual', 'body.import', 'wellness.import', 'apple.import', 'garmin.fitness', 'garmin.export', 'maint', 'notes', 'bikes', 'settings'];
  $('#dexp').onclick = () => download(`dashboard-backup-${D.today}.json`, JSON.stringify(Object.fromEntries(KEYS.map(k => [k, LS.get(k, null)])), null, 1), 'application/json');
  $('#dimp').onchange = async e => { try { const j = JSON.parse(await e.target.files[0].text()); KEYS.forEach(k => j[k] != null && LS.set(k, j[k])); actions.refresh('data'); } catch { alert('Not a valid backup file.'); } };
  $('#wipe').onclick = () => { if (confirm('Delete all data stored by this dashboard in this browser? This cannot be undone.')) { [...KEYS, 'pass', 'theme'].forEach(k => LS.del(k)); actions.refresh('data'); } };
}

// Where each number comes from: days per source, overlapping days, and which source is shown.
const WELL_FIELDS = [['rhr', 'Resting HR'], ['hrAvg', 'Avg HR'], ['steps', 'Steps'], ['sleepS', 'Sleep'], ['inBedS', 'In bed'], ['hrvSdnn', 'HRV (Apple SDNN)'], ['stress', 'Stress'], ['bbWake', 'Body Battery'], ['resp', 'Breathing']];
const BODY_FIELDS_COV = [['weightKg', 'Weight'], ['fatPct', 'Body fat'], ['muscleKg', 'Muscle'], ['visceral', 'Visceral fat']];
function coverageCard(D) {
  const AP = LS.get('apple.import', null);
  const garminRows = [...(D.health?.wellness || []), ...D.importedWell.filter(r => r.source === 'garmin-export')];
  const appleRows = [...(D.health?.appleWellness || []), ...(AP?.wellness || [])];
  const wellRows = { garmin: garminRows, 'apple-health': appleRows };
  const bodyRows = { renpho: (D.health?.body || []).filter(r => r.source === 'renpho'), apple: (D.health?.body || []).filter(r => r.source === 'apple').concat(AP?.body || []), manual: D.manualBody || [], csv: D.importedBody || [] };
  const wl = coverage(wellRows, WELL_FIELDS, ['garmin', 'apple-health']).filter(r => r.total);
  const bl = coverage(bodyRows, BODY_FIELDS_COV, ['renpho', 'manual', 'csv', 'apple']).filter(r => r.total);
  if (!wl.length && !bl.length) return '';
  const name = k => SOURCE_LABEL[k] || k;
  const table = rows => `<div class="scroll"><table><thead><tr><th>Metric</th><th>Days</th><th>Shown from</th><th>Days in two sources</th><th class="l hide-sm">Source per day</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${esc(r.label)}</td><td>${r.total}</td><td class="l">${Object.entries(r.used).map(([k, n]) => `${esc(name(k))} ${n}`).join(' · ')}</td><td>${r.both}</td><td class="l small muted hide-sm">${Object.entries(r.perSource).map(([k, n]) => `${esc(name(k))} ${n}`).join(' · ')}</td></tr>`).join('')}</tbody></table></div>`;
  return `<div class="card mt"><h2>Where each number comes from</h2>
    <p class="small">When two sources have a value for the same day, the one listed first wins for that field, and nothing is added together. Garmin first, then Apple Health for days Garmin doesn't cover. For weight: Renpho first, then manual entry and CSV, then Apple Health.</p>
    ${wl.length ? `<h3 class="mt">Recovery and activity</h3>${table(wl)}` : ''}
    ${bl.length ? `<h3 class="mt">Body</h3>${table(bl)}` : ''}
    <p class="small muted mt">Counts are days, not readings. A day in two sources is counted once in the charts.</p></div>`;
}
