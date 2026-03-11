# Contributing to ERNE

Thanks for your interest in ERNE! We welcome contributions from everyone — whether you're fixing a typo, adding a new skill, improving an agent, or proposing a partnership.

## Ways to Contribute

### Report a Bug
Found something broken? [Open a bug report](https://github.com/JubaKitiashvili/everything-react-native-expo/issues/new?template=bug_report.md).

Include:
- ERNE version (`npx erne-universal --version`)
- Node.js version, OS, and IDE
- Steps to reproduce
- Expected vs actual behavior

### Request a Feature
Have an idea? [Open a feature request](https://github.com/JubaKitiashvili/everything-react-native-expo/issues/new?template=feature_request.md).

Tell us:
- What problem does it solve?
- How should it work?
- Which component does it affect? (agent, command, skill, rule, hook, MCP config)

### Submit a Pull Request

1. **Fork** the repository
2. **Clone** your fork locally
3. **Create a branch** from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
4. **Make your changes** following the patterns below
5. **Validate** your work:
   ```bash
   npm run validate && npm test
   ```
6. **Commit** using [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat: add new animation patterns skill
   fix: correct TypeScript import order in coding-style rule
   docs: update agents guide with new examples
   ```
7. **Push** and open a PR against `main`

### Improve Documentation
Docs live in `docs/`. Fix typos, add examples, clarify instructions — every improvement helps.

## Project Structure

```
agents/          10 AI agent definitions (.md)
  variants/      Stack-specific agent variants
commands/        16 slash command definitions (.md)
rules/           Coding rules organized by platform layer
  variants/      Stack-specific rule variants
  common/        Rules for all projects (10 files)
  expo/          Expo-managed specific (4 files)
  bare-rn/       Bare React Native specific (4 files)
  native-ios/    iOS native code (4 files)
  native-android/ Android native code (4 files)
skills/          Reusable knowledge modules
hooks/           Hook profiles and configuration
contexts/        Behavior modes (dev, review, vibe)
mcp-configs/     MCP server templates (10 integrations)
scripts/hooks/   Hook implementation scripts (CJS)
bin/             CLI entry point
lib/             CLI logic (detect.js, generate.js, claude-md.js, init, update)
tests/           Test suites
website/         Landing page (erne.dev)
```

## Content File Format

All agent, command, skill, and rule files use YAML frontmatter:

```markdown
---
name: component-name
description: What it does in one line
---

Content body in markdown.
```

### Adding a New Skill

1. Create a directory: `skills/your-skill-name/`
2. Add `SKILL.md` with frontmatter and instructions
3. Optionally add `scripts/`, `references/`, `assets/`
4. Keep SKILL.md under 500 lines
5. Run `npm run validate` to verify

### Adding a New Agent

1. Create `agents/your-agent.md` with frontmatter
2. Define the agent's expertise, triggers, and workflow
3. Reference related commands and skills

### Adding a New Command

1. Create `commands/your-command.md` with frontmatter
2. Define the slash command workflow and steps
3. Reference related agents and skills

### Adding a New Rule

1. Choose the correct layer: `common/`, `expo/`, `bare-rn/`, `native-ios/`, or `native-android/`
2. Add or edit the relevant `.md` file
3. Keep rules actionable and specific

## Hook Scripts

- All hook scripts use **CommonJS** (`.js` or `.cjs`)
- No ES modules in hooks
- Test hooks locally before submitting

## IDE Config Files

When updating conventions, keep all IDE configs in sync:

| File | IDE |
|------|-----|
| `CLAUDE.md` | Claude Code |
| `AGENTS.md` | Codex, Windsurf, Cursor, Copilot |
| `GEMINI.md` | Google Antigravity |
| `.cursorrules` | Cursor |
| `.windsurfrules` | Windsurf |
| `.github/copilot-instructions.md` | GitHub Copilot |

## Testing

```bash
npm test           # Run all tests
npm run validate   # Validate content structure
npm run lint       # Lint markdown content
```

All PRs must pass validation before merging.

## Code of Conduct

- Be respectful and constructive
- Focus on the work, not the person
- Help newcomers feel welcome
- Assume good intent

## Partnership

We actively seek partnerships with teams and organizations building in the React Native and Expo ecosystem.

### Who We Partner With

- **React Native libraries** — Integrate your library's best practices as ERNE rules or skills
- **Expo ecosystem tools** — Add MCP configs and agents for your platform
- **Mobile development agencies** — Co-develop industry-specific skills and workflows
- **AI coding tool vendors** — Ensure ERNE works seamlessly with your IDE or agent platform
- **Developer education** — Create learning-focused skills and guided workflows
- **Open source maintainers** — Cross-promote and integrate complementary tools

### Partnership Types

| Type | What You Get |
|------|-------------|
| **Skill Integration** | Your library gets a dedicated ERNE skill that teaches AI agents your best practices |
| **MCP Config** | Your service becomes a one-click MCP integration for ERNE users |
| **Agent Collaboration** | Co-develop specialized agents combining your domain expertise with ERNE's framework |
| **Co-Marketing** | Featured placement on erne.dev, README, and marketplace listings |
| **Custom Rules** | Your coding standards become an optional ERNE rule layer |

### How to Start

1. **Open a partnership issue**: [Create one here](https://github.com/JubaKitiashvili/everything-react-native-expo/issues/new?template=partnership.md)
2. **Email**: Reach out via the contact in our [GitHub profile](https://github.com/JubaKitiashvili)
3. **PR directly**: Submit a skill or MCP config PR — the best partnerships start with code

### Current Integrations

ERNE already integrates with: Expo, Firebase, Sentry, Supabase, Figma, GitHub, App Store Connect, Google Play Console.

We'd love to add yours.

## Questions?

- Open a [discussion](https://github.com/JubaKitiashvili/everything-react-native-expo/discussions) for general questions
- Check [existing issues](https://github.com/JubaKitiashvili/everything-react-native-expo/issues) before creating new ones
- Read the [docs](https://github.com/JubaKitiashvili/everything-react-native-expo/tree/main/docs) for setup and usage guides

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](../LICENSE).
