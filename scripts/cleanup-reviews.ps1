# Ages out the one-click PR review cache (the configured reviews root): removes per-PR worktrees (and
# their pr-<n> branches and rendered briefs) not launched in the last -Days days. The per-repo
# base clones are kept - they are the one-time expensive part. Run manually whenever; every
# launch-review.ps1 run resets its worktree's clock.
param(
    [int]$Days = 7
)

$ErrorActionPreference = 'Stop'

# Same reviewsRoot (config\dashboard.json) launch-review.ps1 populates.
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$reviewsRoot = (Get-Content -Raw (Join-Path $repoRoot "config\dashboard.json") | ConvertFrom-Json).reviewsRoot
if (-not (Test-Path $reviewsRoot)) {
    Write-Host "No reviews cache at $reviewsRoot - nothing to clean."
    return
}

$cutoff = (Get-Date).AddDays(-$Days)

Get-ChildItem $reviewsRoot -Directory |
    Where-Object { $_.Name -match '-(pr-\d+)$' -and $_.LastWriteTime -lt $cutoff } |
    ForEach-Object {
        $null = $_.Name -match '^(.+)-(pr-\d+)$'
        $cloneDir = Join-Path $reviewsRoot $Matches[1]
        [string]$branch = $Matches[2]
        if (Test-Path (Join-Path $cloneDir ".git")) {
            git -C $cloneDir worktree remove --force $_.FullName
            git -C $cloneDir branch -D $branch | Out-Null
        } else {
            # Base clone is gone, so the worktree is orphaned - plain delete is all that's left.
            Remove-Item -Recurse -Force $_.FullName
        }
        Write-Host "Removed worktree $($_.Name)"
    }

# Briefs follow their worktree's lifecycle, not their own age: each brief is named after its
# worktree dir (<owner>-<repo>-pr-<n>.md), so a brief is stale exactly when its worktree is gone -
# whether removed in the loop above or deleted some other way. Keying off worktree existence (not
# a separate age cutoff) keeps the two policies in step: an intentionally-kept worktree never
# loses its brief, and no orphan briefs linger.
$briefDir = Join-Path $reviewsRoot "briefs"
if (Test-Path $briefDir) {
    Get-ChildItem $briefDir -File -Filter *.md |
        Where-Object { -not (Test-Path (Join-Path $reviewsRoot $_.BaseName)) } |
        Remove-Item
}
