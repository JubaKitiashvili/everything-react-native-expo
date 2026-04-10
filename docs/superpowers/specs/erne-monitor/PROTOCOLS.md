# @erne/monitor — Protocols & Procedures

> Rules that govern every implementation session. Read once, follow always.

---

## 1. Session Start Protocol

Every session begins with these steps, in order:

1. **Read TRACKER.md** — understand current state, active task, blockers
2. **Check Integration Health** — run existing tests, verify all components work
3. **Review Plan Adherence** — check if any spec sections are falling behind
4. **Pick next task** — from the current phase's task list (never skip ahead)
5. **Read the task's phase document** — understand context, dependencies, acceptance criteria
6. **Announce** — state what you're working on (update TRACKER.md Active Task)

---

## 2. Task Start Protocol

Before writing any code for a task:

1. **Verify dependencies exist and pass tests**
   - Check that all prerequisite tasks are ✅ Done
   - Run tests for dependency components
   - If any dependency fails → fix it first, don't start new task

2. **Analyze the task against the spec**
   - Re-read the relevant spec sections
   - Identify: what files to create, what interfaces to implement, what tests to write
   - Check: does this task's design still make sense given what we've built so far?
   - If design needs adjustment → document the change in Blockers & Decisions, update spec

3. **Analyze integration points**
   - What existing components will this task interact with?
   - What interfaces/types does it consume?
   - What interfaces/types does it expose?
   - Are there any shared state or concurrency concerns?

4. **Only then: start coding**

---

## 3. Task Complete Protocol

A task is NOT done until all of these pass:

### Round 1: Unit Verification
- [ ] All new code has tests
- [ ] All new tests pass
- [ ] No TypeScript errors (`tsc --noEmit`)
- [ ] Linting passes

### Round 2: Integration Verification
- [ ] All EXISTING tests still pass (not just new ones)
- [ ] Manual smoke test — does the component work in context?
- [ ] Check: does this break any other component's interface?
- [ ] Performance check — does this exceed the overhead budget? (§7 of spec)

### Round 3: Plan Adherence Check
- [ ] Compare implementation against spec description for this task
- [ ] Did we implement everything the spec says? (nothing skipped)
- [ ] Did we implement ONLY what the spec says? (no scope creep)
- [ ] If we deviated from spec → document WHY in Blockers & Decisions, update spec

### Round 4: Documentation & Commit
- [ ] Update TRACKER.md:
  - Task status → ✅ Done
  - Files Created column → list created files
  - Tests column → ✅
  - Integrated column → ✅
  - Integration Health table → verify and update
- [ ] Commit with conventional commit format:
  ```
  feat(monitor): add [ComponentName]

  [2-3 sentence description of what was built and why]

  Task: Phase 1a #N
  Spec: §X.Y
  ```
- [ ] Verify commit succeeded (no hook failures)

---

## 4. Session End Protocol

Before ending any session:

1. **Update TRACKER.md**
   - Active Task → current state
   - Session History → add entry with date, tasks completed, notes
   - Integration Health → verify final state
2. **Commit progress notes** (even if task isn't complete)
3. **Note any blockers or decisions** for next session
4. **Never leave uncommitted work** — either commit WIP or stash

---

## 5. Phase Completion Protocol

When all tasks in a phase are ✅:

1. **Full integration test** — run ALL tests from ALL completed phases
2. **Plan Adherence Audit** — review EVERY spec section covered by this phase
   - Create a checklist from the spec
   - Mark each item as implemented or missing
   - If missing → create task to fix before moving to next phase
3. **Performance audit** — measure SDK overhead against budget (§7)
4. **Update TRACKER.md** — phase status → ✅, unblock next phase
5. **Tag commit** — `git tag monitor-phase-1a-complete`
6. **Retrospective note** — what went well, what to improve, lessons learned

---

## 6. Quality Gates

### Per-Task Gates (must pass before ✅)
- Unit tests pass
- Integration tests pass
- TypeScript clean (`tsc --noEmit`)
- No console.log left in production code
- Performance budget not exceeded

### Per-Phase Gates (must pass before next phase)
- All tasks ✅
- Full test suite passes
- Plan adherence audit passes (no gaps)
- Performance overhead within budget
- No known blockers for next phase

### Acceptance Criteria Format
Each task in phase documents has acceptance criteria. They are binary — met or not met. No "partial" completion.

---

## 7. Rollback Protocol

If a task breaks existing integration:

1. **Stop immediately** — don't try to fix forward under pressure
2. **Identify what broke** — run test suite, check which component fails
3. **Assess severity:**
   - Minor (one test fails, easy fix) → fix inline, continue
   - Major (multiple components broken) → `git stash` or `git reset`, analyze root cause
4. **Document in Blockers & Decisions** — what happened, why, what we learned
5. **Re-approach** — may need to redesign the task's approach

---

## 8. Architecture Decision Record (ADR)

When a task requires changing an architectural decision from the spec:

1. **Document in TRACKER.md Blockers & Decisions:**
   ```
   | Date | Type | Description | Resolution | Impact |
   | 2026-XX-XX | ADR | [What changed and why] | [New approach] | [Which phases/tasks affected] |
   ```
2. **Update the spec** — edit design-spec.md with the change
3. **Update affected phase documents** — if task descriptions changed
4. **Never silently deviate** — every spec change must be tracked

---

## 9. Performance Regression Check

After EVERY task (not just performance-related ones):

1. **Bundle size** — check JS bundle contribution hasn't grown unexpectedly
2. **Test execution time** — tests shouldn't slow down significantly
3. **If Phase 2+:** Run Reassure perf tests for SDK overhead

Budget from spec §7:
- CPU: <2% baseline
- Memory: <5MB additional
- Bundle (JS): <50KB gzipped
- Startup impact: <100ms

---

## 10. Breaking Change Protocol

If a task changes a public API or internal interface:

1. **Check all consumers** — grep for usage of the changed interface
2. **Update all consumers** in the same commit (atomic change)
3. **Update tests** — all tests referencing the old API
4. **Document** — note in Blockers & Decisions
5. **Update spec** — if public API changed from spec

---

## 11. Plan Drift Prevention

Mechanisms to ensure we stay aligned with the spec:

### Per-Task Check (Task Start Protocol §2.3)
- "Does this task's design still make sense given what we've built?"
- "Am I implementing what the spec says, or am I improvising?"

### Per-Phase Check (Phase Completion Protocol §5.2)
- Full spec section audit — every bullet point verified

### Per-Session Check (Session End Protocol §4)
- "Did I stay within the planned scope today?"
- "Did I skip anything or add anything unplanned?"

### Red Flags (stop and re-evaluate if any are true):
- Building something not mentioned in ANY phase document
- Skipping a task because "we don't need it anymore" (maybe true, but must be documented)
- A task is taking 3x longer than expected (design issue, not effort issue)
- Two tasks have conflicting implementations (interface mismatch)
- Tests from a previous phase started failing and we don't know why

---

## 12. Commit Convention

```
<type>(monitor): <description>

<body — what was built, why, integration notes>

Task: Phase <X> #<N>
Spec: §<section>
```

Types:
- `feat(monitor):` — new functionality
- `fix(monitor):` — bug fix in existing monitor code
- `refactor(monitor):` — restructuring without behavior change
- `test(monitor):` — adding/updating tests
- `docs(monitor):` — documentation updates
- `chore(monitor):` — tooling, config, dependencies
