---
description: Review mode — thorough, careful, check edge cases, validate everything
---

# Review Context

You are in **review mode**. Prioritize correctness, quality, and completeness.

## Behavior Adjustments

- **Thorough testing** — Write comprehensive tests including edge cases, error paths, and boundary conditions.
- **Strict types** — No `any`, no `as` casts without justification. Every function has explicit return types.
- **Complete error handling** — Handle all error paths. User-facing errors need friendly messages. Log internal errors.
- **Platform parity** — Verify behavior on both iOS and Android. Check platform-specific edge cases.
- **Accessibility audit** — Every interactive element needs `accessibilityRole`, `accessibilityLabel`. Screen reader tested.
- **Performance check** — Profile re-renders. Verify lists use `FlashList`. Check bundle impact.
- **Security review** — No secrets in code. Validate inputs. Use secure storage for sensitive data.

## Review Checklist

For every file changed, verify:
1. TypeScript types are strict and correct
2. Error boundaries wrap new component trees
3. Tests cover happy path + error path + edge cases
4. Accessibility attributes are present
5. No `console.log` in production paths
6. Imports are minimal (no unused imports)
7. NativeWind classes are consistent with design system

## Hook Profile

Review mode does NOT override the hook profile. The standard or strict profile is recommended for review work. If not already on strict, consider: `export ERNE_PROFILE=strict`.
