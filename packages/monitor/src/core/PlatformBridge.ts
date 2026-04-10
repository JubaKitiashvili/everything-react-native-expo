// PlatformBridge is the abstraction layer between the JS SDK and platform
// APIs. Phase 1a ships a pure-JS implementation (JSPlatformBridge) that uses
// React Native's JS surface. Phase 2 replaces it with a native module that
// can do things JS cannot: read native memory stats, write crash dumps
// synchronously before the process dies, and query real connectivity state.
//
// All SDK consumers must go through this interface — never import 'react-
// native' directly from a collector, because it breaks portability and
// makes Phase 2 native override impossible.

export type {
  PlatformBridge,
  DeviceInfo,
  AppInfo,
  MemoryInfo,
  ConnectionType,
  PlatformName,
} from '../types';
