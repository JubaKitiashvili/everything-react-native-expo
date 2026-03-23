---
description: Voltra — iOS Live Activities, Dynamic Island, home screen widgets as React components
globs: '**/*.{ts,tsx}'
alwaysApply: false
---

# Voltra (Live Activities & Widgets)

Build iOS Live Activities, Dynamic Island, and home screen widgets with JSX. Compiles to SwiftUI. Android widgets via Jetpack Compose Glance.

## Setup

```bash
npm install voltra
```

```json
// app.json
{
  "expo": {
    "plugins": [
      [
        "voltra",
        {
          "groupIdentifier": "group.com.myapp",
          "enablePushNotifications": true
        }
      ]
    ]
  }
}
```

```bash
npx expo prebuild --clean
```

**Requires Expo Dev Client** (not Expo Go).

## Voltra Components

```tsx
import { Voltra } from 'voltra';

// Layout
<Voltra.VStack spacing={8} alignment="leading">
<Voltra.HStack spacing={4}>
<Voltra.ZStack>
<Voltra.Spacer minLength={10} />
<Voltra.Divider />

// Text & Images
<Voltra.Text style={{ fontSize: 16, fontWeight: 'bold', color: 'white' }}>Hello</Voltra.Text>
<Voltra.Image source={{ assetName: 'logo' }} />          // Xcode asset catalog
<Voltra.Image source={{ base64: '...' }} />               // base64 data
<Voltra.Symbol name="heart.fill" type="hierarchical" size={24} tintColor="red" />  // SF Symbol

// Interactive
<Voltra.Button id="action-btn" buttonStyle="borderedProminent">
  <Voltra.Text>Tap me</Voltra.Text>
</Voltra.Button>
<Voltra.Toggle id="toggle-1" defaultValue={false} />
<Voltra.Link destination="myapp://settings"><Voltra.Text>Open</Voltra.Text></Voltra.Link>

// Progress & Data
<Voltra.LinearProgressView value={0.6} progressColor="green" trackColor="gray" height={8} />
<Voltra.CircularProgressView value={0.75} progressColor="blue" lineWidth={4} />
<Voltra.Gauge value={72} minimumValue={0} maximumValue={100} gaugeStyle="accessoryCircular" />
<Voltra.Timer endAtMs={Date.now() + 60000} direction="down" />  // auto-updates natively

// Effects
<Voltra.LinearGradient colors="red|blue" startPoint="leading" endPoint="trailing" />
<Voltra.GlassContainer />  // iOS 26+ Liquid Glass
<Voltra.Mask maskElement={<Voltra.Symbol name="star.fill" />}>{children}</Voltra.Mask>
```

## Live Activities

```tsx
import { useLiveActivity } from 'voltra/client';

const { start, update, end, isActive } = useLiveActivity(
  {
    lockScreen: {
      content: (
        <Voltra.VStack>
          <Voltra.Text style={{ fontSize: 18 }}>Delivery in progress</Voltra.Text>
          <Voltra.LinearProgressView value={0.6} />
        </Voltra.VStack>
      ),
      activityBackgroundTint: '#1E1E1E',
    },
    island: {
      expanded: {
        leading: <Voltra.Symbol name="box.truck" size={32} />,
        center: <Voltra.Text>ETA: 5 min</Voltra.Text>,
        trailing: <Voltra.Timer endAtMs={eta} direction="down" />,
        bottom: <Voltra.LinearProgressView value={progress} />,
      },
      compact: {
        leading: <Voltra.Symbol name="box.truck" size={16} />,
        trailing: <Voltra.Text>5m</Voltra.Text>,
      },
      minimal: <Voltra.Symbol name="box.truck" size={12} />,
    },
  },
  {
    activityName: 'delivery-tracker',
    autoStart: true,
    autoUpdate: true,
    deepLinkUrl: '/delivery/123',
  },
);
```

## Home Screen Widgets

```tsx
import { updateWidget, scheduleWidget } from 'voltra/client';

// Immediate update
await updateWidget(
  'weather',
  {
    systemSmall: <Voltra.Text style={{ fontSize: 32 }}>72°</Voltra.Text>,
    systemMedium: (
      <Voltra.HStack>
        <Voltra.Text>72°</Voltra.Text>
        <Voltra.Text>Sunny</Voltra.Text>
      </Voltra.HStack>
    ),
    accessoryCircular: <Voltra.Gauge value={72} maximumValue={100} />,
  },
  { deepLinkUrl: '/weather' },
);

// Timeline entries (scheduled updates)
await scheduleWidget('weather', [
  {
    date: new Date('2026-01-16T06:00:00'),
    variants: { systemSmall: <Voltra.Text>58°</Voltra.Text> },
    deepLinkUrl: '/weather/morning',
  },
  {
    date: new Date('2026-01-16T12:00:00'),
    variants: { systemSmall: <Voltra.Text>72°</Voltra.Text> },
    deepLinkUrl: '/weather/afternoon',
  },
]);
```

### Widget Families

| Key                    | Description             |
| ---------------------- | ----------------------- |
| `systemSmall`          | Small square widget     |
| `systemMedium`         | Wide rectangle          |
| `systemLarge`          | Large square            |
| `accessoryCircular`    | Lock screen circular    |
| `accessoryRectangular` | Lock screen rectangular |
| `accessoryInline`      | Lock screen inline text |

## Event Listeners

```tsx
import { addVoltraListener } from 'voltra/client';

// Activity lifecycle
addVoltraListener('stateChange', ({ activityName, activityState }) => {
  // activityState: 'active' | 'dismissed' | 'pending' | 'stale' | 'ended'
});

// Push tokens (for server-side updates)
addVoltraListener('activityTokenReceived', ({ activityName, pushToken }) => {
  fetch('/api/register-token', { body: JSON.stringify({ pushToken }) });
});

// Button/toggle interactions
addVoltraListener('interaction', ({ identifier }) => {
  if (identifier === 'action-btn') {
    /* handle */
  }
});
```

## Preview (Development)

```tsx
import { VoltraLiveActivityPreview, VoltraWidgetPreview } from 'voltra/client';

// Preview at exact lock screen dimensions
<VoltraLiveActivityPreview>
  {lockScreenContent}
</VoltraLiveActivityPreview>

// Preview specific widget family
<VoltraWidgetPreview family="systemMedium">
  {widgetContent}
</VoltraWidgetPreview>
```

## Key Constraints

- **iOS only** for Live Activities / Dynamic Island (Android gets home screen widgets)
- Widget updates limited to ~1/minute by iOS
- Images must be from asset catalog (`assetName`) or base64 — no remote URLs
- SF Symbols require iOS system symbol names
- `Voltra.Timer` updates natively without JS bridge — ideal for countdowns
- Requires Expo Dev Client, not Expo Go
