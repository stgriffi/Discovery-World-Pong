// Python semantics the training physics depends on.

// Python 3 round(): ties go to the nearest even integer (round(0.5) == 0,
// round(-1.5) == -2). Math.round sends ties toward +Infinity, which picks a
// different bounce segment for two reachable paddle offsets.
export function roundHalfEven(value) {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

// list[i] in Python, where negative i counts from the end.
export function pyIndex(list, i) {
  return list[i < 0 ? list.length + i : i];
}
