#!/usr/bin/env bash
# Fetch my open Jira tickets (Data Center) as dashboard items — the Jira half of the
# Issues pane during the GitHub→Jira migration (issue #66). Emits a JSON array of
# { id, title, meta, url, labels, source } objects to stdout (subtasks also carry an
# optional parentKey for nesting, #72); diagnostics go to stderr.
# The briefing's Issues agent concatenates this with the GitHub list into data/issues.js.
#
# Auth mirrors the `jira` skill exactly (its references/jira-token.md is the single source):
# a per-user PAT in a git-ignored .claude/jira-token.local (provisioned repo copy, else home),
# fed to curl ONLY on stdin via `-K -` so it never lands in argv/env/process list. Run under
# Bash, never PowerShell (PS `curl` is an Invoke-WebRequest alias that mangles -K/-G).
set -euo pipefail

# The Jira base URL lives in the shared script-side config. Fail loudly when unset — a fork
# that hasn't configured Jira should see why, not silently query someone else's host.
CONFIG_FILE="$(cd "$(dirname "$0")/.." && pwd)/config/dashboard.json"
JIRA_BASE="$(node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).jiraBaseUrl || ""))' "$CONFIG_FILE")"
if [ -z "$JIRA_BASE" ]; then
  echo "fetch-jira: no jiraBaseUrl in config/dashboard.json." >&2
  exit 1
fi
JIRA_BASE="${JIRA_BASE%/}"
BASE="$JIRA_BASE/rest/api/2"
JQL="assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC"
FIELDS="summary,status,updated,priority,issuetype,labels,parent"
PAGE=100

# Resolve the token file: a provisioned (git-ignored) repo copy wins, else the home copy.
R="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -n "$R" ] && git -C "$R" check-ignore -q "$R/.claude/jira-token.local" 2>/dev/null && [ -s "$R/.claude/jira-token.local" ]; then
  TOKEN_FILE="$R/.claude/jira-token.local"
else
  TOKEN_FILE="$HOME/.claude/jira-token.local"
fi
if [ ! -s "$TOKEN_FILE" ]; then
  echo "fetch-jira: no Jira PAT found — run /jira once to set it up." >&2
  exit 1
fi

# Emit the Bearer header as a curl config-file directive on stdin (token never in argv).
auth_cfg() {
  local t
  t="$(sed -n '/^[[:space:]]*#/d;s/.*"\([^"]*\)".*/\1/p' "$TOKEN_FILE" | head -1)"
  [ -z "$t" ] && t="$(grep -vE '^[[:space:]]*(#|$)' "$TOKEN_FILE" | head -1)"
  printf 'header = "Authorization: Bearer %s"\n' "$(printf %s "$t" | tr -d '\r\n')"
}

# Page through /search, appending each page's raw response as one line of JSONL.
pages="$(mktemp)"
trap 'rm -f "$pages"' EXIT
start=0
while : ; do
  resp="$(auth_cfg | curl -sS -K - -G "$BASE/search" \
    --data-urlencode "jql=$JQL" \
    --data-urlencode "fields=$FIELDS" \
    --data-urlencode "startAt=$start" \
    --data-urlencode "maxResults=$PAGE")"
  printf '%s\n' "$resp" >> "$pages"
  total="$(printf '%s' "$resp" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).total??0))}catch{process.stdout.write("0")}})')"
  start=$((start + PAGE))
  [ "$start" -ge "${total:-0}" ] && break
done

# Transform every page's issues into the dashboard item shape, recency-sorted.
node -e '
  const fs = require("fs");
  const lines = fs.readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean);
  const browse = process.argv[2] + "/browse/";
  const now = Date.now();
  const seen = new Set();
  const items = lines.flatMap(l => { try { return JSON.parse(l).issues || []; } catch { return []; } })
    .filter(i => !seen.has(i.key) && seen.add(i.key))
    .sort((a, b) => new Date(b.fields.updated) - new Date(a.fields.updated))
    .map(i => {
      const f = i.fields;
      const days = Math.max(0, Math.floor((now - new Date(f.updated)) / 86400000));
      // Jira sets fields.parent only on sub-tasks (Data Center classic), so parentKey
      // is the linkage that lets the dashboard nest a subtask under its parent story (#72);
      // it is absent on stories/standalone issues, where the field is simply omitted.
      const item = {
        id: "issue-" + i.key,
        title: f.summary,
        meta: i.key + " · " + f.status.name + " · " + days + "d ago",
        url: browse + i.key,
        labels: [f.issuetype.name, ...(f.labels || [])],
        source: "Jira",
      };
      if (f.parent && f.parent.key) item.parentKey = f.parent.key;
      return item;
    });
  process.stdout.write(JSON.stringify(items, null, 2));
' "$pages" "$JIRA_BASE"
