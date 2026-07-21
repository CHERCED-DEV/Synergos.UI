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

## Testing (Vitest)

- Tests unitarios colocados junto al codigo (`*.spec.ts`).
- Target por proyecto: `nx test shared`.
- Coverage aislado: `nx test shared --coverage`.
- Directorio de coverage: `coverage/libs/shared`.

## Comandos

```bash
nx lint shared
nx test shared
nx test shared --coverage
```
