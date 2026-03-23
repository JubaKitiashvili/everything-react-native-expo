---
name: debug-video
description: Video-based visual debugging — extract key frames from screen recordings and analyze UI bugs over time. Detects animation glitches, race conditions, gesture issues, scroll jank, keyboard overlap, and navigation transitions that screenshots cannot capture.
---

# /debug-video — Video Visual Debugging

You are executing the `/debug-video` command. Extract key frames from a video recording and use the **visual-debugger** agent for temporal UI analysis.

## Arguments

```
/debug-video <video-file>                    — analyze a screen recording
/debug-video <video-file> --max-frames 15    — limit extracted frames (default: 20)
/debug-video <video-file> --description "button disappears after tap"  — with context
```

## Supported Formats

All video formats supported: `.mp4`, `.mov`, `.webm`, `.avi`, `.mkv`, `.gif`

## Process

### Step 1: Extract Key Frames

Run the frame extractor:

```bash
node scripts/extract-video-frames.js "<video-path>" --max-frames 20
```

This outputs JSON with frame paths. If ffmpeg is not found, show the user install instructions from the error output.

**Duration guidance:**

- ≤ 30 seconds: optimal, full detail analysis
- 30-60 seconds: key moments only, still effective
- > 60 seconds: warn user to trim to the relevant section

### Step 2: Read All Extracted Frames

Read EVERY extracted frame image file using the Read tool. The frames are ordered chronologically — frame_001 is earliest, frame_N is latest.

### Step 3: Temporal Analysis

Analyze the frames as a **timeline**, not individual screenshots. Look for:

| Category                  | What to Look For                                                 |
| ------------------------- | ---------------------------------------------------------------- |
| **Animation bugs**        | Element position/size changes unexpectedly between frames        |
| **Race conditions**       | Loading → content → loading again, or flash of wrong content     |
| **Gesture issues**        | Drag/swipe stuck mid-motion, element not following finger        |
| **Scroll jank**           | Content jumping, blank areas during scroll, inconsistent spacing |
| **Keyboard overlap**      | Input hidden behind keyboard after tap sequence                  |
| **Navigation glitches**   | Flash of wrong screen, transition tearing, double-render         |
| **Layout shifts**         | Content moving/resizing after data loads                         |
| **State bugs**            | UI showing stale data, toggle not reflecting state               |
| **Disappearing elements** | Element visible in frame N, gone in frame N+1                    |
| **Z-index issues**        | Element appearing behind/above where it shouldn't                |

Present findings with **frame references**:

```
Frame 3→4: Button "Submit" shifts 20px down after keyboard appears
Frame 6→7: Loading spinner reappears after content was already visible (race condition)
Frame 9: Bottom tab bar overlaps with input field
```

### Step 4: Identify Source Components

For each temporal issue found:

1. Identify which component/screen is affected
2. Read the source file
3. Determine the root cause (missing layout animation, useEffect race, keyboard avoidance, etc.)

### Step 5: Interactive Fix

Same as /debug-visual:

1. User picks issue numbers to fix
2. Apply minimal fix in source
3. Ask user to record a new video to verify

### Step 6: Summary

## Output

```markdown
## Video Debug Report

### Video Info

- File: [path]
- Duration: [X seconds]
- Frames analyzed: [N key frames]

### Timeline Analysis

| Frames | Issue                                          | Category         | Severity |
| ------ | ---------------------------------------------- | ---------------- | -------- |
| 3→4    | Submit button shifts down on keyboard open     | Layout           | Major    |
| 6→7    | Loading spinner reappears after content loaded | Race condition   | Critical |
| 9      | Tab bar overlaps input field                   | Keyboard overlap | Major    |

### Issue Details

**Issue 1 (Frame 3→4): Button shifts on keyboard open**

- Component: `LoginScreen.tsx`
- Root cause: Missing `KeyboardAvoidingView` wrapper
- Fix: Wrap form in `<KeyboardAvoidingView behavior="padding">`

**Issue 2 (Frame 6→7): Loading spinner race condition**

- Component: `FeedScreen.tsx`
- Root cause: `useEffect` fetches data but component unmounts/remounts during tab switch
- Fix: Add cleanup to useEffect, check mounted state before setState

### Recommended Fixes

1. [Priority order with code changes]

### Which issues should I fix? (reply with numbers)
```

## What Video Analysis Catches That Screenshots Miss

- **Timing-dependent bugs** — things that only happen during transitions
- **Animation correctness** — is the animation smooth or does it jump?
- **User flow bugs** — sequences of actions that produce incorrect states
- **Performance visual artifacts** — dropped frames, jank, flash of unstyled content
- **Keyboard interaction** — the full sequence of keyboard appearing and content adjusting
