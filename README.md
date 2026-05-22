# Good Morning, Claude

An automated daily briefing tool that spins up a Claude Code session every morning at 8:00 AM, aggregates your work context from M365 and GitHub, and presents it in a unified GUI dashboard — so you start every day fully informed.

## What It Does

Each morning at 8:00 AM a PowerShell scheduled task fires, launches Claude Code, and surfaces:

| Source | Data |
|--------|------|
| **Microsoft 365 Mail** | All unread emails since yesterday |
| **Microsoft Teams** | All unread channel and direct message notifications |
| **GitHub Pull Requests** | Open PRs across all repos where your review is requested |
| **GitHub Issues** | All issues currently assigned to you, across every repository |

Everything is rendered in a local GUI dashboard so you can triage, prioritize, and act without jumping between tabs.

## Features

### Scheduled Morning Trigger
- Windows Task Scheduler job runs at 08:00 daily
- Launches a PowerShell process that bootstraps a Claude Code session
- Configurable wake time and days of week

### M365 Email Integration
- Authenticates via Microsoft Graph API (OAuth 2.0 / device code flow)
- Fetches unread messages from your inbox
- Groups by sender and thread for at-a-glance triage

### Microsoft Teams Integration
- Reads unread activity feed via Microsoft Graph
- Surfaces direct messages, @mentions, and channel notifications
- Links directly to each Teams conversation

### GitHub PR Review Queue
- Queries GitHub REST API for PRs requesting your review
- Works across all organizations and repositories you have access to
- Shows PR title, repo, age, and CI status

### GitHub Issues Dashboard
- Fetches all open issues assigned to you across every accessible repo
- Filterable by label, repo, and staleness
- Shows issue title, repo, milestone, and last activity

### GUI Dashboard
- Single-window local interface (Electron / Tkinter / similar — TBD)
- Unified inbox view grouping all sources
- Click-through links to original items
- Read/dismiss tracking per session

## Tech Stack

| Layer | Choice |
|-------|--------|
| Scheduler | Windows Task Scheduler via PowerShell |
| Claude interface | Claude Code CLI (`claude` command) |
| M365 auth | Microsoft Graph SDK / MSAL |
| GitHub auth | GitHub CLI (`gh`) token or PAT |
| GUI | TBD (Electron, Tkinter, or web-based local server) |
| Language | Python or Node.js (TBD) |

## Setup

> Full setup instructions will be added as features are built out.

### Prerequisites
- Claude Code CLI installed (`npm install -g @anthropic-ai/claude-code`)
- GitHub CLI installed and authenticated (`gh auth login`)
- Microsoft 365 account with Graph API permissions
- Python 3.11+ or Node.js 20+

### Quick Start
```powershell
# Clone the repo
git clone https://github.com/SamuelBostic29/good-morning-claude.git
cd good-morning-claude

# Install dependencies
# (instructions TBD per chosen stack)

# Register the 8 AM scheduled task
.\scripts\register-task.ps1
```

## Project Status

Early development. See [Issues](https://github.com/SamuelBostic29/good-morning-claude/issues) for the current backlog.

## License

MIT
