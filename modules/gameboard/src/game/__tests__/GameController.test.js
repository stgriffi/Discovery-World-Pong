import { createGameController, WATCHDOGS } from '../GameController';
import { createFakeBroker } from '../../test-utils/fakeBroker';
import { IN_GAME_STATES } from 'dw-state-machine/lib/BaseGameStateMachine.js';

jest.mock('uuid', () => ({ v4: () => 'test-instance' }));
jest.mock('mqtt', () => ({ __esModule: true, default: { connect: () => null } }));

const SHORT_LEVEL_TICKS = 3 * 60; // 3 s levels keep the tests quick
const quietLog = { warn: () => {}, log: () => {}, error: () => {} };

let broker;
let gameboardClient;
let controller;
let human; // bottom paddle client
let ai; // top paddle client
let tyler;

function setup(config = {}) {
  broker = createFakeBroker();
  gameboardClient = broker.createClient('gameboard');
  human = broker.createClient('human');
  ai = broker.createClient('ai');
  tyler = broker.createClient('tyler');
  controller = createGameController({
    api: gameboardClient,
    now: () => Date.now(),
    config: { levelTicks: SHORT_LEVEL_TICKS, ...config },
    log: quietLog,
  });
  controller.start();
  [gameboardClient, human, ai, tyler].forEach((c) => c.connect());
}

const advance = (ms) => jest.advanceTimersByTime(ms);
const base = () => controller.inspect().base;
const gameplay = () => controller.inspect().gameplay;
const gbTransitions = () => broker.transitions('gameboard');
const count = (list, value) => list.filter((v) => v === value).length;

function humanState(state) {
  human.update('paddle/bottom/state', { state }, { retain: true });
}

function humanPosition(x) {
  human.update('paddle/bottom/position', { position: { x } });
}

// TYLER's part: publish the transition that ends its voice clip.
function tylerSays(transition) {
  tyler.update('game/state', { transition });
  advance(1);
}

function startGame() {
  ai.update('paddle/top/state', { state: 'start' }, { retain: true });
  humanState('ready');
  advance(3100); // boot cooldown
  expect(base()).toBe('intro');
}

function playToLevel1() {
  startGame();
  tylerSays('intro_complete');
  tylerSays('move_intro_complete');
  expect(base()).toBe('level1Intro');
  tylerSays('level1_intro_complete');
  expect(base()).toBe('level1');
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  controller.stop();
  expect(broker.invalid).toEqual([]); // every publish matched the schema
  jest.useRealTimers();
});

describe('boot', () => {
  test('publishes reset once on the first connect, never on reconnects', () => {
    setup();
    advance(10);
    expect(count(gbTransitions(), 'reset')).toBe(1);
    gameboardClient.disconnect();
    gameboardClient.connect();
    advance(10);
    expect(count(gbTransitions(), 'reset')).toBe(1);
    expect(base()).toBe('idle');
  });

  test('a remembered "ready" starts a game only after the boot cooldown', () => {
    setup();
    ai.update('paddle/top/state', { state: 'start' }, { retain: true });
    humanState('ready');
    advance(2900);
    expect(gbTransitions()).not.toContain('player_ready');
    advance(300);
    expect(count(gbTransitions(), 'player_ready')).toBe(1);
    expect(base()).toBe('intro');
  });

  test('no game starts without TYLER ready', () => {
    setup();
    humanState('ready');
    advance(10000);
    expect(gbTransitions()).not.toContain('player_ready');
  });
});

describe('a full game', () => {
  test('runs through all three levels, publishing each level transition exactly once', () => {
    setup();
    humanPosition(0.5);
    playToLevel1();

    expect(controller.ui.getState()).toMatchObject({ screen: 'gameplay', level: 1, timerText: '0:03' });
    advance(4 * 500 + 17 * 17 + 3000 + 200); // countdown, serve hold, 3 s of play
    expect(base()).toBe('level2Intro');
    expect(count(gbTransitions(), 'level1_complete')).toBe(1);
    expect(controller.ui.getState().level).toBe(2);

    tylerSays('level2_intro_complete');
    advance(2000 + 17 * 17 + 3000 + 500);
    expect(base()).toBe('level3Intro');
    expect(count(gbTransitions(), 'level2_complete')).toBe(1);

    tylerSays('level3_intro_complete');
    expect(controller.ui.getState().timerText).toBe('SUDDEN DEATH');
    humanPosition(0.03); // step away so TYLER scores
    advance(2000 + 17 * 17 + 8000);
    expect(base()).toBe('outro');
    expect(count(gbTransitions(), 'level3_complete')).toBe(1);
    expect(controller.inspect().topScore).toBeGreaterThanOrEqual(1);
    expect(controller.ui.getState().centerText).toMatch(/WINS|DRAW/);

    tylerSays('game_complete');
    expect(base()).toBe('idle');
    expect(controller.ui.getState()).toMatchObject({ screen: 'instructions', topScore: 0, bottomScore: 0 });
  });

  test('publishes one game/play message per board-active tick, with a frame counter', () => {
    setup();
    playToLevel1();
    const before = broker.published('game/play').length;
    advance(1000);
    const plays = broker.published('game/play').slice(before);
    expect(plays.length).toBeGreaterThanOrEqual(59);
    expect(plays.length).toBeLessThanOrEqual(61);
    plays.slice(1).forEach((message, i) => expect(message.frame).toBe(plays[i].frame + 1));
  });

  test('publishes game/stats at each level start and on every goal', () => {
    setup();
    humanPosition(0.03); // TYLER will score
    playToLevel1();
    advance(2000 + 17 * 17 + 2500);
    const stats = broker.published('game/stats', 'gameboard');
    expect(stats[stats.length - 1]).toMatchObject({ level: 1, player_top: { score: expect.any(Number) } });
    expect(stats.some((m) => m.player_top.score >= 1)).toBe(true);
    expect(stats.some((m) => m.level === 1 && m.player_top.score === 0 && m.player_bottom.score === 0)).toBe(true);
  });

  test('nothing is published on game/play while idle or during intros', () => {
    setup();
    startGame();
    advance(5000);
    expect(broker.published('game/play')).toEqual([]);
  });

  test('the serve is held 17 ticks and then goes straight at TYLER', () => {
    setup();
    playToLevel1();
    advance(4 * 500 + 20); // countdown done, serve begins
    const start = broker.published('game/play').length;
    advance(17 * (1000 / 60) + 1);
    const hold = broker.published('game/play').slice(start, start + 16);
    hold.forEach((m) => expect(m.ball.position).toEqual({ x: -0.5, y: 80 - 133 }));
    advance(3 * (1000 / 60));
    const after = broker.published('game/play').slice(-1)[0];
    expect(after.ball.position.y).toBeGreaterThan(80 - 133);
  });
});

describe('player exit', () => {
  test.each(IN_GAME_STATES)('a paddle "stop" during %s ends the game once and cancels every timer', (state) => {
    setup();
    startGame();
    const path = [
      ['intro', null],
      ['moveIntro', 'intro_complete'],
      ['level1Intro', 'move_intro_complete'],
      ['level1', 'level1_intro_complete'],
      ['level2Intro', 'level1_complete'],
      ['level2', 'level2_intro_complete'],
      ['level3Intro', 'level2_complete'],
      ['level3', 'level3_intro_complete'],
    ];
    for (const [s, transition] of path) {
      if (transition) tylerSays(transition); // any client may publish a transition
      if (s === state) break;
    }
    expect(base()).toBe(state);

    humanState('stop');
    advance(10);
    expect(count(gbTransitions(), 'player_exit')).toBe(1);
    expect(base()).toBe('idle');
    advance(60000);
    expect(count(gbTransitions(), 'player_exit')).toBe(1);
    expect(controller.inspect().timers).toBe(0);
  });

  test('a stale level timer from an aborted game cannot end the next game early', () => {
    setup();
    humanPosition(0.5);
    playToLevel1();
    advance(2000 + 1500); // countdown + 1.5 s of game A
    humanState('stop');
    advance(10);
    expect(base()).toBe('idle');

    advance(3000);
    humanState('ready'); // a new player steps in
    advance(2100); // post-game cooldown
    expect(base()).toBe('intro');
    tylerSays('intro_complete');
    tylerSays('move_intro_complete');
    tylerSays('level1_intro_complete');
    const completesBefore = count(gbTransitions(), 'level1_complete');
    advance(2000 + 17 * 17 + 2500); // less than a full level of game B
    expect(base()).toBe('level1');
    expect(count(gbTransitions(), 'level1_complete')).toBe(completesBefore);
    advance(800);
    expect(base()).toBe('level2Intro');
  });
});

describe('restarting after a game', () => {
  function finishGame() {
    humanPosition(0.5);
    playToLevel1();
    advance(2000 + 17 * 17 + 3200);
    tylerSays('level2_intro_complete');
    advance(2000 + 17 * 17 + 3200);
    tylerSays('level3_intro_complete');
    humanPosition(0.03);
    advance(2000 + 17 * 17 + 8000);
    tylerSays('game_complete');
    expect(base()).toBe('idle');
  }

  test('a player who is still "ready" does not trigger a new game by themselves', () => {
    setup();
    finishGame();
    advance(30000);
    expect(base()).toBe('idle');
    expect(count(gbTransitions(), 'player_ready')).toBe(1);
  });

  test('a player becoming ready again starts the next game only after the cooldown', () => {
    setup();
    finishGame();
    advance(100);
    humanState('not_ready'); // what the depth camera reports when a game ends
    advance(1400);
    humanState('ready');
    advance(3000);
    expect(base()).toBe('idle'); // 4.5 s after the game: still cooling down
    advance(600);
    expect(base()).toBe('intro');
    expect(count(gbTransitions(), 'player_ready')).toBe(2);
  });
});

describe('watchdogs', () => {
  test('if TYLER never answers, the gameboard publishes the missing transitions itself', () => {
    setup();
    startGame();
    advance(WATCHDOGS.intro.ms + 10);
    expect(base()).toBe('moveIntro');
    expect(gbTransitions()).toContain('intro_complete');
    advance(WATCHDOGS.moveIntro.ms + 10);
    expect(base()).toBe('level1Intro');
    advance(WATCHDOGS.level1Intro.ms + 10);
    expect(base()).toBe('level1');
  });

  test('TYLER answering in time cancels the watchdog', () => {
    setup();
    startGame();
    advance(7000);
    tylerSays('intro_complete');
    advance(WATCHDOGS.intro.ms - 7000 + 1000); // past the intro deadline, before moveIntro's
    expect(gbTransitions()).not.toContain('intro_complete');
    expect(base()).toBe('moveIntro');
  });

  test('a late move_intro_complete arriving while idle does nothing', () => {
    setup();
    advance(10);
    tylerSays('move_intro_complete');
    expect(base()).toBe('idle');
  });

  test('reset from any state returns everything to idle', () => {
    setup();
    playToLevel1();
    advance(2500);
    tylerSays('reset');
    expect(base()).toBe('idle');
    expect(gameplay()).toBe('inactive');
    expect(controller.getRenderState().ballVisible).toBe(false);
  });
});

describe('level clock', () => {
  test('time running out during the pause after a point ends the level without another serve', () => {
    setup({ pointPauseTicks: 600 }); // a 10 s pause outlasts the 3 s level
    humanPosition(0.03); // let TYLER score quickly
    playToLevel1();
    advance(2000 + 17 * 17 + 3000 + 100);
    expect(controller.inspect().topScore).toBeGreaterThanOrEqual(1);
    expect(base()).toBe('level2Intro');
    expect(count(gbTransitions(), 'level1_complete')).toBe(1);
  });

  test('the sudden-death safety cap ends an endless rally', () => {
    setup({ l3CapTicks: 5 * 60 });
    humanPosition(0.5); // the human and TYLER both return everything straight back
    playToLevel1();
    ['level1_complete', 'level2_intro_complete', 'level2_complete', 'level3_intro_complete'].forEach(tylerSays);
    expect(base()).toBe('level3');
    advance(2000 + 5000 + 500);
    expect(base()).toBe('outro');
    expect(count(gbTransitions(), 'level3_complete')).toBe(1);
  });
});
