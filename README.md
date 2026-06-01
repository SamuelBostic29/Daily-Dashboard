# Daily Dashboard

A personal dashboard that aggregates your work context from Microsoft 365 and GitHub into a single local view. Instead of being a standalone app, the dashboard is driven by a **Claude Code workflow**: Claude fetches your latest data, writes it to a set of small JavaScript files, and a static HTML template stitches them together into a clean, glanceable page.

![Daily Dashboard](assets/dashboard-preview.png)

*The generated dashboard: unread email, your PR queue, and assigned issues at a glance (shown with placeholder data).*

Run it whenever you want a fresh read on your day, and let the Windows scheduled task refresh it automatically on weekday mornings.

## What It Does

When you tell Claude Code to **"Run the morning briefing"**, it spins up three agents in parallel — one per data source — and surfaces:

| Source | Data |
|--------|------|
| **Microsoft 365 Mail** | Your 25 most recent unread emails (AI code-review bot noise filtered out) |
| **GitHub Pull Requests** | Open PRs you authored *and* PRs that involve you (split into "My PRs" and "Needs My Review") |
| **GitHub Issues** | All open issues currently assigned to you, across every accessible repo |

Each item is rendered in a local dashboard with click-through links to the original, per-day dismiss tracking, and a time-of-day-aware greeting — so you can triage without jumping between tabs.

## How It Works

The project has no build step, server, or runtime framework. The moving parts are:

```
"Run the morning briefing"  →  Claude Code (CLAUDE.md workflow)
        │
        ├─ Agent 1 ── M365 email search (MCP) ──→ dashboard/data-emails.js
        ├─ Agent 2 ── gh api (PRs)            ──→ dashboard/data-prs.js
        └─ Agent 3 ── gh api (issues)         ──→ dashboard/data-issues.js
                                                       │
   Orchestrator ── writes dashboard/data-meta.js ──────┤
                └─ opens dashboard/template.html  ◄─────┘
```

1. **`CLAUDE.md`** defines the briefing workflow. Each agent deletes its target data file and writes a fresh one — it never returns JSON to the orchestrator.
2. **`dashboard/template.html`** is a self-contained page (vanilla HTML/CSS/JS, no dependencies). On load it reads the four `data-*.js` files, each of which assigns a global (`window.BRIEFING_EMAILS`, `window.BRIEFING_PRS`, `window.BRIEFING_ISSUES`, `window.BRIEFING_META`), and stitches them into `window.BRIEFING_DATA` for rendering.
3. The generated `data-*.js` files are **git-ignored** — they hold your live personal data and are regenerated on every run.

### Data sources in detail

- **Email** is fetched via the Microsoft 365 MCP tool (`outlook_email_search`) using the query `isRead:false NOT body:"claude[bot]" NOT body:"@Copilot"`, which drops `claude[bot]` and `@Copilot` automated PR-review comments while keeping human messages.
- **PRs and issues** come from `gh api search/issues` (the GitHub CLI), not `gh search`, which returns empty under OAuth tokens. The queries are scoped to a specific GitHub login — see [Configuration](#configuration) to point them at your own account.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Orchestration | Claude Code CLI (`claude`) driven by the `CLAUDE.md` workflow |
| Dashboard UI | Static `template.html` — vanilla HTML/CSS/JS, no framework, no build |
| Data files | Generated `data-*.js` files assigning `window.BRIEFING_*` globals |
| Email source | Microsoft 365 MCP server (`outlook_email_search`) |
| GitHub source | GitHub CLI (`gh api`) |
| Scheduler | Windows Task Scheduler, configured via PowerShell |

## Repository Layout

```
CLAUDE.md                  The morning-briefing workflow Claude executes
config/schedule.json       Scheduled-task time and days of week
scripts/register-task.ps1  Register / update / unregister the scheduled task
scripts/start-session.ps1  Launches a Claude Code briefing session (logged)
dashboard/template.html    The dashboard page (open this to view your briefing)
dashboard/preview.html     Static design preview with no live data
dashboard/test-data.js     Sample data for previewing the layout
dashboard/data-*.js        Generated live data (git-ignored)
logs/                      start-session.ps1 run logs (git-ignored)
WorkingFiles/              Free-form notes / General Logs.txt (git-ignored)
```

## Setup

### Prerequisites

- **Claude Code CLI** — `npm install -g @anthropic-ai/claude-code`
- **GitHub CLI** — installed and authenticated: `gh auth login`
- **Microsoft 365 account** connected to Claude via the Microsoft 365 MCP server (provides `outlook_email_search`)
- **Windows** with PowerShell (for the optional scheduled task)

No language runtime, package install, or build is required — the dashboard is a static file.

### Quick Start

```powershell
# Clone the repo
git clone https://github.com/SamuelBostic29/Daily-Dashboard.git
cd Daily-Dashboard

# Launch Claude Code in the project directory, then prompt:
#   Run the morning briefing
# Claude fetches your data, writes dashboard/data-*.js, and opens the dashboard.
```

To preview the layout without any live data, just open `dashboard/preview.html` (or load `dashboard/test-data.js` into the template).

### Configuration

The GitHub queries in `CLAUDE.md` are scoped to a specific account. To use your own, update the login in both `gh api` queries:

- PRs: `involves:SBosticParadigm` → `involves:<your-login>`
- Issues: `assignee:SBosticParadigm` → `assignee:<your-login>`

### Scheduling automatic refreshes

`config/schedule.json` controls when the briefing runs automatically:

```json
{
  "time": "07:30",
  "daysOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
}
```

Register the Windows scheduled task (runs `scripts/start-session.ps1`, which launches a headless Claude Code session and logs to `logs/startup.log`):

```powershell
.\scripts\register-task.ps1                  # register
.\scripts\register-task.ps1 -Action update   # apply schedule.json changes
.\scripts\register-task.ps1 -Action unregister
```

The task uses `StartWhenAvailable`, so a run missed because the machine was asleep fires at the next logon. Because automated runs are unattended, `start-session.ps1` invokes Claude with `--dangerously-skip-permissions`.

## License

MIT
