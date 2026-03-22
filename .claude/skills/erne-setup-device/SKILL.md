---
name: erne-setup-device
description: ERNE — Install and configure agent-device MCP server for simulator/emulator control
---

# /erne-setup-device — Setup Device Control

You are executing the `/erne-setup-device` command. This is **script-driven** — it sets up the agent-device MCP server.

## What This Does

Installs and configures the agent-device MCP server so commands like `/erne-debug`, `/erne-perf`, `/erne-component`, and `/erne-deploy` gain visual device interaction capabilities.

## Process

### Step 1: Check Prerequisites

```bash
# iOS: Check for Xcode and simulator
xcodebuild -version
xcrun simctl list devices

# Android: Check for Android Studio and emulator
adb version
emulator -list-avds
```

### Step 2: Install agent-device MCP

Check if already configured in `.claude/settings.json`:
```json
{
  "mcpServers": {
    "agent-device": {
      "command": "npx",
      "args": ["-y", "agent-device"]
    }
  }
}
```

If not present, add the configuration.

### Step 3: Verify Connection

```bash
# Boot a simulator (iOS)
xcrun simctl boot "iPhone 16 Pro"

# Or start an emulator (Android)
emulator -avd Pixel_8_API_35 &
```

Test that agent-device can:
- Take a screenshot
- Detect booted device
- Perform a tap action

### Step 4: Configure Command Integration

After setup, these commands gain enhanced capabilities:

| Command | Enhancement |
|---------|-------------|
| `/erne-debug` | Screenshot reproduction steps, tap through UI |
| `/erne-perf` | Measure real FPS, capture actual jank frames |
| `/erne-component` | Render on device, visual verification screenshot |
| `/erne-deploy` | Launch preview build, verify UI before submit |
| `/erne-build-fix` | Build, install, and launch to verify fix |

### Output

```
## agent-device Setup Complete

### Status
- MCP server: Configured ✓
- iOS Simulator: Available (iPhone 16 Pro)
- Android Emulator: Available (Pixel 8 API 35)

### Capabilities Enabled
- Screenshot capture
- Tap/type/swipe interaction
- App navigation
- Visual verification

### Commands Enhanced
/debug, /perf, /component, /deploy, /build-fix
now have visual device control.
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| iOS simulator not found | Install Xcode, run `xcode-select --install` |
| Android emulator not found | Install Android Studio, create AVD in AVD Manager |
| agent-device fails to connect | Check MCP server config in `.claude/settings.json` |
| Screenshots are black | Wait for device to finish booting, retry |
