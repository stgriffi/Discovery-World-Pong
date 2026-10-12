/**
 * @file BaseGameStateMachine.js
 * @description The exhibit-wide game flow, shared by the gameboard and TYLER. Every
 * instance is driven only by `game/state` {"transition": ...} MQTT messages, so all of
 * them move in lockstep: publish a transition and let the broker echo drive your own
 * instance, never call transitions locally.
 */
import StateMachine from 'javascript-state-machine';
import Topics from './topics.js';

// `game/state` transition name -> state machine method.
export const TRANSITION_METHODS = Object.freeze({
  start: 'start',
  player_ready: 'playerReady',
  intro_complete: 'introComplete',
  move_intro_complete: 'moveIntroComplete',
  level1_intro_complete: 'level1IntroComplete',
  level1_complete: 'level1Complete',
  level2_intro_complete: 'level2IntroComplete',
  level2_complete: 'level2Complete',
  level3_intro_complete: 'level3IntroComplete',
  level3_complete: 'level3Complete',
  game_complete: 'gameComplete',
  player_exit: 'playerExit',
  reset: 'reset',
  stop: 'stop',
});

export const IN_GAME_STATES = Object.freeze([
  'intro',
  'moveIntro',
  'level1Intro',
  'level1',
  'level2Intro',
  'level2',
  'level3Intro',
  'level3',
]);

// Apart from gameComplete (outro|idle -> idle) and reset (anything -> idle), each
// transition is legal from exactly one state, so a duplicated or late message is a no-op.
const TRANSITIONS = [
  { name: 'start', from: 'stopped', to: 'idle' },
  { name: 'playerReady', from: 'idle', to: 'intro' },
  { name: 'introComplete', from: 'intro', to: 'moveIntro' },
  // Only from moveIntro: a late move_intro_complete must never start a game from idle.
  { name: 'moveIntroComplete', from: 'moveIntro', to: 'level1Intro' },
  { name: 'level1IntroComplete', from: 'level1Intro', to: 'level1' },
  { name: 'level1Complete', from: 'level1', to: 'level2Intro' },
  { name: 'level2IntroComplete', from: 'level2Intro', to: 'level2' },
  { name: 'level2Complete', from: 'level2', to: 'level3Intro' },
  { name: 'level3IntroComplete', from: 'level3Intro', to: 'level3' },
  { name: 'level3Complete', from: 'level3', to: 'outro' },
  { name: 'gameComplete', from: ['idle', 'outro'], to: 'idle' },
  // The outro ends on its own, so a player leaving during it doesn't cut TYLER off.
  { name: 'playerExit', from: [...IN_GAME_STATES], to: 'idle' },
  // Resynchronizes every instance (published by the gameboard when it starts). From idle
  // this is a self-transition: onLeave/onEnter don't fire, so use onAfterTransition.
  { name: 'reset', from: '*', to: 'idle' },
  { name: 'stop', from: 'idle', to: 'stopped' },
];

/**
 * Apply a `game/state` transition name to a state machine. Never throws.
 * @returns {boolean} true if the transition ran.
 */
export function applyGameStateTransition(fsm, transition) {
  const method = TRANSITION_METHODS[transition];
  if (!method) {
    console.log('Unknown state transition:', transition);
    return false;
  }
  if (!fsm.can(method)) {
    console.log("transition '%s' not allowed from state '%s'", transition, fsm.state);
    return false;
  }
  try {
    fsm[method]();
    return true;
  } catch (err) {
    console.error(`transition '${transition}' failed`, err);
    return false;
  }
}

/**
 * @param pongAPI  PongAPI instance (optional).
 * @param options.autoSubscribe  subscribe to game/state and apply transitions (default true).
 *   Call fsm.dispose() to unsubscribe.
 */
const createBaseGameStateMachine = (pongAPI, { autoSubscribe = true } = {}) => {
  const fsm = new StateMachine({
    init: 'stopped',
    transitions: TRANSITIONS,
    methods: {
      onInvalidTransition: function (transition, from) {
        console.log("transition '%s' not allowed from state '%s'", transition, from);
        return false;
      },
    },
  });

  let unsubscribe = null;
  if (pongAPI && autoSubscribe) {
    const unregister = pongAPI.registerObserver(Topics.GAME_STATE, (message) => {
      applyGameStateTransition(fsm, message.transition);
    });
    unsubscribe = typeof unregister === 'function' ? unregister : null;
  }
  fsm.dispose = () => {
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
  };

  return fsm;
};

export default createBaseGameStateMachine;
