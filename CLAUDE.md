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
platforms/angular/   → LA plataforma (Angular ~21; 127 fuentes con src/main.ts)
  apps/              → elementos + experiences; cada carpeta con src/main.ts ES un elemento
  libs/              → core, shared (design system), core-assets, rendering, integrations
  tools/build.mjs    → EL build: un NgtscProgram + un esbuild — las 127 en ~26 s
  cdn.config.mjs     → externals del CDN (contrato del navegador; antes enterrado en nx.json)
vitals/              → paquetes agnósticos (consumidos via tsconfig paths)
  contracts/         → interfaces puras (element-registry.json, element-inputs.json)
  core/              → utilidades agnósticas, mappers, bridge protocol
  core-assets/       → tokens SCSS, mixins, tipografía — EL SHARED DE ESTILOS
tools/               → build-runtime, build-cdn, publish, catalog, validadores de contrato
public/              → salida de `npm run build:cdn` — lo que sirve Cloudflare Workers
worker/              → el Worker que sirve public/ (con wrangler.jsonc)
```

## Quick reference
- Stack: Angular ~21, TypeScript ~5.9, SCSS (Sass modules), esbuild + @angular/compiler-cli. **Sin Nx** — se purgó porque cada elemento era una "application" independiente (un arranque del compilador cada uno, caché deshabilitado) y el build moría por timeout; `build.mjs` compila UNA vez y termina en ~26 s.
- **Las cifras, medidas y no recordadas** (#42): **127** carpetas bajo `apps/` con `src/main.ts` (lo que el build compila) y **132** entradas en `element-registry.json` (lo que el CMS puede colocar). No son la misma cuenta y nunca lo fueron: seis entradas comparten el `synergos-text-block`, dos no las construye nada —`stat-counter` y `module-mount`— y tres fuentes son hosts deprecados que no están en el registry. Este fichero decía «136» en tres sitios, que no es ninguna de las dos.
- **Solo Angular publica elementos.** Las plataformas react/svelte/vanilla eran andamiaje sin elementos publicados y se eliminaron. El contrato del CDN conserva el segmento de framework en las rutas y `FrameworkKind` sigue existiendo — reintroducir otra plataforma es posible, pero hoy no existe ninguna. **Y desde #44 el pipeline ya no lo da por hecho**: la lista se deriva del disco (`tools/lib/frameworks.mjs`), los dos gates —presupuesto de tamaño y humo— recorren lo publicado en vez de pedir `/angular/`, y no queda ningún default silencioso. Lo que sigue nombrando a Angular a propósito está censado, con su razón, en `tools/lib/frameworks.spec.mjs`.
- Build: `npm run build:angular` (26 s). Desde `platforms/angular/`: `npm run dev` (watch incremental) o `node tools/build.mjs --solo=badge,hero`.
- **Ciclo editor→navegador**: `npm run dev:cdn [-- --solo=badge]` (issue #2). Sirve el layout COMPLETO del CDN desde el watch, sin pasar por `build:cdn`. El CMS lo consume con su cliente HTTP de siempre — `SYNERGOS_CDN_MODE=Http` + `SYNERGOS_CDN_URL=http://localhost:4321` — o sea cero código de desarrollo del lado del CMS.
  - No copia nada: **traduce la ruta y lee de `dist/`**, así que no hay sync que se quede a medias.
  - Sirve `no-store` a propósito: imitar la caché de producción en desarrollo es enseñar el bundle de hace media hora. Las cabeceras reales las vigila `tools/humo-cdn.mjs` contra la URL pública.
  - Tocar `libs/` **rehace el runtime** (~3,4 s): `@synergos/core` y `@synergos/shared` son externals, no están en el bundle del elemento. Sin ese eslabón, editar el design system no se ve y el build dice «✓ al día».
- Runtime compartido: `tools/build-runtime.mjs` pasa el **linker de Angular** (via @babel/core) sobre los @angular/* de npm — el navegador ya no descarga ng-compiler.js (523 KB) y `ngDevMode` queda en false (el runtime publicado corría Angular en modo dev desde siempre). sg-shared: 1,45 MB → 774 KB.
- Tests Angular: **vivos** (issue #1). `npm test` en la raíz corre los dos: los gates de `tools/lib` y los specs de la plataforma, **con la cuarentena en cero** — y eso no es una foto, lo defiende `spec-quarantine`. Los specs se **compilan AOT** antes de correr (`platforms/angular/tools/build-specs.mjs`, ~35 s) con el mismo ngtsc que publica los elementos.
  - **Los signal inputs de Angular NO funcionan en JIT.** `componentRef.setInput()` no llega nunca al `input()`: devuelve el valor por defecto, en silencio. Como `LLM.txt` prohíbe `@Input()`, cualquier transpilador al vuelo (incluido `@analogjs/vite-plugin-angular`) hace que los tests **corran y mientan**. Por eso hay un paso de compilación y no un plugin de Vite.

- **La frontera `vitals/` ↔ `<framework>/shared`**: cada framework tiene su propio `shared`, escrito en su propio lenguaje, y todos se alimentan de `vitals`. En `vitals` va el MODELO de lo que emite el CMS, el MAPPER que lo traduce, el PROTOCOLO del bridge y el VOCABULARIO; no va nada que renderice, toque el DOM o tenga estado reactivo de un framework. Escrita en `SynergosDocs/WHERE_DOES_THIS_GO.md` §1 y en `LLM.txt` §2; medida en `SynergosDocs/FRONTERA_VITALS.md`; vigilada por el gate `vitals-purity`.
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
| `css-parity` | que toda regla CSS de una app tenga quien la emita | una app cambia markup propio por una pieza del catálogo y su CSS se queda (#23) |
| `dev-cdn-routes` | que dev imite el layout del CDN publicado | el dev server se desvía del contrato (#2) |
| `frameworks` | que ninguna herramienta de `tools/` resuelva el framework a un literal, y que `platforms/*` y `PLATFORMS` nombren a los mismos | alguien vuelve a escribir `join(CDN, el, 'angular', …)`, o aparece `platforms/react/` que el pipeline no ve (#44) |
| `spec-quarantine` | que los `it.skip` sean **0** y cada uno lleve motivo | aparece un skip sin justificar (#1) |
| `shell-cta-tokens` | que el acento de un shell sea SÓLIDO, no un lavado | vuelve `state-brand-surface` a un CTA (#25) |
| `template-bindings` | `[algo]="… \|\| null"` en plantillas | vuelve el `id="null"` (#11) |
| `vitals-purity` | que `vitals/` no importe nada fuera de la capa agnóstica | se mete un import de framework —o una fuga relativa a `platforms/`— en `vitals/` (#36) |

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

**Veinticinco reglas que costaron caro y no se deducen leyendo el código** (eran 21 y la
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
