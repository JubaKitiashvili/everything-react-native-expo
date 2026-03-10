---
description: Testing standards for React Native projects
globs: "**/*.test.{ts,tsx}"
alwaysApply: false
---

# Testing

## Stack
- **Unit/Component**: Jest + React Native Testing Library (RNTL)
- **E2E**: Detox (with EAS Build for Expo projects)
- **Coverage**: Jest built-in, target 80% lines, 70% branches

## Principles
- Test behavior, not implementation
- Query by role, text, or label — avoid testID unless necessary
- One logical assertion per test
- Mock at boundaries (API, native modules), not internals
- No snapshot tests as primary strategy (smoke checks only)

## Component Tests
```tsx
// GOOD: Tests behavior
test('disables submit when form is invalid', () => {
  render(<LoginForm />);
  const button = screen.getByRole('button', { name: 'Submit' });
  expect(button).toBeDisabled();
});

// BAD: Tests implementation
test('sets isValid state to false', () => {
  const { result } = renderHook(() => useForm());
  expect(result.current.isValid).toBe(false);
});
```

## Mocking
```tsx
// Mock native module
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue('token'),
  setItemAsync: jest.fn(),
}));

// Mock navigation
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

// Mock API — use MSW or manual mock
const server = setupServer(
  rest.get('/api/users', (req, res, ctx) => res(ctx.json([]))),
);
```

## File Organization
- Tests adjacent to source: `UserCard.test.tsx` next to `UserCard.tsx`
- Or in `__tests__/` directory at feature level
- Shared test utilities in `tests/helpers/`
- E2E tests in `e2e/` directory at project root
