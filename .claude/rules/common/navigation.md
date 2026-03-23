---
description: Expo Router navigation conventions and patterns (Router v6, SDK 54+)
globs: 'app/**/*.{ts,tsx}'
alwaysApply: false
---

# Navigation

## Expo Router File Conventions

- File-based routing in `app/` directory
- `_layout.tsx` for layout definitions (Stack, Tabs, Drawer)
- `[param].tsx` for dynamic routes
- `[...catchAll].tsx` for catch-all routes
- `+not-found.tsx` for 404 handling
- `(group)` parentheses for layout groups (no URL impact)

```
app/
  _layout.tsx          # Root layout (Stack)
  index.tsx            # / (home)
  (tabs)/
    _layout.tsx        # Tab layout
    home.tsx           # /home tab
    profile.tsx        # /profile tab
  (auth)/
    _layout.tsx        # Auth stack (no tabs)
    login.tsx          # /login
    register.tsx       # /register
  settings/
    _layout.tsx        # Settings stack
    index.tsx          # /settings
    [section].tsx      # /settings/notifications
```

## Typed Routes (Beta)

- Enable in `app.json`: `{ "expo": { "experiments": { "typedRoutes": true } } }`
- Expo CLI auto-generates `expo-env.d.ts` (git-ignored, do not delete)
- `<Link>`, hooks, and `router.*` calls become statically typed with autocomplete
- Define route params with `useLocalSearchParams<{ id: string }>()`
- Prefer `<Link>` component for declarative navigation

## Router API

```tsx
import { router } from 'expo-router';

router.push(href); // Push new screen
router.replace(href); // Replace current (no back)
router.navigate(href); // Smart navigate (no duplicates)
router.back(); // Go back one
router.dismiss(count); // Dismiss N screens from stack
router.dismissAll(); // Dismiss all, return to first
router.dismissTo(href); // Dismiss until href reached
router.canDismiss(); // Check if dismissable
router.canGoBack(); // Check if back is possible
router.setParams(params); // Update current route params
router.prefetch(href); // Prefetch screen in background
router.reload(); // Reload current route (RSC)
```

## Deep Linking

- Define scheme in `app.json` (`expo.scheme`)
- Map deep links to file routes automatically
- Validate incoming URLs before navigating
- Test deep links: `npx uri-scheme open [url] --ios/--android`

## Modal & Sheet Patterns

### Modals

- Use `presentation: 'modal'` in layout options
- Full-screen modals: separate route in layout group
- Programmatic dismissal: `router.dismiss()`, `router.dismissAll()`, `router.dismissTo(href)`
- Bottom sheets: `@gorhom/bottom-sheet` (not navigation)

### Form Sheets (iOS)

```tsx
// _layout.tsx
<Stack.Screen
  name="edit"
  options={{
    presentation: 'formSheet',
    sheetGrabberVisible: true,
    sheetAllowedDetents: [0.5, 0.75, 1.0], // half, 3/4, full screen
    sheetCornerRadius: 20,
  }}
/>
```

## React Server Components (Experimental)

- Enable server functions: `{ "expo": { "experiments": { "reactServerFunctions": true } } }`
- Full RSC mode: also add `"reactServerComponentRoutes": true`
- In RSC mode, routes default to server components — use `'use client'` for client components
- `router.reload()` re-fetches data for current RSC route

## API Routes

- Enable with `{ "web": { "output": "server" } }` in `app.json`
- Create server-side endpoints within your Expo Router project
- Useful for webhooks, emails, server-side logic without a separate backend

## Context Menus & Link Previews (iOS)

```tsx
import { Link } from 'expo-router';

// Context menu on long-press (iOS)
<Link href={`/item/${id}`} asChild>
  <Pressable>
    <Link.Trigger />
    <Link.Preview />
    <Link.Menu>
      <Link.MenuAction title="Share" systemIcon="square.and.arrow.up" />
      <Link.MenuAction title="Delete" systemIcon="trash" destructive />
    </Link.Menu>
    <Text>{item.name}</Text>
  </Pressable>
</Link>;
```

## NativeTabs (iOS 26 / SDK 55)

```tsx
// app/_layout.tsx
import { NativeTabs } from 'expo-router';

export default function Layout() {
  return (
    <NativeTabs>
      <NativeTabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: { sfSymbol: 'house' } }}
      />
      <NativeTabs.Screen
        name="search"
        options={{ title: 'Search', tabBarIcon: { sfSymbol: 'magnifyingglass' } }}
      />
      <NativeTabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: { sfSymbol: 'person' } }}
      />
    </NativeTabs>
  );
}
```

## Zoom Transitions (iOS 18+)

```tsx
// Apple-style zoom transition between list and detail
<Stack.Screen
  name="[id]"
  options={{
    animation: 'zoom',
  }}
/>
```

## Search Bar

```tsx
// Built-in search bar in header (iOS native)
import { useSearch } from 'expo-router';

function ListScreen() {
  const { query } = useSearch();

  return (
    <Stack.Screen
      options={{
        headerSearchBarOptions: {
          placeholder: 'Search items...',
        },
      }}
    />
  );
}
```

## Best Practices

- Keep navigation state minimal (pass IDs, not full objects)
- Use `router.prefetch(href)` for likely next screens
- Use `initialRouteName` for proper back navigation
- Handle "not found" routes gracefully
- **Android predictive back gesture** enabled by default (Android 16 / RN 0.81+)
- First child in Stack routes should be `<ScrollView contentInsetAdjustmentBehavior="automatic">` for proper iOS header integration
- Use `contentInsetAdjustmentBehavior="automatic"` on FlatList and SectionList too
- Use expo-haptics conditionally: `if (process.env.EXPO_OS === 'ios') Haptics.impactAsync()`
- Format large numbers in UI (e.g., `1,400,000` → `"1.4M"`)
