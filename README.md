# everything-react-native-expo (ERNE)

Complete AI coding agent harness for React Native and Expo development.

## Quick Start

```bash
npx erne-universal init
```

This will:
1. Detect your project type (Expo managed, bare RN, or monorepo)
2. Let you choose a hook profile (minimal / standard / strict)
3. Select MCP integrations (simulator control, GitHub, etc.)
4. Generate your `.claude/` configuration

## What's Included

| Component | Count |
|-----------|-------|
| Agents | 8 specialized AI agents |
| Commands | 16 slash commands |
| Rule layers | 5 (common, expo, bare-rn, native-ios, native-android) |
| Hook profiles | 3 (minimal, standard, strict) |
| Skills | 8 reusable knowledge modules |
| Contexts | 3 behavior modes (dev, review, vibe) |
| MCP configs | 10 server integrations |

## IDE & Editor Support

ERNE works with every major AI coding assistant out of the box:

| File | IDE / Tool |
|------|-----------|
| `CLAUDE.md` | Claude Code |
| `AGENTS.md` | Codex, Windsurf, Cursor, GitHub Copilot |
| `GEMINI.md` | Google Antigravity |
| `.cursorrules` | Cursor |
| `.windsurfrules` | Windsurf |
| `.github/copilot-instructions.md` | GitHub Copilot |

All config files share the same React Native & Expo conventions: TypeScript strict mode, Expo Router, Zustand + TanStack Query, testing with Jest/RNTL/Detox, and security best practices.

## Agents

- **architect** — System design and project structure
- **code-reviewer** — Code quality and best practices
- **tdd-guide** — Test-driven development workflow
- **performance-profiler** — Performance diagnostics
- **native-bridge-builder** — Native module development
- **expo-config-resolver** — Expo configuration issues
- **ui-designer** — UI/UX implementation
- **upgrade-assistant** — Version migration

## Hook Profiles

| Profile | Use Case |
|---------|----------|
| minimal | Fast iteration, vibe coding |
| standard | Balanced quality + speed (recommended) |
| strict | Production-grade enforcement |

Change profile: Edit `hookProfile` in `.claude/settings.json` or use `/vibe` context.

## Commands

Core: `/plan`, `/code-review`, `/tdd`, `/build-fix`, `/perf`, `/upgrade`, `/native-module`, `/navigate`

Extended: `/animate`, `/deploy`, `/component`, `/debug`, `/quality-gate`

Learning: `/learn`, `/retrospective`, `/setup-device`

## Available On

- [npm](https://www.npmjs.com/package/erne-universal) — `npx erne-universal init`
- [SkillsMP](https://skillsmp.com) — Auto-indexed from GitHub
- [BuildWithClaude](https://buildwithclaude.com) — Plugin directory
- [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) — Curated skills list

## Documentation

- [Getting Started](docs/getting-started.md)
- [Agents Guide](docs/agents.md)
- [Commands Reference](docs/commands.md)
- [Hooks & Profiles](docs/hooks-profiles.md)
- [Creating Skills](docs/creating-skills.md)

## Links

- Website: [erne.dev](https://erne.dev)
- npm: [erne-universal](https://www.npmjs.com/package/erne-universal)

## License

MIT
