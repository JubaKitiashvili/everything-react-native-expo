---
name: erne-component
description: ERNE — Design and test UI components using parallel ui-designer and tdd-guide agents
---

# /erne-component — Design + Test Component

You are executing the `/erne-component` command. Run **ui-designer** and **tdd-guide** in parallel. One designs the component, the other writes tests.

## Parallel Execution

### Agent 1: ui-designer — Component Design

1. **Clarify requirements** — What does the component do? What states does it have?
2. **Design with NativeWind** — Use Tailwind classes for styling:

```tsx
import { View, Text, Pressable } from 'react-native';

interface CardProps {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  variant?: 'default' | 'outlined' | 'elevated';
}

export function Card({ title, subtitle, onPress, variant = 'default' }: CardProps) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'rounded-2xl p-4',
        variant === 'default' && 'bg-card',
        variant === 'outlined' && 'border border-border bg-transparent',
        variant === 'elevated' && 'bg-card shadow-md',
      )}
    >
      <Text className="text-lg font-semibold text-foreground">{title}</Text>
      {subtitle && (
        <Text className="mt-1 text-sm text-muted-foreground">{subtitle}</Text>
      )}
    </Pressable>
  );
}
```

3. **Handle all states** — Loading, error, empty, populated, disabled
4. **Add accessibility** — `accessibilityRole`, `accessibilityLabel`, `accessibilityState`
5. **Platform adaptation** — Use `Platform.select` or NativeWind responsive for platform differences
6. **Consider agent-device** — If available, render on simulator and screenshot for visual verification

### Agent 2: tdd-guide — Component Tests

Write comprehensive tests alongside the component:

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Card } from './Card';

describe('Card', () => {
  it('renders title', () => {
    render(<Card title="Test Title" />);
    expect(screen.getByText('Test Title')).toBeTruthy();
  });

  it('renders subtitle when provided', () => {
    render(<Card title="Title" subtitle="Subtitle" />);
    expect(screen.getByText('Subtitle')).toBeTruthy();
  });

  it('hides subtitle when not provided', () => {
    render(<Card title="Title" />);
    expect(screen.queryByText('Subtitle')).toBeNull();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    render(<Card title="Title" onPress={onPress} />);
    fireEvent.press(screen.getByText('Title'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('applies variant styles', () => {
    // Test each variant renders correctly
  });
});
```

## Output
- Component file with full implementation
- Test file with comprehensive coverage
- Usage examples
- Screenshot (if agent-device available)
