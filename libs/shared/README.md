# Shared Library (`libs/shared`)

Design system Angular de Synergos UI.

## Objetivo

- Exponer foundations y patterns reutilizables.
- Mantener componentes presentacionales, standalone y OnPush.
- Proveer API publica desde `libs/shared/src/index.ts`.

## Estructura

- `src/components/foundations/`
- `src/components/patterns/`
- `src/utils/`

## Componentes incluidos

### Foundations
- alert
- avatar
- badge
- button
- checkbox
- icon-button
- input
- radio
- select
- textarea

### Patterns
- card
- dropdown
- modal
- tabs
- tooltip

## Reglas aplicadas

- `standalone: true`
- `ChangeDetectionStrategy.OnPush`
- `input()` / `output()`
- estado interno con `signal()`
- control flow moderno (`@if`, `@for`)
- tests colocados junto al componente (`*.spec.ts`)

## Comandos

```bash
npx nx lint shared
npx nx test shared
```

> Nota: en el estado actual del workspace, `shared:test` requiere completar configuracion de build target para ejecutar la suite con `@angular/build:unit-test`.
