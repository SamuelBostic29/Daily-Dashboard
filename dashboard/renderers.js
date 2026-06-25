// Shared rendering for the Daily Dashboard — used by template/template.html,
// preview/preview.html, and the TODO view, so an item change lands on every surface at once.
//
// Escaping is solved once, here: the html`` tagged template escapes every interpolated value,
// so item data (email subjects, PR/issue titles, labels, urls) can never inject markup. There
// are no per-field escape calls to remember or get wrong. The dismiss button carries no inline
// handler — behavior.js attaches one delegated listener — so item ids never enter a JS string.

(function () {
    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // Wraps already-built html`` markup so the html`` tag splices it without re-escaping.
    // This is the ONLY way to bypass escaping — it must never be applied to external data.
    function raw(markup) {
        return { __rawHtml: String(markup == null ? '' : markup) };
    }

    // Tagged template: every ${value} is HTML-escaped unless explicitly wrapped in raw().
    function html(strings) {
        var values = Array.prototype.slice.call(arguments, 1);
        return strings.reduce(function (out, str, i) {
            if (i >= values.length) return out + str;
            var v = values[i];
            return out + str + (v && v.__rawHtml !== undefined ? v.__rawHtml : escapeHtml(v));
        }, '');
    }

    // Only let http(s) URLs reach an href; anything else (javascript:, data:, …) becomes inert.
    function safeUrl(url) {
        var u = String(url == null ? '' : url).trim();
        return /^https?:\/\//i.test(u) ? u : '#';
    }

    // Items indexed by id as they render, so behavior code (e.g. the Add-to-TODO selection
    // mode) can resolve a card in the DOM back to its data without re-deriving it from page
    // globals. Re-renders simply re-register; lookups only ever use ids present in the DOM.
    var renderedItems = {};

    function getItem(id) {
        return renderedItems[id];
    }

    // Generic item card. The per-type wrappers below are the seam where one type can
    // diverge (e.g. #25's one-click PR review → renderReviewPRItem) without touching the others.
    function renderItemBase(item, opts) {
        opts = opts || {};
        renderedItems[item.id] = item;
        var showPreview = opts.showPreview !== undefined ? opts.showPreview : !!item.preview;
        var showLabels = opts.showLabels !== undefined ? opts.showLabels : !!(item.labels && item.labels.length);
        var lead = opts.lead !== undefined ? opts.lead : '';

        // NOTE: this <button> sits inside the item's <a>, which is technically an invalid content
        // model (interactive content inside a link). It works because behavior.js's delegated
        // handler calls preventDefault so a dismiss click never navigates — keep that guarantee if
        // a future surface reuses this, or restructure the button out of the <a> (tracked separately).
        var action = opts.action !== undefined ? opts.action
            : html`<button class="dismiss-btn" type="button" aria-label="Dismiss">&times;</button>`;
        var preview = showPreview ? html`<div class="item-preview">${item.preview}</div>` : '';
        var labels = showLabels
            ? ' · ' + item.labels.map(function (l) { return html`<span class="label-tag">${l}</span>`; }).join(' ')
            : '';

        return html`<a class="item" href="${safeUrl(item.url)}" target="_blank" rel="noopener noreferrer" data-item-id="${item.id}">`
            + html`<div class="item-row">${raw(lead)}<span class="item-primary">${item.title}</span>${raw(action)}</div>`
            + preview
            + html`<div class="item-meta">${item.meta}${raw(labels)}</div>`
            + html`</a>`;
    }

    function renderEmailItem(item) { return renderItemBase(item); }
    function renderPRItem(item) { return renderItemBase(item); }

    // A small chip marking an issue's tracker (GitHub vs Jira) during the migration (#66).
    // The modifier class drives the per-source color; absent source → no chip.
    function sourceChip(source) {
        if (!source) return '';
        var mod = source.toLowerCase() === 'jira' ? 'source-jira' : 'source-github';
        return html`<span class="source-tag ${mod}">${source}</span>`;
    }

    function renderIssueItem(item) { return renderItemBase(item, { lead: sourceChip(item.source) }); }

    // One-click PR review entry point (#25): a leading Review button that launches an
    // interactive Claude review session via the gmc-review:// protocol (click handled in
    // behavior.js, hand-off implemented by scripts/launch-review.ps1).
    var reviewButton = html`<button class="review-btn" type="button" aria-label="Review with Claude">Review</button>`;

    // Review-queue PRs on the dashboard.
    function renderReviewPRItem(item) {
        return renderItemBase(item, { lead: reviewButton });
    }

    // Map items through renderFn, or an empty-state when there are none. Returns a markup string.
    function renderList(items, renderFn, emptyText) {
        if (!items || !items.length) {
            return html`<div class="empty-state">${emptyText || 'No items'}</div>`;
        }
        return items.map(renderFn).join('');
    }

    // Render a flat section (emails / issues) into its #<id>-body container.
    function renderSection(id, items, renderFn) {
        var body = document.getElementById(id + '-body');
        if (body) body.innerHTML = renderList(items, renderFn);
    }

    // Render the PR section's two sub-groups (mine / needs-review) into #prs-body.
    function renderPRs(prs) {
        var body = document.getElementById('prs-body');
        if (!body) return;
        var mine = (prs && prs.mine) || [];
        var review = (prs && prs.review) || [];
        if (!mine.length && !review.length) {
            body.innerHTML = renderList([], null, 'No items');
            return;
        }
        body.innerHTML =
            html`<div class="sub-group-label">My PRs</div>`
            + renderList(mine, renderPRItem, 'None')
            + html`<div class="sub-group-label">Needs My Review</div>`
            + renderList(review, renderReviewPRItem, 'None');
    }

    // The TODO view's sub-headers, in display order; only groups with items render.
    var TODO_GROUPS = [
        { type: 'email', label: 'Emails' },
        { type: 'pr', label: 'Pull Requests' },
        { type: 'issue', label: 'Issues' },
        { type: 'custom', label: 'Custom' }
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
    function renderTodoItem(item) {
        return renderItemBase(item, {
            showPreview: false,
            lead: item.type === 'pr' ? reviewButton : '',
            action: todoMoveButton(item)
                + html`<button class="todo-remove-btn" type="button" aria-label="Remove from TODO">&times;</button>`
        });
    }

    // One lane: a drop-target wrapper (its data-lane-status is where a card dropped on it lands)
    // holding the lane header and the items grouped under the type sub-headers — or a one-line hint
    // when empty, so a lane (notably In Progress) stays visible, droppable, and discoverable.
    function renderTodoLane(status, label, items, emptyHint) {
        var inner = items.length
            ? TODO_GROUPS.map(function (group) {
                var grouped = items.filter(function (item) { return item.type === group.type; });
                if (!grouped.length) return '';
                return html`<div class="sub-group-label">${group.label}</div>` + grouped.map(renderTodoItem).join('');
            }).join('')
            : html`<div class="todo-lane-empty">${emptyHint}</div>`;
        return html`<div class="todo-lane" data-lane-status="${status}">`
            + html`<div class="todo-lane-label">${label}</div>`
            + inner
            + html`</div>`;
    }

    // Render the TODO view into #todo-body as two stacked lanes. In Progress is shown first — what
    // is actively being worked is the more important lane to see. The whole-list empty state stays
    // for a fresh list; once anything is on it both lanes always show, so a card can move (button
    // or drag) into In Progress and back.
    function renderTodo(items) {
        var body = document.getElementById('todo-body');
        if (!body) return;
        if (!items || !items.length) {
            body.innerHTML = renderList([], null, 'Nothing on the list yet — add items from the Dashboard');
            return;
        }
        var inProgress = items.filter(function (item) { return item.status === 'in-progress'; });
        var todo = items.filter(function (item) { return item.status !== 'in-progress'; });
        body.innerHTML =
            renderTodoLane('in-progress', 'In Progress', inProgress, 'Nothing in progress yet — start or drag a To Do item here.')
            + renderTodoLane('todo', 'To Do', todo, 'Nothing queued.');
    }

    window.DashboardRenderers = {
        html: html,
        raw: raw,
        escapeHtml: escapeHtml,
        getItem: getItem,
        renderItemBase: renderItemBase,
        renderEmailItem: renderEmailItem,
        renderPRItem: renderPRItem,
        renderReviewPRItem: renderReviewPRItem,
        renderIssueItem: renderIssueItem,
        renderTodoItem: renderTodoItem,
        renderList: renderList,
        renderSection: renderSection,
        renderPRs: renderPRs,
        renderTodo: renderTodo
    };
})();
