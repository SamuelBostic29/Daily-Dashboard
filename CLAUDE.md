# Daily Dashboard

A personal dashboard that refreshes through the day — and via Windows Task Scheduler on weekday mornings — to surface unread email, the PR queue, and assigned issues. On launch, run the briefing workflow below.

## GitHub accounts

This repo is personal-owned, so interactive work uses the personal `SamuelBostic29` account: `git push`/`pull`, `gh issue`/`pr`, and reads alike.

The one exception is the briefing run, which queries Paradigm **work** data (`involves:SBosticParadigm` PRs, `assignee:SBosticParadigm` issues) and so makes its `gh` data calls under the work `SBosticParadigm` account. The mechanism: `scripts/start-session.ps1` sets `DAILY_DASHBOARD_BRIEFING=1` before launching `claude`; the global `gh-account-guard.ps1` hook reads that flag (inherited by the briefing process and its agents) and, with `config/gh-account.json` (`{ "ghAccount": "SBosticParadigm" }`), pins the briefing's data calls to that account. Change the config value to use a different briefing account.

Before launching a briefing via `start-session.ps1`, confirm the work account is active: run `gh auth status`, and if it isn't `SBosticParadigm`, run `gh auth switch --user SBosticParadigm`.

## Morning Briefing Workflow

When prompted to "Run the morning briefing", spin up three agents in parallel, one per data source (emails, PRs, issues). Each agent writes its own data file directly to `dashboard/data/` and returns only a one-line confirmation — never the data payload. Once all three finish, the orchestrator writes the small `data/meta.js` and stops.

### Writer pattern (every agent and the orchestrator)

Each writer below follows the same three rules:

1. **Delete before writing.** The writer's first tool call is the Bash command `rm -f dashboard/data/<target-file>`, before any Write. Writing over an existing file trips the harness's "must Read first" guard and forces a slow Read→Edit fallback; deleting first avoids it, and `rm -f` is silent when the file is absent, so it's safe on the first run.
2. **Use relative paths in Bash.** The working directory is the repo root, so `dashboard/data/<file>` resolves correctly — use it as-is, and never rewrite it to an absolute Windows path. Unquoted backslashes are Bash escape sequences that silently corrupt the path, so the `rm` no-ops and the later Write fails. Bash handles these file operations; PowerShell is only for launching sessions and opening the dashboard.
3. **Emit strings as valid JSON.** Every value placed inside `"..."` (subjects, titles, sender names, previews) is external data that may contain `"`, `\`, or line breaks. Escape each exactly as `JSON.stringify` would — `"`→`\"`, `\`→`\\`, newline→`\n`, return→`\r`, tab→`\t`. A single raw character makes the whole `data/*.js` file invalid, and the browser then loads that section as empty with no error.

After deleting, write only the file format shown for that data source.

### Agent 1: Unread Emails → `data/emails.js`

Read `config/email-filters.json` and build the search query from it:

- Base query: `isRead:false`
- For each entry in `bodyExclusions`, append ` NOT body:"<entry>"`
- For each entry in `senderExclusions`, append ` NOT from:"<entry>"`
- An empty or missing array contributes no clauses; if the file is missing, use the base query alone.

Then fetch the 25 most recent unread emails with `mcp__claude_ai_Microsoft_365__outlook_email_search`, passing:

- `query`: the built query (e.g. `isRead:false NOT body:"claude[bot]" NOT body:"@Copilot" NOT from:"dtdg.co"` with the current config)
- `limit`: `25`

The `NOT body:` clauses drop AI code-review noise while keeping human review comments; the `NOT from:` clauses drop noisy senders (e.g. Datadog alerts). Edit the JSON — not this file — to change filtering. One call only — do not paginate. Capture `bodyPreview` verbatim from each result; don't make extra `read_resource` calls to fetch full bodies.

```js
window.BRIEFING_EMAILS = [
    {
        "id": "email-" + message id,
        "title": email subject line,
        "meta": sender name + " — " + timestamp,
        "url": deep-link to the message in Outlook (or "https://outlook.office365.com/mail/inbox" as fallback),
        "preview": bodyPreview from the search result (first ~255 chars, plain text) — "" if missing
    },
    ...
];
```

### Agent 2: GitHub PR Queue → `data/prs.js`

Fetch open PRs with `gh api` (not `gh search prs`, which returns empty under OAuth tokens):

```bash
gh api search/issues --method GET -f q="is:open is:pr involves:SBosticParadigm archived:false" -f per_page=100 --jq '.items[] | {title: .title, repo: (.repository_url | split("/") | .[-2:] | join("/")), number: .number, url: .html_url, author: .user.login, created_at: .created_at}'
```

Split into `mine` (authored by `SBosticParadigm`) and `review` (all others):

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

### Agent 3: Assigned Issues (Jira) → `data/issues.js`

Issue tracking has moved fully to Jira — GitHub issues are no longer fetched (personal GitHub issues live in the TODO list instead). Each item still carries `source: "Jira"` so the pane shows the tracker chip.

**Jira** — my open Data Center tickets, already in final item shape, via the committed script (Bash, never PowerShell; it resolves the per-user PAT and pages `/rest/api/2/search` itself):

```bash
bash scripts/fetch-jira.sh
```

It emits a JSON array of `{ id, title, meta, url, labels, source }`, most-recently-updated first. If it errors (no PAT — tells you to run `/jira`), write an empty `window.BRIEFING_ISSUES = []` rather than failing the briefing. Wrap the array and write:

```js
window.BRIEFING_ISSUES = [
    {
        "id": issue id,
        "title": issue title,
        "meta": "KEY · status · Xd ago",
        "url": ticket URL,
        "labels": [ label name strings ],
        "source": "Jira"
    },
    ...
];
```

### Orchestrator: Meta File → `data/meta.js`

After all three agents finish, write the meta file last. Get the timestamp from the system clock (the only reliable source — don't type it from memory):

```bash
date '+%-m/%-d/%Y %-I:%M %p'
```

Read `intervalMinutes` from `config/schedule.json` (default `30` if absent), then write the `date` output as `generatedAt`:

```js
window.BRIEFING_META = { generatedAt: "MM/DD/YYYY h:mm AM/PM", intervalMinutes: 30 };
```

`data/meta.js` is written last because the dashboard polls it: a changed `generatedAt` is the signal that the three data files are ready, and `intervalMinutes` drives the stale indicator.

Don't open the dashboard from the briefing — the repeating polls run windowless (headless `claude -p`), so launching a browser would be disruptive. Open it once each morning with `scripts/open-dashboard.ps1`; it auto-reloads in place when `generatedAt` changes.

Don't modify `dashboard/template/template.html`, generate HTML, or write a combined `data.js`. The data files live in `dashboard/data/` (write them there); the template lives in `dashboard/template/` and loads `../data/meta.js`, `../data/emails.js`, `../data/prs.js`, and `../data/issues.js` separately, stitching them into `window.BRIEFING_DATA` on load.

## Reference Files

**General Logs** — `WorkingFiles/General Logs.txt`. When the user says "Check general logs" (or similar), read this file. It's the canonical free-form log/notes file for this project.
