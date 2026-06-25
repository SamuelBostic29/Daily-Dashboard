// Persistent store for the TODO list: items curated from the dashboard plus custom entries
// from the modal. Backed by localStorage under one key per page scope ('live' / 'preview'),
// mirroring the dismiss pattern so the preview can never mutate the real list.
//
// Retention: deliberately NOT date-keyed, unlike dismiss state. A dismiss says "done looking
// at this today"; a TODO says "I still owe this work" — so entries survive reloads and days
// until explicitly removed from the TODO view. There is no automatic expiry.
//
// Entries keep the shared { id, title, meta, url, source, preview, labels } item shape plus a `type`
// ('email' | 'pr' | 'issue' | 'custom') that drives the TODO view's sub-headers (#42), and a
// `status` ('todo' | 'in-progress') placing the entry in one of the view's two lanes (#65).

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
            // Defaulted the same defensive way as labels: only the exact 'in-progress' is kept, so
            // pre-status stored entries and hand-edited junk fall back to 'todo' — no migration.
            status: item.status === 'in-progress' ? 'in-progress' : 'todo',
            title: item.title,
            meta: item.meta,
            url: item.url,
            source: item.source || '',
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

    function remove(id) {
        var before = items.length;
        items = items.filter(function (t) { return t.id !== id; });
        if (items.length !== before) persist();
    }

    // Move an entry between lanes; unknown values normalize to 'todo' (matching toEntry). all()
    // still returns every entry — rendering filters by status — so this only flips a field.
    function setStatus(id, status) {
        var next = status === 'in-progress' ? 'in-progress' : 'todo';
        var changed = false;
        items.forEach(function (t) {
            if (t.id === id && t.status !== next) { t.status = next; changed = true; }
        });
        if (changed) persist();
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

    window.TodoStore = { init: init, add: add, remove: remove, setStatus: setStatus, all: all };
})();
