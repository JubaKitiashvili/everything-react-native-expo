---
description: NativeWind v5 (Tailwind CSS) styling conventions for React Native
globs: "**/*.{ts,tsx}"
alwaysApply: false
---

# Styling

## NativeWind v5 (Tailwind CSS v4 for React Native)

Use `className` prop with Tailwind utility classes for all styling.

```tsx
import { View, Text, Pressable } from 'react-native';

export function Card({ title, children }: CardProps) {
  return (
    <View className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm">
      <Text className="text-lg font-semibold text-gray-900 dark:text-white">
        {title}
      </Text>
      {children}
    </View>
  );
}
```

## Dark Mode

Use the `dark:` prefix for dark mode variants. NativeWind automatically tracks `useColorScheme`.

```tsx
<View className="bg-white dark:bg-gray-900">
  <Text className="text-gray-900 dark:text-gray-100">Hello</Text>
  <View className="border border-gray-200 dark:border-gray-700" />
</View>
```

## Responsive Design

Use Tailwind breakpoints for responsive layouts.

```tsx
<View className="flex-col md:flex-row gap-4">
  <View className="w-full md:w-1/2">
    <Text className="text-base md:text-lg">Responsive content</Text>
  </View>
</View>
```

## Platform-Specific Styles

```tsx
<View className="ios:pt-12 android:pt-8">
  <Text className="ios:font-sf android:font-roboto">Platform text</Text>
</View>
```

## Common Patterns

### Spacing and Layout
```tsx
// Flex layouts
<View className="flex-1 items-center justify-center">
<View className="flex-row gap-2">
<View className="absolute top-0 right-0">

// Padding and margin
<View className="p-4 mx-2 mb-6">
<View className="px-4 py-2">
```

### Typography
```tsx
<Text className="text-2xl font-bold tracking-tight">Heading</Text>
<Text className="text-base text-gray-600 dark:text-gray-400 leading-6">Body</Text>
<Text className="text-sm font-medium text-blue-500">Link</Text>
```

### Interactive Elements
```tsx
<Pressable className="bg-blue-500 active:bg-blue-600 rounded-xl px-6 py-3">
  <Text className="text-white font-semibold text-center">Button</Text>
</Pressable>
```

### Safe Area
```tsx
import { SafeAreaView } from 'react-native-safe-area-context';

<SafeAreaView className="flex-1 bg-white dark:bg-gray-900">
  {/* screen content */}
</SafeAreaView>
```

## Custom Theme Configuration

Define custom tokens in `tailwind.config.ts`:

```ts
// tailwind.config.ts
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          500: '#3b82f6',
          900: '#1e3a8a',
        },
      },
      spacing: {
        18: '4.5rem',
      },
    },
  },
  plugins: [],
};
```

## Rules
- Use `className` for all styling — no `StyleSheet.create` or inline styles
- Use `dark:` prefix for dark mode — never toggle classes manually
- Use Tailwind spacing scale for consistency (p-4, m-2, gap-3)
- Group related utilities logically in the className string
- Extract repeated class patterns into reusable components (not utility strings)
- Use platform prefixes (`ios:`, `android:`) for platform-specific styles
- Avoid arbitrary values (`[32px]`) — extend theme config instead
