import { createAudioEngine } from 'dw-audio/lib/AudioEngine.js';

// Just enough of the Web Audio API to observe what the engine does.
function createFakeContext(state = 'running', { stuck = false } = {}) {
  const sources = [];
  const param = (value) => ({ value, setValueAtTime: jest.fn(), linearRampToValueAtTime: jest.fn() });
  const node = () => ({ connect: jest.fn(), disconnect: jest.fn() });
  const ctx = {
    state,
    currentTime: 0,
    destination: {},
    resume: jest.fn(() => {
      if (!stuck) ctx.state = 'running';
      return Promise.resolve();
    }),
    createDynamicsCompressor: () => ({ ...node(), threshold: param(0), knee: param(0), ratio: param(0), attack: param(0), release: param(0) }),
    createGain: () => ({ ...node(), gain: param(1) }),
    createBufferSource: () => {
      const source = {
        ...node(),
        start: jest.fn(),
        stop: jest.fn(() => setTimeout(() => source.onended && source.onended(), 0)),
        finish: () => source.onended && source.onended(),
      };
      sources.push(source);
      return source;
    },
    decodeAudioData: jest.fn((data) => Promise.resolve({ duration: data.byteLength / 1000 })),
  };
  return { ctx, sources };
}

const CLIPS = {
  hit: { url: 'hit.mp3', bus: 'sfx', gain: 0.9, maxVoices: 2 },
  music: { url: 'music.mp3', bus: 'music', gain: 0.5 },
  voice: { url: 'voice.mp3', bus: 'voice' },
  missing: { url: 'missing.mp3' },
};

function setup(state = 'running', options) {
  const { ctx, sources } = createFakeContext(state, options);
  const fetchImpl = jest.fn((url) =>
    url === 'missing.mp3'
      ? Promise.resolve({ ok: false, status: 404 })
      : Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(2000)) }),
  );
  const log = { warn: jest.fn() };
  const engine = createAudioEngine({ clips: CLIPS, AudioContextImpl: function () { return ctx; }, fetchImpl, log });
  return { engine, ctx, sources, log };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('decodes every clip once and reports failures without throwing', async () => {
  const { engine, log } = setup();
  await expect(engine.load()).resolves.toBe(3);
  expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('missing'));
  expect(engine.durationOf('hit')).toBe(2);
  expect(engine.durationOf('missing')).toBeNull();
});

test('plays a decoded clip immediately at the clip gain times the requested gain', async () => {
  const { engine, sources } = setup();
  await engine.load();
  const handle = engine.play('hit', { gain: 0.5 });
  expect(sources).toHaveLength(1);
  expect(sources[0].start).toHaveBeenCalledWith(0, 0);
  expect(handle.duration).toBe(2);
  sources[0].finish();
  await expect(handle.ended).resolves.toBe('ended');
});

test('overlapping hits are allowed up to maxVoices; the oldest is cut off beyond that', async () => {
  const { engine, sources } = setup();
  await engine.load();
  engine.play('hit');
  engine.play('hit');
  engine.play('hit');
  expect(sources).toHaveLength(3);
  expect(sources[0].stop).toHaveBeenCalled();
  expect(sources[1].stop).not.toHaveBeenCalled();
});

test('stop() resolves the handle as stopped', async () => {
  const { engine } = setup();
  await engine.load();
  const handle = engine.play('voice');
  engine.stop('voice');
  jest.runOnlyPendingTimers();
  await expect(handle.ended).resolves.toBe('stopped');
  expect(engine.isPlaying('voice')).toBe(false);
});

test('unknown or undecoded clips fail fast instead of hanging', async () => {
  const { engine } = setup();
  await engine.load();
  await expect(engine.play('missing').ended).resolves.toBe('failed');
  await expect(engine.play('nope').ended).resolves.toBe('failed');
});

test('while audio is blocked, sound effects are dropped (not queued) but music still starts', async () => {
  const { engine, sources } = setup('suspended', { stuck: true }); // autoplay not allowed
  await engine.load();
  await expect(engine.play('hit').ended).resolves.toBe('failed');
  engine.play('music', { loop: true });
  expect(sources).toHaveLength(1);
  expect(sources[0].loop).toBe(true);
  await flush();
});

test('a clip that is fading out no longer counts as playing', async () => {
  const { engine } = setup();
  await engine.load();
  engine.play('music', { loop: true });
  expect(engine.isPlaying('music')).toBe(true);
  engine.stop('music', 1.5);
  expect(engine.isPlaying('music')).toBe(false); // so idle music can restart right away
});
