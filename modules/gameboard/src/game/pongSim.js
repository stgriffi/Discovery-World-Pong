// Deterministic 2D Pong physics, ported line-by-line from the MSOE training environment
// (git show 670d82c:src/game/pong.py) so the AI plays the game it was trained on.
//
// Works in training coordinates (192x160, origin top-left, +y down, object centers).
// Use toWorldX/toWorldY to convert to the gameboard's centered, +y-up world.
//
// Two modes:
//  - 'training': exact training behavior (paddles may move partly off-board, goals reset
//    the ball to the center and the serve starts immediately). Used to verify the port.
//  - 'board': exhibit behavior. Same ball physics, but paddles are clamped inside the
//    board and a goal parks the ball until the controller calls startServe().
import { TRAINING as T, BOARD, SIDES } from './constants';
import { roundHalfEven, pyIndex } from './pyMath';

const BALL_RADIUS = T.BALL_DIAMETER / 2;

export function createSim({ mode = 'board' } = {}) {
  const sim = {
    mode,
    tick: 0,
    ball: {
      x: T.BALL_RESET_X,
      y: T.BALL_RESET_Y,
      vx: 0,
      vy: 0,
      speed: T.BALL_SPEED,
      up: false,
      delay: 0,
      // Training serves automatically whenever the ball is still; on the board the ball
      // stays parked until startServe().
      armed: mode === 'training',
      visible: mode === 'training',
    },
    top: createPaddle(T.TOP_PADDLE_Y),
    bottom: createPaddle(T.BOTTOM_PADDLE_Y),
    scoreTop: 0,
    scoreBottom: 0,
    // Set when something teleports, so the renderer skips interpolating that tick.
    snap: true,
  };
  return sim;
}

function createPaddle(y) {
  return { x: T.PADDLE_RESET_X, y, w: T.PADDLE_WIDTH, h: T.PADDLE_HEIGHT, vx: 0 };
}

// Pong.Ball.get_vector: unit-circle degrees and a magnitude.
export function getVector(deg, scale) {
  const rad = (Math.PI * deg) / 180;
  return [scale * Math.cos(rad), scale * Math.sin(rad)];
}

// Paddle velocity for a training action ("LEFT" | "RIGHT" | "NONE" | "ABSOLUTE").
export function actionVx(action, paddle, motionPosition) {
  switch (action) {
    case 'LEFT':
      return -T.PADDLE_SPEED;
    case 'RIGHT':
      return T.PADDLE_SPEED;
    case 'ABSOLUTE':
      return motionMoveVx(paddle.x, motionPosition * T.WIDTH);
    default:
      return 0;
  }
}

// Pong.Paddle.MotionMove: how the human paddle chased the depth-camera position.
export function motionMoveVx(x, desiredX) {
  const distance = desiredX - x;
  return T.PADDLE_SPEED * (distance / T.WIDTH) * T.MOTION_GAIN;
}

// Move toward a target at no more than the training paddle speed.
export function chaseVx(x, targetX, maxStep = T.PADDLE_SPEED) {
  return Math.max(-maxStep, Math.min(maxStep, targetX - x));
}

// Pong.check_collision: swept rectangle test against the paddle face, with the paddle's
// extent widened by its velocity this tick. Returns the paddle-relative hit position.
export function checkCollision(ball, paddle) {
  const r = BALL_RADIUS;
  const halfW = paddle.w / 2;
  const halfH = paddle.h / 2;
  const nextY = ball.y + ball.vy;

  const crossesYBottom = nextY - r <= paddle.y + halfH && nextY - r >= paddle.y + halfH;
  const crossesYTop = nextY + r <= paddle.y - halfH && nextY + r >= paddle.y - halfH;
  const intersectsYBottom = ball.y + r <= paddle.y - halfH && nextY + r >= paddle.y - halfH;
  const intersectsYTop = ball.y - r >= paddle.y + halfH && nextY - r <= paddle.y + halfH;

  if (crossesYBottom || crossesYTop || intersectsYBottom || intersectsYTop) {
    const nextX = ball.x + ball.vx;
    const left = Math.min(paddle.x - halfW, paddle.x - halfW + paddle.vx);
    const right = Math.max(paddle.x + halfW, paddle.x + halfW + paddle.vx);
    const collideXRight = nextX + r <= right && nextX + r >= left;
    const collideXLeft = nextX - r <= right && nextX - r >= left;
    if (collideXRight || collideXLeft) {
      return { collide: true, pos: (ball.x - paddle.x) / (paddle.w / 2) };
    }
  }
  return { collide: false, pos: 0 };
}

// Pong.Ball.bounce_angle. The table is used exactly as trained, including its quirk that
// segments +-1 return at the shallowest angle and +-3 at the steepest.
export function bounceAngle(ball, pos) {
  let segment = roundHalfEven(pos * 3);
  segment = Math.min(segment, 3);
  segment = Math.max(segment, -3);
  const angle = pyIndex(T.BALL_BOUNCE_ANGLES, segment);
  const [vx, vy] = ball.up ? getVector(-angle, ball.speed) : getVector(angle, ball.speed);
  ball.vx = vx;
  ball.vy = vy;
  ball.speed += T.VOLLEY_SPEEDUP;
  return segment;
}

// Park the ball at the serve spot, still and unarmed (board mode).
export function parkBall(sim, { visible = false } = {}) {
  const ball = sim.ball;
  ball.x = T.BALL_RESET_X;
  ball.y = T.SERVE_Y;
  ball.vx = 0;
  ball.vy = 0;
  ball.speed = T.BALL_SPEED;
  ball.up = false;
  ball.delay = 0;
  ball.armed = false;
  ball.visible = visible;
  sim.snap = true;
}

// Start the training serve: held 17 ticks at the serve spot, then straight at TYLER.
export function startServe(sim) {
  parkBall(sim, { visible: true });
  sim.ball.armed = true;
}

export function centerPaddle(sim, side) {
  const paddle = side === SIDES.TOP ? sim.top : sim.bottom;
  paddle.x = T.PADDLE_RESET_X;
  paddle.vx = 0;
  sim.snap = true;
}

// One 60 Hz tick, in the same order as Pong.step(frames=1). Velocities come from
// actionVx / motionMoveVx / chaseVx. Returns the events that happened this tick.
export function step(sim, { topVx = 0, bottomVx = 0 } = {}) {
  const events = [];
  const { ball, top, bottom } = sim;
  top.vx = topVx;
  bottom.vx = bottomVx;

  let hit = checkCollision(ball, bottom);
  if (hit.collide && !ball.up) {
    const segment = bounceAngle(ball, hit.pos);
    ball.up = true;
    events.push({ type: 'paddleHit', side: SIDES.BOTTOM, segment, speed: ball.speed });
  }
  hit = checkCollision(ball, top);
  if (hit.collide && ball.up) {
    const segment = bounceAngle(ball, hit.pos);
    ball.up = false;
    events.push({ type: 'paddleHit', side: SIDES.TOP, segment, speed: ball.speed });
  }

  // Goals are detected on the ball position from before this tick's movement.
  if (ball.y > T.HEIGHT - 1) {
    events.push({ type: 'goal', scorer: 'tyler' });
    onGoal(sim, SIDES.TOP);
  } else if (ball.y < 0) {
    events.push({ type: 'goal', scorer: 'human' });
    onGoal(sim, SIDES.BOTTOM);
  }

  updatePaddle(sim, bottom);
  updatePaddle(sim, top);
  updateBall(sim, events);
  sim.tick += 1;
  return events;
}

function onGoal(sim, scoringSide) {
  if (sim.mode === 'training') {
    if (scoringSide === SIDES.TOP) sim.scoreTop += 1;
    else sim.scoreBottom += 1;
    // Ball.reset and Paddle.reset; the paddles keep this tick's velocity.
    const ball = sim.ball;
    ball.x = T.BALL_RESET_X;
    ball.y = T.BALL_RESET_Y;
    ball.vx = 0;
    ball.vy = 0;
    ball.speed = T.BALL_SPEED;
    ball.delay = 0;
    sim.top.x = T.PADDLE_RESET_X;
    sim.bottom.x = T.PADDLE_RESET_X;
    sim.snap = true;
    return;
  }
  // Board: the controller decides when to serve again. TYLER's paddle recenters like it
  // did in training; the human paddle keeps following the player.
  parkBall(sim, { visible: false });
  centerPaddle(sim, SIDES.TOP);
}

function updatePaddle(sim, paddle) {
  const nextX = paddle.x + paddle.vx;
  paddle.vx = 0;
  if (sim.mode === 'training') {
    // Pong.Paddle.update: reject the move only once the paddle would be fully off-board.
    if (!(Math.ceil(nextX - paddle.w / 2) > T.WIDTH) && !(Math.ceil(nextX + paddle.w / 2) < 0)) {
      paddle.x = nextX;
    }
  } else {
    paddle.x = Math.min(BOARD.PADDLE_MAX_X, Math.max(BOARD.PADDLE_MIN_X, nextX));
  }
}

function updateBall(sim, events) {
  const ball = sim.ball;
  if (ball.vx === 0 && ball.vy === 0) {
    if (!ball.armed) return;
    if (ball.delay === 0) {
      ball.y = T.SERVE_Y;
      ball.up = false;
    }
    if (ball.delay <= T.SERVE_DELAY_TICKS) {
      ball.delay += 1;
    } else {
      const [vx, vy] = ball.up
        ? getVector(T.BALL_START_ANGLE + 180, ball.speed)
        : getVector(T.BALL_START_ANGLE, ball.speed);
      ball.vx = vx;
      ball.vy = vy;
      events.push({ type: 'served' });
    }
    return;
  }

  ball.up = ball.vy < 0;
  ball.x += ball.vx;
  ball.y += ball.vy;
  if (ball.x > T.WIDTH) {
    ball.x = T.WIDTH;
    ball.vx = -ball.vx;
    events.push({ type: 'wallHit', side: 'right' });
  }
  if (ball.x < 0) {
    ball.x = 0;
    ball.vx = -ball.vx;
    events.push({ type: 'wallHit', side: 'left' });
  }
}

// Training coordinates -> gameboard world (centered, +y up). TYLER's paddle ends up at +y.
export const toWorldX = (x) => x - T.WIDTH / 2;
export const toWorldY = (y) => T.HEIGHT / 2 - y;
// Normalized paddle position used on MQTT (paddle/*/position, game/play): x = 192 * p.
export const toNormalized = (x) => x / T.WIDTH;
export const fromNormalized = (p) => p * T.WIDTH;
