# La frontera de `vitals/` — medición, decisiones y candidatos

Documento de la épica **#36**. La frontera en sí (qué entra y qué no) vive en
`SynergosDocs/WHERE_DOES_THIS_GO.md` §1, que es donde alguien la va a buscar.
Acá está **lo medido**: de dónde salen esos números, las tres decisiones que la
épica dejó abiertas y la lista de candidatos para el día que exista el segundo
framework.

> Todo lo de abajo se midió contra el disco el 2026-09-15. Donde una cifra de la
> épica no cuadró, está dicho.

---

## 1. El punto de partida, recontado

| | épica | disco | nota |
|---|---|---|---|
| Imports de framework en `vitals/` | 0 | **0** | ✔ y ahora con gate |
| Modelos `*-inputs.model.ts` | 130 | **129** | `models/` tiene 130 ficheros: los 129 modelos **más `index.ts`** |
| Mappers | 53 | **51** `*.mapper.ts` | `mappers/` tiene 53 ficheros: los 51 más `index.ts` y `shop-mapper.utils.ts` |
| Contratos | 18 | **18** entradas en `vitals/contracts/src/` | son 15 `.ts` + 2 `.json` + la carpeta `generated/` |
| De qué depende `vitals/core` | contracts + sí mismo | **✔** | 45 imports, todos `@synergos/contracts`; el resto, relativos |
| Ficheros de `libs/shared` | 81 | **80** de código | el 81.º es `vitest.config.ts`, que es configuración de tests y no design system |
| Líneas de `libs/shared` | ~8.700 | **8.804** | contando los 80 ficheros de código |
| «todos con `@angular/core`» | — | **74 de 80** | seis no importan nada de Angular: los cinco de `utils/` y `components/states/view-state.ts` |

**Los 129 modelos y los 51 mappers cumplen la frontera**, y se comprobó por
forma y no de vista:

- `models/`: **129 ficheros, 129 `export interface`, y nada más**. Ni una clase,
  ni una constante, ni una función. Un fichero, un tipo.
- `mappers/`: **67 funciones exportadas, 2 interfaces y 3 tipos**, con **cero
  efectos** — el barrido de `setTimeout`, `setInterval`, `Math.random`,
  `new Date()`, `Date.now`, `console.*`, `process.*` y `structuredClone` sobre
  las dos carpetas devuelve vacío.
- Globales en todo `vitals/`: **uno solo**, `window.synergos` en
  `bridge/synergos-bridge.ts`, que es el host bridge y degrada a `null`.
- Tipos del DOM: **uno solo**, `HTMLElement` en la firma de
  `ElementProtocol.mount`, que es la superficie de montaje que comparten los
  cuatro frameworks.

Ninguno es un hallazgo. Los tres casos de borde están escritos en
`WHERE_DOES_THIS_GO.md` §1 para que la próxima auditoría no los vuelva a
discutir.

---

## 2. El gate: `vitals-purity`

`tools/lib/vitals-purity.mjs` + `.spec.mjs`, corre con `npm test`.

**El criterio es una lista blanca derivada del disco**, no una lista negra de
nombres de framework: se permiten los alias de `compilerOptions.paths` de
`tsconfig.base.json` **cuyo destino cae dentro de `vitals/`** (hoy tres) y las
rutas relativas **que resuelven dentro de `vitals/`**. Todo lo demás se rechaza
sin nombrarlo, así que `rxjs`, `zone.js` y el paquete que se invente el año que
viene caen por la misma puerta que `react`.

**Lo que NO ve está escrito con letra (a)–(f)** arriba del propio gate. Dos
puntos ciegos se **miden** en el spec en vez de suponerse: que hoy no haya
literales de regex con comillas dentro de `vitals/` (que podrían descolocar el
escáner de comentarios), y que el barrido llegue a los tres vitales y no sólo a
`core`.

### Lo que la mutación enseñó, y que cambia para qué sirve el gate

El import obvio **ya era imposible**. `import { signal } from '@angular/core'`
dentro de `vitals/core` **no compila**: `TS2307: Cannot find module
'@angular/core'`, porque `vitals/` no cuelga de `platforms/angular/` y la
resolución sube hasta el `node_modules` de la raíz, donde no hay ningún
framework. El árbol ya lo impedía por su **forma**.

Lo que **sí** compila —medido, con `npm run build:angular` en verde las dos
veces— es lo que no lleva el nombre:

| mutación | build | `grep '@angular' vitals/` | gate |
|---|---|---|---|
| `import { signal } from '@angular/core'` | ❌ TS2307 | lo ve | 🔴 |
| `import { ButtonComponent } from '../../../../platforms/angular/libs/shared/…/button'` | ✅ verde | **nada** | 🔴 |
| `import('@' + 'angular/core')` | ✅ verde | **nada** | 🔴 |

La segunda mete un `@Component` de Angular **entero** dentro de `vitals/`,
compila, publica, y un gate escrito por nombres pasa en verde. Ése es el import
que hay que vigilar.

> **Y el propio gate tuvo su hueco, que lo destapó su spec y no leerlo.** Los dos
> cortes obvios para `import(...)` —«un literal entre paréntesis» y «lo que NO
> empieza por comilla»— dejan un agujero **entre** ellos: `'@' + 'angular/core'`
> **empieza** por comilla (la primera regex no dispara) y no **termina** en
> comilla+`)` (la segunda tampoco). Con las dos puestas, el caso que nombra el
> ticket pasaba en VERDE. Se arregló leyendo `import(` avanzando.

---

## 3. `AngularHostInputs` — la grieta, y por qué la respuesta no es la que parecía

`vitals/core/src/models/angular-host-inputs.model.ts` es el único nombre de
`vitals/` que nombra un framework. La pregunta de la épica era: *el día que haya
React, ¿hace falta un `reactHost`, o es un `componentHost` con un campo
`framework`?*

**Ninguna de las dos. Y no es una opinión: es una decisión que el repo ya tomó,
y de la que este modelo es el rastro que quedó sin barrer.**

### Lo medido

| | |
|---|---|
| DocType `elementIntAngularHost` en `uSync/v9/ContentTypes/` | **no existe** — `grep -rl AngularHost` sobre todo `uSync/` no devuelve nada |
| En `element-registry.json` (132 elementos) | **ausente** — no hay bundle publicado |
| En `element-inputs.json` | presente, y listado en `KNOWN_DEPRECATED_INPUT_NAMES` (`element-contract-audit.mjs`) |
| En `validate-cms-contracts.mjs` | en `DEPRECATED_NAMES`, con un check que **exige que NO esté en el registry** |
| En `block.mapper.ts` | presente, como `KNOWN_COMPAT_MAPPER_ALIASES` |
| Cabecera del modelo | **sin** la línea `AUTO-GENERATED by tools/cms-sync.mjs` que llevan los 66 modelos vivos, porque no hay `.config` del que generarlo |

El comentario de `validate-cms-contracts.mjs` lo dice con todas las letras:
*«Deprecated wrapper-component arch […] `elementIntAngularHost` y
`elementIntMfHost` ya no están en el CMS»*. Sus dos hermanos —`mf-host-inputs`
(Module Federation) y `macro-host-inputs`— están en el mismo estado.

**Así que la premisa «cruza al CMS, hay un DocType detrás» ya no se sostiene.**
Lo que cruza al CMS es su sustituto: `elementSynModuleMount`
(`elementsynmodulemount.config`, vivo en uSync, en el registry, y con su modelo
`ModuleMountInputs` **sí** generado desde el `.config`).

### Qué reemplazó a la arquitectura de hosts-por-framework

`ModuleMount.cshtml` emite `<synergos-{moduleAlias}>` con el alias que elige el
editor (ADR 0096). O sea: **un montador genérico, y el alias decide qué se
monta**. El framework no aparece por ninguna parte, y es correcto que no
aparezca — quien mira un `<synergos-x>` en la página no tiene por qué saber en
qué se escribió.

Eso contesta la pregunta de diseño de raíz: **el campo `framework` no va en el
host, va en el artefacto del registro** — donde `ArtifactDescriptor.framework`
y `ComponentRegistryEntry.framework` ya lo declaran en
`component-resolution.contract.ts`. Un `reactHost` sería volver a la
arquitectura que se abandonó, y un `componentHost` con campo `framework` sería
poner el dato en el sitio equivocado: en la página en vez de en el registro.

> ⚠ **Y hay un desajuste de camino, que va anotado y no arreglado.**
> `ArtifactDescriptor`, `ManifestDescriptor` y `ComponentRegistryEntry` declaran
> `framework: FrameworkKind` como **obligatorio**, pero las 132 entradas de
> `element-registry.json` son `{name, alias, tag, tier}`: **ninguna lo lleva**.
> O sea que el sitio correcto para el dato existe como tipo y está vacío como
> dato. Hoy no duele porque sólo Angular publica; el día del segundo framework,
> es lo primero que hay que llenar — y hasta entonces nadie debería leer ese
> campo creyendo que dice algo.

### La propuesta (NO ejecutada — la decide el arquitecto)

**Borrar los tres modelos de host muerto, no renombrarlos.** Renombrar
`AngularHostInputs` a `ComponentHostInputs` conservaría la forma de una
arquitectura abandonada con un nombre que ya no delata que lo está — que es
peor que dejarlo como está, porque el nombre actual al menos se ve raro.

Lo que costaría, medido:

| paso | fichero | riesgo |
|---|---|---|
| 1 | `vitals/core/src/models/{angular-host,mf-host,macro-host}-inputs.model.ts` + sus 3 líneas en `models/index.ts` | ninguno: nada del catálogo los importa |
| 2 | `vitals/core/src/mappers/angular-host.mapper.ts` + su export y su entrada `elementIntAngularHost` en `block.mapper.ts` | **el que hay que mirar**: `block.mapper` es el punto de entrada de lo que manda el CMS. Un contenido viejo guardado en la base con ese alias dejaría de mapear |
| 3 | las 3 claves de `element-inputs.json` | cruza los dos gates de contrato — hay que regenerar `tools/contract-*.baseline.json` si aplica |
| 4 | `KNOWN_DEPRECATED_INPUT_NAMES` y `DEPRECATED_NAMES` y `KNOWN_COMPAT_MAPPER_ALIASES` | las tres listas se quedan sin sujeto y **tienen que encoger en el mismo commit**, o pasan a ser permisos que sobran y dejan de leerse |
| 5 | `platforms/angular/apps/elements/modules/angular-host/` (4 ficheros) | comprobar antes que `tools/build.mjs` no lo compile ya (no está en el registry, así que no debería publicarse) |

**Del lado del CMS: cero.** El DocType ya no está en `uSync/v9/`. Lo único que
queda allá es la frase de `validate-cms-contracts.mjs` sobre
`CleanupLegacyTypes` — o sea filas en la base de datos, no schema autorado.

**El disparador para hacerlo**: que alguien vaya a escribir el segundo `shared`.
Antes de eso es limpieza; en ese momento es la diferencia entre copiar la
frontera buena o copiar la muerta.

---

## 4. `vitals/core-assets` — qué es

**Es el `shared` de estilos, no un cuarto vital de TypeScript.** Escrito y
nombrado así en `WHERE_DOES_THIS_GO.md` §4 antes de que el segundo framework lo
dé por hecho.

El razonamiento, que es lo que hace falta cuando alguien lo discuta:

- **La frontera de `vitals` es «lo que los cuatro consumen sin traducir».** Un
  modelo TypeScript cumple eso por accidente del lenguaje: los cuatro
  frameworks son TypeScript. `core-assets` lo cumple por una razón más fuerte
  —**un token CSS no tiene versión por framework en absoluto**—, así que si
  algo pertenece a la capa agnóstica, es esto.
- **Pero no es del mismo tipo que los otros dos.** `contracts` y `core` son
  *datos y sus traducciones*; `core-assets` son *decisiones visuales*. El
  criterio de admisión es distinto: a un modelo se le pregunta «¿lo emite el
  CMS?»; a un token, «¿lo respetan todos los temas?».
- **Y ya se TRADUCE a la plataforma, que es la prueba de que es un `shared` y
  no un vital.** `npm run sync:tokens` genera
  `platforms/angular/libs/shared/src/styles/_tokens-bridge.scss` desde
  `vitals/core-assets/`, y `--check` lo mantiene cuadrado (G-1). Los modelos de
  `vitals/core` no se traducen a nada: se importan directo. Un paquete que hay
  que **volcar** al `shared` de cada plataforma es exactamente la forma de un
  shared compartido, no la de un vital consumido.

  > ⚠️ **Esto decía «`platforms/angular/libs/core-assets/` es una copia», y ese
  > directorio NO EXISTE** (#40). `libs/` tiene siete entradas —`core`,
  > `integrations`, `rendering`, `shared`, `shells`, `shop`,
  > `transaction-engine`— y ninguna es ésa; `sync-tokens.mjs` escribe dentro de
  > `shared/`, no al lado. La conclusión no cambia —de hecho se sostiene mejor,
  > porque una traducción generada es todavía más «shared» que una copia— pero
  > **la prueba que la sostenía era falsa**, y eso es peor que no darla: el
  > siguiente que la lea da por hecho que existe un espejo que puede tocar. Lo
  > escribió la misma tanda que este documento, o sea prosa por delante del
  > código dentro del mismo commit.

**Consecuencia práctica, que es para lo que sirve haberlo nombrado:** el día que
exista React, su `shared` lleva **otra traducción del mismo origen** —lo que
`sync:tokens` genere para él, con la forma que React necesite— y el `--check`
tiene que cuadrar las dos. Lo que NO se hace es
escribir tokens en el `shared` de React: ahí se escribe la *traducción* (un
`.module.css`, un tema de `styled-components`), nunca el valor.

**Queda donde está y con el nombre que tiene.** Moverlo a `vitals/shared-styles`
o sacarlo de `vitals/` sería renombrar sin cambiar nada y romper el alias
`@synergos/core-assets` que ya consumen el `tsconfig` de la raíz y el de Angular.

---

## 5. Qué de `libs/shared` es en realidad `vitals` — la medición

> ⚠️ **El grupo A YA SE MOVIÓ (#63).** Este apartado se escribió diciendo «no se
> movió nada» y era cierto entonces: el disparador era el segundo `shared`, y el
> segundo `shared` llegó con la HU #64. Los cuatro ficheros —`config-input`,
> `embed-url`, `form` y `monogram`, con sus specs— viven hoy en
> `vitals/core/src/inputs/`, y `class-names.util.ts` se quedó (ver «lo que no
> bajó», al final de este apartado). Los grupos **B** y **C** siguen medidos y
> sin mover, con el mismo disparador. **Las cifras de abajo son las de la
> medición original y NO se recalculan**: son el retrato del día en que se
> decidió, y reescribirlas borraría de qué tamaño era la decisión.

**Cuando esto se midió no se había movido nada.** Era materia prima para el
segundo `shared`, y moverla con un solo consumidor es exactamente lo que la
regla de promoción prohíbe.

Método: AST de TypeScript (no regex) sobre los 80 ficheros de código de
`platforms/angular/libs/shared/src`. **Las cifras se reproducen**, no se copian —
`node tools/medir-frontera-shared.mjs` las vuelve a sacar del disco. Una cifra
copiada a un documento se desvía; una que se recalcula, no.

| cubo | líneas | % | qué es |
|---|---|---|---|
| plantilla (HTML dentro del `@Component`) | 2.131 | 24,2 % | render puro — **no se muda nunca** |
| cuerpo de clase que toca Angular o `this` | 2.984 | 33,9 % | señales, inputs, outputs, DI |
| metadatos del decorador (sin la plantilla) | 478 | 5,4 % | `selector`, `styleUrl`, `imports` |
| imports | 385 | 4,4 % | |
| **ámbito de módulo sin Angular** | **1.297** | **14,7 %** | tipos, uniones y funciones puras **ya fuera de la clase** |
| **miembros de clase sin `this`** | **352** | **4,0 %** | 67 métodos que casualmente viven dentro del componente |
| resto (líneas en blanco, cabeceras, `export class X {`) | ~1.177 | 13,4 % | |

Y un tercer cubo que los dos anteriores no cazan, medido aparte:

| | |
|---|---|
| **`computed()` cuyo cuerpo sólo LEE señales** | **42 bloques, 313 líneas** |

Ése es el importante y el que explica por qué «4,0 %» engaña. `pageItems` del
paginator son 43 líneas de `(total, visible, current) → PaginatorItem[]` sin una
sola API de Angular dentro; lo único que hace `computed` es leer tres señales en
las tres primeras líneas. Mi medición estrecha lo cuenta como «depende de
Angular» porque dice `this.`. **La verdad está entre los dos límites**, y por eso
van los dos:

> **Suelo (lo que ya está desacoplado en su forma): 1.649 líneas, 18,7 %.**
> **Techo (sumando los `computed` puros y descontando el barril de `index.ts`,
> 207 líneas de re-exports): ~1.755 líneas, ~20 %.**
>
> O sea: **una de cada cinco líneas de `libs/shared` es lógica que React
> necesitaría igual.** Las otras cuatro son render, y se reescriben.

### Los candidatos, por orden de qué tan claro está

**A. Ya son funciones puras en ámbito de módulo — se mudan tal cual (≈275 líneas)**

| fichero | líneas | por qué es de `vitals` |
|---|---|---|
| `utils/config-input.util.ts` | 129 | **El candidato más claro de todos.** 14 funciones (`coerceConfigInput`, `resolveConfigValue`, `coerceOptionalBooleanInput`, `coerceStringEnumInput`, `coerceStringRecordInput`, `coerceOptionalNumberInput`…) que convierten el JSON sin tipo que manda el CMS en un config tipado. Es **literalmente** «el modelado de lo que viene del CMS», que es la definición de `vitals`. React lo necesita idéntico o vuelve a escribir el mismo normalizador defensivo, y dos normalizadores que se separan es cómo una clave deja de cruzar en silencio. |
| `utils/embed-url.util.ts` | 81 | Una **frontera de seguridad**: URL escrita por una persona → `src` de iframe reemitido sobre un origen literal. Su propia cabecera dice que duplicar una allowlist es la peor opción y que ya pasó una vez (issue #10). Dejarla en el `shared` de Angular garantiza la segunda copia. |
| `utils/form.util.ts` | 42 | `toInputValue`, `parseNumericInput`, `getFieldError`, `toSelectOptions`. Sin DOM. |
| `utils/monogram.util.ts` | 21 | Iniciales de un título, con las trampas de Unicode ya resueltas (puntos de código, `'ß'.toUpperCase()`). Reescribirlo es reintroducir los dos defectos. |
| `utils/class-names.util.ts` | 3 | **El único dudoso de este grupo**, y va dicho: son tres líneas que cualquiera reescribe sin pensar. Mudarlo por coherencia y no por reutilización es a lo que se parece una abstracción prematura. |

**B. `sanitize*Config` co-locados con su componente (≈450 líneas, 13 ficheros)**

`pricing-card` (74), `overview-card` (72), `list` (59), `button` (30), `section`
(28), `heading` (26), `progress` (24), `status-tag` (24), `link` (23),
`accordion` (21), `icon` (20), `spinner` (14), `badge` (13).

Hacen **el mismo trabajo que un mapper de `vitals`**: reciben lo que el editor
escribió, lo validan y devuelven un tipo. La parte de tipos (`ButtonVariant`,
`PricingCardConfig`, `StatusTagTone`…) es vocabulario del design system y va
junta con ellos.

> **Y acá está la decisión de fondo que hay que tomar antes de mover nada.** El
> `*Config` de un componente describe **la API del design system**, no lo que
> emite el CMS — son dos cosas que hoy coinciden porque hay un solo design
> system. Si se mudan a `vitals`, `vitals` empieza a declarar la forma de
> componentes de UI, que es justo lo que la frontera dice que no. **La salida
> que propongo es partirlos**: la función `sanitize*` a `vitals` (es un
> normalizador de entrada del CMS) y el tipo `*Config` al `shared` de cada
> framework (es su API). Cuesta más y deja la frontera diciendo la verdad.

**C. Atrapada dentro de la clase (≈420 líneas)**

| pieza | líneas | nota |
|---|---|---|
| `paginator.pageItems` | 43 | `(total, visible, current) → items con elipsis`. Cero Angular. El caso de manual. |
| `configurable-form`: `validateField` + `initialFieldValue` + `selectOptions` + `isInputField` + `placeholder` + `cloneValues` | ~90 | **Validación de un formulario descrito por el CMS** — el bloque más grande de lógica de negocio portable de toda la librería. ⚠ Los mensajes (`'This field is required.'`) están **en inglés y a mano** dentro del método: al mudarlo, el mensaje sale por el bridge de i18n o se muda una cadena que nadie puede traducir. |
| los 4 pipes (`mask`, `title-case`, `kebab-case`, `remove-html-tags`) | 54 | El `transform` es una función pura de string. El `@Pipe` es el envoltorio de Angular; React lo llama y ya. |
| `pricing-card.formattedAmount` | 14 | formato de moneda |
| `data-table.resolveCellValue` | 16 | |
| `filter-panel.cloneState` + `isSectionActive` | 19 | |
| `avatar.initials` | 11 | ⚠ **posible gemelo de `monogram.util.ts`** — dos sitios calculando iniciales. Hay que mirarlo antes de mudar los dos. |
| `tabs.activeTabId`, `date-display.dateValue`, `promo-code.message`, `range-slider.progress`, `link.resolvedRel`, `progress.displayLabel` | ~50 | |
| `focus-manager.isFocusableElement` + `FOCUSABLE_SELECTORS` | 20 | DOM estándar, no Angular. Frontera: es del `shared` de estilos/DOM, no de `vitals/core`. |
| los ~30 `*Class` (`cardClass`, `panelClass`, `linkClass`…) | ~120 | **NO son candidatos.** Componen clases CSS del design system: presentación, y su sitio natural es el `shared` de cada framework. Van listados para que nadie los cuente dentro del 20 %. |

### Lo que NO se muda, para que quede dicho

- Las 2.131 líneas de plantilla y las 2.984 de cuerpo reactivo: son el 58 % y
  son exactamente lo que cada framework escribe en su propio lenguaje.
- `src/index.ts` (207 líneas): es un barril que re-exporta componentes de
  Angular. No es lógica y no es portable.
- `services/*.service.ts` que dependen de DI (`dialog`, `live-announcer`,
  `reduced-motion`, `skeleton`): lo portable de ellos son sus **interfaces**
  (`DialogConfig`, `SkeletonState`), 29 líneas en total, y sólo si alguien las
  pide.

### El disparador — y qué pasó cuando saltó

**El segundo `shared`.** Mientras no existió, esta lista fue una medición.

**Saltó con #64**, y el grupo A se mudó primero, como estaba escrito. Lo que la
mudanza enseñó y no estaba previsto:

- **Costó menos de lo que #36 temía y por una razón concreta**: `@synergos/shared`
  re-exporta desde `vitals`, así que los **122** elementos que importan algún
  `coerce*` de `@synergos/shared` **no cambiaron ni una línea**. Medido:
  `git status` no toca un solo fichero de `apps/`.
- **Los specs bajaron con el código**, y eso obligó a un runner tercero
  (`npm run test:vitals`). No es burocracia: sin él, correr 50 tests de funciones
  puras exigiría arrancar el compilador AOT de Angular, que es justo el acople
  que la frontera existe para cortar. La suite de Angular pasó de 1.585 a 1.535
  y los 50 que faltan son exactamente esos — la cuenta cuadra y por eso se dice.
- **La mudanza es neutra en peso**: `sg-shared.js` salió **byte a byte idéntico**
  (809.386 B) y los normalizadores **no** se duplicaron en `sg-core.js`, porque
  `libs/core` no re-exporta el barril de `vitals`.
- **Hay gate y va por el NOMBRE de la función** (`normalizador-unico`), no por la
  ruta del fichero. La mutación que lo prueba es una copia puesta en otra carpeta
  y con otro nombre de fichero: un gate por ruta pasaría en verde.

### Lo que NO bajó, y por qué — el caso de `class-names.util.ts`

Tres líneas que unen clases CSS, con **31** consumidores en Angular. La cifra
invita a mudarlo y el criterio dice que no: **el badge de la segunda plataforma
no lo usa**, y cada framework tiene su idioma para componer clases (`clsx`, una
plantilla, el `[class.x]` de Angular). Mudarlo por simetría es la abstracción
prematura de `LLM.txt` §6. El día que el segundo `shared` lo pida, baja — con
consumidor, como bajaron los otros cuatro.

El **grupo C** se muda después (recortar un `computed` es mecánico) y el **B**
sólo tras decidir lo del `*Config`.
