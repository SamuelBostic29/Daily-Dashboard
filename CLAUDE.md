# Daily Dashboard

This project is a personal dashboard that refreshes throughout the day (and via Windows Task Scheduler on weekday mornings) to surface your unread email, PR queue, and assigned issues. When launched, Claude should execute the briefing workflow below.

## GitHub accounts (work for briefings, personal otherwise)

The briefing queries Paradigm **work** data (`involves:SBosticParadigm` PRs, `assignee:SBosticParadigm` issues), so its **`gh` data calls use the `SBosticParadigm` account** — never the personal `SamuelBostic29` account, even though this repo is personal-owned.

The work account is used **only by the dashboard-populating briefing run**; everything else in this personal repo uses the personal `SamuelBostic29` account.

`scripts/start-session.ps1` sets `DAILY_DASHBOARD_BRIEFING=1` before launching `claude`. The global `gh-account-guard.ps1` hook sees that flag (inherited by the briefing's `claude` process and its agents) and, combined with `config/gh-account.json` (`{ "ghAccount": "SBosticParadigm" }`), pins the briefing's `gh` data calls to `SBosticParadigm`. To use a different account for briefings, edit that config value.

Outside a briefing run — interactive work, `git push`/`pull`, `gh issue`/`pr` create, even reads — the guard requires the **personal** `SamuelBostic29` account (the repo owner). So: the briefing fetches work data as `SBosticParadigm`; you do everything else as `SamuelBostic29`.

The briefing itself (launched via `start-session.ps1`) must be on the work account: run `gh auth status`; if it isn't `SBosticParadigm`, run `gh auth switch --user SBosticParadigm` first.

## Morning Briefing Workflow

When prompted to "Run the morning briefing", spin up **3 agents in parallel** — one for each data source below. **Each agent writes its own data file directly** to `dashboard/`. The agents do NOT return JSON to the orchestrator. The orchestrator writes only the tiny `data-meta.js` and opens `dashboard/template.html`.

### IMPORTANT: Always delete the target file BEFORE writing

Every writer in this workflow (each agent and the orchestrator) MUST delete its target file as the very first step, **before** calling Write. This avoids the failure mode where Write errors on a pre-existing file and forces a slow Read → Edit fallback.

For each writer, the first tool call must be the **Bash** tool running this exact command:

```bash
rm -f dashboard/<your-target-file>
```

**Run that command literally.** Do NOT convert the path to an absolute Windows path (`D:\...`). Do NOT add backslashes. Do NOT wrap it in PowerShell (`Test-Path`, `Remove-Item`, `Set-Content`, `New-Item`). Unquoted backslashes in Bash are escape sequences — `D:\SideProjects\...` collapses to a garbage path, `rm -f` silently no-ops, the file stays on disk, and the next Write call fails the harness's "must Read first" guard rail.

The agent's working directory is already `D:\SideProjects\Daily-Dashboard`, so the relative path `dashboard/<file>` works as-is. (`rm -f` is silent when the file doesn't exist, so it's safe on the first run.) Only after this deletion do you call Write with the new contents. Do NOT use Read + Edit on a stale file — always delete and write fresh.

### IMPORTANT: Escape string values so the file is valid JavaScript

Every value you place inside the `"..."` strings (email subjects, PR/issue titles, sender names, previews) comes from external data and may contain characters that break the file. **Emit each value as a valid JSON string** — i.e. escape exactly what `JSON.stringify` would:

- `"` → `\"` (double quote — e.g. a title like `Capture – "Authorization required"`)
- `\` → `\\` (backslash)
- newline → `\n`, carriage return → `\r`, tab → `\t` (common in email `bodyPreview`)

Any one of these left raw makes the whole `data-*.js` file invalid JavaScript, so the browser silently fails to load that section's global and the dashboard shows it as empty — with no visible error. A literal line break in a preview breaks the file just as surely as a stray quote. When in doubt, escape. Apply this to every writer below.

### Agent 1: Unread Emails

**Step 1.** Delete the target file: `rm -f dashboard/data-emails.js`

**Step 2.** Use the `mcp__claude_ai_Microsoft_365__outlook_email_search` tool to fetch the 25 most recent unread emails. Pass these parameters exactly:

- `query`: `isRead:false NOT body:"claude[bot]" NOT body:"@Copilot"`
- `limit`: `25`

This excludes GitHub PR review comments authored by `claude[bot]` or `@Copilot` (AI code review noise). Human review comments on the same PRs still come through. Do NOT paginate — one call only.

**Step 3.** Write to `dashboard/data-emails.js` in exactly this format:

```js
window.BRIEFING_EMAILS = [
    {
        "id": "email-" + message id,
        "title": email subject line,
        "meta": sender name + " — " + timestamp,
        "url": deep-link to the message in Outlook (or "https://outlook.office365.com/mail/inbox" as fallback),
        "preview": bodyPreview from the search result (first ~255 chars of the body, plain text) — empty string "" if missing
    },
    ...
];
```

The `bodyPreview` field is already in the search response — capture it verbatim, do NOT make extra `read_resource` calls to fetch full bodies.

Return only a brief confirmation (e.g., "Wrote 25 emails to data-emails.js"). Do NOT return the JSON payload to the orchestrator.

### Agent 2: GitHub PR Queue

**Step 1.** Delete the target file: `rm -f dashboard/data-prs.js`

**Step 2.** Use `gh api` to fetch all open PRs the user needs to address. Do NOT use `gh search prs` — it returns empty with OAuth tokens.

```bash
gh api search/issues --method GET -f q="is:open is:pr involves:SBosticParadigm archived:false" -f per_page=100 --jq '.items[] | {title: .title, repo: (.repository_url | split("/") | .[-2:] | join("/")), number: .number, url: .html_url, author: .user.login, created_at: .created_at}'
```

Split results into two arrays:
- `mine` — PRs authored by `SBosticParadigm`
- `review` — all other PRs

**Write to `dashboard/data-prs.js`** in exactly this format:

```js
window.BRIEFING_PRS = {
    mine: [
        {
            "id": "pr-" + repo + "-" + number,
            "title": PR title,
            "meta": repo + " · #" + number + " · " + author + " · " + Xd ago,
            "url": PR URL
        },
        ...
    ],
    review: [ ... same shape ... ]
};
```

Return only a brief confirmation. Do NOT return the JSON payload to the orchestrator.

### Agent 3: GitHub Assigned Issues

**Step 1.** Delete the target file: `rm -f dashboard/data-issues.js`

**Step 2.** Use `gh api` to fetch all open issues assigned to the user. Do NOT use `gh search issues` — it returns empty with OAuth tokens.

```bash
gh api search/issues --method GET -f q="is:issue is:open assignee:SBosticParadigm archived:false" -f sort=updated -f order=desc -f per_page=100 --jq '.items[] | {title: .title, repo: (.repository_url | split("/") | .[-2:] | join("/")), number: .number, url: .html_url, labels: [.labels[].name], updated_at: .updated_at}'
```

Sort by last-updated descending.

**Write to `dashboard/data-issues.js`** in exactly this format:

```js
window.BRIEFING_ISSUES = [
    {
        "id": "issue-" + repo + "-" + number,
        "title": issue title,
        "meta": repo + " · #" + number + " · " + Xd ago,
        "url": issue URL,
        "labels": [ label name strings ]
    },
    ...
];
```

Return only a brief confirmation. Do NOT return the JSON payload to the orchestrator.

### After All Agents Complete: Write Meta File

**Step 1.** Delete the target file: `rm -f dashboard/data-meta.js`

**Step 2.** Get the current time by running this Bash command and use its **exact** stdout as `generatedAt`. Do NOT type the time from memory — the system clock is the only reliable source:

```bash
date '+%-m/%-d/%Y %-I:%M %p'
```

Read `intervalMinutes` from `config/schedule.json` (default `30` if absent), then write `dashboard/data-meta.js` in this exact shape — replace `MM/DD/YYYY h:mm AM/PM` with the real `date` output above and `30` with the configured interval:

```js
window.BRIEFING_META = { generatedAt: "MM/DD/YYYY h:mm AM/PM", intervalMinutes: 30 };
```

`data-meta.js` is written **last** (after the three data files) — the dashboard polls it for a changed `generatedAt` and uses that as the signal that fresh data files are ready. `intervalMinutes` drives the dashboard's stale indicator.

**Do NOT open the dashboard.** The repeating polls run windowless (headless `claude -p`), so launching a browser from them would be disruptive. Open the dashboard once each morning (`scripts/open-dashboard.ps1`); it auto-reloads in place when `generatedAt` changes.

Do NOT modify `template.html`. Do NOT generate HTML. Do NOT write a combined `data.js`. The template loads `data-meta.js`, `data-emails.js`, `data-prs.js`, and `data-issues.js` separately and stitches them into `window.BRIEFING_DATA` on load.

## Reference Files

### General Logs
Path: `WorkingFiles/General Logs.txt`

When the user says "Check general logs" (or similar), read this file. It is the canonical free-form log/notes file for this project.
