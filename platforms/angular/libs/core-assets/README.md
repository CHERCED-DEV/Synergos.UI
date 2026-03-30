# Core Assets (`libs/core-assets`)

Sistema de tokens y utilidades SCSS para el design system de Synergos.

## Objetivo

- Centralizar tokens visuales agnosticos.
- Exponer funciones y mixins reutilizables.
- Evitar estilos hardcodeados en componentes.

## Estructura SCSS

- `scss/tokens/`: colores, spacing, typography, breakpoints, elevation
- `scss/functions/`: `strip-unit`, `px-to-rem`
- `scss/mixins/`: `flex`, `responsive`, `focus`, `typography`
- `scss/elevation/`: sombras y z-index
- `scss/_index.scss`: entrypoint para `@use`

## Uso

En proyectos con include path configurado:

```scss
@use 'scss' as syn;

.button {
  padding: syn.$space-md;
  font-size: syn.px-to-rem(16);
  @include syn.focus-visible;
}
```

## Comandos

```bash
npx nx lint core-assets
```
