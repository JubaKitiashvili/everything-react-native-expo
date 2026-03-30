# ERNE Commands

Commands are slash-prefixed actions that orchestrate agents for specific tasks.

## All Commands

### Core Workflow
| Command | Purpose | Agents |
|---------|---------|--------|
| `/erne-plan` | Design feature architecture | architect |
| `/erne-code` | Implement features | senior-developer |
| `/erne-feature` | Build focused feature unit | feature-builder |
| `/erne-code-review` | Full code review | code-reviewer + performance-profiler |
| `/erne-tdd` | Test-first development | tdd-guide |
| `/erne-build-fix` | Fix build failures | expo-config-resolver |
| `/erne-perf` | Performance profiling | performance-profiler |
| `/erne-upgrade` | Version migration | upgrade-assistant |
| `/erne-native-module` | Create native modules | native-bridge-builder → code-reviewer |
| `/erne-navigate` | Navigation design | architect |

### Extended
| Command | Purpose | Agents |
|---------|---------|--------|
| `/erne-animate` | Implement animations | ui-designer |
| `/erne-deploy` | Validate and submit | expo-config-resolver + code-reviewer |
| `/erne-component` | Design + test component | ui-designer + tdd-guide |
| `/erne-debug` | Systematic diagnosis | performance-profiler |
| `/erne-debug-visual` | Screenshot-based visual debugging | visual-debugger |
| `/erne-debug-video` | Video-based temporal analysis | visual-debugger (frame extraction) |
| `/erne-quality-gate` | Pre-merge checks | code-reviewer + performance-profiler |
| `/erne-orchestrate` | Run multi-agent pipeline | pipeline-orchestrator |
| `/erne-hig` | Apple HIG design intelligence | ui-designer (HIG rules) |

### Script-Driven
| Command | Purpose | What It Runs |
|---------|---------|-------------|
| `/erne-learn` | Generate skills from patterns | continuous-learning-v2 scripts |
| `/erne-retrospective` | Session analysis | evaluate-session.js |
| `/erne-setup-device` | Install agent-device MCP | Setup script |

## Using Commands

Type any command in Claude Code:
```
/erne-plan Add user authentication with biometric login
```

Commands that use multiple agents show combined output. Parallel agents run simultaneously for speed.

## agent-device Enhancement

When agent-device MCP is installed, several commands gain visual capabilities:

| Command | Without | With agent-device |
|---------|---------|------------------|
| `/erne-debug` | Log analysis | + Screenshots, tap through steps |
| `/erne-perf` | Code analysis | + Actual FPS measurement |
| `/erne-component` | Generate code | + Render and screenshot |
| `/erne-deploy` | Config validation | + Preview build verification |
