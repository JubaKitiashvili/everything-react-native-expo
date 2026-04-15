import {
  AnomalyDetector,
  type AnomalyInput,
  type AnomalyModel,
  type AnomalyResult,
} from './AnomalyDetector';
import { ModelLoader, type ModelFactory, type ModelSource } from './ModelLoader';
import { SignalBus } from '../core/SignalBus';
import type { MonitorEvent } from '../types';

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function makeScheduler() {
  let pending: (() => void) | null = null;
  return {
    scheduler: {
      set: (fn: () => void) => {
        pending = fn;
        return 1;
      },
      clear: () => {
        pending = null;
      },
    },
    fire: () => {
      pending?.();
    },
  };
}

function normalInput(): AnomalyInput {
  return {
    fpsHistory: Array(6).fill(60) as number[],
    memoryTrend: [100, 100, 100],
    networkErrorRate: 0,
    renderCount: 5,
  };
}

function anomalousInput(): AnomalyInput {
  return {
    fpsHistory: Array(6).fill(20) as number[],
    memoryTrend: [100, 200, 300, 400, 500],
    networkErrorRate: 0.8,
    renderCount: 80,
  };
}

function createFakeModel(overrides?: Partial<AnomalyModel>): AnomalyModel {
  return {
    isReady: true,
    async predict(_input: AnomalyInput): Promise<AnomalyResult> {
      return { score: 0.95, type: 'compound', details: { source: 'ml' } };
    },
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────
// AnomalyDetector tests
// ────────────────────────────────────────────────────────────

describe('AnomalyDetector', () => {
  test('starts and stops cleanly', () => {
    const sch = makeScheduler();
    const detector = new AnomalyDetector({
      signalBus: new SignalBus(),
      getInput: normalInput,
      scheduler: sch.scheduler,
    });

    detector.start();
    expect(detector.isRunning()).toBe(true);
    detector.stop();
    expect(detector.isRunning()).toBe(false);
  });

  test('uses rule-based fallback when no model provided', async () => {
    const bus = new SignalBus();
    const events: MonitorEvent[] = [];
    bus.onAll((e) => events.push(e));

    const detector = new AnomalyDetector({
      signalBus: bus,
      getInput: anomalousInput,
      threshold: 0.5,
      now: () => 1000,
    });

    const result = await detector.detect();
    expect(result.score).toBeGreaterThan(0);
    expect(result.type).toBeDefined();
  });

  test('emits event when score exceeds threshold', async () => {
    const bus = new SignalBus();
    const events: MonitorEvent[] = [];
    bus.onAll((e) => events.push(e));

    const detector = new AnomalyDetector({
      signalBus: bus,
      getInput: anomalousInput,
      threshold: 0.3,
      now: () => 5000,
    });

    await detector.detect();
    expect(events).toHaveLength(1);
    const data = events[0]!.data as { name: string; attributes: { score: number; anomalyType: string } };
    expect(data.name).toBe('anomaly');
    expect(data.attributes.score).toBeGreaterThan(0.3);
  });

  test('does not emit when score is below threshold', async () => {
    const bus = new SignalBus();
    const events: MonitorEvent[] = [];
    bus.onAll((e) => events.push(e));

    const detector = new AnomalyDetector({
      signalBus: bus,
      getInput: normalInput,
      threshold: 0.8,
      now: () => 1000,
    });

    await detector.detect();
    expect(events).toHaveLength(0);
  });

  test('uses ML model when available', async () => {
    const bus = new SignalBus();
    const events: MonitorEvent[] = [];
    bus.onAll((e) => events.push(e));

    const model = createFakeModel();
    const detector = new AnomalyDetector({
      signalBus: bus,
      model,
      getInput: normalInput,
      threshold: 0.5,
      now: () => 1000,
    });

    const result = await detector.detect();
    expect(result.score).toBe(0.95);
    expect(result.details).toEqual({ source: 'ml' });
    expect(events).toHaveLength(1);
  });

  test('falls back to rules when model throws', async () => {
    const bus = new SignalBus();
    const model = createFakeModel({
      isReady: true,
      async predict(): Promise<AnomalyResult> {
        throw new Error('Model failed');
      },
    });

    const detector = new AnomalyDetector({
      signalBus: bus,
      model,
      getInput: normalInput,
      threshold: 0.8,
    });

    const result = await detector.detect();
    // Rule-based for normal input should give low score
    expect(result.score).toBeLessThan(0.8);
  });

  test('falls back to rules when model not ready', async () => {
    const bus = new SignalBus();
    const model = createFakeModel({ isReady: false });

    const detector = new AnomalyDetector({
      signalBus: bus,
      model,
      getInput: anomalousInput,
      threshold: 0.3,
    });

    const result = await detector.detect();
    // Should use rule-based, which detects anomalies in our input
    expect(result.score).toBeGreaterThan(0);
  });

  test('detects FPS degradation', async () => {
    const bus = new SignalBus();
    const detector = new AnomalyDetector({
      signalBus: bus,
      getInput: () => ({
        fpsHistory: Array(6).fill(15) as number[],
        memoryTrend: [100, 100],
        networkErrorRate: 0,
        renderCount: 5,
      }),
      threshold: 0.01,
      now: () => 1000,
    });

    const result = await detector.detect();
    expect(result.type).toBe('fps_degradation');
    expect(result.score).toBeGreaterThan(0.5);
  });

  test('detects memory leak', async () => {
    const bus = new SignalBus();
    const detector = new AnomalyDetector({
      signalBus: bus,
      getInput: () => ({
        fpsHistory: Array(6).fill(60) as number[],
        memoryTrend: [100, 200, 300, 400, 500, 600],
        networkErrorRate: 0,
        renderCount: 5,
      }),
      threshold: 0.01,
      now: () => 1000,
    });

    const result = await detector.detect();
    expect(result.type).toBe('memory_leak');
  });

  test('detects network failure spike', async () => {
    const bus = new SignalBus();
    const detector = new AnomalyDetector({
      signalBus: bus,
      getInput: () => ({
        fpsHistory: Array(6).fill(60) as number[],
        memoryTrend: [100, 100],
        networkErrorRate: 0.9,
        renderCount: 5,
      }),
      threshold: 0.01,
      now: () => 1000,
    });

    const result = await detector.detect();
    expect(result.type).toBe('network_failure_spike');
  });

  test('detects render storm', async () => {
    const bus = new SignalBus();
    const detector = new AnomalyDetector({
      signalBus: bus,
      getInput: () => ({
        fpsHistory: Array(6).fill(60) as number[],
        memoryTrend: [100, 100],
        networkErrorRate: 0,
        renderCount: 80,
      }),
      threshold: 0.01,
      now: () => 1000,
    });

    const result = await detector.detect();
    expect(result.type).toBe('render_storm');
  });

  test('detects compound anomalies', async () => {
    const bus = new SignalBus();
    const detector = new AnomalyDetector({
      signalBus: bus,
      getInput: () => ({
        fpsHistory: Array(6).fill(20) as number[],
        memoryTrend: [100, 200, 300, 400, 500],
        networkErrorRate: 0.5,
        renderCount: 80,
      }),
      threshold: 0.01,
      now: () => 1000,
    });

    const result = await detector.detect();
    expect(result.type).toBe('compound');
  });

  test('getLastResult returns null before first detection', () => {
    const detector = new AnomalyDetector({
      signalBus: new SignalBus(),
      getInput: normalInput,
    });
    expect(detector.getLastResult()).toBeNull();
  });

  test('getLastResult returns last detection result', async () => {
    const detector = new AnomalyDetector({
      signalBus: new SignalBus(),
      getInput: normalInput,
    });

    await detector.detect();
    expect(detector.getLastResult()).not.toBeNull();
  });
});

// ────────────────────────────────────────────────────────────
// ModelLoader tests
// ────────────────────────────────────────────────────────────

describe('ModelLoader', () => {
  function createFakeFactory(): ModelFactory<{ type: string }> {
    return {
      async download(_uri: string, onProgress: (p: number) => void): Promise<string> {
        onProgress(0.5);
        onProgress(1.0);
        return '/tmp/model.pte';
      },
      async load(_localPath: string): Promise<{ type: string }> {
        return { type: 'fake-model' };
      },
      async validate(_localPath: string, _checksum: string): Promise<boolean> {
        return true;
      },
    };
  }

  const source: ModelSource = {
    uri: 'https://example.com/model.pte',
    checksum: 'abc123',
    version: '1.0.0',
  };

  test('starts in idle state', () => {
    const loader = new ModelLoader(source, createFakeFactory());
    expect(loader.getProgress().status).toBe('idle');
    expect(loader.isReady()).toBe(false);
    expect(loader.getModel()).toBeNull();
  });

  test('loads model successfully', async () => {
    const loader = new ModelLoader(source, createFakeFactory());
    const model = await loader.load();
    expect(model).toEqual({ type: 'fake-model' });
    expect(loader.isReady()).toBe(true);
    expect(loader.getModel()).not.toBeNull();
  });

  test('returns cached model on second load', async () => {
    const loader = new ModelLoader(source, createFakeFactory());
    const m1 = await loader.load();
    const m2 = await loader.load();
    expect(m1).toBe(m2);
  });

  test('reports progress during download', async () => {
    const progresses: number[] = [];
    const loader = new ModelLoader(source, createFakeFactory());
    loader.onProgress((p) => progresses.push(p.downloadProgress));
    await loader.load();
    expect(progresses).toContain(0.5);
    expect(progresses).toContain(1.0);
  });

  test('enters error state on checksum failure', async () => {
    const factory = createFakeFactory();
    factory.validate = async () => false;

    const loader = new ModelLoader(source, factory);
    await expect(loader.load()).rejects.toThrow('Checksum validation failed');
    expect(loader.getProgress().status).toBe('error');
    expect(loader.getProgress().error).toBe('Checksum validation failed');
  });

  test('enters error state on download failure', async () => {
    const factory = createFakeFactory();
    factory.download = async () => {
      throw new Error('Network error');
    };

    const loader = new ModelLoader(source, factory);
    await expect(loader.load()).rejects.toThrow('Network error');
    expect(loader.getProgress().status).toBe('error');
  });

  test('dispose resets state', async () => {
    const loader = new ModelLoader(source, createFakeFactory());
    await loader.load();
    expect(loader.isReady()).toBe(true);

    loader.dispose();
    expect(loader.isReady()).toBe(false);
    expect(loader.getModel()).toBeNull();
    expect(loader.getProgress().status).toBe('idle');
  });

  test('skips checksum when not provided', async () => {
    const sourceNoChecksum: ModelSource = { uri: 'x', version: '1.0' };
    let validateCalled = false;
    const factory = createFakeFactory();
    factory.validate = async () => {
      validateCalled = true;
      return true;
    };

    const loader = new ModelLoader(sourceNoChecksum, factory);
    await loader.load();
    expect(validateCalled).toBe(false);
    expect(loader.isReady()).toBe(true);
  });

  test('unsubscribe from progress works', async () => {
    const loader = new ModelLoader(source, createFakeFactory());
    const calls: number[] = [];
    const unsub = loader.onProgress((p) => calls.push(p.downloadProgress));
    unsub();
    await loader.load();
    expect(calls).toHaveLength(0);
  });
});
