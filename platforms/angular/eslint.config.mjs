import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist', '**/out-tsc'],
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          allow: [
            '../../../../../../vitals/core/src/mappers/block.mapper',
            '../../../../../../vitals/core/src/models/*',
          ],
          depConstraints: [
            {
              sourceTag: 'framework:angular',
              onlyDependOnLibsWithTags: ['framework:angular', 'framework:agnostic'],
            },
            {
              sourceTag: 'framework:agnostic',
              onlyDependOnLibsWithTags: ['framework:agnostic'],
            },
            {
              sourceTag: 'tier:primitive',
              notDependOnLibsWithTags: ['tier:composition', 'tier:module'],
            },
            {
              sourceTag: 'tier:composition',
              notDependOnLibsWithTags: ['tier:module'],
            },
            {
              sourceTag: 'scope:elements',
              notDependOnLibsWithTags: ['scope:rendering', 'scope:integrations'],
            },
            {
              sourceTag: 'scope:rendering',
              notDependOnLibsWithTags: ['scope:elements'],
            },
            {
              sourceTag: 'scope:libs',
              notDependOnLibsWithTags: ['scope:elements'],
            },
            {
              sourceTag: 'type:lib',
              notDependOnLibsWithTags: ['type:app'],
            },
          ],
        },
      ],
    },
  },
  ...nx.configs['flat/angular'],
  ...nx.configs['flat/angular-template'],
  {
    files: ['**/*.ts'],
    rules: {
      '@angular-eslint/no-input-rename': 'off',
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: ['syn', 'sg'],
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: ['syn', 'sg'],
          style: 'kebab-case',
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    // Override or add rules here
    rules: {},
  },
];
