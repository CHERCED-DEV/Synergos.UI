# Core Library (`libs/core`)

Infraestructura base reutilizable para aplicaciones y modulos Synergos.

## Responsabilidades

- Proveedores globales (`provideCoreConfig`)
- Token de entorno (`ENVIRONMENT`)
- Interceptores HTTP
- Servicios base (`LoggerService`)

## API publica

Se exporta desde `libs/core/src/index.ts`:

- `provideCoreConfig`
- `Environment`, `defaultEnvironment`
- `ENVIRONMENT`
- `authInterceptor`
- `LoggerService`

## Testing (Vitest)

- Tests unitarios colocados junto al codigo (`*.spec.ts`).
- Target por proyecto: `nx test core`.
- Coverage aislado: `nx test core --coverage`.
- Directorio de coverage: `coverage/libs/core`.

## Comandos

```bash
nx lint core
nx test core
nx test core --coverage
```

## Uso rapido

```ts
provideCoreConfig({
  environment: {
    production: false,
    apiBaseUrl: 'https://api.example.com',
    cdnBaseUrl: 'https://cdn.example.com',
  },
});
```
