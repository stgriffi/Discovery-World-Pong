import createBaseGameStateMachine, {
  applyGameStateTransition,
  TRANSITION_METHODS,
  IN_GAME_STATES,
} from 'dw-state-machine/lib/BaseGameStateMachine.js';

const HAPPY_PATH = [
  ['start', 'idle'],
  ['player_ready', 'intro'],
  ['intro_complete', 'moveIntro'],
  ['move_intro_complete', 'level1Intro'],
  ['level1_intro_complete', 'level1'],
  ['level1_complete', 'level2Intro'],
  ['level2_intro_complete', 'level2'],
  ['level2_complete', 'level3Intro'],
  ['level3_intro_complete', 'level3'],
  ['level3_complete', 'outro'],
  ['game_complete', 'idle'],
];

function machineIn(state) {
  const fsm = createBaseGameStateMachine(null);
  for (const [transition, reached] of HAPPY_PATH) {
    if (fsm.state === state) break;
    applyGameStateTransition(fsm, transition);
    if (reached === state) break;
  }
  expect(fsm.state).toBe(state);
  return fsm;
}

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

test('the happy path visits every state in order', () => {
  const fsm = createBaseGameStateMachine(null);
  expect(fsm.state).toBe('stopped');
  for (const [transition, expected] of HAPPY_PATH) {
    expect(applyGameStateTransition(fsm, transition)).toBe(true);
    expect(fsm.state).toBe(expected);
  }
});

test('a late move_intro_complete cannot start a game from idle', () => {
  const fsm = machineIn('idle');
  expect(applyGameStateTransition(fsm, 'move_intro_complete')).toBe(false);
  expect(fsm.state).toBe('idle');
});

test.each(IN_GAME_STATES)('player_exit from %s returns to idle', (state) => {
  const fsm = machineIn(state);
  expect(applyGameStateTransition(fsm, 'player_exit')).toBe(true);
  expect(fsm.state).toBe('idle');
});

test('player_exit during the outro is ignored so TYLER can finish', () => {
  const fsm = machineIn('outro');
  expect(applyGameStateTransition(fsm, 'player_exit')).toBe(false);
  expect(fsm.state).toBe('outro');
});

test.each(['stopped', 'idle', ...IN_GAME_STATES, 'outro'])('reset from %s goes to idle', (state) => {
  const fsm = machineIn(state);
  const after = jest.fn();
  fsm.observe({ onAfterTransition: (lifecycle) => after(lifecycle.transition) });
  expect(applyGameStateTransition(fsm, 'reset')).toBe(true);
  expect(fsm.state).toBe('idle');
  expect(after).toHaveBeenCalledWith('reset');
});

test('duplicate and unknown transitions are harmless no-ops', () => {
  const fsm = machineIn('level2Intro');
  expect(applyGameStateTransition(fsm, 'level1_complete')).toBe(false);
  expect(applyGameStateTransition(fsm, 'not_a_transition')).toBe(false);
  expect(fsm.state).toBe('level2Intro');
});

test('every transition name maps to a state machine method', () => {
  const fsm = createBaseGameStateMachine(null);
  Object.values(TRANSITION_METHODS).forEach((method) => {
    expect(typeof fsm[method]).toBe('function');
  });
});

test('autoSubscribe drives the machine from game/state, and dispose() unsubscribes', () => {
  const observers = {};
  const api = {
    registerObserver: jest.fn((topic, cb) => {
      observers[topic] = cb;
      return () => delete observers[topic];
    }),
  };
  const fsm = createBaseGameStateMachine(api);
  observers['game/state']({ transition: 'start' });
  expect(fsm.state).toBe('idle');
  fsm.dispose();
  expect(observers['game/state']).toBeUndefined();

  const passive = createBaseGameStateMachine(api, { autoSubscribe: false });
  expect(api.registerObserver).toHaveBeenCalledTimes(1);
  expect(passive.state).toBe('stopped');
});
