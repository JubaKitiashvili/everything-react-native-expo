---
name: continuous-learning-v2
description: Auto-generate skills and rules from observed React Native development patterns
---

# Continuous Learning v2

This skill manages the continuous learning pipeline — observing patterns during development sessions and converting them into persistent rules and skills.

## Architecture

```
PostToolUse hook (real-time)
  → continuous-learning-observer.cjs (lightweight pattern capture)
  → patterns stored in .claude/memory/observations/

/learn command (manual, comprehensive)
  → extract-session-patterns.js (full session analysis)
  → analyze-patterns.js (pattern clustering + dedup)
  → skill-generator prompt (create new content)
  → validate-content.js (verify new content is valid)

/retrospective command (session end)
  → evaluate-session.js (quality metrics + suggestions)
```

## How It Works

### Real-Time (Automatic)

The `continuous-learning-observer.cjs` hook runs on `PostToolUse` events. It:
1. Captures the tool name, file paths, and outcome
2. Detects repeated patterns (same fix applied > 3 times)
3. Stores observations in `.claude/memory/observations/` as JSON
4. Lightweight — adds < 50ms to each tool call

### Manual Analysis (`/learn`)

When the user runs `/learn`, the pipeline:
1. Reads all observations from the current session
2. Clusters them by type (style fix, import pattern, architecture choice)
3. Compares against existing rules and skills
4. Generates candidates for new content
5. Presents candidates for user approval
6. Writes approved content to `.claude/rules/` or `.claude/skills/`

### Session Evaluation (`/retrospective`)

At session end, `evaluate-session.js`:
1. Aggregates all metrics (files changed, tests added, build status)
2. Evaluates which rules triggered and their usefulness
3. Suggests rule calibration (tighten/loosen globs, adjust content)
4. Generates a session quality report

## Configuration

See `config.json` for tuning parameters:
- `observationThreshold`: How many times a pattern must repeat before flagging (default: 3)
- `maxObservationsPerSession`: Prevent memory bloat (default: 100)
- `autoApprove`: If true, auto-approve low-risk content (default: false)
- `contentTypes`: What types to generate — `["rule", "skill"]`
