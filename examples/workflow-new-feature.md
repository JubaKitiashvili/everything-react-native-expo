# Workflow: Build a New Feature End-to-End

> Example: Building a "User Profile Screen" from idea to production-ready code.

## Overview

This workflow uses 6 ERNE agents in sequence and parallel to go from a feature request to reviewed, tested, performant code.

**Agents involved:**
- architect -- feature decomposition, API design, component tree, navigation
- senior-developer -- data layer, stores, navigation skeleton
- feature-builder -- individual screens, components, hooks
- tdd-guide -- test-first coverage for all new code
- code-reviewer -- evidence-based review with blocking/non-blocking findings
- performance-profiler -- FPS, TTI, bundle size, memory validation

---

## Step 1: Kick Off with `/plan`

```
/plan Build a user profile screen that shows avatar, bio, stats (posts, followers, following), and an edit button. Accessible via tab navigation and deep link /profile/:userId.
```

### architect Responds

The architect agent analyzes the request and produces a structured architecture plan:

```markdown
# Architecture: User Profile Screen

## Overview
A profile screen accessible from the main tab navigator and via deep link,
displaying user data fetched from the /users/:id API endpoint.

## File Structure
features/profile/
  screens/ProfileScreen.tsx
  components/ProfileHeader.tsx
  components/ProfileStats.tsx
  components/ProfileActions.tsx
  hooks/useUser.ts
  hooks/useUserStats.ts
  api/profileApi.ts
  types/profile.ts
  __tests__/ProfileScreen.test.tsx
  __tests__/useUser.test.ts

## Component Design
ProfileScreen (screen)
  ProfileHeader (avatar, name, bio)
  ProfileStats (posts, followers, following -- tappable)
  ProfileActions (edit profile, share, settings)

## Data Flow
- Server state: TanStack Query useQuery for /users/:id
- Client state: None required (no local-only state beyond server cache)
- Cache: staleTime 5 min, gcTime 30 min

## Navigation
- Route: app/(tabs)/profile/[userId].tsx
- Deep link: myapp://profile/:userId
- Params: { userId: string }

## Implementation Tasks
1. Define types (User, UserStats) in features/profile/types/profile.ts
2. Implement profileApi.ts with getUser() and getUserStats()
3. Create useUser and useUserStats hooks with TanStack Query
4. Build ProfileHeader, ProfileStats, ProfileActions components
5. Assemble ProfileScreen with loading/error/empty states
6. Add route file and deep link config
7. Write tests for hooks and screen
```

**Handoff:** architect passes the architecture plan to senior-developer and feature-builder.

---

## Step 2: Parallel Implementation

senior-developer and feature-builder work simultaneously on different parts of the feature, coordinated by shared type definitions.

### senior-developer Takes: Data Layer + Navigation

```
Implementing: types, API client, hooks, route configuration, deep link handler
```

senior-developer produces:

```typescript
// features/profile/types/profile.ts
export interface User {
  id: string;
  name: string;
  avatarUrl: string;
  bio: string;
  stats: UserStats;
}

export interface UserStats {
  posts: number;
  followers: number;
  following: number;
}
```

```typescript
// features/profile/hooks/useUser.ts
import { useQuery } from '@tanstack/react-query';
import { profileApi } from '../api/profileApi';

export const useUser = (userId: string) => {
  return useQuery({
    queryKey: ['user', userId],
    queryFn: () => profileApi.getUser(userId),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
};
```

```typescript
// app/(tabs)/profile/[userId].tsx -- route file
import { ProfileScreen } from '@/features/profile/screens/ProfileScreen';
export { ProfileScreen as default };
```

### feature-builder Takes: UI Components

```
Implementing: ProfileHeader, ProfileStats, ProfileActions, ProfileScreen assembly
```

feature-builder produces each component as a self-contained unit:

```typescript
// features/profile/components/ProfileHeader.tsx
import { View, Text, Image } from 'react-native';
import { styles } from './ProfileHeader.styles';
import type { User } from '../types/profile';

interface ProfileHeaderProps {
  user: User;
}

export const ProfileHeader = ({ user }: ProfileHeaderProps) => {
  return (
    <View style={styles.container} accessibilityRole="header">
      <Image
        source={{ uri: user.avatarUrl }}
        style={styles.avatar}
        accessibilityLabel={`${user.name}'s profile photo`}
      />
      <Text style={styles.name}>{user.name}</Text>
      <Text style={styles.bio}>{user.bio}</Text>
    </View>
  );
};
```

**Handoff:** Both agents deliver completed files. feature-builder lists integration points for each component. senior-developer confirms the data layer is wired.

---

## Step 3: tdd-guide Writes Tests

```
/tdd features/profile
```

tdd-guide writes tests covering behavior, not implementation:

```typescript
// features/profile/__tests__/ProfileScreen.test.tsx
import { render, screen } from '@testing-library/react-native';
import { ProfileScreen } from '../screens/ProfileScreen';

// Mock the hooks at the boundary
jest.mock('../hooks/useUser');

describe('ProfileScreen', () => {
  it('shows loading skeleton while fetching', () => {
    mockUseUser({ isLoading: true, data: undefined });
    render(<ProfileScreen />);
    expect(screen.getByTestId('loading-skeleton')).toBeVisible();
  });

  it('shows user name and bio when loaded', () => {
    mockUseUser({ isLoading: false, data: mockUser });
    render(<ProfileScreen />);
    expect(screen.getByText('Jane Doe')).toBeVisible();
    expect(screen.getByText('React Native developer')).toBeVisible();
  });

  it('shows error state with retry button on failure', () => {
    mockUseUser({ isLoading: false, error: new Error('Network error') });
    render(<ProfileScreen />);
    expect(screen.getByText('Something went wrong')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  it('shows empty state when user not found', () => {
    mockUseUser({ isLoading: false, data: null });
    render(<ProfileScreen />);
    expect(screen.getByText('User not found')).toBeVisible();
  });
});
```

```typescript
// features/profile/__tests__/useUser.test.ts
import { renderHook, waitFor } from '@testing-library/react-native';
import { useUser } from '../hooks/useUser';

describe('useUser', () => {
  it('fetches user data by ID', async () => {
    const { result } = renderHook(() => useUser('user-123'), {
      wrapper: QueryWrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.name).toBe('Jane Doe');
  });

  it('does not fetch when userId is empty', () => {
    const { result } = renderHook(() => useUser(''), {
      wrapper: QueryWrapper,
    });

    expect(result.current.isFetching).toBe(false);
  });
});
```

**Handoff:** tdd-guide confirms all tests pass (green) and reports coverage: 87% lines, 78% branches.

---

## Step 4: code-reviewer Reviews with Evidence

```
/code-review features/profile
```

code-reviewer performs a full review against its checklist:

```markdown
## Code Review: features/profile

### Critical (must fix)
- [ ] ProfileScreen.tsx:24 — Deep link param `userId` is not validated.
  A malicious deep link could pass script content. Add: `if (!/^[a-zA-Z0-9-]+$/.test(userId)) return <ErrorView />;`

### Warning (should fix)
- [ ] ProfileHeader.tsx:18 — Avatar Image missing `onError` fallback.
  If the URL 404s, the user sees a broken image. Add a placeholder fallback.
- [ ] ProfileStats.tsx:12 — Numbers are not formatted for locale.
  10000 followers should display as "10,000". Use `Intl.NumberFormat`.

### Suggestion (nice to have)
- [ ] ProfileScreen.tsx — Consider adding pull-to-refresh via `refetch` from useUser.
- [ ] ProfileActions.tsx:8 — Share button could use `expo-haptics` for tactile feedback.

### Positive
- ProfileHeader.tsx — Excellent accessibility: proper `accessibilityRole="header"` and image alt text.
- useUser.ts — Clean hook with proper `enabled` guard and reasonable staleTime.

### Evidence Checklist
- [x] All existing tests pass
- [x] New code has test coverage (87% lines)
- [ ] iOS + Android screenshots (pending)
- [ ] Performance impact measured (pending -- defer to performance-profiler)
```

**Handoff:** senior-developer and feature-builder address the critical and warning findings. code-reviewer re-reviews the fixes.

---

## Step 5: performance-profiler Validates

```
/perf features/profile
```

performance-profiler measures actual performance:

```markdown
## Performance Report: User Profile Screen

### Metrics
| Metric              | Current | Target | Status |
|---------------------|---------|--------|--------|
| JS FPS (scroll)     | 58      | >55    | PASS   |
| TTI (cold navigate) | 1.2s    | <3s    | PASS   |
| Bundle impact       | 38KB    | <50KB  | PASS   |
| Memory delta        | 8MB     | <20MB  | PASS   |
| Re-renders (load)   | 2       | <5     | PASS   |

### Optimization Opportunities
1. Avatar image — Switch to `expo-image` for better caching and progressive loading.
   Expected improvement: ~200ms faster image display on slow networks.

2. ProfileStats numbers — The `Intl.NumberFormat` constructor is called on every render.
   Memoize with `useMemo` to avoid repeated object creation.

### Recommended Actions (priority order)
1. Replace `<Image>` with `<Image>` from `expo-image` for the avatar
2. Wrap `Intl.NumberFormat` calls in `useMemo`
```

**Handoff:** feature-builder applies the two optimizations. performance-profiler confirms metrics remain green.

---

## Final State

| Step | Agent | Status |
|------|-------|--------|
| Architecture | architect | Complete |
| Data layer + navigation | senior-developer | Complete |
| UI components | feature-builder | Complete |
| Tests | tdd-guide | 87% coverage, all green |
| Review | code-reviewer | Approved (all findings addressed) |
| Performance | performance-profiler | All metrics passing |

The feature is ready for PR and merge.

---

## Commands Used

| Command | What It Triggered |
|---------|-------------------|
| `/plan` | architect decomposition |
| `/tdd` | tdd-guide test-first workflow |
| `/code-review` | code-reviewer + performance-profiler |
| `/perf` | performance-profiler deep analysis |
