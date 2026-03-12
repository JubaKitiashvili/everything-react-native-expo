# Hooks & Profiles

ERNE uses Claude Code hooks to enforce quality standards automatically. Hooks are git-style triggers that run scripts at specific events.

## Hook Profiles

Three profiles control which hooks are active:

### minimal (4 hooks)
- Session-start environment check
- Post-edit format
- Continuous-learning observer
- Dashboard event
- Maximum speed, minimal friction
- Best for: prototyping, vibe mode, quick experiments

### standard (12 hooks, recommended)
- Session-start environment check
- Format on edit
- TypeScript type checking
- Console.log detection
- Platform-specific code validation
- Reanimated worklet validation
- Expo config validation
- Bundle size check
- Pre-commit lint
- Continuous-learning observer
- Evaluate session
- Dashboard event
- Best for: daily development

### strict (16 hooks)
- Everything in standard, plus:
- Pre-edit test gate
- Security scanning
- Native compatibility checks
- Accessibility audit
- Best for: pre-release, production code

## Changing Profile

```bash
# Environment variable (highest priority)
export ERNE_PROFILE=strict

# Or in CLAUDE.md comment
<!-- Hook Profile: standard -->

# Or via context (vibe auto-sets minimal)
/context vibe
```

## Precedence (highest to lowest)

1. Explicit `ERNE_PROFILE` env var
2. Context preamble (vibe → minimal)
3. CLAUDE.md comment
4. Default: standard

## Hook Events

| Event | When | Example Hook |
|-------|------|-------------|
| PreToolUse | Before a tool runs | Test gate (block edit if tests fail) |
| PostToolUse | After a tool runs | Format code, typecheck, pattern capture |
| PreCommit | Before git commit | Lint staged files |
| SessionStart | On session start | Load profile, check environment |
| Stop | On session end | Continuous-learning observer, evaluate-session |

## Adding Custom Hooks

Add hooks in `.claude/hooks.json`:
```json
{
  "hooks": [
    {
      "event": "PostToolUse",
      "pattern": "Edit|Write",
      "command": "node .claude/scripts/hooks/my-custom-hook.js $FILE"
    }
  ]
}
```
