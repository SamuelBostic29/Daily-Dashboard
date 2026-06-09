// Bootstrap for the live dashboard (template/template.html): stitch the briefing's data globals into
// window.BRIEFING_DATA, render via the shared renderers, wire shared behavior, then poll for a
// newer briefing and re-render in place. Loaded last, after renderers.js, behavior.js, and the
// data/*.js files it depends on.

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

function renderAll() {
    document.getElementById('timestamp').textContent =
        data.generatedAt ? 'Last refreshed: ' + data.generatedAt : '';
    DashboardRenderers.renderSection('emails', data.emails, DashboardRenderers.renderEmailItem);
    DashboardRenderers.renderPRs(data.prs);
    DashboardRenderers.renderSection('issues', data.issues, DashboardRenderers.renderIssueItem);
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
    // Try a cache-busted URL first (works over http and on most file:// setups). Some
    // browsers reject the query on file:// (treat it as a missing filename) — fall back
    // to the bare path, which re-reads from disk since file:// isn't HTTP-cached.
    var s = document.createElement('script');
    s.src = src + '?v=' + Date.now();
    s.onload = function() { s.remove(); cb(true); };
    s.onerror = function() {
        s.remove();
        var bare = document.createElement('script');
        bare.src = src;
        bare.onload = function() { bare.remove(); cb(true); };
        bare.onerror = function() { bare.remove(); cb(false); };
        document.head.appendChild(bare);
    };
    document.head.appendChild(s);
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
