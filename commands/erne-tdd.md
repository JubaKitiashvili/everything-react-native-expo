---
name: erne-tdd
description: ERNE — Test-driven development workflow with Jest and React Native Testing Library
---

# /erne-tdd — Test-Driven Development

You are executing the `/erne-tdd` command. Use the **tdd-guide** agent to implement features test-first.

## Red-Green-Refactor Cycle

### 1. RED — Write Failing Test First
```tsx
// Write the test BEFORE any implementation
test('LoginButton shows loading state during auth', () => {
  render(<LoginButton onPress={mockAuth} />);
  fireEvent.press(screen.getByRole('button', { name: 'Log In' }));
  expect(screen.getByTestId('loading-spinner')).toBeVisible();
});
```
Run the test — confirm it FAILS (red).

### 2. GREEN — Write Minimum Code to Pass
Implement only enough code to make the test pass. Do not over-engineer.

### 3. REFACTOR — Clean Up
Improve code quality while keeping tests green:
- Extract shared logic into hooks
- Improve naming and readability
- Remove duplication

## Testing Stack
- **Unit/Component**: Jest + React Native Testing Library
- **E2E**: Detox (when needed for user flows)

## Workflow
1. User describes the feature to implement
2. Write test(s) for the first behavior
3. Run test — verify it fails
4. Implement minimum code
5. Run test — verify it passes
6. Refactor if needed
7. Repeat for next behavior
8. When feature is complete, run full test suite

## Rules
- Never write implementation code without a failing test first
- Test behavior, not implementation details
- Query elements by role, text, or label (not testID unless necessary)
- Mock at boundaries (API, native modules), not internals
- Reference `rules/common/testing.md` for conventions
