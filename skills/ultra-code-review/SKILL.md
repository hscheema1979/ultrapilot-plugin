---
name: ultra-code-review
description: "Comprehensive code review covering logic, maintainability, anti-patterns, naming, and idioms."
attribution: Based on code review skills from Everything-Claude-Code (affaan-m/everything-claude-code)
---

# Ultra Code Review

Reviews code for quality, maintainability, and correctness.

## Review Areas

- **Logic**: Correctness, edge cases, error handling
- **Maintainability**: Readability, modularity, documentation
- **Anti-patterns**: Code smells, duplication, complexity
- **Naming**: Clear, consistent, idiomatic
- **Performance**: Hotspots, optimization opportunities

## Output

```markdown
# Code Review

## Issues
- Line 15: Function does two things (SRP violation)
- Line 42: Magic number '3600' should be constant

## Suggestions
- Extract to `authenticateAndFetch()`
- Define `SECONDS_PER_HOUR = 3600`

## Approval
✅ APPROVED - Minor suggestions only
```
