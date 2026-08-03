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

Cuatro tipos en `.github/ISSUE_TEMPLATE/`:

- **🐛 Defecto** — y sobre todo *por qué los tests no lo vieron* y *qué mutación lo reproduce*.
- **✨ Evolutivo** — qué problema del negocio, dónde vive, qué rechaza, cómo sabemos que quedó bien.
- **🔧 Mejora** — y *por qué ahora y no después*.
- **🔍 Hallazgo** — encontré algo haciendo otra cosa.

> **La regla que hace que no estorbe:** si encontrás algo mientras hacés otra cosa, **abrís un
> Hallazgo y SEGUÍS con lo que estabas**. Un hallazgo no puede comerse la tarea; para eso existe
> ese tipo, para soltarlo sin perderlo.

**Y lo que hace que el proyecto aprenda:** toda regla nueva se escribe en este fichero **en el
mismo commit que la enseñó**. Una sesión nueva arranca fría — lo que no esté acá, no existe.

Es el mismo proceso en los tres árboles: este repo, el CMS y las capacidades/orquestadores. Lo
que cambia por repo es la definición de hecho (ver `.github/pull_request_template.md`).

## MCP Servers (auto-loaded from .mcp.json)
- `angular-cli` → Angular CLI MCP (`npx @angular/cli mcp`)
- `nx`          → Nx MCP (`npx nx-mcp@latest`)

## Key tools available via MCP
- `angular-cli`: generate components, services, guards, pipes, directives, routes, specs
- `nx`: workspace graph, affected projects, project details, run targets

## Workspace layout
```
platforms/           → Framework workspaces (each with own node_modules)
  angular/           → Angular ~21 (main framework, Elements catalog)
  react/             → React POC (hero Web Component)
  svelte/            → Svelte POC (hero Web Component)
  vanilla/           → Vanilla JS POC (hero Web Component)
vitals/              → Shared agnostic packages (consumed via tsconfig paths)
  contracts/         → Pure TS interfaces (element taxonomy, CMS contracts)
  core/              → Agnostic utilities, mappers, bridge protocol
  core-assets/       → SCSS design tokens, mixins, typography
  shared/            → Constants, validators, test utilities
tools/               → Interactive CLI (`npm run cli`)
```

## Quick reference
- Stack: Angular ~21, Nx 22, TypeScript ~5.9, SCSS (Sass modules), Vitest
- Multi-framework: Angular (main) + React, Svelte, Vanilla (POCs)
- Agnostic aliases: `@synergos/contracts`, `@synergos/core`, `@synergos/shared`
- Angular aliases: `@synergos/core` → `libs/core/`, `@synergos/shared` → `libs/shared/`, etc.
- Component prefix: `syn-`
- State: `signal()` only — no BehaviorSubject, no Zone.js
- Build output: CDN deployment (no local wwwroot)
- Full rules: see `LLM.txt`
