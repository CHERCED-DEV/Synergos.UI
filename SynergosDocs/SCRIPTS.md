# Synergos.UI — Scripts de NPM (Raíz)

> Referencia rápida de los scripts disponibles en el `package.json` raíz.
> Todos los scripts pueden lanzarse desde el CLI interactivo (`npm run cli`).

---

## CLI

| Script | Descripción |
|---|---|
| `npm run cli` / `npm run c` | CLI interactivo — Dev CDN, Release, Build, Test, Lint, Graph, Setup |
| `npm run catalog` | Genera o actualiza el catálogo HTML de elementos |

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

### Release interactivo (recomendado)

| Script | Descripción |
|---|---|
| `npm run release:cdn` | Lanza el release interactivo (`tools/release-cdn.mjs`) |
| `npm run cli` → "Release to CDN" | Mismo flujo desde el CLI principal |

El release interactivo soporta 4 scopes:

| Scope | Qué hace |
|---|---|
| 🎯 Specific elements | Build + publish solo N elementos seleccionados |
| 🏗 Entire framework | Build + publish todos los elementos de un framework |
| 📚 Runtime only | Build + publish solo Angular shared runtime |
| 🔥 Everything | Pipeline completo: build all + validate + publish all + verify + clean |

Después de elegir scope incluye: selección de framework, picker de elementos,
toggle de verificación de integridad, toggle de limpieza de dist, y confirmación final.

### Release directo (scripts npm)

| Script | Descripción |
|---|---|
| `npm run release` | Release completo todos los frameworks |
| `npm run release:angular` | Release Angular: build + runtime + validate + publish |
| `npm run release:react` | Release React: build + validate + publish |
| `npm run release:svelte` | Release Svelte: build + validate + publish |
| `npm run release:vanilla` | Release Vanilla: build + validate + publish |
| `npm run release:experiences` | Release todas las experiences (Angular + cross-framework) |
| `npm run release:element` | Release de un elemento específico (requiere build previo) |

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
| `npm run dev:cdn` | Dev CDN Angular — watch + rebuild + sync a CDN local |
| `npm run dev:cdn:react` | Dev CDN React — watch via Vite |
| `npm run dev:cdn:svelte` | Dev CDN Svelte — watch via Vite |
| `npm run dev:cdn:vanilla` | Dev CDN Vanilla — watch via Vite |
| `npm run manifest:gen` | Genera `element-manifest.json` para el CDN |
| `npm run clean:dist` | Limpia directorios `dist/` en todos los frameworks |
| `npm run graph` | Visualiza el grafo Nx del workspace raíz |
| `npm run graph:angular` | Visualiza el grafo Nx del workspace Angular |

> **Dev CDN**: Sin argumentos abre modo interactivo (picker de framework + elementos).
> Con flags: `node tools/dev-cdn.mjs --element=hero --livereload --skip-runtime`
> Ver `DEV_CDN_MODE.md` para documentación completa.

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

### Dev CDN — desarrollo en caliente contra el CMS (recomendado)

```bash
# Modo interactivo — elige framework, elementos, LiveReload
npm run cli
# → "Dev CDN (hot reload)" → Angular → pick elements → LiveReload: yes

# O directo desde terminal:
node tools/dev-cdn.mjs --element=alert-bar --livereload

# Cross-framework (React/Svelte/Vanilla):
node tools/dev-cdn-vite.mjs --element=pricing-card --framework=react --livereload

# Todos los elementos Angular con LiveReload:
node tools/dev-cdn.mjs  # → interactive → ALL → LiveReload: yes
```

### Release unitario — publicar un elemento a CDN

```bash
# Modo interactivo:
npm run release:cdn
# → "Specific elements" → Angular → pick alert-bar → Verify: yes → Proceed

# O con flags:
node tools/release-cdn.mjs --scope=elements --framework=angular --element=hero,card
```

### Release de un framework completo

```bash
npm run release:cdn
# → "Entire framework" → React → Verify: yes → Clean: no → Proceed

# O directo:
npm run release:react
```

### Release completo

```bash
npm run release:cdn
# → "Everything (full release)" → Proceed

# O directo:
npm run release
```
