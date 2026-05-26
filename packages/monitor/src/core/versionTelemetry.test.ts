import {
  SDK_VERSION,
  compareVersions,
  getVersionContext,
  checkForUpgrade,
  withVersionContext,
} from './versionTelemetry';

describe('versionTelemetry', () => {
  describe('SDK_VERSION', () => {
    it('is a non-empty semver-shaped string', () => {
      expect(typeof SDK_VERSION).toBe('string');
      expect(SDK_VERSION.length).toBeGreaterThan(0);
      expect(SDK_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe('compareVersions', () => {
    it('orders by major, then minor, then patch', () => {
      expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
      expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
      expect(compareVersions('1.2.0', '1.3.0')).toBe(-1);
      expect(compareVersions('1.2.5', '1.2.4')).toBe(1);
      expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    });

    it('strips pre-release and build metadata', () => {
      expect(compareVersions('1.2.3-beta.1', '1.2.3')).toBe(0);
      expect(compareVersions('1.2.3+sha.abc', '1.2.3')).toBe(0);
      expect(compareVersions('2.0.0-rc.1', '1.9.9')).toBe(1);
    });

    it('treats missing components as zero', () => {
      expect(compareVersions('1', '1.0.0')).toBe(0);
      expect(compareVersions('1.2', '1.2.0')).toBe(0);
      expect(compareVersions('1.2', '1.2.1')).toBe(-1);
    });

    it('treats non-numeric components as zero', () => {
      expect(compareVersions('1.x.0', '1.0.0')).toBe(0);
    });
  });

  describe('getVersionContext', () => {
    it('defaults to SDK_VERSION', () => {
      expect(getVersionContext()).toEqual({ sdkVersion: SDK_VERSION });
    });

    it('accepts an override', () => {
      expect(getVersionContext('9.9.9')).toEqual({ sdkVersion: '9.9.9' });
    });
  });

  describe('checkForUpgrade', () => {
    it('flags a major upgrade', () => {
      expect(checkForUpgrade('2.0.0', '1.4.7')).toEqual({
        current: '1.4.7',
        latest: '2.0.0',
        outdated: true,
        severity: 'major',
      });
    });

    it('flags a minor upgrade', () => {
      expect(checkForUpgrade('1.5.0', '1.4.7')).toEqual({
        current: '1.4.7',
        latest: '1.5.0',
        outdated: true,
        severity: 'minor',
      });
    });

    it('flags a patch upgrade', () => {
      expect(checkForUpgrade('1.4.8', '1.4.7')).toEqual({
        current: '1.4.7',
        latest: '1.4.8',
        outdated: true,
        severity: 'patch',
      });
    });

    it('reports none when up to date', () => {
      expect(checkForUpgrade('1.4.7', '1.4.7')).toEqual({
        current: '1.4.7',
        latest: '1.4.7',
        outdated: false,
        severity: 'none',
      });
    });

    it('reports none when current is ahead of latest', () => {
      const result = checkForUpgrade('1.0.0', '1.5.0');
      expect(result.outdated).toBe(false);
      expect(result.severity).toBe('none');
    });

    it('classifies major even when minor/patch also differ', () => {
      // major behind takes precedence over minor/patch deltas
      expect(checkForUpgrade('3.1.4', '2.9.9').severity).toBe('major');
    });

    it('classifies minor when minor differs but a smaller patch is present', () => {
      // 1.4.9 → 1.5.0: minor bumped, patch dropped. Severity is minor.
      expect(checkForUpgrade('1.5.0', '1.4.9').severity).toBe('minor');
    });

    it('defaults current to the installed SDK_VERSION', () => {
      const result = checkForUpgrade('999.0.0');
      expect(result.current).toBe(SDK_VERSION);
      expect(result.outdated).toBe(true);
      expect(result.severity).toBe('major');
    });
  });

  describe('withVersionContext', () => {
    it('attaches the version context without mutating the input', () => {
      const meta = { foo: 'bar' };
      const out = withVersionContext(meta, { sdkVersion: '1.2.3' });
      expect(out).toEqual({ foo: 'bar', sdk: { sdkVersion: '1.2.3' } });
      expect(meta).toEqual({ foo: 'bar' });
    });

    it('uses the installed version by default', () => {
      const out = withVersionContext({});
      expect(out.sdk.sdkVersion).toBe(SDK_VERSION);
    });
  });
});
