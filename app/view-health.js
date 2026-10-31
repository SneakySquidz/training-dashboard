// Health & nutrition: Nutrition (targets, timing, meals) and Tips (today's plan, suggestions, routines, exercise library).
import { STATUS } from './engine.js';
import { EXERCISES, ROUTINES, MEALS } from './library.js';
import { esc, fweekday, fshort, n1 } from './util.js';
import { $, $$, badge, empty, STATE_LABEL, STATE_TONE } from './ui.js';

export function exerciseCard(e) {
  const fit = [e.fit.rest && 'Rest day', e.fit.pre && 'Before hard ride', e.fit.post && 'After hard ride'].filter(Boolean);
  return `<div class="ex"><h3>${esc(e.name)} <span class="badge">${e.cat}</span></h3>
    <div class="small">${esc(e.purpose)}</div>
    <div class="small"><b>${esc(e.dose)}</b> · ${esc(e.intensity)} · ${esc(e.when)}</div>
    <div class="small muted">Safety: ${esc(e.cue)}</div>
    <div class="meta">${fit.map(f => badge('✓ ' + f, 'good')).join('')}${!e.fit.pre ? badge('Not before a hard ride') : ''}</div></div>`;
}
export const routineHTML = key => { const r = ROUTINES[key]; if (!r) return ''; return `<h3>${esc(r.name)}</h3>${r.ids.map(id => exerciseCard(EXERCISES.find(e => e.id === id))).join('')}`; };

/** Opens a routine inline in `slot` when any [data-routine] button inside `root` is pressed. */
export function wireRoutines(root, slot) {
  $$('[data-routine]', root).forEach(b => b.onclick = () => {
    slot.hidden = false;
    slot.innerHTML = `<div class="card" style="background:var(--surface-2)">${routineHTML(b.dataset.routine)}<button class="btn sm mt" type="button" data-close>Close</button></div>`;
    $('[data-close]', slot).onclick = () => slot.hidden = true;
    slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

// ---------------- Tips: the full daily plan plus everything that supports it ----------------
export function renderTips(D, R) {
  const el = $('#tips'); const s = STATUS[R.status]; const p = R.plan;
  const warn = R.warnings.find(w => w.level === 'bad' || w.level === 'warn');
  el.innerHTML = `
  <article class="card focus ${s.tone}" aria-labelledby="plan-h">
    <div class="sub" id="plan-h">Today's plan · ${fweekday(D.today)}</div>
    <div class="stat-big ${s.tone}">${R.status === 'unknown' ? esc(p.main.label) : s.label}</div>
    <div class="chips" style="margin-top:6px">${badge(R.confidence === 'none' ? 'No readiness data: plan from training load only' : `Confidence: ${R.confidence}`)}${D.demo.wellness ? badge('Demo data. Not your readings', 'demo') : ''}${R.lag ? badge("Using yesterday's data", 'warn') : ''}</div>
    <p class="summary">${esc(R.summary)}</p>
    <div class="do">
      <div><div class="k">Session</div><div class="v">${esc(p.main.label)}${p.main.duration !== '—' ? ` · ${esc(p.main.duration)}` : ''}</div><div class="small">${esc(p.main.intensity)}</div>${p.alt ? `<div class="small muted" style="margin-top:4px">Alternative: ${esc(p.alt.label)} (${esc(p.alt.duration)})</div>` : ''}</div>
      <div><div class="k">Recovery</div><div class="v">${esc(ROUTINES[p.routine]?.name || 'Mobility')}</div><button class="btn sm" data-routine="${p.routine}" type="button">Show exercises</button></div>
      <div><div class="k">Fuel</div><div class="v">${R.nutrition.weightKg ? `${R.nutrition.protein} protein` : 'Protein 1.6–2.0 g/kg'}</div><div class="small">${esc(R.nutrition.action)} <a href="#nutrition">Nutrition →</a></div></div>
      ${warn ? `<div class="warnbox"><div class="k">Caution</div><div class="small">${esc(warn.text)}</div></div>` : `<div><div class="k">Caution</div><div class="small">Nothing flagged today.</div></div>`}
    </div>
    <div id="routine-slot" class="mt" hidden></div>
    <details><summary>Why this call</summary>
      <p class="small mt">${esc(p.why)}</p>
      <div class="grid g3 mt">${R.signals.filter(x => x.state !== 'missing').map(x => `<div class="small"><b>${x.label}:</b> ${esc(x.value)} ${badge(STATE_LABEL[x.state], STATE_TONE[x.state])}<br><span class="muted">${esc(x.detail)}</span></div>`).join('')}</div>
      <p class="small muted mt">Inputs and trends: <a href="#readiness">Readiness</a>.</p>
    </details>
  </article>

  <h2 class="mt2">Suggestions from your data</h2>
  ${R.suggestions.length ? `<div class="sugg">${R.suggestions.map(sg => `<div class="card"><h3>${esc(sg.title)}</h3><div class="trig">Because: ${esc(sg.trigger)}</div><ul class="tight small">${sg.actions.map(a => `<li>${esc(a)}</li>`).join('')}</ul>${sg.routine ? `<button class="btn sm mt" data-routine="${sg.routine}" type="button">${esc(ROUTINES[sg.routine].name)}</button>` : ''}</div>`).join('')}</div>` : empty('No extra suggestions. Follow the plan above.')}

  <h2 class="mt2">Routines</h2>
  <div class="chips">${Object.entries(ROUTINES).map(([k, r]) => `<button class="btn sm" data-routine="${k}" type="button">${esc(r.name)}</button>`).join('')}</div>

  <div class="card mt2"><div class="card-h"><h2>Exercise library</h2><span class="sub">${EXERCISES.length} exercises with safety cues</span></div>
    <div class="chips" id="exf" role="group" aria-label="Filter exercises">${['All', 'Rest day', 'Before hard ride', 'After hard ride', 'Mobility', 'Strength', 'Core', 'Cycling', 'Recovery'].map((c, i) => `<button class="chip" aria-pressed="${!i}" data-c="${c}">${c}</button>`).join('')}</div>
    <div id="exlist" class="mt exgrid"></div></div>`;

  const showEx = c => { $('#exlist').innerHTML = EXERCISES.filter(e => c === 'All' || e.cat === c || (c === 'Rest day' && e.fit.rest) || (c === 'Before hard ride' && e.fit.pre) || (c === 'After hard ride' && e.fit.post)).map(exerciseCard).join(''); };
  $$('#exf .chip').forEach(b => b.onclick = () => { $$('#exf .chip').forEach(x => x.setAttribute('aria-pressed', x === b)); showEx(b.dataset.c); });
  showEx('All');
  wireRoutines(el, $('#routine-slot'));
}

// ---------------- Nutrition ----------------
export function renderNutrition(D, R) {
  const n = R.nutrition;
  $('#nutrition').innerHTML = `
  <div class="grid g2">
    <div class="card"><div class="card-h"><h2>Today's targets</h2><span class="sub">for: ${esc(R.plan.main.label.toLowerCase())}</span></div>
      <div class="kv"><div><b>${n.protein}</b><span>protein / day</span></div><div><b>${n.carbs}</b><span>carbohydrate / day</span></div><div><b>${n.proteinPerMeal}</b><span>protein / meal</span></div></div>
      <p class="small muted mt">${n.weightKg ? `Based on ${n1(n.weightKg)} kg (${fshort(n.weightDate)}, <a href="#body">Body</a>). Protein 1.6–2.0 g/kg; carbohydrate ${n.carbRange[0]}–${n.carbRange[1]} g/kg for today's plan.` : 'No weigh-in in the last 30 days, so targets are per kg of body weight. Add one in <a href="#body">Body</a>.'}</p>
      <p class="small"><b>Today:</b> ${esc(n.action)}</p></div>
    <div class="card"><h2>Timing and habits</h2><ul class="tight small">
      <li><b>Timing.</b> ${esc(n.timing)}</li>
      <li><b>Hydration.</b> ${esc(n.hydration)} After a ride, if you weighed yourself before and after, drink about 1.25–1.5 L per kg lost.</li>
      <li><b>Caffeine.</b> None after about 12:00–14:00. It still affects sleep 6+ hours later.</li>
      <li><b>Alcohol.</b> Even 1–2 drinks lowers overnight HRV and sleep quality. Skip it on nights before hard sessions.</li>
    </ul></div>
  </div>
  <div class="card mt"><h2>Simple meal ideas</h2>
    <div class="scroll"><table><thead><tr><th>Meal</th><th>Protein</th><th>Carbs</th><th class="l hide-sm">When</th></tr></thead><tbody>
    ${MEALS.map(m => `<tr><td class="wrap">${esc(m.name)}</td><td>${m.p} g</td><td>${m.c} g</td><td class="l wrap hide-sm muted">${esc(m.when)}</td></tr>`).join('')}</tbody></table></div>
    <p class="disclaimer">General wellness guidance, not medical or clinical nutrition advice. If you have a medical condition, an eating disorder history, or unexplained weight change, speak to a GP or registered dietitian.</p></div>`;
}
