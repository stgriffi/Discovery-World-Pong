#!/usr/bin/env node
// Plays one game with bot paddles and saves screenshots of the gameboard and TYLER at each
// stage (results/shot-*.png), for checking the HUD, timer and faces by eye.
//   node screenshots.mjs [--round 8] [--no-top-bot]
import mqtt from 'mqtt';
import { firefox } from 'playwright';

const argv = process.argv.slice(2);
const ROUND = argv.includes('--round') ? Number(argv[argv.indexOf('--round') + 1]) : 8;
const TOP_BOT = !argv.includes('--no-top-bot');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await firefox.launch({ firefoxUserPrefs: { 'media.autoplay.default': 0 } });
const gameboard = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const tyler = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
const errors = [];
for (const [name, page] of [['gameboard', gameboard], ['tyler', tyler]]) {
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
}
await tyler.goto('http://localhost:5003/');
await gameboard.goto(`http://localhost:5000/?round=${ROUND}`);

const client = mqtt.connect('ws://localhost:9001', { clientId: `screenshots-${Date.now()}` });
await new Promise((r) => client.on('connect', r));
const publish = (topic, message, retain = false) => client.publish(topic, JSON.stringify(message), { retain });
let ball = { x: 0, y: 0 };
let state = 'idle';
client.subscribe(['game/state', 'game/play']);
client.on('message', (topic, payload) => {
  const message = JSON.parse(payload.toString());
  if (topic === 'game/play') ball = message.ball.position;
});

const shot = async (label) => {
  await gameboard.screenshot({ path: `results/shot-${label}-gameboard.png` });
  await tyler.screenshot({ path: `results/shot-${label}-tyler.png` });
  console.log(`saved results/shot-${label}-*.png`);
};
const waitFor = (wanted) =>
  new Promise((resolve) => {
    const onMessage = (topic, payload) => {
      if (topic !== 'game/state') return;
      const { transition } = JSON.parse(payload.toString());
      state = transition;
      if (transition === wanted) {
        client.off('message', onMessage);
        resolve();
      }
    };
    client.on('message', onMessage);
  });

// Bots: the human follows the ball; TYLER's bot tracks it (unless the real AI plays).
let humanX = 0; // world x the human stands at (null = follow the ball)
const humanBot = setInterval(() => {
  publish('paddle/bottom/position', { position: { x: Math.min(1, Math.max(0, (humanX === null ? ball.x : humanX) / 192 + 0.5)) } });
}, 33);
const tylerBot = TOP_BOT
  ? setInterval(() => publish('paddle/top/position', { position: { x: Math.min(1, Math.max(0, ball.x / 192 + 0.5)) } }), 83)
  : null;

if (TOP_BOT) publish('paddle/top/state', { state: 'start' }, true);
publish('paddle/bottom/state', { state: 'not_ready' }, true);
await delay(4000);
await shot('1-idle');
publish('paddle/bottom/state', { state: 'ready' }, true);
await waitFor('intro_complete');
await delay(1500);
await shot('2-move-intro');
await waitFor('level1_intro_complete');
await delay(800);
await shot('3-level1-countdown');
humanX = null; // follow the ball
await delay(4000);
await shot('4-level1-play');
await waitFor('level3_intro_complete');
await delay(3500);
await shot('5-level3-sudden-death');
humanX = 180; // step aside so TYLER scores
await waitFor('level3_complete');
await delay(1500);
await shot('6-result');
await waitFor('game_complete');

clearInterval(humanBot);
if (tylerBot) clearInterval(tylerBot);
publish('paddle/bottom/state', { state: 'not_ready' }, true);
console.log(errors.length ? `page errors:\n${errors.join('\n')}` : 'no page errors');
await delay(300);
await browser.close();
client.end();
