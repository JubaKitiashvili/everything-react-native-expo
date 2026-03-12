# Workflow: Adding a New Screen with Navigation

> Example: Adding a "Settings" screen to the main tab navigator with nested sub-screens.

## Overview

This workflow walks through adding a new screen to an existing navigation hierarchy, from route design through implementation, testing, and review.

**Agents involved:**
- architect -- screen placement in navigation hierarchy, route params, deep links
- ui-designer -- layout, accessibility, platform-specific styling
- feature-builder -- screen implementation
- tdd-guide -- screen and navigation tests
- code-reviewer -- final review

---

## Step 1: architect Defines Screen Placement

```
/navigate Add a Settings screen to the main tab bar. It should have sub-screens:
  - Profile Settings (edit name, avatar, bio)
  - Notification Preferences (push, email, in-app toggles)
  - App Info (version, licenses, support link)
Deep link: myapp://settings and myapp://settings/notifications
```

architect responds with the navigation design:

```markdown
# Navigation: Settings Screen

## Route Structure

app/
  (tabs)/
    settings/
      _layout.tsx          # Stack navigator for settings sub-screens
      index.tsx            # Settings main menu
      profile.tsx          # Profile settings
      notifications.tsx    # Notification preferences
      app-info.tsx         # App info / about

## Tab Configuration

Add to app/(tabs)/_layout.tsx:
- Tab name: "Settings"
- Icon: Ionicons "settings-outline" / "settings"
- Position: last tab (rightmost)

## Route Params

| Route                       | Params          | Deep Link                    |
|-----------------------------|-----------------|------------------------------|
| /(tabs)/settings            | none            | myapp://settings             |
| /(tabs)/settings/profile    | none            | myapp://settings/profile     |
| /(tabs)/settings/notifications | none         | myapp://settings/notifications |
| /(tabs)/settings/app-info   | none            | myapp://settings/app-info    |

## Navigation Behavior
- Settings tab uses a nested Stack navigator
- Back button on sub-screens returns to settings index
- Deep links open the correct sub-screen directly
- Tab press while on sub-screen pops to settings index (standard iOS/Android behavior)

## Data Requirements
- Profile settings: read/write user profile (existing useUser hook + mutation)
- Notifications: read/write notification preferences (new API endpoint needed)
- App info: static data from expo-constants + app.json

## Implementation Tasks
1. Create settings _layout.tsx with Stack navigator
2. Create settings index screen (menu with navigation links)
3. Create profile settings screen
4. Create notifications screen
5. Create app-info screen
6. Add settings tab to (tabs)/_layout.tsx
7. Configure deep links in app.json scheme
```

**Handoff:** architect passes the navigation plan to ui-designer for layout design.

---

## Step 2: ui-designer Creates Layout and Accessibility

ui-designer designs each screen with platform conventions and accessibility:

```markdown
## UI Design: Settings Screens

### Settings Index (Menu)

Layout: ScrollView with grouped sections (iOS-style grouped list)

| Section        | Items                                        |
|----------------|----------------------------------------------|
| Account        | Profile Settings (chevron right)             |
| Preferences    | Notification Preferences (chevron right)     |
| About          | App Info (chevron right), Version (subtitle)  |
| Actions        | Sign Out (destructive, red text)             |

Platform differences:
- iOS: Grouped inset style with rounded corners (like native Settings app)
- Android: Material-style list with dividers

### Accessibility Requirements
- Every menu item: accessibilityRole="button", accessibilityHint="Opens [section] settings"
- Sign Out button: accessibilityRole="button", accessibilityHint="Signs you out of the app"
- Section headers: accessibilityRole="header"
- Screen reader order follows visual top-to-bottom order
```

```typescript
// Settings menu item component
interface SettingsMenuItemProps {
  label: string;
  icon: string;
  onPress: () => void;
  variant?: 'default' | 'destructive';
  subtitle?: string;
}

export const SettingsMenuItem = ({
  label,
  icon,
  onPress,
  variant = 'default',
  subtitle,
}: SettingsMenuItemProps) => {
  return (
    <Pressable
      onPress={onPress}
      style={styles.menuItem}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={`Opens ${label}`}
    >
      <Ionicons name={icon} size={22} style={styles.icon} />
      <View style={styles.labelContainer}>
        <Text style={[
          styles.label,
          variant === 'destructive' && styles.destructive,
        ]}>
          {label}
        </Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {variant !== 'destructive' && (
        <Ionicons name="chevron-forward" size={18} style={styles.chevron} />
      )}
    </Pressable>
  );
};
```

```markdown
### Notification Preferences Screen

Layout: ScrollView with toggle switches

| Setting            | Control    | Default |
|--------------------|------------|---------|
| Push Notifications | Switch     | ON      |
| Email Digest       | Switch     | OFF     |
| In-App Alerts      | Switch     | ON      |
| Marketing Emails   | Switch     | OFF     |

Accessibility:
- Each toggle: accessibilityRole="switch", accessibilityState={{ checked: value }}
- Labels are programmatically associated with their switches
- Changes auto-save (no save button) with haptic feedback on toggle
```

**Handoff:** ui-designer passes designs with component specs to feature-builder.

---

## Step 3: feature-builder Implements

feature-builder builds each file as a discrete unit:

### 3a: Settings Stack Layout

```typescript
// app/(tabs)/settings/_layout.tsx
import { Stack } from 'expo-router';

export const SettingsLayout = () => {
  return (
    <Stack
      screenOptions={{
        headerBackTitle: 'Settings',
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="profile" options={{ title: 'Profile Settings' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="app-info" options={{ title: 'About' }} />
    </Stack>
  );
};

export default SettingsLayout;
```

### 3b: Settings Index Screen

```typescript
// app/(tabs)/settings/index.tsx
import { ScrollView, View, Text } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { SettingsMenuItem } from '@/features/settings/components/SettingsMenuItem';
import { useAuthStore } from '@/stores/authStore';
import { styles } from './settings.styles';

export const SettingsScreen = () => {
  const logout = useAuthStore((s) => s.logout);

  const handleSignOut = () => {
    logout();
    router.replace('/login');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section} accessibilityRole="header">
        <Text style={styles.sectionHeader}>Account</Text>
        <SettingsMenuItem
          label="Profile Settings"
          icon="person-outline"
          onPress={() => router.push('/settings/profile')}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionHeader} accessibilityRole="header">
          Preferences
        </Text>
        <SettingsMenuItem
          label="Notification Preferences"
          icon="notifications-outline"
          onPress={() => router.push('/settings/notifications')}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionHeader} accessibilityRole="header">
          About
        </Text>
        <SettingsMenuItem
          label="App Info"
          icon="information-circle-outline"
          onPress={() => router.push('/settings/app-info')}
          subtitle={`v${Constants.expoConfig?.version ?? '0.0.0'}`}
        />
      </View>

      <View style={styles.section}>
        <SettingsMenuItem
          label="Sign Out"
          icon="log-out-outline"
          onPress={handleSignOut}
          variant="destructive"
        />
      </View>
    </ScrollView>
  );
};

export default SettingsScreen;
```

### 3c: Tab Configuration Update

```typescript
// Addition to app/(tabs)/_layout.tsx
<Tabs.Screen
  name="settings"
  options={{
    title: 'Settings',
    headerShown: false,
    tabBarIcon: ({ color, focused }) => (
      <Ionicons
        name={focused ? 'settings' : 'settings-outline'}
        size={24}
        color={color}
      />
    ),
  }}
/>
```

**Handoff:** feature-builder delivers all files with integration notes. Passes to tdd-guide.

---

## Step 4: tdd-guide Writes Screen Tests

```
/tdd features/settings app/(tabs)/settings
```

tdd-guide writes tests focused on user behavior:

```typescript
// features/settings/__tests__/SettingsScreen.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SettingsScreen } from '../../../app/(tabs)/settings/index';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

describe('SettingsScreen', () => {
  it('renders all menu sections', () => {
    render(<SettingsScreen />);

    expect(screen.getByText('Profile Settings')).toBeVisible();
    expect(screen.getByText('Notification Preferences')).toBeVisible();
    expect(screen.getByText('App Info')).toBeVisible();
    expect(screen.getByText('Sign Out')).toBeVisible();
  });

  it('navigates to profile settings on press', () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByText('Profile Settings'));
    expect(router.push).toHaveBeenCalledWith('/settings/profile');
  });

  it('navigates to notifications on press', () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByText('Notification Preferences'));
    expect(router.push).toHaveBeenCalledWith('/settings/notifications');
  });

  it('signs out and redirects to login', () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByText('Sign Out'));
    expect(router.replace).toHaveBeenCalledWith('/login');
  });

  it('displays app version in App Info subtitle', () => {
    render(<SettingsScreen />);
    expect(screen.getByText(/^v\d+\.\d+\.\d+$/)).toBeVisible();
  });
});
```

```typescript
// features/settings/__tests__/NotificationsScreen.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { NotificationsScreen } from '../../../app/(tabs)/settings/notifications';

describe('NotificationsScreen', () => {
  it('renders all notification toggles', () => {
    render(<NotificationsScreen />);

    expect(screen.getByText('Push Notifications')).toBeVisible();
    expect(screen.getByText('Email Digest')).toBeVisible();
    expect(screen.getByText('In-App Alerts')).toBeVisible();
  });

  it('toggles push notifications', () => {
    render(<NotificationsScreen />);
    const toggle = screen.getByRole('switch', { name: 'Push Notifications' });

    expect(toggle.props.value).toBe(true);  // default on
    fireEvent(toggle, 'valueChange', false);
    expect(toggle.props.value).toBe(false);
  });

  it('all toggles have proper accessibility roles', () => {
    render(<NotificationsScreen />);
    const switches = screen.getAllByRole('switch');
    expect(switches.length).toBeGreaterThanOrEqual(3);
  });
});
```

tdd-guide reports: **18 tests, all passing. Coverage: 91% lines, 80% branches.**

---

## Step 5: code-reviewer Reviews

```
/code-review app/(tabs)/settings features/settings
```

code-reviewer performs the full review:

```markdown
## Code Review: Settings Screen + Navigation

### Critical (must fix)
(none)

### Warning (should fix)
- [ ] settings/index.tsx:28 — `handleSignOut` should confirm before signing out.
  Users can accidentally tap Sign Out. Add an Alert.alert confirmation dialog.
- [ ] settings/notifications.tsx — Missing error handling for failed preference save.
  If the API call fails, the toggle will show the wrong state. Add optimistic update
  rollback.

### Suggestion (nice to have)
- [ ] SettingsMenuItem.tsx — Consider adding `expo-haptics` impact feedback on press
  for a more native feel.
- [ ] settings/_layout.tsx — Consider adding `headerLargeTitle: true` on iOS for the
  index screen to match the native Settings app style.

### Positive
- SettingsMenuItem component has excellent accessibility with proper role, label, and hint.
- Navigation structure follows Expo Router file-based conventions perfectly.
- Clean separation: no business logic in route files, delegated to stores and hooks.

### Evidence Checklist
- [x] All tests pass (18/18)
- [x] New code has test coverage (91%)
- [x] Accessibility audit passed (all interactive elements labeled)
- [ ] iOS + Android visual verification (manual step)
```

feature-builder addresses the warning items. code-reviewer approves.

---

## Final State

| Step | Agent | Deliverable |
|------|-------|-------------|
| Navigation design | architect | Route structure, params, deep links |
| UI/UX layout | ui-designer | Component designs, accessibility spec |
| Implementation | feature-builder | 6 new files, 1 modified layout |
| Tests | tdd-guide | 18 tests, 91% coverage |
| Review | code-reviewer | Approved |

The new screen is ready for PR and merge.

---

## Commands Used

| Command | What It Triggered |
|---------|-------------------|
| `/navigate` | architect navigation design |
| `/component` | ui-designer layout + tdd-guide tests |
| `/code-review` | code-reviewer full review |
