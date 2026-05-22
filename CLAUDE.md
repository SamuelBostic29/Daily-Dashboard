# Good Morning Claude

This project is a personal daily briefing tool that runs via Windows Task Scheduler at 7:30 AM weekdays. When launched, Claude should execute the morning briefing workflow below.

## Morning Briefing Workflow

When prompted to "Run the morning briefing", execute the following data collection steps, then generate the HTML dashboard.

### Step 1: Unread Emails

Use the `mcp__claude_ai_Microsoft_365__outlook_email_search` tool to fetch unread emails from the inbox.

Collect for each email:
- Sender name and email address
- Subject line
- Received timestamp
- Preview snippet (first ~100 characters of the body)
- Deep-link URL to open the message in Outlook

Group emails by conversation/thread where possible.

### Step 2: Teams Notifications

Use the `mcp__claude_ai_Microsoft_365__chat_message_search` tool to fetch unread Teams activity — direct messages, @mentions, and channel notifications.

Collect for each item:
- Sender or channel name
- Message preview
- Timestamp
- Deep-link URL to open the message in Teams

Categorize items as: DMs, @mentions, or channel notifications.

Do not mark anything as read — the user manages read state in Teams.

### Step 3: GitHub PR Queue

Use the `gh` CLI to fetch all open PRs the user needs to address — both their own and PRs they need to review:

```
gh search prs "is:open is:pr involves:SBosticParadigm archived:false" --json title,repository,number,url,author,createdAt,statusCheckRollup
```

Collect for each PR:
- Title
- Repository full name
- PR number and URL
- Author
- Age (days since opened)
- CI check summary (passing/failing/pending)

Split results into two groups:
- **My PRs** — PRs authored by `SBosticParadigm`
- **Needs My Review** — all other PRs in the results

### Step 4: GitHub Assigned Issues

Use the `gh` CLI to fetch all open issues assigned to the user:

```
gh search issues "is:issue is:open assignee:SBosticParadigm archived:false" --sort updated --json title,repository,number,url,labels,milestone,assignees,updatedAt
```

Collect for each issue:
- Title
- Repository full name
- Issue number and URL
- Labels
- Milestone (if any)
- Days since last activity

Sort by last-updated descending so stale issues surface clearly.

### Step 5: Generate Dashboard

Read the template at `dashboard/template.html` and replace the placeholders with the collected data, then write the result to `dashboard/briefing.html` and open it in the browser.

**Placeholders to replace:**

- `{{GENERATED_AT}}` — current date and time (e.g., "Thursday, May 22, 2026 at 7:32 AM")
- `{{EMAILS_CONTENT}}` — email items HTML
- `{{TEAMS_CONTENT}}` — Teams items HTML
- `{{PRS_CONTENT}}` — PR items HTML
- `{{ISSUES_CONTENT}}` — assigned issues items HTML

**Item HTML format** — each item should use this structure:

```html
<a class="item" href="{{URL}}" target="_blank" data-item-id="{{UNIQUE_ID}}">
    <div class="item-row">
        <span class="item-primary">{{TITLE}}</span>
        <button class="dismiss-btn" onclick="dismissItem('{{UNIQUE_ID}}', event)">&times;</button>
    </div>
    <div class="item-meta">{{META_LINE}}</div>
</a>
```

- `data-item-id` must be unique per item (use a hash or combo of source + id)
- `item-primary` is the main text (subject line, PR title, issue title, message preview)
- `item-meta` is the secondary line (sender, repo name, timestamp, labels, etc.)

**PR sub-groups** — use this before each group in the PR section:

```html
<div class="sub-group-label">My PRs</div>
<!-- PR items -->
<div class="sub-group-label">Needs My Review</div>
<!-- PR items -->
```

**Labels** (for issues) — use:

```html
<span class="label-tag">label-name</span>
```

**CI status** (for PRs) — use the appropriate class:

```html
<span class="ci-pass">Passing</span>
<span class="ci-fail">Failing</span>
<span class="ci-pending">Pending</span>
```

**Empty sections** — if a section has no items, use:

```html
<div class="empty-state">No items</div>
```

**After writing the file**, update the badge counts in the HTML (set the badge text to the number of items in each section), then open the file:

```powershell
Start-Process "dashboard/briefing.html"
```
