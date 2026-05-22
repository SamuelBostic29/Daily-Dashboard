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

### Step 4: Generate Dashboard

Once all data is collected, generate a self-contained HTML dashboard file and open it in the default browser. See the Dashboard section below for format details.

## Dashboard Format

Generate a single self-contained HTML file (inline CSS/JS, no external dependencies) at `dashboard/briefing.html`.

The dashboard should include:
- **Header** with the current date and time of generation
- **Emails section** with badge count, showing each email's sender, subject, time, and preview
- **Teams section** with badge count, showing DMs, @mentions, and channel notifications with sender/channel, preview, and time
- **PR Queue section** with badge count, split into "My PRs" and "Needs My Review" sub-groups, showing each PR's title, repo, author, age, and CI status
- Each item should be clickable (links to the original item)
- Items can be dismissed per session (use localStorage, resets next morning)
- Clean, professional dark theme
- Keyboard navigation between sections

After generating the file, open it with `Start-Process` (on Windows).
