---
name: erne-debug-video
description: ERNE — Video-based visual debugging using frame extraction and temporal analysis
---

# /erne-debug-video — Video Debugging

You are executing the `/erne-debug-video` command. Analyze screen recordings to detect animation glitches, race conditions, gesture issues, scroll jank, keyboard overlap, and navigation transitions that screenshots cannot capture.

## Arguments

```
/debug-video <file>                    — analyze a screen recording (.mp4, .mov, .webm)
/debug-video <file> --focus <area>     — focus analysis on a specific UI area or interaction
/debug-video <file> --fps              — include frame rate analysis for animation smoothness
```

## Process

### Step 1: Extract Key Frames
1. Use the `extract-video-frames.js` script to extract frames at key moments
2. Focus on: transition starts/ends, gesture interactions, state changes, animation keyframes
3. Extract at higher density during rapid visual changes

### Step 2: Temporal Analysis
1. Apply multimodal vision to extracted frames in sequence
2. Identify temporal issues across the recording timeline:

| Category | Examples |
|----------|---------|
| **Animation** | jank, stutter, dropped frames, wrong easing |
| **Gesture** | unresponsive touch, wrong drag behavior, gesture conflict |
| **Transition** | flash of wrong content, layout shift, z-order issues |
| **Race Condition** | loading state flicker, stale data flash, double render |
| **Keyboard** | content overlap, scroll jump, input hidden behind keyboard |
| **Scroll** | jank, blank areas, recycling artifacts, momentum issues |

Severity: `critical` · `major` · `minor`

### Step 3: Root Cause Analysis
1. Read the relevant component and animation source files
2. Correlate visual issues with code patterns
3. Present findings with frame-by-frame evidence

### Step 4: Interactive Fix
1. User picks issue numbers to fix
2. Apply the fix (minimal change, match project style)
3. If possible, re-record and compare before/after
4. Ask: "Does this look correct? Any remaining issues?"

### Step 5: Summary
- Issues detected (count by severity and category)
- Frame evidence for each issue (timestamps + descriptions)
- Fixes applied with code diffs
- Remaining issues (if any deferred by user)
- Save findings to memory for future reference

## Output
```
## Video Debug Report

### Recording
[File path, duration, resolution]

### Issues Found
1. [Category · Severity] Description
   Frame evidence: [timestamp] → [timestamp]
2. [Category · Severity] Description
   Frame evidence: [timestamp] → [timestamp]
...

### Fixes Applied
**Issue 1** — [ComponentName.tsx]
Root cause: [brief description]
Fix: [brief description]

### Remaining Issues
[None | list of deferred items]
```
