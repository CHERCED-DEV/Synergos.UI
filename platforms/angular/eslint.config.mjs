// Lint plano de Angular — sin Nx.
//
// La config anterior venía de @nx/eslint-plugin y su pieza central era
// `@nx/enforce-module-boundaries`, que vigilaba fronteras entre scopes usando
// los TAGS de los project.json. Con la purga murieron los tags y el plugin; la
// frontera que de verdad importa —qué se empaqueta dentro de un elemento y qué
// queda externo— la vigila ahora el build: `cdn.config.mjs` decide qué es
// external, y un import que lo viole se ve en el tamaño del bundle publicado.
//
// Se conservan las DOS reglas que sí eran nuestras: los prefijos syn/sg de
// selectores y directivas.
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';

export default tseslint.config(
  { ignores: ['**/dist', '**/.cdn-out', '**/node_modules'] },
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommended, ...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: ['syn', 'sg'], style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: ['syn', 'sg'], style: 'kebab-case' },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended],
  },
);
