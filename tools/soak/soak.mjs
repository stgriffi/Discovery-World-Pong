#!/usr/bin/env node
// End-to-end soak test for the Pong exhibit.
//
// Opens the real gameboard and TYLER pages in Firefox (Playwright) and plays both paddles
// over MQTT with imperfect bots, including players walking away mid-game. Checks every
// game/state sequence against an independent copy of the exhibit state machine, flags
// stalls, page errors and app/logs errors, and checks game/play runs at 60 Hz.
//
// Usage (stack running: mqtt-broker, gameboard, tyler):
//   node soak.mjs --games 20 --round 5 --exit-rate 0.3
//   node soak.mjs --minutes 60 --no-top-bot     # when ai-paddle-control plays TYLER
//   node soak.mjs --no-browser                  # pages already open (e.g. the kiosk)
import mqtt from 'mqtt';

const args = parseArgs(process.argv.slice(2));
const BROKER = args.broker || 'ws://localhost:9001';
const GAMEBOARD_URL = args.gameboard || 'http://localhost:5000/';
const TYLER_URL = args.tyler || 'http://localhost:5003/';
const ROUND_S = args.round ? Number(args.round) : 30;
const MAX_GAMES = args.games ? Number(args.games) : Infinity;
const MAX_MINUTES = args.minutes ? Number(args.minutes) : Infinity;
const EXIT_RATE = args['exit-rate'] !== undefined ? Number(args['exit-rate']) : 0.3;
const TOP_BOT = !args['no-top-bot'];
const BROWSER = !args['no-browser'];
const HEADED = !!args.headed;
const SEED = args.seed ? Number(args.seed) : Date.now() % 100000;

// Independent copy of the exhibit state machine (modules/shared/.../BaseGameStateMachine.js).
const NEXT = {
  stopped: { start: 'idle' },
  idle: { player_ready: 'intro', game_complete: 'idle', stop: 'stopped' },
  intro: { intro_complete: 'moveIntro' },
  moveIntro: { move_intro_complete: 'level1Intro' },
  level1Intro: { level1_intro_complete: 'level1' },
  level1: { level1_complete: 'level2Intro' },
  level2Intro: { level2_intro_complete: 'level2' },
  level2: { level2_complete: 'level3Intro' },
  level3Intro: { level3_intro_complete: 'level3' },
  level3: { level3_complete: 'outro' },
  outro: { game_complete: 'idle' },
};
const IN_GAME = ['intro', 'moveIntro', 'level1Intro', 'level1', 'level2Intro', 'level2', 'level3Intro', 'level3'];
IN_GAME.forEach((s) => (NEXT[s].player_exit = 'idle'));
Object.keys(NEXT).forEach((s) => (NEXT[s].reset = 'idle'));

// Longest each state should last before we call it a stall (seconds).
const STALL_S = {
  intro: 16,
  moveIntro: 15,
  level1Intro: 13,
  level2Intro: 16,
  level3Intro: 17,
  level1: 2 + ROUND_S + 20,
  level2: 2 + ROUND_S + 20,
  level3: 2 + 150 + 20,
  outro: 20,
};

let rngState = SEED;
const random = () => {
  rngState = (rngState * 1103515245 + 12345) % 2147483648;
  return rngState / 2147483648;
};

const t0 = Date.now();
const elapsed = () => ((Date.now() - t0) / 1000).toFixed(1);
const log = (...m) => console.log(`[${elapsed()}s]`, ...m);
const failures = [];
const fail = (message) => {
  failures.push(`[${elapsed()}s] ${message}`);
  log('FAIL:', message);
};

const stats = {
  games: 0,
  completed: 0,
  exits: 0,
  exitsRequested: 0,
  ignored: {},
  durations: {},
  playRates: [],
  pageErrors: 0,
  appLogErrors: 0,
  tylerReturns: 0,
  humanReturns: 0,
  goalsHuman: 0,
  goalsTyler: 0,
};

// ------------------------------------------------------------------- browsers

let browser = null;
async function openPages() {
  const { firefox } = await import('playwright');
  browser = await firefox.launch({
    headless: !HEADED,
    firefoxUserPrefs: { 'media.autoplay.default': 0, 'media.autoplay.block-webaudio': false },
  });
  const gameboardUrl = new URL(GAMEBOARD_URL);
  if (ROUND_S !== 30) gameboardUrl.searchParams.set('round', String(ROUND_S));
  for (const [name, url] of [
    ['tyler', TYLER_URL],
    ['gameboard', gameboardUrl.toString()],
  ]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (err) => {
      stats.pageErrors += 1;
      fail(`${name} page error: ${err.message}`);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        stats.pageErrors += 1;
        fail(`${name} console.error: ${msg.text().slice(0, 300)}`);
      }
    });
    await page.goto(url);
    log(`opened ${name}: ${url}`);
  }
}

// ----------------------------------------------------------------------- mqtt

const client = mqtt.connect(BROKER, { clientId: `soak-${SEED}`, clean: true });
const publish = (topic, message, retain = false) => client.publish(topic, JSON.stringify(message), { retain });

let state = 'idle';
let stateSince = Date.now();
let ball = { x: 0, y: 0, vy: 0 };
let lastBall = null;
let playCount = 0;
let playWindowStart = null;
let exitPlan = null; // { state, atMs } for the current game
let exitRequestedAt = null;
let humanPresent = false;

function setState(next, transition) {
  const seconds = (Date.now() - stateSince) / 1000;
  (stats.durations[state] = stats.durations[state] || []).push(seconds);
  log(`${state} --${transition}--> ${next} (${seconds.toFixed(1)}s)`);
  if (/^level[123]$/.test(state) && playWindowStart !== null) {
    const rate = playCount / ((Date.now() - playWindowStart) / 1000);
    stats.playRates.push(rate);
    playWindowStart = null;
  }
  const prev = state;
  state = next;
  stateSince = Date.now();
  if (/^level[123]$/.test(next)) {
    playCount = 0;
    playWindowStart = Date.now();
  }
  if (prev === 'idle' && next === 'intro') onGameStarted();
  if (next === 'idle' && prev !== 'idle') onGameEnded(transition);
}

function onGameStarted() {
  stats.games += 1;
  exitPlan = null;
  if (random() < EXIT_RATE) {
    exitPlan = { state: IN_GAME[Math.floor(random() * IN_GAME.length)], afterMs: 500 + random() * 4000 };
    log(`game ${stats.games}: the player will walk away during ${exitPlan.state}`);
  } else {
    log(`game ${stats.games}: playing to the end`);
  }
}

function onGameEnded(transition) {
  if (transition === 'player_exit') stats.exits += 1;
  if (transition === 'game_complete') stats.completed += 1;
  if (exitRequestedAt !== null) {
    if (transition !== 'player_exit' && transition !== 'reset') fail(`asked to exit but the game ended via ${transition}`);
    exitRequestedAt = null;
  }
  if (stats.completed + stats.exits >= MAX_GAMES) return finish();
  // Like the depth camera: not_ready when the game ends, ready again ~1.5 s later
  // (or a new player arriving after a walk-away).
  setTimeout(() => setHuman(false), 100);
  setTimeout(() => setHuman(true), transition === 'player_exit' ? 3000 : 1500);
}

function setHuman(present) {
  humanPresent = present;
  publish('paddle/bottom/state', { state: present ? 'ready' : 'not_ready' }, true);
}

client.on('connect', async () => {
  log(`connected to ${BROKER} (seed ${SEED})`);
  client.subscribe(['game/state', 'game/play', 'app/logs/#']);
  if (TOP_BOT) publish('paddle/top/state', { state: 'start' }, true);
  setHuman(false);
  if (BROWSER) await openPages();
  setTimeout(() => setHuman(true), 4000);
});

client.on('message', (topic, payload) => {
  let message;
  try {
    message = JSON.parse(payload.toString());
  } catch (err) {
    fail(`non-JSON message on ${topic}`);
    return;
  }
  if (topic === 'game/state') onTransition(message.transition);
  else if (topic === 'game/play') onGamePlay(message);
  else if (topic.startsWith('app/logs/') && message.level === 'error') {
    stats.appLogErrors += 1;
    fail(`${topic}: ${message.message}`);
  }
});

function onTransition(transition) {
  const next = NEXT[state] && NEXT[state][transition];
  if (!next) {
    const key = `${transition}@${state}`;
    stats.ignored[key] = (stats.ignored[key] || 0) + 1;
    return;
  }
  setState(next, transition);
}

function onGamePlay(message) {
  playCount += 1;
  const { x, y } = message.ball.position;
  if (lastBall) {
    const vy = y - lastBall.y;
    // Direction flips near a paddle are returns (world y: +69.5 TYLER, -69.5 human).
    if (ball.vy > 0 && vy < 0 && y > 40) stats.tylerReturns += 1;
    if (ball.vy < 0 && vy > 0 && y < -40) stats.humanReturns += 1;
    if (lastBall.y > 70 && y === -53 && lastBall.y !== -53) stats.goalsHuman += 1;
    if (lastBall.y < -70 && y === -53 && lastBall.y !== -53) stats.goalsTyler += 1;
    ball = { x, y, vy };
  }
  lastBall = { x, y };
}

// ----------------------------------------------------------------------- bots

// Human bot: follows the ball at depth-camera rate (30 Hz) with a little lag and error,
// and occasionally gives up on a ball.
let humanAim = 0;
let humanGivesUp = false;
setInterval(() => {
  if (!humanPresent || !/^level[123]/.test(state)) return;
  if (ball.vy < 0 && ball.y < 0 && random() < 0.002) humanGivesUp = true;
  if (ball.vy > 0) humanGivesUp = false;
  const target = humanGivesUp ? (ball.x > 0 ? -90 : 90) : ball.x + humanAim;
  if (random() < 0.05) humanAim = (random() - 0.5) * 16; // hit with different parts of the paddle
  publish('paddle/bottom/position', { position: { x: Math.min(1, Math.max(0, (target + 96) / 192)) } });
}, 33);

// TYLER bot (when ai-paddle-control isn't running): tracks the ball, every 5th tick.
setInterval(() => {
  if (!TOP_BOT || !/^level[123]/.test(state)) return;
  const miss = random() < 0.01;
  const target = miss ? -ball.x : ball.x + (random() - 0.5) * 10;
  publish('paddle/top/position', { position: { x: Math.min(1, Math.max(0, (target + 96) / 192)) } });
}, 83);

// Walk-aways and stall checks.
setInterval(() => {
  const inState = Date.now() - stateSince;
  if (exitPlan && state === exitPlan.state && inState > exitPlan.afterMs && exitRequestedAt === null) {
    log(`player walks away during ${state}`);
    stats.exitsRequested += 1;
    exitRequestedAt = Date.now();
    humanPresent = false;
    publish('paddle/bottom/state', { state: 'stop' }, true);
  }
  if (exitRequestedAt !== null && Date.now() - exitRequestedAt > 3000 && state !== 'idle') {
    fail(`player_exit did not take effect within 3 s (state ${state})`);
    exitRequestedAt = null;
  }
  const limit = STALL_S[state];
  if (limit && inState > limit * 1000) {
    fail(`stalled in ${state} for ${(inState / 1000).toFixed(0)} s`);
    stateSince = Date.now(); // report each stall once
  }
  if (state === 'idle' && humanPresent && inState > 20000) {
    fail('a ready player has waited 20 s in idle without a game starting');
    stateSince = Date.now();
  }
  if ((Date.now() - t0) / 60000 > MAX_MINUTES) finish();
}, 250);

// ---------------------------------------------------------------------- report

let finished = false;
async function finish() {
  if (finished) return;
  finished = true;
  const summarize = (list) =>
    list && list.length
      ? `n=${list.length} min=${Math.min(...list).toFixed(1)} avg=${(list.reduce((a, b) => a + b, 0) / list.length).toFixed(1)} max=${Math.max(...list).toFixed(1)}`
      : 'n=0';
  console.log('\n===== soak summary =====');
  console.log(`duration: ${elapsed()} s, seed ${SEED}`);
  console.log(`games: ${stats.games} started, ${stats.completed} completed, ${stats.exits} exits (${stats.exitsRequested} requested)`);
  Object.entries(stats.durations).forEach(([s, list]) => console.log(`  ${s.padEnd(12)} ${summarize(list)} s`));
  console.log(`game/play rate per level: ${summarize(stats.playRates)} msg/s`);
  console.log(`returns: TYLER ${stats.tylerReturns}, human ${stats.humanReturns}; goals: human ${stats.goalsHuman}, TYLER ${stats.goalsTyler}`);
  console.log(`ignored duplicate/late transitions: ${JSON.stringify(stats.ignored)}`);
  stats.playRates.forEach((rate) => {
    if (rate < 55 || rate > 65) fail(`game/play ran at ${rate.toFixed(1)} msg/s during a level (expected ~60)`);
  });
  console.log(failures.length ? `\nFAILURES (${failures.length}):\n${failures.join('\n')}` : '\nno failures');
  if (TOP_BOT) publish('paddle/top/state', { state: 'not_ready' }, true);
  publish('paddle/bottom/state', { state: 'not_ready' }, true);
  setTimeout(async () => {
    if (browser) await browser.close();
    client.end();
    process.exit(failures.length ? 1 : 0);
  }, 500);
}

process.on('SIGINT', finish);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}
