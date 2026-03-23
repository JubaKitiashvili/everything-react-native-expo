---
description: TypeScript ~5.9 and React Native coding style conventions (RN 0.84+, React 19)
globs: '**/*.{ts,tsx,js,jsx}'
alwaysApply: false
---

# Coding Style

## TypeScript

- Enable `strict` mode in tsconfig.json
- No `any` types — use `unknown` + type guards or proper generics
- Use type inference where possible; annotate function signatures explicitly
- Prefer `interface` for object shapes, `type` for unions/intersections
- Use `as const` for literal types instead of enums

## Components

- Functional components only — no class components
- Named exports only — no default exports
- One component per file (colocated helpers are fine)
- Props interface named `[Component]Props` (e.g., `ButtonProps`)
- Destructure props in function signature
- **React 19:** `forwardRef` is no longer needed — pass `ref` as a regular prop

```tsx
// GOOD (React 19)
export function UserCard({ name, avatar, ref }: UserCardProps & { ref?: React.Ref<View> }) { ... }

// GOOD (still works)
export function UserCard({ name, avatar }: UserCardProps) { ... }

// BAD
export default class UserCard extends Component { ... }
```

## File Naming

- Components: `PascalCase.tsx` (e.g., `UserCard.tsx`)
- **Route files in `app/`**: `kebab-case.tsx` (e.g., `comment-card.tsx`) — Expo Router convention
- Hooks: `camelCase.ts` prefixed with `use` (e.g., `useAuth.ts`)
- Utils/helpers: `camelCase.ts` (e.g., `formatDate.ts`)
- Types: `camelCase.ts` or colocated in component file
- Tests: `[name].test.ts(x)` adjacent to source
- Platform-specific: `[name].ios.tsx` / `[name].android.tsx`
- **Never** co-locate components, types, or utilities inside `app/` directory — keep only route files there

## Imports

- Use path aliases (`@/` maps to `src/`)
- No barrel files (`index.ts` re-exports) — import directly
- **No deep imports** from `react-native/Libraries/...` — deprecated since RN 0.80, import from `'react-native'` root only
- Group imports: react → react-native → expo → third-party → local
- Use `import type` for type-only imports

## General

- Max line length: 100 characters (Prettier enforced)
- Trailing commas in multiline structures
- Single quotes for strings
- Semicolons required
- No `var` — use `const` by default, `let` when reassignment needed
