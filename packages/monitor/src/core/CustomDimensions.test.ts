import {
  CustomDimensions,
  CUSTOM_DIMENSION_LIMITS,
} from './CustomDimensions';

function makeConsole(): { warn: jest.Mock; warnings: string[] } {
  const warnings: string[] = [];
  const warn = jest.fn((msg: string) => {
    warnings.push(msg);
  });
  return { warn, warnings };
}

describe('CustomDimensions', () => {
  describe('basic store', () => {
    it('sets and reads back dimensions', () => {
      const d = new CustomDimensions({ console: null });
      expect(d.setDimension('plan', 'pro')).toBe(true);
      expect(d.setDimension('seats', 5)).toBe(true);
      expect(d.setDimension('beta', true)).toBe(true);
      expect(d.getDimensions()).toEqual({ plan: 'pro', seats: 5, beta: true });
    });

    it('setUserProperties bulk-sets and returns accepted count', () => {
      const d = new CustomDimensions({ console: null });
      const accepted = d.setUserProperties({ tier: 'gold', region: 'eu' });
      expect(accepted).toBe(2);
      expect(d.getDimensions()).toEqual({ tier: 'gold', region: 'eu' });
    });

    it('overwrites existing keys without consuming new slots', () => {
      const d = new CustomDimensions({ console: null });
      d.setDimension('k', 'v1');
      d.setDimension('k', 'v2');
      expect(d.size()).toBe(1);
      expect(d.getDimensions().k).toBe('v2');
    });

    it('removeDimension and clear work', () => {
      const d = new CustomDimensions({ console: null });
      d.setDimension('a', 1);
      d.setDimension('b', 2);
      expect(d.removeDimension('a')).toBe(true);
      expect(d.removeDimension('missing')).toBe(false);
      expect(d.size()).toBe(1);
      d.clear();
      expect(d.size()).toBe(0);
      expect(d.getDimensions()).toEqual({});
    });

    it('getDimensions returns a copy, not the live map', () => {
      const d = new CustomDimensions({ console: null });
      d.setDimension('a', 1);
      const snap = d.getDimensions();
      snap.a = 99;
      expect(d.getDimensions().a).toBe(1);
    });
  });

  describe('limit enforcement', () => {
    it('drops keys beyond maxKeys with a warning', () => {
      const c = makeConsole();
      const d = new CustomDimensions({ maxKeys: 2, console: c });
      expect(d.setDimension('a', 1)).toBe(true);
      expect(d.setDimension('b', 2)).toBe(true);
      expect(d.setDimension('c', 3)).toBe(false);
      expect(d.size()).toBe(2);
      expect(c.warnings.some((w) => w.includes('key count exceeds 2'))).toBe(
        true,
      );
    });

    it('drops oversized keys with a warning', () => {
      const c = makeConsole();
      const d = new CustomDimensions({ maxKeyLength: 5, console: c });
      expect(d.setDimension('toolongkey', 'v')).toBe(false);
      expect(d.size()).toBe(0);
      expect(c.warnings.some((w) => w.includes('key exceeds 5'))).toBe(true);
    });

    it('drops oversized string values with a warning', () => {
      const c = makeConsole();
      const d = new CustomDimensions({ maxValueLength: 3, console: c });
      expect(d.setDimension('k', 'toolong')).toBe(false);
      expect(c.warnings.some((w) => w.includes('value exceeds 3'))).toBe(true);
    });

    it('drops non-primitive values', () => {
      const c = makeConsole();
      const d = new CustomDimensions({ console: c });
      expect(
        d.setDimension('k', { nested: true } as unknown as string),
      ).toBe(false);
      expect(c.warnings.some((w) => w.includes('string | number | boolean'))).toBe(
        true,
      );
    });

    it('drops non-finite numbers', () => {
      const c = makeConsole();
      const d = new CustomDimensions({ console: c });
      expect(d.setDimension('k', NaN)).toBe(false);
      expect(d.setDimension('k', Infinity)).toBe(false);
      expect(c.warnings.some((w) => w.includes('finite number'))).toBe(true);
    });

    it('rejects empty keys', () => {
      const c = makeConsole();
      const d = new CustomDimensions({ console: c });
      expect(d.setDimension('', 'v')).toBe(false);
      expect(c.warnings.some((w) => w.includes('non-empty string'))).toBe(true);
    });

    it('setUserProperties skips bad entries but keeps good ones', () => {
      const c = makeConsole();
      const d = new CustomDimensions({ maxValueLength: 4, console: c });
      const accepted = d.setUserProperties({
        ok: 'fine',
        bad: 'toolong',
      });
      expect(accepted).toBe(1);
      expect(d.getDimensions()).toEqual({ ok: 'fine' });
    });

    it('exposes default limits', () => {
      expect(CUSTOM_DIMENSION_LIMITS.maxKeys).toBe(32);
      expect(CUSTOM_DIMENSION_LIMITS.maxKeyLength).toBe(256);
      expect(CUSTOM_DIMENSION_LIMITS.maxValueLength).toBe(256);
    });

    it('uses defaults when no options provided', () => {
      const d = new CustomDimensions({ console: null });
      for (let i = 0; i < CUSTOM_DIMENSION_LIMITS.maxKeys; i++) {
        expect(d.setDimension(`k${i}`, i)).toBe(true);
      }
      // The 33rd is dropped.
      expect(d.setDimension('overflow', 1)).toBe(false);
      expect(d.size()).toBe(CUSTOM_DIMENSION_LIMITS.maxKeys);
    });
  });
});
