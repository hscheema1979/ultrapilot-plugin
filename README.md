# Ultrapilot - Universal Development Workflow

**The ONE plugin you need.**

Ultrapilot is a unified development workflow plugin that combines the best of:
- **OMC** (oh-my-claudecode) - Agent orchestration and state management
- **Superpowers** - Phased development workflows
- **Wshobson's Agents** - Parallel execution with file ownership
- **Relay Web UI** - Production-ready web interface
- **Google Chat Integration** - Secondary interface for remote collaboration

## All-in-One Package

One plugin deployment gives you:
- ✅ **140+ Specialist Agents** for autonomous development
- ✅ **Relay Web UI** (port 3002) - Full-featured web interface
- ✅ **UltraX Gateway** (port 3001) - API server for integrations
- ✅ **Unified Management** - Single entry point to control everything

## How UltraPilot Works

UltraPilot uses an **agency organizational model** where you provide direction and autonomous agents execute:

```
┌─────────────────────────────────┐
│  YOU (Owner/CEO)                 │
│  - Set vision and goals          │
└────────────┬────────────────────┘
             │
┌────────────▼────────────────────┐
│  CLAUDE (COO/Operating Partner)  │
│  - Architecture & Resources     │
│  - Agent orchestration         │
└────────────┬────────────────────┘
             │
┌────────────▼────────────────────┐
│  Domain Manager (UltraLead)      │
│  - Task breakdown              │
│  - Domain coordination          │
└────────────┬────────────────────┘
             │
┌────────────▼────────────────────┐
│  Autonomous Agents (UltraWorkers) │
│  - Execute missions            │
│  - Report progress             │
└────────────────────────────────┘
```

**Your Role:** You're the CEO — you set the vision and goals.
**Claude's Role:** Claude is the COO — designs systems and coordinates agents.
**Agents' Role:** Autonomous executors — they complete the work without micromanagement.

## The One Command

```bash
/ultrapilot <what you want to build>
```

That's it. One command handles everything:
- ✅ Requirements expansion
- ✅ Architecture design
- ✅ Implementation planning
- ✅ Parallel development with file ownership
- ✅ QA cycles (build, test, fix, repeat)
- ✅ Multi-perspective validation (security, quality, performance)
- ✅ Evidence-backed verification

## Installation

```bash
# Clone the repository
cd ~/.claude/plugins/
git clone https://github.com/hscheema1979/ultrapilot.git

# Run the installer
cd ultrapilot
node scripts/install.mjs
```

The installer will:
1. Copy skills to `~/.claude/skills/`
2. Set up the HUD CLI
3. Configure `settings.json`
4. Create `.ultra/` directory structure
5. Prepare unified startup scripts

### Updating After Pulling Changes

After pulling changes from GitHub, update your local installation:

```bash
cd ~/.claude/plugins/ultrapilot
git pull origin main

# Option 1: Update skills only
node ultrapilot/scripts/update-skills.mjs

# Option 2: Re-run full installation
node scripts/install.mjs
```

The `update-skills.mjs` script syncs skill files from the repository to your global `~/.claude/skills/` directory.

## Configuration

Add to `~/.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "ultrapilot@local": true
  },
  "statusLine": {
    "type": "command",
    "command": "node ~/.claude/plugins/ultrapilot/cli/hud.mjs"
  }
}
```

## Plugin Structure

```
~/.claude/plugins/ultrapilot/
├── src/
│   ├── agents.ts      # Agent catalog (29 specialist agents)
│   ├── state.ts       # State management system
│   ├── hud.ts         # HUD renderer
│   ├── server.ts      # UltraX Gateway API server
│   └── index.ts       # Main exports
├── cli/
│   └── hud.mjs        # Statusline CLI entry point
├── scripts/
│   └── install.mjs    # Installation script
├── skills/            # Skill definitions (copied to ~/.claude/skills/)
├── start.sh           # Unified startup script (Relay + Gateway)
├── status.sh          # Check status of all services
├── stop.sh            # Stop services gracefully
├── start.mjs          # Node.js version of startup
└── package.json
```

## Architecture: Phase 1 - Complete Integration ✅

### Key Design Principle: **One Plugin = Everything**

**Phase 1 Status**: ✅ COMPLETE - All systems operational

```
ultrapilot/ (ONE REPO - ONE CLONE = EVERYTHING)
│
├── relay/              ← Relay Web UI (embedded, as-is)
│   ├── lib/            ← All Relay code (unchanged)
│   ├── bin/            ← CLI with --dangerously-skip-permissions
│   └── package.json
│
├── src/                ← Ultrapilot Core
│   ├── agents.ts      ← 29 specialist agents
│   ├── state.ts       ← State management
│   ├── hud.ts         ← HUD system
│   └── server.ts      ← UltraX Gateway (port 3001)
│
├── scripts/
│   └── install.mjs
│
├── start.sh           ← Starts Relay + Gateway together
├── status.sh
└── stop.sh
```

### Phase 1 Features

✅ **Complete Relay Integration**
- All Relay code embedded in `relay/`
- Runs with `--dangerously-skip-permissions` by default
- Zero functional changes to Relay
- Works exactly like standalone Relay

✅ **UltraX Gateway**
- REST API server (port 3001)
- Google Chat webhook handler
- Relay integration endpoints

✅ **Unified Management**
- `./start.sh` - Start both services
- `./status.sh` - Check all services
- `./stop.sh` - Stop gracefully

### Phase 2 (Future): UI Enhancements

Planned enhancements to Relay UI:
- Ultrapilot sidebar menu items
- Ralph loop status display
- Task queue viewer
- Quality gates dashboard
- `.ultra/` state file viewers

## 🎯 Integration Status

### ✅ All Systems Operational (Phase 1 Complete)

| Component | Port | Status | Access |
|-----------|------|--------|--------|
| **Relay Web UI** | 3002 | ✅ Running | http://localhost:3002 |
| **UltraX Gateway** | 3001 | ✅ Running | http://localhost:3001 |
| **Google Chat Webhook** | N/A | ⚠️ Ready | Requires setup |
| **Domain Framework** | N/A | ✅ Available | Skills installed |

### Quick Start

```bash
# Start all services
cd ~/.claude/plugins/ultrapilot
./start.sh

# Check status
./status.sh

# Access Web UI
# Local: http://localhost:3002
# Remote (via Tailscale): http://vps5:3002
```

### What's Working

✅ **Relay Web UI** (Port 3002)
- Full session management
- File browser and terminal
- Real-time agent monitoring
- Ultrapilot command execution

✅ **UltraX Gateway** (Port 3001)
- REST API for integrations
- Health monitoring
- Session management
- Google Chat webhook handler

✅ **Domain Agency Framework**
- `ultra-domain-setup` - Interactive domain configuration
- `ultra-autoloop` - Persistent domain heartbeat
- Ready for deployment in future sessions

### Optional: Google Chat Setup

```bash
./setup-google-chat.sh
```

**Follow the prompts**:
1. Create Google Chat webhook
2. Configure endpoint
3. Test integration
4. Send commands via Chat

**For detailed integration status, see**: [WEBUI-GCHAT-INTEGRATION-STATUS.md](WEBUI-GCHAT-INTEGRATION-STATUS.md)

---

## Agent Catalog

### Core Orchestration
- `ultra:analyst` - Requirements extraction
- `ultra:architect` - System architecture
- `ultra:planner` - Implementation planning
- `ultra:critic` - Plan validation

### Implementation (Tiered)
- `ultra:executor-low` (Haiku) - Simple tasks
- `ultra:executor` (Sonnet) - Standard tasks
- `ultra:executor-high` (Opus) - Complex tasks

### Quality & Testing
- `ultra:test-engineer` - Test strategy
- `ultra:verifier` - Evidence verification
- `ultra:security-reviewer` - Security audit
- `ultra:quality-reviewer` - Performance & maintainability
- `ultra:code-reviewer` - Comprehensive review

### Debugging & Analysis
- `ultra:debugger` - Root-cause analysis
- `ultra:scientist` - Data analysis

### Support
- `ultra:build-fixer` - Build/toolchain issues
- `ultra:designer` - UX/UI architecture
- `ultra:writer` - Documentation
- `ultra:document-specialist` - External docs lookup

### Wshobson-Inspired Parallel Agents
- `ultra:team-lead` - Team orchestration
- `ultra:team-implementer` - Parallel implementation with file ownership
- `ultra:team-reviewer` - Multi-dimensional review
- `ultra:team-debugger` - Hypothesis-driven debugging

## Available Commands

### Development Commands

| Command | Description |
|---------|-------------|
| `/ultrapilot <task>` | Main command - autonomous development |
| `/ultra-team N=3 <task>` | Spawn 3 parallel agents |
| `/ultra-ralph <task>` | Persistent execution loop |
| `/ultra-review <code>` | Multi-dimensional review |
| `/ultra-hud` | Configure HUD |
| `/ultra-cancel` | Cancel active mode |

### Service Management (From Plugin Directory)

| Command | Description |
|---------|-------------|
| `./start.sh` | Start all services (Relay + Gateway) |
| `./status.sh` | Check status of all services |
| `./stop.sh` | Stop services gracefully |
| `node start.mjs` | Node.js version of startup |

### Access Points

| Service | Local URL | Tailscale URL |
|---------|-----------|---------------|
| Relay Web UI | http://localhost:3002 | http://vps5:3002 |
| UltraX Gateway | http://localhost:3001 | http://vps5:3001 |
| API Docs | http://localhost:3001 | http://vps5:3001 |
| Health Check | http://localhost:3001/health | http://vps5:3001/health |

## State Management

All state lives under `.ultra/`:
- `.ultra/state/autopilot-state.json` - Current phase, status
- `.ultra/state/ralph-state.json` - Loop iteration, errors
- `.ultra/state/ultraqa-state.json` - QA cycle state
- `.ultra/state/validation-state.json` - Reviewer status
- `.ultra/spec.md` - Requirements & architecture
- `.ultra/plan.md` - Implementation plan

## HUD Display

Real-time statusline showing:

**Focused** (default):
```
[ULTRA] EXEC | ralph:3/10 | qa:2/5 | running | ctx:67% | tasks:5/12 | agents:3 | bg:2/5
```

**Full** (with agent details):
```
[ULTRA] EXEC | ralph:3/10 | qa:2/5 | running | ctx:[████░░]67% | tasks:5/12
├─ s executor    2m   implementing authentication module
├─ h designer    45s   creating UI mockups
└─ O verifier    1m   running test suite
```

## Phases

### Phase 0 - Expansion
1. ultra:analyst extracts requirements
2. ultra:architect creates technical specification
Output: `.ultra/spec.md`

### Phase 1 - Planning
1. ultra:planner creates implementation plan
2. ultra:critic validates plan
Output: `.ultra/plan.md`

### Phase 2 - Execution
Spawn parallel executors with file ownership:
- agent-1: auth/, middleware/, utils/auth.js
- agent-2: tasks/, models/, controllers/tasks.js
- agent-3: routes/, api/, controllers/api.js

### Phase 3 - QA
Cycle up to 10 times:
1. Build → Lint → Test
2. Fix failures
3. Repeat

### Phase 4 - Validation
Parallel reviewers:
- ultra:security-reviewer
- ultra:quality-reviewer
- ultra:code-reviewer

### Phase 5 - Verification
- ultra:verifier confirms completion with evidence
- Tests passing? ✓
- Build successful? ✓
- All reviewers approved? ✓

## Configuration

`~/.claude/settings.json`:
```json
{
  "enabledPlugins": {
    "ultrapilot@local": true
  },
  "statusLine": {
    "type": "command",
    "command": "node ~/.claude/plugins/ultrapilot/cli/hud.mjs"
  },
  "ultra": {
    "autopilot": {
      "maxIterations": 10,
      "maxQaCycles": 10,
      "maxValidationRounds": 10,
      "pauseAfterExpansion": false,
      "pauseAfterPlanning": false,
      "skipQa": false,
      "skipValidation": false,
      "fileOwnership": true,
      "parallelExecution": true
    }
  }
}
```

## Quick Start

### 1. Start All Services

```bash
cd ~/.claude/plugins/ultrapilot
./start.sh
```

Output:
```
╔═══════════════════════════════════════════════════════════════╗
║           🦎 ULTRAX - All-in-One Plugin for Claude Code          ║
║                                                                   ║
║  One plugin. Zero setup. Everything you need.                 ║
╚═══════════════════════════════════════════════════════════════╝

🚀 Starting Relay Web UI (port 3002)...
✅ Relay running on http://localhost:3002

🚀 Starting UltraX Gateway (port 3001)...
✅ Gateway running on http://localhost:3001

✨ ALL SERVICES RUNNING
```

### 2. Check Status

```bash
./status.sh
```

### 3. Access Interfaces

- **Web UI**: Open http://localhost:3002 (or http://vps5:3002 via Tailscale)
- **API Gateway**: http://localhost:3001 (or http://vps5:3001 via Tailscale)
- **Google Chat**: Configure webhook at http://localhost:3001/webhook/google-chat

### 4. Stop Services

```bash
./stop.sh
```

## VPS Deployment

### On Your VPS (e.g., vps5):

1. **Clone and Install:**
```bash
cd ~/.claude/plugins/
git clone https://github.com/hscheema1979/ultrapilot.git
cd ultrapilot
node scripts/install.mjs
```

2. **Enable Tailscale (for remote access):**
```bash
sudo tailscale up
# Note your hostname (e.g., vps5)
```

3. **Configure Gateway as Systemd Service:**
```bash
sudo cp scripts/ultrax-server.service /etc/systemd/system/
sudo systemctl enable ultrax-server
sudo systemctl start ultrax-server
```

4. **Start All Services:**
```bash
cd ~/.claude/plugins/ultrapilot
./start.sh
```

5. **Access from Anywhere:**
- Relay Web UI: http://vps5:3002
- Gateway API: http://vps5:3001

### systemd Service Management

```bash
# Check Gateway status
sudo systemctl status ultrax-server

# Restart Gateway
sudo systemctl restart ultrax-server

# View Gateway logs
sudo journalctl -u ultrax-server -f

# Stop Gateway
sudo systemctl stop ultrax-server
```

## Google Chat Integration

### Setup

1. **Create a Google Chat webhook:**
   - Go to Google Chat → Space → Configure Webhooks
   - Copy the webhook URL

2. **Configure UltraX Gateway:**
```bash
# Add webhook URL to environment or config
export GOOGLE_CHAT_WEBHOOK_URL="https://chat.googleapis.com/v1/spaces/XXX/messages?key=YYY&token=ZZZ"
```

3. **Test Integration:**
```bash
curl -X POST http://localhost:3001/webhook/google-chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello from UltraX!"}'
```

### Usage

Send messages to your Google Chat space to:
- Monitor agent activity
- Receive build/test notifications
- Query system status
- Trigger specific commands

## License

MIT

## Credits

Combines the best of:
- [oh-my-claudecode](https://github.com/oh-my-claudecode) - Agent orchestration
- [Superpowers](https://github.com/oh-my-claudecode) - Phased development workflows
- [Wshobson's agents](https://github.com/wshobson) - Parallel execution with file ownership
- [Claude Relay](https://github.com/chadbyte/claude-relay) - Production-ready web interface
