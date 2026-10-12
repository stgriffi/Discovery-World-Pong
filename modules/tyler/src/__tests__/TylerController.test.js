import { createTylerController } from '../TylerController';
import { CLIP_SECONDS } from '../tylerScript';

// MQTT stand-in: publishes are echoed back asynchronously, like the broker does.
function createFakeApi() {
  const observers = {};
  const published = [];
  return {
    published,
    transitions: () => published.filter((p) => p.topic === 'game/state').map((p) => p.message.transition),
    registerObserver(topic, cb) {
      (observers[topic] = observers[topic] || new Set()).add(cb);
      return () => observers[topic].delete(cb);
    },
    update(topic, message) {
      published.push({ topic, message });
      setTimeout(() => (observers[topic] || []).forEach((cb) => cb(message)), 0);
      return true;
    },
    // Another service publishing (the gameboard, a paddle).
    receive(topic, message) {
      setTimeout(() => (observers[topic] || []).forEach((cb) => cb(message)), 0);
    },
  };
}

// Voice stand-in: each play() waits until the test ends, fails or stops it.
function createFakeVoice() {
  const playing = new Map();
  const played = [];
  return {
    played,
    play(id) {
      played.push(id);
      return new Promise((resolve) => playing.set(id, resolve));
    },
    stop(id) {
      const resolve = playing.get(id);
      playing.delete(id);
      if (resolve) resolve('stopped');
    },
    stopAll() {
      [...playing.keys()].forEach((id) => this.stop(id));
    },
    durationOf: () => null,
    finish(id, result = 'ended') {
      const resolve = playing.get(id);
      playing.delete(id);
      if (resolve) resolve(result);
    },
    isPlaying: (id) => playing.has(id),
  };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
// Flush first: a settled clip publishes in a promise callback, which schedules the echo.
const advance = async (ms) => {
  await flush();
  jest.advanceTimersByTime(ms);
  await flush();
};

let api;
let voice;
let tyler;

beforeEach(async () => {
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  api = createFakeApi();
  voice = createFakeVoice();
  tyler = createTylerController({ api, voice, log: { warn: () => {}, log: () => {} } });
  tyler.start();
  await flush();
});

afterEach(() => {
  tyler.stop();
  jest.useRealTimers();
});

async function enter(transition) {
  api.receive('game/state', { transition });
  await advance(1);
}

test('starts asleep in idle', () => {
  expect(tyler.view.getState()).toMatchObject({ state: 'idle', face: 'sleeping' });
});

test('publishes intro_complete exactly once when the intro clip ends', async () => {
  await enter('player_ready');
  expect(voice.played).toEqual(['tylerIntro']);
  expect(tyler.view.getState()).toMatchObject({ state: 'intro', face: 'neutral' });
  voice.finish('tylerIntro');
  await advance(1);
  expect(api.transitions()).toEqual(['intro_complete']);
  expect(tyler.view.getState().state).toBe('moveIntro');
  await advance(60000);
  expect(api.transitions().filter((t) => t === 'intro_complete')).toHaveLength(1);
});

test('if the browser refuses to play a clip, it moves on after the clip length', async () => {
  await enter('player_ready');
  voice.finish('tylerIntro', 'failed');
  await advance(1);
  expect(api.transitions()).toEqual([]);
  await advance(CLIP_SECONDS.tylerIntro * 1000);
  expect(api.transitions()).toEqual(['intro_complete']);
});

test('if a clip never reports ending, the fallback moves on at length + margin', async () => {
  await enter('player_ready');
  await advance(CLIP_SECONDS.tylerIntro * 1000 + 1400);
  expect(api.transitions()).toEqual([]);
  await advance(200);
  expect(api.transitions()).toEqual(['intro_complete']);
});

test('a clip ending after the fallback fired does not publish twice', async () => {
  await enter('player_ready');
  await advance(CLIP_SECONDS.tylerIntro * 1000 + 1600);
  voice.finish('tylerIntro');
  await advance(1);
  expect(api.transitions()).toEqual(['intro_complete']);
});

test.each(['player_exit', 'reset'])('%s before the clip ends stops it and publishes nothing', async (transition) => {
  await enter('player_ready');
  await enter(transition);
  expect(voice.isPlaying('tylerIntro')).toBe(false);
  expect(tyler.view.getState()).toMatchObject({ state: 'idle', face: 'sleeping' });
  await advance(60000);
  expect(api.transitions()).toEqual([]);
});

test('the outro plays both clips, then publishes game_complete', async () => {
  for (const [transition, clip] of [
    ['player_ready', 'tylerIntro'],
    ['intro_complete', 'tylerMove'],
    ['move_intro_complete', 'tylerDuel'],
  ]) {
    await enter(transition);
    expect(voice.played[voice.played.length - 1]).toBe(clip);
  }
  for (const transition of [
    'level1_intro_complete',
    'level1_complete',
    'level2_intro_complete',
    'level2_complete',
    'level3_intro_complete',
    'level3_complete',
  ]) {
    await enter(transition);
  }
  expect(tyler.view.getState().state).toBe('outro');
  voice.finish('tylerLevelThreeComplete');
  await advance(1);
  expect(voice.played[voice.played.length - 1]).toBe('tylerOutro');
  expect(tyler.view.getState().text).toMatch(/challenge me again/);
  expect(api.transitions()).not.toContain('game_complete');
  voice.finish('tylerOutro');
  await advance(1);
  expect(api.transitions()).toContain('game_complete');
  expect(tyler.view.getState().state).toBe('idle');
});

test('the level countdown clears its text afterwards and publishes nothing', async () => {
  for (const transition of ['player_ready', 'intro_complete', 'move_intro_complete', 'level1_intro_complete']) {
    await enter(transition);
  }
  const before = api.transitions().length;
  expect(tyler.view.getState()).toMatchObject({ state: 'level1', text: '3..2..1..Go!' });
  voice.finish('tylerCountdown');
  await advance(1);
  expect(tyler.view.getState().text).toBe('');
  expect(api.transitions().length).toBe(before);
});

test('faces react to scoring, including in a second game', async () => {
  for (const transition of ['player_ready', 'intro_complete', 'move_intro_complete', 'level1_intro_complete']) {
    await enter(transition);
  }
  const stats = (top, bottom) => api.receive('game/stats', { player_top: { score: top }, player_bottom: { score: bottom }, level: 1 });
  stats(1, 0);
  await advance(1);
  expect(tyler.view.getState().face).toBe('happy');
  await advance(2600);
  expect(tyler.view.getState().face).toBe('moveLeft');
  stats(1, 1);
  await advance(1);
  expect(tyler.view.getState().face).toBe('annoyed');

  await enter('player_exit');
  for (const transition of ['player_ready', 'intro_complete', 'move_intro_complete', 'level1_intro_complete']) {
    await enter(transition);
  }
  stats(0, 0); // new game
  await advance(1);
  expect(tyler.view.getState().face).toBe('moveLeft');
  stats(0, 1);
  await advance(1);
  expect(tyler.view.getState().face).toBe('annoyed');
});
