---
description: State management guidelines — Zustand for client, TanStack Query for server
globs: "**/*.{ts,tsx}"
alwaysApply: false
---

# State Management

## Architecture

| State Type | Tool | When |
|-----------|------|------|
| **Client state** | Zustand | UI state, user preferences, app mode |
| **Server state** | TanStack Query | API data, caching, pagination, optimistic updates |
| **Form state** | React Hook Form | Complex forms with validation |
| **Ephemeral state** | useState | Component-local, non-shared |
| **Derived state** | useMemo | Computed from other state |

## Zustand Patterns

```tsx
// Store definition — one store per domain
interface AuthStore {
  user: User | null;
  token: string | null;
  setUser: (user: User) => void;
  logout: () => void;
}

const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: null,
  setUser: (user) => set({ user }),
  logout: () => set({ user: null, token: null }),
}));

// Usage — select only what you need
const userName = useAuthStore((s) => s.user?.name);
```

## TanStack Query Patterns

```tsx
// Query keys as constants
export const userKeys = {
  all: ['users'] as const,
  detail: (id: string) => ['users', id] as const,
  lists: () => ['users', 'list'] as const,
};

// Query hook
function useUser(id: string) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: () => api.getUser(id),
    staleTime: 5 * 60 * 1000,
  });
}

// Mutation with optimistic update
function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.updateUser,
    onMutate: async (updated) => {
      await queryClient.cancelQueries({ queryKey: userKeys.detail(updated.id) });
      const previous = queryClient.getQueryData(userKeys.detail(updated.id));
      queryClient.setQueryData(userKeys.detail(updated.id), updated);
      return { previous };
    },
    onError: (err, vars, context) => {
      queryClient.setQueryData(userKeys.detail(vars.id), context?.previous);
    },
    onSettled: (data, err, vars) => {
      queryClient.invalidateQueries({ queryKey: userKeys.detail(vars.id) });
    },
  });
}
```

## Rules
- Context API only for truly global, rarely-changing values (theme, locale)
- No prop drilling beyond 2 component levels
- Keep stores small and domain-focused
- Never store derived data — compute with `useMemo` or selectors
- Persist critical state with `zustand/middleware` persist
