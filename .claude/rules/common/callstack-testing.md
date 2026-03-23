---
description: React Native Testing Library (RNTL) — full query API, userEvent, renderHook, waitFor, within
globs: '**/*.test.{ts,tsx}'
alwaysApply: false
---

# React Native Testing Library — Full API

## render & screen

```tsx
import { render, screen } from '@testing-library/react-native';

render(<MyComponent prop="value" />, {
  wrapper: AllProviders, // wrap with providers
  concurrentRoot: true, // New Architecture (default: true)
});

// screen has all queries + utilities
screen.getByRole('button', { name: 'Submit' });
screen.rerender(<MyComponent prop="newValue" />);
screen.unmount();
screen.debug(); // print tree
screen.toJSON(); // JSON snapshot
```

## Queries

### Variants

| Prefix        | Returns          | 0 matches            | 2+ matches | Async |
| ------------- | ---------------- | -------------------- | ---------- | ----- |
| `getBy*`      | element          | throws               | throws     | No    |
| `queryBy*`    | element \| null  | null                 | throws     | No    |
| `findBy*`     | Promise          | throws after timeout | throws     | Yes   |
| `getAllBy*`   | array            | throws               | OK         | No    |
| `queryAllBy*` | array            | []                   | OK         | No    |
| `findAllBy*`  | Promise\<array\> | throws after timeout | OK         | Yes   |

### Types (priority order — prefer semantic queries)

```tsx
// 1. ByRole (BEST — most semantic)
screen.getByRole('button', { name: 'Submit' });
screen.getByRole('header', { name: 'Settings' });
screen.getByRole('switch', { checked: true });
screen.getByRole('button', { disabled: true });
screen.getByRole('tab', { selected: true });

// ByRole filter options: name, disabled, selected, checked, busy, expanded, value

// 2. ByText
screen.getByText('Hello World');
screen.getByText(/hello/i); // regex

// 3. ByLabelText (accessibilityLabel / aria-label)
screen.getByLabelText('Close dialog');

// 4. ByHintText (accessibilityHint / aria-description)
screen.getByHintText('Navigates to settings');

// 5. ByPlaceholderText (TextInput placeholder)
screen.getByPlaceholderText('Enter email');

// 6. ByDisplayValue (TextInput current value)
screen.getByDisplayValue('current text');

// 7. ByTestId (LAST RESORT)
screen.getByTestId('submit-button');
```

### Common Options

```tsx
// exact: false — substring match, case-insensitive
screen.getByText('hello', { exact: false });

// hidden: true — include hidden elements
screen.getByRole('button', { hidden: true });

// findBy* timeout
await screen.findByText('Loaded', {}, { timeout: 3000, interval: 100 });
```

## userEvent (recommended over fireEvent)

Simulates realistic user interactions with full event sequences.

```tsx
import { userEvent } from '@testing-library/react-native';

const user = userEvent.setup();

// Press (pressIn → press → pressOut)
await user.press(screen.getByRole('button', { name: 'Submit' }));

// Long press
await user.longPress(screen.getByRole('button'), { duration: 1000 });

// Type text (focus → per-character events → blur)
await user.type(screen.getByPlaceholderText('Email'), 'user@test.com');
await user.type(input, 'text', { submitEditing: true }); // trigger submit

// Clear text input
await user.clear(screen.getByPlaceholderText('Email'));

// Scroll
await user.scrollTo(screen.getByTestId('list'), { y: 300 });
await user.scrollTo(element, { y: 500, momentumY: 200 });
```

## fireEvent (low-level)

```tsx
import { fireEvent } from '@testing-library/react-native';

fireEvent.press(element);
fireEvent.changeText(element, 'new text');
fireEvent.scroll(element, {
  nativeEvent: {
    contentOffset: { y: 200 },
    contentSize: { height: 500, width: 100 },
    layoutMeasurement: { height: 100, width: 100 },
  },
});

// Generic form (any event)
fireEvent(element, 'focus');
fireEvent(element, 'blur');
fireEvent(element, 'submitEditing');
fireEvent(element, 'longPress');
fireEvent(element, 'layout', { nativeEvent: { layout: { width: 100 } } });
```

## waitFor & waitForElementToBeRemoved

```tsx
import { waitFor, waitForElementToBeRemoved } from '@testing-library/react-native';

// Wait for condition
await waitFor(() => expect(mockFn).toHaveBeenCalled(), {
  timeout: 3000,
  interval: 100,
});

// Wait for element to disappear
await waitForElementToBeRemoved(() => screen.getByText('Loading...'));
```

## within (scoped queries)

```tsx
import { within } from '@testing-library/react-native';

const listItem = screen.getAllByRole('listitem')[0];
expect(within(listItem).getByText('Item name')).toBeOnTheScreen();

const modal = screen.getByRole('dialog');
within(modal).getByRole('button', { name: 'Close' });
```

## renderHook

```tsx
import { renderHook } from '@testing-library/react-native';

const { result, rerender, unmount } = renderHook((props) => useCounter(props.initial), {
  initialProps: { initial: 0 },
  wrapper: AllProviders,
});

expect(result.current.count).toBe(0);

act(() => result.current.increment());
expect(result.current.count).toBe(1);

rerender({ initial: 10 });
unmount();
```

## act

```tsx
import { act } from '@testing-library/react-native';

// Sync
act(() => {
  store.dispatch(action());
});

// Async
await act(async () => {
  await fetchData();
});
```

## Testing Patterns

### Button press + navigation

```tsx
test('navigates to details on press', async () => {
  const user = userEvent.setup();
  render(<HomeScreen />);

  await user.press(screen.getByRole('button', { name: 'View Details' }));
  expect(mockRouter.push).toHaveBeenCalledWith('/details');
});
```

### Form submission

```tsx
test('submits form with valid data', async () => {
  const user = userEvent.setup();
  const onSubmit = jest.fn();
  render(<LoginForm onSubmit={onSubmit} />);

  await user.type(screen.getByPlaceholderText('Email'), 'test@example.com');
  await user.type(screen.getByPlaceholderText('Password'), 'password123');
  await user.press(screen.getByRole('button', { name: 'Login' }));

  expect(onSubmit).toHaveBeenCalledWith({
    email: 'test@example.com',
    password: 'password123',
  });
});
```

### Loading → content transition

```tsx
test('shows data after loading', async () => {
  render(<UserProfile userId="1" />);

  // Wait for loading to finish
  await waitForElementToBeRemoved(() => screen.getByText('Loading...'));

  expect(screen.getByRole('header', { name: 'John Doe' })).toBeOnTheScreen();
});
```

### List items

```tsx
test('renders all items', () => {
  render(<TodoList items={mockItems} />);

  const items = screen.getAllByRole('listitem');
  expect(items).toHaveLength(3);
  expect(within(items[0]).getByText('First task')).toBeOnTheScreen();
});
```

## Rules

- **Prefer `userEvent` over `fireEvent`** — more realistic, catches more bugs
- **Prefer `getByRole` > `getByText` > `getByLabelText` > `getByTestId`** — semantic queries first
- **Use `screen` instead of destructuring `render()`** — cleaner, matches web testing-library
- **Never use `toJSON()` snapshots as primary tests** — test behavior, not structure
- **`findBy*` for async** — don't wrap `getBy*` in `waitFor`, use `findBy*` directly
