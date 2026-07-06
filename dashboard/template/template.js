// Bootstrap for the live dashboard (template/template.html): stitch the briefing's data globals into
// window.BRIEFING_DATA, render via the shared renderers, wire shared behavior, then poll for a
// newer briefing and re-render in place. Loaded last, after renderers.js, behavior.js, and the
// data/*.js files it depends on.

(function () {
    window.BRIEFING_DATA = {
        generatedAt: (window.BRIEFING_META && window.BRIEFING_META.generatedAt) || '',
        emails: window.BRIEFING_EMAILS || [],
        prs: window.BRIEFING_PRS || { mine: [], review: [] },
        issues: window.BRIEFING_ISSUES || []
    };
    var data = window.BRIEFING_DATA;
    var lastGeneratedAt = data.generatedAt;
    var lastUpdateMs = Date.now();
    var CHECK_INTERVAL_MS = 60000; // how often we poll data/meta.js for a new generatedAt
    var STATUS_INTERVAL_MS = 15000; // how often we poll data/status.js for a running briefing (#17)

    function renderAll() {
        document.getElementById('timestamp').textContent =
            data.generatedAt ? 'Last refreshed: ' + data.generatedAt : '';
        DashboardRenderers.renderSection('emails', data.emails, DashboardRenderers.renderEmailItem);
        DashboardRenderers.renderPRs(data.prs);
        DashboardRenderers.renderIssues(data.issues);
        DashboardBehavior.applyDismissed();
    }

    DashboardBehavior.init();
    renderAll();

    // --- Auto-reload (file:// blocks fetch, so re-inject scripts with a cache-buster) ---
    function pollIntervalMs() {
        var mins = (window.BRIEFING_META && window.BRIEFING_META.intervalMinutes) || 30;
        return mins * 60000;
    }

    function setRefreshStatus() {
        var el = document.getElementById('refresh-status');
        if ((Date.now() - lastUpdateMs) > 2 * pollIntervalMs()) {
            el.textContent = 'Waiting for update…';
            el.classList.add('stale');
        } else {
            el.textContent = '';
            el.classList.remove('stale');
        }
    }

    function injectScript(src, cb) {
        // cb must fire exactly once, no matter how the load resolves: a missing file over file://
        // can fire NEITHER onload nor onerror (this stranded the #17 status poll, leaving the
        // "Refreshing…" pill stuck on), so a timeout guarantees a verdict either way.
        var done = false;
        function finish(ok) { if (done) return; done = true; cb(ok); }
        // Try a cache-busted URL first (works over http and on most file:// setups). Some
        // browsers reject the query on file:// (treat it as a missing filename) — fall back
        // to the bare path, which re-reads from disk since file:// isn't HTTP-cached.
        var s = document.createElement('script');
        s.src = src + '?v=' + Date.now();
        s.onload = function() { s.remove(); finish(true); };
        s.onerror = function() {
            s.remove();
            var bare = document.createElement('script');
            bare.src = src;
            bare.onload = function() { bare.remove(); finish(true); };
            bare.onerror = function() { bare.remove(); finish(false); };
            document.head.appendChild(bare);
        };
        document.head.appendChild(s);
        setTimeout(function() { finish(false); }, 5000);   // local reads finish in ms; 5s = "it's not coming"
    }

    function reloadData() {
        // Preserve per-section scroll and page position across the re-render.
        var scrolls = {};
        document.querySelectorAll('.section-body').forEach(function(b) { scrolls[b.id] = b.scrollTop; });
        var pageY = window.scrollY;

        // data/meta.js is written last by the briefing, so the data files are already fresh.
        var files = ['../data/emails.js', '../data/prs.js', '../data/issues.js'];
        var pending = files.length;
        files.forEach(function(f) {
            injectScript(f, function() {
                if (--pending > 0) return;
                data.emails = window.BRIEFING_EMAILS || [];
                data.prs = window.BRIEFING_PRS || { mine: [], review: [] };
                data.issues = window.BRIEFING_ISSUES || [];
                data.generatedAt = (window.BRIEFING_META && window.BRIEFING_META.generatedAt) || data.generatedAt;
                lastGeneratedAt = data.generatedAt;   // advance only on success, so a failed reload retries next poll
                renderAll();
                Object.keys(scrolls).forEach(function(id) {
                    var b = document.getElementById(id);
                    if (b) b.scrollTop = scrolls[id];
                });
                window.scrollTo(0, pageY);
                lastUpdateMs = Date.now();
                setRefreshStatus();
            });
        });
    }

    function checkForUpdate() {
        injectScript('../data/meta.js', function(ok) {
            if (ok) {
                var gen = window.BRIEFING_META && window.BRIEFING_META.generatedAt;
                if (gen && gen !== lastGeneratedAt) {
                    reloadData();   // lastGeneratedAt advances inside reloadData's completion
                    return;
                }
            }
            setRefreshStatus();
        });
    }

    setInterval(checkForUpdate, CHECK_INTERVAL_MS);
    setRefreshStatus();

    // --- Manual refresh (#17) ---
    // status.js is the single source of truth for whether a briefing (scheduled OR manual) is in
    // flight: when running, show the header pill and disable the Refresh button. start-session.ps1
    // writes running:true at launch and running:false in a finally block, so a crashed run still
    // clears here on the next poll.
    function applyStatus(running) {
        if (running) { stopBurst(); pendingUntil = 0; }   // the run confirmed; the steady poll tracks its end
        var pending = !running && Date.now() < pendingUntil;
        var btn = document.getElementById('refresh-btn');
        var pill = document.getElementById('refresh-pill');
        if (btn) btn.disabled = running || pending;
        if (pill) {
            pill.classList.toggle('running', running || pending);
            var label = pill.querySelector('.refresh-label');
            if (label) label.textContent = running ? 'Refreshing…' : (pending ? 'Starting…' : 'Up to date');
        }
    }

    // A click gets instant feedback via a distinct pending state: the button disables and the pill
    // shows "Starting…" immediately, but it only claims "Refreshing…" once the run's running:true
    // actually lands. The burst polls fast so that upgrade happens within a couple of seconds; if
    // no run materializes by the deadline (e.g. gmc-refresh:// not registered), the final
    // checkStatus finds pending expired and the pill honestly falls back to "Up to date".
    var PENDING_MS = 30000;
    var pendingUntil = 0;
    var burstTimer = null;
    function stopBurst() {
        if (burstTimer) { clearInterval(burstTimer); burstTimer = null; }
    }
    function startBurst() {
        stopBurst();
        pendingUntil = Date.now() + PENDING_MS;
        burstTimer = setInterval(function () {
            if (Date.now() > pendingUntil) { stopBurst(); }   // expired: fall through to one last check
            checkStatus();
        }, 2000);
        applyStatus(false);   // render the pending state now, before the first burst tick
    }

    function checkStatus() {
        injectScript('../data/status.js', function (ok) {
            // A missing/failed status.js (e.g. before the first run ever, since it's git-ignored)
            // means nothing is running — never leave the button stuck disabled.
            applyStatus(!!(ok && window.BRIEFING_STATUS && window.BRIEFING_STATUS.running === true));
        });
    }

    function triggerRefresh() {
        // "Refreshing…" is still driven solely by status.js — a failed protocol launch must never
        // show it. The instant reaction is the separate "Starting…" pending state startBurst
        // renders, which self-reverts if no run confirms (see the comment above startBurst).
        window.location.href = 'gmc-refresh://run';
        DashboardBehavior.showToast('Refresh started…');
        startBurst();
    }

    var refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', triggerRefresh);
    setInterval(checkStatus, STATUS_INTERVAL_MS);
    checkStatus();

    // Chrome throttles or freezes timers in hidden/occluded tabs, so a dashboard parked on a
    // spare screen can miss whole poll cycles. Re-check the moment the tab is seen again instead
    // of waiting out the intervals.
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) { checkStatus(); checkForUpdate(); }
    });
    window.addEventListener('focus', checkStatus);
})();
