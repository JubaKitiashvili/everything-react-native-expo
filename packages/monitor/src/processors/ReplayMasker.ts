/**
 * Task 47 — ReplayMasker
 *
 * PII masking logic for session replay frames. Determines which views
 * should be obscured before a screenshot is stored or transmitted.
 *
 * Masking rules (all case-insensitive):
 * 1. Any TextInput with `secureTextEntry` → always masked
 * 2. Views with accessibilityLabel containing "password", "email", "phone"
 * 3. Custom mask list from config (`replayMaskViews`)
 * 4. Views whose testID / nativeID matches a mask pattern
 *
 * The masker produces a list of mask regions (rectangles) that the native
 * capture layer draws opaque rectangles over before encoding the frame.
 */

export interface ReplayMaskRegion {
  /** View identifier (testID, nativeID, or generated). */
  readonly id: string;
  /** Screen coordinates. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Why this region was masked. */
  readonly reason: 'secureTextEntry' | 'accessibilityLabel' | 'customMask';
}

export interface ViewInfo {
  readonly id: string;
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly accessibilityLabel?: string | null;
  readonly testID?: string | null;
  readonly nativeID?: string | null;
  readonly secureTextEntry?: boolean;
}

export interface ReplayMaskerOptions {
  /**
   * Additional view identifiers (testID / nativeID) to mask.
   * Matched case-insensitively.
   */
  customMaskViews?: readonly string[];
}

const PII_LABEL_PATTERNS = ['password', 'email', 'phone'];

export class ReplayMasker {
  private readonly customMaskSet: ReadonlySet<string>;

  constructor(options: ReplayMaskerOptions = {}) {
    this.customMaskSet = new Set(
      (options.customMaskViews ?? []).map((v) => v.toLowerCase()),
    );
  }

  /**
   * Given a list of visible views, returns the regions that must be
   * masked in the replay frame.
   */
  computeMaskRegions(views: readonly ViewInfo[]): readonly ReplayMaskRegion[] {
    const regions: ReplayMaskRegion[] = [];

    for (const view of views) {
      // Rule 1: secureTextEntry
      if (view.secureTextEntry) {
        regions.push({
          id: view.id,
          x: view.x,
          y: view.y,
          width: view.width,
          height: view.height,
          reason: 'secureTextEntry',
        });
        continue;
      }

      // Rule 2: accessibilityLabel contains PII keywords
      if (view.accessibilityLabel) {
        const label = view.accessibilityLabel.toLowerCase();
        if (PII_LABEL_PATTERNS.some((p) => label.includes(p))) {
          regions.push({
            id: view.id,
            x: view.x,
            y: view.y,
            width: view.width,
            height: view.height,
            reason: 'accessibilityLabel',
          });
          continue;
        }
      }

      // Rule 3: custom mask list (testID or nativeID match)
      if (this.customMaskSet.size > 0) {
        const testId = (view.testID ?? '').toLowerCase();
        const nativeId = (view.nativeID ?? '').toLowerCase();
        if (
          (testId && this.customMaskSet.has(testId)) ||
          (nativeId && this.customMaskSet.has(nativeId))
        ) {
          regions.push({
            id: view.id,
            x: view.x,
            y: view.y,
            width: view.width,
            height: view.height,
            reason: 'customMask',
          });
        }
      }
    }

    return regions;
  }
}
