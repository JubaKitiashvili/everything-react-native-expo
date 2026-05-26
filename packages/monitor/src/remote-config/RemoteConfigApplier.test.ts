import { validateRemoteConfig } from './RemoteConfig';
import {
  RemoteSamplingGate,
  applyFeatureFlags,
  splitPiiRules,
  type FeatureToggle,
} from './RemoteConfigApplier';

describe('RemoteSamplingGate', () => {
  it('keeps everything with an empty config (rate defaults to 1)', () => {
    const gate = new RemoteSamplingGate({ random: () => 0.999 });
    gate.setConfig(validateRemoteConfig({}));
    expect(gate.shouldKeep('network')).toBe(true);
    expect(gate.shouldKeep('anything')).toBe(true);
  });

  it('rate 0 always drops, rate 1 always keeps (no RNG consumed)', () => {
    const random = jest.fn(() => 0.5);
    const gate = new RemoteSamplingGate({ random });
    gate.setConfig(validateRemoteConfig({ sampling: { drop: 0, keep: 1 } }));
    expect(gate.shouldKeep('drop')).toBe(false);
    expect(gate.shouldKeep('keep')).toBe(true);
    expect(random).not.toHaveBeenCalled();
  });

  it('rate 0.5 splits deterministically by injected RNG', () => {
    // Alternating RNG: 0.2 (< 0.5 → keep), 0.8 (>= 0.5 → drop)
    const seq = [0.2, 0.8, 0.49, 0.5];
    let i = 0;
    const gate = new RemoteSamplingGate({ random: () => seq[i++] ?? 1 });
    gate.setConfig(validateRemoteConfig({ sampling: { network: 0.5 } }));
    expect(gate.shouldKeep('network')).toBe(true); // 0.2 < 0.5
    expect(gate.shouldKeep('network')).toBe(false); // 0.8 >= 0.5
    expect(gate.shouldKeep('network')).toBe(true); // 0.49 < 0.5
    expect(gate.shouldKeep('network')).toBe(false); // 0.5 not < 0.5
  });

  it('falls back to the reserved `default` key for unlisted types', () => {
    const gate = new RemoteSamplingGate({ random: () => 0.9 });
    gate.setConfig(
      validateRemoteConfig({ sampling: { network: 1, default: 0 } }),
    );
    expect(gate.rateFor('network')).toBe(1);
    expect(gate.rateFor('render')).toBe(0); // via default
    expect(gate.shouldKeep('network')).toBe(true);
    expect(gate.shouldKeep('render')).toBe(false);
  });

  it('rateFor returns 1 when no rule and no default', () => {
    const gate = new RemoteSamplingGate();
    gate.setConfig(validateRemoteConfig({ sampling: { network: 0.3 } }));
    expect(gate.rateFor('unlisted')).toBe(1);
  });

  it('picks up a swapped config immediately', () => {
    const gate = new RemoteSamplingGate({ random: () => 0.5 });
    gate.setConfig(validateRemoteConfig({ sampling: { x: 1 } }));
    expect(gate.shouldKeep('x')).toBe(true);
    gate.setConfig(validateRemoteConfig({ sampling: { x: 0 } }));
    expect(gate.shouldKeep('x')).toBe(false);
  });
});

describe('applyFeatureFlags', () => {
  function makeToggle(): FeatureToggle & { on: jest.Mock; off: jest.Mock } {
    return { on: jest.fn(), off: jest.fn() };
  }

  it('fires on/off for known flags on first apply', () => {
    const render = makeToggle();
    const network = makeToggle();
    const res = applyFeatureFlags(
      { render: false, network: true },
      { render, network },
      {},
    );
    expect(render.off).toHaveBeenCalledTimes(1);
    expect(network.on).toHaveBeenCalledTimes(1);
    expect([...res.changed].sort()).toEqual(['network', 'render']);
    expect(res.ignored).toEqual([]);
  });

  it('ignores unknown flags', () => {
    const render = makeToggle();
    const res = applyFeatureFlags(
      { render: true, mysteryFlag: false },
      { render },
      {},
    );
    expect(res.ignored).toEqual(['mysteryFlag']);
    expect(render.on).toHaveBeenCalledTimes(1);
  });

  it('only fires toggles on value transitions', () => {
    const render = makeToggle();
    // previously applied: render=true
    const res1 = applyFeatureFlags({ render: true }, { render }, { render: true });
    expect(res1.changed).toEqual([]);
    expect(render.on).not.toHaveBeenCalled();
    expect(render.off).not.toHaveBeenCalled();

    // now flips to false
    const res2 = applyFeatureFlags({ render: false }, { render }, { render: true });
    expect(res2.changed).toEqual(['render']);
    expect(render.off).toHaveBeenCalledTimes(1);
  });
});

describe('splitPiiRules', () => {
  it('routes plain identifiers to sensitive keys', () => {
    const split = splitPiiRules(['email', 'card_number', 'user.id', 'x-token']);
    expect(split.sensitiveKeys).toEqual(['email', 'card_number', 'user.id', 'x-token']);
    expect(split.patterns).toEqual([]);
    expect(split.invalid).toEqual([]);
  });

  it('compiles regex-source rules to global patterns', () => {
    const split = splitPiiRules(['\\d{3}-\\d{2}-\\d{4}', 'secret_[a-z]+']);
    expect(split.sensitiveKeys).toEqual([]);
    expect(split.patterns).toHaveLength(2);
    for (const p of split.patterns) expect(p.global).toBe(true);
    // Sanity: the compiled SSN pattern matches.
    const ssnPattern = split.patterns[0]!;
    expect('123-45-6789'.replace(ssnPattern, 'X')).toBe('X');
  });

  it('collects invalid regex without throwing', () => {
    const split = splitPiiRules(['(unclosed', 'email']);
    expect(split.invalid).toEqual(['(unclosed']);
    expect(split.sensitiveKeys).toEqual(['email']);
  });

  it('skips empty rules', () => {
    const split = splitPiiRules(['', 'email']);
    expect(split.sensitiveKeys).toEqual(['email']);
  });
});
