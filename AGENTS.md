# Ultrapilot Agent Catalog

Complete documentation of all 20+ specialist agents in Ultrapilot.

## Core Orchestration Agents

### ultra:analyst (Opus)
**Purpose**: Requirements extraction and clarification

**When to use**:
- Phase 0 of autopilot (expansion)
- Ambiguous requirements need clarification
- Acceptance criteria definition

**Capabilities**:
- Requirement extraction from user input
- Ambiguity detection and clarification
- Acceptance criteria definition
- User story formulation

**Example prompts**:
- "Extract requirements for a task management API"
- "Clarify the authentication requirements"
- "Define acceptance criteria for user registration"

---

### ultra:architect (Opus)
**Purpose**: System architecture and technical design

**When to use**:
- Phase 0 of autopilot (expansion)
- System design decisions needed
- API contract definition
- Technology stack selection

**Capabilities**:
- System architecture design
- Component boundary definition
- API contract specification
- Technology stack selection
- Database schema design
- Integration point mapping

**Example prompts**:
- "Design the architecture for a task management REST API"
- "Define API contracts for authentication endpoints"
- "Select technology stack for real-time dashboard"

---

### ultra:planner (Opus)
**Purpose**: Implementation planning and task breakdown

**When to use**:
- Phase 1 of autopilot (planning)
- Complex feature implementation
- Multi-file refactoring
- Integration work

**Capabilities**:
- Task breakdown and sequencing
- Dependency mapping
- File ownership assignment
- Phase-based planning
- Time estimation

**Example prompts**:
- "Create implementation plan for task API"
- "Break down authentication refactoring into phases"
- "Plan integration with payment provider"

---

### ultra:critic (Opus)
**Purpose**: Plan validation and gap analysis

**When to use**:
- After ultra:planner creates a plan
- Before execution begins
- When validating approach

**Capabilities**:
- Plan validation
- Gap identification
- Assumption challenging
- Risk assessment
- Alternative suggestions

**Example prompts**:
- "Validate this implementation plan for gaps"
- "Challenge the assumptions in this architecture"
- "Identify risks in this approach"

---

## Implementation Agents (Tiered)

### ultra:executor-low (Haiku)
**Purpose**: Simple implementation tasks

**When to use**:
- Single file changes
- Straightforward logic
- Type exports and imports
- Minor fixes

**Capabilities**:
- Simple implementations
- Type exports
- Import statement fixes
- Minor bug fixes

**Example prompts**:
- "Add type export for UserConfig interface"
- "Fix import statement in auth.js"
- "Add missing semicolon"

---

### ultra:executor (Sonnet)
**Purpose**: Standard implementation tasks

**When to use**:
- Multi-file implementations
- Moderate complexity
- Feature development
- Standard refactoring

**Capabilities**:
- Feature implementation
- Multi-file refactoring
- API endpoint creation
- Database model implementation
- Service layer development

**Example prompts**:
- "Implement task CRUD endpoints"
- "Create user authentication service"
- "Refactor data layer for separation of concerns"

---

### ultra:executor-high (Opus)
**Purpose**: Complex implementation tasks

**When to use**:
- Architecture changes
- Multi-system integration
- Complex refactoring
- Performance-critical code

**Capabilities**:
- Complex architecture implementation
- Multi-system integration
- Performance optimization
- Security-critical features
- Cross-cutting concerns

**Example prompts**:
- "Implement OAuth2 flow with multiple providers"
- "Refactor entire auth system for security"
- "Integrate with 3rd party payment APIs"

---

## Quality & Testing Agents

### ultra:test-engineer (Sonnet)
**Purpose**: Test strategy and coverage

**When to use**:
- Test planning needed
- Flaky test investigation
- Coverage gaps identified
- Test architecture design

**Capabilities**:
- Test strategy formulation
- Coverage gap analysis
- Flaky test hardening
- Test architecture design
- Assertion improvement

**Example prompts**:
- "Design test strategy for authentication module"
- "Investigate why these tests are flaky"
- "Identify coverage gaps in payment processing"

---

### ultra:verifier (Sonnet)
**Purpose**: Evidence-backed completion verification

**When to use**:
- Phase 5 of autopilot (verification)
- Before claiming completion
- When validating work is done

**Capabilities**:
- Evidence validation
- Completion verification
- Test result confirmation
- Build success verification
- Requirement satisfaction check

**Example prompts**:
- "Verify that the task API is complete"
- "Confirm all tests are passing"
- "Validate that requirements are satisfied"

---

## Review Agents

### ultra:security-reviewer (Sonnet)
**Purpose**: Security vulnerability detection

**When to use**:
- Phase 4 of autopilot (validation)
- Security audit needed
- Before deploying auth changes
- Reviewing sensitive data handling

**Capabilities**:
- OWASP Top 10 vulnerability detection
- Authn/authz validation
- Injection vulnerability detection
- Security anti-pattern detection
- Secret/credential exposure check

**Example prompts**:
- "Review authentication for security vulnerabilities"
- "Check for SQL injection risks"
- "Validate authorization on admin endpoints"

---

### ultra:quality-reviewer (Sonnet)
**Purpose**: Performance and maintainability review

**When to use**:
- Phase 4 of autopilot (validation)
- Performance concerns
- Code quality assessment
- Before merging to main

**Capabilities**:
- Performance bottleneck identification
- Algorithmic complexity analysis
- Maintainability assessment
- Code smell detection
- Anti-pattern identification

**Example prompts**:
- "Review database queries for performance issues"
- "Identify code maintainability concerns"
- "Check for inefficient algorithms"

---

### ultra:code-reviewer (Opus)
**Purpose**: Comprehensive code review

**When to use**:
- Phase 4 of autopilot (validation)
- Final review before merge
- Architectural changes
- Breaking changes

**Capabilities**:
- Logic defect detection
- API contract validation
- Backward compatibility check
- Comprehensive quality review
- Edge case identification

**Example prompts**:
- "Review this PR for logic defects"
- "Validate API contracts haven't changed"
- "Check backward compatibility of this change"

---

## Debugging & Analysis Agents

### ultra:debugger (Sonnet)
**Purpose**: Root cause analysis

**When to use**:
- Bug investigation
- Test failure analysis
- Regression detection
- Unexpected behavior

**Capabilities**:
- Root cause analysis
- Hypothesis-driven investigation
- Regression isolation
- Log analysis
- Stack trace interpretation

**Example prompts**:
- "Investigate why authentication is failing"
- "Find root cause of test failures"
- "Analyze this stack trace"

---

### ultra:scientist (Sonnet)
**Purpose**: Data and statistical analysis

**When to use**:
- Metrics interpretation
- Data pattern analysis
- Statistical analysis needed
- Performance data investigation

**Capabilities**:
- Statistical analysis
- Data pattern recognition
- Metrics interpretation
- Trend analysis
- Correlation detection

**Example prompts**:
- "Analyze these performance metrics"
- "Identify patterns in user behavior data"
- "Interpret these test results statistically"

---

## Support Agents

### ultra:build-fixer (Sonnet)
**Purpose**: Build and toolchain troubleshooting

**When to use**:
- Build failures
- Type errors
- Dependency issues
- Toolchain problems

**Capabilities**:
- Build troubleshooting
- Type error fixing
- Dependency resolution
- Toolchain configuration
- Compilation error fixing

**Example prompts**:
- "Fix TypeScript compilation errors"
- "Resolve dependency conflicts"
- "Fix failing build"

---

### ultra:designer (Sonnet)
**Purpose**: UX/UI architecture

**When to use**:
- UI component structure design
- Interaction design
- UX architecture
- User flow design

**Capabilities**:
- UX architecture design
- Interaction design
- UI component structure
- User flow mapping
- Accessibility consideration

**Example prompts**:
- "Design UI component structure for dashboard"
- "Map out user registration flow"
- "Design interaction patterns for task management"

---

### ultra:writer (Haiku)
**Purpose**: Documentation

**When to use**:
- API documentation needed
- User guide creation
- Migration notes
- README updates

**Capabilities**:
- API documentation
- User guide writing
- Migration note creation
- README maintenance
- Code commenting

**Example prompts**:
- "Write API documentation for task endpoints"
- "Create user guide for authentication"
- "Document migration steps"

---

### ultra:document-specialist (Sonnet)
**Purpose**: External documentation lookup

**When to use**:
- Library/framework docs needed
- API reference lookup
- Best practices research
- Version-specific documentation

**Capabilities**:
- External documentation retrieval
- API reference lookup
- Best practices research
- Version-specific guidance
- Framework pattern identification

**Example prompts**:
- "Find Express.js middleware patterns"
- "Look up React hooks documentation"
- "Research TypeScript best practices"

---

## Wshobson-Inspired Parallel Agents

### ultra:team-lead (Opus)
**Purpose**: Team orchestration

**When to use**:
- Coordinating multiple agents
- Work decomposition
- Lifecycle management
- Multi-agent tasks

**Capabilities**:
- Team orchestration
- Work decomposition
- Task assignment
- Lifecycle management
- Result synthesis

**Example prompts**:
- "Orchestrate team for feature development"
- "Decompose work for parallel execution"
- "Coordinate multiple specialist agents"

---

### ultra:team-implementer (Sonnet)
**Purpose**: Parallel implementation with file ownership

**When to use**:
- Parallel feature development
- File ownership boundaries needed
- Conflict avoidance
- Team-based implementation

**Capabilities**:
- Parallel implementation
- File ownership boundaries
- Conflict avoidance
- Integration coordination
- Ownership protocol

**Example prompts**:
- "Implement authentication module (owns auth/ and middleware/)"
- "Build task management (owns tasks/ and models/)"
- "Create API layer (owns routes/ and api/)"

---

### ultra:team-reviewer (Sonnet)
**Purpose**: Multi-dimensional review

**When to use**:
- Multi-dimensional code review
- Parallel perspective validation
- Finding deduplication
- Severity consolidation

**Capabilities**:
- Multi-dimensional review
- Finding deduplication
- Severity consolidation
- Parallel perspective validation
- Review synthesis

**Example prompts**:
- "Review from security, quality, and architecture perspectives"
- "Validate code across multiple dimensions"
- "Consolidate findings from multiple reviewers"

---

### ultra:team-debugger (Sonnet)
**Purpose**: Hypothesis-driven debugging

**When to use**:
- Complex bug investigation
- Competing theories
- Parallel hypothesis testing
- Evidence ranking

**Capabilities**:
- Hypothesis generation
- Parallel investigation
- Evidence collection
- Likelihood ranking
- Theory validation

**Example prompts**:
- "Investigate competing theories for this bug"
- "Test multiple hypotheses in parallel"
- "Rank likelihood of root causes"

---

## Model Tier Guidelines

**Haiku (Low Tier)**:
- Simple lookups
- Single-file changes
- Straightforward logic
- Documentation

**Sonnet (Medium Tier)**:
- Standard implementation
- Multi-file changes
- Moderate complexity
- Review tasks

**Opus (High Tier)**:
- Architecture decisions
- Complex integrations
- Security-sensitive work
- Cross-cutting concerns

---

## Choosing the Right Agent

| Task Type | Recommended Agent |
|-----------|------------------|
| Extract requirements | ultra:analyst |
| Design system | ultra:architect |
| Plan implementation | ultra:planner |
| Simple fix | ultra:executor-low |
| Feature implementation | ultra:executor |
| Complex refactoring | ultra:executor-high |
| Test strategy | ultra:test-engineer |
| Security review | ultra:security-reviewer |
| Performance review | ultra:quality-reviewer |
| Debug investigation | ultra:debugger |
| Build issues | ultra:build-fixer |
| Documentation | ultra:writer |

---

## wshobson Integration Agents

**Overview**: 177 agents from wshobson/agents integrated with UltraPilot

**Access**: Use `wshobson:` prefix (e.g., `wshobson:backend-security-reviewer`)

**Categories**:
- Security: backend-api-security, incident-response (45 agents)
- Backend: api-integration, database (32 agents)
- Frontend: ui-components, testing (28 agents)
- Testing: test-engineer, code-coverage (22 agents)
- Documentation: tutorial-engineer, writer (18 agents)
- Performance: optimization, monitoring (15 agents)
- Architecture: design, refactoring (17 agents)

**Discovery**: List all wshobson agents:
```bash
# List all 177 agents
cat .wshobson-cache.json | jq '.plugins | keys'

# List agents by plugin
cat .wshobson-cache.json | jq '.plugins["backend-api-security"].agents'

# Get agent details
cat .wshobson-cache.json | jq '.plugins["backend-api-security"].agents[0]'
```

**Usage Example**:
```typescript
// Spawn wshobson agent
const result = await orchestrator.spawnAgent(
  'wshobson:backend-security-reviewer',
  'Review this API for security vulnerabilities',
  { domain: 'security' }
);
```

**Sandboxing**: wshobson agents run with restricted tool access (read-only capabilities)

**For detailed integration guide, see**: `.ultra/WSHOBSON_INTEGRATION.md`
