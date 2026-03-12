# Multi-Agent Pipeline

The ERNE pipeline coordinates multiple agents through a structured sequence of phases to deliver features from plan to production-validated code.

## Overview

The pipeline is managed by the **pipeline-orchestrator** agent and triggered via the `/orchestrate` command. It runs 5 phases, each with a gate that must be satisfied before the next phase begins.

```
architect → senior-developer + feature-builder (parallel) → tdd-guide → code-reviewer → performance-profiler
```

## Phase 1: Plan

**Agent**: architect
**Mode**: Sequential
**Purpose**: Decompose the user's task into an architecture plan that downstream agents can execute against.

**Inputs**:
- User's task description (from `/orchestrate` command)
- Existing codebase context (navigation structure, state management, API patterns)

**Outputs**:
- Architecture document including: file structure, component hierarchy, data flow, navigation changes
- Numbered implementation tasks with clear deliverables and file ownership

**Gate**: Architecture plan is produced. If the architect identifies ambiguities it cannot resolve, it escalates to the user before proceeding.

## Phase 2: Implement

**Agents**: senior-developer + feature-builder
**Mode**: Parallel
**Purpose**: Implement the feature according to the architect's plan.

**Inputs**:
- Architecture document from Phase 1 (via Standard Handoff template)
- Task assignments: the architect's numbered tasks are split between the two agents based on scope
  - **senior-developer**: Screens, hooks, API integration, state management, navigation wiring
  - **feature-builder**: Supporting components, utilities, configuration, and integration glue

**Parallel Execution Rules**:
- Each agent owns distinct files — no two agents modify the same file
- The architect's plan must assign clear file ownership per task
- Both agents receive the full architecture document for context
- The pipeline-orchestrator waits for both agents to complete before advancing
- If one agent finishes early, it does not proceed to Phase 3 alone

**Outputs**:
- Complete implementation across all files specified in the architecture plan
- Each agent reports: files created/modified, assumptions made, known trade-offs

**Gate**: All implementation tasks are marked complete, TypeScript compiles without errors.

## Phase 3: Test

**Agent**: tdd-guide
**Mode**: Sequential
**Purpose**: Write tests for the new code and verify they pass.

**Inputs**:
- Implementation output from Phase 2 (via Standard Handoff template)
- Architecture document from Phase 1 (for understanding intended behavior)
- List of all files created/modified

**Process**:
1. Identify testable units: hooks, utilities, components, screens
2. Write unit tests for hooks and utilities
3. Write component tests for screens (render, interaction, state transitions)
4. Run the full test suite (new tests + existing tests to catch regressions)
5. Report results

**Outputs**:
- Test files for all new code
- Test run results (pass/fail counts, coverage if available)

**Gate**: All new tests pass. All existing tests still pass (no regressions).

## Phase 4: Review

**Agent**: code-reviewer
**Mode**: Sequential
**Purpose**: Review all new and modified code for quality, correctness, and adherence to project standards.

**Inputs**:
- All files from Phase 2 and Phase 3 (via Standard Handoff template)
- Architecture document from Phase 1 (for reviewing against intended design)

**Review Scope**:
- Re-render detection and memoization correctness
- React Native anti-pattern detection
- Platform parity (iOS/Android)
- Expo SDK validation
- Accessibility audit
- Security review
- Test quality review

**Verdicts**:
| Verdict | Meaning | Action |
|---------|---------|--------|
| **PASS** | Code meets all quality gates | Proceed to Phase 5 |
| **FAIL** | Blocking issues found | Return to Phase 2 with QA FAIL handoff |
| **RETRY** | Minor auto-fixable issues | Fix in place, then re-review |

**On FAIL**:
- The code-reviewer produces a QA FAIL handoff (see `docs/handoff-templates.md`) listing all required fixes
- The pipeline returns to Phase 2 with the fix list
- Retry count increments (max 3 attempts total)
- If the failure is traced to a flawed architecture plan, the pipeline may return to Phase 1 instead

**Outputs**:
- Review document with findings grouped by severity
- Verdict: PASS, FAIL, or RETRY

**Gate**: PASS verdict.

## Phase 5: Validate

**Agent**: performance-profiler
**Mode**: Sequential
**Purpose**: Verify that the new code meets performance targets.

**Inputs**:
- All files from Phase 2 (via Standard Handoff template)
- Performance baselines from the project (if available)

**Checks**:
- JS thread FPS impact during relevant interactions
- Bundle size delta (target: <50KB per feature)
- Memory usage during screen transitions (target: <20MB delta)
- Animation performance (Reanimated worklets on UI thread, not JS thread)
- No unnecessary re-renders in new components

**Outputs**:
- Performance report with metrics table (current vs. target vs. status)
- List of optimization opportunities (if any)
- Pass/fail determination

**Gate**: All metrics within acceptable ranges. If metrics are out of range, the profiler reports findings and the pipeline-orchestrator decides whether to retry Phase 2 or escalate.

## Retry Logic

### Rules

1. Each phase gets a maximum of **3 attempts** (1 original + 2 retries)
2. Each retry includes the failure context from all previous attempts
3. Retries are scoped to the failed phase — completed phases are not re-run
4. The retry payload follows this escalation pattern:
   - **Attempt 1**: Original execution
   - **Attempt 2**: Original context + failure reason from attempt 1
   - **Attempt 3**: Original context + failure reasons from attempts 1 and 2

### Retry Flow for Review Failures

The most common retry loop is between Phase 4 (Review) and Phase 2 (Implement):

```
Phase 4: code-reviewer → FAIL
  └── QA FAIL handoff → Phase 2: senior-developer + feature-builder
      └── Fix issues → Phase 3: tdd-guide (re-test)
          └── Phase 4: code-reviewer (re-review)
              ├── PASS → Phase 5
              └── FAIL (attempt 3) → Escalate to user
```

## Escalation Rules

The pipeline-orchestrator escalates to the user when:

1. **Exhausted retries**: A phase has failed 3 times
2. **Multiple phase failures**: Two or more different phases fail in the same pipeline run
3. **Timeout**: A phase exceeds 3x its expected duration
4. **Ambiguity**: An agent reports a requirement it cannot interpret without user input

Escalation uses the Escalation handoff template (see `docs/handoff-templates.md`) and includes:
- What the pipeline was trying to do
- Which phase failed and why (for each attempt)
- What the pipeline-orchestrator recommends the user do

## Parallel Execution Guidelines

### When to Run Agents in Parallel

- **Phase 2 (Implement)**: senior-developer and feature-builder always run in parallel
- Future pipelines may parallelize other phases if agents have non-overlapping scope

### Requirements for Parallel Execution

1. **Non-overlapping file ownership**: Each agent must own distinct files. If two agents need to modify the same file, they must run sequentially.
2. **Shared context**: All parallel agents receive the same input context (architecture plan, prior phase outputs).
3. **Merge before gate**: The pipeline-orchestrator collects all parallel outputs and merges them before evaluating the phase gate.
4. **Independent failure**: If one parallel agent fails, the other is not automatically retried. Only the failed agent retries.

### Anti-Patterns to Avoid

- Do not parallelize agents that depend on each other's output
- Do not run review and implementation in parallel (review requires completed implementation)
- Do not split a single file's implementation across two agents
