# La segunda plataforma — medición, el hallazgo que la bloquea, y el despiece

Documento de la épica **#37** («Un shared por framework, en su propio lenguaje, y el
mismo contrato para los cuatro»). Su entrada es `SynergosDocs/FRONTERA_VITALS.md`
(épica #36), que midió **qué** de `libs/shared` es portable. Acá se mide lo otro:
**qué hace falta para que exista una segunda plataforma**, cuánto cuesta de verdad
un elemento duplicado, y qué se pondría rojo solo.

> Todo lo de abajo se midió contra el disco y contra la URL pública el
> **2026-09-15**. Donde la épica supone algo que el disco desmiente, está dicho.
> Las cifras que se pueden recalcular llevan el comando al lado; las que no
> —porque dependen de la red— llevan el mío y la fecha.

---

## 0. El resumen, para quien sólo lea esto

| | |
|---|---|
| **Lo que la épica suponía caro** | reescribir el design system en el segundo lenguaje |
| **Lo medido** | un elemento completo en React son **~64 líneas** (más **46 una vez por plataforma**), y su CSS se reusa **verbatim** — contra las **188** que tiene hoy el de Angular |
| **Lo que la épica no nombraba** | publicar el runtime del segundo framework **con los specifiers de hoy apaga el sitio entero**, Angular incluido |
| **Lo que ya está hecho y no hay que rehacer** | el techo de tamaño, el humo, el índice, el registry, el `<script>` del elemento y la composición del import map en el CMS |
| **Lo que nadie vigila todavía** | el runtime de la segunda plataforma, seis gates que recorren sólo `platforms/angular/`, y dos fuentes para un mismo elemento |
| **Lo que hay que no copiar** | `libs/core/src/models/` (16 ficheros fuera de todo compilador, tres que no resuelven) y `ElementProtocol`, que dice ser el contrato y no lo implementa nadie |

**El orden que sale de la medición no es el de la épica.** La épica pone primero
«escribir el contrato del wrapper» y luego «un elemento real». La medición dice que
antes de las dos va **el specifier del runtime compartido** (§3), porque es lo único
de esta lista que, hecho tarde, se lleva por delante lo que ya funciona.

---

## 1. Lo que hoy tiene `platforms/angular/`, pieza por pieza

Recorrido completo y clasificado. **(a)** obligatoria para cualquier plataforma ·
**(b)** específica de Angular · **(c)** derivable de lo que ya hay.

| pieza | líneas | clase | qué obliga de verdad |
|---|---|---|---|
| `package.json` | 37 | **(a)** | Es lo que hace a la carpeta *construible* (`frameworksConstruibles`). Sin él, `platforms/react/` es una carpeta que alguien dejó ahí. |
| `tsconfig.json` | 28 | **(a) + (b)** | Los `paths` son obligatorios (el árbol resuelve `@synergos/*` por alias); `angularCompilerOptions` es de Angular. |
| `cdn.config.mjs` | 61 | **(a)** | **El contrato del navegador**: qué NO se empaqueta. Cada plataforma necesita el suyo, y su contenido es distinto por definición. |
| `tools/build.mjs` | 271 | **(b)** | Un `NgtscProgram` + un esbuild. Lo único **(a)** de él es la salida: `dist/<elemento>/browser/main.js`, y eso ya es parametrizable — `PLATFORMS[].resolveBundlePath` lo declara por plataforma. |
| `tools/ngtsc.mjs` | 157 | **(b)** | El compilador de Angular. React no tiene equivalente: el JSX lo transforma el propio esbuild. |
| `tools/build-specs.mjs` | 107 | **(b)** | Existe **sólo** porque los *signal inputs* de Angular no funcionan en JIT. React no necesita este paso. |
| `tools/sync-tokens.mjs` | 493 | **(a) + (c)** | G-1 (el bridge de tokens) es **por plataforma** y hoy está cableado a `libs/shared/src/styles/_tokens-bridge.scss`. G-2 (el barrido anti-copias) ya recorre **todo** `.scss`/`.css` del repo: **ese ya cubre a React gratis**. |
| `vitest.config.ts` | 60 | **(a)** | Toda plataforma necesita correr sus specs; el *cómo* cambia. |
| `eslint.config.mjs` | 36 | **(b)** | |
| `libs/` (7) | ver §6 | mixto | |
| `apps/**/src/main.ts` | 127 ficheros | **(a)** | **La convención de descubrimiento**: `apps/**/src/main.ts`. Ver §5.2(e) — la extensión está cableada. |

### El contrato, entonces, son SIETE obligaciones — y hoy no está escrito en ninguna parte

1. `platforms/<nombre>/package.json` existe.
2. Hay una entrada en `PLATFORMS` (`tools/lib/synergos-config.mjs`) con `name`,
   `distDir`, `resolveBundlePath` y `elementDistDir`.
3. Las fuentes viven en `platforms/<nombre>/apps/**/src/main.<ext>`.
4. El build escribe donde `resolveBundlePath` promete.
5. Hay un `cdn.config.mjs` que declara sus externals.
6. Se publica un runtime en `synergos/runtime/<nombre>/<versión>/` **con su
   `import-map.json`**, y un puntero `latest/`.
7. Se traduce `vitals/core-assets` al lenguaje de estilos de la plataforma.

De las siete, **la 2 ya tiene gate en los dos sentidos** (`revisarPlataformas`, #44):
una carpeta que `PLATFORMS` no declara rompe el build, y una entrada sin carpeta
también. **Las otras seis no las comprueba nadie.**

> ### Y hay un señuelo en el árbol, que es justo lo que la HU 1 de la épica iba a escribir
>
> `vitals/core/src/bridge/element-protocol.ts` declara `ElementProtocol` —
> *«Interface that every framework must implement to register a Web Component»* —
> con `mount` / `update` / `destroy`.
>
> **No lo importa nadie.** Medido: `grep -rn "ElementProtocol" platforms/ vitals/`
> fuera de su propio fichero devuelve **cero**. Angular no lo implementa: usa
> `createCustomElement` de `@angular/elements` directo. O sea que el contrato que
> la épica quiere escribir **ya existe como texto y la única plataforma viva no lo
> honra** — la regla 24 del `CLAUDE.md` con todas las letras: *un contrato que no
> importa nadie no es un contrato, es un comentario con sintaxis*.
>
> Y traía además **la última copia a mano de la lista de frameworks** que el issue
> #42 vino a matar: `framework: 'angular' | 'react' | 'svelte' | 'vanilla'`
> escrito a pelo, en vez de `FrameworkKind`. #42 quitó la copia de
> `component-resolution.contract.ts` y **ésta no la vio nadie**, porque estaba en
> `vitals/core` y no en `vitals/contracts`. Medido: `grep` de la unión sobre
> `vitals/` y `platforms/angular/libs/` devuelve exactamente dos sitios, y uno es
> la declaración buena.

---

## 2. Lo que YA está hecho — confirmado, no asumido

| | estado | cómo se comprobó |
|---|---|---|
| El pipeline no cablea `angular` (#44) | ✔ | `frameworks.spec.mjs` censa las 39 herramientas de `tools/` (20 + 19 en `lib/`), en los dos sentidos |
| El techo de tamaño mide por framework | ✔ | `cdn-size-baseline.json` va indexado `<elemento>/<framework>` — 130 entradas, todas `angular` |
| El humo recorre lo publicado | ✔ | `frameworksDelRegistry` lee las `implementations` del registry servido |
| El índice sale del registry de hoy (#48) | ✔ | |
| El registry declara `framework` (#42) | ✔ | 132 entradas, las 132 lo llevan |
| El manifiesto es el embudo comprobado (#43) | ✔ | `validateManifest` cruza contra el `.ts` |
| El `<script>` del elemento es agnóstico (CMS #126) | ✔ | `DefaultSynHostEmitter` emite `<script src type="module" defer>`; la palabra *Framework* aparece una vez y es un comentario |
| El CMS **compone** el import map por framework (CMS #127) | ✔ | `ImportMapComposer.Componer` funde los mapas de todos los frameworks que el registry declara |
| La frontera `vitals` ↔ `shared` escrita y con gate (#36) | ✔ | `node tools/medir-frontera-shared.mjs` reproduce **8.804 líneas, suelo 1.649 (18,7 %), techo 1.755 (19,9 %)** — idéntico a lo publicado |

**Verificación del árbol, hoy:** `test:tools` 19 ficheros / **288 tests** (1 skip
declarado) · `test:angular` 239 ficheros / **1 580 tests** · `contracts:validate`
exit 0 · `validate-cms-contracts.mjs` exit 0 · `build:angular` **127 elementos en
20,8 s**.

> **Una cifra de #44 no reproduce, y va dicha porque la próxima auditoría la va a
> leer.** El cierre de #44 reporta «`test:tools` **39 ficheros / 578 tests**». Medido
> hoy en el mismo árbol: **19 ficheros / 288 tests**, y `git log` confirma que desde
> ese commit **no se borró ni un `.spec.mjs`**. El 39 es además engañosamente
> plausible —es exactamente el número de `.mjs` que el censo recorre (20 + 19)— y el
> 578 es el doble justo del real, que es la huella de una corrida que contó el
> proyecto dos veces. No hay nada roto —`CLAUDE.md` no cita esa cifra, y la que sí
> cita (1 580) cuadra— pero un número al doble en el cierre de un ticket es de los
> que alguien copia.

---

## 3. 🔴 El hallazgo que bloquea todo lo demás: publicar el segundo runtime APAGA el sitio

**Esto es lo que la épica no sabía, y cambia el orden del despiece.**

El CMS compone **un** import map juntando el de cada framework que el registry
declara (`HttpBundleRegistryClient.TryGetImportMapAsync` →
`ImportMapComposer.Componer`). Y tiene una regla, que es la correcta:

> **el mismo specifier apuntando a URLs distintas no se resuelve: se PARA.**
> `Componer` devuelve `(null, conflicto)`, `TryGetImportMapAsync` devuelve `null`
> — *y no conserva el mapa anterior, a propósito* — y `_SynHostRuntime.cshtml`
> **no emite ningún `<script type="importmap">`**.

Sin mapa, ningún `<synergos-*>` resuelve `@angular/core` y **nada hidrata**: 200,
el SSR entero en pantalla, y todo lo interactivo muerto. Es el defecto CMS #126
otra vez, esta vez causado por un `publish` de este repo.

### Lo que hace que esto no sea teórico

El import map que el CDN sirve **hoy** (medido el 2026-09-15 contra
`https://synergos-ui.synergos-labs.workers.dev/synergos/runtime/angular/latest/import-map.json`)
declara, entre sus 16 entradas:

```json
"@synergos/core":   "/synergos/runtime/angular/21.1.6/sg-core.js",
"@synergos/shared": "/synergos/runtime/angular/21.1.6/sg-shared.js"
```

Los dos specifiers son **agnósticos en el nombre y específicos en el destino**. Una
segunda plataforma que haga lo obvio —publicar su `sg-core.js` y su `sg-shared.js`
bajo los mismos dos nombres— produce exactamente el conflicto.

**Y no hay que imaginárselo: el test que lo prueba ya existe, verde, en el CMS, y
su fixture es literalmente este caso.**

```csharp
// Synergos.CMS.Tests/Services/ImportMapComposerTests.cs
public void El_mismo_specifier_con_URLS_DISTINTAS_para_el_mapa_y_nombra_a_los_dos()
{
    var (mapa, conflicto) = ImportMapComposer.Componer(new[]
    {
        Mapa("angular", ("@synergos/core", "/cdn/ng/synergos-core.js")),
        Mapa("react",   ("@synergos/core", "/cdn/react/synergos-core.js")),
    });
    Assert.Null(mapa);          // ← el sitio se queda sin import map
    ...
}
```

El CMS **anticipó la colisión como regla** y nadie sacó la consecuencia: que del
lado de este repo no hay nada que impida publicarla. La mitad que vigila está en un
árbol y la mitad que la causa en el otro — el mismo reparto que dejó el import map
sin vigilar en #126 y el índice sin cruzar en #48.

### La salida, y por qué es barata

El propio composer da el criterio: **el mismo specifier con la MISMA URL no es
conflicto — se deduplica** (`El_mismo_specifier_con_la_MISMA_url_no_es_conflicto`,
también verde). Así que:

1. El runtime de Angular publica **los dos nombres apuntando al mismo fichero**:
   `@synergos/core` (el de hoy, que los 127 bundles ya publicados importan y que
   **no se puede retirar** — `cdn.config.mjs` lo dice: *«quitar una entrada es
   peor: los elementos ya publicados siguen haciendo el bare import»*) **y**
   `@synergos/angular-core`.
2. Toda plataforma nueva publica **sólo** su par con nombre
   (`@synergos/react-core`, `@synergos/react-shared`) y **nunca** el agnóstico.
3. Los elementos nuevos de Angular se compilan contra el nombre con framework; los
   ya publicados siguen resolviendo por el alias viejo mientras exista.

Coste: dos entradas más en un JSON generado. **Cero riesgo, y sólo si se hace
antes.** Hecho después, el día que se publique React el sitio se cae entero y el
síntoma —«no hidrata nada»— no apunta a los specifiers por ningún lado.

> **La alternativa que NO se propone, y por qué va dicha.** Los import maps del
> navegador tienen `scopes`, que resolverían esto en la plataforma en vez de en el
> nombre: `/synergos/badge/react/` resolvería `@synergos/core` a la build de React
> y `/synergos/hero/angular/` a la de Angular. Es la respuesta *correcta* de la
> web. No se propone **ahora** porque el tipo `ImportMap` del CMS lleva un solo
> campo (`Imports`) y la vista serializa `new { imports = mapa.Imports }`: son
> cuatro ficheros del otro árbol —el record, la vista, el composer y los dos
> clientes— por un beneficio que el prefijo compra con dos líneas. Queda escrito
> como el disparador: **el día que dos frameworks necesiten el MISMO specifier de
> un tercero con versiones distintas** (dos `react` de mayor distinta, o `rxjs`
> versionado), el prefijo deja de alcanzar y hay que subir `scopes`.

---

## 4. El coste real de un elemento duplicado — medido sobre `badge`

`badge` es el primitivo más pequeño del catálogo (bundle publicado: **1 845 bytes**).
Se escribió su equivalente React **fuera del repo**, para contar y no estimar.

### Lo que hay hoy en Angular

| fichero | líneas |
|---|---|
| `apps/elements/primitives/badge/src/main.ts` | 13 |
| `apps/.../src/app.config.ts` | 7 |
| `apps/.../src/badge/badge.ts` (el envoltorio del elemento) | 50 |
| `apps/.../src/badge/badge.html` | 3 |
| `apps/.../src/badge/badge.scss` | 4 |
| `libs/shared/.../badge/badge.ts` (la pieza del design system) | 61 |
| `libs/shared/.../badge/badge.scss` | 50 |
| **total de código** | **188** |
| los dos `.spec.ts` | 57 |

### Lo que costaría en React — contado, no estimado

| pieza | líneas | nota |
|---|---|---|
| `main.ts` | **4** | registra el custom element y ya |
| `badge-element.tsx` (el envoltorio) | **39** | lee atributos, sanea, delega |
| `badge.tsx` (la pieza del design system) | **21** | |
| `badge.scss` | **0** | **se reusa verbatim** — ver abajo |
| **por elemento** | **~64** | |
| `define-element.tsx` (el adaptador de montaje) | **46** | **una vez por plataforma**, no por elemento |

**Y el CSS es el hallazgo barato.** `libs/shared/.../badge/badge.scss` son 50
líneas de `@use` sobre `vitals/core-assets` y clases `.syn-badge--*` planas: **ni
una construcción de Angular**. Se copia sin tocar una línea. El único SCSS que se
traduce es el del elemento —4 líneas de `:host`— y eso es un `display: inline-flex`.

> Generalizando con la medición de #36: el 24,2 % de `libs/shared` es plantilla y
> el 33,9 % cuerpo reactivo — **eso** se reescribe. Pero el SCSS no entra en esa
> cuenta y **no se reescribe casi nada de él**, porque el design system ya está
> tokenizado sobre `vitals/core-assets`. La épica hablaba de «reescribir el design
> system»; lo que se reescribe es su *cableado*, no su *aspecto*.

### Lo que sale de `vitals` sin tocarse, y lo que NO sale y debería

| | |
|---|---|
| `BadgeElementConfig` (`vitals/contracts/src/element-config.contract.ts`) | ✔ se importa igual |
| `omitUndefinedProperties`, `coerceConfigInput`, `coerceTrimmedStringInput`, `coerceStringEnumInput`, `resolveConfigValue` | ✘ **viven en `platforms/angular/libs/shared/src/utils/config-input.util.ts`** |

Ese fichero son **142 líneas y 13 funciones exportadas**, y lo importan **123 de los
127 elementos**. Es el candidato **A** de #36 —*«literalmente el modelado de lo que
viene del CMS, que es la definición de `vitals`»*— y hoy está del lado de Angular.
Escribir el badge de React sin moverlo primero significa **copiarlo**, y dos
normalizadores que se separan es cómo una clave deja de cruzar en silencio.

**La mudanza es más barata de lo que #36 temía**: `@synergos/shared` puede
re-exportar desde `vitals`, así que los 123 elementos **no cambian ni una línea de
import**. El coste es un fichero movido y un `export *`.

### El número que de verdad importa para el norte de la épica: el peso

Medido contra la URL pública el 2026-09-15, lo que descarga una página con **un
solo badge** (transferido, o sea comprimido):

| fichero | transferido |
|---|---|
| `ng-core.js` | 110 006 B |
| `sg-shared.js` | 72 819 B |
| `sg-core.js` | 9 534 B |
| `ng-elements.js` | 8 928 B |
| `ng-platform-browser.js` | 8 194 B |
| **runtime compartido** | **≈ 209 KB** |
| `badge/angular/latest/main.js` | 1 845 B (sin comprimir) |

**Ese es el argumento entero de la arquitectura y también su techo.** Los 209 KB se
pagan **una vez por página**, lleve un elemento o veinte — eso es exactamente lo
que compra el import map, y es correcto. Pero el **piso** de una página con un solo
badge son 209 KB, y de ellos 72,8 KB son `sg-shared.js`: el design system entero,
porque el bundle del badge hace `import {...} from "@synergos/shared"` y el
navegador se trae el módulo completo.

> Una segunda plataforma no es sólo una demo de portabilidad: **es la medición del
> piso**. Medido el 2026-09-15 contra jsdelivr, comprimido: **React + ReactDOM
> (18, UMD producción) = 47 056 B** (4 263 + 42 793) y **Preact 10 = 4 827 B**.
>
> ```bash
> curl -s https://cdn.jsdelivr.net/npm/preact@10/dist/preact.min.js | gzip -9 | wc -c
> ```
>
> Un `badge` que hidrata con **4,7 KB** de runtime al lado de uno que hidrata con
> **209 KB** es el experimento que contesta, con números, si el import map
> compartido paga por sí mismo en páginas con pocos elementos. **Eso no lo contesta
> ningún documento: hay que publicar el segundo.**
>
> ⚠ **Y no es una comparación limpia, así que va con su asterisco:** los 209 KB
> incluyen `sg-shared.js` (72,8 KB), que es **el design system entero de este
> repo**, no Angular. El runtime de Angular solo son ≈133 KB (y 9,5 de ésos son `sg-core`). La comparación
> honesta es runtime contra runtime —133 KB contra 4,7— y el `shared` de la segunda
> plataforma pesará lo que pese cuando exista. La medición del piso sale del
> experimento, no de esta tabla.

---

## 5. Qué se pondría rojo solo, y qué no vigila nadie

### 5.1 Cubierto — no hay que hacer nada

| gate | por qué ya cubre |
|---|---|
| `cdn-size-budget` | recorre el árbol publicado, mide **por framework**, y la línea base va indexada `<elemento>/<framework>` (#44) |
| `cdn-smoke` / `humo-cdn` | deriva los frameworks de las `implementations` del registry servido |
| `cdn-cache-policy` | la política es por forma de ruta, no por framework |
| `dev-cdn-routes` | rechaza sin framework en vez de caer a `angular` (#44) |
| `indice-publicado` | recorre, no pregunta (#48) |
| `frameworks` / `revisarPlataformas` | **una `platforms/react/` sin entrada en `PLATFORMS` rompe el build**, y al revés también |
| `vitals-purity` | la lista blanca sale del `tsconfig`; un import de React en `vitals/` cae por la misma puerta que uno de Angular, **sin nombrarlo** |
| G-2 de `sync-tokens` | barre **todo** `.scss`/`.css` del repo: el SCSS de React entra solo |

### 5.2 🔴 No lo vigila nadie

**(a) El runtime de la segunda plataforma.** `tools/lib/cdn-runtime-check.mjs`
pregunta por `${cdnSynergos}/runtime/angular` y por
`.../runtime/angular/latest/import-map.json`, literal. Está en el censo de #44 como
*legítimamente de Angular* — y lo era mientras hubiera una. Con dos, publicar
elementos de React sin su runtime pasa el gate **en verde**: es el defecto #7 tal
cual, servido en el segundo framework. Es además la regla 25 del `CLAUDE.md`:
*un gate que resuelve a una constante una dimensión de lo que mide no falla, se pone
verde sobre el sitio equivocado*.

**(b) Los seis gates que recorren el disco lo recorren sólo en `platforms/angular/`.**
Y el censo de #44 **no los ve**, porque filtra `!f.endsWith('.spec.mjs')` — y son
los `.spec.mjs` los que llevan las rutas:

| spec | qué vigila | ¿la regla es de Angular? |
|---|---|---|
| `css-parity.spec.mjs` | `platforms/angular/apps/elements/modules` | **no** — CSS muerto lo tiene cualquier framework |
| `spec-quarantine.spec.mjs` | `platforms/angular/{apps,libs}` | **no** — un `it.skip` sin motivo es igual de malo en React |
| `bridge-consumers.spec.mjs` | `platforms/angular` | **no** — helpers de `window.synergos` sin consumidor |
| `shell-consumers.spec.mjs` | `platforms/angular` | **no** — shells que nadie monta |
| `facet-selection.spec.mjs` | `platforms/angular` | **no** — facetas multi-valor que viajan de a una |
| `template-bindings.spec.mjs` | `platforms/angular` | **sí** — `[algo]="… \|\| null"` es *property binding* de Angular |

Cinco de seis son reglas **neutrales** apuntando a una ruta **cableada**. El censo
está bien escrito y tiene un hueco justo donde vive el recorrido del disco.

**(c) Dos fuentes para el mismo elemento se PISAN en silencio.** Medido ejecutando
`descubrirFuentes` con un disco de mentira que tiene `badge` en las dos
plataformas:

```
fuentes: [ ['badge', { framework: 'react', dir: 'platforms/react/apps/.../badge' }] ]
revisarFrameworks: [ 'badge: declara framework "angular" y el disco dice "react" (fuente propia).' ]
```

`descubrirFuentes` guarda en un `Map` **por nombre de elemento**, así que la última
plataforma del bucle gana y la de Angular **desaparece sin decirlo**. Y el error que
sale después **culpa al registry**: quien lo lea corregirá la entrada a `react` y
dejará de publicar el bundle de Angular sin haber decidido nada. La verdad —«hay dos
fuentes para este elemento»— no la dice nadie.

**(d) Un barril que nadie exporta no lo compila nadie.** Ver §6: 16 ficheros de
`libs/core/src/models/` están fuera de todo programa de compilación y tres de ellos
no resuelven. Ningún gate cruza «carpeta de una lib» contra «alcanzable desde su
`index.ts`».

**(e) El descubrimiento exige `src/main.ts`, con esa extensión.** `descubrirFuentes`
comprueba `${completo}/src/main.ts`. Un `platforms/react/` que use `main.tsx` —lo
normal— descubre **cero** elementos, y el gate dice «ninguna plataforma tiene su
fuente» para cada entrada de React. Falla ruidosamente, que es lo correcto; pero
falla por la razón equivocada y manda a alguien a mirar el registry.

---

## 6. `shells`, `rendering`, `shop`, `transaction-engine`, `integrations` — la clasificación

La HU 5 de la épica pedía clasificar «47 ficheros y ~9.300 líneas». Medido, son
**47 ficheros `.ts` (sin specs) y 9 322 líneas**, y **no son un grupo**:

| lib | ficheros | líneas | con `@angular/` | apps que lo consumen | veredicto |
|---|---|---|---|---|---|
| `shells` | 17 | 5 984 | 15 | 10 | **shared de Angular.** Son plantillas de experiencia (wizard, buscador, confirmación). Se reescriben. |
| `transaction-engine` | 9 | 1 290 | 5 | 8 | **partido.** 4 ficheros sin Angular; el motor de cobro/cumplimiento es lógica, las estrategias tocan DI. |
| `shop` | 6 | 975 | 5 | 6 | **shared de Angular**, con sus tipos a `vitals` si hacen falta dos veces. |
| `rendering` | 8 | 448 | 5 | 1 | **shared de Angular**, y con **un** consumidor — revisar si sigue haciendo falta antes de duplicarlo. |
| `integrations` | 7 | 625 | **0** | **0** | **ninguna de las tres.** Es un generador de código (`csharp-parser`, `ts-emitter`, `type-mapper` para `cms-sync`): herramienta de build viviendo en `platforms/angular/libs/`. No renderiza, no tiene estado reactivo y **no modela lo que emite el CMS en runtime**, así que tampoco es `vitals`. Su sitio es `tools/`. |
| `core` (Angular) | 52 | 2 455 | 31 | 58 | **shared de Angular**: 29 servicios con DI. Aparte, `src/models/` (16 ficheros) es una **capa de compatibilidad MUERTA** — ver abajo. |

### 🔴 Y de camino: `libs/core/src/models/` está muerta, y tres de sus ficheros no compilan

Los 16 ficheros de `platforms/angular/libs/core/src/models/` **no declaran nada**:
son `export type { X } from '../../../../../../vitals/core/src/models/…'`, una capa
de compatibilidad hacia `vitals` escrita con **ruta relativa** en vez del alias.

Tres de esos re-exports apuntan a ficheros **que no existen**:

```
libs/core/src/models/column-inputs.model.ts(1,35):      error TS2307: Cannot find module
  '../../../../../../vitals/core/src/models/column-inputs.model'
libs/core/src/models/hello-world-inputs.model.ts(1,39): error TS2307  (hello-world-inputs.model)
libs/core/src/models/section-inputs.model.ts(1,36):     error TS2307  (section-inputs.model)
```

**Y el build está verde.** `npm run build:angular` compila los 127 elementos en
20,8 s y la suite pasa 1 580 tests. La razón es que `libs/core/src/index.ts`
exporta `core.providers`, `core.environment`, `core.tokens`, `interceptors` y
`services` — **y no `./models`**. Nadie importa el barril, así que la carpeta entera
queda fuera del `NgtscProgram` y sus errores no los ve ningún compilador. Medido
forzándolo: `npx tsc --noEmit libs/core/src/models/index.ts` da los tres TS2307.

**Por qué esto importa para #37 y no es sólo limpieza:** quien escriba la segunda
plataforma va a mirar la primera para saber qué carpetas lleva una. Copiar
`libs/core/src/models/` es copiar la frontera **muerta** — exactamente lo que
`FRONTERA_VITALS.md` §3 advierte sobre los tres modelos de host deprecados, y por la
misma razón: *«el disparador para hacerlo es que alguien vaya a escribir el segundo
shared; antes de eso es limpieza, en ese momento es la diferencia entre copiar la
frontera buena o copiar la muerta»*.

**No se borra acá** (lo que hoy no se usa puede usarse mañana, y esto es un cambio
de contrato que necesita su ticket). Se propone: o el barril se exporta desde
`index.ts` —y entonces los tres TS2307 hay que arreglarlos— o la carpeta se retira.
Lo que no puede quedarse es el estado de hoy, que afirma una capa de compatibilidad
que no compila y que nadie ejercita.

> **`integrations` es el hallazgo de esta sección**: 625 líneas, cero imports de
> framework y **cero consumidores**, alojadas en la carpeta de una plataforma. No
> se borra —lo que hoy no se usa puede usarse mañana— pero **no debería mudarse a
> la segunda plataforma ni quedarse donde está**: lo consume `tools/cms-sync.mjs`,
> que es de la raíz.

---

## 7. El despiece — en orden de dependencia

| orden | HU | talla | depende de |
|---|---|---|---|
| 1 | **#58** — El specifier del runtime lleva el framework dentro | **S** | — |
| 2 | **#59** — Dos fuentes para un elemento se nombran, no se pisan | **S** | — |
| 3 | **#60** — El censo de #44 llega a los `.spec.mjs` | **S** | — |
| 4 | **#61** — El runtime de CUALQUIER plataforma llega antes que sus elementos | **S** | #58 |
| 5 | **#62** — El contrato de una plataforma, derivado del disco | **M** | #58, #59 |
| 6 | **#63** — El grupo A de `libs/shared` baja a `vitals` | **M** | — |
| 7 | **#64** — El segundo elemento REAL, publicado y montado | **L** | #58, #61, #62, #63 |
| 8 | **#65** — Las cinco libs clasificadas | **M** | #64 |

Y dos **hallazgos** que salieron midiendo y que no son parte de la épica, pero que
la tocan:

| | | |
|---|---|---|
| **#66** | `libs/core/src/models/` está fuera de todo programa y tres ficheros no resuelven | bloquea copiar el layout de la plataforma |
| **#67** | `ElementProtocol` sin consumidores + la última copia de la unión de frameworks | la copia está **arreglada**; la decisión sobre la interfaz es de #62 |

**Por qué 1 va primero y no el contrato**: es lo único de la lista que, hecho
tarde, rompe lo que hoy funciona. Las demás, hechas tarde, sólo dejan algo sin
vigilar.

**Por qué 6 va antes que 7**: sin ella, el segundo elemento copia el normalizador
de 142 líneas que usan 123 de los 127 elementos, y a partir de ahí hay dos.

**Por qué 8 va después de 7 y no antes**: clasificar cinco librerías sin un segundo
consumidor es decidir con una corazonada. `Synergos.Shared` del repo hermano esperó
a seis consumidores; acá alcanza con uno real.

---

## 8. Lo que esta medición NO contesta

- **Qué framework.** React, Preact, Svelte y `vanilla` son los cuatro que
  `ELEMENT_FRAMEWORKS` admite. La medición del §4 da el criterio (el piso de peso)
  y no la respuesta.
- **Si un mismo elemento puede existir en dos frameworks a la vez.** El registry
  publicado **sí** lo expresa (`implementations` es un mapa y `upsertCdnRegistryEntry`
  conserva las otras), pero el registry **fuente** lleva `framework` como escalar y
  `elegirPlataforma` **rechaza** un bundle construido en otra plataforma («uno de
  los dos miente»). O sea: hoy el modelo es *un elemento, un framework*. Decidirlo
  es parte de la HU 2, y no es una pregunta de herramientas: es de producto.
- **Cómo elige el CMS cuando hay dos.** `ElegirFramework` prefiere el
  `DefaultFramework` (`"angular"`) y si no está toma
  `Implementations.Keys.FirstOrDefault()` — o sea **el orden del diccionario**.
  Mientras haya uno da igual; con dos, un elemento publicado sólo en react+svelte se
  serviría según el orden de publicación. Es del otro árbol y se anota acá para que
  quien abra la HU 2 lo sepa.
