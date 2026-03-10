# Hooks & Profiles

ERNE uses Claude Code hooks to enforce quality standards automatically. Hooks are git-style triggers that run scripts at specific events.

## Hook Profiles

Three profiles control which hooks are active:

### minimal
- Pre-commit lint only
- Maximum speed, minimal friction
- Best for: prototyping, vibe mode, quick experiments

### standard (recommended)
- Format on edit
- TypeScript type checking
- Console.log detection
- Platform-specific code validation
- Pre-commit lint
- Best for: daily development

### strict
- Everything in standard, plus:
- Security scanning
- Performance budget checking
- Accessibility audit
- Bundle size monitoring
- Native compatibility checks
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

## Adding Custom Hooks

Add hooks in `.claude/hooks.json`:
```json
{
  "hooks": [
    {
      "event": "PostToolUse",
      "tools": ["Edit", "Write"],
      "command": "node .claude/scripts/hooks/my-custom-hook.js $FILE"
    }
  ]
}
```
