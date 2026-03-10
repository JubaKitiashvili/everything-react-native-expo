---
description: Git workflow and commit conventions
globs: ""
alwaysApply: true
---

# Git Workflow

## Commit Messages
Follow Conventional Commits:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`

Examples:
- `feat(auth): add biometric login support`
- `fix(navigation): prevent double-tap on tab bar`
- `perf(list): switch FlatList to FlashList for feed`

## Branch Naming
- Feature: `feat/short-description`
- Fix: `fix/issue-number-description`
- Chore: `chore/description`

## PR Guidelines
- Keep PRs under 400 lines when possible
- One logical change per PR
- Include screenshots/recordings for UI changes
- Update tests for changed behavior
- Run full test suite before requesting review

## Hooks Integration
The `pre-commit-lint.js` hook runs ESLint + Prettier on staged files before commit.
