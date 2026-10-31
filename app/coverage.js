// Which source supplies each metric, and where two sources overlap. Pure: no DOM, no storage.
// Priority is the order of `priority`: the first source with a value for a day wins, field by field.

/** rows: {source: [{date, field: value, …}]}; fields: [[key, label]]; priority: source names, best first.
 *  Returns one line per field: days per source, days where two or more sources have a value, and days each source is used. */
export function coverage(rows, fields, priority) {
  const names = priority.filter(s => rows[s]?.length);
  return fields.map(([key, label]) => {
    const perSource = {}; const byDay = {};
    for (const s of names) {
      for (const r of rows[s]) {
        if (r[key] == null) continue;
        (byDay[r.date] ||= {})[s] = true;
      }
      perSource[s] = Object.values(byDay).filter(d => d[s]).length;
    }
    const days = Object.keys(byDay);
    const both = days.filter(d => Object.keys(byDay[d]).length > 1).length;
    const used = {};
    for (const d of days) { const first = names.find(s => byDay[d][s]); used[first] = (used[first] || 0) + 1; }
    return { key, label, perSource, both, used, total: days.length };
  });
}
