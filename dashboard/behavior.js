// Shared dashboard runtime behavior for template/template.html and preview/preview.html: the
// time-of-day greeting, per-day dismiss state, badge counts, section collapse, keyboard
// section navigation, the Dashboard/TODO view tabs, the Add-to-TODO selection mode, and a
// toast. Dismiss and selection use one delegated click listener, so item cards carry no
// inline handler and an id never enters JS.
//
// Usage: call DashboardBehavior.init() once after the first render to wire the listeners and
// load today's dismissals; call applyDismissed() after every (re)render to restore dismissed
// state and refresh the badges.

(function () {
    var SECTION_IDS = ['emails', 'prs', 'issues'];
    var USER_NAME = 'Sam';   // greeting name — change this to make the dashboard yours
    var storageKey;   // set by init(); scoped per page so preview can't mutate the live set
    var dismissed = [];

    function itemSelector(id) {
        var v = (window.CSS && CSS.escape) ? CSS.escape(id) : String(id).replace(/["\\]/g, '\\$&');
        return '[data-item-id="' + v + '"]';
    }

    function updateBadges() {
        SECTION_IDS.forEach(function (id) {
            var body = document.getElementById(id + '-body');
            var badge = document.getElementById(id + '-badge');
            if (!body || !badge) return;
            var visible = body.querySelectorAll('.item:not(.dismissed)').length;
            badge.textContent = visible;
            badge.classList.toggle('zero', visible === 0);
        });
    }

    function applyDismissed() {
        dismissed.forEach(function (id) {
            var el = document.querySelector(itemSelector(id));
            if (el) el.classList.add('dismissed');
        });
        updateBadges();
    }

    function toggleSection(header) {
        var section = header.closest('.section');
        if (!section) return;
        var collapsed = section.classList.toggle('collapsed');
        header.setAttribute('aria-expanded', String(!collapsed));
    }

    function onClick(e) {
        // In selection mode a click anywhere on a dashboard item toggles it instead of
        // navigating; dismiss is hidden via CSS while selecting, so no conflict with it.
        if (selecting()) {
            var card = e.target.closest && e.target.closest('#view-dashboard .item');
            if (card) {
                e.preventDefault();
                card.classList.toggle('selected');
                return;
            }
        }
        var btn = e.target.closest && e.target.closest('.dismiss-btn');
        if (btn) {
            e.preventDefault();   // the button lives inside the item's <a>; don't follow the link
            e.stopPropagation();
            var item = btn.closest('[data-item-id]');
            if (!item) return;
            var id = item.getAttribute('data-item-id');
            if (dismissed.indexOf(id) === -1) {
                dismissed.push(id);
                try { localStorage.setItem(storageKey, JSON.stringify(dismissed)); } catch (err) { /* still dismiss in-page */ }
            }
            item.classList.add('dismissed');
            updateBadges();
            return;
        }
        var header = e.target.closest && e.target.closest('.section-header');
        if (header) toggleSection(header);
    }

    function onKeydown(e) {
        if (e.key === 'Escape' && selecting()) {
            finishSelection(false);
            return;
        }
        // Only headers in the visible view participate — offsetParent is null inside a hidden panel.
        var headers = Array.prototype.filter.call(document.querySelectorAll('.section-header'), function (h) {
            return h.offsetParent !== null;
        });
        if (!headers.length) return;
        var cur = headers.indexOf(document.activeElement);
        if ((e.key === 'Enter' || e.key === ' ') && cur >= 0 && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            toggleSection(headers[cur]);
            return;
        }
        if (cur < 0) cur = 0;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            headers[(cur + 1) % headers.length].focus();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            headers[(cur - 1 + headers.length) % headers.length].focus();
        }
    }

    // ARIA tablist for the Dashboard/TODO views: activating a tab shows its panel (via
    // aria-controls) and hides the rest. Selection is per-load — the Dashboard is always
    // the default view, so nothing persists.
    function activateTab(tab) {
        var tablist = tab.closest('.view-tabs');
        tablist.querySelectorAll('.view-tab').forEach(function (t) {
            var active = t === tab;
            t.classList.toggle('active', active);
            t.setAttribute('aria-selected', String(active));
            t.tabIndex = active ? 0 : -1;
            var panel = document.getElementById(t.getAttribute('aria-controls'));
            if (panel) panel.hidden = !active;
        });
    }

    function initTabs() {
        var tablist = document.querySelector('.view-tabs');
        if (!tablist) return;   // a surface without tabs keeps working unchanged
        tablist.addEventListener('click', function (e) {
            var tab = e.target.closest('.view-tab');
            if (tab) activateTab(tab);
        });
        tablist.addEventListener('keydown', function (e) {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            e.stopPropagation();   // arrows inside the tablist must not also drive section nav
            var tabs = Array.prototype.slice.call(tablist.querySelectorAll('.view-tab'));
            var cur = tabs.indexOf(e.target.closest('.view-tab'));
            if (cur < 0) return;
            var next = tabs[(cur + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
            activateTab(next);
            next.focus();
        });
    }

    // Add-to-TODO selection mode (#41): "Add to TODO" swaps to Done/Cancel and dashboard items
    // become multi-selectable (handled in onClick). Done pushes the selection into TodoStore
    // and confirms with a toast; Cancel (or Escape) discards it. Either way the dashboard
    // returns to normal.
    function selecting() {
        var view = document.getElementById('view-dashboard');
        return !!view && view.classList.contains('selecting');
    }

    function setSelecting(on) {
        var view = document.getElementById('view-dashboard');
        view.classList.toggle('selecting', on);
        document.getElementById('add-to-todo-btn').hidden = on;
        document.getElementById('selection-done-btn').hidden = !on;
        document.getElementById('selection-cancel-btn').hidden = !on;
        if (!on) {
            view.querySelectorAll('.item.selected').forEach(function (el) {
                el.classList.remove('selected');
            });
        }
    }

    function finishSelection(addToList) {
        if (addToList) {
            var items = [];
            document.querySelectorAll('#view-dashboard .item.selected').forEach(function (el) {
                var item = DashboardRenderers.getItem(el.getAttribute('data-item-id'));
                if (item) items.push(item);
            });
            // The store skips ids already on the list, so the toast reports what truly landed.
            if (items.length) showToast('Added (' + TodoStore.add(items) + ') items to your todo list.');
        }
        setSelecting(false);
    }

    function initSelection() {
        var addBtn = document.getElementById('add-to-todo-btn');
        if (!addBtn) return;   // a surface without the action bar keeps working unchanged
        addBtn.addEventListener('click', function () { setSelecting(true); });
        document.getElementById('selection-done-btn').addEventListener('click', function () { finishSelection(true); });
        document.getElementById('selection-cancel-btn').addEventListener('click', function () { finishSelection(false); });
    }

    // Transient confirmation toast: one reused element, shown for a few seconds per message.
    var toastTimer;
    function showToast(message) {
        var toast = document.getElementById('toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast';
            toast.className = 'toast';
            toast.setAttribute('role', 'status');
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 3000);
    }

    function setGreeting() {
        var hour = new Date().getHours();
        var mornings = ["Good Morning", "Rise and Shine", "Let's Get It", "Top of the Morning", "Ready to Roll", "New Day, New Wins", "Coffee's Ready"];
        var afternoons = ["Good Afternoon", "Still at It", "Afternoon Check-in", "How's the Day Going"];
        var evenings = ["Good Evening", "Burning the Midnight Oil", "Late Night Grind", "Wrapping Up"];
        var greetings = hour < 12 ? mornings : hour < 17 ? afternoons : evenings;
        var pick = greetings[Math.floor(Math.random() * greetings.length)] + ", " + USER_NAME;
        var el = document.getElementById('greeting');
        if (el) el.textContent = pick;
        document.title = pick;
    }

    function init(opts) {
        setGreeting();
        initTabs();
        initSelection();
        // Scope the per-day key per page (default 'live'); preview passes its own scope so its
        // dismissals never land in the live dashboard's set. The TODO store shares the same
        // scope, so its list is isolated per page the same way.
        var scope = (opts && opts.scope) || 'live';
        TodoStore.init({ scope: scope });
        var today = new Date().toISOString().slice(0, 10);
        var keyBase = 'dashboard-dismissed-' + scope + '-';
        storageKey = keyBase + today;
        // Load today's dismissals for this scope; drop this scope's leftovers from previous days
        // and everything under the legacy 'gmc-dismissed-' prefix from before the rename —
        // migrating today's legacy entries first so a mid-day upgrade doesn't resurrect them.
        try {
            var legacyToday = JSON.parse(localStorage.getItem('gmc-dismissed-' + scope + '-' + today) || '[]');
            Object.keys(localStorage).forEach(function (key) {
                var legacy = key.indexOf('gmc-dismissed-') === 0;
                if (legacy || (key.indexOf(keyBase) === 0 && key !== storageKey)) localStorage.removeItem(key);
            });
            var stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
            dismissed = Array.isArray(stored) ? stored : [];
            if (Array.isArray(legacyToday) && legacyToday.length) {
                legacyToday.forEach(function (id) { if (dismissed.indexOf(id) === -1) dismissed.push(id); });
                localStorage.setItem(storageKey, JSON.stringify(dismissed));
            }
        } catch (e) {
            dismissed = [];   // corrupt entry or blocked storage must not take down the page
        }
        if (!Array.isArray(dismissed)) dismissed = [];
        document.addEventListener('click', onClick);
        document.addEventListener('keydown', onKeydown);
    }

    window.DashboardBehavior = { init: init, applyDismissed: applyDismissed, updateBadges: updateBadges, showToast: showToast };
})();
