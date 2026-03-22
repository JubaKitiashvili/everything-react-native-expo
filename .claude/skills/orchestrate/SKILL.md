---
name: orchestrate
description: Run a full multi-agent pipeline from plan to validation using the pipeline-orchestrator agent
---

# /orchestrate — Multi-Agent Pipeline Execution

You are executing the `/orchestrate` command. Use the **pipeline-orchestrator** agent to coordinate a full pipeline across multiple ERNE agents.

## Usage

```
/orchestrate "build user profile screen"
/orchestrate "add pull-to-refresh to the feed"
/orchestrate "implement dark mode toggle"
```

## Pipeline Definition

The standard pipeline runs 5 phases with the following agent sequence:

### Phase 1: Plan (Sequential)
**Agent**: architect
- Decompose the task into an architecture plan
- Define file structure, component hierarchy, data flow, and navigation
- Output: Architecture document with numbered implementation tasks
- **Gate**: Architecture plan produced and confirmed

### Phase 2: Implement (Parallel)
**Agents**: senior-developer + feature-builder (running simultaneously)
- senior-developer: Implements screens, hooks, API integration, state management
- feature-builder: Implements supporting components, utilities, and wiring
- Work is split by the architect's task breakdown — non-overlapping file ownership
- Output: Complete implementation across all specified files
- **Gate**: All implementation tasks marked complete, code compiles

### Phase 3: Test (Sequential)
**Agent**: tdd-guide
- Write unit tests for new hooks and utilities
- Write component tests for new screens
- Run the test suite and ensure all tests pass
- Output: Test files and passing test results
- **Gate**: All tests written and passing

### Phase 4: Review (Sequential)
**Agent**: code-reviewer
- Review all new and modified files
- Check for re-render issues, anti-patterns, platform parity, accessibility, security
- Verdict: **PASS**, **FAIL**, or **RETRY**
  - PASS: Proceed to Phase 5
  - FAIL: Send QA FAIL handoff back to Phase 2 agents with required fixes (up to 3 attempts)
  - RETRY: Minor issues that can be auto-fixed, then re-review
- **Gate**: PASS verdict from code-reviewer

### Phase 5: Validate (Sequential)
**Agent**: performance-profiler
- Measure rendering performance, bundle size impact, and memory usage
- Verify all metrics are within project targets
- Output: Performance report with metrics table
- **Gate**: All performance metrics within acceptable ranges

## Execution Strategy

```
User: /orchestrate "build user profile screen"

pipeline-orchestrator:
  ├── Phase 1: architect (plan)
  │     └── Output: Architecture document
  ├── Phase 2: senior-developer + feature-builder (parallel)
  │     └── Output: Implemented feature code
  ├── Phase 3: tdd-guide (test)
  │     └── Output: Tests written and passing
  ├── Phase 4: code-reviewer (review)
  │     ├── PASS → proceed
  │     └── FAIL → retry Phase 2 (max 3 attempts)
  └── Phase 5: performance-profiler (validate)
        └── Output: Performance report
```

## Retry & Escalation

- Failed phases retry up to **3 times** with accumulated context from prior failures
- If a phase fails 3 times, the pipeline-orchestrator escalates to the user with:
  - What was attempted
  - Why it failed each time
  - Recommended manual intervention
- Review FAIL loops back to implementation, not to planning (unless the architect's plan is identified as the root cause)

## Output Format

The pipeline-orchestrator provides a live progress table and a final summary:

```
## Pipeline: [Task Description]

| Phase | Agent(s) | Status | Duration | Attempts |
|-------|----------|--------|----------|----------|
| Plan | architect | completed | 42s | 1/3 |
| Implement | senior-developer, feature-builder | completed | 3m 15s | 1/3 |
| Test | tdd-guide | completed | 1m 30s | 1/3 |
| Review | code-reviewer | completed (PASS) | 55s | 1/3 |
| Validate | performance-profiler | completed | 40s | 1/3 |

### Total Duration: 6m 42s
### Files Created/Modified: [list]
### Final Status: SUCCESS
```

## Notes

- The pipeline-orchestrator does not write code — it coordinates agents
- Handoffs between agents follow the templates in `docs/handoff-templates.md`
- Full pipeline documentation is in `docs/pipeline.md`
- If the task is too small for a full pipeline (e.g., a one-file fix), consider using `/code` or `/tdd` instead
