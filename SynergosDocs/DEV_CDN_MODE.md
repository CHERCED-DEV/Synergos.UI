> ⚠️ **OBSOLETO desde la purga de Nx (2026-08-04).** Este documento describe la arquitectura de build anterior. El build actual: `platforms/angular/tools/build.mjs` — ver BUILD_PIPELINE.md.

# Dev CDN Mode — Desarrollo en caliente contra la CDN local

## Concepto

En vez de apuntar el CMS a un `localhost:4200` de Angular, **la CDN local ES el dev server**. El CMS sigue apuntando a `https://synergos-static-local` como siempre, y los cambios en el código fuente se reflejan ahí directamente — tanto en los elementos como en las libs compartidas.

```
┌──────────────────┐     ┌──────────────────┐     ┌─────────────────────────┐
│  Editor (VS Code) │     │  esbuild --watch  │     │  dist/{element}/browser/ │
│  save en:         │────>│  rebuild (~200ms)  │────>│  main.js (+ .map)       │
│  • element src    │     └──────────────────┘     └──────────┬──────────────┘
│  • libs/shared    │                                          │ fs.watch
│  • libs/core      │     ┌──────────────────┐                │
│  • vitals/        │────>│  lib watcher      │──(touch)──>  main.ts entry
└──────────────────┘     │  (utimesSync)     │     
                          └──────────────────┘     
                                                               ▼
                          ┌─────────────────────────────────────────────────┐
                          │  LOCAL_CDN/synergos/{element}/angular/latest/    │
                          │  main.js  (+LiveReload snippet when --livereload)│
                          └──────────┬──────────────────────────────────────┘
                                     │ https://synergos-static-local
                                     ▼
                          ┌─────────────────────────┐
                          │  Browser (CMS page)      │
                          │  CDN poll → auto reload   │
                          └─────────────────────────┘
```

## Uso

### Modo interactivo (recomendado)

```bash
# Desde el CLI principal:
npm run cli  →  "Dev CDN (hot reload)"

# O directamente (sin args = interactivo):
node tools/dev-cdn.mjs           # Angular
node tools/dev-cdn-vite.mjs      # React/Svelte/Vanilla
```

El modo interactivo guía paso a paso:
1. **Framework** → Angular / React / Svelte / Vanilla
2. **Elementos** → ALL (47) o selección individual con checkbox
3. **LiveReload** → sí/no
4. **Skip runtime** → sí/no (solo Angular)

### Modo directo (con flags)

```bash
# Un elemento con auto-reload
node tools/dev-cdn.mjs --element=alert-bar --livereload

# Múltiples elementos
node tools/dev-cdn.mjs --element=hero,card,footer --livereload

# Sin LiveReload (refresh manual)
node tools/dev-cdn.mjs --element=hero

# Si el runtime ya está publicado
node tools/dev-cdn.mjs --element=hero --skip-runtime --livereload

# Cross-framework (React, Svelte, Vanilla)
node tools/dev-cdn-vite.mjs --element=hello-world --framework=vanilla --livereload
```

## Fases del script

### Phase 1 — Verificar runtime
Si `import-map.json` no existe en `LOCAL_CDN/synergos/runtime/angular/latest/`, lo compila y publica automáticamente.

### Phase 2 — Build inicial + sync
Compila los elementos con `nx run-many --parallel=4 -c cdn-dev` y copia a CDN. Si `--livereload`, inyecta el snippet del poll client en el bundle.

### Phase 3 — Watch dist/ (fs.watch)
Un `fs.watch` en `dist/{element}/browser/` detecta cuando esbuild termina un rebuild y copia `main.js` + `.map` a la CDN.

### Phase 4 — nx watch (single process)
Un solo proceso `nx watch --includeDependentProjects` monitorea el grafo de dependencias completo. Cuando un archivo cambia (ya sea en el elemento, en `libs/`, o en `vitals/`), Nx identifica qué proyecto(s) están afectados y lanza `nx build {projectName} -c cdn-dev` solo para esos.

- **Requiere el Nx daemon** — se arranca automáticamente (`nx daemon --start`)
- **1 proceso** para todos los elementos (antes era N procesos esbuild)
- **Detecta cambios en libs** nativamente via `--includeDependentProjects`

### Phase 5 — LiveReload via CDN polling (opcional, `--livereload`)
No levanta servidores adicionales. Usa la CDN existente (IIS `synergos-static-local`):

1. Escribe `__dev.json` con `{ ts, at }` en `LOCAL_CDN/synergos/` cada vez que se sincroniza
2. Un snippet JS (auto-inyectado en el bundle) hace `fetch('/__dev.json', {cache:'no-store'})` cada 1.5s
3. Si el timestamp cambió → `location.reload()`
4. Al terminar el proceso, borra `__dev.json` (cleanup)

El snippet descubre la URL base de la CDN automáticamente desde el `<script src>` que contiene `/synergos/`.

## Configuración `cdn-dev`

Definida en `platforms/angular/nx.json`:

| Propiedad | Valor | Por qué |
|---|---|---|
| `externalDependencies` | Angular + @synergos/* | Bundles livianos (~10 KB), vía import-map |
| `sourceMap` | `true` | DevTools muestra source original |
| `optimization` | `false` | Build más rápido, sin minificar |
| `outputHashing` | `"none"` | Nombre fijo `main.js`, CDN sirve la misma URL |

## Flujo de cambio completo

### Cambio en el elemento (ej: `alert-bar.ts`)
```
1. Guardas alert-bar.ts
2. esbuild --watch detecta el cambio (~200ms)
3. Rebuild con cdn-dev (~1-3s)
4. dist/alert-bar/browser/main.js actualizado
5. fs.watch → copia a LOCAL_CDN + inyecta LiveReload snippet (~50ms)
6. __dev.json actualizado con nuevo timestamp
7. Browser poll detecta cambio → auto reload (~1.5s max)
```
**Tiempo total: ~3-5 segundos**

### Cambio en una lib (ej: `libs/shared/.../alert.scss`)
```
1. Guardas alert.scss en libs/shared/
2. Lib watcher detecta el cambio (200ms debounce)
3. utimesSync toca main.ts del elemento
4. esbuild --watch detecta main.ts modificado
5. Rebuild arrastra todo el árbol (incluyendo el SCSS cambiado)
6. dist → fs.watch → CDN → __dev.json → browser reload
```
**Tiempo total: ~4-6 segundos**

## Archivos involucrados

| Archivo | Rol |
|---|---|
| `tools/dev-cdn.mjs` | Script principal (Angular) |
| `tools/dev-cdn-vite.mjs` | Script para React/Svelte/Vanilla |
| `tools/lib/livereload.mjs` | CDN polling: `createDevSignal()` + `LIVERELOAD_CLIENT_JS` |

## Requisitos

- Runtime publicado en CDN al menos una vez (`npm run publish:runtime`)
- IIS site `synergos-static-local` apuntando a `C:\LOCAL_CDN`
- Config `cdn-dev` en `nx.json` (externals + sourcemaps)
