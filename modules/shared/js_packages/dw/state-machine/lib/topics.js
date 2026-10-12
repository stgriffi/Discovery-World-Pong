// MQTT topic names. Kept free of imports so modules (and tests) can use them without
// pulling in mqtt/ajv/uuid.
const Topics = Object.freeze({
  GAME_PLAY: 'game/play',
  GAME_STATS: 'game/stats',
  GAME_STATE: 'game/state',
  PADDLE_TOP_POSITION: 'paddle/top/position',
  PADDLE_TOP_STATE: 'paddle/top/state',
  PADDLE_TOP_STATE_TRANSITION: 'paddle/top/state_transition',
  PADDLE_BOTTOM_POSITION: 'paddle/bottom/position',
  PADDLE_BOTTOM_STATE: 'paddle/bottom/state',
  PADDLE_BOTTOM_STATE_TRANSITION: 'paddle/bottom/state_transition',
  DEPTH_FEED: 'depth/feed',
});

export default Topics;
