---
name: tdd-workflow
description: Test-driven development workflow for React Native — Jest, React Native Testing Library, and Detox
---

# TDD Workflow

You are executing a test-driven development workflow for React Native. Follow the Red-Green-Refactor cycle strictly.

## When to Use This Skill

Invoke this skill when:
- Implementing a new feature or component
- Fixing a bug (write test to reproduce first)
- Refactoring existing code (ensure tests exist first)

## Red-Green-Refactor Cycle

### Phase 1: RED — Write a Failing Test

Before writing any implementation code, write a test that describes the expected behavior:

**Component test (React Native Testing Library):**
```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { LoginForm } from '../LoginForm';

describe('LoginForm', () => {
  it('disables submit when fields are empty', () => {
    render(<LoginForm onSubmit={jest.fn()} />);
    const submitButton = screen.getByRole('button', { name: /sign in/i });
    expect(submitButton).toBeDisabled();
  });

  it('calls onSubmit with email and password', () => {
    const onSubmit = jest.fn();
    render(<LoginForm onSubmit={onSubmit} />);

    fireEvent.changeText(screen.getByPlaceholderText(/email/i), 'user@test.com');
    fireEvent.changeText(screen.getByPlaceholderText(/password/i), 'secret123');
    fireEvent.press(screen.getByRole('button', { name: /sign in/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      email: 'user@test.com',
      password: 'secret123',
    });
  });

  it('shows error message on failed login', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('Invalid credentials'));
    render(<LoginForm onSubmit={onSubmit} />);

    fireEvent.changeText(screen.getByPlaceholderText(/email/i), 'user@test.com');
    fireEvent.changeText(screen.getByPlaceholderText(/password/i), 'wrong');
    fireEvent.press(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/invalid credentials/i)).toBeTruthy();
  });
});
```

Run the test. It MUST fail (red).

### Phase 2: GREEN — Minimal Implementation

Write the minimum code to make the test pass. Do NOT add anything extra:

```tsx
export function LoginForm({ onSubmit }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    try {
      await onSubmit({ email, password });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  };

  return (
    <View>
      <TextInput placeholder="Email" value={email} onChangeText={setEmail} />
      <TextInput placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
      <Pressable
        onPress={handleSubmit}
        disabled={!email || !password}
        accessibilityRole="button"
        accessibilityLabel="Sign in"
      >
        <Text>Sign In</Text>
      </Pressable>
      {error && <Text>{error}</Text>}
    </View>
  );
}
```

Run tests again. All MUST pass (green).

### Phase 3: REFACTOR — Clean Up

Now improve the code without changing behavior:
- Extract hooks (`useLoginForm`)
- Add NativeWind styling
- Improve types
- Add accessibility labels

Run tests after every change. They MUST stay green.

## Testing Layers

| Layer | Tool | What to Test |
|-------|------|-------------|
| Unit | Jest | Pure functions, hooks, utilities |
| Component | RNTL | Component rendering, user interactions |
| Integration | RNTL | Multiple components working together |
| E2E | Detox | Full user flows on real app |

## Test File Placement

Tests live next to their source:
```
src/features/auth/
  LoginForm.tsx
  __tests__/
    LoginForm.test.tsx
  hooks/
    useLoginForm.ts
    __tests__/
      useLoginForm.test.ts
```

## Rules

1. **Never write implementation before tests**
2. **One behavior per test** — test name should describe expected behavior
3. **Test behavior, not implementation** — don't test internal state
4. **Use `screen` queries** — prefer `getByRole`, `getByText`, `getByPlaceholderText`
5. **Mock at boundaries** — mock API calls, not internal functions
6. **No snapshot tests** — they break too easily, test specific assertions
