import { createGameAudio } from '../gameAudio';
import { TYLER_PADDLE_GAIN } from '../clips';

function createFakeEngine() {
  const playing = new Set();
  const calls = [];
  return {
    calls,
    playing,
    play: jest.fn((id, options = {}) => {
      calls.push([id, options]);
      playing.add(id);
      let resolve;
      const ended = new Promise((r) => (resolve = r));
      return { ended, stop() {}, finish: () => resolve('ended') };
    }),
    stop: jest.fn((id) => playing.delete(id)),
    isPlaying: (id) => playing.has(id),
  };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

test('idle loops the idle music once; a player arriving plays activation, then game music', async () => {
  const engine = createFakeEngine();
  const audio = createGameAudio(engine);
  audio.onBaseState('idle', 'stopped');
  audio.onBaseState('idle', 'idle');
  expect(engine.calls.filter(([id]) => id === 'musicIdle')).toHaveLength(1);
  expect(engine.calls[0][1]).toEqual({ loop: true });

  audio.onBaseState('intro', 'idle');
  expect(engine.stop).toHaveBeenCalledWith('musicIdle', 0.15);
  const activation = engine.play.mock.results[engine.play.mock.results.length - 1].value;
  expect(engine.calls[engine.calls.length - 1][0]).toBe('activation');
  activation.finish();
  await flush();
  expect(engine.calls[engine.calls.length - 1]).toEqual(['musicBackground', { loop: true }]);
});

test('game music does not start if the player left during the activation sound', async () => {
  const engine = createFakeEngine();
  const audio = createGameAudio(engine);
  audio.onBaseState('intro', 'idle');
  const activation = engine.play.mock.results[0].value;
  audio.onBaseState('idle', 'intro');
  activation.finish();
  await flush();
  expect(engine.calls.map(([id]) => id)).not.toContain('musicBackground');
});

test('physics events map to sounds, with TYLER quieter and sudden-death losses as defeat', () => {
  const engine = createFakeEngine();
  const audio = createGameAudio(engine);
  audio.onSimEvents(
    [
      { type: 'paddleHit', side: 'bottom' },
      { type: 'paddleHit', side: 'top' },
      { type: 'wallHit', side: 'left' },
      { type: 'wallHit', side: 'right' },
      { type: 'goal', scorer: 'human' },
      { type: 'goal', scorer: 'tyler' },
    ],
    { level: 1 },
  );
  expect(engine.calls).toEqual([
    ['paddleHit', { gain: 1 }],
    ['paddleHit', { gain: TYLER_PADDLE_GAIN }],
    ['wallHitLeft', {}],
    ['wallHitRight', {}],
    ['pointScore', {}],
    ['pointLose', {}],
  ]);
  audio.onSimEvents([{ type: 'goal', scorer: 'tyler' }], { level: 3 });
  expect(engine.calls[engine.calls.length - 1][0]).toBe('levelDefeat');
});

test('a level ending with the player behind plays the defeat sting', () => {
  const engine = createFakeEngine();
  const audio = createGameAudio(engine);
  audio.onGameplay('levelOver', { bottomScore: 2, topScore: 1 });
  expect(engine.calls).toEqual([]);
  audio.onGameplay('levelOver', { bottomScore: 1, topScore: 2 });
  expect(engine.calls).toEqual([['levelDefeat', {}]]);
});
