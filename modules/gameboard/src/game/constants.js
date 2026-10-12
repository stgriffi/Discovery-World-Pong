// Physics constants copied from the MSOE training environment, so TYLER (the AI)
// sees the same game it was trained on. Source of truth:
//   git show 670d82c:src/shared/config.py   and   git show 670d82c:src/game/pong.py
// Training coordinates: 192x160 px, origin top-left, +y down, positions are object centers.
export const TRAINING = Object.freeze({
  WIDTH: 192,
  HEIGHT: 160,
  TICK_HZ: 60, // GAME_FPS
  BALL_DIAMETER: 8,
  PADDLE_WIDTH: 20,
  PADDLE_HEIGHT: 3,
  TOP_PADDLE_Y: 10 + 0.5, // PADDING + 0.5
  BOTTOM_PADDLE_Y: 160 - 0.5 - 10, // HEIGHT - 0.5 - PADDING
  PADDLE_SPEED: 6, // Pong.Paddle.SPEED (px/tick)
  MOTION_GAIN: 25, // Paddle.MotionMove: vx += speed * (distance / WIDTH) * 25
  BALL_SPEED: 2, // px/tick
  VOLLEY_SPEEDUP: 0.2, // added to ball speed after every paddle hit
  // Indexed with Python semantics (negative indices count from the end), see pyIndex().
  BALL_BOUNCE_ANGLES: Object.freeze([-90, -30, -45, -60, -120, -135, -150]),
  BALL_START_ANGLE: -90, // BALL_START_ANGLES = [-90]
  BALL_RESET_X: (192 - 1) / 2, // Ball.reset
  BALL_RESET_Y: (160 - 1) / 2,
  SERVE_Y: Math.round((5 * 160) / 6), // Ball.update: round(5 * HEIGHT / 6) = 133
  SERVE_DELAY_TICKS: 15, // ball launches once delay_counter > 15
  PADDLE_RESET_X: 192 / 2,
  AI_FRAME_INTERVAL: 5, // TYLER decides every 5 ticks...
  AI_FRAME_DELAY: 3, // ...and training applied each decision 3 ticks later.
});

// Exhibit settings layered on top of the training physics.
export const BOARD = Object.freeze({
  // Paddle centers are clamped so paddle edges stop at the board border. The visual board
  // is drawn 200 px wide (see VISUAL_WIDTH) so that, with the training rule that clamps the
  // ball's *center* to [0, 192], the ball's edge just touches the border when it bounces.
  PADDLE_MIN_X: 6,
  PADDLE_MAX_X: 186,
  VISUAL_WIDTH: 200,
  VISUAL_HEIGHT: 160,
  LEVEL_TICKS: 30 * 60, // L1 and L2 last 30 s of clock time (clock runs from the serve)
  L3_CAP_TICKS: 150 * 60, // safety cap so sudden death can never run forever
  COUNTDOWN_STEP_TICKS: 30, // "3", "2", "1", "GO!" at 0.5 s steps
  POINT_PAUSE_TICKS: 45, // ball hidden for 0.75 s after a point (0 = exactly like training)
  MAX_CATCH_UP_TICKS: 6, // after a stall, simulate at most 100 ms and drop the rest
});

export const SIDES = Object.freeze({ TOP: 'top', BOTTOM: 'bottom' });
