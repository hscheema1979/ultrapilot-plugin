---
name: ultra-planning
description: Create detailed implementation plans with domain expert review loop. Adapted from Superpowers v4.3.1 writing-plans skill + OMC + wshobson's domain expert validation.
---

# Ultra Planning (Enhanced with Domain Expert Reviews)

**⚠️ CRITICAL: FULLY AUTONOMOUS WORKFLOW ⚠️**

**NEVER STOP FOR USER INPUT. ALWAYS CONTINUE AUTOMATICALLY.**

This skill must run from start to finish without stopping. The domain expert review loop runs autonomously with revision cycles.

- NO pauses between review cycles
- NO "Should I continue?" questions
- NO waiting for approval after each expert
- Review loop runs autonomously (max 10 revision cycles)
- ONLY stop on ESCALATE conditions (fundamental blockers)
- ALWAYS keep moving forward

---

## Overview

Write comprehensive implementation plans with **explicit I/O contracts and domain expert validation**.

This skill combines:
- **Superpowers writing-plans** - Detailed bite-sized tasks
- **OMC analysis** - Architecture validation
- **Wshobson's domain experts** - Parallel expert reviews
- **Feedback loop** - Revision cycles until approved

**Assumptions:**
- Engineer has zero context for our codebase
- Engineer has questionable taste
- Engineer is skilled but knows nothing about our toolset
- Engineer doesn't know good test design

**Announce at start:** "I'm using the ultra-planning skill to create the implementation plan with domain expert reviews."

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

**Announce at start:** "I'm using the ultra-planning skill to create the implementation plan."

**Context:** This should be run in a dedicated worktree (created by brainstorming skill).

**Save plans to:** `docs/plans/YYYY-MM-DD-<feature-name>.md`

## Bite-Sized Task Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For Autopilot Orchestrator:** This plan is ready for autonomous execution. Execute using Ralph + Ultrawork with QA cycles and multi-perspective validation.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---
```

## Task Structure

````markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

**Step 1: Write the failing test**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

**Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

**Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
````

## Remember
- Exact file paths always
- Complete code in plan (not "add validation")
- Exact commands with expected output
- Reference relevant skills with @ syntax
- DRY, YAGNI, TDD, frequent commits

---

## Phase 1.5: Domain Expert Review Loop (CRITICAL)

**BEFORE invoking autopilot, validate the plan with domain experts!**

This is the **stolen workflow** from Superpowers + OMC + wshobson's agents:
- Superpowers writing skill creates detailed plan (you are here)
- Domain experts review their sections
- Feedback loop with revisions
- Only execute when all experts approve

### Step 1: Identify Domains

Analyze the plan and identify domains:

**Common domains:**
- Frontend (React, Vue, Angular, TypeScript)
- Backend (Node.js, Python, Go, API design)
- Database (PostgreSQL, MongoDB, Redis)
- Infrastructure (Docker, K8s, deployment)
- API Integration (WebSocket, REST, I/O contracts)
- Security (Auth, encryption, OWASP)
- Performance (Caching, optimization)
- Testing (Unit, integration, E2E)

**Map domains to expert agents:**
```
frontend → ultra:frontend-expert
backend → ultra:backend-expert
database → ultra:database-expert
websocket → ultra:api-integration-expert
security → ultra:security-architect
performance → ultra:performance-expert
testing → ultra:testing-expert
infrastructure → ultra:kubernetes-architect
```

### Step 2: Create Detailed Plan Draft

Save the initial plan to: `.ultra/detailed-plan-draft-v1.md`

**Plan structure must include:**
1. Part 1: [Domain 1] - Detailed tasks with I/O contracts
2. Part 2: [Domain 2] - Detailed tasks with I/O contracts
3. Part 3: Cross-Domain I/O Contracts (EXPLICIT!)
4. Part 4: Error Handling Across Boundaries
5. Part 5: Integration Tests
6. Part 6: Success Criteria

### Step 3: Parallel Domain Expert Reviews

**Spawn expert agents in parallel:**

For each domain identified, spawn the corresponding expert:

```
Task(
  subagent_type="ultra:frontend-expert",
  model="opus",
  prompt=`Review the frontend section of the detailed plan:

Plan location: .ultra/detailed-plan-draft-v1.md

Focus on:
1. Technical correctness
2. Missing implementations
3. Integration point issues
4. Error handling gaps
5. I/O contract validation

Output format:
- Status: APPROVED | NEEDS_REVISION | REJECTED
- Critical issues (must fix)
- Recommendations (nice to have)
- I/O contract validations
- Overall assessment`
)

Task(
  subagent_type="ultra:backend-expert",
  model="opus",
  prompt=`Review the backend section...`
)

Task(
  subagent_type="ultra:api-integration-expert",
  model="opus",
  prompt=`Review ALL I/O contracts between domains...`
)

... spawn all relevant experts
```

**Wait for all reviews to complete.**

### Step 4: Aggregate Feedback

Collect all reviews and create aggregation:

**Count approvals:**
```python
total_reviewers = len(reviews)
approved = len([r for r in reviews if r.status == 'APPROVED'])
needs_revision = len([r for r in reviews if r.status == 'NEEDS_REVISION'])
rejected = len([r for r in reviews if r.status == 'REJECTED'])
```

**Categorize issues:**
- **CRITICAL** (blocking) - must fix
- **HIGH** - should fix
- **MEDIUM** - consider fixing
- **LOW** - optional

**Validate I/O contracts:**
- Check each contract status
- List broken/unclear contracts

**Create feedback document:**
`.ultra/detailed-plan-feedback-cycle-{n}.md`

### Step 5: Approval Decision

```python
if approved == total_reviewers:
    return "APPROVED - Proceed to autopilot execution"
elif cycle < 10:
    return "NEEDS_REVISION - Next cycle"
else:
    return "ESCALATE - Max cycles reached, notify architect"
```

**If APPROVED:**
1. Mark plan as final: `.ultra/detailed-plan-final.md`
2. Proceed to autopilot execution (Step 7)

**If NEEDS_REVISION:**
1. Go to Step 6 (Revision cycle)
2. Increment cycle number

**If ESCALATE:**
1. Notify architect of blocking issues
2. Architect makes final decision

### Step 6: Revision Cycle (Repeat if Needed)

**Incorporate all feedback:**

1. Read feedback document
2. Fix all CRITICAL issues
3. Update I/O contracts
4. Add missing error handling
5. Clarify integration points
6. Address HIGH priority issues

**Update plan header:**
```markdown
> Status: REVISED - Re-review in progress
> Cycle: {next_cycle}/10
> Previous: Cycle {prev_cycle} ({status})
> Revisions: {n} critical issues fixed, {m} I/O contracts updated
```

**Save to:** `.ultra/detailed-plan-draft-v{next_version}.md`

**Re-review:**
- Same experts review the revised plan
- Focus on: Did we fix the issues?
- Faster review - only check revisions

**Go back to Step 4** (aggregate feedback)

**Max 10 cycles.**

### I/O Contract Template

Every integration point MUST have explicit I/O contract:

```typescript
// Contract: {CONTRACT_ID}
// Description: {what flows between domains}

// Domains
- From: {domain_1}
- To: {domain_2}

// Schema (TypeScript/JSON)
interface ContractName {
  field1: type;
  field2: type;
  // ...
}

// Example
{
  "sessionId": "uuid-123",
  "content": "message text",
  "timestamp": 1234567890
}

// Error Handling
// On error: {what happens}
// Retry logic: {strategy}
// Fallback: {alternative}
```

### Example: Frontend → Backend I/O Contract

```typescript
// Contract: F-B-001
// Message Flow from Frontend to Backend

// Frontend emits
socket.emit('message:send', {
  sessionId: string,
  content: string,
  timestamp: number
})

// Backend expects
socket.on('message:send', async (payload) => {
  // Validation
  if (!payload.sessionId || !payload.content) {
    throw new Error('INVALID_PAYLOAD')
  }
  // Process...
})

// Error response
socket.on('message:error', {
  error: string,
  code: 'INVALID_PAYLOAD' | 'SESSION_NOT_FOUND' | 'SERVER_ERROR',
  retryable: boolean
})
```

### Success Criteria

**Plan is ready for execution when:**
- [ ] All domain experts approve their sections
- [ ] All I/O contracts are explicit and validated
- [ ] All error handling across boundaries is defined
- [ ] All integration tests are specified
- [ ] Zero critical issues
- [ ] Zero broken I/O contracts

---

## Execution Handoff

**ONLY AFTER domain expert approval!**

**🔥 CRITICAL: AUTOMATICALLY CONTINUE - DO NOT STOP 🔥**

After plan is approved by all domain experts, **IMMEDIATELY AND AUTOMATICALLY** invoke autopilot orchestrator for execution:

**"✓ Plan approved by all domain experts. Saved to `docs/plans/<filename>.md`. Automatically invoking autopilot orchestrator for execution..."**

**REQUIRED:** Execute: `/ultra-lead` or continue directly to execution phase.

**Autopilot orchestrator will:**
- Execute the implementation plan using Ralph + Ultrawork
- Handle parallel execution of independent phases
- Run QA cycles (build, test, fix, repeat up to 10x)
- Perform multi-perspective validation
- Manage state and cleanup

**DO NOT ask user to choose execution approach. DO NOT PAUSE. Autopilot orchestrator handles execution automatically.**
