---
description: State management guidelines — Zustand for all client and simple server state
globs: "**/*.{ts,tsx}"
alwaysApply: false
---

# State Management

## Architecture

| State Type | Tool | When |
|-----------|------|------|
| **Client state** | Zustand | UI state, user preferences, app mode |
| **Server state** | Zustand + useEffect/fetch | API data fetched into stores |
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

## Server State with Zustand

When you do not use a dedicated server-state library, manage API data with Zustand stores and `useEffect` + `fetch` patterns.

```tsx
// Store with loading/error state
interface UsersStore {
  users: User[];
  isLoading: boolean;
  error: string | null;
  fetchUsers: () => Promise<void>;
  updateUser: (user: User) => Promise<void>;
}

const useUsersStore = create<UsersStore>((set, get) => ({
  users: [],
  isLoading: false,
  error: null,

  fetchUsers: async () => {
    set({ isLoading: true, error: null });
    try {
      const users = await api.getUsers();
      set({ users, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  updateUser: async (updated) => {
    // Optimistic update
    const previous = get().users;
    set({ users: previous.map((u) => (u.id === updated.id ? updated : u)) });
    try {
      await api.updateUser(updated);
    } catch {
      set({ users: previous }); // Rollback
    }
  },
}));
```

```tsx
// Fetching in a component
function UsersScreen() {
  const { users, isLoading, error, fetchUsers } = useUsersStore();

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorView message={error} onRetry={fetchUsers} />;

  return <UserList users={users} />;
}
```

## Custom Data Fetching Hook Pattern

```tsx
// Reusable hook wrapping Zustand + fetch
function useApiData<T>(
  fetchFn: () => Promise<T>,
  deps: unknown[] = [],
) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchFn();
      setData(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, deps);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, isLoading, error, refetch };
}
```

## Rules
- Context API only for truly global, rarely-changing values (theme, locale)
- No prop drilling beyond 2 component levels
- Keep stores small and domain-focused
- Never store derived data — compute with `useMemo` or selectors
- Persist critical state with `zustand/middleware` persist
- Always handle loading and error states when fetching data
- Use optimistic updates for better UX on mutations
- Implement retry logic for failed network requests
