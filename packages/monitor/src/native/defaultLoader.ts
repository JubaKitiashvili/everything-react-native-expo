import type { ErneMonitorNativeModule, NativeModuleLoader } from './types';
import { LazyNativeModuleLoader } from './ErneMonitorNative';

/**
 * Default loader used at runtime. Does NOT import `expo-modules-core` at
 * the top level — the require happens inside the factory so ts-jest can
 * load the rest of the native wrapper without the RN/Expo runtime present.
 *
 * Resolution order:
 *   1. `requireOptionalNativeModule('ErneMonitor')` — returns null if absent.
 *   2. `requireNativeModule('ErneMonitor')` — throws if absent, caught here.
 *   3. Anything else fails → returns null, SDK runs in Phase 1 mode.
 */
export function createDefaultNativeModuleLoader(): NativeModuleLoader {
  return new LazyNativeModuleLoader(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const core = require('expo-modules-core') as {
        requireOptionalNativeModule?: (
          name: string,
        ) => ErneMonitorNativeModule | null;
        requireNativeModule?: (name: string) => ErneMonitorNativeModule;
      };
      if (typeof core.requireOptionalNativeModule === 'function') {
        return core.requireOptionalNativeModule('ErneMonitor');
      }
      if (typeof core.requireNativeModule === 'function') {
        return core.requireNativeModule('ErneMonitor');
      }
      return null;
    } catch {
      return null;
    }
  });
}
