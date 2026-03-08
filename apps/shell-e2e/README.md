# Shell E2E (`apps/shell-e2e`)

Pruebas end-to-end con Cypress para el proyecto `shell`.

## Objetivo

- Validar flujos visibles al usuario sobre la app shell.
- Detectar regresiones de UI/integracion.

## Herramientas

- Cypress
- Nx plugin de e2e (targets inferidos)

## Comandos

```bash
npx nx e2e shell-e2e
npx nx open-cypress shell-e2e
```

## Estructura

- Specs: `apps/shell-e2e/src/e2e/`
- Soporte: `apps/shell-e2e/src/support/`
- Config: `apps/shell-e2e/cypress.config.ts`
