---
description: React Native architectural patterns and best practices
globs: "**/*.{ts,tsx}"
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
- **forwardRef** for imperative handles (scroll, focus)

## Data Fetching
- TanStack Query for all API calls
- Define query keys as constants (`['users', userId]`)
- Use `queryClient.prefetchQuery` for anticipated navigation
- Optimistic updates for user-initiated mutations
- Error boundaries per screen (not global)

## Error Handling
- Error boundaries at screen level (catch rendering crashes)
- Try/catch at API call level (handle network errors)
- Graceful degradation (offline placeholder, retry button)
- Report errors to monitoring (Sentry/Crashlytics)
- Never swallow errors silently
