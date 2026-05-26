import {
  getOtaContext,
  withOtaContext,
  type ExpoUpdatesLike,
} from './ota';

describe('ota', () => {
  describe('getOtaContext — expo-updates present', () => {
    it('maps runtimeVersion, channel, updateId, isEmbeddedLaunch', () => {
      const fake: ExpoUpdatesLike = {
        runtimeVersion: '1.2.3',
        channel: 'production',
        updateId: 'update-abc',
        isEmbeddedLaunch: false,
      };
      const ctx = getOtaContext(() => fake);
      expect(ctx).toEqual({
        runtimeVersion: '1.2.3',
        channel: 'production',
        updateId: 'update-abc',
        isEmbeddedLaunch: false,
        available: true,
      });
    });

    it('marks available=true even when an embedded launch has a null updateId', () => {
      const fake: ExpoUpdatesLike = {
        runtimeVersion: '2.0.0',
        channel: 'preview',
        updateId: null,
        isEmbeddedLaunch: true,
      };
      const ctx = getOtaContext(() => fake);
      expect(ctx.available).toBe(true);
      expect(ctx.updateId).toBeNull();
      expect(ctx.isEmbeddedLaunch).toBe(true);
    });

    it('coerces empty strings and non-strings to null', () => {
      const fake: ExpoUpdatesLike = {
        runtimeVersion: '',
        channel: undefined,
        updateId: 42 as unknown as string,
        isEmbeddedLaunch: 'yes' as unknown as boolean,
      };
      const ctx = getOtaContext(() => fake);
      expect(ctx.runtimeVersion).toBeNull();
      expect(ctx.channel).toBeNull();
      expect(ctx.updateId).toBeNull();
      expect(ctx.isEmbeddedLaunch).toBeNull();
      expect(ctx.available).toBe(true);
    });

    it('unwraps a default-exported module shape', () => {
      const inner: ExpoUpdatesLike = {
        runtimeVersion: '9.9.9',
        channel: 'staging',
        updateId: 'u1',
        isEmbeddedLaunch: false,
      };
      const ctx = getOtaContext(
        () => ({ default: inner }) as unknown as ExpoUpdatesLike,
      );
      expect(ctx.runtimeVersion).toBe('9.9.9');
    });
  });

  describe('getOtaContext — expo-updates absent', () => {
    it('returns an unavailable, all-null context', () => {
      const ctx = getOtaContext(() => null);
      expect(ctx).toEqual({
        runtimeVersion: null,
        channel: null,
        updateId: null,
        isEmbeddedLaunch: null,
        available: false,
      });
    });

    it('treats a thrown resolver as absent', () => {
      const ctx = getOtaContext(() => {
        throw new Error('module not found');
      });
      expect(ctx.available).toBe(false);
    });
  });

  describe('withOtaContext', () => {
    it('attaches the context under the ota key without mutating input', () => {
      const meta = { sessionId: 's1' };
      const ctx = getOtaContext(() => ({
        runtimeVersion: '1.0.0',
        channel: 'prod',
        updateId: 'u',
        isEmbeddedLaunch: false,
      }));
      const merged = withOtaContext(meta, ctx);
      expect(merged.sessionId).toBe('s1');
      expect(merged.ota).toBe(ctx);
      expect(meta).not.toHaveProperty('ota');
    });

    it('falls back to the default resolver when no context passed', () => {
      const merged = withOtaContext({ a: 1 });
      expect(merged.ota).toBeDefined();
      expect(typeof merged.ota.available).toBe('boolean');
    });
  });
});
