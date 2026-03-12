# Handoff Templates

These templates define the structured format for communication between agents during pipeline execution. Every handoff between agents must use the appropriate template to ensure no context is lost.

## 1. Standard Handoff

Used for normal agent-to-agent transitions when a phase completes successfully and passes work to the next phase.

```markdown
## Handoff: [Source Agent] → [Target Agent(s)]

### Pipeline
- **Task**: [Original task description]
- **Pipeline ID**: [Identifier for this pipeline run]
- **Phase**: [Completed phase number] → [Next phase number]

### Summary
[1-2 sentence summary of what was accomplished in the completed phase]

### Deliverables
- [File path]: [What was done — created, modified, or deleted]
- [File path]: [What was done]
- ...

### Context for Next Agent
[Relevant decisions, assumptions, or constraints that the next agent needs to know.
This should include anything that is NOT obvious from reading the code alone.]

### Architecture Reference
[Link or summary of the architect's plan, so downstream agents can verify alignment]

### Open Questions
- [Any unresolved items that the next agent should be aware of, or "None"]
```

## 2. QA PASS

Used when the code-reviewer approves the implementation and the pipeline proceeds to the validation phase.

```markdown
## QA PASS: code-reviewer → [Next Agent]

### Pipeline
- **Task**: [Original task description]
- **Pipeline ID**: [Identifier for this pipeline run]
- **Phase**: 4 (Review) → 5 (Validate)
- **Review Attempt**: [1/3, 2/3, or 3/3]

### Verdict: PASS

### Approval Summary
[Brief summary of what was reviewed and why it passed]

### Review Scope
- **Files reviewed**: [count]
- **Issues found**: [count by severity — critical/warning/suggestion]
- **All critical/warning issues**: Resolved

### Evidence
- [ ] All existing tests pass
- [ ] New code has test coverage
- [ ] No TypeScript errors
- [ ] No console.log or debug code remaining
- [ ] Accessibility requirements met
- [ ] Security checks passed

### Positive Observations
- [Good patterns or practices worth noting]

### Suggestions (non-blocking)
- [Optional improvements for future iterations, or "None"]
```

## 3. QA FAIL

Used when the code-reviewer rejects the implementation and sends it back to the implementation phase for fixes.

```markdown
## QA FAIL: code-reviewer → [Implementation Agent(s)]

### Pipeline
- **Task**: [Original task description]
- **Pipeline ID**: [Identifier for this pipeline run]
- **Phase**: 4 (Review) → 2 (Implement) [retry]
- **Attempt**: [1/3, 2/3, or 3/3]

### Verdict: FAIL

### Issues Found

#### Critical (must fix)
1. **[File:line]**: [Description of the issue]
   - **Why it matters**: [Impact — crash, data loss, security vulnerability, etc.]
   - **Suggested fix**: [How to resolve it]

2. **[File:line]**: [Description]
   - **Why it matters**: [Impact]
   - **Suggested fix**: [Resolution]

#### Warnings (should fix)
1. **[File:line]**: [Description]
   - **Suggested fix**: [Resolution]

### Required Actions
- [ ] [Specific action item 1]
- [ ] [Specific action item 2]
- [ ] [Specific action item 3]

### Prior Attempt Context
[If this is attempt 2 or 3, include what was tried in previous attempts and why it was still insufficient.
For attempt 1, write "First attempt."]

### Files to Modify
- [File path]: [What needs to change]
- [File path]: [What needs to change]

### What Passed
[List aspects of the code that are fine and should NOT be changed during the fix]
```

## 4. Escalation

Used when any agent encounters a blocker that cannot be resolved within the retry budget, or when the pipeline-orchestrator determines that user intervention is required.

```markdown
## Escalation: [Source Agent] → User

### Pipeline
- **Task**: [Original task description]
- **Pipeline ID**: [Identifier for this pipeline run]
- **Phase**: [Phase where the blocker occurred]
- **Attempts exhausted**: [e.g., 3/3]

### Blocker
[Clear, concise description of what is blocking progress.
Lead with the problem, not the history.]

### What Was Attempted

#### Attempt 1
- **Action**: [What the agent tried]
- **Result**: [What happened]
- **Failure reason**: [Why it did not work]

#### Attempt 2
- **Action**: [What was adjusted based on attempt 1]
- **Result**: [What happened]
- **Failure reason**: [Why it still did not work]

#### Attempt 3
- **Action**: [What was adjusted based on attempts 1 and 2]
- **Result**: [What happened]
- **Failure reason**: [Why it still did not work]

### Recommended Action
[What the pipeline-orchestrator recommends the user do to unblock the pipeline.
Be specific — "clarify the requirement for X" or "manually fix the native module config in Y".]

### Pipeline State
| Phase | Status | Notes |
|-------|--------|-------|
| Plan | [completed/failed] | [Brief note] |
| Implement | [completed/failed] | [Brief note] |
| Test | [completed/failed] | [Brief note] |
| Review | [completed/failed] | [Brief note] |
| Validate | [pending] | -- |

### Resume Instructions
[How to resume the pipeline after the blocker is resolved.
e.g., "After fixing X, re-run `/orchestrate` or manually trigger Phase 3 onwards."]
```

## Usage Guidelines

1. **Always use the correct template** — Standard for normal flow, QA PASS/FAIL for review outcomes, Escalation for blockers.
2. **Fill every section** — If a section is not applicable, write "N/A" rather than omitting it. Missing sections cause downstream agents to make assumptions.
3. **Be specific about files** — Always list exact file paths, never "the component file" or "the test."
4. **Include context that is not in the code** — Decisions, rejected alternatives, and assumptions are the most valuable parts of a handoff.
5. **Keep summaries scannable** — The receiving agent should understand the handoff in under 30 seconds by reading the Summary and Required Actions sections.
