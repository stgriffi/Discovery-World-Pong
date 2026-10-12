// Fixed-timestep clock. advance(now) runs as many whole ticks as the elapsed time covers,
// so it can be called from several places (a timer and the render loop) without
// double-ticking. After a stall it catches up at most maxCatchUpTicks and drops the rest,
// so the game slows down instead of jumping.

// dt = 1000/60 isn't exact in floating point; without a small tolerance the accumulator
// can end up a hair short of a whole tick and silently lose it.
const EPSILON_MS = 1e-6;

export function createFixedStepLoop({ hz = 60, maxCatchUpTicks = 6, onTick }) {
  const dt = 1000 / hz;
  let last = null;
  let accumulator = 0;
  const stats = { ticks: 0, droppedMs: 0 };

  return {
    dt,
    stats,
    advance(now) {
      if (last === null) {
        last = now;
        return 0;
      }
      const elapsed = Math.max(0, now - last);
      last = now;
      accumulator += elapsed;
      const limit = maxCatchUpTicks * dt;
      if (accumulator > limit) {
        stats.droppedMs += accumulator - limit;
        accumulator = limit;
      }
      let ticks = 0;
      while (accumulator + EPSILON_MS >= dt) {
        accumulator -= dt;
        onTick();
        ticks += 1;
      }
      stats.ticks += ticks;
      return ticks;
    },
    // Fraction of the way to the next tick, for render interpolation.
    alpha() {
      return Math.min(1, Math.max(0, accumulator / dt));
    },
    reset() {
      last = null;
      accumulator = 0;
    },
  };
}
