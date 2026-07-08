# Protocol handler for gmc-review:// - the dashboard's one-click PR review (#25).
#
# Invoked windowless by the URL scheme registered in install-protocol.ps1, with the full
# gmc-review:// URL as the single argument. Ensures a base clone of the PR's repo exists in
# the reviews root, materializes a git worktree at the PR's HEAD, renders prompts/pr-review.md
# into a brief file, and opens a Windows Terminal tab running an interactive `claude` session
# in that worktree pointed at the brief.
#
# Quoting is the #1 failure mode of this launch (per the review-session skill's verified
# recipes): the prompt must reach claude as ONE argument, so it is short and quote-free and
# the rendered review brief travels by file, never on the command line.
param(
    [Parameter(Mandatory)]
    [string]$Url
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
# Clones and worktrees are full source checkouts - point reviewsRoot (config\dashboard.json,
# shared with cleanup-reviews.ps1) at a roomy drive, not C:.
$reviewsRoot = (Get-Content -Raw (Join-Path $repoRoot "config\dashboard.json") | ConvertFrom-Json).reviewsRoot
$logFile = Join-Path $reviewsRoot "launch.log"

# This script runs with no visible console, so failures must surface themselves.
function Fail([string]$Message) {
    Add-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show($Message, "Daily Dashboard - review launch failed") | Out-Null
    exit 1
}

# Pre-answer Claude Code's "Do you trust the files in this folder?" dialog for a worktree.
# There is no trusted-folders setting yet (anthropic/claude-code#12737, #23109), so this seeds
# the same per-path acceptance the dialog itself writes into ~/.claude.json's projects map.
# The owner allowlist above guarantees Path only ever points at code from a trusted owner, so
# auto-trusting it is safe; the danger here is instead corrupting Claude's live state file.
#
# The edit is a SURGICAL string splice of one entry, not a ConvertTo-Json round-trip: on PS 5.1
# that serializer truncates at depth 2 and reformats the whole file, which would mangle the
# state far worse than a splice. The splice is wrapped in three guards so a bad write can't ship:
#   1. Parse-first  - only touch a file that is already valid JSON, and test "already trusted?"
#                     against the parsed object, not a substring (escaping can't fool it).
#   2. Verify-after - re-parse the spliced text and confirm the entry is readable at the
#                     TOP-LEVEL projects.<path>; this catches a mis-anchored splice (a
#                     "projects":{ nested inside some value), which leaves the key unreadable.
#   3. Atomic write - write a temp file and File.Replace, so a crash mid-write can't truncate it.
# .NET read/write keeps it UTF-8 with no BOM (Set-Content would add one). Best-effort by design:
# on any surprise it skips and the dialog simply shows once for this PR.
function Set-WorktreeTrusted([string]$Path) {
    try {
        $stateFile = Join-Path $HOME ".claude.json"
        if (-not (Test-Path $stateFile)) { return }
        [string]$json = [System.IO.File]::ReadAllText($stateFile)

        # Guard 1: parse before touching, and check idempotency against the parsed object.
        $state = $json | ConvertFrom-Json
        if (-not $state.projects) { return }                         # no projects map to splice into
        if ($state.projects.PSObject.Properties[$Path]) { return }   # Claude already knows this path

        $marker = [regex]::Match($json, '"projects"\s*:\s*\{')
        if (-not $marker.Success) { return }
        [int]$at = $marker.Index + $marker.Length
        [string]$key = '"' + $Path.Replace('\', '\\') + '"'
        [string]$separator = if ($json.Substring($at).TrimStart().StartsWith('}')) { '' } else { ',' }
        [string]$spliced = $json.Substring(0, $at) + $key + ':{"hasTrustDialogAccepted":true}' + $separator + $json.Substring($at)

        # Guard 2: the spliced text must still parse AND expose our entry at the top level.
        $check = $spliced | ConvertFrom-Json
        $entry = $check.projects.PSObject.Properties[$Path]
        if (-not $entry -or $entry.Value.hasTrustDialogAccepted -ne $true) {
            Add-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Trust pre-seed skipped: splice did not verify for $Path"
            return
        }

        # Guard 3: atomic replace. [NullString]::Value passes a real null for the (unused) backup
        # path - a bare $null marshals to "" here, which File.Replace rejects as an illegal path.
        [string]$tmp = $stateFile + ".gmc-tmp"
        [System.IO.File]::WriteAllText($tmp, $spliced)
        [System.IO.File]::Replace($tmp, $stateFile, [NullString]::Value)
        Add-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Pre-trusted $Path"
    } catch {
        Add-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Trust pre-seed skipped: $($_.Exception.Message)"
    }
}

# PS 5.1 turns redirected native stderr into terminating errors under 'Stop', and git/gh
# write progress there - run native commands under 'Continue' and gate on the exit code.
function Invoke-Native([string]$Exe, [string[]]$NativeArgs) {
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    [string[]]$output = & $Exe @NativeArgs 2>&1
    $ErrorActionPreference = $prevEap
    if ($LASTEXITCODE -ne 0) {
        Fail "$Exe $($NativeArgs -join ' ') failed:`n$($output -join "`n")"
    }
    return $output
}

New-Item -ItemType Directory -Force $reviewsRoot | Out-Null
# Logged on entry, not just on completion: a first-time clone can take minutes, and this
# line is how you tell "working on it" from "the protocol never fired".
Add-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Handling $Url"

try {
    # --- Parse and validate the gmc-review:// URL ---
    $uri = [Uri]$Url
    if ($uri.Scheme -ne 'gmc-review') { Fail "Unexpected URL scheme: $Url" }

    $query = @{}
    foreach ($pair in $uri.Query.TrimStart('?') -split '&') {
        [string[]]$kv = $pair -split '=', 2
        if ($kv.Count -eq 2) { $query[$kv[0]] = [Uri]::UnescapeDataString($kv[1]) }
    }

    # The PR URL is the only trusted input: owner/repo/number are derived from it, so a
    # hostile invocation can't point the clone or the prompt anywhere the URL guard rejects.
    [string]$prUrl = $query['url']
    if ($prUrl -notmatch '^https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)/pull/(\d+)$') {
        Fail "Refusing non-GitHub-PR url parameter: $prUrl"
    }
    [string]$owner = $Matches[1]
    [string]$repo = $Matches[2]
    [string]$number = $Matches[3]
    # A `title` query param, if present, is deliberately ignored: the title lands in the brief an
    # interactive Claude session reads, so page-supplied text is a prompt-injection surface. The
    # real title is fetched from GitHub below; until then the neutral fallback stands.
    [string]$title = "$owner/$repo #$number"

    # --- Owner allowlist ---
    # The regex above fixes the URL *shape*, not its *target*: github.com/<anything> covers
    # every repo an attacker can create, so once the browser "always allow" is granted a hostile
    # page could point the clone at attacker-controlled code (which the trust pre-seed below
    # would then mark trusted). Restrict the target to configured owners, matched
    # case-insensitively. Fail closed - a missing or empty list refuses every review rather than
    # silently re-opening the hole.
    $ownerConfig = Join-Path $repoRoot "config\review-owners.json"
    [string[]]$allowedOwners = @()
    if (Test-Path $ownerConfig) {
        $allowedOwners = @((Get-Content -Raw $ownerConfig | ConvertFrom-Json).allowedOwners | Where-Object { $_ })
    }
    if ($allowedOwners.Count -eq 0) {
        Fail "Review owner allowlist (config\review-owners.json) is missing or empty - refusing to clone $owner/$repo."
    }
    if ($allowedOwners -notcontains $owner) {
        Fail "Owner '$owner' is not in the review allowlist (config\review-owners.json) - refusing to clone $owner/$repo."
    }

    # --- Pin GitHub auth to the briefing account (config/gh-account.json) ---
    # The review queue is work PRs, but the active gh account varies; a token in the
    # environment scopes the clone/fetch to the right account without switching globally.
    $accountConfig = Join-Path $repoRoot "config\gh-account.json"
    if (Test-Path $accountConfig) {
        [string]$account = (Get-Content -Raw $accountConfig | ConvertFrom-Json).ghAccount
        # Invoke-Native merges stderr (gh prints update notices and the like there), so don't
        # blindly take [0] - pick the line that actually looks like a gh token. No match means
        # fail loudly, rather than exporting a warning string as GH_TOKEN and hitting a confusing
        # clone error later.
        [string[]]$tokenOutput = Invoke-Native 'gh' @('auth', 'token', '--user', $account)
        [string]$token = ($tokenOutput | Where-Object { $_ -match '^(gh[a-z]_|github_pat_)' } | Select-Object -First 1)
        if (-not $token) { Fail "Could not read a gh token for '$account' (gh output: $($tokenOutput -join ' | '))" }
        $env:GH_TOKEN = $token.Trim()
    }

    # --- Derive the tab/brief title from GitHub (the PR itself), never from the caller ---
    # Soft-fail by design, unlike Invoke-Native: a flaky title fetch shouldn't kill the launch,
    # it just leaves the neutral owner/repo#number fallback. Stderr is dropped rather than
    # merged so a gh update notice can't be mistaken for the title line.
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    [string[]]$titleOutput = & gh pr view $number -R "$owner/$repo" --json title -q '.title' 2>$null
    [bool]$titleOk = ($LASTEXITCODE -eq 0)
    $ErrorActionPreference = $prevEap
    if ($titleOk) {
        [string]$fetchedTitle = ($titleOutput | Where-Object { $_ } | Select-Object -First 1)
        if ($fetchedTitle) { $title = $fetchedTitle.Trim() }
    }

    # --- Ensure the base clone, then a worktree at the PR's HEAD ---
    $cloneDir = Join-Path $reviewsRoot "$owner-$repo"
    if (-not (Test-Path (Join-Path $cloneDir ".git"))) {
        Invoke-Native 'gh' @('repo', 'clone', "$owner/$repo", $cloneDir) | Out-Null
    }

    [string]$branch = "pr-$number"
    $worktree = Join-Path $reviewsRoot "$owner-$repo-pr-$number"

    # Reuse only a worktree that is genuinely live for THIS clone - not merely a directory that
    # exists. A dir left by a half-finished prior run, or one whose backing clone was wiped and
    # re-cloned, has a dangling .git link; reusing it would fetch against nothing and fail. Probe
    # with rev-parse (exit 0 = live), and if it's not live, clear the dir and rebuild from scratch.
    [bool]$reuse = $false
    if (Test-Path $worktree) {
        $prevEap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
        & git -C $worktree rev-parse --is-inside-work-tree 2>$null | Out-Null
        $reuse = ($LASTEXITCODE -eq 0)
        $ErrorActionPreference = $prevEap
        if (-not $reuse) { Remove-Item -Recurse -Force $worktree }
    }
    # Always prune first - clears stale admin records (including the dir we may have just removed)
    # so the `worktree add` below can't collide with a dangling registration.
    Invoke-Native 'git' @('-C', $cloneDir, 'worktree', 'prune') | Out-Null

    if ($reuse) {
        # Refresh to the PR's latest HEAD. The worktree has pr-<n> checked out, so `reset --hard`
        # moves BOTH the working tree and the pr-<n> branch ref to FETCH_HEAD - they stay in sync
        # (verified), and force-pushes are handled since reset ignores fast-forward.
        Invoke-Native 'git' @('-C', $worktree, 'fetch', 'origin', "pull/$number/head") | Out-Null
        Invoke-Native 'git' @('-C', $worktree, 'reset', '--hard', 'FETCH_HEAD') | Out-Null
    } else {
        Invoke-Native 'git' @('-C', $cloneDir, 'fetch', '--force', 'origin', "pull/$number/head:$branch") | Out-Null
        Invoke-Native 'git' @('-C', $cloneDir, 'worktree', 'add', $worktree, $branch) | Out-Null
    }
    # cleanup-reviews.ps1 ages worktrees off this timestamp; every launch resets the clock.
    (Get-Item $worktree).LastWriteTime = Get-Date
    Set-WorktreeTrusted $worktree

    # --- Render the review brief from the prompt template ---
    [string]$brief = Get-Content -Raw (Join-Path $repoRoot "prompts\pr-review.md")
    $brief = $brief.Replace('{REPO}', "$owner/$repo").Replace('{NUMBER}', $number).Replace('{TITLE}', $title).Replace('{PR_URL}', $prUrl)
    $briefDir = Join-Path $reviewsRoot "briefs"
    New-Item -ItemType Directory -Force $briefDir | Out-Null
    $briefPath = Join-Path $briefDir "$owner-$repo-pr-$number.md"
    Set-Content -Path $briefPath -Value $brief -Encoding UTF8

    # --- Open the review tab: interactive claude in the worktree, pointed at the brief ---
    # claude.exe directly (never via a shell wrapper, never -p): wt executes the command line
    # itself, and each extra shell layer is another chance for the prompt to word-split.
    $claude = Get-Command claude.exe -ErrorAction SilentlyContinue
    if (-not $claude) { Fail "claude.exe not found on PATH - the native Claude Code install is required." }

    # wt's command line splits commands on ';' and groups arguments on '"' - keep both out
    # of the tab title rather than fighting its escaping rules.
    [string]$tabTitle = $title -replace '[";]', "'"
    [string]$prompt = "Read the review brief at $briefPath and carry out the PR review it describes."
    Start-Process wt.exe -ArgumentList @(
        '-w', '0', 'nt',
        '--title', ('"' + $tabTitle + '"'),
        '--suppressApplicationTitle',
        '--startingDirectory', ('"' + $worktree + '"'),
        ('"' + $claude.Source + '"'), ('"' + $prompt + '"')
    )

    Add-Content -Path $logFile -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Launched review of $owner/$repo#$number in $worktree"
} catch {
    Fail "Review launch failed: $($_.Exception.Message)"
}
