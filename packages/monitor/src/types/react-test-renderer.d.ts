// Minimal ambient declaration so MonitorProvider.test.tsx type-checks
// without pulling in @types/react-test-renderer (which is deprecated as
// of React 19). Only the symbols the test actually uses are listed.
declare module 'react-test-renderer' {
  export function act(callback: () => void | Promise<void>): Promise<void>;
  namespace TestRenderer {
    interface ReactTestRenderer {
      root: unknown;
      unmount(): void;
      update(element: unknown): void;
      toJSON(): unknown;
    }
  }
  const TestRenderer: {
    create(element: unknown): TestRenderer.ReactTestRenderer;
  };
  export default TestRenderer;
}
