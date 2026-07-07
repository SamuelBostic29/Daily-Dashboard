// Loads a dashboard module (an IIFE assigning window.* globals — no exports) into a node:vm
// context, so the shipped files are tested exactly as written: no build step, no test-only
// export seams. The sandbox mimics just enough browser for the pure modules:
//
//   - `window` IS the sandbox/global object (so `window.X = …` and a later bare `X` agree,
//     matching a real page),
//   - `document` memoizes { id, innerHTML } stubs per getElementById id, which is all the
//     render-into-container functions (renderIssues/renderSection/renderPRs/renderTodo) touch,
//   - `localStorage` is an in-memory Map with the real get/set/removeItem surface, plus a
//     `throwOnSet` switch for the blocked-storage paths. Pass a previous sandbox's stub back in
//     via overrides to prove persistence across a fresh module load (a simulated page reload).

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createLocalStorageStub() {
    const store = new Map();
    return {
        throwOnSet: false,
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            if (this.throwOnSet) throw new Error('storage blocked');
            store.set(key, String(value));
        },
        removeItem(key) {
            store.delete(key);
        },
    };
}

function createDocumentStub() {
    const elements = new Map();
    return {
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, { id, innerHTML: '' });
            return elements.get(id);
        },
    };
}

function createSandbox(overrides = {}) {
    const sandbox = {
        console,
        document: createDocumentStub(),
        localStorage: createLocalStorageStub(),
        ...overrides,
    };
    sandbox.window = sandbox;
    return vm.createContext(sandbox);
}

// relPath is repo-root-relative, e.g. 'dashboard/renderers.js'.
function loadModule(relPath, sandbox = createSandbox()) {
    const file = path.join(__dirname, '..', '..', relPath);
    vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: relPath });
    return sandbox;
}

// Rehydrate a vm-realm value into this realm. Objects/arrays built inside the sandbox carry the
// sandbox's prototypes, so assert.deepStrictEqual rejects them against host literals on prototype
// identity alone — round-tripping through JSON makes deep comparisons compare data, not realms.
function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

module.exports = { createSandbox, createLocalStorageStub, loadModule, plain };
