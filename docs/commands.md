# ERNE Commands

Commands are slash-prefixed actions that orchestrate agents for specific tasks.

## All Commands

### Core Workflow
| Command | Purpose | Agents |
|---------|---------|--------|
| `/plan` | Design feature architecture | architect |
| `/code` | Implement features | senior-developer |
| `/feature` | Build focused feature unit | feature-builder |
| `/code-review` | Full code review | code-reviewer + performance-profiler |
| `/tdd` | Test-first development | tdd-guide |
| `/build-fix` | Fix build failures | expo-config-resolver |
| `/perf` | Performance profiling | performance-profiler |
| `/upgrade` | Version migration | upgrade-assistant |
| `/native-module` | Create native modules | native-bridge-builder → code-reviewer |
| `/navigate` | Navigation design | architect |

### Extended
| Command | Purpose | Agents |
|---------|---------|--------|
| `/animate` | Implement animations | ui-designer |
| `/deploy` | Validate and submit | expo-config-resolver + code-reviewer |
| `/component` | Design + test component | ui-designer + tdd-guide |
| `/debug` | Systematic diagnosis | performance-profiler |
| `/quality-gate` | Pre-merge checks | code-reviewer + performance-profiler |
| `/orchestrate` | Run multi-agent pipeline | pipeline-orchestrator |

### Script-Driven
| Command | Purpose | What It Runs |
|---------|---------|-------------|
| `/learn` | Generate skills from patterns | continuous-learning-v2 scripts |
| `/retrospective` | Session analysis | evaluate-session.js |
| `/setup-device` | Install agent-device MCP | Setup script |

## Using Commands

Type any command in Claude Code:
```
/plan Add user authentication with biometric login
```

Commands that use multiple agents show combined output. Parallel agents run simultaneously for speed.

## agent-device Enhancement

When agent-device MCP is installed, several commands gain visual capabilities:

| Command | Without | With agent-device |
|---------|---------|------------------|
| `/debug` | Log analysis | + Screenshots, tap through steps |
| `/perf` | Code analysis | + Actual FPS measurement |
| `/component` | Generate code | + Render and screenshot |
| `/deploy` | Config validation | + Preview build verification |
