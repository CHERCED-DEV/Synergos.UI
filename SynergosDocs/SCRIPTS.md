# Synergos.UI — Scripts de NPM (Raíz)

> Referencia rápida de los scripts disponibles en el `package.json` raíz.
> Los scripts Angular siempre incluyen `cross-env NX_WORKSPACE_ROOT_PATH= NX_DAEMON=false`
> para evitar el conflicto de dual workspace Nx. Ver `TROUBLESHOOTING.md#G1`.

---

## CLI

| Script | Descripción |
|---|---|
| `npm run cli` / `npm run c` | Lanza el CLI interactivo (`tools/cli.mjs`) |
| `npm run catalog` | Genera o actualiza el catálogo de elementos |

---

## BUILD

### Todo

| Script | Descripción |
|---|---|
| `npm run build` | Build completo: Angular + runtime + React + Svelte + vanilla (en ese orden) |

### Angular

| Script | Descripción |
|---|---|
| `npm run build:angular` | Build todos los scopes Angular: elements + experiences + cms-adapter (paralelo=6) |
| `npm run build:angular:elements` | Solo elementos + cms-adapter (excluye experiences) |
| `npm run build:angular:experiences` | Solo experiences Angular (paralelo=3) |
| `npm run build:angular:dev` | Elementos en modo development (sin optimización, con sourcemaps) |
| `npm run build:angular:changed` | Solo proyectos afectados por cambios (`nx affected`) |
| `npm run build:angular:stable` | Build secuencial paralelo=1 (para entornos con recursos limitados) |

### Runtime Angular (bundle compartido CDN)

| Script | Descripción |
|---|---|
| `npm run build:runtime` | Compila el runtime Angular compartido (`tools/build-runtime.mjs`) |
| `npm run build:runtime:dry` | Simula el build sin escribir archivos |

### Frameworks cross-platform (React, Svelte, Vanilla)

| Script | Descripción |
|---|---|
| `npm run build:react` | Build todos los proyectos React (tag:framework:react) |
| `npm run build:svelte` | Build todos los proyectos Svelte (tag:framework:svelte) |
| `npm run build:vanilla` | Build todos los proyectos Vanilla JS (tag:framework:vanilla) |

### Experiences (cross-framework)

| Script | Descripción |
|---|---|
| `npm run build:experiences:cross` | Build las 6 experiences cross-framework (React+Svelte+Vanilla) en paralelo — usa `tag:scope:experiences` |
| `npm run build:experiences` | Build experiencias Angular + las 6 cross-framework (todo en secuencia) |

---

## RELEASE

Un "release" es `build` + `contracts:validate` + `publish:cdn`. Nunca hacer publish sin validate.

| Script | Descripción |
|---|---|
| `npm run release` | Release completo todos los frameworks |
| `npm run release:angular` | Release Angular: build + runtime + validate + publish |
| `npm run release:react` | Release React: build + validate + publish |
| `npm run release:svelte` | Release Svelte: build + validate + publish |
| `npm run release:vanilla` | Release Vanilla: build + validate + publish |
| `npm run release:experiences` | Release todas las experiences (Angular + cross-framework): build + validate + runtime + publish |
| `npm run release:element` | Release interactivo de un elemento específico (requiere build previo) |

---

## PUBLISH (sin build)

Solo suben artefactos ya buildeados. Usar únicamente si el build ya fue validado.

| Script | Descripción |
|---|---|
| `npm run publish:cdn` | Publica artefactos al CDN (`tools/publish.mjs`) |
| `npm run publish:runtime` | Publica solo el runtime Angular al CDN (`tools/publish-runtime.mjs`) |

> **Destino actual:** `C:\LOCAL_CDN` (hardcodeado en `tools/publish.mjs`).
> Para producción real, parametrizar via `SYNERGOS_CDN` / `SYNERGOS_CDN_ORIGIN` en variables de entorno.

---

## TEST

| Script | Descripción |
|---|---|
| `npm test` | Tests de todos los frameworks |
| `npm run test:angular` | Tests Angular con Vitest (`nx run-many --target=test`) |
| `npm run test:react` | Tests React |
| `npm run test:svelte` | Tests Svelte |
| `npm run test:vanilla` | Tests Vanilla |

---

## LINT

| Script | Descripción |
|---|---|
| `npm run lint` | Lint todos los frameworks |
| `npm run lint:angular` | Lint Angular (incluye boundary checks por tags Nx) |
| `npm run lint:react` | Lint React |
| `npm run lint:svelte` | Lint Svelte |
| `npm run lint:vanilla` | Lint Vanilla |

---

## VALIDATE

Gate de integridad. Ejecutar antes de cualquier publish.

| Script | Descripción |
|---|---|
| `npm run contracts:validate` | `element:audit` + `manifest:validate` (el gate completo) |
| `npm run element:audit` | Valida registry × mappers × models × inputs (64/64 entradas) |
| `npm run manifest:validate` | Valida el manifest CDN generado |
| `npm run contracts:export` | Exporta contratos TypeScript para consumo externo |

---

## HERRAMIENTAS

| Script | Descripción |
|---|---|
| `npm run manifest:gen` | Genera `element-manifest.json` para el CDN |
| `npm run clean:dist` | Limpia directorios `dist/` en todos los frameworks |
| `npm run graph` | Visualiza el grafo Nx del workspace raíz |
| `npm run graph:angular` | Visualiza el grafo Nx del workspace Angular |

---

## SETUP (primera instalación)

| Script | Descripción |
|---|---|
| `npm run setup` | Instala `node_modules` en todos los frameworks |
| `npm run setup:angular` | `cd platforms/angular && npm install` |
| `npm run setup:react` | `cd platforms/react && npm install` |
| `npm run setup:svelte` | `cd platforms/svelte && npm install` |
| `npm run setup:vanilla` | `cd platforms/vanilla && npm install` |

> Cada framework tiene sus propios `node_modules` aislados. `npm install` en la raíz
> NO instala las dependencias de los frameworks. Siempre usar `npm run setup` para
> una instalación limpia completa.

---

## Flujos típicos de desarrollo

### Desarrollar un elemento Angular

```bash
# Iteración rápida en un elemento específico
cd platforms/angular
unset NX_WORKSPACE_ROOT_PATH
npx nx serve hero

# Build solo lo que cambió
npm run build:angular:changed

# Antes de publicar: siempre validar
npm run contracts:validate
npm run release:angular
```

### Desarrollar una experience cross-framework (React/Svelte/Vanilla)

```bash
# Build solo las 6 experiences cross-framework
npm run build:experiences:cross

# Build y publicar una experience específica
npx nx run react-quiz-flow:build
node tools/publish.mjs --element quiz-flow --dry-run

# Release completo de experiences
npm run release:experiences
```

### Release completo

```bash
npm run setup          # primera vez
npm run build          # todos los frameworks
npm run contracts:validate
npm run release        # build + validate + publish
```
