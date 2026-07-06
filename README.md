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
| **Assigned Issues** | Open issues/tickets assigned to you, from **GitHub and Jira** together (each tagged with its tracker) during the GitHub→Jira migration |

Each item is rendered in a local dashboard with click-through links to the original, per-day dismiss tracking, and a time-of-day-aware greeting — so you can triage without jumping between tabs. PRs in the review queue additionally get a **Review** button that launches a ready-to-go Claude Code review session — see [One-click PR review](#one-click-pr-review).

### The TODO view

The dashboard answers *"what came in?"*; the **TODO view** (second tab on the same page) answers *"what am I actually doing today?"*. Click **Add to TODO** on the Dashboard to enter a multi-select mode and push the items that matter into one compact list, grouped under Emails / Pull Requests / Issues / Custom sub-headers. **+ New Item** adds custom entries (label, description, link) for work the dashboard doesn't surface.

The list persists in `localStorage` and — unlike the per-day dismiss state — **carries across days**: a dismiss means "done looking at this today", a TODO means "I still owe this work", so entries stay until you remove them with their **&times;** button. Briefing refreshes never touch the TODO list.

## How It Works

The project has no build step, server, or runtime framework. The moving parts are:

```
"Run the morning briefing"  →  Claude Code (CLAUDE.md workflow)
        │
        ├─ Agent 1 ── M365 email search (MCP) ──→ dashboard/data/emails.js
        ├─ Agent 2 ── gh api (PRs)            ──→ dashboard/data/prs.js
        └─ Agent 3 ── gh api + scripts/fetch-jira.sh ──→ dashboard/data/issues.js
                                                       │
   Orchestrator ── writes dashboard/data/meta.js (last) ─┘
                                                          │
   dashboard/template/template.html ── polls data/meta.js, reloads in place on change
```

1. **`CLAUDE.md`** defines the briefing workflow. Each agent deletes its target data file and writes a fresh one — it never returns JSON to the orchestrator. The briefing **does not open a browser**: under all-day polling it runs windowless and headless, so opening one would be disruptive.
2. **`dashboard/template/template.html`** is a no-build page (vanilla HTML/CSS/JS) that links the shared `../css/styles.css`, `../renderers.js`, and `../behavior.js`. On load it reads the four `data/*.js` files, each of which assigns a global (`window.BRIEFING_EMAILS`, `window.BRIEFING_PRS`, `window.BRIEFING_ISSUES`, `window.BRIEFING_META`), and stitches them into `window.BRIEFING_DATA` for rendering. It then **polls `data/meta.js` once a minute** and, when `generatedAt` changes, reloads all data files and re-renders in place — preserving scroll and dismissed state — so a dashboard left open on a spare screen stays current all day.
3. The generated `data/*.js` files are **git-ignored** — they hold your live personal data and are regenerated on every run.

### Data sources in detail

- **Email** is fetched via the Microsoft 365 MCP tool (`outlook_email_search`) with a query built from `config/email-filters.json`: `isRead:false` plus a `NOT body:"…"` clause per `bodyExclusions` entry (drops automated PR-review comments like `claude[bot]` and `@Copilot`) and a `NOT from:"…"` clause per `senderExclusions` entry (drops noisy senders like Datadog). Edit the JSON to change filtering.
- **PRs and GitHub issues** come from `gh api search/issues` (the GitHub CLI), not `gh search`, which returns empty under OAuth tokens. The queries are scoped to a specific GitHub login — see [Configuration](#configuration) to point them at your own account.
- **Jira tickets** come from `scripts/fetch-jira.sh`, which queries the self-hosted Jira Data Center search API (`/rest/api/2/search`, JQL `assignee = currentUser() AND statusCategory != Done`) authed by your per-user PAT in `~/.claude/jira-token.local` (the same git-ignored token the `jira` skill uses). The Issues pane shows GitHub and Jira items together with a tracker chip while issue tracking migrates from GitHub to Jira; the GitHub half is dropped once the migration completes.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Orchestration | Claude Code CLI (`claude`) driven by the `CLAUDE.md` workflow |
| Dashboard UI | Static `template/template.html` — vanilla HTML/CSS/JS, no framework, no build |
| Data files | Generated `data/*.js` files assigning `window.BRIEFING_*` globals |
| Email source | Microsoft 365 MCP server (`outlook_email_search`) |
| GitHub source | GitHub CLI (`gh api`) |
| Scheduler | Windows Task Scheduler, configured via PowerShell |

## Repository Layout

```
CLAUDE.md                  The morning-briefing workflow Claude executes
config/schedule.json       Polling schedule: start/end time, interval, days of week
config/email-filters.json  Email search exclusions: body phrases and senders to filter out
prompts/pr-review.md       Review-prompt template rendered into each one-click review session
scripts/fetch-jira.sh      Fetches my open Jira tickets (Data Center) as dashboard items for the Issues pane
scripts/register-task.ps1  Register / update / unregister the scheduled task
scripts/start-session.ps1  Launches a headless Claude Code briefing session (logged)
scripts/open-dashboard.ps1 Opens the dashboard once in the interactive session
scripts/install-protocol.ps1   One-time gmc-review:// URL-scheme registration (HKCU, no admin)
scripts/uninstall-protocol.ps1 Removes the gmc-review:// registration
scripts/launch-review.ps1  gmc-review:// handler: PR worktree + Windows Terminal claude tab
scripts/cleanup-reviews.ps1    Ages out per-PR worktrees and briefs from the reviews cache
dashboard/template/template.html  The dashboard page (open this to view your briefing)
dashboard/template/template.js    Live-page bootstrap: data wiring, render, auto-reload
dashboard/preview/preview.html    Static design preview with no live data
dashboard/preview/preview.js      Preview bootstrap: render the bundled sample data
dashboard/css/styles.css          Shared stylesheet linked by both pages
dashboard/css/preview.css         Preview-only style overrides (flat background + glows)
dashboard/renderers.js            Shared rendering (html`` escaper + email/PR/issue/TODO renderers)
dashboard/behavior.js             Shared runtime: greeting, delegated dismiss, badges, section collapse, keyboard nav, view tabs, Add-to-TODO selection, custom-item modal
dashboard/todo-store.js           localStorage-backed TODO list store (scoped per page, persists across days)
dashboard/test-data.js            Sample data for previewing the layout
dashboard/data/*.js               Generated live data (git-ignored; folder kept + documented via data/README.md)
logs/                      start-session.ps1 run logs (git-ignored)
WorkingFiles/              Free-form notes / General Logs.txt (git-ignored)
```

## Setup

### Prerequisites

- **Claude Code CLI** — `npm install -g @anthropic-ai/claude-code`
- **GitHub CLI** — installed and authenticated: `gh auth login`
- **Microsoft 365 account** connected to Claude via the Microsoft 365 MCP server (provides `outlook_email_search`)
- **Jira Data Center PAT** in `~/.claude/jira-token.local` for the Jira half of the Issues pane — set it up once by running the `jira` skill (`/jira`). `scripts/fetch-jira.sh` runs under Bash and uses Node for its JSON transform (both already present with the Claude Code CLI).
- **Windows** with PowerShell (for the optional scheduled task)

No language runtime, package install, or build is required — the dashboard is a static file.

### Quick Start

```powershell
# Clone the repo
git clone https://github.com/SamuelBostic29/Daily-Dashboard.git
cd Daily-Dashboard

# Launch Claude Code in the project directory, then prompt:
#   Run the morning briefing
# Claude fetches your data and writes dashboard/data/*.js.

# Open the dashboard once (it auto-reloads as new data arrives):
.\scripts\open-dashboard.ps1
```

To preview the layout without any live data, just open `dashboard/preview/preview.html` — it renders the bundled sample data in `dashboard/test-data.js`.

### Configuration

The GitHub queries in `CLAUDE.md` are scoped to a specific account. To use your own, update the login in both `gh api` queries:

- PRs: `involves:SBosticParadigm` → `involves:<your-login>`
- Issues: `assignee:SBosticParadigm` → `assignee:<your-login>`

The greeting name is the `USER_NAME` constant at the top of `dashboard/behavior.js`.

`config/email-filters.json` controls what the email search excludes — each `bodyExclusions` entry becomes a `NOT body:"…"` clause and each `senderExclusions` entry a `NOT from:"…"` clause on the base `isRead:false` query:

```json
{
  "bodyExclusions": ["claude[bot]", "@Copilot"],
  "senderExclusions": ["dtdg.co"]
}
```

### Scheduling automatic refreshes

`config/schedule.json` controls when the briefing runs automatically:

```json
{
  "daysOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  "startTime": "07:30",
  "endTime": "17:30",
  "intervalMinutes": 30
}
```

The task fires at `startTime`, then repeats every `intervalMinutes` until `endTime` — an all-day live agenda rather than a one-shot morning snapshot. Omit `intervalMinutes` (or set the legacy `time` key) to fall back to a single daily run.

Register the Windows scheduled task (runs `scripts/start-session.ps1`, which launches a headless Claude Code session and logs to `logs/startup.log`):

```powershell
.\scripts\register-task.ps1                  # register
.\scripts\register-task.ps1 -Action update   # apply schedule.json changes
.\scripts\register-task.ps1 -Action unregister
```

The task runs **only while you're logged on** (no admin rights needed to register). Each poll launches windowless via `conhost.exe --headless powershell.exe -WindowStyle Hidden`, so no console flashes across your screen. It uses `StartWhenAvailable`, so a run missed because the machine was asleep fires when it next can. Because automated runs are unattended, `start-session.ps1` invokes Claude headless (`claude -p`) with `--dangerously-skip-permissions`.

The polls only regenerate the data files — they don't open a browser. Open the dashboard once a day with `scripts/open-dashboard.ps1` (e.g. a Stream Deck shortcut, which also makes it easy to reopen if you close it); it auto-reloads in place as each poll produces fresh data.

## One-click PR review

Each PR under **Needs My Review** renders with a small **Review** button. Clicking it opens a new tab in your current Windows Terminal window running an **interactive** Claude Code session whose working directory is a checkout of that PR's branch at HEAD, pre-loaded with the review prompt — so at the start of the day you can fan out one tab per PR and walk through each review conversationally. The rest of the card still opens the GitHub PR page in the browser, so you can flip between the two.

A `file://` page can't spawn processes, so the dashboard hands off through a custom URL scheme:

```
Review button → gmc-review:// link → Windows URL-scheme handler
    → scripts/launch-review.ps1
        ├─ ensure a clone / git worktree in D:\gmc-reviews\ at the PR's HEAD
        ├─ render prompts/pr-review.md into a brief file
        └─ open a wt tab: interactive `claude` in the worktree, pointed at the brief
```

The launcher defends against a hostile page firing the protocol on two levels. First, the `url` parameter must match `https://github.com/<owner>/<repo>/pull/<n>` exactly — anything else is rejected. But that only constrains the URL's *shape*, not its target (any GitHub PR URL fits the shape), so the launcher also enforces an **owner allowlist**: it will clone and review only PRs whose owner is listed in `config/review-owners.json`, and fails closed (refusing every review) if that file is missing or empty. Edit the list to control which orgs/accounts the protocol may ever touch.

### Setup (once)

```powershell
# 1. Create your owner allowlist from the template, then edit in the orgs/accounts to allow
Copy-Item config\review-owners.example.json config\review-owners.json

# 2. Register the gmc-review:// protocol handler
.\scripts\install-protocol.ps1
```

`config/review-owners.json` is git-ignored — it holds your personal allowlist. Until you populate it, the launcher fails closed and refuses every review (the committed `config/review-owners.example.json` is the empty template).

`install-protocol.ps1` registers `gmc-review://` under `HKCU` — per-user, no admin rights. On the first click the browser asks to allow opening the link; allow it. The registration embeds the repo's absolute path, so rerun the script if the repo moves. `scripts/uninstall-protocol.ps1` removes the registration.

Requires Windows Terminal and the native Claude Code install (`claude.exe` on PATH).

### The reviews cache

Reviews check out code into a dedicated cache at `D:\gmc-reviews\` — never your working clones, so in-progress work is untouched and any number of reviews can run in parallel. The cache lives on the data drive because clones and worktrees are full source checkouts; change the `$reviewsRoot` constant in `launch-review.ps1` and `cleanup-reviews.ps1` to relocate it.

```
D:\gmc-reviews\
  <owner>-<repo>\           one-time base clone per repo (the only expensive step)
  <owner>-<repo>-pr-<n>\    git worktree on the PR's branch — cheap, shares the clone's objects
  briefs\                   rendered review prompts handed to each session
```

Re-clicking the same PR reuses its worktree after refreshing it to the PR's latest HEAD. Clone/fetch credentials are pinned to the account in `config/gh-account.json` (the same account the briefing queries run under), so launches work regardless of which `gh` account is currently active.

Age out idle worktrees whenever you like — base clones are always kept:

```powershell
.\scripts\cleanup-reviews.ps1            # remove worktrees idle for 7+ days
.\scripts\cleanup-reviews.ps1 -Days 0    # clear all worktrees
```

To change what each review session is asked to do, edit `prompts/pr-review.md` — the next launch picks it up; the launcher never needs touching.

## License

MIT
