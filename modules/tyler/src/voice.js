// TYLER's voice on the shared Web Audio engine (dw-audio). play() always settles:
// 'ended' when the clip finishes, 'stopped' if interrupted, 'failed' if it can't play.
// If audio is blocked a voice clip waits for the context to unlock; TylerController's
// fallback timer keeps the exhibit moving meanwhile.
export function createVoice(engine) {
  return {
    play: (id) => engine.play(id).ended,
    stop: (id) => engine.stop(id),
    stopAll: () => engine.stopBus('voice'),
    durationOf: (id) => engine.durationOf(id),
  };
}
