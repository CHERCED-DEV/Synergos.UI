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
platforms/angular/   → la plataforma GRANDE (Angular ~21; 127 fuentes con src/main.ts)
  apps/              → elementos + experiences; cada carpeta con src/main.ts ES un elemento
  libs/              → SIETE: core · shared (design system) · rendering · integrations
                       · shells · shop · transaction-engine. core-assets NO está acá:
                       vive en vitals/ (abajo), y el alias apunta ahí.
  tools/build.mjs    → EL build: un NgtscProgram + un esbuild — las 127 en ~26 s
  cdn.config.mjs     → externals del CDN (contrato del navegador; antes enterrado en nx.json)
platforms/preact/    → la SEGUNDA plataforma (#64). UN elemento —`badge`—, publicado y
                       servido. Existe para sostenerlo, no al revés: su build es un
                       esbuild de 30 líneas, sin compilador de framework.
vitals/              → paquetes agnósticos (consumidos via tsconfig paths)
  contracts/         → interfaces puras (element-registry.json, element-inputs.json)
  core/              → utilidades agnósticas, mappers, bridge protocol,
                       inputs/ (los normalizadores de lo que emite el CMS, #63)
  core-assets/       → tokens SCSS, mixins, tipografía — EL SHARED DE ESTILOS
tools/               → build-runtime, build-cdn, publish, catalog, validadores de contrato
public/              → salida de `npm run build:cdn` — lo que sirve Cloudflare Workers
worker/              → SÓLO `index.js`, el Worker que pone las cabeceras. El
                       `wrangler.jsonc` vive en la RAÍZ, no acá: esta línea
                       decía «(con wrangler.jsonc)» y manda a buscarlo donde no
                       está (#74)
```

## Quick reference
- Stack: Angular ~21, TypeScript ~5.9, SCSS (Sass modules), esbuild + @angular/compiler-cli. **Sin Nx** — se purgó porque cada elemento era una "application" independiente (un arranque del compilador cada uno, caché deshabilitado) y el build moría por timeout; `build.mjs` compila UNA vez y termina en ~26 s.
- **Toda la documentación, medida** (épica #40): qué afirma cada fichero que el disco desmiente, dónde se contradicen entre sí, y qué le falta a quien entra hoy — `SynergosDocs/MEDICION_DOCUMENTACION.md`. Se escribió porque `LLM.txt`, que este fichero y `AGENTS.md` declaran autoridad, afirmaba que los tests de Angular estaban «SUSPENDIDOS» mientras corrían 1.580 en verde.
- **Las cifras, medidas y no recordadas** (#42): **127** carpetas bajo `apps/` con `src/main.ts` (lo que el build compila) y **132** entradas en `element-registry.json` (lo que el CMS puede colocar). No son la misma cuenta y nunca lo fueron: seis entradas comparten el `synergos-text-block`, dos no las construye nada —`stat-counter` y `module-mount`— y tres fuentes son hosts deprecados que no están en el registry. Este fichero decía «136» en tres sitios, que no es ninguna de las dos.
- **Desde #64 publican DOS: `angular` y `preact`.** Esta línea decía «solo Angular publica elementos», y era cierta: las plataformas react/svelte/vanilla eran andamiaje sin elementos publicados y se eliminaron el 2026-08-04 por eso mismo. Hoy `platforms/preact/` publica **un** elemento —`badge`, el mismo que Angular— y está declarado como escaparate en `SHOWCASE_MULTIPLATAFORMA` con su razón y su fecha de retirada.
  - **El número que compró esa plataforma**, medido sobre el CDN construido, de una página con UN badge y comprimido: **215.615 B gz en Angular contra 10.888 en Preact — 19,8×**. Con su asterisco, porque sin él miente: 82.189 de los de Angular son `sg-shared.js` (55 componentes) contra 2.120 del de Preact (uno). Runtime contra runtime son **123.056 contra 7.701**, o sea 16×.
  - **Cuál de las dos sirve el CMS lo decide `BundleRegistry:DefaultFramework`**, que es global: con `preact`, el badge sale de Preact y los otros 129 siguen saliendo de Angular, porque un elemento sin implementación en el framework pedido cae al que tiene. Verificado con el cliente real contra el CDN construido.
  - El resto de esta línea sigue en pie: **el contrato del CDN conserva el segmento de framework** en las rutas y `FrameworkKind` sigue existiendo. El contrato del CDN conserva el segmento de framework en las rutas y `FrameworkKind` sigue existiendo — reintroducir otra plataforma es posible, pero hoy no existe ninguna. **Y desde #44 el pipeline ya no lo da por hecho**: la lista se deriva del disco (`tools/lib/frameworks.mjs`), los dos gates —presupuesto de tamaño y humo— recorren lo publicado en vez de pedir `/angular/`, y no queda ningún default silencioso. Lo que sigue nombrando a Angular a propósito está censado, con su razón, en `tools/lib/frameworks.spec.mjs`.
- **Lo PRIMERO en un clon limpio: `npm run setup`** (#70). `npm ci` en la raíz **no instala las plataformas** —no hay `workspaces`, y `platforms/angular` y `platforms/preact` tienen cada uno su `package.json` y su `package-lock.json`—, así que hacen falta **tres** instalaciones. Medido el 2026-09-16 clonando en limpio: `npm ci` + `npm test` moría con `Cannot find module 'sass'` y una traza de `ngtsc.mjs` que no sugiere en ningún momento que falte instalar. El `setup` que existía decía `npm install --prefix platforms/angular` **a mano** y olvidó `preact` el día que #64 lo creó — la regla 25 en el camino de entrada. Hoy la lista se deriva del disco y `pretest`/`prebuild` la comprueban antes de arrancar, así que el mensaje dice qué teclear. Hay gate.
- Build: `npm run build:angular` (19 s) · `npm run build:preact` (0,2 s) · `npm run build` los hace los dos más los runtimes. Desde `platforms/angular/`: `npm run dev` (watch incremental) o `node tools/build.mjs --solo=badge,hero`.
- **Verlo en el navegador**: `npm run dev:cdn` y abrir **`/probar`** — el banco (#49). `/probar/<elemento>` monta ESE elemento con su import map, su bundle y valores de muestra, y recarga al compilar. Es lo único del repo que hace que un elemento se vea: `GET /` es el catálogo, tarjetas informativas con **cero** `<script type="module">`. Medido: se podía compilar, publicar y servir un elemento sin tener nunca cómo mirarlo.
  - **No es una vista previa del producto** y la página lo dice: no hay tema del CMS ni contenido real. Un banco que se confunde con la realidad hace que alguien apruebe un diseño contra un fondo que no existe.
- **Ciclo editor→navegador**: `npm run dev:cdn [-- --solo=badge]` (issue #2). Sirve el layout COMPLETO del CDN desde el watch, sin pasar por `build:cdn`. El CMS lo consume con su cliente HTTP de siempre — o sea cero código de desarrollo del lado del CMS.
  - ⚠️ **Y las variables que esta línea decía NO funcionan fuera de compose.** Decía `SYNERGOS_CDN_MODE=Http` + `SYNERGOS_CDN_URL=…`, y esos nombres **sólo existen dentro de `compose.yml`**, que los traduce a claves de configuración de .NET. Con un `dotnet run` normal no los lee nadie y no se queja nadie. Lo que funciona es `Synergos__BundleRegistry__Mode=Http` + `Synergos__BundleRegistry__PublicBaseUrl=http://localhost:4321`.
  - **Medido el 2026-09-16 con la misma portada, cambiando sólo el nombre**: con las claves buenas, 21.595 bytes y un import map de 23 entradas; con las de esta línea, 19.785 bytes y **el import map ausente**. Las dos sirven la página con sus `<synergos-*>` y la segunda **no hidrata nada** — el defecto CMS #126 provocado por una línea de documentación. Lo caza `Synergos.CMS/tools/humo-conectado.mjs`, y el camino entero está en `Synergos.CMS.Web/docs/onboarding/arrancar-los-dos-arboles.md`.
  - No copia nada: **traduce la ruta y lee de `dist/`**, así que no hay sync que se quede a medias.
  - Sirve `no-store` a propósito: imitar la caché de producción en desarrollo es enseñar el bundle de hace media hora. Las cabeceras reales las vigila `tools/humo-cdn.mjs` contra la URL pública.
  - Tocar `libs/` **rehace el runtime** (~3,4 s): `@synergos/core` y `@synergos/shared` son externals, no están en el bundle del elemento. Sin ese eslabón, editar el design system no se ve y el build dice «✓ al día».
- Runtime compartido: `tools/build-runtime.mjs` pasa el **linker de Angular** (via @babel/core) sobre los @angular/* de npm — el navegador ya no descarga ng-compiler.js (523 KB) y `ngDevMode` queda en false (el runtime publicado corría Angular en modo dev desde siempre). sg-shared: 1,45 MB → 774 KB.
- Tests: `npm test` en la raíz corre **cinco** — `test:contratos` (los TRES gates de contrato que no necesitan al hermano ni la red), `test:tools` (los gates de `tools/lib`, sin SDK ni red), `test:vitals` (la capa agnóstica), `test:angular` y `test:preact`, **con la cuarentena en cero**, y eso no es una foto: lo defiende `spec-quarantine`. Hoy: **456 + 50 + 1.541 + 8**, y el primero **no tiene una sola cifra verdadera**: `indice-publicado.spec.mjs` cierra su último test con `it.runIf(existsSync(public/index.html))`, y `public/` está en el `.gitignore` — o sea que son **456 en un clon limpio y 457 con el CDN construido**. Decía 415, que no es ninguna de las dos. Lo que va escrito acá es la de CI, porque `tests-ui.yml` no construye el CDN; el `+1` no es deuda, es un test que se salta cuando no hay artefacto que mirar. (Los 6 de Angular son los de «mis visitas», #73; de `tools`, 16 son del #74 —el cruce humo↔despliegue y el censo de `platforms/<literal>` en los workflows— y **27 del #76**: los vectores de oro de la hipoteca y el cruce de los clientes sin llamador.)
  - **`test:contratos` es nuevo y la razón es que no los corría NADIE** (#74). `contracts:validate` sólo se teclea a mano y ningún workflow lo lanzaba, así que por ese hueco vivieron dos defectos del contrato de plataforma: la obligación 3 fallando para **todas** —el llamador fabricaba la plataforma sin su `entrada`, medido 0 fuentes contra 127— y la 8 acusando a Preact de no tener adaptador teniéndolo, porque el recorrido filtraba `/\.(ts|mjs|js)$/` y el suyo es `.tsx`. Los otros tres del encadenado piden `SYNERGOS_CMS_PATH` y corren en el despliegue; **eso es una cobertura que hoy está detrás de las credenciales**, y va dicho en vez de insinuar que el encadenado entero corre. **El tercero lo añadió #76**: `gate:clientes`, que cruza los métodos públicos de los diez clientes HTTP contra sus llamadores y no necesita nada de afuera. Su hermano `gate:hipoteca` **no** está acá y no es olvido: necesita el repo del CMS —los vectores viven en su `docs/contracts/`— así que vive en `design-gates-ui.yml`, que sí lo chequea, y lo que corre en `npm test` es su LÓGICA (`tools/lib/vectores-hipoteca.spec.mjs`).
  - **El tercero nació con #63**, cuando los normalizadores del CMS bajaron a `vitals` **con sus specs**. Sin él, correr 50 tests de funciones puras exigiría arrancar el compilador AOT de Angular — justo el acople que la frontera existe para cortar, y lo primero con lo que tropezaría la segunda plataforma.
  - **Las cifras, y la cuenta cuadra**: Angular pasó de 240 ficheros / 1.585 tests a **236 / 1.535** (hoy 1.541), y los 50 que faltan son exactamente los **4 ficheros / 50 tests** que hoy corren en `test:vitals`. Una suite que adelgaza sin que la resta cuadre es una suite que perdió algo.
  - Los specs de Angular se **compilan AOT** antes de correr (`platforms/angular/tools/build-specs.mjs`, ~21 s) con el mismo ngtsc que publica los elementos. Los de `vitals` no: son funciones puras y vitest los transpila al vuelo sin riesgo, porque ahí no hay signal inputs que mentir.
  - `test:vitals` usa `--dir vitals` y **no** `vitest run vitals`: lo segundo es un filtro de substring, que es el defecto que ya contó de más dos veces (ver el aviso de `test:tools` más abajo).
  - **Los signal inputs de Angular NO funcionan en JIT.** `componentRef.setInput()` no llega nunca al `input()`: devuelve el valor por defecto, en silencio. Como `LLM.txt` prohíbe `@Input()`, cualquier transpilador al vuelo (incluido `@analogjs/vite-plugin-angular`) hace que los tests **corran y mientan**. Por eso hay un paso de compilación y no un plugin de Vite.

- **La frontera `vitals/` ↔ `<framework>/shared`**: cada framework tiene su propio `shared`, escrito en su propio lenguaje, y todos se alimentan de `vitals`. En `vitals` va el MODELO de lo que emite el CMS, el MAPPER que lo traduce, el PROTOCOLO del bridge y el VOCABULARIO; no va nada que renderice, toque el DOM o tenga estado reactivo de un framework. Escrita en `SynergosDocs/WHERE_DOES_THIS_GO.md` §1 y en `LLM.txt` §2; medida en `SynergosDocs/FRONTERA_VITALS.md`; vigilada por el gate `vitals-purity`. **Y qué hace falta para que exista la segunda plataforma está medido en `SynergosDocs/MEDICION_SEGUNDA_PLATAFORMA.md`** (épica #37): las **ocho** obligaciones de una plataforma, el coste contado de un elemento duplicado (**~64 líneas**, con el SCSS reusado verbatim), el piso de peso de hoy (**≈209 KB transferidos** en una página con un solo badge) y el hallazgo que la bloqueaba — publicar el segundo runtime con los specifiers de entonces **apagaba el sitio entero**, cerrado en #58; ver la regla 26.
- Aliases agnósticos (`tsconfig.base.json`): `@synergos/contracts`, `@synergos/core`, `@synergos/core-assets` — los tres a `vitals/`.
- Aliases Angular (`platforms/angular/tsconfig.json`, **once**): `@synergos/core` → `libs/core/` **pisando el agnóstico**, que queda como `@synergos/vitals-core`; más `shared`, `rendering`, `integrations`, `shells`, `shop`, `transaction-engine`, y `contracts` / `core-assets` que siguen yendo a `vitals/`. El undécimo es `@synergos/vitals-core/inputs` (#63).
  - ⚠️ **Esa tabla está escrita TRES veces** —`tsconfig.json`, `vitest.config.ts` y `tools/build.mjs`— y las tres tienen que decir lo mismo. Nada las cruza hoy; lo que hay es que una desviación se ve al primer `npm test`, porque la de vitest la ejercitan 1.535 specs.
  - ⚠️ **Y el subcamino va ANTES que su raíz en las tres.** El alias casa por PREFIJO y en orden, así que con el raíz delante `@synergos/vitals-core/inputs` se reescribe a `…/index.js/inputs` y no resuelve. Costó 236 ficheros de spec en rojo, y el comentario que yo mismo había escrito al lado afirmaba lo contrario («vite resuelve por clave exacta»): documentación por delante del código, en el mismo commit que la introducía (#63).
- Tiers del design system (`libs/shared/src/components/`): `primitives/` (23) · `compositions/` (16) · `patterns/` (12) · `states/` (4).
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
| `platform-contract` | las **ocho obligaciones** de una plataforma, nombradas una por una — y **dice cuáles NO mide** (la 4 a medias y la 6 entera, con quién sí las mide). La 8ª es `ElementProtocol`: un adaptador que lo implementa **y que sea el único que registra** | se crea `platforms/react/` a medias y el build pasa como si nada, o un elemento vuelve a llamar a `customElements.define` por su cuenta (#62) |
| `cdn-runtime-check` | que el runtime de CADA framework que publicó elementos esté antes que ellos | se publica el runtime después de los elementos (#7), o se publican los de una plataforma sin el suyo (#61) |
| `cdn-size-budget` | techo por tier + trinquete 2× contra la última medida, **y que lo que se mudó al runtime lo importe quien lo tiene ahora** | un external se empaqueta dentro de un elemento (#8), o `sg-core.js` deja de importar lo que #62 le pasó (#64) |
| `cdn-smoke` | que el humo apunte **hacia afuera** | alguien le pone `localhost` por defecto (#9) |
| `humo-tras-desplegar` | que un humo que ESPERA un commit cuelgue de quien lo publica, y que quien publica corra el humo — cruzando los `.github/workflows/*.yml` entre sí, con los comentarios quitados | vuelve un `git rev-parse` alimentando `--sha` en un workflow que no despliega (#74), o se publica sin comprobar (#9) |
| `clientes-sin-llamador` | que todo método público de un `*-api.client.ts` tenga quien lo llame — y **un spec NO cuenta** | se deja un método cuyo único llamador es su propio spec, o el censo sigue declarando sin llamador a uno que ya lo tiene (#76) |
| `css-parity` | que toda regla CSS de una app tenga quien la emita | una app cambia markup propio por una pieza del catálogo y su CSS se queda (#23) |
| `dev-cdn-routes` | que dev imite el layout del CDN publicado | el dev server se desvía del contrato (#2) |
| `frameworks` | **tres** censos, tres preguntas (el tercero, `.github/workflows/`, lo dejó nombrado el #71 y lo escribió el #74 después de tropezar con su caso exacto) (y en #64 `publish-runtime.mjs` se movió de «específica de Angular» a «ciega», que es cómo se usa el censo): que ninguna herramienta de `tools/` resuelva el framework a un literal, que **nadie de `tools/lib` cablee `platforms/<algo>`** sin declararlo (los `.spec.mjs` incluidos, #60), y que `platforms/*` y `PLATFORMS` nombren a los mismos | alguien vuelve a escribir `join(CDN, el, 'angular', …)`, aparece `platforms/react/` que el pipeline no ve (#44), un gate neutral mira sólo `platforms/angular/` (#60), o un workflow filtra por `platforms/angular/**` y un cambio de la otra plataforma no dispara ni un test (#74) |
| `mapa-del-runtime` | que los import maps publicados se puedan COMPONER: mismo specifier con URLs distintas, un framework declarando el nombre agnóstico de otro, y el dueño retirando su alias o publicándolo sin gemelo | se publica el segundo runtime con los specifiers de hoy y el CMS se queda sin mapa (#58) |
| `normalizador-unico` | que **una sola** declaración de cada normalizador del CMS exista, y que viva en `vitals/` — por NOMBRE de función exportada, derivado del disco | alguien copia `config-input.util.ts` al `shared` del segundo framework, aunque le ponga otro nombre de fichero y otra carpeta (#63) |
| `indice-publicado` | que el `index.html` del CDN salga del registry de HOY, y que lo declarado sin construir lleve su marca | se vuelve a copiar un `catalog.html` congelado en vez de regenerarlo (#48) |
| `interactive` | que el CLI descubra lo que el build compila, y que **vacío sea un fallo** y no un menú en blanco | alguien vuelve a descubrir por `project.json` —o por cualquier cosa que pueda dar cero sin quejarse— (#52) |
| `banco-de-pruebas` | que el banco emita las TRES cosas —mapa resuelto, módulo y tag— o ninguna, y que su ruta viva fuera de `/synergos/` | se sirve el import map de `dist/` sin sustituir `__BASE_URL__` (#49) |
| `spec-quarantine` | que los `it.skip` sean **0** y cada uno lleve motivo | aparece un skip sin justificar (#1) |
| `rutas-hermanas` | que el CMS se busque igual desde las dos herramientas que lo necesitan, y que ninguna lectura caiga por defecto a una ruta de una sola máquina | `cms-sync` vuelve a ignorar `SYNERGOS_CMS_PATH`, o alguien escribe otro default `C:\LOCAL_CDN` de lectura (#57) |
| `setup-completo` | que el camino de ENTRADA instale cada plataforma, derivada del disco, y que `pretest`/`prebuild` lo comprueben | se crea `platforms/<algo>` y `npm run setup` sigue nombrando las de antes, o alguien quita el gancho y vuelve el `MODULE_NOT_FOUND` (#70) |
| `shell-cta-tokens` | que el acento de un shell sea SÓLIDO, no un lavado | vuelve `state-brand-surface` a un CTA (#25) |
| `template-bindings` | `[algo]="… \|\| null"` en plantillas | vuelve el `id="null"` (#11) |
| `vectores-hipoteca` | que las DOS implementaciones de la cuota —la de acá y la del C# detrás de `POST /api/realty/mortgage`— den el mismo número al centavo, contra los vectores de oro del CMS | alguien vuelve a confundir la unidad de la tasa (porcentaje ↔ fracción), que valía 90,8× (#76 · CMS#167) |
| `vitals-purity` | que `vitals/` no importe nada fuera de la capa agnóstica | se mete un import de framework —o una fuga relativa a `platforms/`— en `vitals/` (#36) |

> ⚠️ **`npm run test:tools` contaba de más, y la cifra llegó a dos cierres de ticket.** Su comando
> —`npx vitest run tools/lib`— pasa un **filtro de substring**, no un directorio, así que también
> casaba `.claude/worktrees/agent-<id>/tools/lib/*.spec.mjs`: las copias que deja un agente al
> trabajar en un worktree. Medido en el clon primario: **20 specs reales y 22 copias**, reportadas
> como 41 ficheros. Hoy hay `vitest.config.ts` en la raíz que excluye `.claude/**`.
>
> **Y la cifra era lo de menos.** Vitest estaba ejecutando **código duplicado y viejo como si fuera
> del proyecto**: un spec borrado del árbol seguiría «pasando» desde una copia, y uno arreglado
> convive con su versión rota dando las dos por buenas. Un verde que sale de código que no está en
> el repo no dice nada sobre el repo. `.claude/*` está en `.gitignore`, pero vitest no mira el
> gitignore para descubrir tests.

> ⚠️ **`check-size-budget` NO corre en `npm test`, y por eso el CDN llevaba semanas rojo sin
> que nadie lo supiera** (#68). Vive dentro de `build:cdn`; entre #62 y #64 nadie lo corrió y
> seis verticales se habían pasado de su techo. Es la forma del CMS #128 —un gate que no se
> dispara en el cambio que lo necesita no falla, se *salta*— con el agravante de que acá ni
> aparece como «skipped»: no lo invoca nadie.
>
> Los techos se resubieron el 2026-09-16 **después de medir qué entró**, que es la mitad que
> hace legítima una excepción: lo que entró es `libs/shells`, el **38-65 %** de cada bundle
> vertical. Y eso contesta con datos la parte de #65 que preguntaba si `shells` debería ser un
> external — **no**: le hablan diez elementos y los diez son verticales; empaquetado cada uno
> carga sólo lo que usa (109-263 KB) y compartido una página cargaría la unión (~420 KB)
> aunque lleve un solo vertical. Una página del producto lleva UN vertical.

Comandos que no cuelgan de `npm test`:

```bash
npm run contracts:validate    # sync:tokens · element:audit · manifest · gate:clientes · gate:hipoteca · cms:validate · cms:sync:check
npm run gate:hipoteca         # los vectores de oro de la hipoteca (necesita el CMS; acepta --cms-path)
npm run gate:clientes         # métodos públicos de los clientes HTTP ↔ sus llamadores (sin hermano ni red)
npm run size:check            # el presupuesto contra public/ (corre solo dentro de build:cdn)
npm run size:baseline         # regenera el registro de tamaños — el diff va en el commit que lo causó
npm run humo:cdn -- <url> [--sha <commit>]   # contra la URL PÚBLICA, nunca contra sí mismo
```

En CI: `tests-ui.yml` (npm test), `despliegue-cdn.yml` (construye, publica con
`wrangler deploy` y **corre el humo esperando ese commit**) y `design-gates-ui.yml`
(G-1/G-2/G-5 **y G-9**, con checkout del CMS sibling — que es público, así que **sin `token:`**,
ver #14). `humo-cdn.yml` queda a pedido (`workflow_dispatch`), para mirar el CDN
cuando se sospecha algo.

> ⚠️ **El despliegue SE SALTA SOLO mientras falten `CLOUDFLARE_API_TOKEN` y
> `CLOUDFLARE_ACCOUNT_ID`**, y lo dice en el resumen — es el patrón de `deploy.yml`
> del CMS esperando un VPS. Así que **hoy el CDN sigue publicándose a mano**
> (`npm run release`) y lo que hay arriba puede no ser lo que dice este repo:
> medido el 2026-09-22, servía un build del 12 con un commit que no está en
> ninguna rama. Al añadir las credenciales hay que **desconectar Workers Builds**
> si sigue enganchada: dos publicadores sobre el mismo Worker dejan sin saber
> cuál publicó lo que está arriba.
>
> **El paso a paso está en `SynergosDocs/DESPLIEGUE_CDN.md`** (#75), que es lo que
> faltaba: los dos nombres se mencionaban cuatro veces y ninguna decía qué permisos
> pide el token ni de dónde sale el account id — la forma de CMS #137, una dependencia
> obligatoria sin camino para obtenerla.

**Treinta y siete reglas que costaron caro y no se deducen leyendo el código** (eran 21 y la
cabecera decía «Veinte»: una lista numerada cuyo encabezado no se cuenta es la primera que
se desincroniza):

1. **`[attr.foo]` y no `[foo]` cuando el valor puede ser `null`.** `[id]="x() || null"` es
   property binding: no quita el atributo, escribe la cadena `"null"`. Sólo `[attr.…]`,
   `[class.…]` y `[style.…]` lo eliminan. Lo vigila `template-bindings` (#11).
2. **`cms-sync` ya NO adivina el tier — y lo que hacía antes explica por qué.** Si un
   `elementSyn*` nuevo no estaba en `TIER_BY_NAME`, le ponía `composition` y
   **sobreescribía** el del registry; como el presupuesto de tamaño elige el techo por tier,
   eso degradaba un `module` de 72 KB a 44 KB en silencio, y el WARN que lo decía no lo
   leía nadie (#3). Hoy el tier sale del registry o de la carpeta donde vive la fuente, y si
   ninguno de los dos contesta, el sync **se para sin escribir nada** — ver la regla 23, que
   es donde está el razonamiento y por qué `TIER_BY_NAME` resultó ser una copia (#43).
   **La forma sigue viva aunque el caso esté cerrado**: un sync que rellena lo que no sabe
   no corrige deriva, la mete.
3. **`state-brand-surface` NO es un acento: es un lavado.** Con alpha del 8-18 % según el
   tema, así que un CTA pintado con él y tinta `text-on-brand` (= blanco en los claros) da
   **1,07:1 en silverGold y 1,16:1 en light** — texto invisible, no «bajo contraste». El par
   sólido es `--syn-color-action-primary` / `--syn-color-action-primary-text`, definido siete
   veces, uno por tema, con la tinta invertida donde toca. **En desarrollo NO se ve**: el
   fallback Sass es sólido y sin el CSS del CMS el botón sale perfecto. Lo vigila
   `shell-cta-tokens` (#25).
4. **Degradar una LECTURA a mock no miente; degradar una ESCRITURA sí.** Un feed de ejemplo
   con su cartel no engaña a nadie; un «publicado» de ejemplo le dice a quien escribió que su
   texto está guardado cuando el servidor no tiene nada — y el llamador, que sólo recibía un
   `Post`, no podía distinguirlos. Publicar devuelve `persisted` y quien llama decide (#26).
   El mismo criterio vale para **SH-6 y su borrador**: no emite `draftchange` al rehidratar,
   así que el espejo del dominio hay que sembrarlo a mano —y el effect que lo hace tiene que
   depender del BORRADOR, no de que el wizard exista, porque el orden entre los dos effects
   no está garantizado—.
5. **Un test que llama al MÉTODO no ve que falte el llamador.** `addCarToCart` existía y
   ninguna plantilla lo invocaba, así que el auto era inalcanzable; un spec que hiciera
   `component.addCarToCart(...)` pasaba en verde con el botón quitado. Cuando lo que se
   arregla es *que algo sea alcanzable*, el test pulsa el botón (#27).
6. **Una mutación cuyo BUILD falló no es una mutación.** Los specs se compilan AOT a
   `.test-out` y `vitest` corre ESE compilado: si el `build-specs` revienta y se silenció su
   salida, la mutación no se aplicó y el test pasa en **verde** — se lee como «el gate no
   vigila esto» cuando en realidad nunca se probó. Pasó dos veces en la #28. **Nunca mandar
   `build-specs` a `/dev/null` al mutar**, y desconfiar de una mutación que sale verde sin
   haber visto la línea `✓ N specs compilados`.
7. **Una mutación que no cambia el resultado NO prueba nada, aunque el gate esté bien.** Dos
   veces seguidas en la #30 y la #31 un spec pasó en **verde** con el defecto puesto, y en las dos
   la culpa era del FIXTURE, no de la regla: el mock de la cola de moderación ya venía con las
   reportadas primero, así que quitar el `sort` no cambiaba nada; y ordenar sólo por conteo de
   reportes daba el mismo orden que ordenar bien, porque una pendiente siempre vale 0. **El dato de
   prueba tiene que EXIGIR la regla**: llega desordenado, e incluye el caso que sólo la regla
   resuelve (una reportada con conteo 0, que el normalizador produce cuando el servidor no lo
   manda). Y el helper del spec cuenta como fixture: en la #30 leía el `<th>` entero y partía por
   `\n`, pero con `preserveWhitespaces: false` una fila con `hint` sale en UNA línea, así que
   `not.toContain('Administración')` pasaba siempre.
8. **`response.ok` no distingue un 201 de un 202.** Es cierto para todo 2xx, así que un borde que
   encola para revisión se lee como publicación: el acuse dice «ya está publicada» **y recarga la
   lista**, o sea enseña la prueba de que miente en la misma pantalla. Es la regla 4 aplicada al
   código de estado y no al cuerpo. Se mira `response.status` cuando la diferencia entre
   «guardado» y «aceptado» le cambia el significado al mensaje (#31).
9. **Un `catch` que degrada tapa que la llamada NUNCA funcionó.** La devolución de la Tienda
   mandaba `{ reason }` y el borde exige `{ lineId, reason }`, así que contestaba **400 siempre**
   — y no se notó en meses porque el `catch` inventaba un `claimId` y la pantalla decía «Reclamo
   abierto». El comprador se iba con un número que no existe en ninguna parte. Un fallo que
   ocurre el 100 % de las veces se ve igual que uno que no ocurre nunca, **si hay un mock
   detrás**. Por eso una ESCRITURA no degrada (regla 4) y por eso, al tocar un cliente,
   **se compara el cuerpo que se manda contra lo que el borde exige** — el `catch` no lo va a
   decir. Y el spec afirmaba el defecto con todas las letras («mock degradado → claim abierto»):
   un test que codifica el defecto convierte el arreglo en una regresión (#32).
10. **Un dato de ejemplo que NO PUEDE EXISTIR en producción hace verde un camino que en
   producción está cortado.** Los pedidos de ejemplo de la Tienda traían `status: 'delivered'` y
   `'shipped'`; el enum del CMS tiene **tres** valores —`Pending`, `Paid`, `Cancelled`— y ésos no
   están. El gate de la devolución pedía justo esos dos, así que contra un servidor real el botón
   **no aparecía nunca** y contra el mock sí. Es el primo de la regla 7: allá el fixture no exigía
   la regla, acá el fixture **describe un servidor que no existe**. Y la causa de fondo es que la
   UI le preguntaba al campo de al lado: `shipped`/`delivered` son **etapas del seguimiento**
   (`StubOrderTrackingService.ShopPipeline`), no estados del pedido. Al escribir un mock, los
   valores salen del **enum o del pipeline del backend**, no de lo que sonaría bien (#33).
11. **«No se puede desde este contenedor» se COMPRUEBA antes de decirlo.** Escribí cuatro veces
   —#29, #31, #32, #33— que el arreglo de fondo era C# y que acá no había SDK .NET, y aplacé el
   trabajo real mientras apilaba parches en la UI. Era falso: `dotnet-install.sh` lo instala en
   dos minutos (canal 10.0 — `global.json` pide 10.0.202 con `rollForward: latestFeature`), los
   tests además necesitan los **runtimes 8.0** (`--runtime dotnet` y `--runtime aspnetcore`,
   porque el SDK 10 sólo trae el suyo) y la suite del CMS corre entera. Un `dotnet test` sin el
   runtime **aborta y sale con código 0**, así que hay que leer la salida y no el código de
   salida. Si hace falta el otro árbol para arreglar algo bien, se instala y se arregla (#34).
12. **La paridad CSS va en las DOS direcciones, y la de vuelta se excluye por NAMESPACE.** El CMS
   exige que toda clase `syn-*` emitida tenga CSS (G-3); acá se exige que toda clase declarada
   tenga quien la emita. Al medirlo salieron **155** muertas —`__facet-*` de antes de SH-1,
   `__gallery-*` de antes de SH-2, `__confirm-*` de antes de SH-11—, o sea que cada vez que una
   app cambia markup propio por una pieza del catálogo su CSS se queda. Lo que **no** es obvio:
   tres apps estilan `syn-tabs__*` desde su propio SCSS y quien las emite es
   `libs/shared/.../tabs.ts`, así que la exención va por namespace `syn-` y no por lista — la
   próxima se llamará de otra manera. Y limpiar se hace **con el gate escrito y rojo**: quitar
   CSS a ojo es como se pierde un `:hover` sin que nada avise (#23).
13. **Un `effect` que tiene que avisar UNA vez depende del booleano, no del número.** Un
   `computed` que se recalcula cada segundo y sigue valiendo `true` **no vuelve a correr el
   efecto** —la igualdad de señales lo corta—, así que la bandera «ya avisé» que uno escribe
   por reflejo es código muerto: se puede quitar y nada se pone rojo. Leer ahí el número que
   sí cambia manda un aviso por segundo. Lo prueba el reloj del apartado de SH-12 (#22), y se
   comprobó de las dos formas: quitando la bandera (verde, o sea sobraba) y leyendo los
   segundos (rojo, o sea el spec sí tiene dientes).
14. **Degradar una lectura tampoco es inocente cuando lo que se lee es una PRUEBA.** La regla
   de que una LECTURA puede degradar a mock vale mientras lo leído sea **contenido**: un feed
   de ejemplo con su cartel no engaña a nadie. Un certificado, un acuse de recibo, un
   comprobante **no son contenido: son la prueba que alguien va a enseñarle a un tercero**, y
   ahí el cartel no viaja con el artefacto. Academy fabricaba `CERT-<random>` con una
   `verifyUrl` a un dominio que no existe cada vez que el GET fallaba —y fallaba **siempre**,
   porque el borde envuelve en `{ certificate }` y el normalizador leía la raíz—: el alumno
   completaba el curso, le daba a «Imprimir» y se llevaba un diploma que el
   `GET /academy/verify/{id}` del CMS no reconoce. El certificado REAL, sellado e
   infalsificable (ADR 0124), se descartaba. **El test lo llamaba «a verifiable mock»** —el
   nombre decía el defecto—. Si el fallback rellena un campo cuyo valor entero es ser cierto
   (un id firmado, una URL de verificación, un número de radicado), no es degradar: es
   fabricar. Sin dato → `null`, y que la pantalla lo diga (#35).
15. **Un fallback que se pide POR IDENTIDAD y acepta cualquier identidad no deja un hueco:
   pone el nombre correcto sobre el cuerpo equivocado.** Es el escalón de arriba de la regla
   14, y el peor de los dos: una prueba falsa (un diploma que no verifica) se descubre al
   enseñarla; una historia clínica equivocada **se ve perfecta**. `mockChart(id)` del EHR
   aceptaba **cualquier** id y devolvía `mockPatients()[0]` —María González, con sus
   tensiones, sus glicemias, «Hipertensión grado 1, Diabetes tipo 2 de novo» y sus recetas—
   **archivado bajo el id que se pidió**; `mockPortalHome(patientId)` hacía lo mismo con las
   **alergias**, y `mockHealthSummary()` ni miraba al paciente. `EhrController` es
   `[DevSeedOnly]`, así que fuera de desarrollo los 18 endpoints contestan 404 y ése era
   justamente el `catch` que corría: se abría la historia del paciente B y se leía la de A.
   **Una lista de alergias es aquello sobre lo que alguien decide qué recetar**, y el cartel
   de «datos de ejemplo» no viaja hasta esa decisión. Lo que sobrevive es la FORMA: el mismo
   `catch` habría tapado la caída de un EHR de verdad y habría seguido rellenando alergias.
   Sin dato → **nada, y que la pantalla lo diga**; y «sin datos» tiene que **verse distinto**
   de «no tiene» —decir que alguien no tiene alergias cuando no se pudo leer es el mismo
   defecto con otra cara—. Lo mismo vale para una clave que el borde deja de emitir: una
   sección vacía sin explicación miente igual que un «al día». Y el sitio donde vive la
   diferencia es el TIPO: `readonly Immunization[] | null`, porque `[]` es una afirmación
   clínica y `null` es su ausencia; con `[]` por defecto, el normalizador vuelve a afirmar
   por su cuenta lo que nadie estableció (CHERCED-DEV/Synergos.CMS#106).
16. **Si TODOS los specs stubean la red para que falle, el sistema bajo prueba es el
   fallback.** Los ocho specs del EHR hacían `fetch → Promise.reject(...)` en su helper de
   arranque, incluido el que se llamaba «happy case»: **el único camino que se probaba era el
   que escondía el defecto de la regla 15**, y no había forma de ver que la ficha de B traía
   la historia de A porque nunca hubo una ficha de verdad con la que comparar. No se detecta
   leyendo el spec —pasa, y se lee como cobertura—; se detecta preguntando *qué respuesta da
   el doble de `fetch`*. Hace falta un servidor de mentira **con la forma del de verdad** y
   apagar por endpoint lo que cada test necesite ver caer; y se comprueba al revés: con el
   servidor entero caído, los specs del camino bueno tienen que ponerse ROJOS (acá 14 de 22).
   Es el complemento de la regla 10: allá el fixture describe un servidor que no existe, acá
   **no hay servidor ninguno** (CHERCED-DEV/Synergos.CMS#106).
17. **Un normalizador que confunde VACÍO con MALFORMADO deja el fallback como único
   camino del usuario que estrena la pantalla.** `normalizeLearning` devolvía `null`
   cuando las dos listas venían vacías —o sea cuando el servidor contestaba bien «no
   tienes matrículas»—, y el `catch` de arriba servía `mockLearning()`: el alumno
   **nuevo** era el único al que la respuesta correcta le llegaba vacía, así que era el
   único que veía tres cursos que no compró. Nadie lo reportó porque quien sí tiene
   cursos no pasa nunca por esa rama, y el cartel de «datos de ejemplo» llevaba tanto
   encendido que ya no lo leía nadie. **Vacío no es malformado**: se rechaza lo que no
   tiene la FORMA del contrato (`enrollments` que no es un array) y se acepta `[]`. Y el
   estado vacío se prueba con un servidor que **responda vacío** — es la regla 16 del
   lado del producto: si el único camino hasta «no hay nada» es el `catch`, «no hay
   nada» no existe. Dónde vive la diferencia sigue siendo el TIPO (regla 15): tres
   estados —`ok` · `anon` · `unreadable`— y no dos listas, porque **un 401 tampoco es un
   error que se pinte como hueco**: el borde toma al alumno de la sesión y a un invitado
   que ve cursos de ejemplo le estás diciendo que tiene matrículas
   (CHERCED-DEV/Synergos.CMS#102).
18. **Lo optimista se PINTA; lo que se guarda lo dice el servidor — y al reintentar
   hay que recordar qué parte ya pasó.** La regla 4 dice que una escritura no degrada;
   esto es lo que hay que hacer en la pantalla cuando falla, que no es la misma
   respuesta que para una lectura: una lectura ilegible se pinta como hueco y ya; una
   escritura que no llegó deja a alguien con el texto escrito y sin saber si existe.
   El piso es **no confirmar lo que no se guardó**, y sale de tres decisiones:
   (a) **el registro se escribe con lo que devolvió el servidor**, no antes — la nota
   SOAP entraba en la historia y luego se llamaba, así que un `POST` caído terminaba
   en la pantalla de siempre, con AVS y firma, y el expediente vacío;
   (b) **lo tecleado no se pierde** — el formulario se queda como está y el mensaje
   que no salió se queda en el hilo **marcado**, porque borrarlo se lleva lo que
   acaban de escribir y dejarlo sin marca es un acuse que nadie dio;
   (c) **un reintento no duplica** — cuando la operación son varios pasos (nota →
   receta → orden), se recuerda cuál ya se llevó el servidor y el mensaje nombra lo
   que SÍ quedó: decirle «no pudimos guardar la nota» a quien ya la tiene guardada le
   invita a escribir una segunda para la misma consulta, y un expediente clínico
   duplicado es daño propio, no «un botón de más».
   Y el caso que lo destapó es la regla 5 otra vez: `bookAppointment` **no tenía
   llamador**. La estrategia acuñaba el `CITA-<timestamp>` en local y contestaba
   `confirmed: true` sin tocar la red, así que el paciente salía con un comprobante
   que no existe en ninguna parte y se presentaba a una hora que el consultorio no
   tenía apartada. Confirmar es reservar EN EL SERVIDOR, y el comprobante es el que
   vuelve de allí. Para probar el apagón **parcial** —el único que alcanza una
   escritura, porque toda escritura va detrás de una lectura que funcionó— el
   servidor de mentira apaga por MÉTODO y ruta (`'POST /appointment'`), no sólo por
   ruta (CHERCED-DEV/Synergos.CMS#111).
19. **Un parámetro `fallback*` en una ESCRITURA es la fabricación escrita en la FIRMA
   — y se ve sin abrir el cuerpo del método.** `markComplete(apiBase, courseId,
   lessonId, fallbackPercent)` recibía del aula el porcentaje que el aula acababa de
   calcular en local y lo devolvía cuando el `POST` no llegaba: el alumno marcaba una
   lección, veía avanzar la barra, cerraba, volvía, y su avance no estaba. Es la regla
   18 otra vez, pero **el tell es distinto y es el más barato de todos**: cuando un
   método de escritura pide como PARÁMETRO lo mismo que promete DEVOLVER, el que decide
   el resultado es el llamador y el servidor es decoración. Se busca con un grep, no
   leyendo lógica.
   Dos corolarios que costaron sus mutaciones:
   (a) **el número del servidor tiene que ser uno que el llamador no pueda calcular**
   — el borde saca el porcentaje del currículum entero del expediente y el aula de las
   lecciones que tiene cargadas; si el fixture los hiciera coincidir, devolver el del
   servidor o el de casa daría el mismo verde;
   (b) **la operación INVERSA que el contrato no tiene tampoco se finge** —
   `POST /progress` sólo sabe MARCAR (`MarkLessonAsync`, no hay inversa), así que
   quitar la palomita en local dejaba la casilla vacía sobre un expediente donde la
   lección seguía completa: la misma mentira con el signo cambiado.
   Y el spec que lo tapaba era el «happy case» del ciclo entero: **completaba el curso
   con la red caída** y afirmaba `isCourseComplete()`, o sea codificaba el defecto
   (regla 9) sobre el camino que más se lee (CHERCED-DEV/Synergos.CMS#116).
20. **Un `confirm` que no recibe instrumento acaba con la base del borde CABLEADA, y
   el `catch` de al lado hace que no se note.** `search` y `pay` reciben `apiBase`;
   `confirm(session)` no recibe nada, así que las tres estrategias que cierran una
   compra —academy, storefront, eventos— tenían su `'/api/…'` escrito a mano. Un
   elemento montado contra otra base compraba en la suya y confirmaba en la de por
   defecto; **y no fallaba a la vista**, porque el cliente fabrica el acuse cuando el
   `POST` no llega (regla 9 sobre el paso que entrega la matrícula/la entrada/el
   pedido). Lo que falta va en la LÍNEA del carrito y no en un campo de la instancia:
   entre `pay` y `confirm` la página puede recargarse y la sesión sobrevive, el campo
   no. `travel-fulfillment.strategy` ya lo hacía bien —su `apiBaseOf(session)` era el
   patrón y nadie lo copió— (CHERCED-DEV/Synergos.CMS#116).
21. **Cuando una escritura son DOS pasos y el primero mueve dinero, «reintentar» tiene
   que acordarse de cuál ya pasó — y el gemelo de la regla 19 vive en el `catch`, no en
   la firma.** `enroll`/`confirm` de Educación fabricaban un `MOCK-<ts>` y un
   `ENR-<orderRef>` cuando el borde no contestaba: el alumno salía del asistente con un
   número de matrícula que no existe en ninguna parte, **y había pagado**. Es la cuarta
   de la familia —el `claimId` de la devolución (regla 9), el `CERT-<random>` (14), el
   `CITA-<timestamp>` (18)— y lo que añade es el REINTENTO: **quitar la fabricación sin
   tocar el asistente deja la otra mitad del daño**, porque volver a pulsar llamaba otra
   vez a `pay` y abría una segunda orden con su segundo cargo. Por eso el arreglo cruza
   SH-3 entero y no sólo el cliente.
   Tres cosas, y las tres costaron su mutación:
   (a) **lo que el servidor ya se llevó se lee de la SESIÓN, no de un campo de la
   instancia** (regla 20: entre `pay` y `confirm` la página puede recargarse), y se
   exige que el monto capturado siga siendo el total del carrito — si el carrito
   cambió, ese cobro ya no lo cubre y hay que volver a cobrar;
   (b) **el mensaje lo decide lo que QUEDÓ, no lo que falló**: «no pudimos completar la
   compra» dicho a quien acaba de pagar es una invitación a pagar dos veces, así que la
   copia se elige mirando si hay un cobro capturado y **nombra su referencia**;
   (c) **el paso que se repite tiene que ser el idempotente** — `POST /confirm` devuelve
   la matrícula sin recapturar, `POST /enroll` abre otra orden. Si del otro lado no hay
   un paso idempotente que repetir, lo que hay que arreglar es el borde.
   Y un hallazgo del camino, que es la regla 10 sobre el contrato en vez de sobre el
   fixture: **la rama GRATIS nunca pasa por `POST /confirm`** —`EnrollAsync` la activa
   en el acto— así que el `FREE-<ts>` que el normalizador se inventaba acababa
   pidiéndole al borde que confirmara una orden inexistente, 404, y el `catch` devolvía
   `ENR-FREE-<ts>`: **contra un servidor VIVO**, la matrícula gratis quedaba registrada
   de este lado con un id distinto del que el borde había emitido. Ningún spec que
   apague la red entera lo ve — hace falta el borde de mentira con la forma del de
   verdad, apagado **por método y ruta** (regla 16 + 18)
   (CHERCED-DEV/Synergos.CMS#117).
22. **Que la mutación obvia no COMPILE no significa que el gate sobre: significa que
   estaba apuntando al sitio equivocado.** Al escribir `vitals-purity` (épica #36) la
   mutación de manual era meter `import { signal } from '@angular/core'` en
   `vitals/core`. **No compila** —`TS2307`— y no por disciplina de nadie: `vitals/` no
   cuelga de `platforms/angular/`, así que la resolución de módulos sube hasta el
   `node_modules` de la raíz y ahí no hay ningún framework. El árbol ya lo impedía por
   su FORMA. La salida tentadora en ese punto son las dos malas: declarar el gate
   innecesario, o dejar escrito que «protege contra el import de Angular» —que es
   documentación por delante del código, y encima falsa—. La buena es preguntarse **qué
   defecto de la misma familia SÍ compila**, y ahí aparecieron los dos que importan, los
   dos con el build en verde y los dos **invisibles para un `grep '@angular' vitals/`**:
   una fuga RELATIVA (`import { ButtonComponent } from
   '../../../../platforms/angular/libs/shared/…/button'`, que mete un `@Component`
   entero en la capa agnóstica) y el `import('@' + 'angular/core')` con el especificador
   concatenado. **El import que hay que vigilar es el que NO lleva el nombre**, y por eso
   el criterio del gate es una lista blanca derivada del `tsconfig`, no una lista negra
   de nombres de framework: así `rxjs`, `zone.js` y el paquete del año que viene caen sin
   nombrarlos.
   Y el corolario, que es la regla 7 sobre el gate en vez de sobre el fixture: **el
   propio gate tuvo su hueco y lo destapó su spec, no leerlo**. Los dos cortes obvios
   para `import(...)` —«un literal entre paréntesis» y «lo que NO empieza por comilla»—
   dejan un agujero JUSTO ENTRE los dos: `'@' + 'angular/core'` empieza por comilla (la
   primera no dispara) y no termina en comilla+`)` (la segunda tampoco), así que el caso
   que el ticket nombraba con todas las letras pasaba en **verde**. Dos regex que se
   creen complementarias casi nunca lo son; se lee avanzando (#36).
23. **Una clave que el ARTEFACTO escribe y el contrato no declara está afirmando el valor
   por defecto de quien la lee — y lo afirma sin que nadie lo haya decidido.**
   `publish.mjs` escribe el framework en la ruta del CDN desde siempre
   (`synergos/<element>/<framework>/latest/`), `ElementFramework` y `FrameworkKind` ya
   existían como tipos… y `element-registry.json` —lo que el CMS lee— tenía cuatro claves
   y ninguna era ésa. Los 132 eran Angular **implícito**. Es
   `feedback_an_omitted_key_can_be_an_assertion` del repo hermano con una vuelta más: acá
   el valor por defecto ni siquiera estaba escrito, salía de que `PLATFORMS` tiene hoy un
   solo miembro, así que no se podía ni buscar con un grep.
   **La salida NO es poner `'angular'` por defecto**: eso es escribir la suposición en vez
   de medirla. Se mide del disco, con la misma fuente que usa el build — cada carpeta bajo
   `apps/` con un `src/main.ts`—, y salen 130 de 132.
   Tres cosas que costaron su mutación:
   (a) **lo que el disco no sabe se DECLARA con su razón al lado, y la tabla se vigila en
   los dos sentidos** — `stat-counter` y `module-mount` no los construye nada, así que su
   framework es una promesa y no un hecho; el día que alguien escriba la fuente, la
   excepción **sobra y rompe el build**, porque una excepción que sobra deja de leerse;
   (b) **una comprobación cableada dentro del publicador no se puede ver fallar** —
   `elegirPlataforma` vive en `tools/lib` justamente por eso, y su caso feo (el bundle
   construido en OTRA plataforma) hoy sólo existe en el spec, porque hay una sola
   plataforma: decirlo es más honesto que insinuar que está probado contra el disco;
   (c) **el segundo sitio donde estaba escrita la unión era el peligro real** — `FrameworkKind`
   y `ElementFramework` tenían los mismos cuatro valores y nada las cruzaba. Mientras el
   valor no viajaba, era feo; desde que viaja del registry al manifiesto y de ahí a la ruta
   del CDN, es una avería esperando.
   **Y la unión de tipos es lo que FABRICA la copia**: no se puede recorrer en tiempo de
   ejecución, así que el primero que necesita los valores —un type guard, un validador— se
   escribe el array al lado, y ese array ya no lo cruza nada. Por eso la LISTA es el valor
   (`ELEMENT_FRAMEWORKS`, `ELEMENT_TIERS`, `as const`) y el tipo se deriva de ella. Escribí
   yo mismo la copia antes de verlo (#42).
24. **Un contrato que no importa nadie no es un contrato: es un comentario con sintaxis.**
   `ElementManifest` declara la forma del `manifest.json` que va al CDN —el fichero que el
   CMS y las herramientas leen para saber qué expone un bundle— y **no lo importaba nadie**:
   sólo su propio `index.ts`. Quien lo ESCRIBE es `manifest-builder.mjs`, un `.mjs` sin
   tipos, así que renombrar una clave emitida compilaba y publicaba.
   **Y el lector existe, del otro lado de la red**: el CMS lo deserializa en
   `FileSystemBundleRegistryClient` y en `HttpBundleRegistryClient`, con una clase privada
   `ElementManifest` en **cada uno** —dos copias a mano de las siete claves— y resuelve
   `EntryScript` con `?? "main.js"`. O sea que una clave renombrada acá no deja un hueco: el
   CMS rellena el valor por defecto y sigue. **Nada se pone rojo en ninguno de los dos
   árboles**, que es la peor combinación posible. Es
   `feedback_contract_shape_needs_its_own_test`: lo que hay que vigilar es **la clave
   serializada**, y la mutación no es borrar el campo —en un `.mjs` eso no rompe nada— sino
   **renombrarlo**.
   **Lo que NO se hizo, y es la mitad que importa: el manifiesto no pasa a ser la fuente.**
   De sus siete claves no lleva una sola que no esté ya en el repo, así que declararlo
   fuente sería un quinto sitio con una copia — y una copia que vive en el CDN, o sea que un
   clon limpio no podría construir sin red. Lo que pasa a ser es **el embudo comprobado**:
   nada entra al registry ni sale al CDN sin producir un manifiesto que valide contra la
   interfaz, leída del `.ts` con `contract-schema.mjs`.
   Y el corolario que lo vuelve útil: **`cms-sync` dejó de adivinar el tier**. La regla 2 de
   esta lista describía el daño —le ponía `composition` a lo que no conocía y **sobreescribía
   el del registry**, degradando un `module` de 72 KB a 44 KB en silencio—; la causa era que
   `TIER_BY_NAME` era una **copia a mano** de un dato que ya estaba en el registry (90
   entradas, las 90 idénticas, comprobado). Hoy el tier sale del registry o de la carpeta en
   la que vive la fuente (`apps/elements/<tier>s/`), y cuando ninguno de los dos contesta
   **se para**: un elemento nuevo necesita que una persona decida si es un primitivo o una
   aplicación, y ese «no sé» no se rellena (#43).

25. **Un gate que resuelve a una constante una DIMENSIÓN de lo que mide no falla: se pone
   verde sobre el sitio equivocado.** `check-size-budget` pedía
   `<elemento>/angular/latest/main.js` y hacía `if (!existsSync(bundle)) continue;`: el
   bundle de un segundo framework no es que se pasara del techo — es que **nadie lo medía**,
   y el gate informaba «✓ todos dentro de presupuesto». `humo-cdn` hacía lo mismo con
   `/synergos/<el>/angular/…`: el humo de un despliegue con dos frameworks **certificaba
   uno**. Medido: diez de las doce herramientas de `tools/` lo cableaban y sólo dos lo
   tomaban como parámetro.
   **El tell, y se busca con un grep, no leyendo lógica:** un gate que construye la ruta de
   lo que mide en vez de RECORRERLA. Recorrer es lo único que encuentra un valor que nadie
   escribió en ningún sitio; preguntar por una ruta sólo confirma lo que ya se suponía.
   Es la regla 5 un piso más arriba —allá el método existía y nadie lo llamaba, acá el gate
   corre y mira a otro lado— y la misma figura de `cdn-smoke` (#9), con el agravante de que
   un humo contra `localhost` al menos no miente sobre QUÉ comprobó.
   Cuatro cosas que costaron su mutación:
   (a) **la lista se deriva del disco y son DOS listas, no una** — lo CONSTRUIBLE
   (`platforms/*/` con package.json) y lo PUBLICADO (el segmento de la ruta del CDN, o las
   `implementations` del registry). Un gate mide lo publicado: medir lo construible dejaría
   sin techo justo al bundle huérfano de una plataforma que ya no está;
   (b) **nunca un default a `'angular'`** — ni siquiera con una sola plataforma. Es
   `feedback_an_omitted_key_can_be_an_assertion` del repo hermano: `getArg('framework') ||
   'angular'` convertía una errata (`--framework=raect`) en «publicá Angular», callando;
   (c) **el `continue` que salta lo que no encuentra es el escondite** — una carpeta de
   elemento sin ningún bundle es un publish a medias y el gate la contaba como medida. Lo que
   no se mide se rechaza, no se salta;
   (d) **si el gate tiene varios rechazos en cadena, la mutación tiene que LLEGAR al que se
   quiere probar.** El fixture del ticket —`<el>/react/latest/main.js` gordo— disparaba
   primero «framework publicado que nadie construye» y nunca llegaba al techo: hizo falta
   crear también `platforms/react/package.json` para que react fuera construible y el rechazo
   del techo fuera el que hablara. Con un rechazo anterior tapando al de interés, la mutación
   sale roja y **no prueba lo que uno cree** (es la regla 7 con el fixture correcto y el
   camino equivocado) (#44).


26. **Un contrato entre dos árboles puede tener su REGLA en uno y su CAUSA en el otro — y el
   gate del árbol que la vigila no protege al árbol que la rompe.** El CMS compone UN import
   map juntando el de cada framework, y su regla es la correcta: el mismo specifier con URLs
   distintas **no se resuelve, se PARA** — devuelve `null`, no conserva el mapa anterior, y la
   vista no emite ningún `<script type="importmap">`. Sin mapa **nada hidrata**: 200, el SSR
   entero, y todo lo interactivo muerto (el defecto CMS #126).
   Y el import map que este repo publicaba declaraba `@synergos/core` y `@synergos/shared` —
   **nombres agnósticos con destinos específicos de Angular**—, así que el día que una segunda
   plataforma publicara lo obvio, el sitio se caía **entero, Angular incluido**, por un `publish`
   de acá. **Cerrado en #58**: Angular publica el alias heredado **y** su gemelo calificado
   (`@synergos/angular-core`) apuntando al MISMO fichero —así se deduplica— y toda plataforma
   nueva publica sólo el suyo. El censo con el motivo de cada alias, la tabla —que estaba
   escrita **dos veces**, en `build-runtime.mjs` y en `publish-runtime.mjs`— y el gate viven en
   `tools/lib/mapa-del-runtime.mjs`; el positivo de la convención se probó **del otro lado**
   (`La_convencion_del_repo_hermano_COMPONE_lo_que_este_test_ya_rechazaba`), que es donde vive
   la regla.
   **Lo que lo vuelve una regla y no una anécdota es que el test que lo prueba ya existe,
   verde, en el otro árbol, y su fixture es literalmente este caso** (`angular` y `react`
   peleándose `@synergos/core` en `ImportMapComposerTests`). El CMS anticipó la colisión **como
   regla** y nadie sacó la consecuencia, porque la consecuencia se escribe en el repo de al
   lado. Es el reparto de #48 y de CMS #126 otra vez: las dos mitades en verde y el hueco justo
   en medio.
   **El tell, para reconocerlo en otro sitio:** un artefacto que este repo PUBLICA y que el otro
   INTERPRETA con una regla que puede rechazarlo. La pregunta que lo caza —y se hace leyendo el
   test del otro árbol, no el código de éste— es **¿qué rechaza el que lee esto, y hay algo acá
   que impida producirlo?**
   Dos corolarios medidos:
   (a) **el mismo specifier con la MISMA URL no es conflicto, se deduplica** — así que la salida
   barata es publicar los dos nombres apuntando al mismo fichero mientras convivan, y no retirar
   nunca el viejo: los bundles ya publicados siguen haciendo el bare import;
   (b) **una excepción «legítimamente de X» caduca el día que hay dos X.** `cdn-runtime-check`
   preguntaba por `runtime/angular` y estaba en el censo de #44 con su razón escrita — correcta
   mientras hubiera una plataforma. Con dos, publicar elementos sin su runtime pasaba en verde:
   la regla 25 con la constante escondida dentro de una excepción justificada. **Cerrado en
   #61**, y lo que enseña es que una excepción del censo **no es una lista de las malas: es una
   con fecha de caducidad**, y la fecha la pone un hecho del disco, no una revisión. Por eso el
   movimiento entre las dos listas del censo va en el mismo commit que el código — el censo lo
   exige en los dos sentidos y el build se pone rojo si no.
   Y la forma del gate nuevo es la asimetría: **la pregunta no es «¿está el runtime de las
   plataformas construibles?» sino «¿tiene runtime cada framework que publicó ELEMENTOS?»**.
   Al revés daría rojo el día que alguien crea `platforms/react/` y antes de su primer publish,
   o sea exactamente cuando tiene que estar callado (#58, #61, #37).

27. **Lo que se habilita porque hace falta UNA vez, y que no es la forma normal de hacer las
   cosas, se DECLARA una por una — no se abre por bandera ni por convención de nombres.**
   ¿Puede un mismo elemento existir en dos frameworks a la vez? La respuesta fue *«sí podría,
   pero para qué; no deberíamos tener esas cosas así — dejémoslo habilitado para mostrar»*, y
   las dos mitades deciden el diseño. Se **habilita** porque la épica #37 no se contesta sin
   ello: el experimento es el MISMO `badge` en dos plataformas, midiendo los dos pisos de peso.
   Y **no se abre en general** porque un `badge` de React que fuera producto sería otro
   elemento, con su nombre y su DocType; lo que vive ahí es un escaparate.
   **Las tres formas de habilitarlo no son equivalentes**, y sólo una sobrevive a que alguien
   lo haga sin querer:
   (a) una **bandera** (`--permitir-duplicados`) la deja puesta quien la encendió una vez, y
   desde entonces el duplicado por accidente pasa callado — que era el defecto entero de #59;
   (b) una **convención de nombres** (`*.showcase/`) no obliga a escribir por qué, así que la
   razón se pierde y la excepción deja de leerse;
   (c) un **censo con su razón**, vigilado **en los dos sentidos** — sin declarar rompe, y
   declarado sobre algo que ya no está duplicado también rompe. Es la forma de
   `SIN_FUENTE_PROPIA` y de la lista de `HttpClient` del CMS, y es la única en la que el coste
   de hacerlo lo paga quien lo hace y no quien lo hereda.
   **Y el censo se deja VACÍO cuando todavía no aplica**, con un test que lo exige: hoy sólo
   hay una plataforma construible, así que una entrada ahí declararía un escaparate que no
   puede existir. La primera la escribe #64 junto con el elemento (#59).

28. **Un test que afirma el CONTENIDO de un censo no prueba que alguien lo LEA — y la
   mutación que importa pasa en verde.** Al bajar los normalizadores a `vitals` (#63) sus
   specs bajaron con ellos y nombran `vitest`, así que `vitals-purity` se puso rojo, con
   razón. La excepción se escribió como censo (regla 27) y el test que la acompañaba decía
   `expect(Object.keys(RUNNER_EN_SPECS)).toEqual(['vitest'])`. **Medido: cambiar la línea
   del gate por un `if (esSpec(abs)) continue;` —o sea apagar el barrido en TODOS los specs,
   que es justo lo que el censo existe para no hacer— dejaba los 21 tests en VERDE**, porque
   el censo seguía diciendo `['vitest']` mientras nadie lo leía.
   Es la regla 7 con el sujeto equivocado: el fixture estaba bien, lo que estaba mal era
   **qué función se ejercita**. Un censo es un dato; lo que hay que probar es el CRUCE que lo
   consume, y para eso hace falta un árbol en disco (`mkdtempSync` con la forma del repo:
   casa + un fichero fuera), no una aserción sobre la constante.
   **El tell, y sirve para cualquier censo del repo** —`SIN_FUENTE_PROPIA`,
   `RUTAS_DE_PLATAFORMA`, `ALIAS_HEREDADOS`, `SHOWCASE_MULTIPLATAFORMA`—: si el test importa
   la constante y no la función que la usa, la mutación que apaga la función pasa. Las tres
   mutaciones que sí valen son (a) ensanchar la excepción a todo el tipo de fichero,
   (b) quitarle la condición que la acota (acá `esSpec`), y (c) declarar una entrada que
   nadie usa — y las tres tienen que ponerse rojas por separado.
   Y el corolario sobre cuál de las dos salidas fáciles es peor: **excluir los `*.spec.ts`
   del barrido** apaga el gate donde alguien escribiría «para probarlo rápido» un
   `import { TestBed } from '@angular/core/testing'`; **poner `globals: true`** es peor
   todavía, porque el import desaparece de la vista y el gate se pone verde **porque no hay
   nada que leer**, no porque no haya dependencia (#63).

29. **`require.resolve()` devuelve el CommonJS, y una suite que aliasea el paquete de node
   no lo ve NUNCA.** El runtime de Preact se construía desde
   `createRequire(...).resolve('preact')`, que resuelve por la condición `require`. esbuild
   lo empaqueta con `format: 'esm'` envolviéndolo, así que el fichero publicado sale con
   **un solo export** y el navegador contesta *«does not provide an export named
   `render`»*: 200, el SSR entero, y **nada hidrata**.
   **Los 8 specs del elemento estaban en VERDE**, y no por casualidad: el `vitest.config.ts`
   de la plataforma resolvía `preact` a `node_modules/preact`, que sí tiene exports
   nombrados. O sea que lo que estaba bajo prueba **no era el artefacto publicado** — la
   regla 16 con el sujeto movido un piso: allá no había servidor, acá no había *bundle*.
   **Lo destapó Chromium**, exactamente como `humo-portada.mjs` destapó el `@using` que
   faltaba del lado del CMS: lo único que prueba que algo hidrata es pedir la página.
   Tres cortes:
   (a) **la entrada de navegador se LEE del `exports` del paquete** (`browser`, si no
   `import`), no se escribe `dist/preact.module.js` a mano — eso es una copia de un dato que
   el paquete ya publica y se desvía en la siguiente versión;
   (b) **el alias del runner apunta al runtime CONSTRUIDO**, no al paquete de node, o la
   suite sigue probando otra cosa. Mutado: con `require.resolve` puesto, 6 de 8 en rojo;
   (c) **el tell, y se busca con un grep**: un `require.resolve` dentro de un build que
   produce ESM. Si lo que se empaqueta va al navegador, `require` es la condición
   equivocada por definición (#64).

30. **Una tabla de alias se lee de ARRIBA ABAJO: casa por prefijo, no por clave exacta.**
   Con el raíz delante, `@synergos/vitals-core/inputs` se reescribe a
   `…/vitals-core/index.js/inputs` y `preact/jsx-runtime` a `…/preact.js/jsx-runtime`.
   **Pasó TRES veces en la misma épica** —el `vitest.config.ts` de Angular (236 ficheros de
   spec en rojo de golpe), su `build.mjs`, y el `vitest.config.ts` de Preact— y la primera
   vez escribí al lado un comentario afirmando lo contrario («vite resuelve por clave
   exacta»), o sea documentación por delante del código en el mismo commit que la
   introducía.
   Vale para vite/rollup y para el `alias` de esbuild, y tiene un primo que muerde en la
   otra dirección: **un `alias` PISA a `external`**. El specifier deja de ser bare, así que
   la lista de externals ya no lo ve y se empaqueta. El badge de Preact salió a **17.525 B**
   con el adaptador y el design system dentro — compilando, publicando y entrando en el
   techo de su tier: lo único que se rompía era «veinte elementos, UN runtime», en silencio.
   La regla práctica: **los subcaminos van antes que su raíz**, y **lo que se comparte no se
   aliasea** (#63, #64).

31. **Ningún test mide el camino de ENTRADA, así que hay que medirlo a mano — y el resultado
   fue que un clon limpio no arrancaba.** Medido el 2026-09-16: `git clone`, `npm ci`,
   `npm test` → `Error: Cannot find module 'sass'`, con una traza de
   `platforms/angular/tools/ngtsc.mjs` que no sugiere en ningún momento que falte instalar.
   `npm ci` en la raíz **no instala las plataformas**: no hay `workspaces`, y cada una tiene
   su `package.json` y su `package-lock.json`.
   **Y el script que existía para eso ya estaba desactualizado**:
   `npm install && npm install --prefix platforms/angular` — una lista a mano que olvidó
   `platforms/preact` el día que #64 lo creó, teniendo la lista derivada del disco
   (`frameworksConstruibles`) a dos importaciones de distancia. Es la **regla 25 aplicada al
   camino de entrada**: una dimensión de lo que se recorre resuelta a constante, y la
   tercera plataforma habría caído igual.
   Dos cosas que no se deducen del arreglo:
   (a) **un `setup` correcto que nadie invoque deja el `MODULE_NOT_FOUND` puesto**, así que
   lo que hay que probar no es que el script exista sino que `npm test` y `npm run build`
   PASEN por él — es el addendum #14 del repo hermano, medir que la pieza esté ENCHUFADA y
   no que exista, y por eso el gate lee `pretest`/`prebuild` del `package.json`;
   (b) **el fixture tiene que llevar una plataforma INSTALADA y otra que no**: con todas sin
   instalar, «devuelve todas» y «devuelve las que faltan» dan el mismo array y el defecto
   pasa en verde (regla 7).
   Es la **regla 11 del revés**: allí el error fue afirmar sin comprobar que algo no se
   podía hacer; acá fue dar por hecho que algo funcionaba sin haberlo hecho nunca desde
   cero. Lo único que lo destapa es clonar de verdad — igual que lo único que prueba que
   una página hidrata es pedirla (#70).

32. **Una bandeja que sólo escribe la sesión local se ve EXACTAMENTE igual que una que lee
   el servidor — y lo único que las distingue es recargar la página, que ningún spec hace.**
   La sección «Mis visitas» de realty estaba entera: su `syn-account-shell` con `[items]`, su
   fila, su detalle, su timeline de seguimiento y su badge. Lo único que la llenaba era
   `this.myVisits.update(...)` después del asistente, así que la bandeja vivía en la pestaña:
   se recargaba y desaparecía. El borde —`GET /api/realty/visits`, con su registro durable
   detrás— llevaba una HU entero esperando a que alguien lo llamara, y **el cliente de 1399
   líneas no tenía el método** (#73 · CHERCED-DEV/Synergos.CMS#158).
   **Lo que lo hace un defecto y no «una pantalla a medias» es el cartel**: vacía, la bandeja
   no deja un hueco, AFIRMA — `inboxEmptyMessage: 'Todavía no tienes visitas agendadas.'`. Es
   la regla 17 con el signo cambiado: allá el alumno nuevo veía cursos que no compró, acá quien
   agendó ayer ve el estado del que no agendó nunca.
   **El tell, y se busca con un grep sobre el componente, no leyendo lógica:** un `signal([])`
   que alimenta el `[items]` de un shell y cuyas ÚNICAS escrituras son handlers locales. Si no
   hay un `load*()` al lado, la pantalla no tiene de dónde sacar lo de ayer. Es la regla 5 un
   piso más arriba —allá el método existía y ningún botón lo llamaba, acá la pantalla entera
   existía y ningún método la llenaba—.
   **Y la mitad que ningún spec de este repo podía ver: no hay ninguno que recargue.** Un
   componente se construye una vez por test, así que «lo local» y «lo del servidor» son
   indistinguibles dentro de la suite. Lo que lo destapa es el servidor de mentira de la regla
   16 **con datos** —montar sin agendar nada y exigir que la bandeja traiga dos filas—, que es
   el mismo movimiento que allá: si el único camino hasta un estado es el `catch` (o el
   handler local), ese estado no existe.
   **Al cablearlo, tres respaldos que NO se escriben** y que son los tres el mismo error:
   el título no se compone con el id (`Inmueble L-4` se lee como un nombre), la hora no se
   recalcula con la agenda de hoy (se deriva del reloj: meses después daría una franja
   plausible y distinta de la que esa persona tiene apuntada), y **la modalidad no cae a
   `in-person`** — que es la que manda a cruzar la ciudad a quien pidió videollamada, y que el
   borde acababa de dejar de fabricar por su lado. Reponerla acá la devolvería **sin que nada
   en ninguno de los dos árboles lo señalara**: es el addendum #111 de
   `feedback_gethashcode_is_not_a_seed` del repo hermano, que ya avisaba de que un campo
   emitido con honestidad y leído con un default sigue mintiendo. Los tres viven en el TIPO
   (`BookedVisit`, con `| null`), no en el `??` del normalizador.
   **Y el fixture lleva DOS filas que no se parecen**: una con título, hora y `video`, y otra
   con los tres ausentes. Con dos completas, «pinta lo que llegó» y «rellena lo que falta» dan
   el mismo verde; y la que tiene modalidad la tiene en **`video`**, que es el valor que ningún
   default produce.
   **Medido de paso, y anotado en el ticket en vez de arreglado acá** (la regla del proceso:
   lo que se encuentra haciendo otra cosa se anota y se sigue): de los métodos públicos de los
   diez `*-api.client.ts`, **dos** no los llamaba nadie —`blogs::search`, que quedó al lado del
   `explore` que sí se usa, y `realty::mortgage`, que perdió su llamador cuando la hipoteca pasó
   a calcularse en local—. El gate sería trinquete absoluto y barato; lo que faltaba para
   escribirlo no era el cruce sino **decidir qué se hace con esos dos**, porque censarlos con «no
   los llama nadie» sería un ticket sin abrir disfrazado de excepción.
   > **Resuelto en #76, y la razón para no censarlos resultó más fuerte que la escrita: la
   > ausencia de llamador estaba ESCONDIENDO un defecto.** `realty::mortgage` apunta a un
   > endpoint público y vivo que contestaba una cuota **90,8×** alta, y borrarlo —la salida obvia
   > para «código muerto»— habría quitado lo único que en los dos árboles apunta ahí. Ver la
   > regla 36. `blogs::search` sí se quitó, con su spec re-apuntado a `explore`. Hoy el cruce lo
   > hace `clientes-sin-llamador`, con **uno** censado y su razón, y la cifra la deriva el gate
   > con su criterio escrito —**122** métodos públicos, sin `get`/`set` ni `private`— en vez del
   > 128 contado a mano de esta línea, cuyo criterio no estaba en ninguna parte.

33. **Un gate que espera algo que nadie produce no se lee como roto: se lee como que lo
   vigilado está roto — y su rojo permanente es lo que esconde el problema de verdad.**
   `humo-cdn.yml` corría en cada push a master, derivaba `git rev-parse --short HEAD` y
   exigía que el CDN sirviera ESE commit, con su cabecera afirmando «Cloudflare despliega
   en cada push a master». Medido el 2026-09-22: **ningún workflow de este repo
   publicaba**, y el CDN servía un build del **2026-09-12** con el commit `b951c77` — que
   no está en master, ni en el respaldo anterior a la refirma, ni en ninguna rama, o sea
   un `wrangler deploy` desde un árbol que nunca llegó a GitHub. El `--sha` no podía casar
   nunca: treinta intentos, cinco minutos, rojo, en cada push (#74).
   **Y el daño no fue el rojo.** El CDN estaba SANO —`humo-cdn.mjs` sin `--sha` pasa sus
   siete comprobaciones, caché, CORS, 404 y runtime incluidos— así que ese rojo era la
   ÚNICA señal de que llevaba diez días congelado, y estaba apagada por gritar siempre.
   Este repo ya tenía escrito dos veces que un gate siempre rojo deja de leerse (#68 y el
   `design-gates.yml` del CMS); lo que faltaba era la consecuencia: **lo que se pierde no
   es el gate, es lo que el gate era el único en poder decir.**
   **El tell, y se busca sin leer lógica:** un workflow que ESPERA un artefacto cuya
   producción no está en el repo. La pregunta es *¿quién produce esto que estoy esperando,
   y está acá?* — la misma de `feedback_a_key_the_app_reads_needs_a_path_from_whoever_sets_it`
   del repo hermano, con un artefacto en vez de una clave.
   **Las tres salidas malas, porque las tres son más baratas que la buena:** bajar
   `--intentos` hace que falle más rápido; borrarlo pierde el único gate que mira la URL
   pública con las cabeceras de verdad; y moverlo a `workflow_dispatch` y ya cambia un rojo
   permanente por **un gate que no corre nunca**, que es el issue #68 tal cual y encima
   calla la divergencia. La buena es **meter el despliegue al repo** y colgar el humo de
   él: ahí esperar un commit significa algo, porque acaba de publicarlo.
   **Y mientras falte la credencial, se SALTA con su razón escrita** —el patrón de
   `deploy.yml` del CMS esperando un VPS—: no se puede cerrar un defecto de «rojo
   permanente» con otro rojo permanente.
   Dos cosas que costaron su mutación:
   (a) **lo que se prohíbe no es `--sha`, es de dónde SALE.** Esperar un commit es
   legítimo —el borde de Cloudflare propaga con retraso y un humo inmediato da por buena la
   versión anterior—; lo que no lo es es que el workflow lo DERIVE solo, porque eso es
   afirmar por su cuenta qué debería haber arriba. De `inputs.sha` lo afirmó una persona;
   de `git rev-parse`, nadie.
   (b) **quitar los comentarios protege de un FALSO POSITIVO, no de un punto ciego**, y
   escribí lo contrario antes de medirlo. Hoy ningún token aparece sólo en prosa, así que
   apagar el barrido no cambia el cruce; lo que sí hace es que la cabecera que explica este
   defecto —y que este arreglo obliga a escribir— haga que el gate **acuse al fichero que lo
   está documentando**. Un gate que se pone rojo por su propia explicación enseña a
   ignorarlo, que es exactamente lo que vino a cerrar. Se conserva, y se dice cuál de las
   dos mitades sostiene el cruce.

34. **Nombrar un defecto en un comentario no lo arregla: lo BLINDA. Lo identificado la
   siguiente auditoría lo lee y pasa de largo.** Arreglando #74 aparecieron TRES defectos
   vivos del contrato de plataforma, y **dos de ellos estaban escritos, con todas las
   letras, por quien no los cerró**:
   (a) el `<remarks>` de `EXTENSIONES_DE_CODIGO` en `element-sources.mjs` describe el caso
   exacto —«"ninguna fuente implementa ElementProtocol", que es **falso**: la implementa y
   el gate no sabía mirarla… la regla 25 con la constante escondida en un filtro de
   extensiones»— y hasta escribió el helper (`esFuenteDeCodigo`) para cerrarlo. **Nadie lo
   enchufó**: `element-contract-audit.mjs` siguió con su `/\.(ts|mjs|js)$/`, así que la
   obligación 8 acusaba a Preact de no tener adaptador teniendo `preact-element.tsx`, que
   además lleva escrito que es el único de su plataforma que registra;
   (b) la entrada de #71 en este fichero dice que «el censo de `frameworks.spec.mjs` vigila
   `tools/`, no `.github/workflows/`. Un diente que recorra los workflows… cerraría la
   familia». No se escribió — y el defecto siguió vivo **en el mismo fichero que #71
   arregló**: le cambió el paso de dependencias para derivar las plataformas del disco y le
   dejó el `paths:` en `platforms/angular/**`, así que un cambio que tocara sólo
   `platforms/preact/` **no disparaba ni un test**.
   El tercero no estaba escrito y es el que más medía: el llamador de la obligación 3
   fabricaba la plataforma a mano —`{ framework, apps }` **sin `entrada`**— así que
   `todasLasFuentes` preguntaba por `<dir>/undefined` y descubría **0 fuentes contra 127**,
   fallando para TODAS las plataformas.
   **Los tres son la misma causa —una dimensión que #64 volvió variable y que quedó
   constante en tres sitios— y los tres fallaban RUIDOSAMENTE.** Lo que los mantuvo vivos
   no fue el silencio: fue que **`contracts:validate` no lo corría ningún workflow**. Un
   gate que grita donde nadie lo lanza es el #68 otra vez, y por eso el arreglo no es sólo
   el código: `element:audit` y `manifest:validate` entran a `npm test` (0,4 s, sin
   hermano y sin red).
   **La regla operativa, y es una sola línea:** si un comentario que estás escribiendo
   nombra un defecto vivo, o lo arreglás en el mismo commit o abrís el ticket. No hay una
   tercera opción que deje el comentario puesto — y menos si además escribiste el helper
   que lo cierra.
   Es `feedback_a_fabrication_can_be_a_derivation` del repo hermano, que ya lo tenía
   medido: un `<remarks>` que nombra un gemelo vivo se queda ahí una HU entera, porque la
   nota convierte el defecto en algo *identificado* y lo identificado no se vuelve a mirar.

35. **Un número que se calcula DOS veces, en dos lenguajes, no está vigilado por la frase que
   dice que las dos coinciden — y cuanto más autorizado el sitio donde está la frase, más
   aguanta siendo falsa.** `IMortgageCalculator` del CMS afirmaba en su `<remarks>`, en la
   interfaz dueña del cálculo, que «el cálculo base es el mismo en cliente y servidor». Era
   **falso desde que existe el endpoint**: `mortgage.calc.ts` y su gemelo en C# son la misma
   fórmula con la tasa a **100×** de distancia —acá porcentaje (`12`), allá fracción (`0.12`)—
   así que `POST /api/realty/mortgage` contestaba **240.000.000** al mes donde esta app pinta
   **2.642.606,72**. Factor 90,82: una cuota igual al capital entero, todos los meses, durante
   veinte años.
   Es la **regla 34 un escalón más arriba**: allá la nota nombraba un defecto y lo blindaba;
   acá afirma una PROPIEDAD, que camufla mejor todavía, porque se lee como una decisión de
   diseño que alguien comprobó. Y es la **regla 26** otra vez —la regla en un árbol y la causa
   en el otro— con los dos lados mal a la vez en vez de uno.
   **La mitad barata es peor que el defecto**, y por eso no se cierra moviendo la coma: mandar
   `0.12` sin tocar la calculadora local da **1.012.098** — 2,6× BAJO y *plausible*, con el
   respaldo de la página contradiciendo a su propio servidor en la misma pantalla (regla 15).
   **La unidad va en el NOMBRE del campo** (`annualRatePercent`) o no va: los dos gates de
   contrato del CMS cruzan por nombre de clave y por controller, así que `annualRate` ligaba y
   la unidad no la miraba nadie — G-7 además imprime `realty:mortgage` como «cuerpo construido
   por un helper, FUERA del cruce».
   **Lo que lo cierra es un VECTOR compartido que las dos EJECUTAN**, no una frase mejor
   escrita: `docs/contracts/mortgage-vectors.json` del CMS, cruzado acá por `gate:hipoteca` y
   allá por `HipotecaVectoresTests`. Cuatro cortes que costaron su mutación:
   (a) **las expectativas no salen de ninguna de las dos implementaciones** — se derivaron de
   la fórmula cerrada con decimales de 50 dígitos, porque un fixture sacado de una
   implementación es una FOTO: detecta que se separan, no que las dos están mal a la vez;
   (b) **el vector de tasa cero NO cubre la unidad**, porque ahí porcentaje y fracción dan el
   mismo número — medido, la mutación pone rojos 5 de 6, y el que no es ése;
   (c) **lo que NO se compara se dice** — los totales, porque las dos totalizan con métodos
   distintos y los dos son correctos (5 centavos sobre 634 millones); sin escribirlo, la
   primera corrida roja por esa diferencia legítima enseña a aflojar el gate;
   (d) **el gate COMPILA la fuente de verdad** (esbuild sobre el `.ts`) en vez de
   reimplementar la fórmula, que sería la tercera copia — y `esbuild` pasó a estar DECLARADO en
   el `package.json` de la raíz, porque estaba sólo hoisteado y un gate que depende de un
   binario que nadie declaró se cae el día que cambia otro paquete (#76 · CMS#167).

36. **Un método sin llamador no es código muerto que se borra: puede ser lo ÚNICO que apunta a
   un defecto vivo, y su destino lo decide lo que hay DETRÁS, no si alguien lo llama.** La
   regla 32 midió dos métodos públicos sin llamador y aplazó la decisión entre quitarlos y
   cablearlos. **Las dos salidas se equivocan para uno de los dos**: `realty::mortgage` apunta
   a un endpoint público y vivo que contestaba 90,8× alto (regla 35), y borrarlo habría quitado
   lo único que en los dos árboles apunta ahí. La ausencia de llamador no era el problema —
   **era el escondite**.
   **La pregunta que lo decide se contesta en dos minutos: ¿el endpoint EXISTE, y qué
   contesta?** Y hay que hacerla por método, porque los dos salieron distintos:
   `blogs::search` pedía `GET /api/blogs/search`, que **no existe ni existió** —su propio TODO
   lo decía y `explore` lo había reemplazado con el mismo normalizador y el mismo mock—, así que
   se quitó y su spec se re-apuntó; `realty::mortgage` pide una ruta que sí existe, y ahí lo que
   había que arreglar era el borde.
   **El que se queda necesita una razón que conteste «por qué NO se cablea»**, no «por qué no se
   cableó todavía» — lo segundo es un ticket sin abrir disfrazado de excepción. Acá la razón es
   de diseño: el spec §4 pone el cálculo base en el cliente, es una función pura, y meterle una
   ida a la red es el retroceso de `feedback_a_vertical_is_three_axes_and_only_one_crosses` del
   repo hermano. El sitio de aterrizaje está **entero** —`mortgageServerResult` con precedencia
   servidor-gana y los cuatro setters de input invalidándolo— así que lo único ausente es el
   disparador, y el disparador está escrito (spec §8: tasas de banco reales).
   **El tell, y se busca con un cruce y no leyendo:** un método público de un cliente cuyo único
   llamador es un `*.spec.*`. **Un spec NO cuenta como llamador** — el de `blogs::search`
   probaba el filtro de su mock con la red caída, o sea el mock y no el producto; contarlos
   habría dado 122 de 122 y cero hallazgos. Es la **regla 5** un piso más arriba: allá un test
   que llama al método no ve que falte el llamador, acá el gate no se deja convencer por ese
   test. Lo vigila `clientes-sin-llamador`, trinquete absoluto con **uno** censado (#76).

37. **Un helper que recibe el NOMBRE de la clave como argumento la esconde del gate que cruza
   las claves del contrato — y la salida cómoda es regenerar la línea base y perder la
   vigilancia para siempre.** Arreglando #76 cambié
   `readNumber(value['totalPaid']) || fallback.totalPaid` por
   `recibido('totalPaid', fallback.totalPaid)` —mejor semántica: presencia en vez de
   truthiness, para que un `0` legítimo del servidor no se reemplace— y G-6 reportó
   `[realty] el borde dejó de emitir 1 clave(s) que la app LEE: totalPaid`. **La app no había
   dejado de leerla: el gate ya no podía SABERLO**, porque detecta «qué lee la app» buscando el
   literal `value['<clave>']` en la fuente.
   Es `feedback_counting_mentions_of_a_type_measures_the_opposite_of_using_it` del repo hermano
   con el signo cambiado: allá la métrica contaba de más porque el sujeto nombraba el tipo sin
   usarlo, acá cuenta de menos porque el sujeto lo usa sin nombrarlo. **Los dos son el mismo
   tell: una métrica sobre código calculada buscando un nombre.**
   **Lo que NO se hace es regenerar la línea base**, que era un comando y salía verde: eso
   dejaría `principal` y `totalPaid` fuera de la vigilancia de G-6 para siempre, y la pérdida no
   se vería nunca porque el gate seguiría diciendo «ninguna se perdió». Se escribe el acceso con
   la clave literal y se deja dicho por qué, aunque el helper lea mejor — el gate es el
   consumidor de esa forma tanto como el compilador.
   **Y un dato medido de paso, sobre el límite que el CMS ya declara:** al emitir `principal` en
   `MortgageResponse`, la línea base de G-6 salió **byte-idéntica**. La clave ya «cruzaba» — por
   las filas de `MortgageScheduleDto` del MISMO controller, mientras faltaba en la raíz de la
   respuesta. Es el punto ciego que `CLAUDE.md` §7 del CMS describe («cruza por CONTROLLER
   ENTERO, no por endpoint»), ahora con un caso: **la clave que faltaba nunca dejó de cruzar, así
   que G-6 no podía cazar este defecto** (#76).
