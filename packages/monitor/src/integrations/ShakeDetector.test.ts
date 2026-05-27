import {
  ShakeDetector,
  type AccelerometerSample,
  type AccelerometerSource,
} from './ShakeDetector';

/** A mock accelerometer the test drives by pushing samples. */
function makeSource() {
  let listener: ((s: AccelerometerSample) => void) | null = null;
  let removed = false;
  const source: AccelerometerSource = {
    subscribe(l) {
      listener = l;
      return {
        remove() {
          removed = true;
          listener = null;
        },
      };
    },
  };
  return {
    source,
    push: (s: AccelerometerSample) => listener?.(s),
    get subscribed() {
      return listener !== null;
    },
    get removed() {
      return removed;
    },
  };
}

/** A clock the test advances manually. */
function makeClock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

const SPIKE: AccelerometerSample = { x: 2, y: 0, z: 0 }; // magnitude 2 > 1.8
const CALM: AccelerometerSample = { x: 0, y: 0, z: 1 }; // magnitude 1 (gravity)

describe('ShakeDetector', () => {
  test('fires after requiredSpikes spikes within the window', () => {
    const clock = makeClock(1000);
    const m = makeSource();
    const det = new ShakeDetector({ source: m.source, now: clock.now }); // defaults: 3 spikes / 1000ms
    let fired = 0;
    det.onShake(() => (fired += 1));
    det.start();

    m.push(SPIKE);
    clock.advance(150);
    m.push(SPIKE);
    clock.advance(150);
    expect(fired).toBe(0); // only 2 spikes
    m.push(SPIKE);
    expect(fired).toBe(1); // 3rd spike within window → shake
  });

  test('ignores calm samples below threshold', () => {
    const clock = makeClock(0);
    const m = makeSource();
    const det = new ShakeDetector({ source: m.source, now: clock.now });
    let fired = 0;
    det.onShake(() => (fired += 1));
    det.start();
    for (let i = 0; i < 10; i++) {
      m.push(CALM);
      clock.advance(150);
    }
    expect(fired).toBe(0);
  });

  test('debounces spikes closer than minSpikeGapMs (one jolt counts once)', () => {
    const clock = makeClock(0);
    const m = makeSource();
    const det = new ShakeDetector({ source: m.source, now: clock.now, minSpikeGapMs: 100 });
    let fired = 0;
    det.onShake(() => (fired += 1));
    det.start();
    // 5 samples 20ms apart = within one 100ms gap → counts as 1 spike.
    for (let i = 0; i < 5; i++) {
      m.push(SPIKE);
      clock.advance(20);
    }
    expect(fired).toBe(0);
  });

  test('expires spikes outside the rolling window', () => {
    const clock = makeClock(0);
    const m = makeSource();
    const det = new ShakeDetector({ source: m.source, now: clock.now, windowMs: 1000 });
    let fired = 0;
    det.onShake(() => (fired += 1));
    det.start();
    m.push(SPIKE); // t=0
    clock.advance(600);
    m.push(SPIKE); // t=600
    clock.advance(600); // t=1200 → first spike (t=0) now outside the 1000ms window
    m.push(SPIKE); // only 2 in window → no fire
    expect(fired).toBe(0);
  });

  test('enforces cooldown between shakes', () => {
    const clock = makeClock(0);
    const m = makeSource();
    const det = new ShakeDetector({
      source: m.source,
      now: clock.now,
      cooldownMs: 2000,
      minSpikeGapMs: 0,
    });
    let fired = 0;
    det.onShake(() => (fired += 1));
    det.start();

    const shake = () => {
      m.push(SPIKE);
      clock.advance(10);
      m.push(SPIKE);
      clock.advance(10);
      m.push(SPIKE);
      clock.advance(10);
    };
    shake();
    expect(fired).toBe(1);
    shake(); // immediately after → within cooldown
    expect(fired).toBe(1);
    clock.advance(2100); // past cooldown
    shake();
    expect(fired).toBe(2);
  });

  test('onShake remove() unsubscribes that handler', () => {
    const clock = makeClock(0);
    const m = makeSource();
    const det = new ShakeDetector({ source: m.source, now: clock.now, minSpikeGapMs: 0 });
    let fired = 0;
    const sub = det.onShake(() => (fired += 1));
    det.start();
    sub.remove();
    m.push(SPIKE);
    m.push(SPIKE);
    m.push(SPIKE);
    expect(fired).toBe(0);
  });

  test('start subscribes, stop unsubscribes; both idempotent', () => {
    const m = makeSource();
    const det = new ShakeDetector({ source: m.source });
    det.start();
    det.start();
    expect(det.isRunning()).toBe(true);
    expect(m.subscribed).toBe(true);
    det.stop();
    det.stop();
    expect(det.isRunning()).toBe(false);
    expect(m.removed).toBe(true);
  });

  test('a throwing handler does not break detection for others', () => {
    const clock = makeClock(0);
    const m = makeSource();
    const det = new ShakeDetector({ source: m.source, now: clock.now, minSpikeGapMs: 0 });
    let good = 0;
    det.onShake(() => {
      throw new Error('bad handler');
    });
    det.onShake(() => (good += 1));
    det.start();
    m.push(SPIKE);
    m.push(SPIKE);
    m.push(SPIKE);
    expect(good).toBe(1);
  });
});
