import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
    { ignores: ['node_modules/', 'dashboard/data/', 'plans/', 'logs/', 'WorkingFiles/'] },
    js.configs.recommended,
    prettier,
    {
        // The dashboard modules are plain <script>-loaded IIFEs (file:// page, no build step),
        // so they share state through window.* globals rather than imports.
        files: ['dashboard/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                ...globals.browser,
                DashboardRenderers: 'readonly',
                DashboardBehavior: 'readonly',
                TodoStore: 'readonly',
            },
        },
    },
    {
        files: ['tests/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: globals.node,
        },
    },
    {
        // The page targets modern browsers (even over file://) — ES6+ is enforced, not aspirational.
        rules: {
            'no-var': 'error',
            'prefer-const': 'error',
            'prefer-arrow-callback': 'error',
            'prefer-template': 'error',
            'object-shorthand': ['error', 'always'],
        },
    },
    {
        // renderers.js builds markup by concatenating html``-tagged fragments; rewriting those
        // joins as plain template literals would visually blur the escaped/unescaped seam the
        // html`` tag exists to mark, so string concatenation stays legal in this one file.
        files: ['dashboard/renderers.js'],
        rules: {
            'prefer-template': 'off',
        },
    },
];
