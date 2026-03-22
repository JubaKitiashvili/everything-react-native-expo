---
name: erne-learn
description: ERNE — Manual skill generation — runs continuous-learning-v2 scripts to extract patterns from session
---

# /erne-learn — Generate Skills from Session

You are executing the `/erne-learn` command. This is **script-driven** — it runs the continuous-learning-v2 pipeline directly.

## What This Does

Analyzes the current coding session to extract reusable patterns and save them as skills or rule amendments for future sessions. This is the manual trigger for what `PostToolUse` hooks do automatically.

## Process

1. **Run the extraction script:**

```bash
node .claude/hooks/scripts/extract-session-patterns.js
```

This script:
- Scans recent tool calls and file changes
- Identifies patterns (repeated fixes, style corrections, common architectures)
- Compares against existing rules and skills
- Generates candidates for new content

2. **Review candidates:**
The script outputs a list of potential learnings:
```
[PATTERN] Zustand store always uses immer middleware → Suggest rule amendment
[PATTERN] All screens use SafeAreaView wrapper → Suggest coding-style rule
[PATTERN] API calls always retry 3 times → Suggest pattern rule
[SKILL] Complex form validation flow → Suggest skill creation
```

3. **Approve or reject each candidate:**
For each candidate, decide:
- **Approve** → Script writes to `.claude/rules/` or `.claude/skills/`
- **Reject** → Skip this pattern
- **Edit** → Modify before saving

4. **Validate new content:**
```bash
node .claude/hooks/scripts/validate-content.js
```
Ensures new rules/skills have valid frontmatter and don't conflict with existing content.

## When to Use
- After a long coding session where you established new patterns
- When you notice yourself repeatedly making the same corrections
- After integrating a new library and establishing conventions
- Periodically to capture accumulated project knowledge

## Note
The automatic `PostToolUse` hook (`continuous-learning-v2.cjs`) does lightweight extraction after every tool call. This `/erne-learn` command runs a comprehensive analysis that catches patterns the real-time hook might miss.
