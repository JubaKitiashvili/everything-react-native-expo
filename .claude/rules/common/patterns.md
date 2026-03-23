---
description: React Native architectural patterns and best practices (React 19, RN 0.84+)
globs: '**/*.{ts,tsx}'
alwaysApply: false
---

# Patterns

## State Management

- **Client state**: Prefer Zustand for new projects. Redux Toolkit is supported for existing projects or complex state requirements.
- **Server state**: TanStack Query (React Query) — handles caching, refetching, optimistic updates
- **Form state**: React Hook Form or controlled components (small forms)
- Avoid prop drilling beyond 2 levels — use Zustand store or composition

```tsx
// GOOD: Zustand store
const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  logout: () => set({ user: null }),
}));

// BAD: Deep prop drilling
<App user={user}>
  <Layout user={user}>
    <Header user={user}>
      <Avatar user={user} />
```

## React 19 Patterns

- **`use()` hook**: Read promises and context directly — replaces `useContext()` and many `useEffect` + `useState` patterns. **Prefer `React.use(MyContext)` over `React.useContext(MyContext)`**
- **Actions**: `useActionState` for form submissions with pending/error states
- **`useOptimistic`**: Built-in optimistic UI without TanStack Query boilerplate
- **ref as prop**: Pass refs directly as props — `forwardRef` is no longer needed
- **`<Activity>`** (React 19.2+): Show/hide components while preserving their state

```tsx
// React 19: ref as prop (no forwardRef needed)
function TextInput({ ref, ...props }: { ref?: React.Ref<TextInput> }) {
  return <RNTextInput ref={ref} {...props} />;
}

// React 19: use() for async data
function UserProfile({ userPromise }: { userPromise: Promise<User> }) {
  const user = use(userPromise);
  return <Text>{user.name}</Text>;
}

// React 19: use() replaces useContext
function ThemedButton() {
  const theme = use(ThemeContext); // prefer over useContext(ThemeContext)
  return <Pressable style={{ backgroundColor: theme.primary }} />;
}

// React 19: useActionState for forms
function LoginForm() {
  const [state, submitAction, isPending] = useActionState(loginAction, null);
  return (
    <form action={submitAction}>
      {isPending && <ActivityIndicator />}
      {state?.error && <Text>{state.error}</Text>}
    </form>
  );
}
```

## Component Patterns

- **Compound components** for complex UI (Header + Body + Footer)
- **Custom hooks** for shared logic (extract `useAuth`, `useTheme`)
- **Colocation**: keep feature files together

```
features/
  auth/
    LoginScreen.tsx
    useAuth.ts
    auth.store.ts
    auth.test.tsx
```

- **Render props / children** for flexible containers
- **ref as prop** for imperative handles (scroll, focus) — `forwardRef` is deprecated in React 19

## Data Fetching

- TanStack Query for all API calls
- Define query keys as constants (`['users', userId]`)
- Use `queryClient.prefetchQuery` for anticipated navigation
- Optimistic updates for user-initiated mutations
- Error boundaries per screen (not global)
- Consider `use()` hook for simple async data in React 19 Suspense boundaries

## Removed APIs

- **`setImmediate`** polyfill removed in SDK 53 — use `setTimeout(fn, 0)` or `queueMicrotask(fn)` instead
- **`react-native init`** removed in RN 0.77 — use `npx create-expo-app` or `npx @react-native-community/cli init`

## Error Handling

- Error boundaries at screen level (catch rendering crashes)
- Try/catch at API call level (handle network errors)
- Graceful degradation (offline placeholder, retry button)
- Report errors to monitoring (Sentry/Crashlytics)
- Never swallow errors silently
