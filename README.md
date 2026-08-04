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
├── platforms/angular/        # LA plataforma — catálogo de 136 elementos
│   ├── apps/elements/        # Web Components (primitives/, compositions/, modules/)
│   ├── apps/experiences/     # Experiencias interactivas ricas
│   ├── libs/core/            # Providers, tokens, environment config
│   ├── libs/shared/          # Design system (foundations/, components/, patterns/)
│   ├── libs/core-assets/     # Tokens SCSS y mixins
│   ├── libs/rendering/       # ElementRegistry, ComponentResolver, InputMapper
│   ├── libs/integrations/    # CMS sync tooling
│   ├── modules/              # Git submodules (módulos de negocio independientes)
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
| Testing | Vitest — solo specs de la raíz; los tests de Angular están suspendidos (pendiente: recablear a vitest) |
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
npm run build:angular        # Los 136 elementos + libs, AOT completo (~26 s)
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
npm test                     # Solo specs de la raíz (cdn-cache-policy)
```

Los tests unitarios de Angular están **suspendidos** desde la purga de Nx (el runner era
el executor `@angular/build:unit-test`). Los `.spec.ts` siguen en el árbol; recablearlos
a vitest con compilación Angular es un pendiente declarado, no un olvido.

### Release

```bash
npm run release:cdn          # build + validate + publish (tools/release-cdn.mjs)
npm run contracts:validate   # el gate: registry × mappers × models × inputs
```

---

## Paquetes agnósticos (vitals/)

Compartidos vía aliases de `tsconfig.base.json` — consumidos directo del source, sin npm:

| Paquete | Alias | Propósito |
|---|---|---|
| `vitals/contracts/` | `@synergos/contracts` | Interfaces TS puras, taxonomía de elementos |
| `vitals/core/` | `@synergos/core` | Mappers, bridge protocol, utilidades |
| `vitals/core-assets/` | — | Tokens SCSS, mixins |

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
| `libs/shared/` | `@synergos/shared` | Design system components |
| `libs/core-assets/` | `@synergos/core-assets` | Tokens SCSS (copia Angular) |
| `libs/rendering/` | `@synergos/rendering` | Element rendering pipeline |
| `libs/integrations/` | `@synergos/integrations` | CMS sync tooling |

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
