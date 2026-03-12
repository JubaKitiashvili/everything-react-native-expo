'use strict';

module.exports = [
  {
    ignores: ['node_modules/', 'dashboard/public/', '.claude/'],
  },
  {
    files: ['**/*.js'],
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'warn',
      'consistent-return': 'error',
    },
  },
];
