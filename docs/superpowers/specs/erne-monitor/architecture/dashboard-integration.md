# Dashboard Integration Architecture

> How @erne/monitor surfaces runtime data through the ERNE dashboard (Runtime tab), Expo Dev Tools plugin, and terminal reporter.

---

## Three Output Channels

@erne/monitor delivers runtime intelligence through three channels, each optimized for a different developer workflow:

```
EventStore
    |
    +---> DashboardBridge -------> ERNE Dashboard (Runtime tab)
    |     (WebSocket, real-time)   Browser-based, full visualization
    |
    +---> ExpoDevToolsPlugin ----> Expo Dev Tools (custom tab)
    |     (DevTools protocol)      Integrated with existing dev workflow
    |
    +---> TerminalReporter ------> Metro terminal
          (console output)         Zero-config, always visible
```

All three channels are **dev-only** (`__DEV__ === true`). In production builds, none of these channels are active -- events go only to EventStore, Transport, and SignalRouter.

---

## 1. ERNE Dashboard -- Runtime Tab

The ERNE dashboard already exists as a visual interface for ERNE's static analysis features. The Runtime tab adds live monitoring capabilities.

### Connection Architecture

```
React Native App                    ERNE Dashboard (Browser)
+------------------+                +------------------+
|                  |                |                  |
| MonitorClient    |                | Runtime Tab      |
|   |              |   WebSocket   |   |              |
|   +-> Dashboard  | <-----------> |   +-> EventFeed  |
|       Bridge     |   port:ERNE   |       HealthGrid |
|                  |   _DASHBOARD  |       Breadcrumbs |
|                  |   _PORT       |       AIInsights  |
+------------------+                +------------------+
```

The DashboardBridge maintains a persistent WebSocket connection to the ERNE dashboard. Events are pushed in real-time as they flow through the pipeline.

### DashboardBridge Implementation

```typescript
class DashboardBridge {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private eventQueue: MonitorEvent[] = [];
  private readonly MAX_QUEUE_SIZE = 200;

  constructor(private config: DashboardConfig) {}

  connect(): void {
    if (!__DEV__) return; // dev-only

    const port = process.env.ERNE_DASHBOARD_PORT ?? '3742';
    this.ws = new WebSocket(`ws://localhost:${port}/monitor`);

    this.ws.onopen = () => {
      // Flush queued events
      for (const event of this.eventQueue) {
        this.send(event);
      }
      this.eventQueue = [];
    };

    this.ws.onclose = () => {
      // Reconnect with backoff
      this.reconnectTimer = setTimeout(() => this.connect(), 2000);
    };
  }

  /** Push an event to the dashboard in real-time */
  push(event: MonitorEvent): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send(event);
    } else {
      // Queue for delivery when connection restores
      this.eventQueue.push(event);
      if (this.eventQueue.length > this.MAX_QUEUE_SIZE) {
        this.eventQueue.shift(); // drop oldest
      }
    }
  }

  /** Push a SignalRouter dispatch result */
  pushDispatch(dispatch: DispatchResult): void {
    this.push({
      type: 'router.dispatch',
      ...dispatch,
    });
  }

  private send(event: MonitorEvent): void {
    this.ws?.send(JSON.stringify({
      channel: 'monitor',
      event,
      timestamp: Date.now(),
    }));
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}
```

### WebSocket Message Protocol

```typescript
// App -> Dashboard
interface MonitorMessage {
  channel: 'monitor';
  event: MonitorEvent;
  timestamp: number;
}

// Dashboard -> App (commands)
interface MonitorCommand {
  channel: 'monitor.command';
  action: 'apply_fix' | 'dismiss' | 'create_issue' | 'snooze' | 'request_state';
  payload: Record<string, unknown>;
}
```

---

### Runtime Tab Layout

```
+--------------------------------------------------------------+
|  Runtime Monitor                            [green] Connected |
+--------------------------------------------------------------+
|                                                               |
|  HEALTH GRID                                                  |
|  +----------+----------+----------+----------+-----------+    |
|  | Crashes  | FPS      | Memory   | Network  | Startup   |    |
|  | [red] 1  | [yel] 54 | [grn] 42M| [grn]100%| [grn] 1.2s|   |
|  | (spark)  | (spark)  | (spark)  | (spark)  | (spark)   |    |
|  +----------+----------+----------+----------+-----------+    |
|                                                               |
|  LIVE SIGNALS                                                 |
|  +-----------------------------------------------------------+|
|  | [red] CRASH TypeError at Profile:42               2s ago  ||
|  |   -> investigate agent dispatched                         ||
|  |   -> AI: "missing optional chaining on                    ||
|  |          user.settings.name -- new accounts               ||
|  |          have no settings object"                         ||
|  |   [Apply Fix] [Dismiss] [Create Issue]                    ||
|  |                                                           ||
|  | [yel] PERF  12 re-renders on UserList              30s    ||
|  |   -> suggestion: add useMemo on filtered results          ||
|  |   [Show Details] [Snooze]                                 ||
|  |                                                           ||
|  | [grn] NET   GET /api/users -> 200 (234ms)          1m    ||
|  +-----------------------------------------------------------+|
|                                                               |
|  BREADCRUMB TIMELINE                                          |
|  +-----------------------------------------------------------+|
|  | [nav]  /home -> /profile                           -5s    ||
|  | [net]  GET /api/user/123 -> 200                    -4s    ||
|  | [state] userStore.setUser(data)                    -3s    ||
|  | [tap]  Tap: Button[Settings]                       -2s    ||
|  | [rend] ProfileScreen rendered (3rd time)           -1s    ||
|  | [crash] CRASH: TypeError                           now    ||
|  +-----------------------------------------------------------+|
|                                                               |
|  AI INSIGHTS                                                  |
|  +-----------------------------------------------------------+|
|  | Agent fix success rate: 73%                               ||
|  | Median time-to-fix: 4.2min (vs 35min manual)             ||
|  | Pattern library: 12 learned patterns                      ||
|  +-----------------------------------------------------------+|
+--------------------------------------------------------------+
```

### Health Grid Component

Five metric cards, each with a traffic light indicator and a sparkline showing the last 60 seconds of data.

```typescript
interface HealthMetric {
  name: string;
  value: number | string;
  unit: string;
  status: 'green' | 'yellow' | 'red';
  sparkline: number[]; // last 60 data points (1/second)
}

const HEALTH_THRESHOLDS = {
  crashes: {
    green: 0,        // no crashes
    yellow: null,    // n/a -- any crash is red
    red: 1,          // 1+ crash
  },
  fps: {
    green: 55,       // 55+ FPS
    yellow: 45,      // 45-54 FPS
    red: 0,          // <45 FPS
  },
  memory: {
    green: 0,        // <60% of limit
    yellow: 60,      // 60-80% of limit
    red: 80,         // >80% of limit
  },
  network: {
    green: 95,       // 95%+ success rate
    yellow: 80,      // 80-94% success rate
    red: 0,          // <80% success rate
  },
  startup: {
    green: 0,        // <2s TTI
    yellow: 2000,    // 2-3s TTI
    red: 3000,       // >3s TTI
  },
};
```

### Live Signals Feed

Reverse-chronological stream of significant events. Each signal card shows:

1. **Severity indicator** (red/yellow/green)
2. **Signal type and summary** (one line)
3. **AI analysis** (if SignalRouter dispatched an agent)
4. **Action buttons** (context-dependent)

```typescript
interface SignalCard {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: string;          // 'CRASH', 'PERF', 'NET', 'A11Y', etc.
  summary: string;       // one-line description
  timestamp: number;
  relativeTime: string;  // "2s ago", "30s", "1m"

  // AI dispatch info (if applicable)
  dispatch?: {
    agent: string;       // 'investigate', 'code-reviewer', etc.
    tier: 'auto-fix' | 'suggest' | 'notify';
    analysis: string;    // AI-generated explanation
    fixAvailable: boolean;
  };

  // Interactive actions
  actions: SignalAction[];
}

type SignalAction =
  | { type: 'apply_fix'; branchName: string }
  | { type: 'dismiss' }
  | { type: 'create_issue' }
  | { type: 'show_details' }
  | { type: 'snooze'; duration: number };
```

### Breadcrumb Timeline

A vertical timeline showing the last 100 actions leading up to a selected event (typically a crash). Each breadcrumb is typed and color-coded.

```typescript
interface TimelineEntry {
  type: 'navigation' | 'network' | 'state' | 'tap' | 'render' | 'crash' | 'custom';
  icon: string;        // emoji or icon identifier
  label: string;       // human-readable action
  relativeTime: string; // "-5s", "-4s", etc.
  details?: string;    // expandable details
}

// Icon mapping
const BREADCRUMB_ICONS = {
  navigation: 'compass',    // route changes
  network: 'globe',         // HTTP requests
  state: 'package',         // store updates
  tap: 'pointer',           // user taps
  render: 'refresh',        // component renders
  crash: 'explosion',       // crash event
  custom: 'tag',            // developer events
};
```

### AI Insights Panel

Aggregate statistics about the SignalRouter's performance. Updated after each dispatch outcome.

```typescript
interface AIInsights {
  /** Percentage of dispatched fixes that were accepted/merged */
  fixSuccessRate: number;

  /** Median time from crash detection to fix available */
  medianTimeToFix: number; // minutes

  /** Estimated median time for manual fix (baseline) */
  medianManualTime: number; // minutes

  /** Number of learned patterns in the PatternLibrary */
  patternCount: number;

  /** Breakdown by dispatch tier */
  dispatchBreakdown: {
    autoFix: number;
    suggest: number;
    notify: number;
  };

  /** Recent dispatch history (last 10) */
  recentDispatches: DispatchRecord[];
}
```

---

## 2. Expo Dev Tools Plugin

Integration with Expo's built-in developer tools. Appears as a custom tab in the Expo Dev Tools interface.

### Plugin Registration

```typescript
// src/integrations/ExpoDevToolsPlugin.ts
import { createDevToolsPlugin } from 'expo/devtools';

const plugin = createDevToolsPlugin({
  name: 'ERNE Monitor',
  id: 'erne-monitor',
  icon: 'activity', // Expo icon set
});

export function registerDevToolsPlugin(monitorClient: MonitorClient): void {
  if (!__DEV__) return;

  const client = plugin.useDevToolsClient();

  // Stream events to dev tools
  monitorClient.onEvent((event) => {
    client.sendMessage('monitor:event', event);
  });

  // Receive commands from dev tools
  client.addMessageListener('monitor:command', (message) => {
    handleCommand(message, monitorClient);
  });
}
```

### Dev Tools Tab Features

The Expo Dev Tools plugin provides five visualization panels:

#### Live Events Stream

```
+------------------------------------------+
| Events (live)                    [pause] |
|------------------------------------------|
| 14:32:01  CRASH  TypeError       Profile |
| 14:32:00  NET    GET /api/users  200     |
| 14:31:58  RENDER UserList        x12     |
| 14:31:55  NAV    /home -> /profile       |
| 14:31:50  STATE  userStore.setUser       |
+------------------------------------------+
```

#### Performance Swimlanes

Three horizontal lanes showing concurrent activity on different threads:

```
+------------------------------------------+
| Performance Swimlanes                    |
|------------------------------------------|
| JS Thread  |====|  |==|    |========|   |
| UI Thread  |==|   |====|  |=|  |====|   |
| Network    |----------|  |------|        |
|            0s    5s   10s   15s   20s    |
+------------------------------------------+
```

Each bar represents:
- **JS Thread:** Long tasks (>50ms), renders, state updates
- **UI Thread:** Frame renders, layout passes, Fabric commits
- **Network:** HTTP request duration (from start to response)

#### Re-render Heatmap

Overlays render count data on the React component tree. Components with excessive renders (>5x per interaction) are highlighted.

```
+------------------------------------------+
| Component Tree (re-renders)              |
|------------------------------------------|
| App                              [1]     |
|   Layout                         [1]     |
|     TabNavigator                 [1]     |
|       HomeScreen                 [2]     |
|         UserList         [red]   [12]    |
|           UserRow                [12]    |
|           UserRow                [12]    |
|         Header                   [1]     |
+------------------------------------------+
```

#### Network Waterfall

Chronological waterfall view of all network requests, similar to browser DevTools network panel.

```
+------------------------------------------+
| Network                                  |
|------------------------------------------|
| GET /api/users       200  234ms  |====|  |
| GET /api/user/123    200  156ms   |==|   |
| POST /api/analytics  204   45ms    |=|   |
| GET /api/settings    500  890ms  |=====X |
+------------------------------------------+
```

#### Breadcrumb Timeline

Same breadcrumb timeline as the dashboard, but within the Expo Dev Tools context. Useful when the ERNE dashboard is not open.

---

## 3. Terminal Reporter

The simplest output channel. Prints inline warnings and errors directly in the Metro bundler terminal output. Requires zero configuration -- works immediately after `@erne/monitor` is installed.

### Output Format

```
Metro terminal output (during development):

  ERNE [crash] TypeError: Cannot read property 'name' of undefined
    at ProfileScreen.tsx:42
    -> investigate agent dispatched (confidence: 0.91)

  ERNE [perf] 12 re-renders detected on UserList component
    -> suggestion: memoize filtered results with useMemo

  ERNE [net] GET /api/settings -> 500 Internal Server Error (890ms)

  ERNE [a11y] Button "Submit" missing accessibilityLabel
    at LoginScreen.tsx:28

  ERNE [memory] JS heap usage at 82% (164MB / 200MB)
    -> sustained for 30s, consider investigating memory leaks
```

### Implementation

```typescript
class TerminalReporter {
  private readonly SEVERITY_PREFIX = {
    critical: '\x1b[31m[crash]\x1b[0m',  // red
    high: '\x1b[33m[perf]\x1b[0m',       // yellow
    medium: '\x1b[36m[net]\x1b[0m',      // cyan
    low: '\x1b[90m[a11y]\x1b[0m',        // gray
  };

  report(event: MonitorEvent): void {
    if (!__DEV__) return;

    const prefix = this.getPrefix(event);
    const summary = this.summarize(event);

    console.warn(`  ERNE ${prefix} ${summary}`);

    // If SignalRouter dispatched an agent, show that too
    if (event._dispatch) {
      const { agent, tier, confidence } = event._dispatch;
      console.warn(`    -> ${agent} agent dispatched (confidence: ${confidence.toFixed(2)})`);
    }
  }

  private getPrefix(event: MonitorEvent): string {
    switch (event.type) {
      case 'crash':
      case 'anr':
        return this.SEVERITY_PREFIX.critical;
      case 'frame_drop':
      case 'render':
      case 'memory':
        return this.SEVERITY_PREFIX.high;
      case 'network':
        return this.SEVERITY_PREFIX.medium;
      case 'a11y':
        return this.SEVERITY_PREFIX.low;
      default:
        return `[${event.type}]`;
    }
  }

  private summarize(event: MonitorEvent): string {
    switch (event.type) {
      case 'crash':
        return `${event.message}\n    at ${event.stack.split('\n')[0]}`;
      case 'network':
        return `${event.method} ${event.url} -> ${event.statusCode} (${event.duration}ms)`;
      case 'render':
        return `${event.renderCount} re-renders detected on ${event.componentName}`;
      case 'memory':
        return `JS heap usage at ${Math.round((event.jsHeapUsed / event.jsHeapTotal) * 100)}%`;
      default:
        return event.message ?? JSON.stringify(event);
    }
  }
}
```

### Filtering

The terminal reporter respects a verbosity configuration to avoid flooding the console:

```typescript
// monitor.config.ts
export default defineMonitorConfig({
  terminal: {
    enabled: true,
    verbosity: 'warnings', // 'all' | 'warnings' | 'errors' | 'none'
    filter: {
      crash: true,         // always show crashes
      network: 'errors',   // only 4xx/5xx
      render: true,        // show excessive re-renders
      a11y: false,         // suppress a11y warnings
      memory: true,        // show memory warnings
    },
  },
});
```

Default behavior (no config):
- Crashes: always shown
- Network errors (4xx/5xx): shown
- Excessive re-renders (>10x): shown
- A11y violations: shown at session end (batched)
- Memory warnings (>80%): shown
- Everything else: suppressed

---

## Channel Selection Logic

```
Is __DEV__?
  |
  +-- NO  -> No output channels active
  |         (events go to EventStore + Transport only)
  |
  +-- YES
       |
       +-- Is ERNE Dashboard running?
       |    |
       |    +-- YES -> DashboardBridge (full visualization)
       |    |          + TerminalReporter (always, as fallback)
       |    |
       |    +-- NO  -> TerminalReporter only
       |
       +-- Is Expo Dev Tools open?
            |
            +-- YES -> ExpoDevToolsPlugin (custom tab)
            |          + TerminalReporter (always)
            |
            +-- NO  -> TerminalReporter only
```

All three channels can be active simultaneously. The TerminalReporter is always the baseline -- it requires no additional tooling and works in any terminal.

---

## Connection Lifecycle

### Dashboard Connection

```
App starts
    |
    v
DashboardBridge attempts WebSocket connection
    |
    +-- Dashboard running -> connected, stream events
    |
    +-- Dashboard not running -> queue events (max 200)
    |                            retry every 2 seconds
    |
    v
Dashboard starts later
    |
    v
WebSocket connects -> flush queued events -> stream in real-time
    |
    v
Dashboard closes
    |
    v
WebSocket disconnects -> resume queuing -> retry reconnect
```

### Expo Dev Tools Connection

```
App starts
    |
    v
ExpoDevToolsPlugin registers via createDevToolsPlugin()
    |
    +-- Dev tools tab opened -> stream events via DevTools protocol
    |
    +-- Dev tools tab closed -> stop streaming (no queue)
```

---

## Action Handling

When a developer clicks an action button in the dashboard (e.g., [Apply Fix], [Dismiss]), the dashboard sends a command back to the app via WebSocket:

```typescript
// Dashboard -> App
{
  channel: 'monitor.command',
  action: 'apply_fix',
  payload: {
    incidentId: 'inc_abc123',
    branchName: 'fix/monitor-inc_abc123',
  }
}

// App handles the command
function handleCommand(command: MonitorCommand): void {
  switch (command.action) {
    case 'apply_fix':
      // Trigger ERNE agent to apply the fix
      // This runs in the development environment, not on device
      dispatchAgent('investigate', {
        mode: 'auto-fix',
        incident: command.payload.incidentId,
        branch: command.payload.branchName,
      });
      break;

    case 'dismiss':
      // Record feedback: developer dismissed the suggestion
      feedbackTracker.record({
        incidentId: command.payload.incidentId,
        response: 'rejected',
      });
      break;

    case 'create_issue':
      // Open GitHub issue creation with pre-filled context
      // Uses gh CLI via ERNE's pipeline-orchestrator
      break;

    case 'snooze':
      // Suppress this signal type for the configured duration
      signalRouter.snooze(
        command.payload.signalType,
        command.payload.duration,
      );
      break;
  }
}
```

---

## Performance Considerations

All output channels are designed to have zero impact on app performance:

1. **WebSocket messages are fire-and-forget.** DashboardBridge never blocks on send. If the WebSocket buffer is full, messages are dropped.

2. **Terminal output uses `console.warn`.** This goes through LogBox in development. Production builds strip these calls via the Babel dead code elimination.

3. **Expo Dev Tools plugin uses async messaging.** The DevTools protocol is non-blocking. Events are serialized and sent asynchronously.

4. **All channels are gated on `__DEV__`.** In production builds, the entire output channel code is tree-shaken away. Zero bytes, zero CPU.
