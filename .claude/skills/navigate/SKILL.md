---
name: navigate
description: Design navigation architecture using the architect agent
---

# /navigate — Navigation Design

You are executing the `/navigate` command. Use the **architect** agent to design navigation structure.

## Process

1. **Map the screens** — List all screens and their relationships
2. **Design the hierarchy** — Determine navigation stacks, tabs, drawers
3. **Plan Expo Router file structure** — Map screens to file-based routes

## Output: Expo Router File Structure

```
app/
  _layout.tsx              # Root Stack
  index.tsx                # Redirect to (tabs)
  +not-found.tsx           # 404 screen
  (tabs)/
    _layout.tsx            # Tab navigator
    index.tsx              # Home tab
    search.tsx             # Search tab
    profile.tsx            # Profile tab
  (auth)/
    _layout.tsx            # Auth stack (no tabs)
    login.tsx
    register.tsx
    forgot-password.tsx
  [entity]/
    _layout.tsx            # Entity detail stack
    [id].tsx               # Entity detail screen
    [id]/edit.tsx           # Edit screen
  modal/
    _layout.tsx            # Modal group
    settings.tsx           # Settings modal
    create-post.tsx        # Create post modal
```

3. **Define navigation patterns**:
   - Tab-to-detail: How tabs navigate to detail screens
   - Auth flow: How unauthenticated users are redirected
   - Deep linking: URL scheme mapping
   - Modal presentation: Full-screen vs bottom sheet

4. **Generate layout files** — Create `_layout.tsx` files with proper configuration:

```tsx
// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#007AFF' }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ... }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: ... }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ... }} />
    </Tabs>
  );
}
```

## Notes
- Reference `rules/common/navigation.md` for conventions
- Consider deep link testing: `npx uri-scheme open [url] --ios`
- Include typed route definitions
