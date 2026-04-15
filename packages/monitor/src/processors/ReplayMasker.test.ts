import { ReplayMasker } from './ReplayMasker';
import type { ViewInfo } from './ReplayMasker';

function view(overrides: Partial<ViewInfo> & { id: string }): ViewInfo {
  return {
    type: 'View',
    x: 0,
    y: 0,
    width: 100,
    height: 44,
    ...overrides,
  };
}

describe('ReplayMasker', () => {
  test('masks views with secureTextEntry', () => {
    const masker = new ReplayMasker();
    const regions = masker.computeMaskRegions([
      view({ id: 'pw', secureTextEntry: true, x: 10, y: 20 }),
      view({ id: 'normal' }),
    ]);
    expect(regions).toHaveLength(1);
    expect(regions[0]!.id).toBe('pw');
    expect(regions[0]!.reason).toBe('secureTextEntry');
    expect(regions[0]!.x).toBe(10);
    expect(regions[0]!.y).toBe(20);
  });

  test('masks views with PII accessibilityLabel (case-insensitive)', () => {
    const masker = new ReplayMasker();
    const regions = masker.computeMaskRegions([
      view({ id: 'a', accessibilityLabel: 'Enter your Password' }),
      view({ id: 'b', accessibilityLabel: 'Email address' }),
      view({ id: 'c', accessibilityLabel: 'Phone number' }),
      view({ id: 'd', accessibilityLabel: 'Username' }),
    ]);
    expect(regions).toHaveLength(3);
    expect(regions.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(regions.every((r) => r.reason === 'accessibilityLabel')).toBe(true);
  });

  test('masks views matching custom mask list by testID', () => {
    const masker = new ReplayMasker({
      customMaskViews: ['credit-card-input', 'ssn-field'],
    });
    const regions = masker.computeMaskRegions([
      view({ id: 'cc', testID: 'Credit-Card-Input' }), // case-insensitive
      view({ id: 'ssn', testID: 'ssn-field' }),
      view({ id: 'name', testID: 'name-field' }),
    ]);
    expect(regions).toHaveLength(2);
    expect(regions.map((r) => r.id)).toEqual(['cc', 'ssn']);
    expect(regions.every((r) => r.reason === 'customMask')).toBe(true);
  });

  test('masks views matching custom mask list by nativeID', () => {
    const masker = new ReplayMasker({
      customMaskViews: ['secret-view'],
    });
    const regions = masker.computeMaskRegions([
      view({ id: 'sv', nativeID: 'Secret-View' }),
    ]);
    expect(regions).toHaveLength(1);
    expect(regions[0]!.reason).toBe('customMask');
  });

  test('secureTextEntry takes priority over accessibilityLabel', () => {
    const masker = new ReplayMasker();
    const regions = masker.computeMaskRegions([
      view({
        id: 'pw',
        secureTextEntry: true,
        accessibilityLabel: 'Password',
      }),
    ]);
    expect(regions).toHaveLength(1);
    expect(regions[0]!.reason).toBe('secureTextEntry');
  });

  test('returns empty array for views with no PII', () => {
    const masker = new ReplayMasker();
    const regions = masker.computeMaskRegions([
      view({ id: 'a', accessibilityLabel: 'Submit button' }),
      view({ id: 'b', type: 'Text' }),
    ]);
    expect(regions).toHaveLength(0);
  });

  test('works with no custom mask views', () => {
    const masker = new ReplayMasker({ customMaskViews: [] });
    const regions = masker.computeMaskRegions([
      view({ id: 'a', testID: 'anything' }),
    ]);
    expect(regions).toHaveLength(0);
  });

  test('preserves frame coordinates in mask regions', () => {
    const masker = new ReplayMasker();
    const regions = masker.computeMaskRegions([
      view({
        id: 'pw',
        secureTextEntry: true,
        x: 16,
        y: 200,
        width: 328,
        height: 48,
      }),
    ]);
    expect(regions[0]).toMatchObject({
      x: 16,
      y: 200,
      width: 328,
      height: 48,
    });
  });
});
