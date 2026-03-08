# Shell App (`apps/shell`)

Aplicacion Angular de desarrollo para montar y validar componentes/librerias de Synergos UI.

## Objetivo

- Servir como harness local para desarrollo UI.
- Validar integracion de `@synergos/core`, `@synergos/shared` y `@synergos/core-assets`.
- No se despliega a produccion.

## Stack

- Angular 21 standalone + OnPush + zoneless
- Nx monorepo
- SCSS con include path a `libs/core-assets/src`

## Comandos

```bash
npx nx serve shell
npx nx build shell
npx nx test shell
npx nx lint shell
```

## Notas

- Config de estilos globales en `apps/shell/src/styles.scss`.
- El target `build` genera artefactos en `dist/apps/shell`.
