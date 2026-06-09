# dashboard/data/

Holds the briefing's generated data files — `meta.js`, `emails.js`, `prs.js`, `issues.js` —
which `template/template.html` loads as `window.BRIEFING_*` globals on each refresh.

Those files are **git-ignored** (`dashboard/data/*.js` in `.gitignore`): they contain live
personal data (unread email subjects, your PR/issue queues) and are rewritten on every briefing
run, so they must never be committed. This README is the only tracked file here — it exists so
the folder is present on a fresh clone, because the briefing writer and the dashboard both
expect `dashboard/data/` to already exist.
