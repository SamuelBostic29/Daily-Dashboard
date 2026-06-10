// Persistent store for the TODO list (#38): items curated from the dashboard, later joined by
// custom entries (#43). Backed by localStorage under one key per page scope ('live' /
// 'preview'), mirroring the dismiss pattern so the preview can never mutate the real list.
// Unlike dismiss state the key carries no date — a TODO survives reloads and days until it is
// explicitly removed (retention finalized in #44).
//
// Entries keep the shared { id, title, meta, url, preview, labels } item shape plus a `type`
// ('email' | 'pr' | 'issue' | 'custom') that drives the TODO view's sub-headers (#42).

(function () {
    var ITEM_TYPES = ['email', 'pr', 'issue'];
    var storageKey;   // set by init()
    var items = [];

    function persist() {
        try { localStorage.setItem(storageKey, JSON.stringify(items)); } catch (e) { /* keep the in-memory list usable */ }
    }

    // Dashboard ids are prefixed per the briefing contract ('email-…' / 'pr-…' / 'issue-…');
    // anything else (e.g. #43's custom entries) falls back to an explicit type or 'custom'.
    function typeOf(item) {
        var prefix = String(item.id).split('-')[0];
        return ITEM_TYPES.indexOf(prefix) >= 0 ? prefix : (item.type || 'custom');
    }

    // One normalizer for everything that enters the in-memory list — items added from the
    // dashboard and entries re-read from storage alike — so the fields rendering depends on
    // (notably labels as an array) always hold the expected shape.
    function toEntry(item) {
        return {
            id: item.id,
            type: typeOf(item),
            title: item.title,
            meta: item.meta,
            url: item.url,
            preview: item.preview || '',
            labels: Array.isArray(item.labels) ? item.labels : []
        };
    }

    // Add items to the list, skipping ids already on it. Returns the number actually added.
    function add(newItems) {
        var added = 0;
        (newItems || []).forEach(function (item) {
            if (!item || !item.id || items.some(function (t) { return t.id === item.id; })) return;
            items.push(toEntry(item));
            added++;
        });
        if (added) persist();
        return added;
    }

    function all() { return items.slice(); }

    function init(opts) {
        storageKey = 'dashboard-todo-' + ((opts && opts.scope) || 'live');
        // Corrupt or blocked storage must not take down the page — and that holds per entry
        // too: a hand-edited store degrades to its valid entries, re-normalized via toEntry().
        try {
            var stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
            items = (Array.isArray(stored) ? stored : [])
                .filter(function (t) { return t && t.id; })
                .map(toEntry);
        } catch (e) {
            items = [];
        }
    }

    window.TodoStore = { init: init, add: add, all: all };
})();
