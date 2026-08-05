# Synergos UI — Claude Code Project Config

## Governance
All code generation MUST follow `LLM.txt` in the workspace root.
Architecture documentation is in `SynergosDocs/` — read before generating code.

## El ticket va ANTES del código

**Nada se codifica sin ticket.** Se abre, se discute, y recién ahí se escribe. Hay un gate de CI
(`.github/workflows/ticket-first.yml`) que rechaza un PR sin issue referenciado — porque un
proceso escrito como prosa se olvida y uno que rompe el build se cumple.

**El umbral:** bloquea lo que cambia comportamiento, contrato o schema, y los defectos. Un typo o
un comentario se arregla con la etiqueta `sin-ticket` en el PR. Exigir ticket para todo es lo que
hace que la gente abra issues basura para saltar el gate.

**Lo que el ticket garantiza es que la conversación pasó antes que el código. Nada más.** No es
una autorización que haya que esperar por cada cosa que aparezca después, ni una unidad de
trabajo que haya que respetar hasta el final: si al codificar la HU resulta ser otra cosa, eso se
escribe en el ticket y se sigue.

Cuatro tipos en `.github/ISSUE_TEMPLATE/`:

- **🐛 Defecto** — y sobre todo *por qué los tests no lo vieron* y *qué mutación lo reproduce*.
- **✨ Evolutivo** — qué problema del negocio, dónde vive, qué rechaza, cómo sabemos que quedó bien.
- **🔧 Mejora** — y *por qué ahora y no después*.
- **🔍 Hallazgo** — encontré algo haciendo otra cosa.

> **La regla que hace que no estorbe:** lo que encontrás haciendo otra cosa se **anota y se
> sigue**, por defecto en un **comentario del ticket que ya está abierto** — no en uno nuevo. Un
> ticket nuevo es una espera nueva: alguien lo tiene que leer, refinar y aprobar.

| | |
|---|---|
| **Comentario en el ticket abierto** | una dificultad · una decisión tomada sobre la marcha · algo que no cumpliste y por qué |
| **Issue aparte** | otro puede tomarlo sin tocar lo tuyo · vive en otra área · se decidió NO hacerlo ahora y hay que poder encontrarlo en seis meses |

> **Y el trabajo se termina igual.** Encontrar algo no autoriza a entregar a medias: sube el PR
> completo con lo hallado anotado. Si de verdad hace falta un issue, se abre **después de subir,
> no en vez de**.

**Y lo que hace que el proyecto aprenda:** toda regla nueva se escribe en este fichero **en el
mismo commit que la enseñó**. Una sesión nueva arranca fría — lo que no esté acá, no existe.

Es el mismo proceso en los tres árboles: este repo, el CMS y las capacidades/orquestadores. Lo
que cambia por repo es la definición de hecho (ver `.github/pull_request_template.md`).

## MCP Servers (auto-loaded from .mcp.json)
- `angular-cli` → Angular CLI MCP (`npx @angular/cli mcp`)


## Workspace layout
```
platforms/angular/   → LA plataforma (Angular ~21, catálogo de 136 elementos)
  apps/              → elementos + experiences; cada carpeta con src/main.ts ES un elemento
  libs/              → core, shared (design system), core-assets, rendering, integrations
  tools/build.mjs    → EL build: un NgtscProgram + un esbuild — 136 elementos en ~26 s
  cdn.config.mjs     → externals del CDN (contrato del navegador; antes enterrado en nx.json)
vitals/              → paquetes agnósticos (consumidos via tsconfig paths)
  contracts/         → interfaces puras (element-registry.json, element-inputs.json)
  core/              → utilidades agnósticas, mappers, bridge protocol
  core-assets/       → tokens SCSS, mixins, tipografía (fuente de verdad)
tools/               → build-runtime, build-cdn, publish, catalog, validadores de contrato
public/              → salida de `npm run build:cdn` — lo que sirve Cloudflare Workers
worker/              → el Worker que sirve public/ (con wrangler.jsonc)
```

## Quick reference
- Stack: Angular ~21, TypeScript ~5.9, SCSS (Sass modules), esbuild + @angular/compiler-cli. **Sin Nx** — se purgó porque cada uno de los 136 elementos era una "application" independiente (136 arranques del compilador, caché deshabilitado) y el build moría por timeout; `build.mjs` compila UNA vez y termina en ~26 s.
- **Solo Angular publica elementos.** Las plataformas react/svelte/vanilla eran andamiaje sin elementos publicados y se eliminaron. El contrato del CDN conserva el segmento `/angular/` en las rutas y `FrameworkKind` sigue existiendo — reintroducir otra plataforma es posible, pero hoy no existe ninguna.
- Build: `npm run build:angular` (26 s). Desde `platforms/angular/`: `npm run dev` (watch incremental) o `node tools/build.mjs --solo=badge,hero`.
- **Ciclo editor→navegador**: `npm run dev:cdn [-- --solo=badge]` (issue #2). Sirve el layout COMPLETO del CDN desde el watch, sin pasar por `build:cdn`. El CMS lo consume con su cliente HTTP de siempre — `SYNERGOS_CDN_MODE=Http` + `SYNERGOS_CDN_URL=http://localhost:4321` — o sea cero código de desarrollo del lado del CMS.
  - No copia nada: **traduce la ruta y lee de `dist/`**, así que no hay sync que se quede a medias.
  - Sirve `no-store` a propósito: imitar la caché de producción en desarrollo es enseñar el bundle de hace media hora. Las cabeceras reales las vigila `tools/humo-cdn.mjs` contra la URL pública.
  - Tocar `libs/` **rehace el runtime** (~3,4 s): `@synergos/core` y `@synergos/shared` son externals, no están en el bundle del elemento. Sin ese eslabón, editar el design system no se ve y el build dice «✓ al día».
- Runtime compartido: `tools/build-runtime.mjs` pasa el **linker de Angular** (via @babel/core) sobre los @angular/* de npm — el navegador ya no descarga ng-compiler.js (523 KB) y `ngDevMode` queda en false (el runtime publicado corría Angular en modo dev desde siempre). sg-shared: 1,45 MB → 774 KB.
- Tests Angular: **vivos** (issue #1). `npm test` en la raíz corre los dos: los gates de `tools/lib` y los specs de la plataforma, **con la cuarentena en cero** — y eso no es una foto, lo defiende `spec-quarantine`. Los specs se **compilan AOT** antes de correr (`platforms/angular/tools/build-specs.mjs`, ~35 s) con el mismo ngtsc que publica los elementos.
  - **Los signal inputs de Angular NO funcionan en JIT.** `componentRef.setInput()` no llega nunca al `input()`: devuelve el valor por defecto, en silencio. Como `LLM.txt` prohíbe `@Input()`, cualquier transpilador al vuelo (incluido `@analogjs/vite-plugin-angular`) hace que los tests **corran y mientan**. Por eso hay un paso de compilación y no un plugin de Vite.

- Aliases agnósticos: `@synergos/contracts`, `@synergos/core` (desde `vitals/`)
- Aliases Angular: `@synergos/core` → `libs/core/`, `@synergos/shared` → `libs/shared/`, etc.
- Component prefix: `syn-`
- State: `signal()` only — no BehaviorSubject, no Zone.js
- Build output: CDN deployment (no local wwwroot)
- Full rules: see `LLM.txt`

## Los gates, y qué vigila cada uno

Todos corren con `npm test` (los de `tools/lib`, sin SDK ni red) o con su comando.
**Cada uno se escribió viéndolo fallar primero** — un gate que nadie vio en rojo no
está vigilando nada.

| gate | vigila | se ve fallar si… |
|---|---|---|
| `cdn-cache-policy` | qué puede llevar `immutable` | pones caché larga en una ruta que se mueve |
| `cdn-runtime-check` | que el runtime esté antes que quien lo necesita | se publica el runtime después de los elementos (#7) |
| `cdn-size-budget` | techo por tier + trinquete 2× contra la última medida | un external se empaqueta dentro de un elemento (#8) |
| `cdn-smoke` | que el humo apunte **hacia afuera** | alguien le pone `localhost` por defecto (#9) |
| `dev-cdn-routes` | que dev imite el layout del CDN publicado | el dev server se desvía del contrato (#2) |
| `spec-quarantine` | que los `it.skip` sean **0** y cada uno lleve motivo | aparece un skip sin justificar (#1) |
| `template-bindings` | `[algo]="… \|\| null"` en plantillas | vuelve el `id="null"` (#11) |

Comandos que no cuelgan de `npm test`:

```bash
npm run contracts:validate    # sync:tokens · element:audit · manifest · cms:validate · cms:sync:check
npm run size:check            # el presupuesto contra public/ (corre solo dentro de build:cdn)
npm run size:baseline         # regenera el registro de tamaños — el diff va en el commit que lo causó
npm run humo:cdn -- <url> [--sha <commit>]   # contra la URL PÚBLICA, nunca contra sí mismo
```

En CI: `tests-ui.yml` (npm test), `humo-cdn.yml` (espera a que el CDN sirva EL commit
de ese push antes de comprobarlo) y `design-gates-ui.yml` (G-1/G-2/G-5, con checkout
del CMS sibling — que es público, así que **sin `token:`**, ver #14).

**Dos reglas que costaron caro y no se deducen leyendo el código:**

1. **`[attr.foo]` y no `[foo]` cuando el valor puede ser `null`.** `[id]="x() || null"` es
   property binding: no quita el atributo, escribe la cadena `"null"`. Sólo `[attr.…]`,
   `[class.…]` y `[style.…]` lo eliminan. Lo vigila `template-bindings` (#11).
2. **`cms-sync` ADIVINA el tier de lo que no conoce.** Si un `elementSyn*` nuevo no está en
   `TIER_BY_NAME`, le pone `composition` y **sobreescribe** el del registry. Como el
   presupuesto de tamaño elige el techo por tier, eso degrada un `module` de 72 KB a
   44 KB en silencio. Antes de correr `cms:sync`, mirá los WARN (#3).
