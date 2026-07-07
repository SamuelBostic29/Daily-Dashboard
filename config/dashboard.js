// Browser-side config, loaded as the first script tag by template.html and preview.html —
// a file:// page can't fetch() JSON, so this is a script-tag global like the data/*.js files.
// The script-side twin is config/dashboard.json; jiraBaseUrl is deliberately present in both —
// keep the two values in sync.
window.DASHBOARD_CONFIG = {
    // Greeting name shown in the header (and the tab title).
    userName: 'Sam',
    // Base URL of your Jira instance; drives the Issues pane's Jira-chip link inference.
    jiraBaseUrl: 'https://portal.myparadigm.com',
};
