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

## Comandos

```bash
npx nx lint core
npx nx test core
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
