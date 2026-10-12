// App-wide singletons, created once at module load -- outside React, so StrictMode's
// double-run effects can't create a second MQTT client or game controller.
import { v4 as uuidv4 } from 'uuid';
import { PongAPI } from 'dw-state-machine';
import { createGameController } from './game/GameController';
import { createLegacyAudio } from './audio/legacyAudio';
import { installErrorReporter } from './errorReporter';

const broker = process.env.REACT_APP_MQTT_BROKER || window.location.hostname;
const port = process.env.REACT_APP_MQTT_PORT || 9001;
const clientId = `${process.env.REACT_APP_MQTT_CLIENT_ID || 'gameboard'}-${uuidv4()}`;

// Dev/test knobs: ?round=5 makes levels 1-2 last 5 s; ?watchdogScale=0.2 shortens the
// waits for TYLER's transitions (useful when TYLER isn't running).
function configFromUrl(search) {
  const params = new URLSearchParams(search);
  const config = {};
  const round = Number(params.get('round'));
  if (round > 0) config.levelTicks = Math.round(round * 60);
  const watchdogScale = Number(params.get('watchdogScale'));
  if (watchdogScale > 0) config.watchdogScale = watchdogScale;
  return config;
}

export const api = PongAPI(clientId, `ws://${broker}:${port}`);
export const errorReporter = installErrorReporter({ api, app: 'gameboard' });
export const audio = createLegacyAudio();
export const controller = createGameController({
  api,
  audio,
  config: configFromUrl(window.location.search),
});

console.log(`MQTT broker ws://${broker}:${port}, client ${clientId}`);
controller.start();
api.start();
