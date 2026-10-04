const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Three-way merge: absence in either changed copy removes an existing record.
// New records from both copies survive; locally edited ordering wins a tie.
export function mergeRecords(previous, local, remote, key, mergeItem = (_before, next) => next) {
  const before = new Map(previous.map(item => [key(item), item]));
  const next = new Map(local.map(item => [key(item), item]));
  const latest = new Map(remote.map(item => [key(item), item]));
  const merged = new Map();
  for (const id of new Set([...next.keys(), ...latest.keys()])) {
    const original = before.get(id); const a = next.get(id); const b = latest.get(id);
    if (original && (!a || !b)) continue;
    if (a && b) merged.set(id, original && equal(a, original) ? b : mergeItem(original, a, b));
    else merged.set(id, a || b);
  }
  const remaining = items => items.map(key).filter(id => before.has(id) && merged.has(id));
  let added = false;
  const inserted = local.some(item => {
    const id = key(item);
    if (!before.has(id) && merged.has(id)) added = true;
    return added && before.has(id) && merged.has(id);
  });
  const reordered = inserted || !equal(remaining(local), remaining(previous));
  const order = reordered ? [...local, ...remote] : [...remote, ...local];
  const output = [];
  for (const item of order) {
    const id = key(item);
    if (merged.has(id)) { output.push(merged.get(id)); merged.delete(id); }
  }
  return output;
}
