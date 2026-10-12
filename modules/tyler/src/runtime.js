// App-wide singletons, created once at module load (outside React, so StrictMode's
// double-run effects can't create a second MQTT client or controller).
import { v4 as uuidv4 } from 'uuid';
import { PongAPI } from 'dw-state-machine';
import { createAudioEngine } from 'dw-audio';
import { CLIPS } from './clips';
import { createVoice } from './voice';
import { createTylerController } from './TylerController';
import { installErrorReporter } from './errorReporter';

const broker = process.env.REACT_APP_MQTT_BROKER || window.location.hostname;
const port = process.env.REACT_APP_MQTT_PORT || 9001;
const clientId = `${process.env.REACT_APP_MQTT_CLIENT_ID || 'tyler'}-${uuidv4()}`;

export const api = PongAPI(clientId, `ws://${broker}:${port}`);
export const errorReporter = installErrorReporter({ api, app: 'tyler' });
export const audioEngine = createAudioEngine({ clips: CLIPS });
export const voice = createVoice(audioEngine);
audioEngine.load().then((count) => {
  const message = `audio: ${count}/${Object.keys(CLIPS).length} clips decoded, context ${audioEngine.state}`;
  console.log(message);
  errorReporter.report(audioEngine.state === 'running' ? 'info' : 'warn', message);
});
export const tyler = createTylerController({ api, voice });

console.log(`MQTT broker ws://${broker}:${port}, client ${clientId}`);
tyler.start();
api.start();
