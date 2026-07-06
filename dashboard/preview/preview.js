// Bootstrap for the static design preview (preview/preview.html): render the bundled sample data
// (test-data.js) through the shared renderers and wire shared behavior. No polling — the preview
// is intentionally static. Loaded last, after renderers.js, behavior.js, and test-data.js.

(function () {
    var data = window.BRIEFING_DATA || { generatedAt: '', emails: [], prs: { mine: [], review: [] }, issues: [] };

    document.getElementById('timestamp').textContent = data.generatedAt;

    DashboardRenderers.renderSection('emails', data.emails, DashboardRenderers.renderEmailItem);
    DashboardRenderers.renderPRs(data.prs);
    DashboardRenderers.renderIssues(data.issues);

    DashboardBehavior.init({ scope: 'preview' });
    DashboardBehavior.applyDismissed();
})();
