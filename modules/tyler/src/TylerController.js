// TYLER's narration, independent of React.
//
// Follows the shared exhibit state machine (driven by game/state messages). On entering a
// state it shows that state's face and text and plays its voice clips in order; when they
// finish it publishes the transition that ends the state (intro_complete, ...). A clip
// counts as finished when it ends, when the browser refuses to play it (after the clip's
// length, to keep the pacing), or after its length plus a margin as a fallback -- so a
// blocked or broken clip can never freeze the exhibit. Leaving a state cancels everything.
import createBaseGameStateMachine, { applyGameStateTransition } from 'dw-state-machine/lib/BaseGameStateMachine.js';
import Topics from 'dw-state-machine/lib/topics.js';
import { createStore } from './store';
import { SCRIPT, CLIP_SECONDS } from './tylerScript';

export function createTylerController({
  api,
  voice,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  fallbackMarginMs = 1500,
  faceHoldMs = 2500,
  log = console,
}) {
  const fsm = createBaseGameStateMachine(api, { autoSubscribe: false });
  const view = createStore({ state: 'stopped', face: 'sleeping', text: '' });
  const timers = new Set();
  const unsubscribers = [];
  let token = 0; // bumped on every state change; stale callbacks check it
  let faceTimer = null;
  let scores = { top: 0, bottom: 0 };
  let started = false;

  const after = (ms, fn) => {
    const handle = setTimeoutFn(() => {
      timers.delete(handle);
      fn();
    }, ms);
    timers.add(handle);
  };

  function cancelState() {
    token += 1;
    timers.forEach((handle) => clearTimeoutFn(handle));
    timers.clear();
    voice.stopAll();
  }

  function runScript(state) {
    const step = SCRIPT[state];
    const myToken = token;
    const stillCurrent = () => myToken === token && fsm.state === state;
    view.setState({ state, face: step ? step.face : 'sleeping', text: step ? step.text : '' });
    if (!step) return;

    let index = 0;
    const playNext = () => {
      if (!stillCurrent()) return;
      if (index >= step.clips.length) {
        if (step.after) view.setState(step.after);
        if (step.transition) api.update(Topics.GAME_STATE, { transition: step.transition });
        return;
      }
      const clip = step.clips[index];
      index += 1;
      if (clip.text !== undefined) view.setState({ text: clip.text });

      const seconds = voice.durationOf(clip.id) || CLIP_SECONDS[clip.id] || 5;
      let finished = false;
      const done = (how) => {
        if (finished || !stillCurrent()) return;
        finished = true;
        if (how !== 'ended') log.warn(`[tyler] ${clip.id} ${how}; carrying on without it`);
        playNext();
      };
      after(seconds * 1000 + fallbackMarginMs, () => done('never reported ending'));
      voice.play(clip.id).then((result) => {
        if (result === 'ended') done('ended');
        else if (result === 'failed') after(seconds * 1000, () => done('could not play'));
        // 'stopped': we already left this state.
      });
    };
    playNext();
  }

  fsm.observe({
    onLeaveState: () => cancelState(),
    onEnterState: (lifecycle) => {
      if (lifecycle.to !== 'none') runScript(lifecycle.to);
    },
    onAfterTransition: (lifecycle) => {
      // reset while already idle is a self-transition (no leave/enter events).
      if (lifecycle.transition === 'reset' && lifecycle.from === lifecycle.to) {
        cancelState();
        runScript(lifecycle.to);
      }
    },
  });

  // Faces react to scoring during play: happy when TYLER scores, annoyed when the human does.
  function onGameStats(message) {
    const next = { top: message.player_top.score, bottom: message.player_bottom.score };
    const previous = scores;
    scores = next; // lower scores mean a new game: just take them as the new baseline
    if (!/^level[123]$/.test(fsm.state)) return;
    let face = null;
    if (next.top > previous.top) face = 'happy';
    else if (next.bottom > previous.bottom) face = 'annoyed';
    if (!face) return;
    view.setState({ face });
    if (faceTimer !== null) clearTimeoutFn(faceTimer);
    faceTimer = setTimeoutFn(() => {
      faceTimer = null;
      const step = SCRIPT[fsm.state];
      if (step) view.setState({ face: step.face });
    }, faceHoldMs);
  }

  function start() {
    if (started) return;
    started = true;
    [
      api.registerObserver(Topics.GAME_STATE, (message) => applyGameStateTransition(fsm, message.transition)),
      api.registerObserver(Topics.GAME_STATS, onGameStats),
    ].forEach((unsubscribe) => {
      if (typeof unsubscribe === 'function') unsubscribers.push(unsubscribe);
    });
    fsm.start(); // stopped -> idle locally; every instance does this when it loads
  }

  function stop() {
    if (!started) return;
    started = false;
    unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
    cancelState();
  }

  return { start, stop, view, inspect: () => ({ state: fsm.state, timers: timers.size }) };
}
