---
description: TypeScript and React Native coding style conventions — functional preferred, class components accepted
globs: "**/*.{ts,tsx,js,jsx}"
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
- Prefer functional components for new code
- Class components accepted in legacy code — when modifying existing class components, maintain the pattern rather than refactoring to functional
- Named exports only — no default exports
- One component per file (colocated helpers are fine)
- Props interface named `[Component]Props` (e.g., `ButtonProps`)
- Destructure props in function signature (functional) or use `this.props` (class)

```tsx
// Preferred — functional
export function UserCard({ name, avatar }: UserCardProps) { ... }

// Acceptable — legacy class component
export class UserProfile extends Component<UserProfileProps, UserProfileState> {
  render() {
    const { name, avatar } = this.props;
    return ( ... );
  }
}
```

## Class Component Guidelines (when applicable)
- Type both Props and State generics: `Component<Props, State>`
- Use class properties for default state instead of constructor
- Avoid `componentWillMount` and `componentWillReceiveProps` (deprecated)
- Use `componentDidMount` for data fetching, `componentWillUnmount` for cleanup
- Use `shouldComponentUpdate` or `PureComponent` for performance

## File Naming
- Components: `PascalCase.tsx` (e.g., `UserCard.tsx`)
- Hooks: `camelCase.ts` prefixed with `use` (e.g., `useAuth.ts`)
- Utils/helpers: `camelCase.ts` (e.g., `formatDate.ts`)
- Types: `camelCase.ts` or colocated in component file
- Tests: `[name].test.ts(x)` adjacent to source
- Platform-specific: `[name].ios.tsx` / `[name].android.tsx`

## Imports
- Use path aliases (`@/` maps to `src/`)
- No barrel files (`index.ts` re-exports) — import directly
- Group imports: react → react-native → expo → third-party → local
- Use `import type` for type-only imports

## General
- Max line length: 100 characters (Prettier enforced)
- Trailing commas in multiline structures
- Single quotes for strings
- Semicolons required
- No `var` — use `const` by default, `let` when reassignment needed
