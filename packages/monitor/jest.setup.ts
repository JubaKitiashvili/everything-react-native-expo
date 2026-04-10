// Tell react-test-renderer it is running inside a Jest act() environment
// so update warnings are not printed to stderr.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
