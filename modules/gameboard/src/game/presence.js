// Tracks the last reported state of each paddle (paddle/{top,bottom}/state) and when it
// last *became* ready, so a game only starts on a fresh "ready", never a remembered one.
const READY = new Set(['ready', 'start']);

export function createPresence() {
  const sides = {
    top: { state: null, readyEdgeAt: -Infinity },
    bottom: { state: null, readyEdgeAt: -Infinity },
  };

  return {
    // Returns true if the state changed.
    update(side, state, now) {
      // The web paddle answers paddle resets with state "reset"; that says nothing about
      // whether anyone is there.
      if (state === 'reset' || !sides[side]) return false;
      const entry = sides[side];
      const wasReady = READY.has(entry.state);
      const changed = entry.state !== state;
      entry.state = state;
      if (!wasReady && READY.has(state)) entry.readyEdgeAt = now;
      return changed;
    },
    state: (side) => sides[side].state,
    isReady: (side) => READY.has(sides[side].state),
    readyEdgeAt: (side) => sides[side].readyEdgeAt,
  };
}
