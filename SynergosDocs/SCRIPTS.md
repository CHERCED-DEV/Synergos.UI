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
| `npm run publish:cdn -- --element hero` | Publica un solo elemento — es el mismo `publish.mjs` con filtro; no hay script aparte |
| `npm run release` | Encadenado: `build` + `contracts:validate` + `publish:runtime` + `publish.mjs` |
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
| `npm test` | Los dos: gates de `tools/lib` + los specs de Angular |
| `npm run test:tools` | Sólo los gates de `tools/lib` — sin SDK, sin red, < 1 s |
| `npm run test:angular` | Sólo la plataforma (compila AOT primero, ~35 s) |
| `npm run size:check` | El presupuesto de tamaño contra `public/` |
| `npm run size:baseline` | Regenera el registro de tamaños — el diff va en el commit que lo causó |
| `npm run humo:cdn -- <url> [--sha <commit>]` | Humo contra la **URL pública**, nunca contra sí mismo |

> **Los specs de Angular se COMPILAN antes de correr** (`platforms/angular/tools/build-specs.mjs`),
> con el mismo ngtsc que publica los elementos. No es preferencia de estilo: los
> **signal inputs de Angular no funcionan en JIT** — `setInput()` no llega nunca al
> `input()` y devuelve el valor por defecto, en silencio. Como `LLM.txt` prohíbe
> `@Input()`, cualquier transpilador al vuelo haría que los tests **corran y mientan**.
>
> La cuarentena de `it.skip` está en **cero** y lo defiende `tools/lib/spec-quarantine.spec.mjs`:
> añadir uno rompe el build si no lleva su motivo y su ticket.

---

## HERRAMIENTAS

| Script | Qué hace |
|---|---|
| `npm run dev:cdn` | Sirve el CDN entero desde el watch incremental (`tools/dev-cdn.mjs`) — ver `DEV_CDN_MODE.md` |
| `npm run catalog` | Genera el catálogo HTML de elementos (`tools/catalog.mjs`) |

> `dev:cdn` **no sincroniza nada**: traduce la ruta y lee de `dist/`. Acepta
> `--solo=a,b`, `--puerto N` y `--sin-livereload`, y se para con Ctrl-C. El CMS lo
> consume por su ruta normal — `SYNERGOS_CDN_MODE=Http` + `SYNERGOS_CDN_URL`.

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

### Y lo que murió al rehacer `dev-cdn` (issue #2)

- `npm run dev:cdn:stop` y `tools/dev-cdn-stop.mjs` — el nuevo `dev:cdn` es **un
  proceso** y se para con Ctrl-C. No hay nada que señalizar.
- `tools/lib/dev-servers.mjs` y su `__dev-servers.json` — existía para que el CMS
  supiera qué puerto servía qué elemento, porque antes había un servidor por
  elemento. Con un solo origen sirviendo el CDN entero, sobra. (Su cabecera decía
  que el CMS lo vigilaba con un `FileSystemWatcher`; se comprobó y **el CMS nunca
  implementó eso**.)
- Los flags `--element=`, `--framework=` y `--skip-runtime` → hoy son `--solo=`,
  nada, y nada: el runtime se construye solo si falta.

### Lo que se AÑADIÓ en la misma tanda

`test:tools`, `test:angular`, `size:check`, `size:baseline`, `humo:cdn`. Ver la
tabla de gates en `CLAUDE.md`.

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
