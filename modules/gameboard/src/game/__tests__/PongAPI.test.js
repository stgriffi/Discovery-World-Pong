import PongAPI, { validateMessage } from 'dw-state-machine/lib/PongAPI.js';

jest.mock('uuid', () => ({ v4: () => 'test-instance' }));

let lastClient;
jest.mock('mqtt', () => {
  const { EventEmitter } = require('events');
  return {
    __esModule: true,
    default: {
      // A plain function: CRA's resetMocks would wipe a jest.fn implementation.
      connect: () => {
        const client = new EventEmitter();
        client.subscribe = jest.fn();
        client.unsubscribe = jest.fn();
        client.publish = jest.fn();
        client.end = jest.fn();
        lastClient = client;
        return client;
      },
    },
  };
});

const message = (obj) => Buffer.from(JSON.stringify(obj));

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

function connectedApi() {
  const api = PongAPI('test-client', 'ws://broker:9001');
  api.start();
  lastClient.emit('connect');
  return api;
}

describe('schema validation (per topic)', () => {
  test('accepts valid messages, including the level-intro transitions TYLER sends', () => {
    expect(validateMessage('game/state', { transition: 'level2_intro_complete' })).toBe(true);
    expect(validateMessage('game/state', { transition: 'reset' })).toBe(true);
    expect(validateMessage('paddle/top/position', { position: { x: 0.25 } })).toBe(true);
    expect(
      validateMessage('game/play', {
        ball: { position: { x: -10.25, y: 3.5 } },
        paddle_top: { position: { x: 0.5 } },
        paddle_bottom: { position: { x: 0.5 } },
        frame: 12,
      }),
    ).toBe(true);
  });

  test('rejects malformed messages', () => {
    expect(validateMessage('game/state', { transition: 'bogus' })).toBe(false);
    expect(validateMessage('paddle/top/position', { position: { x: 1.5 } })).toBe(false);
    expect(validateMessage('paddle/bottom/position', { position: { x: null } })).toBe(false);
  });

  test('topics outside the schema pass through', () => {
    expect(validateMessage('app/logs/gameboard', { anything: true })).toBe(true);
  });
});

describe('PongAPI client', () => {
  test('delivers valid messages and survives bad JSON and throwing observers', () => {
    const api = connectedApi();
    const bad = jest.fn(() => {
      throw new Error('observer bug');
    });
    const good = jest.fn();
    api.registerObserver('game/state', bad);
    api.registerObserver('game/state', good);

    expect(() => lastClient.emit('message', 'game/state', Buffer.from('{not json'), {})).not.toThrow();
    lastClient.emit('message', 'game/state', message({ transition: 'start' }), { retain: true });
    expect(bad).toHaveBeenCalled();
    expect(good).toHaveBeenCalledWith({ transition: 'start' }, { retained: true });

    lastClient.emit('message', 'game/state', message({ transition: 'bogus' }), {});
    expect(good).toHaveBeenCalledTimes(1);
  });

  test('registerObserver returns an unsubscribe function', () => {
    const api = connectedApi();
    const cb = jest.fn();
    const unsubscribe = api.registerObserver('paddle/top/state', cb);
    expect(lastClient.subscribe).toHaveBeenCalledWith('paddle/top/state');
    unsubscribe();
    expect(lastClient.unsubscribe).toHaveBeenCalledWith('paddle/top/state');
    lastClient.emit('message', 'paddle/top/state', message({ state: 'start' }), {});
    expect(cb).not.toHaveBeenCalled();
  });

  test('tracks connection state and only publishes while connected', () => {
    const api = PongAPI('test-client', 'ws://broker:9001');
    const changes = [];
    api.onConnectionChange((up, info) => changes.push([up, info.first]));
    api.start();
    expect(api.update('game/state', { transition: 'reset' })).toBe(false);

    lastClient.emit('connect');
    expect(api.isConnected()).toBe(true);
    expect(api.update('game/state', { transition: 'reset' })).toBe(true);
    expect(lastClient.publish).toHaveBeenCalledWith('game/state', '{"transition":"reset"}', { retain: false, qos: 0 });
    expect(api.update('game/state', { transition: 'bogus' })).toBe(false);

    lastClient.emit('offline');
    expect(api.isConnected()).toBe(false);
    expect(api.update('game/state', { transition: 'reset' })).toBe(false);

    lastClient.emit('connect');
    expect(changes).toEqual([
      [true, true],
      [false, false],
      [true, false],
    ]);
  });

  test('stop() ends the client and is idempotent', () => {
    const api = connectedApi();
    const client = lastClient;
    api.stop();
    api.stop();
    expect(client.end).toHaveBeenCalledTimes(1);
    expect(api.isConnected()).toBe(false);
  });
});
