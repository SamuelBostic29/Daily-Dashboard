// Characterization tests for dashboard/renderers.js — the module carrying the dashboard's
// security guarantees (html`` escaping, safeUrl) and the Issues-pane nesting rules (#72).
// Fixtures only; live data (dashboard/data/*.js) never enters tests.

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSandbox, loadModule } = require('./helpers/load-module');

function freshRenderers(config) {
    const sandbox = loadModule(
        'dashboard/renderers.js',
        createSandbox(config ? { DASHBOARD_CONFIG: config } : {}),
    );
    return { sandbox, R: sandbox.DashboardRenderers };
}

function chipReader(R) {
    return (item) => {
        const markup = R.renderIssueItem(item);
        const m = markup.match(/source-tag (source-\w+)">([^<]*)</);
        return m ? { mod: m[1], text: m[2] } : null;
    };
}

test('escapeHtml escapes all five specials and maps null/undefined to empty', () => {
    const { R } = freshRenderers();
    assert.equal(R.escapeHtml('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
    assert.equal(R.escapeHtml(null), '');
    assert.equal(R.escapeHtml(undefined), '');
});

test('html`` escapes every interpolated value', () => {
    const { R } = freshRenderers();
    const hostile = '<img src=x onerror=alert(1)>';
    assert.equal(R.html`<div>${hostile}</div>`, '<div>&lt;img src=x onerror=alert(1)&gt;</div>');
});

test('raw() is the only escaping bypass — wrapped markup splices through untouched', () => {
    const { R } = freshRenderers();
    assert.equal(R.html`<div>${R.raw('<b>trusted</b>')}</div>`, '<div><b>trusted</b></div>');
    // The same string unwrapped is escaped — raw() must be explicit, never inferred.
    assert.equal(R.html`<div>${'<b>trusted</b>'}</div>`, '<div>&lt;b&gt;trusted&lt;/b&gt;</div>');
});

test('safeUrl neutralizes non-http(s) hrefs in rendered items', () => {
    const { R } = freshRenderers();
    const cardWith = (url) => R.renderItemBase({ id: 'x-1', title: 't', meta: 'm', url });
    assert.match(cardWith('javascript:alert(1)'), /href="#"/);
    assert.match(cardWith('data:text/html,<script>'), /href="#"/);
    assert.match(cardWith(''), /href="#"/);
    assert.match(cardWith('https://github.com/a/b/pull/1'), /href="https:\/\/github\.com\/a\/b\/pull\/1"/);
    assert.match(cardWith('http://example.com/'), /href="http:\/\/example\.com\/"/);
});

test('hostile item fields cannot break out of the card markup', () => {
    const { R } = freshRenderers();
    const card = R.renderItemBase({
        id: 'x-2',
        title: '"><script>alert(1)</script>',
        meta: '<b>meta</b>',
        url: 'https://example.com/',
        labels: ['<i>label</i>'],
    });
    assert.ok(!card.includes('<script>'));
    assert.ok(!card.includes('<b>meta</b>'));
    assert.ok(!card.includes('<i>label</i>'));
    assert.match(card, /&quot;&gt;&lt;script&gt;/);
});

test('sourceFromUrl infers tracker chips from the link alone', () => {
    const { R } = freshRenderers({ jiraBaseUrl: 'https://jira.example.com' });
    const chipFor = chipReader(R);
    assert.deepEqual(chipFor({ id: 'i-1', title: 't', meta: 'm', url: 'https://github.com/o/r/issues/12' }), {
        mod: 'source-github',
        text: 'GitHub',
    });
    assert.deepEqual(
        chipFor({ id: 'i-2', title: 't', meta: 'm', url: 'https://jira.example.com/browse/ABC-123' }),
        { mod: 'source-jira', text: 'Jira' },
    );
    // PR links deliberately don't match — a PR is not an issue.
    assert.equal(chipFor({ id: 'i-3', title: 't', meta: 'm', url: 'https://github.com/o/r/pull/12' }), null);
    // An explicit source (set by the briefing fetchers) wins over URL inference.
    assert.deepEqual(
        chipFor({ id: 'i-4', title: 't', meta: 'm', url: 'https://github.com/o/r/issues/9', source: 'Jira' }),
        { mod: 'source-jira', text: 'Jira' },
    );
});

test('the Jira browse pattern comes from DASHBOARD_CONFIG.jiraBaseUrl, not a hardcoded host (#76)', () => {
    const { R } = freshRenderers({ jiraBaseUrl: 'https://jira.example.com' });
    const chipFor = chipReader(R);
    // The configured host gets the chip; an unconfigured host — including the author's own
    // Jira — gets none. Forks point the inference at their Jira by editing config, not source.
    assert.deepEqual(
        chipFor({ id: 'j-1', title: 't', meta: 'm', url: 'https://jira.example.com/browse/ABC-1' }),
        { mod: 'source-jira', text: 'Jira' },
    );
    assert.equal(
        chipFor({ id: 'j-2', title: 't', meta: 'm', url: 'https://portal.myparadigm.com/browse/ABC-1' }),
        null,
    );
});

test('without a configured jiraBaseUrl, Jira URL inference stays off (GitHub inference unaffected)', () => {
    const { R } = freshRenderers();
    const chipFor = chipReader(R);
    assert.equal(
        chipFor({ id: 'n-1', title: 't', meta: 'm', url: 'https://jira.example.com/browse/ABC-1' }),
        null,
    );
    assert.deepEqual(chipFor({ id: 'n-2', title: 't', meta: 'm', url: 'https://github.com/o/r/issues/3' }), {
        mod: 'source-github',
        text: 'GitHub',
    });
});

test('renderIssues nests subtasks under their parent, in order', () => {
    const { sandbox, R } = freshRenderers();
    const items = [
        { id: 'issue-ABC-1', title: 'parent story', meta: 'm', url: '#' },
        { id: 'issue-DEF-9', title: 'unrelated', meta: 'm', url: '#' },
        { id: 'issue-ABC-2', title: 'child task', meta: 'm', url: '#', parentKey: 'ABC-1' },
        { id: 'issue-ABC-3', title: 'second child', meta: 'm', url: '#', parentKey: 'ABC-1' },
    ];
    R.renderIssues(items);
    const out = sandbox.document.getElementById('issues-body').innerHTML;
    // Read the rendered cards back in order as (nested?, title) pairs: children are pulled up
    // under their parent and carry the nested modifier; everything else keeps its original order.
    const cards = out
        .split('<a class="')
        .slice(1)
        .map((card) => ({
            nested: card.startsWith('item item-child"'),
            title: card.match(/item-primary">([^<]*)</)[1],
        }));
    assert.deepEqual(cards, [
        { nested: false, title: 'parent story' },
        { nested: true, title: 'child task' },
        { nested: true, title: 'second child' },
        { nested: false, title: 'unrelated' },
    ]);
});

test('a subtask whose parent is absent renders flat, in its original position', () => {
    const { sandbox, R } = freshRenderers();
    R.renderIssues([
        { id: 'issue-AAA-1', title: 'first', meta: 'm', url: '#' },
        { id: 'issue-BBB-2', title: 'orphan subtask', meta: 'm', url: '#', parentKey: 'GONE-1' },
        { id: 'issue-CCC-3', title: 'last', meta: 'm', url: '#' },
    ]);
    const out = sandbox.document.getElementById('issues-body').innerHTML;
    assert.ok(!out.includes('item-child'));
    assert.ok(out.indexOf('first') < out.indexOf('orphan subtask'));
    assert.ok(out.indexOf('orphan subtask') < out.indexOf('last'));
});

test('renderIssues with no items falls back to the empty state', () => {
    const { sandbox, R } = freshRenderers();
    R.renderIssues([]);
    const out = sandbox.document.getElementById('issues-body').innerHTML;
    assert.match(out, /empty-state/);
    assert.match(out, /No items/);
});

test('renderList renders the empty state with default and custom text', () => {
    const { R } = freshRenderers();
    assert.equal(R.renderList([], R.renderIssueItem), '<div class="empty-state">No items</div>');
    assert.equal(R.renderList([], R.renderIssueItem, 'None'), '<div class="empty-state">None</div>');
});

test('undefined items render the error state; empty items keep the empty state (#83)', () => {
    const { R } = freshRenderers();
    // undefined means "the data file didn't load/parse" — visibly different from "no items".
    assert.match(R.renderList(undefined, R.renderIssueItem), /error-state/);
    assert.match(R.renderList(undefined, R.renderIssueItem), /Data didn(&#39;|')t load/);
    assert.doesNotMatch(R.renderList([], R.renderIssueItem), /error-state/);
    assert.match(R.renderList([], R.renderIssueItem), /empty-state/);
});

test('renderSection, renderIssues and renderPRs surface missing data as the error state (#83)', () => {
    const { sandbox, R } = freshRenderers();
    R.renderSection('emails', undefined, R.renderEmailItem);
    assert.match(sandbox.document.getElementById('emails-body').innerHTML, /error-state/);
    R.renderIssues(undefined);
    assert.match(sandbox.document.getElementById('issues-body').innerHTML, /error-state/);
    R.renderPRs(undefined);
    assert.match(sandbox.document.getElementById('prs-body').innerHTML, /error-state/);
    // Genuinely-empty payloads still render the calm empty states.
    R.renderSection('emails', [], R.renderEmailItem);
    assert.match(sandbox.document.getElementById('emails-body').innerHTML, /empty-state/);
    R.renderIssues([]);
    assert.match(sandbox.document.getElementById('issues-body').innerHTML, /empty-state/);
    R.renderPRs({ mine: [], review: [] });
    assert.match(sandbox.document.getElementById('prs-body').innerHTML, /empty-state/);
});

test('renderList never leaks the map index into the nested param (regression, commit 7436958)', () => {
    const { R } = freshRenderers();
    const out = R.renderList(
        [
            { id: 'pr-1', title: 'one', meta: 'm', url: '#' },
            { id: 'pr-2', title: 'two', meta: 'm', url: '#' },
            { id: 'pr-3', title: 'three', meta: 'm', url: '#' },
        ],
        R.renderTodoItem,
    );
    // renderTodoItem(item, nested): a bare .map(renderFn) would pass the index as `nested`
    // and indent every row after the first.
    assert.ok(!out.includes('item-child'));
    assert.equal(out.match(/class="item"/g).length, 3);
});
