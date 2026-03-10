# UltraPilot Installation Guide

**Version:** 1.0.0  
**Last Updated:** 2025-03-08

---

## Quick Install

```bash
# 1. Clone or download UltraPilot
git clone https://github.com/hscheema1979/ultrapilot.git ~/.claude/plugins/ultrapilot

# 2. Install hooks
node ~/.claude/plugins/ultrapilot/scripts/install-hooks.mjs

# 3. Restart Claude Code sessions
# Exit all sessions and start new ones

# Done! Hooks are now active
```

---

## What Gets Installed

### Plugin Components
- ✅ 18 skills (autopilot, ultra-ralph, ultra-team, etc.)
- ✅ 73 agent plugins (ultra:analyst, ultra:architect, etc.)
- ✅ Relay Web UI integration (Clay v2.7.0)
- ✅ 10 PreToolUse hooks

### Hooks (10 Total)
1. **Execution Enforcement** - Blocks unauthorized code writes
2. **Tmux Reminder** - Suggests tmux for long commands
3. **Git Push Reminder** - Reminds to review before push
4. **Doc File Warning** - Warns about scattered docs
5. **Compact Suggester** - Suggests /compact after 50 calls
6. **TODO Warning** - Catches TODO/FIXME comments
7. **Mock Warning** - Detects mock implementations
8. **Completeness Check** - Checks for empty functions
9. **Auto Tmux Dev** - Auto-runs dev servers in background
10. **Observation Logger** - Logs tool usage

---

## How It Works

### Plugin vs Hooks

**Important:** Claude Code does NOT automatically load hooks from plugins!

- **Plugin directory** (`~/.claude/plugins/ultrapilot/`)
  - Contains skills, agents, hooks scripts
  - Referenced in `~/.claude/settings.json` → `enabledPlugins`

- **Hooks configuration** (`~/.claude/settings.json`)
  - MUST be manually added or installed via script
  - NOT automatically loaded from plugin

### Installation Script

The `install-hooks.mjs` script automatically:
1. Reads hooks from `~/.claude/plugins/ultrapilot/hooks/hooks.json`
2. Merges them into `~/.claude/settings.json`
3. Preserves existing hooks
4. Avoids duplicates

---

## Verification

### Check Plugin is Enabled
```bash
cat ~/.claude/settings.json | grep "ultrapilot"
# Should show: "ultrapilot@local": true
```

### Check Hooks are Installed
```bash
cat ~/.claude/settings.json | grep -A5 "PreToolUse"
# Should show 10 hooks
```

### Test Hooks are Active
```bash
# In a Claude Code session, try:
Edit a file with // TODO
# Should see: [UltraPilot Hook] ⚠️  TODO/FIXME warning
```

---

## Manual Installation (If Script Fails)

If the installation script doesn't work:

```bash
# 1. Backup your settings
cp ~/.claude/settings.json ~/.claude/settings.json.backup

# 2. Read UltraPilot hooks
cat ~/.claude/plugins/ultrapilot/hooks/hooks.json

# 3. Manually copy hooks into ~/.claude/settings.json
# Add to: "hooks" → "PreToolUse" array
```

---

## Updating

When you pull updates to UltraPilot:

```bash
# 1. Pull latest changes
cd ~/.claude/plugins/ultrapilot
git pull

# 2. Reinstall hooks (overwrites existing, preserves others)
node ~/.claude/plugins/ultrapilot/scripts/install-hooks.mjs

# 3. Restart Claude Code sessions
```

---

## Uninstallation

### Remove Hooks Only
```bash
# Edit ~/.claude/settings.json
# Remove UltraPilot hooks from "hooks" → "PreToolUse" array
# Keep hooks that have:
# - "ultrapilot" in description
# - "Execution Enforcement"
# - "Auto Tmux Dev"
```

### Remove Entire Plugin
```bash
# 1. Remove plugin from settings.json
# Edit ~/.claude/settings.json
# Set: "ultrapilot@local": false

# 2. Remove hooks (see above)

# 3. Delete plugin directory
rm -rf ~/.claude/plugins/ultrapilot
```

---

## Troubleshooting

### Hooks Not Firing

**Problem:** Hooks installed but not working

**Solution:**
```bash
# 1. Verify hooks are in settings.json
cat ~/.claude/settings.json | grep "PreToolUse"

# 2. Restart ALL Claude Code sessions
# Exit completely, then start new sessions

# 3. Check hook scripts are executable
ls -la ~/.claude/plugins/ultrapilot/hooks/**/*.js
```

### Installation Script Fails

**Problem:** Script error during installation

**Solution:**
```bash
# Check Node.js is installed
node --version

# Check file exists
ls -la ~/.claude/plugins/ultrapilot/scripts/install-hooks.mjs

# Try manual installation (see above)
```

### PM2 Restart Issues

**Problem:** PM2 restart doesn't help

**Reason:** PM2 only manages Relay Web UI, not Claude CLI

**Solution:**
```bash
# Restart Claude CLI sessions, not PM2
# Exit Claude sessions and start new ones
```

---

## Architecture

```
Claude Code Startup
  ↓
Loads ~/.claude/settings.json
  ↓
Checks enabledPlugins: ultrapilot@local
  ↓
Loads plugin from ~/.claude/plugins/ultrapilot/
  ↓
Reads skills/ and agents-lib/plugins/
  ↓
Loads PreToolUse hooks from settings.json
  ↓
Hooks are now active for all tool calls
```

**Key Point:** Hooks are loaded from `settings.json`, NOT from plugin directory!

---

## Support

- **Issues:** https://github.com/hscheema1979/ultrapilot/issues
- **Documentation:** `/home/ubuntu/.claude/plugins/ultrapilot/docs/`
- **Hooks Reference:** `/home/ubuntu/.claude/plugins/ultrapilot/docs/hooks/`

---

**Credits:** Inspired by everything-claude-code (affaan-m, 66k ⭐)
