# 🏠 Molly

> *Your proactive AI assistant for workflow automation*

Molly lives here to make Colin's life easier—monitoring systems, automating deployments, and keeping everything organized so you don't have to worry about the details.

---

## 🚀 Quick Start

### First Time Setup

**1. Install Git (if not already installed)**
```bash
# macOS
brew install git

# Ubuntu/Debian
sudo apt-get install git

# Windows (PowerShell as Admin)
winget install Git.Git
```

**2. Clone this repository**
```bash
git clone https://github.com/ceyre-boop/molly.git
cd molly
```

**3. Verify installation**
```bash
./scripts/health-check.sh
```

---

## 📦 What's Included

### Deployment Scripts
| Script | Purpose | Usage |
|--------|---------|-------|
| `deploy-taboost.sh` | Deploy TABOOST Platform | `./scripts/deploy-taboost.sh "optional message"` |
| `deploy-shop.sh` | Deploy TABOOST Shop | `./scripts/deploy-shop.sh "optional message"` |
| `health-check.sh` | Check all systems | `./scripts/health-check.sh` |

### Project Structure
```
molly/
├── scripts/           # Automation scripts
│   ├── deploy-taboost.sh
│   ├── deploy-shop.sh
│   ├── health-check.sh
│   └── *.ps1         # PowerShell versions (Windows)
├── config/            # Configuration files
│   └── workspace.json
├── logs/              # Execution logs
│   ├── deployments.log
│   └── latest-health-report.txt
├── index.html         # Dashboard (GitHub Pages)
└── README.md          # This file
```

---

## 🎯 Projects Molly Manages

| Project | Live URL | Status |
|---------|----------|--------|
| **TABOOST Platform** | https://live.taboost.me | ✅ 826+ creators |
| **TABOOST Shop** | https://ceyre-boop.github.io/TABOOST-Shop/ | ✅ 1000+ products |
| **Quant Trading** | https://ceyre-boop.github.io/quant/ | ✅ Live dashboard |
| **Molly** | https://ceyre-boop.github.io/molly/ | ✅ This workspace |

---

## 🤖 Automation Schedule

| Task | Frequency | Time |
|------|-----------|------|
| Data sync check | Daily | 9:00 AM |
| Health check | Daily | 9:00 AM |
| Git cleanup | Weekly | Mondays |
| Memory archive | Weekly | Mondays |

---

## 📊 Dashboard

Visit your command center: **https://ceyre-boop.github.io/molly/**

The dashboard shows:
- Real-time system status
- Quick links to all projects
- Deployment history
- System health metrics

---

## 🛠️ Platform-Specific Notes

### macOS / Linux
All scripts work natively with bash:
```bash
cd molly/scripts
./deploy-taboost.sh
```

### Windows
Two options:

**Option A: PowerShell (recommended)**
```powershell
cd molly\scripts
.\deploy-taboost.ps1
```

**Option B: Git Bash / WSL**
```bash
cd molly/scripts
./deploy-taboost.sh
```

---

## 🔔 Troubleshooting

### "Permission denied" when running scripts
```bash
chmod +x scripts/*.sh
```

### "Could not find repository"
Make sure this repo is cloned next to TABOOST_Platfrom and TABOOST-Shop-temp:
```
clawd/
├── molly/           # This repo
├── TABOOST_Platfrom/
└── TABOOST-Shop-temp/
```

### Scripts fail with path errors
The scripts use relative paths (`../TABOOST_Platfrom`). Ensure you're running them from the `molly` directory.

---

## 📝 Logs

All activity is logged to:
- `logs/deployments.log` — Deployment history
- `logs/health-checks.log` — Health check history
- `logs/latest-health-report.txt` — Most recent health report

---

## 💡 Pro Tips

1. **Run health check before deploying** — Catch issues early
2. **Use meaningful commit messages** — `./deploy-taboost.sh "Fix login bug"`
3. **Check logs regularly** — `tail -f logs/deployments.log`
4. **Bookmark the dashboard** — Quick access to everything

---

## 🏡 About Molly

Molly is Clawdbot's home—an organized workspace designed for proactive automation. She:

- 📡 Monitors your systems 24/7
- 🚀 Deploys code with one command
- 📊 Tracks health and performance
- 🧹 Keeps everything tidy

*Built with care for Colin Eyre*

---

**Last updated:** Auto-generated on setup