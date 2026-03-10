# Creating Custom Skills

Skills are ERNE's extensibility mechanism. They're reusable knowledge units that Claude can invoke.

## Skill Structure

```
skills/my-skill/
  SKILL.md          # Required: skill definition
  references/       # Optional: supporting documents
    api-docs.md
    examples.md
```

## SKILL.md Format

```markdown
---
name: my-skill
description: One-line description of what this skill does
---

# Skill Title

[When to invoke this skill]
[Step-by-step workflow]
[Code examples]
[Expected output format]
```

## Writing Good Skills

### Do
- Be specific and actionable
- Include code examples that work
- Define clear output format
- State when to invoke (triggers)
- Reference existing rules where relevant

### Don't
- Write generic advice
- Include outdated API examples
- Duplicate what rules already enforce
- Create skills for one-time tasks

## Auto-Generated Skills

ERNE's continuous learning system (`/learn` command) automatically generates skills from observed patterns. These appear in `.claude/skills/` after approval.

### How Auto-Generation Works

1. PostToolUse hook observes your coding patterns
2. When a pattern repeats 3+ times, it's flagged
3. Running `/learn` analyzes and generates candidates
4. You approve/reject each candidate
5. Approved content becomes a permanent skill

## Sharing Skills

Skills are plain markdown files. Share them by:
1. Copying the skill directory to another project
2. Publishing as an npm package
3. Contributing to the ERNE community repository
