import { TRAINING as T, BOARD } from '../constants';
import {
  createSim,
  step,
  startServe,
  parkBall,
  bounceAngle,
  checkCollision,
  chaseVx,
  motionMoveVx,
  actionVx,
  toWorldX,
  toWorldY,
} from '../pongSim';

const PRECISION = 12;

function servedSim() {
  const sim = createSim({ mode: 'board' });
  startServe(sim);
  return sim;
}

// A ball one tick away from the bottom paddle's face, moving straight down.
function ballAboveBottomPaddle(sim, dx, speed = 2) {
  const paddleTop = T.BOTTOM_PADDLE_Y - T.PADDLE_HEIGHT / 2;
  Object.assign(sim.ball, {
    x: sim.bottom.x + dx,
    y: paddleTop - T.BALL_DIAMETER / 2 - speed / 2,
    vx: 0,
    vy: speed,
    speed,
    up: false,
    armed: true,
    visible: true,
  });
}

describe('serve', () => {
  test('is held 17 ticks at the serve spot, then launches straight at TYLER', () => {
    const sim = servedSim();
    for (let tick = 1; tick <= 17; tick++) {
      const events = step(sim);
      expect(sim.ball.x).toBe(95.5);
      expect(sim.ball.y).toBe(133);
      expect(events.some((e) => e.type === 'served')).toBe(tick === 17);
    }
    expect(sim.ball.vx).toBeCloseTo(1.2246467991473532e-16, PRECISION);
    expect(sim.ball.vy).toBe(-2);
    step(sim);
    expect(sim.ball.y).toBe(131);
  });

  test('a parked ball never moves until startServe', () => {
    const sim = createSim({ mode: 'board' });
    parkBall(sim, { visible: true });
    for (let i = 0; i < 100; i++) step(sim);
    expect([sim.ball.x, sim.ball.y, sim.ball.vx, sim.ball.vy]).toEqual([95.5, 133, 0, 0]);
  });
});

describe('bounce angles (training table with Python rounding)', () => {
  // [pos (paddle-relative), expected segment, expected velocity leaving the bottom paddle]
  const cases = [
    [0, 0, [1.2246467991473532e-16, -2]],
    [0.34, 1, [1.7320508075688774, -0.9999999999999999]],
    [0.5, 2, [1.4142135623730951, -1.414213562373095]], // 1.5 rounds to 2
    [-0.5, -2, [-1.414213562373095, -1.4142135623730951]], // -1.5 rounds to -2 (Math.round: -1)
    [1 / 6, 0, [1.2246467991473532e-16, -2]], // 0.5 rounds to 0 (Math.round: 1)
    [0.84, 3, [1.0000000000000002, -1.7320508075688772]],
    [-0.84, -3, [-0.9999999999999996, -1.7320508075688774]],
    [1.2, 3, [1.0000000000000002, -1.7320508075688772]], // clamped
    [-1.2, -3, [-0.9999999999999996, -1.7320508075688774]],
  ];

  test.each(cases)('bottom paddle, pos %p -> segment %p', (pos, segment, [vx, vy]) => {
    const ball = { speed: 2, up: false, vx: 0, vy: 2 };
    expect(bounceAngle(ball, pos)).toBe(segment);
    expect(ball.vx).toBeCloseTo(vx, PRECISION);
    expect(ball.vy).toBeCloseTo(vy, PRECISION);
  });

  test.each(cases)('top paddle mirrors vy, pos %p', (pos, segment, [vx, vy]) => {
    const ball = { speed: 2, up: true, vx: 0, vy: -2 };
    expect(bounceAngle(ball, pos)).toBe(segment);
    expect(ball.vx).toBeCloseTo(vx, PRECISION);
    expect(ball.vy).toBeCloseTo(-vy, PRECISION);
  });

  test('each paddle hit adds 0.2 px/tick after the outgoing velocity is set', () => {
    const ball = { speed: 2, up: false, vx: 0, vy: 2 };
    bounceAngle(ball, 0);
    expect(Math.hypot(ball.vx, ball.vy)).toBeCloseTo(2, PRECISION);
    expect(ball.speed).toBeCloseTo(2.2, PRECISION);
    bounceAngle(ball, 0);
    expect(Math.hypot(ball.vx, ball.vy)).toBeCloseTo(2.2, PRECISION);
    expect(ball.speed).toBeCloseTo(2.4, PRECISION);
  });
});

describe('paddle collisions in step()', () => {
  test('a ball hitting the bottom paddle bounces up and reports the segment', () => {
    const sim = createSim({ mode: 'board' });
    ballAboveBottomPaddle(sim, 3.4);
    const events = step(sim);
    expect(events).toContainEqual({ type: 'paddleHit', side: 'bottom', segment: 1, speed: sim.ball.speed });
    expect(sim.ball.vy).toBeLessThan(0);
    expect(sim.ball.up).toBe(true);
  });

  test('a fast ball does not tunnel through the paddle', () => {
    const sim = createSim({ mode: 'board' });
    ballAboveBottomPaddle(sim, 0, 8);
    const events = step(sim);
    expect(events.map((e) => e.type)).toContain('paddleHit');
  });

  test('a paddle moving toward the ball catches it via its widened extent', () => {
    const sim = createSim({ mode: 'board' });
    // Ball just past the paddle's right edge (edge at x + 10, ball radius 4).
    ballAboveBottomPaddle(sim, 10 + 4 + 3);
    expect(checkCollision(sim.ball, { ...sim.bottom, vx: 0 }).collide).toBe(false);
    expect(checkCollision(sim.ball, { ...sim.bottom, vx: 6 }).collide).toBe(true);
    expect(checkCollision(sim.ball, { ...sim.bottom, vx: -6 }).collide).toBe(false);
  });

  test('a ball moving away from a paddle is not bounced by it', () => {
    const sim = createSim({ mode: 'board' });
    ballAboveBottomPaddle(sim, 0);
    sim.ball.up = true; // e.g. already returned this rally
    const events = step(sim);
    expect(events.map((e) => e.type)).not.toContain('paddleHit');
  });
});

describe('walls and goals', () => {
  test('walls clamp the ball center and reflect vx', () => {
    const sim = createSim({ mode: 'board' });
    Object.assign(sim.ball, { x: 191, y: 80, vx: 3, vy: 1, armed: true });
    let events = step(sim);
    expect(sim.ball.x).toBe(192);
    expect(sim.ball.vx).toBe(-3);
    expect(sim.ball.vy).toBe(1);
    expect(events).toContainEqual({ type: 'wallHit', side: 'right' });

    Object.assign(sim.ball, { x: 1, vx: -3 });
    events = step(sim);
    expect(sim.ball.x).toBe(0);
    expect(sim.ball.vx).toBe(3);
    expect(events).toContainEqual({ type: 'wallHit', side: 'left' });
  });

  test('a goal is detected on the tick after the ball crosses the edge', () => {
    const sim = createSim({ mode: 'board' });
    Object.assign(sim.ball, { x: 50, y: 159, vx: 0, vy: 0.5, armed: true, visible: true });
    sim.bottom.x = 150; // nowhere near the ball
    expect(step(sim).map((e) => e.type)).not.toContain('goal'); // now at 159.5
    expect(step(sim)).toContainEqual({ type: 'goal', scorer: 'tyler' });
  });

  test('the human scores past TYLER, and the board parks the ball and recenters TYLER', () => {
    const sim = createSim({ mode: 'board' });
    Object.assign(sim.ball, { x: 50, y: -0.01, vx: 1, vy: -2, armed: true, visible: true });
    sim.top.x = 150;
    const events = step(sim, { topVx: 6 });
    expect(events).toContainEqual({ type: 'goal', scorer: 'human' });
    expect(sim.ball).toMatchObject({ x: 95.5, y: 133, vx: 0, vy: 0, speed: 2, armed: false, visible: false });
    expect(sim.top.x).toBe(96);
  });
});

describe('paddle movement', () => {
  test('board paddles stay inside the border', () => {
    const sim = createSim({ mode: 'board' });
    sim.bottom.x = 8;
    step(sim, { bottomVx: -6 });
    expect(sim.bottom.x).toBe(BOARD.PADDLE_MIN_X);
    sim.top.x = 184;
    step(sim, { topVx: 6 });
    expect(sim.top.x).toBe(BOARD.PADDLE_MAX_X);
  });

  test('training paddles only stop once fully off-board', () => {
    const sim = createSim({ mode: 'training' });
    sim.bottom.x = 0;
    step(sim, { bottomVx: -6 });
    expect(sim.bottom.x).toBe(-6);
    sim.bottom.x = -9;
    step(sim, { bottomVx: -6 }); // ceil(-15 + 10) = -5 < 0 -> rejected
    expect(sim.bottom.x).toBe(-9);
  });

  test('chaseVx moves at most 6 px/tick and stops on target', () => {
    expect(chaseVx(100, 150)).toBe(6);
    expect(chaseVx(100, 50)).toBe(-6);
    expect(chaseVx(100, 103)).toBe(3);
  });

  test('MotionMove closes 78.125% of the gap per tick', () => {
    expect(motionMoveVx(96, 106)).toBeCloseTo(7.8125, PRECISION);
    expect(actionVx('ABSOLUTE', { x: 96 }, 106 / 192)).toBeCloseTo(7.8125, PRECISION);
    expect(actionVx('LEFT', { x: 96 })).toBe(-6);
    expect(actionVx('RIGHT', { x: 96 })).toBe(6);
    expect(actionVx('NONE', { x: 96 })).toBe(0);
  });
});

test('world coordinates are centered with +y toward TYLER', () => {
  expect(toWorldX(96)).toBe(0);
  expect(toWorldY(T.TOP_PADDLE_Y)).toBe(69.5);
  expect(toWorldY(T.BOTTOM_PADDLE_Y)).toBe(-69.5);
});

test('the simulation is deterministic', () => {
  const run = () => {
    const sim = createSim({ mode: 'board' });
    startServe(sim);
    let seed = 7;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 20000; i++) {
      const events = step(sim, {
        topVx: chaseVx(sim.top.x, sim.ball.x + (rand() - 0.5) * 30),
        bottomVx: motionMoveVx(sim.bottom.x, sim.ball.x + (rand() - 0.5) * 30),
      });
      if (events.some((e) => e.type === 'goal')) startServe(sim);
    }
    return JSON.stringify(sim);
  };
  expect(run()).toBe(run());
});
