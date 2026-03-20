---
name: debug-visual
description: Screenshot-based visual debugging using the visual-debugger agent
---

# /debug-visual — Visual Debugging

You are executing the `/debug-visual` command. Use the **visual-debugger** agent for screenshot-based UI analysis and fixing.

## Arguments

```
/debug-visual                          — auto-capture screenshot from running simulator/emulator via agent-device
/debug-visual <file>                   — analyze a specific screenshot file
/debug-visual --compare <figma-file>   — compare app screenshot with Figma export
/debug-visual --screen <ScreenName>    — navigate to and capture a specific screen
```

## Process

### Step 1: Capture Screenshot
- **No args**: auto-capture from running simulator/emulator via agent-device
- **`<file>` provided**: read the specified screenshot file directly
- **`--compare`**: capture live app screenshot AND read the Figma export file
- **`--screen`**: navigate to the named screen first, then capture

### Step 2: Analyze
1. Apply multimodal vision to the screenshot(s)
2. Read the relevant component source files
3. Identify all visual issues
4. Present a numbered list — each item includes category and severity:

| Category | Examples |
|----------|---------|
| **Layout** | overflow, misalignment, wrong spacing |
| **Typography** | wrong font, size, weight, truncation |
| **Color** | wrong token, contrast failure, dark mode |
| **Spacing** | padding/margin off-spec |
| **Responsive** | breaks on small/large screen |
| **Figma Delta** | deviation from design (--compare only) |

Severity: `critical` · `major` · `minor`

### Step 3: Interactive Fix
1. User picks issue numbers to fix
2. Locate the responsible component in source
3. Apply the fix (minimal change, match project style)
4. Hot reload — allow ~2s for changes to reflect
5. Re-capture screenshot
6. Show before/after comparison
7. Ask: "Does this look correct? Any remaining issues?"

### Step 4: Summary
- Issues detected (count by severity)
- Fixes applied with before/after diff per issue
- Remaining issues (if any deferred by user)
- Save findings to memory for future reference

## Output
```
## Visual Debug Report

### Screenshot
[File path or auto-captured timestamp]

### Issues Found
1. [Category · Severity] Description
2. [Category · Severity] Description
...

### Fixes Applied
**Issue 1** — [ComponentName.tsx]
Before: [brief description]
After:  [brief description]

### Remaining Issues
[None | list of deferred items]
```
