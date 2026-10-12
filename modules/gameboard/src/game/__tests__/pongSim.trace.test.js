// Replays inputs recorded from the original training environment (tools/physics-trace)
// and requires pongSim to reproduce its ball, paddle and score values tick for tick.
import trace from '../__fixtures__/training-trace.json';
import { createSim, step, actionVx } from '../pongSim';

const FIELDS = ['frames', 'x', 'y', 'vx', 'vy', 'speed', 'up', 'delay', 'topX', 'bottomX', 'scoreTop', 'scoreBottom'];
const EXACT = new Set(['frames', 'up', 'delay', 'scoreTop', 'scoreBottom']);

function actual(sim, field) {
  switch (field) {
    case 'frames':
      return sim.tick;
    case 'topX':
      return sim.top.x;
    case 'bottomX':
      return sim.bottom.x;
    case 'scoreTop':
      return sim.scoreTop;
    case 'scoreBottom':
      return sim.scoreBottom;
    default:
      return sim.ball[field];
  }
}

describe.each(trace.scenarios.map((s) => [s.name, s]))('training trace: %s', (name, scenario) => {
  test(`${scenario.ticks} ticks match the Python physics`, () => {
    const sim = createSim({ mode: 'training' });
    const checkpoints = new Map(scenario.checkpoints.map((c) => [c[0], c.slice(1)]));
    let compared = 0;
    scenario.inputs.forEach(([topAction, bottomAction, motion], tick) => {
      step(sim, {
        topVx: actionVx(topAction, sim.top, motion),
        bottomVx: actionVx(bottomAction, sim.bottom, motion),
      });
      const expected = checkpoints.get(tick);
      if (!expected) return;
      FIELDS.forEach((field, i) => {
        const value = actual(sim, field);
        if (EXACT.has(field)) {
          if (value !== expected[i]) {
            throw new Error(`${name} tick ${tick}: ${field} = ${value}, training had ${expected[i]}`);
          }
        } else if (!(Math.abs(value - expected[i]) <= 1e-9)) {
          throw new Error(`${name} tick ${tick}: ${field} = ${value}, training had ${expected[i]}`);
        }
      });
      compared += 1;
    });
    expect(compared).toBe(scenario.checkpoints.length);
  });
});
