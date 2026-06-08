// Shared item renderers for the Daily Dashboard.
//
// One generic base (renderItemBase) holds the common item markup; three thin per-type
// wrappers (email / PR / issue) call it. Today they render identically — they exist as the
// seam where one type can diverge later without touching the others. renderList is the
// loop + empty-state helper. Both template.html (live dashboard) and preview.html share this
// single source, and the upcoming TODO view (#40-#44) calls the same renderers so an item
// change lands everywhere at once.

(function () {
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // Generic item card. opts default to the dashboard's current data-driven behavior, so
    // wrappers that pass no opts produce byte-identical output to the old inline renderItem.
    // title/meta are emitted unescaped to preserve existing behavior (see issue-39-plan.md).
    function renderItemBase(item, opts) {
        opts = opts || {};
        var showPreview = opts.showPreview !== undefined ? opts.showPreview : !!item.preview;
        var showLabels = opts.showLabels !== undefined
            ? opts.showLabels
            : !!(item.labels && item.labels.length);
        var action = opts.action !== undefined
            ? opts.action
            : '<button class="dismiss-btn" onclick="dismissItem(\'' + item.id + '\', event)">&times;</button>';

        var previewHtml = showPreview
            ? '<div class="item-preview">' + escapeHtml(item.preview) + '</div>'
            : '';
        var labelsHtml = showLabels
            ? ' · ' + item.labels.map(function (l) { return '<span class="label-tag">' + l + '</span>'; }).join(' ')
            : '';

        return '<a class="item" href="' + item.url + '" target="_blank" data-item-id="' + item.id + '">'
            + '<div class="item-row">'
            + '<span class="item-primary">' + item.title + '</span>'
            + action
            + '</div>'
            + previewHtml
            + '<div class="item-meta">' + item.meta + labelsHtml + '</div>'
            + '</a>';
    }

    // Thin per-type wrappers — the divergence seam (e.g. #25's one-click PR review → renderPRItem).
    function renderEmailItem(item) { return renderItemBase(item); }
    function renderPRItem(item) { return renderItemBase(item); }
    function renderIssueItem(item) { return renderItemBase(item); }

    // Maps items through renderFn, or an empty-state when there are none. Returns a string.
    function renderList(items, renderFn, emptyText) {
        if (!items || !items.length) {
            return '<div class="empty-state">' + (emptyText || 'No items') + '</div>';
        }
        return items.map(renderFn).join('');
    }

    window.DashboardRenderers = {
        escapeHtml: escapeHtml,
        renderItemBase: renderItemBase,
        renderEmailItem: renderEmailItem,
        renderPRItem: renderPRItem,
        renderIssueItem: renderIssueItem,
        renderList: renderList
    };
})();
