// Low-latency audio for the exhibit's browser apps, built on the Web Audio API.
//
// Every clip is fetched and decoded once at startup; playing a clip just starts an
// AudioBufferSourceNode, so sounds fire in the same frame as the game event, can overlap
// (several paddle hits in a row), and never wait on network or decoding. HTMLAudio, which
// the apps used before, has noticeable start latency and can't overlap a clip with itself.
//
// Signal chain: clip gain -> bus gain (music / sfx / voice) -> master -> limiter -> speakers.
//
// clips: { id: { url, bus = 'sfx', gain = 1, maxVoices = 4 } }

const DEFAULT_BUSES = { music: 1, sfx: 1, voice: 1 };

export function createAudioEngine({
  clips,
  buses = DEFAULT_BUSES,
  AudioContextImpl = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : undefined,
  fetchImpl = typeof fetch !== 'undefined' ? fetch.bind(globalThis) : undefined,
  log = console,
}) {
  const ctx = new AudioContextImpl({ latencyHint: 'interactive' });
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(ctx.destination);
  const master = ctx.createGain();
  master.connect(limiter);

  const busNodes = {};
  Object.entries({ ...DEFAULT_BUSES, ...buses }).forEach(([name, value]) => {
    const node = ctx.createGain();
    node.gain.value = value;
    node.connect(master);
    busNodes[name] = node;
  });

  const buffers = new Map(); // id -> AudioBuffer
  const voices = new Map(); // id -> array of playing voices, oldest first
  const stateListeners = new Set();
  let warnedBlocked = false;

  ctx.onstatechange = () => stateListeners.forEach((listener) => listener(ctx.state));

  // Resume as soon as the browser allows: right away (kiosk profiles allow autoplay), on
  // the first input (normal browsers), and periodically in case something suspended us.
  function resume() {
    if (ctx.state === 'suspended') return ctx.resume().catch(() => {});
    return Promise.resolve();
  }
  if (typeof window !== 'undefined') {
    const unlock = () => resume();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    setInterval(resume, 5000);
  }
  resume();

  async function loadOne(id, clip) {
    const response = await fetchImpl(clip.url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.arrayBuffer();
    buffers.set(id, await ctx.decodeAudioData(data));
  }

  // Load every clip; failures are logged, never thrown (that clip just won't play).
  async function load() {
    const results = await Promise.allSettled(Object.entries(clips).map(([id, clip]) => loadOne(id, clip)));
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        log.warn(`[audio] could not load ${Object.keys(clips)[i]}: ${result.reason && result.reason.message}`);
      }
    });
    return buffers.size;
  }

  function failedHandle() {
    return { stop() {}, ended: Promise.resolve('failed'), duration: 0 };
  }

  function play(id, { gain = 1, loop = false, loopStart = 0, loopEnd = 0, offset = 0 } = {}) {
    const clip = clips[id];
    const buffer = buffers.get(id);
    if (!clip || !buffer) return failedHandle();
    const bus = clip.bus || 'sfx';
    if (ctx.state !== 'running') {
      resume();
      if (!warnedBlocked) {
        warnedBlocked = true;
        log.warn(`[audio] audio context is ${ctx.state}; sound is blocked until the page is allowed to play it`);
      }
      // A sound effect played late would be wrong (they'd all fire at once on unlock).
      if (bus === 'sfx') return failedHandle();
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    if (loop && loopEnd > loopStart) {
      source.loopStart = loopStart;
      source.loopEnd = loopEnd;
    }
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = (clip.gain === undefined ? 1 : clip.gain) * gain;
    source.connect(voiceGain);
    voiceGain.connect(busNodes[bus] || master);

    let stopped = false;
    let settle;
    const ended = new Promise((resolve) => {
      settle = resolve;
    });
    const voice = { source, voiceGain };
    const list = voices.get(id) || [];
    voices.set(id, list);
    list.push(voice);
    source.onended = () => {
      const index = list.indexOf(voice);
      if (index >= 0) list.splice(index, 1);
      voiceGain.disconnect();
      settle(stopped ? 'stopped' : 'ended');
    };

    voice.stop = (fadeSeconds = 0) => {
      if (stopped) return;
      stopped = true;
      voice.stopping = true; // fading out no longer counts as playing
      const t = ctx.currentTime;
      try {
        if (fadeSeconds > 0) {
          voiceGain.gain.setValueAtTime(voiceGain.gain.value, t);
          voiceGain.gain.linearRampToValueAtTime(0, t + fadeSeconds);
          source.stop(t + fadeSeconds);
        } else {
          source.stop();
        }
      } catch (err) {
        settle('stopped'); // never started
      }
    };

    // Cut off the oldest voices beyond the limit. Remove them from the list now: their
    // onended only fires later, asynchronously.
    const maxVoices = clip.maxVoices || 4;
    while (list.length > maxVoices) list.shift().stop(0.02);

    source.start(0, offset);
    return { stop: voice.stop, ended, duration: buffer.duration };
  }

  function stop(id, fadeSeconds = 0) {
    [...(voices.get(id) || [])].forEach((voice) => voice.stop(fadeSeconds));
  }

  function stopBus(bus, fadeSeconds = 0) {
    Object.keys(clips).forEach((id) => {
      if ((clips[id].bus || 'sfx') === bus) stop(id, fadeSeconds);
    });
  }

  return {
    load,
    play,
    stop,
    stopBus,
    resume,
    isPlaying: (id) => (voices.get(id) || []).some((voice) => !voice.stopping),
    durationOf: (id) => (buffers.has(id) ? buffers.get(id).duration : null),
    get state() {
      return ctx.state;
    },
    onStateChange(listener) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
  };
}
