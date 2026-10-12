// A group of timeouts that can be cancelled together. clear() also bumps a generation
// number, so a callback that was already queued when clear() ran never fires.
export function createTimerBag({ setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout } = {}) {
  let generation = 0;
  const handles = new Set();

  return {
    after(ms, fn) {
      const born = generation;
      const handle = setTimeoutFn(() => {
        handles.delete(handle);
        if (born === generation) fn();
      }, ms);
      handles.add(handle);
      return handle;
    },
    clear() {
      generation += 1;
      handles.forEach((handle) => clearTimeoutFn(handle));
      handles.clear();
    },
    get size() {
      return handles.size;
    },
  };
}
