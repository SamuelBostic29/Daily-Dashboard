// Shared rendering for the Daily Dashboard — used by template/template.html,
// preview/preview.html, and the TODO view, so an item change lands on every surface at once.
//
// Escaping is solved once, here: the html`` tagged template escapes every interpolated value,
// so item data (email subjects, PR/issue titles, labels, urls) can never inject markup. There
// are no per-field escape calls to remember or get wrong. The dismiss button carries no inline
// handler — behavior.js attaches one delegated listener — so item ids never enter a JS string.

(function () {
    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // Wraps already-built html`` markup so the html`` tag splices it without re-escaping.
    // This is the ONLY way to bypass escaping — it must never be applied to external data.
    function raw(markup) {
        return { __rawHtml: String(markup == null ? '' : markup) };
    }

    // Tagged template: every ${value} is HTML-escaped unless explicitly wrapped in raw().
    function html(strings, ...values) {
        return strings.reduce((out, str, i) => {
            if (i >= values.length) return out + str;
            const v = values[i];
            return out + str + (v && v.__rawHtml !== undefined ? v.__rawHtml : escapeHtml(v));
        }, '');
    }

    // Only let http(s) URLs reach an href; anything else (javascript:, data:, …) becomes inert.
    function safeUrl(url) {
        const u = String(url == null ? '' : url).trim();
        return /^https?:\/\//i.test(u) ? u : '#';
    }

    // Items indexed by id as they render, so behavior code (e.g. the Add-to-TODO selection
    // mode) can resolve a card in the DOM back to its data without re-deriving it from page
    // globals. Re-renders simply re-register; lookups only ever use ids present in the DOM.
    const renderedItems = {};

    function getItem(id) {
        return renderedItems[id];
    }

    // Generic item card. The per-type wrappers below are the seam where one type can
    // diverge (e.g. #25's one-click PR review → renderReviewPRItem) without touching the others.
    function renderItemBase(item, opts) {
        opts = opts || {};
        renderedItems[item.id] = item;
        const showPreview = opts.showPreview !== undefined ? opts.showPreview : !!item.preview;
        const showLabels =
            opts.showLabels !== undefined ? opts.showLabels : !!(item.labels && item.labels.length);
        const lead = opts.lead !== undefined ? opts.lead : '';

        // NOTE: this <button> sits inside the item's <a>, which is technically an invalid content
        // model (interactive content inside a link). It works because behavior.js's delegated
        // handler calls preventDefault so a dismiss click never navigates — keep that guarantee if
        // a future surface reuses this, or restructure the button out of the <a> (tracked separately).
        const action =
            opts.action !== undefined
                ? opts.action
                : html`<button class="dismiss-btn" type="button" aria-label="Dismiss">&times;</button>`;
        const preview = showPreview ? html`<div class="item-preview">${item.preview}</div>` : '';
        const labels = showLabels
            ? ' · ' +
              item.labels
                  .map((l) => {
                      return html`<span class="label-tag">${l}</span>`;
                  })
                  .join(' ')
            : '';
        // A nested row (a Jira subtask under its parent, #72) gets the child modifier, which CSS
        // turns into the indent + connector; otherwise it's an ordinary item.
        const cls = 'item' + (opts.nested ? ' item-child' : '');

        return (
            html`<a class="${cls}" href="${safeUrl(item.url)}" target="_blank" rel="noopener noreferrer" data-item-id="${item.id}">` +
            html`<div class="item-row">${raw(lead)}<span class="item-primary">${item.title}</span>${raw(action)}</div>` +
            preview +
            html`<div class="item-meta">${item.meta}${raw(labels)}</div>` +
            html`</a>`
        );
    }

    function renderEmailItem(item) {
        return renderItemBase(item);
    }
    function renderPRItem(item) {
        return renderItemBase(item);
    }

    // A small chip marking an item's tracker (GitHub vs Jira). The modifier class drives the
    // per-source color; absent source → no chip.
    function sourceChip(source) {
        if (!source) return '';
        const mod = source.toLowerCase() === 'jira' ? 'source-jira' : 'source-github';
        return html`<span class="source-tag ${mod}">${source}</span>`;
    }

    // Jira has no fixed public host, so the browse-link pattern is derived from the configured
    // base URL (config/dashboard.js) — a fork's chips follow whatever Jira it points at, and
    // with no jiraBaseUrl configured the Jira inference simply stays off (#76).
    function jiraBrowsePattern() {
        const base = (window.DASHBOARD_CONFIG || {}).jiraBaseUrl;
        if (!base) return null;
        const host = String(base)
            .replace(/^https?:\/\//i, '')
            .replace(/\/.*$/, '');
        const escaped = host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`^https?://${escaped}/browse/[A-Za-z][A-Za-z0-9]*-\\d+`, 'i');
    }

    // Infer a tracker from a link so custom TODO entries get a chip from their URL alone:
    // a GitHub issue link (github.com/<owner>/<repo>/issues/<n>) → GitHub, a configured-Jira
    // browse link (…/browse/KEY-123) → Jira. PR links (…/pull/<n>) deliberately don't match.
    function sourceFromUrl(url) {
        const u = String(url == null ? '' : url);
        if (/^https?:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+/i.test(u)) return 'GitHub';
        const jira = jiraBrowsePattern();
        if (jira && jira.test(u)) return 'Jira';
        return '';
    }

    // An explicit source (set by the briefing fetchers) wins; otherwise derive it from the link.
    function resolveSource(item) {
        return item.source || sourceFromUrl(item.url);
    }

    function renderIssueItem(item, nested) {
        return renderItemBase(item, { lead: sourceChip(resolveSource(item)), nested });
    }

    // Nest Jira subtasks (#72): render each parent/orphan in place, immediately followed by any of
    // its children present in the SAME list, which renderFn draws indented (nested=true). A subtask
    // whose parent isn't in this list — an orphan, or a parent sitting in another TODO lane — falls
    // back to rendering flat, in its original position. Order is otherwise preserved. renderFn is
    // the per-surface card (renderIssueItem on the dashboard, renderTodoItem in the TODO view).
    function renderNestedIssues(items, renderFn) {
        const present = {};
        items.forEach((it) => {
            present[it.id] = true;
        });
        const parentIdOf = function (it) {
            return it.parentKey ? 'issue-' + it.parentKey : '';
        };
        const childrenOf = {};
        items.forEach((it) => {
            const pid = parentIdOf(it);
            if (pid && present[pid]) (childrenOf[pid] = childrenOf[pid] || []).push(it);
        });
        return items
            .filter((it) => {
                const pid = parentIdOf(it);
                return !(pid && present[pid]); // children are emitted under their parent below, not here
            })
            .map((it) => {
                return (
                    renderFn(it, false) +
                    (childrenOf[it.id] || [])
                        .map((c) => {
                            return renderFn(c, true);
                        })
                        .join('')
                );
            })
            .join('');
    }

    // The dashboard Issues section: like renderSection, but nests subtasks under their parent.
    function renderIssues(items) {
        const body = document.getElementById('issues-body');
        if (!body) return;
        body.innerHTML =
            items && items.length
                ? renderNestedIssues(items, renderIssueItem)
                : renderList(items, renderIssueItem);
    }

    // One-click PR review entry point (#25): a leading Review button that launches an
    // interactive Claude review session via the gmc-review:// protocol (click handled in
    // behavior.js, hand-off implemented by scripts/launch-review.ps1).
    const reviewButton = html`<button class="review-btn" type="button" aria-label="Review with Claude">Review</button>`;

    // Review-queue PRs on the dashboard.
    function renderReviewPRItem(item) {
        return renderItemBase(item, { lead: reviewButton });
    }

    // Map items through renderFn, or an empty-state when there are none. Returns a markup string.
    // renderFn is invoked with the item alone — never as a bare .map callback, whose index argument
    // would land in the renderers' optional `nested` param and indent every row after the first.
    function renderList(items, renderFn, emptyText) {
        // undefined/null means the section's data file failed to load or parse (its BRIEFING_*
        // global never got assigned) — visibly different from an empty list, which is real,
        // successfully-fetched data that happens to have no items (#83).
        if (items == null) {
            return html`<div class="error-state">Data didn't load — check the last briefing run's log</div>`;
        }
        if (!items.length) {
            return html`<div class="empty-state">${emptyText || 'No items'}</div>`;
        }
        return items
            .map((item) => {
                return renderFn(item);
            })
            .join('');
    }

    // Render a flat section (emails / issues) into its #<id>-body container.
    function renderSection(id, items, renderFn) {
        const body = document.getElementById(id + '-body');
        if (body) body.innerHTML = renderList(items, renderFn);
    }

    // Render the PR section's two sub-groups (mine / needs-review) into #prs-body.
    function renderPRs(prs) {
        const body = document.getElementById('prs-body');
        if (!body) return;
        if (prs == null) {
            body.innerHTML = renderList(prs, null);
            return;
        }
        const mine = prs.mine || [];
        const review = prs.review || [];
        if (!mine.length && !review.length) {
            body.innerHTML = renderList([], null, 'No items');
            return;
        }
        body.innerHTML =
            html`<div class="sub-group-label">Needs My Review</div>` +
            renderList(review, renderReviewPRItem, 'None') +
            html`<div class="sub-group-label">My PRs</div>` +
            renderList(mine, renderPRItem, 'None');
    }

    // The TODO view's sub-headers, in display order; only groups with items render.
    const TODO_GROUPS = [
        { type: 'email', label: 'Emails' },
        { type: 'pr', label: 'Pull Requests' },
        { type: 'issue', label: 'Issues' },
        { type: 'custom', label: 'Custom' },
    ];

    // The lane-move control: a To Do card moves up to In Progress (▲); an In Progress card moves
    // down to To Do (▼) — matching the lanes' vertical order. The target lane rides in
    // data-target-status, read at click time in behavior.js (the id never enters a JS string).
    function todoMoveButton(item) {
        return item.status === 'in-progress'
            ? html`<button class="todo-move-btn" type="button" data-target-status="todo" aria-label="Move back to To Do" title="Back to To Do">&#9660;</button>`
            : html`<button class="todo-move-btn" type="button" data-target-status="in-progress" aria-label="Move to In Progress" title="Start">&#9650;</button>`;
    }

    // Compact card for the TODO view: no preview; trailing controls are the move (▶/◀) and the
    // remove (×), which deletes from the store (permanently) rather than dismissing for the day. PR
    // items keep the leading Review entry point here too — the type can't distinguish the review
    // queue from own PRs, so every PR gets the button and launchReview validates the URL on click.
    function renderTodoItem(item, nested) {
        return renderItemBase(item, {
            showPreview: false,
            nested,
            lead: sourceChip(resolveSource(item)) + (item.type === 'pr' ? reviewButton : ''),
            action:
                todoMoveButton(item) +
                html`<button class="todo-remove-btn" type="button" aria-label="Remove from TODO">&times;</button>`,
        });
    }

    // One lane: a drop-target wrapper (its data-lane-status is where a card dropped on it lands)
    // holding the lane header and the items grouped under the type sub-headers — or a one-line hint
    // when empty, so a lane (notably In Progress) stays visible, droppable, and discoverable.
    function renderTodoLane(status, label, items, emptyHint) {
        const inner = items.length
            ? TODO_GROUPS.map((group) => {
                  const grouped = items.filter((item) => {
                      return item.type === group.type;
                  });
                  if (!grouped.length) return '';
                  // Issues nest subtasks under their parent; nesting is confined to this lane's items,
                  // so a parent and child split across lanes (#72) render flat in their own lanes.
                  const rows =
                      group.type === 'issue'
                          ? renderNestedIssues(grouped, renderTodoItem)
                          : renderList(grouped, renderTodoItem);
                  return html`<div class="sub-group-label">${group.label}</div>` + rows;
              }).join('')
            : html`<div class="todo-lane-empty">${emptyHint}</div>`;
        return (
            html`<div class="todo-lane" data-lane-status="${status}">` +
            html`<div class="todo-lane-label">${label}</div>` +
            inner +
            html`</div>`
        );
    }

    // Render the TODO view into #todo-body as two stacked lanes. In Progress is shown first — what
    // is actively being worked is the more important lane to see. The whole-list empty state stays
    // for a fresh list; once anything is on it both lanes always show, so a card can move (button
    // or drag) into In Progress and back.
    function renderTodo(items) {
        const body = document.getElementById('todo-body');
        if (!body) return;
        if (!items || !items.length) {
            body.innerHTML = renderList([], null, 'Nothing on the list yet — add items from the Dashboard');
            return;
        }
        const inProgress = items.filter((item) => {
            return item.status === 'in-progress';
        });
        const todo = items.filter((item) => {
            return item.status !== 'in-progress';
        });
        body.innerHTML =
            renderTodoLane(
                'in-progress',
                'In Progress',
                inProgress,
                'Nothing in progress yet — start or drag a To Do item here.',
            ) + renderTodoLane('todo', 'To Do', todo, 'Nothing queued.');
    }

    window.DashboardRenderers = {
        html,
        raw,
        escapeHtml,
        getItem,
        renderItemBase,
        renderEmailItem,
        renderPRItem,
        renderReviewPRItem,
        renderIssueItem,
        renderTodoItem,
        renderList,
        renderSection,
        renderIssues,
        renderPRs,
        renderTodo,
    };
})();
