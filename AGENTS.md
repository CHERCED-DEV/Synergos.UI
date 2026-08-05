# Synergos UI — Codex Agent Config

## Governance
All code generation MUST follow `LLM.txt` in the workspace root.
Architecture documentation is in `SynergosDocs/` — read the relevant doc before generating code.

## Stack
- Angular ~21 — la única plataforma que publica elementos al CDN
- Build propio: `platforms/angular/tools/build.mjs` (un NgtscProgram + un esbuild — **sin Nx**)
- TypeScript ~5.9 (strict, private fields `#`)
- SCSS with Sass modules (`@use` / `@forward`, never `@import`)
- Tests: vitest. Los specs de Angular se **compilan AOT** antes de correr (`tools/build-specs.mjs`) — los signal inputs no existen en JIT, así que un transpilador al vuelo haría que los tests corran y mientan

> **Historia multi-framework:** react/svelte/vanilla eran andamiaje sin elementos
> publicados y se eliminaron. El contrato del CDN conserva `/angular/` en las rutas
> y los tipos `FrameworkKind` siguen existiendo, así que otra plataforma puede
> reintroducirse — hoy no existe ninguna.

## Project structure
```
platforms/angular/     → LA plataforma
  apps/elements/       → Web Components (primitives/, compositions/, modules/)
  apps/experiences/    → Experiencias interactivas ricas
  libs/core/           → Angular providers, tokens, interceptors, services
  libs/shared/         → Angular design system (foundations/, components/, patterns/)
  libs/core-assets/    → SCSS design tokens and mixins
  libs/rendering/      → ElementRegistry, ComponentResolver, InputMapper
  libs/integrations/   → CMS sync tooling
  modules/             → Feature modules (Git submodules)
  tools/build.mjs      → El build unificado (--watch, --solo=a,b)
  cdn.config.mjs       → Externals del CDN — contrato del navegador (antes en nx.json)
vitals/
  contracts/           → Pure TS interfaces (element-registry.json, element-inputs.json)
  core/                → Agnostic utilities, mappers, bridge protocol
  core-assets/         → SCSS design tokens (source of truth)
tools/                 → build-runtime, build-cdn, publish, catalog, validadores
public/                → Salida de build:cdn — lo sirve Cloudflare Workers (worker/ + wrangler.jsonc)
SynergosDocs/          → Architecture docs
LLM.txt                → Full AI governance rules
```

## Key rules (summary — full rules in LLM.txt)
- `standalone: true` + `ChangeDetectionStrategy.OnPush` on every component
- `input()` / `output()` — never `@Input()` / `@Output()`
- `signal()` for all state — never `BehaviorSubject`
- `inject()` — never constructor injection
- Design system files: no `.component.ts` suffix → `button.ts`, `card.ts`, `data-grid.ts`
- Feature files: `feature.container.ts`, `feature.store.ts`, `feature.api.ts`
- Agnostic packages (vitals/) shared via tsconfig paths, NOT npm
- `platforms/angular/` tiene su propio node_modules/ — la raíz NO es workspace de npm
- vitals/ NUNCA importa de la plataforma
- No circular dependencies

## Crear un elemento nuevo (no hay generadores)

El build descubre los elementos por el **filesystem**: cada carpeta bajo
`platforms/angular/apps/` con un `src/main.ts` es un elemento, y el nombre de la
carpeta es su nombre en `dist/`. No hay `project.json` ni registro de build que tocar.

1. Carpeta: `platforms/angular/apps/elements/<tier>/<nombre>/src/`
   (tier: `primitives/` | `compositions/` | `modules/`)
2. `src/main.ts` con el patrón de bootstrap:

```ts
import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app.config';
import { MiElementoComponent } from './mi-elemento/mi-elemento';

createApplication(appConfig).then((appRef) => {
  if (!customElements.get('synergos-mi-elemento')) {
    customElements.define(
      'synergos-mi-elemento',
      createCustomElement(MiElementoComponent, { injector: appRef.injector }),
    );
  }
});
```

3. Entrada en `vitals/contracts/src/element-registry.json` — el campo `name`
   gobierna la ruta CDN, no el tag.
4. Sus inputs en `vitals/contracts/src/element-inputs.json`.
5. `npm run build:angular` — el build lo encuentra solo. Para iterar:
   `node tools/build.mjs --solo=mi-elemento` desde `platforms/angular/`.

## Build commands
```bash
# Desde la raíz
npm run build:angular          # Los 136 elementos + libs, AOT completo (~26 s)
npm run build:runtime          # Runtime compartido (linker de Angular incluido)
npm run build:cdn              # Arma public/ completo: vitals + elementos + runtime + registry + catálogo
npm test                       # Gates de tools/lib + los specs de Angular (compila AOT primero)

# El ciclo editor→navegador (issue #2)
npm run dev:cdn                     # sirve el CDN entero desde el watch incremental
npm run dev:cdn -- --solo=badge     # sólo ese elemento — arranca en segundos
#   El CMS lo consume por su ruta normal, sin código de desarrollo:
#     SYNERGOS_CDN_MODE=Http · SYNERGOS_CDN_URL=http://localhost:4321

# Desde platforms/angular/
npm run dev                    # build.mjs --watch (incremental, reusa el programa)
node tools/build.mjs --solo=badge,hero   # solo esos elementos
```
