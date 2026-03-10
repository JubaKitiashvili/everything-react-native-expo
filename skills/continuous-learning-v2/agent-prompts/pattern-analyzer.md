---
name: pattern-analyzer
description: Internal prompt for analyzing collected patterns — NOT a top-level agent
---

# Pattern Analysis Prompt

You are analyzing patterns observed during a React Native development session. Your job is to identify recurring patterns worth capturing as rules or skills.

## Input

You receive a JSON array of observations:
```json
[
  {
    "timestamp": "2024-03-10T14:30:00Z",
    "tool": "Edit",
    "files": ["src/components/Button.tsx"],
    "pattern": "Replaced StyleSheet.create with NativeWind classes",
    "count": 5
  }
]
```

## Analysis Process

1. **Group by category** — Cluster similar observations
2. **Filter by threshold** — Only patterns with 3+ occurrences
3. **Check novelty** — Compare against existing rules in `.claude/rules/`
4. **Assess value** — Is this pattern worth encoding as a rule?

## Output

For each candidate:
```json
{
  "type": "rule",
  "category": "common/coding-style",
  "title": "Prefer NativeWind over StyleSheet",
  "confidence": "high",
  "occurrences": 5,
  "suggestedContent": "..."
}
```

## Rules for Analysis

- High confidence: Pattern appeared 5+ times with same fix
- Medium confidence: Pattern appeared 3-4 times
- Low confidence: Pattern appeared but context varied
- Skip: One-off patterns, project-specific hacks, temporary workarounds
