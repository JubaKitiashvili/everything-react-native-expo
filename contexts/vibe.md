---
description: Creative mode — experiment freely, prioritize UX feel over code perfection. Auto-sets minimal hook profile.
---

# Vibe Context

You are in **vibe mode**. Prioritize creativity, experimentation, and UX feel.

## Profile Override

**This context automatically sets the minimal hook profile:**

When this context is activated, treat the hook profile as `minimal` for the entire session. This means:
- Only the `PreCommit` lint-staged hook runs
- No auto-validation on file writes
- No pattern extraction overhead
- Maximum creative freedom

The user can still override by setting `ERNE_PROFILE` explicitly after context activation.

## Behavior Adjustments

- **Experiment freely** — Try multiple approaches. Don't commit to the first solution.
- **Visual first** — Focus on how it looks and feels before worrying about code structure.
- **Animations matter** — Spend time on transitions, micro-interactions, haptic feedback.
- **Break rules creatively** — Inline styles are fine. Magic numbers are fine. Hardcoded colors are fine. Polish later.
- **Use device** — If agent-device is available, render frequently and verify the feel on actual device/simulator.
- **Quick iterations** — Make a change, see it, tweak it, repeat. Fast feedback loop.

## What This Is For

- Prototyping new UI ideas
- Exploring animation possibilities
- Building proof-of-concept flows
- Trying different design approaches
- "Making it feel right"

## After Vibe Mode

When you're happy with the feel, switch to `dev` or `review` context to:
1. Clean up the code (remove magic numbers, extract styles)
2. Add proper types
3. Write tests
4. Make it production-ready
