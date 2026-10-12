// Minimal external store for low-frequency UI state, read from React with
// useSyncExternalStore. Listeners only run when a value actually changes.
export function createStore(initial) {
  let state = { ...initial };
  const listeners = new Set();

  return {
    getState: () => state,
    setState(partial) {
      const changed = Object.keys(partial).some((key) => !Object.is(state[key], partial[key]));
      if (!changed) return;
      state = { ...state, ...partial };
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
