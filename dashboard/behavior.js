// Shared dashboard runtime behavior for template/template.html and preview/preview.html: the
// time-of-day greeting, per-day dismiss state, badge counts, and keyboard section navigation.
// Dismiss uses one delegated click listener, so item cards carry no inline handler and an id
// never enters JS.
//
// Usage: call DashboardBehavior.init() once after the first render to wire the listeners and
// load today's dismissals; call applyDismissed() after every (re)render to restore dismissed
// state and refresh the badges.

(function () {
    var SECTION_IDS = ['emails', 'prs', 'issues'];
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

    function onClick(e) {
        var btn = e.target.closest && e.target.closest('.dismiss-btn');
        if (!btn) return;
        e.preventDefault();   // the button lives inside the item's <a>; don't follow the link
        e.stopPropagation();
        var item = btn.closest('[data-item-id]');
        if (!item) return;
        var id = item.getAttribute('data-item-id');
        if (dismissed.indexOf(id) === -1) {
            dismissed.push(id);
            try { localStorage.setItem(storageKey, JSON.stringify(dismissed)); } catch (e) { /* still dismiss in-page */ }
        }
        item.classList.add('dismissed');
        updateBadges();
    }

    function onKeydown(e) {
        var headers = document.querySelectorAll('.section-header');
        if (!headers.length) return;
        var cur = Array.prototype.indexOf.call(headers, document.activeElement);
        if (cur < 0) cur = 0;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            headers[(cur + 1) % headers.length].focus();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            headers[(cur - 1 + headers.length) % headers.length].focus();
        }
    }

    function setGreeting() {
        var hour = new Date().getHours();
        var mornings = ["Good Morning, Sam", "Rise and Shine, Sam", "Let's Get It, Sam", "Top of the Morning, Sam", "Ready to Roll, Sam", "New Day, New Wins, Sam", "Coffee's Ready, Sam"];
        var afternoons = ["Good Afternoon, Sam", "Still at It, Sam", "Afternoon Check-in, Sam", "How's the Day Going, Sam"];
        var evenings = ["Good Evening, Sam", "Burning the Midnight Oil, Sam", "Late Night Grind, Sam", "Wrapping Up, Sam"];
        var greetings = hour < 12 ? mornings : hour < 17 ? afternoons : evenings;
        var pick = greetings[Math.floor(Math.random() * greetings.length)];
        var el = document.getElementById('greeting');
        if (el) el.textContent = pick;
        document.title = pick;
    }

    function init(opts) {
        setGreeting();
        // Scope the per-day key per page (default 'live'); preview passes its own scope so its
        // dismissals never land in the live dashboard's set.
        var keyBase = 'gmc-dismissed-' + ((opts && opts.scope) || 'live') + '-';
        storageKey = keyBase + new Date().toISOString().slice(0, 10);
        // Load today's dismissals for this scope; drop this scope's leftovers from previous days
        // and any legacy un-scoped keys ('gmc-dismissed-<date>') from before scoping existed.
        try {
            Object.keys(localStorage).forEach(function (key) {
                var legacy = /^gmc-dismissed-\d{4}-\d{2}-\d{2}$/.test(key);   // pre-scoping format only — never another scope's keys
                if (legacy || (key.indexOf(keyBase) === 0 && key !== storageKey)) localStorage.removeItem(key);
            });
            dismissed = JSON.parse(localStorage.getItem(storageKey) || '[]');
        } catch (e) {
            dismissed = [];   // corrupt entry or blocked storage must not take down the page
        }
        if (!Array.isArray(dismissed)) dismissed = [];
        document.addEventListener('click', onClick);
        document.addEventListener('keydown', onKeydown);
    }

    window.DashboardBehavior = { init: init, applyDismissed: applyDismissed, updateBadges: updateBadges };
})();
