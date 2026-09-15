# Synergos UI

Web Components de **Angular** publicados a un CDN — widgets desacoplados que el CMS Umbraco de **Synergos** consume vía `<script type="module">` e import-map.

```
synergos/
  cms/    → Umbraco CMS (host, Razor views)
  api/    → .NET Backend APIs
  ui/     → Este repositorio (Angular Elements → CDN)
```

> **Historia multi-framework:** las plataformas react/svelte/vanilla eran andamiaje
> sin elementos publicados y se eliminaron, igual que Nx (cada uno de los 136
> elementos era una "application" independiente = 136 arranques del compilador de
> Angular, con el caché además deshabilitado; el build tardaba minutos y murió por
> timeout en Cloudflare). El contrato del CDN conserva el segmento `/angular/` en
> las rutas y los tipos `FrameworkKind` siguen existiendo, así que reintroducir
> otra plataforma sigue siendo posible — hoy no existe ninguna otra.

---

## Arquitectura

```
synergos-ui/
├── platforms/angular/        # LA plataforma — 127 fuentes con src/main.ts
│   ├── apps/elements/        # Web Components (primitives/, compositions/, modules/)
│   ├── apps/experiences/     # Experiencias interactivas ricas
│   ├── libs/core/            # Providers, tokens, environment config
│   ├── libs/shared/          # Design system (primitives/, compositions/, patterns/, states/)
│   ├── libs/rendering/       # ElementRegistry, ComponentResolver, InputMapper
│   ├── libs/integrations/    # CMS sync tooling
│   ├── libs/shells/          # Shells por vertical
│   ├── libs/shop/            # Dominio tienda
│   ├── libs/transaction-engine/  # Motor de transacción
│   ├── modules/              # VACÍO hoy: sólo un README; .gitmodules no registra ninguno
│   ├── tools/build.mjs       # EL build: un NgtscProgram + un esbuild (~26 s)
│   └── cdn.config.mjs        # Externals del CDN — contrato del navegador
├── vitals/                   # Paquetes agnósticos (compartidos via tsconfig paths)
│   ├── contracts/            # Interfaces TS puras (element-registry.json, element-inputs.json)
│   ├── core/                 # Utilidades agnósticas, mappers, bridge protocol
│   └── core-assets/          # Tokens SCSS (fuente de verdad)
├── tools/                    # build-runtime, build-cdn, publish, catalog, validadores
├── public/                   # Salida de build:cdn — lo que se sirve como CDN
├── worker/                   # Cloudflare Worker que sirve public/
├── wrangler.jsonc            # Config del Worker
├── tsconfig.base.json        # Aliases agnósticos
└── package.json              # Scripts raíz
```

### Cómo funciona en producción

1. Cada elemento se compila como Custom Element (`synergos-*`) en un bundle propio de ~2 KB
2. Lo pesado (Angular, `@synergos/core`, `@synergos/shared`) queda FUERA del bundle como
   bare import y lo resuelve el import-map del runtime compartido — veinte elementos en
   una página comparten UN solo Angular
3. `npm run build:cdn` arma `public/` completo (vitals + elementos + runtime + registry +
   catálogo) y Cloudflare Workers lo sirve
4. Las vistas Razor de Umbraco cargan el bundle vía `<script type="module">`

### Flujo de dependencias

```
vitals/contracts   → Interfaces puras (el QUÉ)
       ↓
vitals/core        → Implementaciones agnósticas (el CÓMO) + bridge protocol
       ↓
vitals/core-assets → Tokens SCSS (el LOOK)
       ↓
platforms/angular/ → Consume vitals/ vía tsconfig paths
```

---

## Stack

| Herramienta | Versión / rol |
|---|---|
| Angular | ~21.1 (Zoneless, Standalone APIs, Signals) |
| Build | `platforms/angular/tools/build.mjs` — @angular/compiler-cli (AOT) + esbuild, sin Nx |
| TypeScript | ~5.9 |
| SCSS | Sass modules (`@use` / `@forward`) |
| Testing | Vitest — `npm test` corre los dos: gates de `tools/lib` y specs de la plataforma, compilados AOT antes (`build-specs.mjs`) |
| Hosting CDN | Cloudflare Workers (`wrangler.jsonc` + `worker/index.js`) |

---

## Primeros pasos

### Prerequisitos
- Node.js >= 20
- npm >= 10

### Instalación

La raíz NO es un workspace de npm — `platforms/angular/` tiene su propio lockfile:

```bash
npm ci
npm ci --prefix platforms/angular
```

(`npm run build:cdn` verifica e instala las dependencias de la plataforma él solo.)

### Build

```bash
npm run build                # vitals + elementos Angular + runtime
npm run build:angular        # Las 127 fuentes + libs, AOT completo (~30 s)
npm run build:runtime        # Runtime compartido (Angular + sg-core + sg-shared)
npm run build:cdn            # Arma public/ completo para servir como CDN
```

Iteración local (desde `platforms/angular/`):

```bash
npm run dev                            # build.mjs --watch — incremental, reusa el programa
node tools/build.mjs --solo=badge,hero # solo esos elementos
```

### Crear un elemento nuevo

No hay generadores: carpeta en `platforms/angular/apps/elements/<tier>/<nombre>/src/`
con un `main.ts` (patrón `createApplication` → `createCustomElement` →
`customElements.define`), entrada en `vitals/contracts/src/element-registry.json` y sus
inputs en `element-inputs.json`. El build lo descubre solo por el filesystem.
Receta completa: `AGENTS.md`.

### Test

```bash
npm test                     # los dos: gates de tools/lib + specs de la plataforma
npm run test:tools           # sólo los gates — sin SDK, sin red, < 4 s
npm run test:angular         # sólo la plataforma (compila AOT primero, ~35 s)
```

Medido el 2026-09-15: **213 + 1.580 tests en verde**, 239 ficheros `.spec.ts`, cero
`it.skip` — y que la cuarentena siga en cero lo defiende el gate `spec-quarantine`.

Los specs se **compilan AOT** antes de correr, con el mismo ngtsc que publica los
elementos: los signal inputs de Angular no funcionan en JIT, así que un transpilador al
vuelo haría que los tests **corran y mientan**.

(Esta sección decía que los tests estaban «suspendidos» desde la purga de Nx. Se
recablearon en el issue #1 y el README no se movió — épica #40.)

### Release

```bash
npm run release:cdn          # build + validate + publish (tools/release-cdn.mjs)
npm run contracts:validate   # el gate completo: sync:tokens:check + element:audit + manifest:validate + cms:validate + cms:sync:check
```

---

## Paquetes agnósticos (vitals/)

Compartidos vía aliases de `tsconfig.base.json` — consumidos directo del source, sin npm:

| Paquete | Alias | Propósito |
|---|---|---|
| `vitals/contracts/` | `@synergos/contracts` | Interfaces TS puras, taxonomía de elementos |
| `vitals/core/` | `@synergos/core` (raíz) · `@synergos/vitals-core` (dentro de Angular) | Mappers, bridge protocol, utilidades |
| `vitals/core-assets/` | `@synergos/core-assets` | Tokens SCSS, mixins |

> **El alias `@synergos/core` significa cosas distintas según dónde se resuelva**, y
> conviene saberlo antes de perder media hora: `tsconfig.base.json` lo manda a
> `vitals/core/`, y `platforms/angular/tsconfig.json` lo **pisa** con `libs/core/`,
> dejando el vital bajo `@synergos/vitals-core`. Desde un elemento Angular,
> `@synergos/core` es la librería de la plataforma.

### Uso de SCSS

```scss
@use 'scss' as syn;

.my-component {
  color: syn.$color-primary;
  @include syn.flex-center;
}
```

---

## Librerías Angular (platforms/angular/libs/)

| Librería | Alias | Propósito |
|---|---|---|
| `libs/core/` | `@synergos/core` | Providers, tokens, environment, services |
| `libs/shared/` | `@synergos/shared` | Design system: `primitives/`, `compositions/`, `patterns/`, `states/` |
| `libs/rendering/` | `@synergos/rendering` | Element rendering pipeline |
| `libs/integrations/` | `@synergos/integrations` | CMS sync tooling |
| `libs/shells/` | `@synergos/shells` | Shells por vertical |
| `libs/shop/` | `@synergos/shop` | Dominio tienda |
| `libs/transaction-engine/` | `@synergos/transaction-engine` | Motor de transacción |

Son **siete**, y los siete alias están en `platforms/angular/tsconfig.json`.
No hay `libs/core-assets/`: los tokens viven en `vitals/core-assets/` y
`@synergos/core-assets` apunta ahí (épica #40).

En el navegador, `@synergos/core` y `@synergos/shared` se resuelven por import-map al
runtime compartido; el resto se empaqueta dentro del elemento que lo usa
(ver `platforms/angular/cdn.config.mjs`).

---

## Convenciones

| Convención | Regla |
|---|---|
| Nombres de fichero | `kebab-case` |
| Prefijo de selector | `syn-` |
| Tag del custom element | `synergos-<name>` |
| Change detection | `OnPush` en todo |
| Zone.js | Deshabilitado — `provideZonelessChangeDetection()` |
| Estado | Angular Signals |
| Estilos | SCSS con `@use` (nunca `@import`) |
| Exports | Todo el API público por `src/index.ts` |

---

## Layout del CDN publicado

El layout no cambió con la purga — `tools/publish.mjs` sigue intacto:

```
synergos/<name>/angular/{semver, vN, latest}/
  main.js + manifest.json + meta.json
registry.json      → índice global de elementos publicados
contracts.json     → contrato para el CI del CMS
```

Documentación completa del pipeline: `SynergosDocs/BUILD_PIPELINE.md`.

> **Antes de creerle a un documento de este repo**, mirá
> [`SynergosDocs/MEDICION_DOCUMENTACION.md`](SynergosDocs/MEDICION_DOCUMENTACION.md)
> (épica #40): qué afirma cada uno que el disco desmiente, cuáles llevan banner de
> desactualizado y por qué, y dónde se rompe el camino de quien entra hoy.
