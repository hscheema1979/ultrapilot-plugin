# Ultrapilot Plugin

**The ONE plugin you need.**

Ultrapilot is a standalone Claude Code plugin that combines the best of OMC orchestration, Superpowers workflows, and wshobson's parallel agent patterns into a unified system.

## 🚀 Quick Start

```bash
cd ~/.claude/plugins/
git clone https://github.com/hscheema1979/ultrapilot-plugin.git
cd ultrapilot-plugin
npm install
npm run build
```

## 💡 Usage

Once installed, use the main command:

```bash
/ultrapilot <what you want to build>
```

That's it. One command handles everything:
- ✅ Deep requirements exploration
- ✅ Architecture design
- ✅ Implementation planning
- ✅ Parallel development with file ownership
- ✅ Automatic QA cycles (build, test, fix, repeat)
- ✅ Multi-perspective validation (security, quality, performance)
- ✅ Evidence-backed verification

## 🎯 What Makes Ultrapilot Different

### 1. True Parallel Agent Orchestration
Combines OMC's workflow with wshobson's parallel patterns:
- **Process-level parallelism**: Agents work simultaneously
- **File ownership boundaries**: Prevents merge conflicts
- **Hypothesis-driven debugging**: Competing theories tested in parallel
- **Multi-dimensional review**: Security, performance, architecture concurrently

### 2. 20+ Specialist Agents
All built-in, no external dependencies:
- **Core**: analyst, architect, planner, critic
- **Implementation**: executor (haiku/sonnet/opus tiers)
- **Quality**: test-engineer, verifier
- **Review**: security, quality, code reviewers
- **Support**: debugger, build-fixer, designer, writer

### 3. Intelligent Phase Management
- **Phase 0**: Requirements → Architecture → Spec
- **Phase 1**: Planning → Validation
- **Phase 2**: Parallel execution with file ownership
- **Phase 3**: QA cycles (up to 5 iterations)
- **Phase 4**: Multi-perspective validation
- **Phase 5**: Evidence-backed verification

### 4. Self-Healing Execution
- **Ralph loop**: Persists through errors until done
- **UltraQA**: Automatic fix cycles
- **Smart escalation**: Detects fundamental issues

## 📚 Available Commands

| Command | Description |
|---------|-------------|
| `/ultrapilot <task>` | Main command - autonomous development |
| `/ultra-team N=3 <task>` | Spawn 3 parallel agents |
| `/ultra-ralph <task>` | Persistent execution |
| `/ultra-review <code>` | Multi-dimensional review |
| `/ultra-hud` | Configure HUD |
| `/ultra-cancel` | Cancel active mode |

## 📖 Documentation

- **[AGENT_CATALOG.md](docs/AGENT_CATALOG.md)** - Complete list of 20+ specialist agents
- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** - System architecture
- **[INSTALLATION.md](docs/INSTALLATION.md)** - Detailed installation guide

## 🏗️ Architecture

```
~/.claude/plugins/ultrapilot-plugin/
├── src/                    # Core plugin code
│   ├── agents.ts           # Agent catalog
│   ├── state.ts            # State management
│   └── index.ts            # Main entry point
├── skills/                 # All skills (autopilot, ralph, team, etc)
├── cli/                    # HUD CLI
├── agents-lib/             # Agent library
├── tests/                  # Test suite
└── dist/                   # Built output
```

## 🔧 Configuration

Plugin settings in `~/.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "ultrapilot-plugin": true
  },
  "statusLine": {
    "type": "command",
    "command": "node ~/.claude/plugins/ultrapilot-plugin/cli/hud.mjs"
  }
}
```

## 🎓 Example Session

```
User: /ultrapilot Build me a REST API for task management

[Phase 0: Expansion]
→ ultra:analyst extracts requirements
→ ultra:architect designs system
→ Spec: .ultra/spec.md

[Phase 1: Planning]
→ ultra:planner creates implementation plan
→ ultra:critic validates
→ Plan: .ultra/plan.md (draft)

[Phase 2: Execution]
→ ultra:team-implementer (auth/) - authentication module
→ ultra:team-implementer (tasks/) - task CRUD
→ ultra:team-implementer (api/) - REST endpoints
→ Parallel work with file ownership

[Phase 3: QA]
→ Build → Lint → Test → Fix
→ Cycle 1: 3 tests failing
→ Cycle 2: 1 test failing
→ Cycle 3: All passing ✓

[Phase 4: Validation]
→ ultra:security-reviewer: APPROVED
→ ultra:quality-reviewer: APPROVED
→ ultra:code-reviewer: APPROVED

[COMPLETE]
✓ Task management REST API ready
  - 12 endpoints created
  - 47 tests passing
  - Production ready
```

## 🤝 Contributing

Contributions welcome! Please read our contributing guidelines before submitting PRs.

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Credits

Ultrapilot combines the best of:
- **OMC (oh-my-claudecode)** - Agent orchestration patterns
- **Superpowers** - Phased development workflows
- **Wshobson's Agents** - Parallel execution with file ownership

---

**One plugin. One command. Everything you need.**
