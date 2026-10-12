// The MQTT client, created once at module load. (It used to be created in App's effect,
// which runs after Controller's effect, so Controller never registered its listener.)
import { v4 as uuidv4 } from 'uuid';
import { PongAPI } from 'dw-state-machine';

export const PADDLE_ID = process.env.REACT_APP_PADDLE_ID || 'bottom';

const broker = process.env.REACT_APP_MQTT_BROKER || window.location.hostname;
const port = process.env.REACT_APP_MQTT_PORT || 9001;
const clientId = `${process.env.REACT_APP_MQTT_CLIENT_ID || 'web-paddle-control'}-${PADDLE_ID}-${uuidv4()}`;

export const api = PongAPI(clientId, `ws://${broker}:${port}`);
api.start();
