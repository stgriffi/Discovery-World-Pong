import { createFixedStepLoop } from '../fixedStep';
import { createTimerBag } from '../timerBag';
import { createStore } from '../store';
import { createPresence } from '../presence';
import { formatClock } from '../texts';

describe('fixed-step loop', () => {
  test('ticks exactly 60 times per second whatever the call rate', () => {
    for (const callHz of [144, 60, 30, 250]) {
      let ticks = 0;
      const loop = createFixedStepLoop({ hz: 60, onTick: () => (ticks += 1) });
      for (let i = 0; i <= 10 * callHz; i++) loop.advance((i * 1000) / callHz);
      expect(ticks).toBe(600);
    }
  });

  test('handles jittery call timing', () => {
    let ticks = 0;
    const loop = createFixedStepLoop({ hz: 60, onTick: () => (ticks += 1) });
    let t = 0;
    loop.advance(t);
    for (let i = 0; i < 600; i++) {
      t += 1000 / 60 + (i % 2 === 0 ? 5 : -5);
      loop.advance(t);
    }
    expect(Math.abs(ticks - 600)).toBeLessThanOrEqual(1);
  });

  test('catches up at most maxCatchUpTicks after a stall and records the dropped time', () => {
    let ticks = 0;
    const loop = createFixedStepLoop({ hz: 60, maxCatchUpTicks: 6, onTick: () => (ticks += 1) });
    loop.advance(0);
    loop.advance(1000);
    expect(ticks).toBe(6);
    expect(loop.stats.droppedMs).toBeCloseTo(900, 5);
  });

  test('never runs backwards', () => {
    let ticks = 0;
    const loop = createFixedStepLoop({ hz: 60, onTick: () => (ticks += 1) });
    loop.advance(100);
    loop.advance(50);
    expect(ticks).toBe(0);
  });
});

describe('timer bag', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('clear() cancels pending callbacks', () => {
    const bag = createTimerBag();
    const fn = jest.fn();
    bag.after(100, fn);
    bag.after(200, fn);
    expect(bag.size).toBe(2);
    bag.clear();
    jest.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
    expect(bag.size).toBe(0);
  });

  test('a callback queued before clear() still never runs', () => {
    const queued = [];
    const bag = createTimerBag({ setTimeoutFn: (fn) => queued.push(fn) && queued.length, clearTimeoutFn: () => {} });
    const fn = jest.fn();
    bag.after(100, fn);
    bag.clear();
    queued.forEach((run) => run());
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('store', () => {
  test('notifies only when a value changes', () => {
    const store = createStore({ a: 1, b: 'x' });
    const listener = jest.fn();
    store.subscribe(listener);
    store.setState({ a: 1 });
    expect(listener).not.toHaveBeenCalled();
    store.setState({ a: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState()).toEqual({ a: 2, b: 'x' });
  });
});

describe('presence', () => {
  test('records when a paddle becomes ready and ignores "reset"', () => {
    const presence = createPresence();
    presence.update('bottom', 'not_ready', 10);
    expect(presence.isReady('bottom')).toBe(false);
    presence.update('bottom', 'ready', 20);
    expect(presence.readyEdgeAt('bottom')).toBe(20);
    presence.update('bottom', 'ready', 30); // still ready: not a new edge
    presence.update('bottom', 'reset', 40); // web paddle reply, not presence
    expect(presence.state('bottom')).toBe('ready');
    expect(presence.readyEdgeAt('bottom')).toBe(20);
    presence.update('top', 'start', 50); // the AI reports "start"
    expect(presence.isReady('top')).toBe(true);
  });
});

test('formatClock shows whole seconds remaining', () => {
  expect(formatClock(1800)).toBe('0:30');
  expect(formatClock(1799)).toBe('0:30');
  expect(formatClock(1740)).toBe('0:29');
  expect(formatClock(1)).toBe('0:01');
  expect(formatClock(0)).toBe('0:00');
  expect(formatClock(-5)).toBe('0:00');
  expect(formatClock(90 * 60)).toBe('1:30');
});
