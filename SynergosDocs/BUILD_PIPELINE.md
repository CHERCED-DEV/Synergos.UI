# Pipeline de build

> Post-purga de Nx (2026-08-04). El pipeline entero es cuatro scripts de Node y
> cero orquestadores: `build.mjs` → `build-runtime.mjs` → `publish.mjs` → `build-cdn.mjs`.
> Los ficheros son la documentación de detalle — este doc es el mapa.

## Referencia rápida

| Tarea | Comando |
|---|---|
| Build completo (vitals + elementos + runtime) | `npm run build` |
| Los 136 elementos + libs, AOT completo | `npm run build:angular` (~26 s) |
| Watch incremental (reusa el programa del compilador) | `npm run dev` desde `platforms/angular/` |
| Solo unos elementos | `node tools/build.mjs --solo=badge,hero` desde `platforms/angular/` |
| Runtime compartido (Angular + sg-core + sg-shared) | `npm run build:runtime` |
| Simular el runtime sin escribir | `npm run build:runtime:dry` |
| Armar `public/` completo para el CDN | `npm run build:cdn` |
| Gate de contratos (antes de todo publish) | `npm run contracts:validate` |
| Publicar al CDN | `npm run publish:cdn` |
| Release interactivo | `npm run release:cdn` |

---

## 1. El build de elementos — `platforms/angular/tools/build.mjs`

### Por qué existe

Con Nx, cada uno de los 136 elementos era una "application" independiente:
136 arranques del compilador de Angular, 136 type-checks del mismo grafo de
libs, con el caché de Nx además deshabilitado (`cache: false` +
`--skip-nx-cache` — Nx solo aportaba `--parallel=6`). El build tardaba minutos
y murió por timeout en el primer build de Cloudflare. El trabajo real —compilar
~625 ficheros TS— es de segundos; lo que se pagaba era el arranque multiplicado.

### Cómo funciona

`build.mjs` invierte la ecuación — todo pasa UNA vez:

1. **Sass vía `transformResource`** — el mismo gancho que usa el builder oficial:
   cada `styleUrl` y cada bloque `styles:` inline sale como CSS plano insertado
   en el componente. Los tokens se resuelven desde `vitals/core-assets/src`.
2. **UN `NgtscProgram`** con los 136 `main.ts` + las libs → un solo type-check,
   una sola compilación de templates, **AOT completo**. Las libs `core` y
   `shared` salen de este mismo build (adiós ng-packagr y sus declaraciones
   parciales que obligaban a compilar JIT en el navegador).
3. **UN esbuild** con 136 entradas → `dist/<nombre>/browser/main.js`, con los
   externals de `cdn.config.mjs` como bare imports para el import-map.

Resultado medido: **26 segundos** el build completo. `badge` salió en
**1845 bytes, idéntico** al build viejo — el layout de salida es el mismo a
propósito, así `tools/publish.mjs` y todo lo que viene después no se enteran
del cambio.

### Descubrimiento por filesystem

No hay lista de proyectos: **cada carpeta bajo `platforms/angular/apps/` con un
`src/main.ts` es un elemento**, y el nombre de la carpeta es su nombre en
`dist/`. (Se verificó contra los 136 `project.json` antes de borrarlos:
`outputPath` era `dist/<nombre-de-carpeta>` en el 100 % de los casos.) Dos
carpetas con el mismo nombre rompen el build a propósito.

### Flags

```bash
node tools/build.mjs              # build completo
node tools/build.mjs --watch      # incremental: recompila al guardar, reusa el programa
node tools/build.mjs --solo=badge,hero   # solo esos elementos (dev)
```

---

## 2. Los externals del CDN — `platforms/angular/cdn.config.mjs`

La lista de lo que un elemento **NUNCA empaqueta** y resuelve el import-map:
`@angular/*`, `rxjs`, `@synergos/core`, `@synergos/shared`. Por eso un elemento
publicado pesa ~2 KB y veinte elementos en una página comparten UN solo Angular.

Vivía enterrada en el `nx.json` (`targetDefaults` → `externalDependencies`);
ahora es un fichero propio porque es un **contrato del navegador**, no una
opción de un build tool. Añadir una entrada exige tocar `tools/build-runtime.mjs`
(el bundle que la sirve) y `buildImportMap()` ahí mismo. Quitar una es peor:
los elementos ya publicados siguen haciendo el bare import y el navegador no
tiene de dónde resolverlo.

Las libs `rendering`, `integrations`, etc. se empaquetan DENTRO de cada elemento
que las usa (`BUNDLED_SYNERGOS`) — compartirlas por import-map acoplaría el
despliegue de todos los elementos al de una lib.

---

## 3. El runtime compartido — `tools/build-runtime.mjs`

Produce `dist/runtime/angular/<version>/`: los módulos `ng-*.js` (core,
rxjs-interop, primitives, compiler, common, common-http, elements, forms,
platform-browser, router), `rxjs.js`, `sg-core.js`, `sg-shared.js` y el
`import-map.json` listo para inyectar en el `<head>` (con `__BASE_URL__` a
reemplazar).

### El linker de Angular (lo nuevo)

Los paquetes `@angular/*` de npm vienen en compilación parcial (formato APF):
declaraciones `ɵɵngDeclare*` que alguien tiene que terminar de compilar. El
script ahora les pasa el **linker de Angular** (vía `@babel/core` — por eso
`@babel/core` sigue en las devDeps del platform) al empaquetar: las
declaraciones se resuelven en build y el navegador no compila nada.

Consecuencias medidas:

- **El navegador YA NO descarga `ng-compiler.js` (523 KB) en cada página.**
  Antes, cada bundle con declaraciones parciales lo arrastraba como fallback
  JIT. Sigue publicado en el import-map por si algún bundle viejo lo pide,
  pero ninguna página nueva lo toca.
- **`ngDevMode` se define a `false`** en el empaquetado. Sin esto, el runtime
  publicado inicializaba `ngDevMode` y **todo el CDN corría Angular en modo
  dev desde siempre** — contadores de perf y chequeos de debug en cada página.
  Lo destapó la purga al comparar tamaños contra el build nuevo.
- Tamaños: `sg-shared.js` **1,45 MB → 774 KB** · `ng-common.js` **93 → 78 KB** ·
  `storefront` **287 → 269 KB**.

`sg-core.js` y `sg-shared.js` se empaquetan desde las libs que compiló
`build.mjs` en AOT completo — correr `npm run build:angular` antes que
`build:runtime` (el orden que ya respeta `npm run build`).

---

## 4. Publicación — `tools/publish.mjs` (intacto)

El layout publicado NO cambió con la purga:

```
synergos/<name>/angular/
  <semver>/    → slot inmutable          } main.js + manifest.json + meta.json
  v<N>/        → slot estable por major  }   en cada slot
  latest/      → staging                 }
registry.json  → índice global de elementos publicados
contracts.json → contrato para el CI del CMS
```

- El campo `name` del `element-registry.json` gobierna la ruta CDN, no el tag.
- `publish.mjs` es el ÚNICO script que escribe al CDN.
- Gate antes de todo publish: `npm run contracts:validate`
  (`element:audit` + `manifest:validate` + `cms:validate` + `cms:sync:check` + `sync:tokens:check`).

---

## 5. El CDN servible — `tools/build-cdn.mjs` → `public/`

`npm run build:cdn` arma el directorio que Cloudflare va a servir: **vitals +
elementos + runtime + registry + catálogo**, todo en `public/`. No publica nada
nuevo — le cambia el destino a lo que `publish.mjs` ya producía hacia una
carpeta local. Cloudflare Workers lo sirve (`wrangler.jsonc` + `worker/index.js`).

El paso 0 del script instala las dependencias de la plataforma si faltan: la
raíz no es workspace de npm y un `npm ci` en la raíz deja
`platforms/angular/node_modules` vacío.

---

## 6. Tests

- **Angular: corren** (issue #1). El runner era el executor de Nx
  (`@angular/build:unit-test`); hoy es vitest sobre specs **compilados AOT** por
  `platforms/angular/tools/build-specs.mjs` — el mismo ngtsc que publica los
  elementos. No es preferencia de estilo: los signal inputs de Angular **no
  funcionan en JIT**, así que un transpilador al vuelo haría que los tests corran
  y mientan. `npm run test:angular` (~35 s).
- **Raíz: corren.** `npm run test:tools` ejecuta los gates de `tools/lib/` — sin
  SDK, sin red, < 1 s.
- `npm test` corre los dos. La cuarentena de `it.skip` está en **cero** y lo
  defiende `tools/lib/spec-quarantine.spec.mjs`.
- Lint: `npm run lint` desde `platforms/angular/` (eslint plano — conserva los
  prefijos `syn`/`sg`; los boundary-checks por tags murieron con Nx, ver
  `LLM.txt` §12 para qué los reemplaza).

---

## 7. Checklist de verificación tras un release

1. `public/synergos/<elemento>/angular/latest/main.js` existe
2. `manifest.json` del slot incluye el array `inputs`
3. `registry.json` tiene timestamp `generated` fresco
4. En el navegador: la página NO descarga `ng-compiler.js` (Network tab) —
   si lo descarga, el runtime se publicó sin el linker
5. `customElements.get('synergos-<x>')` devuelve el constructor en una página real
