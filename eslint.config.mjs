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
        rules: {
            // The existing code's empty catch blocks carry their "why" as a comment and no
            // binding use — don't force the binding to be consumed.
            'no-unused-vars': ['error', { caughtErrors: 'none' }],
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
];
