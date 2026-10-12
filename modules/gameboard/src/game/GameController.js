// The gameboard's game logic, independent of React and three.js.
//
// Owns the shared exhibit state machine (driven only by `game/state` messages), the
// in-level gameplay state machine, the physics, every timer, and all MQTT traffic.
// React components only read `ui` (low-frequency state) and `getRenderState()`.
import createBaseGameStateMachine, {
  applyGameStateTransition,
  IN_GAME_STATES,
} from 'dw-state-machine/lib/BaseGameStateMachine.js';
import Topics from 'dw-state-machine/lib/topics.js';
import { TRAINING as T, BOARD, SIDES } from './constants';
import {
  createSim,
  step,
  startServe,
  parkBall,
  centerPaddle,
  chaseVx,
  motionMoveVx,
  toWorldX,
  toWorldY,
  toNormalized,
  fromNormalized,
} from './pongSim';
import { createFixedStepLoop } from './fixedStep';
import { createTimerBag } from './timerBag';
import { createStore } from './store';
import { createPresence } from './presence';
import { TEXT, formatClock } from './texts';

// States TYLER is supposed to end by publishing a transition when its voice clip finishes.
// If it doesn't (TYLER not running, audio blocked), the gameboard publishes it after the
// clip length plus a margin. TYLER's own fallback is shorter, so it normally wins.
export const WATCHDOGS = Object.freeze({
  intro: { ms: 12000, transition: 'intro_complete' },
  moveIntro: { ms: 11000, transition: 'move_intro_complete' },
  level1Intro: { ms: 9000, transition: 'level1_intro_complete' },
  level2Intro: { ms: 11500, transition: 'level2_intro_complete' },
  level3Intro: { ms: 13000, transition: 'level3_intro_complete' },
  outro: { ms: 15000, transition: 'game_complete' },
});

export const DEFAULT_CONFIG = Object.freeze({
  levelTicks: BOARD.LEVEL_TICKS,
  l3CapTicks: BOARD.L3_CAP_TICKS,
  pointPauseTicks: BOARD.POINT_PAUSE_TICKS,
  countdownStepTicks: BOARD.COUNTDOWN_STEP_TICKS,
  watchdogScale: 1,
  bootCooldownMs: 3000, // after the page loads, before a game may start
  postGameCooldownMs: 5000, // after a game, before the next may start
  // A game starts only on a paddle becoming ready after idle began (never on a remembered
  // "ready"); this optionally pushes that point later.
  readyIgnoreMs: 0,
  retryMs: 2000, // republish a transition if the state machine hasn't moved
  maxRetries: 5,
  driverIntervalMs: 4,
});

// Gameplay states in which the physics runs and game/play is published.
const BOARD_ACTIVE = new Set(['levelIntro', 'countdown', 'serve', 'rally', 'pointPause']);
// Gameplay states in which the level clock runs (it starts at the serve).
const CLOCK_RUNNING = new Set(['serve', 'rally', 'pointPause']);

const NO_AUDIO = Object.freeze({ onBaseState() {}, onGameplay() {}, onSimEvents() {} });

const defaultNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const clampPaddle = (x) => Math.min(BOARD.PADDLE_MAX_X, Math.max(BOARD.PADDLE_MIN_X, x));
const lerp = (a, b, t) => a + (b - a) * t;

export function createGameController({
  api,
  audio = NO_AUDIO,
  now = defaultNow,
  timers = {},
  config = {},
  log = console,
} = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const setIntervalFn = timers.setIntervalFn || setInterval;
  const clearIntervalFn = timers.clearIntervalFn || clearInterval;
  const timerFns = {
    setTimeoutFn: timers.setTimeoutFn || setTimeout,
    clearTimeoutFn: timers.clearTimeoutFn || clearTimeout,
  };

  const sim = createSim({ mode: 'board' });
  const presence = createPresence();
  const baseTimers = createTimerBag(timerFns); // cleared on every base state change
  const fsm = createBaseGameStateMachine(api, { autoSubscribe: false });
  const loop = createFixedStepLoop({
    hz: T.TICK_HZ,
    maxCatchUpTicks: BOARD.MAX_CATCH_UP_TICKS,
    onTick,
  });
  const ui = createStore({
    screen: 'instructions', // 'instructions' | 'gameplay'
    instruction: 'welcome', // 'welcome' | 'moveLeftRight'
    centerText: TEXT.BLANK,
    level: 0,
    topScore: 0, // TYLER
    bottomScore: 0, // human
    timerText: TEXT.BLANK,
  });

  let gameplay = 'inactive';
  let counter = 0; // ticks spent in the current countdown / point pause
  let level = 0;
  let clockTicks = 0;
  let l3Ticks = 0;
  let frame = 0;
  let topScore = 0;
  let bottomScore = 0;
  let topTarget = T.PADDLE_RESET_X;
  let bottomTarget = T.PADDLE_RESET_X;
  let idleEnteredAt = -Infinity;
  let cooldownMs = cfg.bootCooldownMs;
  let readyIgnoreMs = 0;
  let booting = true; // still in the first idle since the page loaded
  let startPending = false;
  let exitPending = false;
  let resetPublished = false;
  let started = false;
  let driver = null;
  const unsubscribers = [];
  const prev = { ballX: sim.ball.x, ballY: sim.ball.y, topX: sim.top.x, bottomX: sim.bottom.x };

  // ---------------------------------------------------------------- publishing

  // Publish a game/state transition and keep republishing while the state machine is
  // still in `whileIn` (lost message, broker down). Each transition is legal from only
  // one state, so extra copies are harmless.
  function publishTransition(transition, whileIn, stillValid = () => true) {
    let delivered = 0;
    const attempt = () => {
      if (fsm.state !== whileIn) return;
      if (!stillValid()) {
        if (transition === 'player_ready') startPending = false;
        return;
      }
      if (delivered >= cfg.maxRetries) {
        log.warn(`[game] ${transition} never took effect; resetting the exhibit`);
        api.update(Topics.GAME_STATE, { transition: 'reset' });
        return;
      }
      if (api.update(Topics.GAME_STATE, { transition })) delivered += 1;
      baseTimers.after(cfg.retryMs, attempt);
    };
    attempt();
  }

  function publishGamePlay() {
    api.update(Topics.GAME_PLAY, {
      ball: { position: { x: toWorldX(sim.ball.x), y: toWorldY(sim.ball.y) } },
      paddle_top: { position: { x: toNormalized(sim.top.x) } },
      paddle_bottom: { position: { x: toNormalized(sim.bottom.x) } },
      frame,
    });
    frame += 1;
  }

  // Scores for TYLER's faces (and anything else that wants them).
  function publishStats() {
    api.update(Topics.GAME_STATS, {
      player_top: { score: topScore },
      player_bottom: { score: bottomScore },
      level,
    });
  }

  // Tell the paddles a point/level is starting over. Fire-and-forget: nothing waits for
  // an answer (no paddle service ever sent one; the old handshake only saw its own echo).
  function publishPaddleResets() {
    api.update(Topics.PADDLE_TOP_STATE_TRANSITION, { transition: 'reset' });
    api.update(Topics.PADDLE_BOTTOM_STATE_TRANSITION, { transition: 'reset' });
  }

  // ------------------------------------------------------- gameplay state machine

  function winnerText() {
    if (bottomScore > topScore) return TEXT.HUMAN_WINS;
    if (bottomScore < topScore) return TEXT.TYLER_WINS;
    return TEXT.DRAW;
  }

  function enterGameplay(name) {
    gameplay = name;
    counter = 0;
    switch (name) {
      case 'inactive':
        parkBall(sim, { visible: false });
        centerPaddle(sim, SIDES.TOP);
        topTarget = sim.top.x;
        break;
      case 'levelIntro':
        parkBall(sim, { visible: true });
        centerPaddle(sim, SIDES.TOP);
        topTarget = sim.top.x;
        publishPaddleResets();
        break;
      case 'countdown':
        ui.setState({ centerText: TEXT.COUNTDOWN[0] });
        break;
      case 'serve':
        startServe(sim);
        topTarget = sim.top.x; // TYLER starts each serve from the center, as in training
        ui.setState({ centerText: TEXT.BLANK });
        break;
      case 'pointPause':
        publishPaddleResets();
        break;
      case 'levelOver':
        parkBall(sim, { visible: false });
        ui.setState({ centerText: TEXT.TIME_UP, timerText: formatClock(0) });
        publishTransition(`level${level}_complete`, `level${level}`);
        break;
      case 'gameOver':
        parkBall(sim, { visible: false });
        ui.setState({ centerText: winnerText() });
        if (fsm.state === 'level3') publishTransition('level3_complete', 'level3');
        break;
      case 'result': // the outro, if we got there without our own gameOver
        parkBall(sim, { visible: false });
        ui.setState({ centerText: winnerText() });
        break;
      default:
        break;
    }
    audio.onGameplay(name, { level, topScore, bottomScore });
  }

  function onGoal(scorer) {
    if (scorer === 'human') bottomScore += 1;
    else topScore += 1;
    ui.setState({ topScore, bottomScore });
    publishStats();
    topTarget = sim.top.x; // the sim recentered TYLER's paddle
    if (level === 3 && scorer === 'tyler') enterGameplay('gameOver');
    else enterGameplay('pointPause');
  }

  function advanceCounters() {
    if (gameplay === 'countdown') {
      counter += 1;
      const stepTicks = cfg.countdownStepTicks;
      if (counter >= TEXT.COUNTDOWN.length * stepTicks) enterGameplay('serve');
      else if (counter % stepTicks === 0) ui.setState({ centerText: TEXT.COUNTDOWN[counter / stepTicks] });
    } else if (gameplay === 'pointPause') {
      counter += 1;
      if (counter >= cfg.pointPauseTicks) enterGameplay('serve');
    }
  }

  // One 60 Hz tick.
  function onTick() {
    if (!BOARD_ACTIVE.has(gameplay)) return;
    const clockRunning = CLOCK_RUNNING.has(gameplay);
    const tylerLive = gameplay === 'serve' || gameplay === 'rally';
    const topVx = tylerLive ? chaseVx(sim.top.x, topTarget) : 0;
    const bottomVx = motionMoveVx(sim.bottom.x, bottomTarget);

    prev.ballX = sim.ball.x;
    prev.ballY = sim.ball.y;
    prev.topX = sim.top.x;
    prev.bottomX = sim.bottom.x;
    const events = step(sim, { topVx, bottomVx });
    if (sim.snap) {
      prev.ballX = sim.ball.x;
      prev.ballY = sim.ball.y;
      prev.topX = sim.top.x;
      prev.bottomX = sim.bottom.x;
      sim.snap = false;
    }

    let transitioned = false;
    events.forEach((event) => {
      if (event.type === 'served' && gameplay === 'serve') {
        enterGameplay('rally');
        transitioned = true;
      } else if (event.type === 'goal') {
        onGoal(event.scorer);
        transitioned = true;
      }
    });
    if (events.length > 0) audio.onSimEvents(events, { level, topScore, bottomScore });

    if (clockRunning) {
      if (level < 3) clockTicks -= 1;
      else l3Ticks += 1;
    }
    if (level < 3 && clockRunning && clockTicks <= 0 && CLOCK_RUNNING.has(gameplay)) {
      enterGameplay('levelOver'); // a goal on this same tick still counted
      transitioned = true;
    } else if (level === 3 && l3Ticks >= cfg.l3CapTicks && BOARD_ACTIVE.has(gameplay)) {
      enterGameplay('gameOver');
      transitioned = true;
    }
    if (!transitioned) advanceCounters();

    if (BOARD_ACTIVE.has(gameplay)) publishGamePlay();
    if (level > 0 && level < 3 && clockRunning) ui.setState({ timerText: formatClock(clockTicks) });
  }

  // ------------------------------------------------------ exhibit state machine

  function enterIdle() {
    enterGameplay('inactive');
    level = 0;
    topScore = 0;
    bottomScore = 0;
    ui.setState({
      screen: 'instructions',
      instruction: 'welcome',
      centerText: TEXT.BLANK,
      level: 0,
      topScore: 0,
      bottomScore: 0,
      timerText: TEXT.BLANK,
    });
    publishStats();
    idleEnteredAt = now();
    cooldownMs = booting ? cfg.bootCooldownMs : cfg.postGameCooldownMs;
    readyIgnoreMs = cfg.readyIgnoreMs;
    startPending = false;
    baseTimers.after(Math.max(cooldownMs, readyIgnoreMs) + 1, evaluateStart);
  }

  function enterLevelIntro(n) {
    level = n;
    clockTicks = n < 3 ? cfg.levelTicks : 0;
    l3Ticks = 0;
    frame = 0;
    ui.setState({
      screen: 'gameplay',
      level: n,
      centerText: TEXT.GET_READY,
      timerText: n < 3 ? formatClock(clockTicks) : TEXT.SUDDEN_DEATH,
    });
    publishStats();
    enterGameplay('levelIntro');
  }

  function onEnterBaseState(state, from, transition) {
    exitPending = false;
    switch (state) {
      case 'idle':
        enterIdle();
        break;
      case 'intro':
        ui.setState({ screen: 'instructions', instruction: 'welcome' });
        break;
      case 'moveIntro':
        ui.setState({ screen: 'instructions', instruction: 'moveLeftRight' });
        break;
      case 'level1Intro':
      case 'level2Intro':
      case 'level3Intro':
        enterLevelIntro(Number(state[5]));
        break;
      case 'level1':
      case 'level2':
      case 'level3': {
        const n = Number(state[5]);
        if (level !== n) enterLevelIntro(n); // missed the intro somehow
        enterGameplay('countdown');
        const countdownMs = (TEXT.COUNTDOWN.length * cfg.countdownStepTicks * 1000) / T.TICK_HZ;
        const playMs = ((n < 3 ? cfg.levelTicks : cfg.l3CapTicks) * 1000) / T.TICK_HZ;
        // Backstop in case the tick clock stalls (e.g. the window was hidden).
        baseTimers.after(countdownMs + playMs + 15000, () => {
          if (fsm.state !== state) return;
          if (n < 3 && gameplay !== 'levelOver') enterGameplay('levelOver');
          if (n === 3 && gameplay !== 'gameOver') enterGameplay('gameOver');
        });
        break;
      }
      case 'outro':
        if (gameplay !== 'gameOver') enterGameplay('result');
        break;
      default:
        break;
    }

    const watchdog = WATCHDOGS[state];
    if (watchdog) {
      baseTimers.after(watchdog.ms * cfg.watchdogScale, () => {
        log.warn(`[game] no ${watchdog.transition} from TYLER; publishing it`);
        publishTransition(watchdog.transition, state);
      });
    }
    evaluateExit();
    audio.onBaseState(state, from, transition);
  }

  fsm.observe({
    onLeaveState: (lifecycle) => {
      baseTimers.clear();
      if (lifecycle.from === 'idle') booting = false;
    },
    onEnterState: (lifecycle) => {
      if (lifecycle.to === 'none') return;
      onEnterBaseState(lifecycle.to, lifecycle.from, lifecycle.transition);
    },
    onAfterTransition: (lifecycle) => {
      // reset while already idle is a self-transition (no leave/enter events).
      if (lifecycle.transition === 'reset' && lifecycle.from === lifecycle.to) {
        enterGameplay('inactive');
        evaluateStart();
      }
    },
  });

  // ------------------------------------------------------------- start / exit

  function canStart() {
    if (fsm.state !== 'idle' || startPending || !api.isConnected()) return false;
    if (now() < idleEnteredAt + cooldownMs) return false;
    if (!presence.isReady(SIDES.BOTTOM) || !presence.isReady(SIDES.TOP)) return false;
    return presence.readyEdgeAt(SIDES.BOTTOM) >= idleEnteredAt + readyIgnoreMs;
  }

  function evaluateStart() {
    if (!canStart()) return;
    startPending = true;
    publishTransition('player_ready', 'idle', () => presence.isReady(SIDES.BOTTOM) && presence.isReady(SIDES.TOP));
  }

  function evaluateExit() {
    if (exitPending || !IN_GAME_STATES.includes(fsm.state)) return;
    if (presence.state(SIDES.BOTTOM) === 'stop' || presence.state(SIDES.TOP) === 'stop') {
      exitPending = true;
      publishTransition('player_exit', fsm.state);
    }
  }

  function onPaddleState(side, state) {
    presence.update(side, state, now());
    evaluateStart();
    evaluateExit();
  }

  function onConnected() {
    if (!resetPublished) {
      // Bring TYLER (and anything else) back in step with this freshly loaded gameboard.
      resetPublished = api.update(Topics.GAME_STATE, { transition: 'reset' });
    }
    evaluateStart();
  }

  // ------------------------------------------------------------------ public

  function start() {
    if (started) return;
    started = true;
    const observe = (topic, handler) => {
      const unsubscribe = api.registerObserver(topic, handler);
      if (typeof unsubscribe === 'function') unsubscribers.push(unsubscribe);
    };
    observe(Topics.GAME_STATE, (message) => applyGameStateTransition(fsm, message.transition));
    observe(Topics.PADDLE_TOP_POSITION, (message) => {
      topTarget = clampPaddle(fromNormalized(message.position.x));
    });
    observe(Topics.PADDLE_BOTTOM_POSITION, (message) => {
      bottomTarget = clampPaddle(fromNormalized(message.position.x));
    });
    observe(Topics.PADDLE_TOP_STATE, (message) => onPaddleState(SIDES.TOP, message.state));
    observe(Topics.PADDLE_BOTTOM_STATE, (message) => onPaddleState(SIDES.BOTTOM, message.state));
    if (typeof api.onConnectionChange === 'function') {
      unsubscribers.push(
        api.onConnectionChange((isUp) => {
          if (isUp) onConnected();
        }),
      );
    }

    fsm.start(); // stopped -> idle locally; every instance does this when it loads
    if (api.isConnected()) onConnected();
    driver = setIntervalFn(() => loop.advance(now()), cfg.driverIntervalMs);
  }

  function stop() {
    if (!started) return;
    started = false;
    unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
    baseTimers.clear();
    if (driver !== null) clearIntervalFn(driver);
    driver = null;
  }

  // Interpolated positions in world coordinates for the renderer. Fills and returns `out`.
  function getRenderState(out = {}) {
    const a = loop.alpha();
    out.ballVisible = sim.ball.visible && gameplay !== 'inactive';
    out.ballX = toWorldX(lerp(prev.ballX, sim.ball.x, a));
    out.ballY = toWorldY(lerp(prev.ballY, sim.ball.y, a));
    out.topX = toWorldX(lerp(prev.topX, sim.top.x, a));
    out.topY = toWorldY(T.TOP_PADDLE_Y);
    out.bottomX = toWorldX(lerp(prev.bottomX, sim.bottom.x, a));
    out.bottomY = toWorldY(T.BOTTOM_PADDLE_Y);
    return out;
  }

  return {
    start,
    stop,
    advance: (t = now()) => loop.advance(t),
    getRenderState,
    ui,
    // For tests and debugging.
    inspect: () => ({
      base: fsm.state,
      gameplay,
      level,
      clockTicks,
      l3Ticks,
      topScore,
      bottomScore,
      frame,
      timers: baseTimers.size,
      stats: { ...loop.stats },
    }),
    sim,
  };
}
