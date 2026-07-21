# CDN Shared Runtime — Angular Elements

## Resumen

El runtime compartido es un conjunto de bundles ESM pre-construidos que se cargan **una sola vez** en la página mediante un **import map** nativo del browser. Cada bundle de elemento (hero, card, etc.) pesa ~5-15 KB porque Angular y las librerías compartidas se resuelven desde el runtime en vez de duplicarse.

## Estructura en CDN

```
LOCAL_CDN/synergos/
  runtime/angular/{version}/          ← bundles compartidos + import-map
    ng-core.js                        ← @angular/core
    ng-compiler.js                    ← @angular/compiler (JIT linker)
    ng-common.js                      ← @angular/common
    ng-common-http.js                 ← @angular/common/http
    ng-elements.js                    ← @angular/elements
    ng-forms.js                       ← @angular/forms
    ng-platform-browser.js            ← @angular/platform-browser
    ng-router.js                      ← @angular/router
    rxjs.js                           ← rxjs + rxjs/operators
    sg-core.js                        ← @synergos/core
    sg-shared.js                      ← @synergos/shared
    import-map.json                   ← mapa para inyectar en <head>
  runtime/angular/latest/             ← symlink/copia al último version
  hero/angular/latest/main.js         ← bundle del elemento hero (~12 KB)
  card/angular/latest/main.js         ← bundle del elemento card (~8 KB)
  ...
```

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run build:runtime` | Compila los 11 bundles del runtime con esbuild → `dist/runtime/angular/{version}/` |
| `npm run publish:runtime` | Copia `dist/runtime/` → `LOCAL_CDN/synergos/runtime/` y genera `import-map.json` con URLs CDN absolutas |
| `npm run release:angular` | Pipeline completo: build elements → build runtime → validate contracts → publish runtime → publish elements |

## Cómo funciona

### 1. Build (`tools/build-runtime.mjs`)

- Lee la versión de `@angular/core` del `package.json` de Angular.
- Usa **esbuild** para bundlear cada paquete como ESM independiente.
- Cada bundle declara sus dependencias como `external` para que el browser las resuelva vía import map.
- Los bundles con **partial declarations** de Angular (common, elements, forms, platform-browser, router) llevan un **banner** `import "@angular/compiler"` que fuerza la carga del compilador JIT antes de que se evalúe el módulo.
- Genera `import-map.json` con URLs placeholder (`__BASE_URL__`).

### 2. Publish (`tools/publish-runtime.mjs`)

- Copia los bundles a `LOCAL_CDN/synergos/runtime/angular/{version}/` y `latest/`.
- Reescribe `import-map.json` reemplazando `__BASE_URL__` con la URL CDN real.
- Variable de entorno `SYNERGOS_CDN_ORIGIN` (default: `https://synergos-static-local`) define el origen CDN.

### 3. Inyección en la página (CMS)

El import map se inyecta como **primer script** en `<head>`, antes de cualquier `<script type="module">` de elementos:

```html
<head>
  <script type="importmap">
  {
    "imports": {
      "@angular/core": "https://synergos-static-local/synergos/runtime/angular/21.1.6/ng-core.js",
      "@angular/compiler": "https://synergos-static-local/synergos/runtime/angular/21.1.6/ng-compiler.js",
      ...
    }
  }
  </script>
</head>
<body>
  <!-- Cada elemento carga solo su bundle liviano -->
  <script type="module" src="https://synergos-static-local/synergos/hero/angular/latest/main.js"></script>
  <synergos-hero config='{"headingText":"..."}' class="sg-cdn sg-cdn--hero"></synergos-hero>
</body>
```

## Notas técnicas

### ¿Por qué `import "@angular/compiler"` como banner?

Angular 21 publica sus paquetes con **partial declarations** (decoradores parcialmente compilados). En un build normal, el Angular Linker los resuelve en build time. En nuestro caso (bundles CDN pre-construidos), el browser necesita el **JIT compiler** disponible en runtime para completar esas declaraciones. El banner garantiza que `@angular/compiler` cargue y se registre antes de que el bundle se evalúe.

### ¿Por qué URLs absolutas en el import map?

El CMS (Umbraco) corre en `https://synergos.local:5001` y el CDN estático en `https://synergos-static-local`. Las URLs relativas no funcionan porque el browser las resolvería contra el host del CMS, no contra el CDN. El import map usa URLs absolutas con el origen CDN correcto.

### ¿Por qué `type="module"` en los scripts de elementos?

Los `<script type="module">` son necesarios para que el browser use el import map al resolver los `import` statements dentro de cada bundle. Sin `type="module"`, el import map se ignora.

## Archivos modificados (vs. estado original)

| Archivo | Cambio |
|---|---|
| `tools/build-runtime.mjs` | Agregados: `ng-compiler.js`, `ng-common-http.js`, `ng-forms.js`, `ng-router.js`, `rxjs.js`. Banner `import "@angular/compiler"` en bundles con partial declarations. Condición `production` en esbuild. |
| `tools/publish-runtime.mjs` | URLs absolutas con `CDN_ORIGIN`. Lista completa de 11 runtime files. |
| `package.json` | `release:angular` incluye `build:runtime` y `publish:runtime` en el pipeline. |

## Pendientes (CMS)

El import map se debe inyectar en `<head>` desde el CMS. Los cambios necesarios en Synergos.CMS están documentados en el handoff correspondiente. Punto clave: el atributo `config` de los elementos debe llegar como **JSON puro** (sin `Html.Encode` doble), envuelto en comillas simples.
