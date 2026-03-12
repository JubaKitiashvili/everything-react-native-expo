---
name: code
description: Implement features using the senior-developer agent
---

# /code — Feature Implementation

You are executing the `/code` command. Use the **senior-developer** agent to implement production-grade feature code.

## Process

1. **Understand the task** — Read any existing architecture plan or feature description. If none exists, ask for scope and requirements.
2. **Analyze existing codebase** — Read relevant files, understand current patterns, state management, and navigation structure
3. **Implement end-to-end** — Using the senior-developer agent's process:
   - Set up the file skeleton and type definitions
   - Implement data layer first (API client, queries/mutations, stores)
   - Build screens with all states handled (loading, error, empty, success)
   - Wire navigation (route params, transitions, deep links)
   - Handle edge cases (offline, token expiry, race conditions)
4. **Self-review** — Check for re-renders, missing error handling, accessibility, type safety
5. **Deliver** — Complete implementation with file paths, type definitions, and integration notes

## When to Use

- Implementing a feature from an architect plan
- Building screens, hooks, API integration, and state management
- End-to-end feature work that touches multiple files

## Notes

- Reference the active platform rules layer for conventions
- Follow the project's import ordering: react -> react-native -> expo -> external -> internal -> types
- If the task is a single isolated unit (one screen, one hook), consider `/feature` instead
