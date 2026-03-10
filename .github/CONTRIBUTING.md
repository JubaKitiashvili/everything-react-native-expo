# Contributing to ERNE

## Project Structure

- `agents/` — AI agent definitions (8 `.md` files)
- `commands/` — Slash command definitions (16 `.md` files)
- `rules/` — Coding rules organized by layer
- `skills/` — Reusable knowledge modules
- `hooks/` — Git/development hooks with profile system
- `contexts/` — Behavior mode definitions
- `mcp-configs/` — MCP server configuration templates
- `scripts/hooks/` — Hook implementation scripts (CJS)
- `lib/` — CLI logic (init, update)
- `tests/` — Test suites

## Content File Format

Agent, command, and rule files use YAML frontmatter:

    ---
    name: agent-name
    description: What the agent does
    ---

    Content body in markdown.

## Hook Scripts

All hook scripts use CommonJS (`.js` or `.cjs`). No ES modules.

## Testing

    npm test           # Run all tests
    npm run validate   # Validate content files
    npm run lint       # Lint content

## Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Make changes following existing patterns
4. Run `npm run validate && npm test`
5. Submit PR with description of changes
