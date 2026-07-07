// Characterization tests for dashboard/todo-store.js — the localStorage-backed TODO list.
// Persistence is asserted the honest way: a second sandbox sharing the same storage stub
// re-loads the module (a simulated page reload) and must see the mutation.

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSandbox, loadModule, plain } = require('./helpers/load-module');

function freshStore(overrides) {
    const sandbox = loadModule('dashboard/todo-store.js', createSandbox(overrides));
    return { sandbox, store: sandbox.TodoStore };
}

function reloadedStore(sandbox) {
    // Same storage, fresh module state — what a real reload does.
    return freshStore({ localStorage: sandbox.localStorage }).store;
}

test('init survives corrupt stored JSON with an empty list', () => {
    const { sandbox, store } = freshStore();
    sandbox.localStorage.setItem('dashboard-todo-live', '{definitely not json');
    store.init({});
    assert.deepEqual(plain(store.all()), []);
});

test('init treats a stored non-array as empty', () => {
    const { sandbox, store } = freshStore();
    sandbox.localStorage.setItem('dashboard-todo-live', '{"id":"a"}');
    store.init({});
    assert.deepEqual(plain(store.all()), []);
});

test('init drops id-less entries and re-normalizes the rest (hand-edited store degrades gracefully)', () => {
    const { sandbox, store } = freshStore();
    sandbox.localStorage.setItem(
        'dashboard-todo-live',
        JSON.stringify([
            { id: 'issue-A-1', title: 't', status: 'bogus', labels: 'nope' },
            { title: 'no id' },
            null,
        ]),
    );
    store.init({});
    const all = store.all();
    assert.equal(all.length, 1);
    assert.equal(all[0].status, 'todo');
    assert.deepEqual(plain(all[0].labels), []);
});

test('storage is scoped per page — a preview init never sees the live list', () => {
    const { sandbox, store } = freshStore();
    sandbox.localStorage.setItem('dashboard-todo-live', JSON.stringify([{ id: 'email-1', title: 't' }]));
    store.init({ scope: 'preview' });
    assert.deepEqual(plain(store.all()), []);
    store.init({ scope: 'live' });
    assert.equal(store.all().length, 1);
});

test('add dedupes by id and returns the number actually added', () => {
    const { store } = freshStore();
    store.init({});
    assert.equal(
        store.add([
            { id: 'email-1', title: 'a' },
            { id: 'pr-2', title: 'b' },
        ]),
        2,
    );
    assert.equal(store.add([{ id: 'email-1', title: 'again' }]), 0);
    assert.equal(store.add([null, { title: 'no id' }]), 0);
    assert.equal(store.add(null), 0);
    assert.equal(store.all().length, 2);
});

test('toEntry normalizes junk on the way in', () => {
    const { store } = freshStore();
    store.init({});
    store.add([
        { id: 'email-9', title: 't', status: 'junk', labels: 'not-an-array' },
        { id: 'oddball', title: 't', type: 'pr' },
        { id: 'no-type-at-all', title: 't' },
        { id: 'issue-3', title: 't', status: 'in-progress', labels: ['a'] },
    ]);
    const byId = Object.fromEntries(store.all().map((e) => [e.id, e]));
    // Type comes from the briefing id prefix first, then the explicit type, then 'custom'.
    assert.equal(byId['email-9'].type, 'email');
    assert.equal(byId['oddball'].type, 'pr');
    assert.equal(byId['no-type-at-all'].type, 'custom');
    assert.equal(byId['issue-3'].type, 'issue');
    // Only the exact 'in-progress' survives; junk statuses and labels normalize.
    assert.equal(byId['email-9'].status, 'todo');
    assert.deepEqual(plain(byId['email-9'].labels), []);
    assert.equal(byId['issue-3'].status, 'in-progress');
    assert.deepEqual(plain(byId['issue-3'].labels), ['a']);
});

test('setStatus flips lanes, normalizes junk to todo, and persists across a reload', () => {
    const { sandbox, store } = freshStore();
    store.init({});
    store.add([{ id: 'pr-1', title: 't' }]);
    store.setStatus('pr-1', 'in-progress');
    assert.equal(store.all()[0].status, 'in-progress');

    const reloaded = reloadedStore(sandbox);
    reloaded.init({});
    assert.equal(reloaded.all()[0].status, 'in-progress');

    reloaded.setStatus('pr-1', 'garbage');
    assert.equal(reloaded.all()[0].status, 'todo');
});

test('remove deletes by id and persists across a reload', () => {
    const { sandbox, store } = freshStore();
    store.init({});
    store.add([
        { id: 'email-1', title: 'a' },
        { id: 'email-2', title: 'b' },
    ]);
    store.remove('email-1');
    assert.deepEqual(
        plain(store.all()).map((e) => e.id),
        ['email-2'],
    );

    const reloaded = reloadedStore(sandbox);
    reloaded.init({});
    assert.deepEqual(
        plain(reloaded.all()).map((e) => e.id),
        ['email-2'],
    );
});

test('blocked storage keeps the in-memory list usable', () => {
    const { sandbox, store } = freshStore();
    store.init({});
    sandbox.localStorage.throwOnSet = true;
    assert.equal(store.add([{ id: 'email-1', title: 'a' }]), 1);
    assert.equal(store.all().length, 1);
});
