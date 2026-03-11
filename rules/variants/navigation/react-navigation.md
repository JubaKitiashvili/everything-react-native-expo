---
description: React Navigation v6/v7 navigation conventions and patterns
globs: "**/*.{ts,tsx}"
alwaysApply: false
---

# Navigation

## React Navigation Setup

```tsx
// App.tsx — Navigation container
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

// Define param types for all navigators
type RootStackParamList = {
  Main: undefined;
  Auth: undefined;
  Settings: undefined;
  UserDetail: { userId: string };
  Modal: { title: string };
};

type TabParamList = {
  Home: undefined;
  Profile: undefined;
  Search: { query?: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();
```

## Navigator Structure

```tsx
// Tab navigator
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#007AFF',
        headerShown: false,
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
      <Tab.Screen name="Search" component={SearchScreen} />
    </Tab.Navigator>
  );
}

// Root stack
function RootNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Main"
        component={MainTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="UserDetail" component={UserDetailScreen} />
      <Stack.Screen
        name="Modal"
        component={ModalScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Group screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Auth" component={AuthNavigator} />
      </Stack.Group>
    </Stack.Navigator>
  );
}

export function App() {
  return (
    <NavigationContainer>
      <RootNavigator />
    </NavigationContainer>
  );
}
```

## Typed Navigation Hook

```tsx
// navigation/types.ts
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

export type RootStackNavigationProp = NativeStackNavigationProp<RootStackParamList>;

// Typed useNavigation hook
import { useNavigation } from '@react-navigation/native';

export const useAppNavigation = () =>
  useNavigation<RootStackNavigationProp>();

// Usage in components
function UserCard({ userId }: { userId: string }) {
  const navigation = useAppNavigation();

  const handlePress = useCallback(() => {
    navigation.navigate('UserDetail', { userId });
  }, [navigation, userId]);

  return <Pressable onPress={handlePress}>...</Pressable>;
}
```

## Route Params

```tsx
// Reading typed params
import { useRoute, RouteProp } from '@react-navigation/native';

type UserDetailRouteProp = RouteProp<RootStackParamList, 'UserDetail'>;

function UserDetailScreen() {
  const route = useRoute<UserDetailRouteProp>();
  const { userId } = route.params;
  // ...
}
```

## Deep Linking

```tsx
// navigation/linking.ts
import { LinkingOptions } from '@react-navigation/native';

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['myapp://', 'https://myapp.com'],
  config: {
    screens: {
      Main: {
        screens: {
          Home: 'home',
          Profile: 'profile',
          Search: 'search',
        },
      },
      UserDetail: 'user/:userId',
      Auth: 'auth',
    },
  },
};

// In App.tsx
<NavigationContainer linking={linking} fallback={<LoadingScreen />}>
  <RootNavigator />
</NavigationContainer>
```

## Modal Patterns
- Use `presentation: 'modal'` in screen options
- Full-screen modals: `presentation: 'fullScreenModal'`
- Bottom sheets: `@gorhom/bottom-sheet` (not navigation)
- Transparent modals: `presentation: 'transparentModal'`

## Best Practices
- Keep navigation state minimal (pass IDs, not full objects)
- Type all navigator param lists — no untyped `navigate()` calls
- Use `useAppNavigation()` typed hook everywhere (not raw `useNavigation`)
- Prefetch data for likely next screens
- Use `initialRouteName` for proper back navigation
- Handle deep links with validation before navigating
- Use `navigation.setOptions()` for dynamic headers
- Reset navigation stack on logout: `navigation.reset({ index: 0, routes: [...] })`
