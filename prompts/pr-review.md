# PR review: {REPO} #{NUMBER} — "{TITLE}"

You are reviewing pull request #{NUMBER} in {REPO}: "{TITLE}".
URL: {PR_URL}

Your working directory is a dedicated review worktree already checked out at this
PR's HEAD — read files directly with Read/Grep/Glob, and open whole files for
context; do not stop at the diff hunks.

Do these in order:

1. Fetch the PR metadata:
   `gh pr view {NUMBER} -R {REPO} --json title,body,author,additions,deletions,changedFiles,baseRefName,headRefName,commits`
2. Fetch the diff to see exactly what changed against the base branch:
   `gh pr diff {NUMBER} -R {REPO}`
3. Read the most consequential changed files in full for context (not just the hunks).
4. Review for:
   - Correctness bugs and logic errors
   - Unhandled edge cases (nulls, empties, off-by-one, concurrency)
   - Error-handling gaps
   - Security issues
   - Code quality, clarity, and naming
   - Missing or weak test coverage
5. Produce a conversational findings summary grouped by severity — **Blocking /
   Should fix / Nit / Praise** — citing `file:line` for each finding.

This is an interactive review: surface findings most-severe first and let me
drive any follow-ups. Do **not** post anything to GitHub — comments, reviews,
and approvals are mine to write. This is a preliminary pass to inform my review.
