# Synergos.UI — Scripts de NPM

> Tabla real post-purga de Nx (2026-08-04). Murieron todas las variantes
> `:react` / `:svelte` / `:vanilla`, `graph`, y todo lo que invocaba `nx`.
> El detalle de cada pieza del pipeline: `BUILD_PIPELINE.md`.

---

## BUILD (raíz)

| Script | Qué hace |
|---|---|
| `npm run build` | Build completo: vitals + elementos Angular + runtime (en ese orden) |
| `npm run build:vitals` | Compila los paquetes agnósticos (`tools/build-vitals.mjs`) |
| `npm run build:angular` | Los 136 elementos + libs, AOT completo, **~26 s** (`platforms/angular/tools/build.mjs`) |
| `npm run build:runtime` | Runtime compartido con el linker de Angular (`tools/build-runtime.mjs`) |
| `npm run build:cdn` | Arma `public/` completo: vitals + elementos + runtime + registry + catálogo (`tools/build-cdn.mjs`) |

### Desde `platforms/angular/`

| Script | Qué hace |
|---|---|
| `npm run build` | Lo mismo que `build:angular` de la raíz |
| `npm run dev` | `build.mjs --watch` — incremental, reusa el programa del compilador |
| `node tools/build.mjs --solo=badge,hero` | Solo esos elementos (dev) |
| `npm run lint` | ESLint plano sobre `apps` y `libs` (prefijos `syn`/`sg`) |
| `npm run sync:tokens` / `sync:tokens:check` | Sincroniza / verifica tokens SCSS |

---

## PUBLISH y RELEASE

| Script | Qué hace |
|---|---|
| `npm run publish:cdn` | Publica artefactos ya buildeados (`tools/publish.mjs` — el ÚNICO que escribe al CDN) |
| `npm run publish:runtime` | Publica solo el runtime compartido (`tools/publish-runtime.mjs`) |
| `npm run publish:element` | Publica un elemento específico (`tools/publish-element.mjs`) |
| `npm run release:cdn` | Release interactivo: build + validate + publish (`tools/release-cdn.mjs`) |

> Nunca publish sin `contracts:validate` en verde.

---

## VALIDATE — el gate

| Script | Qué hace |
|---|---|
| `npm run contracts:validate` | El gate completo: `sync:tokens:check` + `element:audit` + `manifest:validate` + `cms:validate` + `cms:sync:check` |
| `npm run element:audit` | Registry × mappers × models × inputs en sync |
| `npm run manifest:validate` | Falla si algún elemento tiene `inputs` vacío |
| `npm run cms:validate` | Valida los resolvers del CMS contra el registry (cross-repo) |
| `npm run cms:sync` / `cms:sync:check` | Sincroniza / verifica el contrato con el CMS |
| `npm run sync:tokens` / `sync:tokens:check` | Alias raíz de los sync de tokens de la plataforma |

---

## TEST

| Script | Qué hace |
|---|---|
| `npm test` | **Solo los specs de la raíz** (`tools/lib/` — cdn-cache-policy) |

> Los tests unitarios de Angular están **suspendidos**: el runner era el
> executor de Nx (`@angular/build:unit-test`). Los `.spec.ts` siguen en el
> árbol; recablearlos a vitest con compilación Angular es un pendiente
> declarado, no un olvido.

---

## HERRAMIENTAS

| Script | Qué hace |
|---|---|
| `npm run dev:cdn` | Dev CDN — watch + rebuild + sync a CDN local (`tools/dev-cdn.mjs`) |
| `npm run catalog` | Genera el catálogo HTML de elementos (`tools/catalog.mjs`) |

---

## Qué murió con la purga (para que nadie lo busque)

- `build:react` / `build:svelte` / `build:vanilla` y todas las variantes
  `test:*` / `lint:*` / `release:*` / `setup:*` / `dev:cdn:*` de esas
  plataformas — las plataformas mismas se eliminaron.
- `graph` / `graph:*` — no hay grafo Nx que visualizar.
- Los dos `nx.json`, todos los `project.json` y `ng-package.json`,
  `patches/` (parcheaba a Nx), `tools/run.mjs`, `tools/dev-cdn-vite.mjs`,
  `vitals/shared`.
- De las devDeps: `nx`, `@nx/*`, `@angular/build`, `@angular/cli`,
  `@angular-devkit/*`, `@schematics/angular`, `ng-packagr`, `cross-env`,
  `patch-package`, `tsx`, `@swc*`.

---

## Flujos típicos

### Iterar sobre un elemento

```bash
cd platforms/angular
node tools/build.mjs --solo=alert-bar     # o npm run dev para watch
```

### Release completo al CDN

```bash
npm run build            # vitals + elementos + runtime
npm run contracts:validate
npm run release:cdn      # o publish:cdn si ya validaste
```

### Armar el CDN servible (Cloudflare)

```bash
npm run build:cdn        # deja public/ listo; wrangler.jsonc + worker/ lo sirven
```
