---
name: plan
description: Design feature architecture using the architect agent
---

# /plan — Feature Architecture Design

You are executing the `/plan` command. Use the **architect** agent to design a feature architecture.

## Process

1. **Understand the requirement** — Ask clarifying questions if the feature description is vague
2. **Analyze existing codebase** — Read relevant files, understand current navigation structure, state management, and API patterns
3. **Design the architecture** — Using the architect agent's process:
   - Decompose into components and screens
   - Plan Expo Router file structure
   - Select state management approach (Zustand / TanStack Query / local)
   - Design data flow and API layer
   - Consider platform-specific requirements
4. **Output the plan** — Use the architect agent's output format:

### Architecture Output

```
## Overview
[1-2 sentence description of the feature]

## File Structure
[New files to create with paths]

## Component Design
[Component hierarchy and responsibilities]

## Data Flow
[State management approach, API calls, caching strategy]

## Navigation
[New routes, layout changes, deep link support]

## Implementation Tasks
[Ordered list of implementation steps]
```

5. **Review with user** — Present the plan and ask for approval before implementation

## Notes
- Reference `rules/common/patterns.md` and `rules/common/navigation.md` for conventions
- Consider whether this is Expo managed, bare RN, or has native modules
- Include test strategy in the plan
