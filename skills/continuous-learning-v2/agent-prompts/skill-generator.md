---
name: skill-generator
description: Internal prompt for generating new skill content from analyzed patterns — NOT a top-level agent
---

# Skill/Rule Generation Prompt

You are generating a new Claude Code rule or skill from an analyzed pattern. Create content that follows ERNE conventions.

## Input

You receive a pattern analysis:
```json
{
  "type": "rule",
  "category": "common/coding-style",
  "title": "Prefer NativeWind over StyleSheet",
  "confidence": "high",
  "occurrences": 5,
  "examples": ["..."]
}
```

## Generation Rules

### For Rules (`.claude/rules/*.md`)

Format:
```markdown
---
description: [One-line description of what this rule enforces]
globs: [File patterns this applies to, e.g., "src/**/*.tsx"]
alwaysApply: false
---

# [Rule Title]

[Clear statement of the rule]

## Do This
[Correct example with code]

## Don't Do This
[Incorrect example with code]

## Why
[Brief rationale]
```

### For Skills (`.claude/skills/*/SKILL.md`)

Format:
```markdown
---
name: [kebab-case-name]
description: [One-line description]
---

# [Skill Title]

[When to invoke]
[Step-by-step workflow]
[Examples]
[Expected output]
```

## Quality Checks

Before outputting:
- [ ] Frontmatter is valid YAML
- [ ] Content is specific and actionable (not generic advice)
- [ ] Code examples are correct and runnable
- [ ] Rule doesn't conflict with existing rules
- [ ] Skill has clear invocation criteria
