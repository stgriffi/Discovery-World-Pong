// In-memory stand-in for the MQTT broker and PongAPI clients, for controller tests.
// Delivery is asynchronous (setTimeout 0, so it runs under Jest fake timers and never
// re-enters a state machine synchronously) and echoes to the publisher, like Mosquitto.
// Every publish is checked against the real schema.
import { validateMessage } from 'dw-state-machine/lib/PongAPI.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

export function createFakeBroker() {
  const subscribers = new Map(); // topic -> Set of { client, callback }
  const retained = new Map();
  const history = []; // { from, topic, message, at }
  const invalid = [];

  function deliver(topic, message, isRetained) {
    setTimeout(() => {
      (subscribers.get(topic) || new Set()).forEach(({ client, callback }) => {
        if (client.isConnected()) callback(clone(message), { retained: isRetained });
      });
    }, 0);
  }

  function createClient(name) {
    let connected = false;
    let everConnected = false;
    const connectionListeners = new Set();

    const client = {
      name,
      isConnected: () => connected,
      registerObserver(topic, callback) {
        if (!subscribers.has(topic)) subscribers.set(topic, new Set());
        const entry = { client, callback };
        subscribers.get(topic).add(entry);
        if (connected && retained.has(topic)) {
          const message = retained.get(topic);
          setTimeout(() => callback(clone(message), { retained: true }), 0);
        }
        return () => subscribers.get(topic).delete(entry);
      },
      update(topic, message, { retain = false } = {}) {
        if (!connected) return false;
        if (!validateMessage(topic, message)) {
          invalid.push({ from: name, topic, message });
          return false;
        }
        history.push({ from: name, topic, message: clone(message), at: Date.now() });
        if (retain) retained.set(topic, clone(message));
        deliver(topic, message, false);
        return true;
      },
      onConnectionChange(listener) {
        connectionListeners.add(listener);
        return () => connectionListeners.delete(listener);
      },
      connect() {
        connected = true;
        const first = !everConnected;
        everConnected = true;
        connectionListeners.forEach((listener) => listener(true, { first }));
        // Retained messages arrive on (re)subscribe after connecting.
        subscribers.forEach((entries, topic) => {
          if (!retained.has(topic)) return;
          entries.forEach(({ client: owner, callback }) => {
            if (owner === client) setTimeout(() => callback(clone(retained.get(topic)), { retained: true }), 0);
          });
        });
      },
      disconnect() {
        connected = false;
        connectionListeners.forEach((listener) => listener(false, { first: false }));
      },
    };
    return client;
  }

  return {
    createClient,
    history,
    invalid,
    published: (topic, from) =>
      history.filter((h) => h.topic === topic && (from === undefined || h.from === from)).map((h) => h.message),
    transitions: (from) =>
      history.filter((h) => h.topic === 'game/state' && (from === undefined || h.from === from)).map((h) => h.message.transition),
  };
}
