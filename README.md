# ⚡ Molly — Workflow Command Center

> Proactive AI-powered workflow organization and optimization across every domain of your life.

**Live:** [ceyre-boop.github.io/molly](https://ceyre-boop.github.io/molly/)

---

## What is Molly?

Molly is a personal command center that unifies your trading, agency, development, and academic workflows into a single professional interface. It's not just a dashboard — it's an operational hub with live data, keyboard navigation, and domain-specific intelligence.

### Key Features

- **🎯 Multi-Domain Views** — Dedicated views for Trading, Agency (TABOOST), Development, and School, each with contextual data and actions
- **⚡ Live GitHub Integration** — Real-time commit feeds, repository stats, and activity timelines pulled from the GitHub API
- **⌘K Command Palette** — Keyboard-first navigation (Cmd/Ctrl+K) to instantly jump anywhere
- **📊 Systems Health Monitoring** — Live status checks across all managed projects and deployments
- **🧠 Vault / Memory System** — Obsidian-integrated knowledge base with domain-specific state and context files
- **🤖 Automation Hub** — Centralized view of scheduled tasks, scripts, and self-healing rules
- **📱 Fully Responsive** — Works on desktop, tablet, and mobile

---

## Quick Start

```bash
git clone https://github.com/ceyre-boop/molly.git
cd molly
```

Open `index.html` in your browser — or visit the live version on GitHub Pages.

---

## Project Structure

```
molly/
├── index.html              # ⚡ Main application (single-file SPA)
├── config/
│   └── workspace.json      # Workspace configuration
├── scripts/
│   ├── agency-health.sh    # TABOOST health monitoring
│   ├── autonomous-monitor  # Self-healing system (.sh + .ps1)
│   ├── deploy-shop.ps1     # Shop deployment pipeline
│   └── bulk-import-helper  # Creator import wizard (.ps1)
├── vault/                  # 🧠 Obsidian knowledge base
│   ├── 00-meta/            # System status
│   ├── 01-trading/         # Trading state & context
│   ├── 02-agency/          # TABOOST state & context
│   ├── 03-dev/             # Dev state
│   └── 04-school/          # Academic state
├── docs/
│   ├── OLLAMA_SETUP.md     # Local AI model setup
│   └── VAULT_STRUCTURE.md  # Memory system architecture
├── PROACTIVE_PLAN.md       # Autonomy roadmap
└── README.md               # This file
```

---

## Managed Projects

| Project | URL | Stack |
|---------|-----|-------|
| **TABOOST Platform** | [live.taboost.me](https://live.taboost.me) | GitHub Pages + Firebase |
| **TABOOST Shop** | [ceyre-boop.github.io/TABOOST-Shop](https://ceyre-boop.github.io/TABOOST-Shop/) | GitHub Pages |
| **Quant Trading** | [ceyre-boop.github.io/quant](https://ceyre-boop.github.io/quant/) | GitHub Pages |
| **Molly** | [ceyre-boop.github.io/molly](https://ceyre-boop.github.io/molly/) | Vanilla SPA |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K` / `Ctrl+K` | Open command palette |
| `Esc` | Close palette / modals |
| `↑↓` | Navigate palette results |
| `Enter` | Execute selected command |

---

## Automation Scripts

### Jarvis — Your Workflow Assistant

New Python-based automation suite for context switching, organization, and daily workflow:

| Script | Purpose | Example |
|--------|---------|---------|
| `jarvis` | Master launcher | `jarvis context quant` |
| `jarvis_context.py` | Project context switching | `python jarvis_context.py switch quant` |
| `jarvis_briefing.py` | Daily morning briefing | `python jarvis_briefing.py` |
| `jarvis_todos.py` | Unified todo tracker | `python jarvis_todos.py scan` |
| `jarvis_organizer.py` | File organization | `python jarvis_organizer.py downloads` |
| `jarvis_vscode.py` | VS Code integration | `python jarvis_vscode.py open quant` |

### Legacy Scripts

| Script | Platform | Purpose |
|--------|----------|---------|
| `agency-health.sh` | macOS/Linux | Run comprehensive TABOOST health checks |
| `autonomous-monitor.sh` | macOS/Linux | Self-healing monitor with auto-fix |
| `autonomous-monitor.ps1` | Windows | Self-healing monitor (PowerShell) |
| `deploy-shop.ps1` | Windows | Automated Shop deployment pipeline |
| `bulk-import-helper.ps1` | Windows | Guided creator CSV import |

### Running Scripts

#### Jarvis (Recommended)

```bash
# Add to your shell profile (.bashrc, .zshrc, or PowerShell profile):
alias jarvis="python /workspaces/molly/scripts/jarvis"

# Or on Windows PowerShell:
function jarvis { python C:\workspaces\molly\scripts\jarvis $args }

# Usage:
jarvis context              # Show current project
jarvis context quant        # Switch to quant project
jarvis briefing             # Morning briefing
jarvis todos list           # Show all todos
jarvis organize downloads   # Organize Downloads folder
jarvis code open quant      # Open quant in VS Code
```

#### Legacy Scripts

```bash
# macOS / Linux
chmod +x scripts/*.sh
./scripts/agency-health.sh

# Windows (PowerShell)
.\scripts\deploy-shop.ps1 "Deploy message"
```

---

## Architecture

Molly is intentionally a **zero-dependency single-file SPA**. No build tools, no frameworks, no node_modules — just open and run. This makes it:

- **Instant** — No build step, loads in milliseconds
- **Portable** — Works offline, on any device
- **Deployable** — GitHub Pages serves it directly
- **Maintainable** — One file to understand, one file to update

The app pulls live data from the GitHub API (public, no auth required) and renders it client-side. Domain data comes from the vault markdown files.

---

## Roadmap

See [PROACTIVE_PLAN.md](PROACTIVE_PLAN.md) for the full autonomy roadmap.

- [x] Phase 1: Memory Foundation (Obsidian vault)
- [x] Phase 2: Command Center UI (this update)
- [ ] Phase 3: Ollama Integration (local AI routing)
- [ ] Phase 4: n8n Automation (Docker-based workflows)
- [ ] Phase 5: Vector Store (semantic memory search)

---

## License

Private project. © Colin Eyre.
