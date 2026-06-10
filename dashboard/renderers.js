// Shared rendering for the Daily Dashboard — used by template/template.html,
// preview/preview.html, and the upcoming TODO view (#40-#44), so an item change lands on
// every surface at once.
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

    // Generic item card. The three per-type wrappers below are the seam where one type can
    // diverge later (e.g. #25's one-click PR review → renderPRItem) without touching the others.
    function renderItemBase(item, opts) {
        opts = opts || {};
        renderedItems[item.id] = item;
        var showPreview = opts.showPreview !== undefined ? opts.showPreview : !!item.preview;
        var showLabels = opts.showLabels !== undefined ? opts.showLabels : !!(item.labels && item.labels.length);

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
            + html`<div class="item-row"><span class="item-primary">${item.title}</span>${raw(action)}</div>`
            + preview
            + html`<div class="item-meta">${item.meta}${raw(labels)}</div>`
            + html`</a>`;
    }

    function renderEmailItem(item) { return renderItemBase(item); }
    function renderPRItem(item) { return renderItemBase(item); }
    function renderIssueItem(item) { return renderItemBase(item); }

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
            + renderList(review, renderPRItem, 'None');
    }

    window.DashboardRenderers = {
        html: html,
        raw: raw,
        escapeHtml: escapeHtml,
        getItem: getItem,
        renderItemBase: renderItemBase,
        renderEmailItem: renderEmailItem,
        renderPRItem: renderPRItem,
        renderIssueItem: renderIssueItem,
        renderList: renderList,
        renderSection: renderSection,
        renderPRs: renderPRs
    };
})();
