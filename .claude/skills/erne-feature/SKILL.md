---
name: erne-feature
description: ERNE — Build a focused feature unit using the feature-builder agent
---

# /erne-feature — Focused Feature Unit

You are executing the `/erne-feature` command. Use the **feature-builder** agent to implement a discrete, scoped feature unit.

## Process

1. **Scope the unit** — Identify exactly one deliverable: a single screen, a custom hook, an API module, or a reusable component
2. **Check dependencies** — Verify types, API contracts, and shared state are defined before starting
3. **Implement** — Using the feature-builder agent's process:
   - Write the code with all states handled (loading, error, empty, success)
   - Type everything explicitly (return types, param interfaces, no `any`)
   - Handle edges (null checks, empty arrays, network failures, platform differences)
4. **Deliver** — Complete file with props/params interface, dependencies list, and integration point

## When to Use

- Building a single screen, hook, or component in isolation
- Working in parallel with another agent on a larger feature
- Quick, scoped implementation tasks with clear boundaries

## Parallel Work

When used alongside `/erne-code` (senior-developer):
- `/erne-code` handles: data layer, stores, navigation skeleton, complex multi-screen flows
- `/erne-feature` handles: individual screens, isolated components, utility hooks, API wrappers
- Coordinate via shared type definitions and agreed interfaces

## Notes

- Reference the active platform rules layer for conventions
- Keep scope tight — if the task touches more than 3 files, use `/erne-code` instead
- Every delivered unit must include its integration point documentation
