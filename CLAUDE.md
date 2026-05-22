# Good Morning Claude

This project is a personal daily briefing tool that runs via Windows Task Scheduler at 7:30 AM weekdays. When launched, Claude should execute the morning briefing workflow below.

## Morning Briefing Workflow

When prompted to "Run the morning briefing", spin up **3 agents in parallel** — one for each data source below. **Each agent returns a JSON array/object** (not HTML). The orchestrator then writes `dashboard/data.js` and opens `dashboard/template.html`.

### Agent 1: Unread Emails

Use the `mcp__claude_ai_Microsoft_365__outlook_email_search` tool to fetch the 25 most recent unread emails. Search for `isRead:false` with `limit: 25`. Do NOT paginate — one call only.

**Return a JSON array** where each item has:
- `id` — `"email-"` + message id
- `title` — email subject line
- `meta` — sender name + " — " + timestamp
- `url` — deep-link to the message in Outlook (or `https://outlook.office365.com/mail/inbox` as fallback)

### Agent 2: GitHub PR Queue

Use `gh api` to fetch all open PRs the user needs to address. Do NOT use `gh search prs` — it returns empty with OAuth tokens.

```bash
gh api search/issues --method GET -f q="is:open is:pr involves:SBosticParadigm archived:false" -f per_page=100 --jq '.items[] | {title: .title, repo: (.repository_url | split("/") | .[-2:] | join("/")), number: .number, url: .html_url, author: .user.login, created_at: .created_at}'
```

**Return a JSON object** with two arrays:
- `mine` — PRs authored by `SBosticParadigm`
- `review` — all other PRs

Each item has:
- `id` — `"pr-"` + repo + `-` + number
- `title` — PR title
- `meta` — repo · #number · author · Xd ago
- `url` — PR URL

### Agent 3: GitHub Assigned Issues

Use `gh api` to fetch all open issues assigned to the user. Do NOT use `gh search issues` — it returns empty with OAuth tokens.

```bash
gh api search/issues --method GET -f q="is:issue is:open assignee:SBosticParadigm archived:false" -f sort=updated -f order=desc -f per_page=100 --jq '.items[] | {title: .title, repo: (.repository_url | split("/") | .[-2:] | join("/")), number: .number, url: .html_url, labels: [.labels[].name], updated_at: .updated_at}'
```

**Return a JSON array** where each item has:
- `id` — `"issue-"` + repo + `-` + number
- `title` — issue title
- `meta` — repo · #number · Xd ago
- `url` — issue URL
- `labels` — array of label name strings

Sort by last-updated descending.

### After All Agents Complete: Write Data and Open Dashboard

Write `dashboard/data.js` with this exact format:

```js
window.BRIEFING_DATA = {
    generatedAt: "MM/DD/YYYY h:mm AM/PM",
    emails: [ ...Agent 1 results... ],
    prs: { mine: [...], review: [...] },
    issues: [ ...Agent 3 results... ]
};
```

Then open the dashboard:

```powershell
Start-Process "dashboard/template.html"
```

Do NOT modify `template.html`. Do NOT generate HTML. Just write the `data.js` file and open the template.
