# Where Does This Go?

Dónde va cada cosa en Synergos UI — y sobre todo **dónde está la frontera entre
`vitals/` y el `shared` de un framework**, que es la pregunta que este documento
no contestaba y por la que se reescribió (épica #36).

> Este fichero estaba marcado DESACTUALIZADO desde la purga de plataformas
> (2026-08-04) y enrutaba hacia tres sitios que no existen —`platforms/react`,
> `platforms/svelte`, `vitals/shared`— más una carpeta renombrada
> (`components/foundations/` es hoy `components/primitives/`). Una guía que
> manda a una carpeta inexistente no se queda corta: **afirma de más**, y el
> siguiente agente construye encima.

---

## 0. La regla de la que sale todo lo demás

> **Cada framework tiene su propio `shared`, escrito en su propio lenguaje, y
> TODOS se alimentan de `vitals`. En `vitals` vive el modelado de lo que viene
> del CMS — el contrato intermedio entre el CMS y los frameworks del frontend.**

Hoy sólo Angular publica elementos, así que sólo hay un `shared`
(`platforms/angular/libs/shared/`). Que haya uno no cambia la frontera: cambia
cuánto cuesta equivocarse. Lo que se cuele en `vitals/` lo arrastra el segundo
framework **sin usarlo**, y lo que se quede atrapado en `libs/shared` lo tendrá
que reescribir desde cero.

---

## 1. La frontera `vitals/` ↔ `<framework>/shared`

### Entra en `vitals/`

| Qué | Dónde | Por qué es de acá |
|---|---|---|
| **El modelo** de lo que emite el CMS | `vitals/core/src/models/` (`*-inputs.model.ts`) | Es la forma del dato, y el dato es el mismo para los cuatro. Hoy **129 ficheros, 129 `export interface`, uno por fichero y nada más**. |
| **El mapper** que traduce del bloque del CMS a ese modelo | `vitals/core/src/mappers/` | Traducir no es pintar. Hoy **67 funciones exportadas, cero efectos** — sin `Date.now`, sin `Math.random`, sin timers, sin `console`. |
| **El contrato** (tipos de la superficie CMS↔UI) | `vitals/contracts/src/` | Es lo que el CMS y el UI acuerdan. Un tipo no tiene framework. |
| **El protocolo del bridge** | `vitals/core/src/bridge/` | `window.synergos` lo inyecta el host y lo leen los cuatro. |
| **El vocabulario**: uniones, constantes, enums, guards | donde corresponda dentro de `vitals/` | `FrameworkKind`, `ComponentTier`, `isFrameworkKind`. Nombrar no es renderizar. |

### NO entra en `vitals/` — va al `shared` de su framework

Nada que **renderice**, que **toque el DOM**, o que tenga **estado reactivo de un
framework**. En concreto:

- Un componente, una directiva, un pipe, un template, un `styleUrl`.
- `signal()`, `computed()`, `effect()`, `input()`, `output()`, `inject()`, un
  store, un `useState`, un `$:` de Svelte.
- Un servicio que se resuelve por inyección de dependencias.
- Cualquier cosa que lea o escriba el DOM: `document.*`, `querySelector`,
  `addEventListener`, un `ResizeObserver`.

### Los tres casos de borde, que son los que se discuten

1. **`HTMLElement` en `element-protocol.ts` — pasa, y es correcto.** Es
   `lib.dom`, no un framework: montar en un elemento del DOM es justamente la
   superficie que los cuatro comparten. La línea está en **nombrar el DOM** (un
   tipo en una firma) frente a **tocarlo** (llamar a sus métodos).
2. **`window.synergos` en `synergos-bridge.ts` — pasa.** Mismo criterio: el
   host inyecta un global del navegador, no de un framework, y el helper
   degrada a `null` cuando no está. Es la ÚNICA lectura de un global en
   `vitals/`.
3. **`console.*` en `services/logger.ts` — pasa, y es lo único con efecto.**
   `createLogger` devuelve un objeto plano detrás de una interfaz `Logger`; no
   hay DI, no hay singleton, no hay estado. Si algún día necesitara un
   transporte configurable, el transporte es del framework y la interfaz se
   queda acá.

### Cómo se decide un caso nuevo, en una pregunta

> **¿Habría que reescribir esto para React, o sólo volver a llamarlo?**
> Si hay que reescribirlo, es del `shared` de su framework. Si sólo hay que
> llamarlo, es de `vitals`.

### Qué lo vigila

`tools/lib/vitals-purity.spec.mjs` (gate `vitals-purity`, corre con `npm test`).
Exige **cero** especificadores de módulo fuera de la capa agnóstica, con una
lista blanca **derivada de `tsconfig.base.json`** y no escrita a mano. Lo que ese
gate **no** ve está escrito con letra (a)–(f) arriba de
`tools/lib/vitals-purity.mjs`, y hay dos puntos ciegos que importan acá:

- **No ve un framework copiado a mano.** Escribir un `signal()` propio dentro de
  `vitals/` no es un import. Eso lo decide esta frontera, no el gate.
- **No ve los globales.** `window.synergos` pasa por eso, y pasa a propósito;
  `(globalThis as any).ng` pasaría igual y no debe.

---

## 2. Árbol de decisión

```
¿Es un tipo / interfaz que describe DATOS?
  ├─ ¿Describe lo que emite el CMS, sin alias de Umbraco dentro?
  │     → vitals/contracts/src/*.contract.ts
  ├─ ¿Es la forma de entrada de UN elemento (sus inputs)?
  │     → vitals/core/src/models/<nombre>-inputs.model.ts
  └─ ¿Nombra alias de propiedad de Umbraco o formas de su API?
        → platforms/angular/libs/core/src/contracts/

¿Es una función pura (sin framework, sin DOM, sin HTTP)?
  ├─ ¿Traduce del bloque del CMS al modelo de un elemento?
  │     → vitals/core/src/mappers/
  ├─ ¿Es del protocolo del bridge / interop entre frameworks?
  │     → vitals/core/src/bridge/
  └─ ¿Es un helper que sólo usa Angular hoy?
        → platforms/angular/libs/shared/src/utils/
          ⚠ y si React lo necesitaría igual, es CANDIDATO a vitals —
            ver «Promoción», abajo.

¿Son tokens SCSS, mixins o tipografía?
  → vitals/core-assets/src/scss/   (fuente de verdad)
    espejo: platforms/angular/libs/shared/src/styles/_tokens-bridge.scss
            (lo genera y lo cuadra `npm run sync:tokens` / `sync:tokens:check`)
    Es el SHARED DE ESTILOS, no un cuarto vital de TypeScript — ver §4.
    (Esto decía `platforms/angular/libs/core-assets/`, que no existe. Épica #40.)

¿Es de Angular?
  ├─ Componente del design system (no Web Component)
  │     ├─ primitiva, una responsabilidad → libs/shared/src/components/primitives/
  │     ├─ composición con estado de interacción → libs/shared/src/components/compositions/
  │     └─ patrón de layout recurrente → libs/shared/src/components/patterns/
  ├─ Provider, token, interceptor, guard, servicio → libs/core/src/
  ├─ Puente entre el motor de render y los elementos → libs/rendering/src/
  └─ Herramienta de sync con el CMS → libs/integrations/src/

    ⚠ Hay SIETE librerías y esta guía sólo enruta a cuatro. Las otras tres
      —libs/shells/, libs/shop/, libs/transaction-engine/— existen, tienen
      alias en platforms/angular/tsconfig.json y nadie escribió cuándo va algo
      ahí. No se inventa acá: es trabajo de la épica #40.

    ⚠ Y falta un cuarto tier del design system: libs/shared/src/components/states/
      (empty-state, error-state, skeleton, status-banner) — lo que una pantalla
      enseña cuando NO hay nada que enseñar.

¿Es un Web Component para el CDN?
  → platforms/angular/apps/elements/<tier>/<nombre>/src/
    (Angular es hoy LA única plataforma que publica elementos. El contrato del
     CDN conserva el segmento /angular/ en las rutas y `FrameworkKind` sigue
     existiendo — reintroducir otra plataforma es posible, no existe.)

¿Es una experiencia interactiva rica?
  → platforms/angular/apps/experiences/<nombre>/src/

¿Es un script de build / publish / gate?
  → tools/          (el script)
    tools/lib/      (su lógica + su .spec.mjs — los gates viven acá)

¿Es documentación arquitectónica?
  → SynergosDocs/
```

---

## 3. Promoción: cuándo algo de `libs/shared` se muda a `vitals`

**Al SEGUNDO consumidor, y el segundo consumidor es el segundo framework.** No
antes. Mover lógica a `vitals` teniendo un solo framework es adivinar qué va a
necesitar el siguiente, y el precio de adivinar mal es una frontera que ya no
dice nada.

Lo que sí se hace hoy, y cuesta poco: **medir**. Hay una medición hecha de qué
parte de `libs/shared` es lógica que React necesitaría igual y hoy está atrapada
dentro de un componente — `SynergosDocs/FRONTERA_VITALS.md`, §«Candidatos». La
lista es materia prima para el día que exista el segundo `shared`, no una cola
de trabajo para hoy.

---

## 4. Los tres vitales, y qué es cada uno

| Paquete | Qué es | Lenguaje |
|---|---|---|
| `vitals/contracts` | Los tipos del acople CMS↔UI + el registro de elementos | TypeScript |
| `vitals/core` | Modelos, mappers, bridge, logger | TypeScript |
| `vitals/core-assets` | **El `shared` de estilos**: tokens, mixins, tipografía | SCSS |

`vitals/core-assets` **no es un cuarto vital de TypeScript**: es el `shared` de
la única capa que los cuatro frameworks consumen **sin traducir**. Un token CSS
no se reescribe para React — se importa igual. Ver §4 de
`SynergosDocs/FRONTERA_VITALS.md` para la decisión y lo que implica.

**Antes de crear un `vitals/` nuevo**, la pregunta es la de siempre: *¿cabe en
uno de los tres?* Casi siempre sí. Uno nuevo necesita justificación escrita.

---

## 5. La regla que no se olvida

**La dirección de los imports es siempre hacia adentro.**

```
apps/elements  →  libs/shared  →  libs/core  →  vitals/*
                                                vitals/core → vitals/contracts
                                                vitals/contracts → (nada)
```

Si tu import va al revés, el sitio está mal. Mové el código a la capa a la que
de verdad pertenece — no aflojes la regla.

---

## 6. Registrar un elemento nuevo

Todo Custom Element se registra en `vitals/contracts/src/element-registry.json`
**antes** de escribir código:

```json
{ "name": "my-element", "alias": "elementCompMyElement", "tag": "synergos-my-element", "tier": "composition" }
```

Y después sus inputs en `vitals/contracts/src/element-inputs.json`.

⚠ `cms-sync` **adivina el tier** de lo que no conoce y lo degrada a
`composition`, lo que baja el techo del presupuesto de tamaño en silencio
(regla 2 del `CLAUDE.md`). Mirá los WARN antes de correr `cms:sync`.
