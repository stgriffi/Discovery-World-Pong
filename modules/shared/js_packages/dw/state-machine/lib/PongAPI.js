import mqtt from 'mqtt';
import Ajv from 'ajv';
import pongAPISchema from './PongAPISchema.json';
import { v4 as uuidv4 } from 'uuid';
import Topics from './topics.js';

// One compiled validator per topic. Topics missing from the schema (e.g. app/logs/...)
// are passed through unvalidated.
const ajv = new Ajv({ allErrors: true });
const validators = new Map();
function validatorFor(topic) {
  if (!validators.has(topic)) {
    const schema = pongAPISchema.properties && pongAPISchema.properties[topic];
    validators.set(topic, schema ? ajv.compile(schema) : null);
  }
  return validators.get(topic);
}

export function validateMessage(topic, message) {
  const validate = validatorFor(topic);
  if (!validate) return true;
  const valid = validate(message);
  if (!valid) {
    console.error(`PongAPI: invalid message on ${topic}:`, validate.errors, message);
  }
  return valid;
}

const PongAPI = (clientId, brokerUrl, connectCallback, disconnectCallback) => {
  const instanceId = uuidv4();
  let client = null;
  let connected = false;
  let everConnected = false;
  const observers = new Map(); // topic -> Set of callbacks
  const connectionListeners = new Set();

  const getInstanceId = () => instanceId;

  const notifyConnection = (isUp, first) => {
    connectionListeners.forEach((listener) => {
      try {
        listener(isUp, { first });
      } catch (err) {
        console.error('PongAPI: connection listener threw', err);
      }
    });
  };

  const markDisconnected = () => {
    if (!connected) return;
    connected = false;
    console.log('Disconnected from MQTT broker');
    notifyConnection(false, false);
    if (typeof disconnectCallback === 'function') disconnectCallback();
  };

  const notifyObservers = (topic, message, meta) => {
    const callbacks = observers.get(topic);
    if (!callbacks) return;
    // Copy first so a callback can unregister observers without skipping others.
    [...callbacks].forEach((callback) => {
      try {
        callback(message, meta);
      } catch (err) {
        console.error(`PongAPI: observer for ${topic} threw`, err);
      }
    });
  };

  const start = () => {
    if (client) return;
    // queueQoSZero: false -- don't replay stale game messages after a reconnect.
    client = mqtt.connect(brokerUrl, { clientId, clean: true, reconnectPeriod: 1000, queueQoSZero: false });

    client.on('connect', () => {
      console.log('Connected to MQTT broker');
      console.log(`PongAPI instanceId: ${instanceId}`);
      observers.forEach((callbacks, topic) => client.subscribe(topic));
      const first = !everConnected;
      everConnected = true;
      connected = true;
      notifyConnection(true, first);
      if (typeof connectCallback === 'function') connectCallback();
    });
    client.on('close', markDisconnected);
    client.on('offline', markDisconnected);
    client.on('end', markDisconnected);
    client.on('disconnect', markDisconnected);
    client.on('error', (err) => {
      console.log('MQTT Broker Connection error:', err);
    });

    client.on('message', (topic, payload, packet) => {
      let message;
      try {
        message = JSON.parse(payload.toString());
      } catch (err) {
        console.error(`PongAPI: dropping non-JSON message on ${topic}`);
        return;
      }
      if (validateMessage(topic, message)) {
        notifyObservers(topic, message, { retained: !!(packet && packet.retain) });
      }
    });
  };

  const stop = () => {
    if (!client) return;
    const closing = client;
    client = null;
    closing.removeAllListeners();
    closing.end(true);
    markDisconnected();
  };

  const isConnected = () => connected && client !== null;

  const unregisterObserver = (topic, callback) => {
    const callbacks = observers.get(topic);
    if (!callbacks) return;
    callbacks.delete(callback);
    if (callbacks.size === 0) {
      observers.delete(topic);
      if (isConnected()) client.unsubscribe(topic);
    }
  };

  // Returns a function that removes the observer again.
  const registerObserver = (topic, callback) => {
    if (!observers.has(topic)) {
      observers.set(topic, new Set());
      if (isConnected()) client.subscribe(topic);
    }
    observers.get(topic).add(callback);
    return () => unregisterObserver(topic, callback);
  };

  // Returns true if the message was handed to the client for publishing.
  const update = (topic, message, { retain = false, qos = 0 } = {}) => {
    if (!isConnected()) return false;
    if (!validateMessage(topic, message)) return false;
    client.publish(topic, JSON.stringify(message), { retain, qos });
    return true;
  };

  // listener(isConnected, { first }) -- `first` is true on the first successful connect.
  const onConnectionChange = (listener) => {
    connectionListeners.add(listener);
    return () => connectionListeners.delete(listener);
  };

  return {
    getInstanceId,
    start,
    stop,
    isConnected,
    registerObserver,
    unregisterObserver,
    update,
    onConnectionChange,
  };
};

PongAPI.Topics = Topics;

export default PongAPI;
