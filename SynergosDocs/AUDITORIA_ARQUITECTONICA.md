# SYNERGOS.UI — AUDITORÍA ARQUITECTÓNICA EXHAUSTIVA

---

## 1. COMPRENSIÓN DEL PROBLEMA

Synergos.UI no es una aplicación web: es un **sistema de distribución de componentes empaquetados como Custom Elements**, orquestado por Nx, producido por múltiples frameworks, consumido desde CDN por un CMS (Umbraco) que no sabe nada del repo. Eso lo convierte en algo fundamentalmente distinto a una SPA o una librería típica.

El reto de pilotear este sistema no es solo de código: es de modelo mental. Para operar correctamente aquí, una persona necesita entender:

- La diferencia entre `vitals/` (agnóstico) y `platforms/` (framework-específico)
- La diferencia entre `@synergos/core` en root y `@synergos/core` en Angular (son dos cosas distintas)
- Por qué hay dos workspaces de Nx y cómo no mezclarlos
- Qué es `element-inputs.json` y por qué existe separado del código
- Qué es el runtime bundle y por qué los elementos lo necesitan externally
- Qué hace `contracts:validate` y por qué es obligatorio antes de publicar
- Qué son los 3 version slots y cuándo usar cada uno
- Cómo conviven `ElementData` (dominio semántico CMS) y `ElementConfig` (atributos HTML planos)

Sin ese modelo mental completo, un desarrollador competente puede **romper contratos sin saberlo**, publicar sin validar, mezclar workspaces, usar el alias equivocado de `@synergos/core`, o añadir un input al código sin declararlo en `element-inputs.json`.

La complejidad no es innecesaria en su mayor parte. Es la complejidad real de un sistema de distribución multi-framework con contratos formales hacia un consumidor externo. **La pregunta no es si simplificar radicalmente, sino dónde la complejidad está bien gestionada y dónde es accidental o invisible.**

---

## 2. CRITERIOS DE AUDITORÍA

Para esta evaluación se usaron los siguientes criterios, en orden de impacto:

| Dimensión | Pregunta central |
|---|---|
| **Cognitiva** | ¿Cuánto contexto previo necesita un developer para operar sin romper nada? |
| **Arquitectónica** | ¿Están las responsabilidades bien divididas y los acoplamientos justificados? |
| **Operativa** | ¿Qué tan reproducible, predecible y seguro es el ciclo build-test-publish? |
| **Nx** | ¿Nx está aportando orden real o solo es un contenedor con overhead? |
| **Multi-framework** | ¿La coexistencia de frameworks escala sin fricciones ocultas? |
| **CDN/runtime** | ¿El modelo de distribución es claro, trazable y seguro? |
| **Gobernanza** | ¿Las reglas existen, son visibles, son ejecutables automáticamente? |
| **Mantenibilidad** | ¿Qué tan difícil es incorporar un nuevo elemento, framework o desarrollador? |

---

## 3. MAPA DEL MONOREPO ACTUAL

### Árbol estructural real (condensado)

```
Synergos.UI/
│
├── platforms/                    ← Workspaces de frameworks (node_modules aislados)
│   ├── angular/                  ← Workspace principal (Nx propio, 38+ proyectos)
│   │   ├── apps/
│   │   │   ├── elements/
│   │   │   │   ├── primitives/   ← 32 elementos atómicos
│   │   │   │   ├── compositions/ ← 20 composiciones
│   │   │   │   └── modules/      ← 14 módulos (+ integración: macro-host, mf-host...)
│   │   │   └── experiences/      ← 3 experiencias ricas (feature-journey, insight-explorer, media-explorer)
│   │   ├── libs/
│   │   │   ├── core/             ← Providers, tokens, interceptors Angular
│   │   │   ├── shared/           ← Design system (foundations/ → components/ → patterns/)
│   │   │   ├── core-assets/      ← SCSS tokens (COPIA de vitals/core-assets)
│   │   │   ├── rendering/        ← ElementRegistry, ComponentResolver, InputMapper, ElementMounter
│   │   │   └── integrations/     ← CMS sync tooling
│   │   └── modules/              ← Git submodules (features de negocio independientes)
│   │
│   ├── react/                    ← POC: 3-4 elementos, Nx root, Vite
│   ├── svelte/                   ← POC: 2-3 elementos, Nx root, Vite
│   └── vanilla/                  ← POC: 1 elemento (hello-world), Nx root, Vite
│
├── vitals/                       ← Paquetes agnósticos (compartidos vía tsconfig paths)
│   ├── contracts/                ← Interfaces TS + element-registry.json + element-inputs.json
│   │   └── src/generated/        ← 8 archivos auto-generados (¿cuándo? ¿por quién?)
│   ├── core/                     ← Mappers (50+), bridge/, models/, services/
│   ├── core-assets/              ← SCSS tokens FUENTE DE VERDAD
│   └── shared/                   ← Utils, validators, vite-base.ts (para React/Svelte/Vanilla)
│
├── tools/                        ← 9 scripts .mjs (cli, publish, build-runtime, manifest-gen...)
│
├── SynergosDocs/                 ← Documentación arquitectónica (16 archivos, ~3000 líneas)
│   ├── ARCHITECTURE.md
│   ├── BUILD_PIPELINE.md
│   ├── ELEMENT_CONTRACT.md
│   ├── INTEGRATION_GOVERNANCE.md
│   ├── NX_GOVERNANCE.md
│   ├── OUTPUT_POLICY.md
│   ├── DESIGN_SYSTEM.md
│   ├── WIDGET_INTEGRATION.md
│   ├── ANGULAR_STANDARDS.md
│   ├── WHERE_DOES_THIS_GO.md
│   ├── ONBOARDING.md
│   └── ... (5 más)
│
├── LLM.txt                       ← Governance para agentes IA (442 líneas)
├── nx.json                       ← Workspace root (React/Svelte/Vanilla/Vitals)
├── tsconfig.base.json            ← Path aliases agnósticos
└── package.json                  ← 41 scripts, Node devDeps solo (Nx, cross-env, glob, inquirer)
```

### Runtimes y artefactos que produce

| Framework | Artefacto | Tamaño típico | Destino CDN |
|---|---|---|---|
| Angular (CDN mode) | IIFE bundle por elemento | ~5-15 KB | `/synergos/{name}/angular/{slot}/main.js` |
| Angular (runtime) | ng-core, ng-common, sg-shared... (6 bundles) | ~395 KB total | `/synergos/runtime/angular/{slot}/` |
| React | IIFE bundle por elemento | ~20-80 KB | `/synergos/{name}/react/{slot}/main.js` |
| Svelte | IIFE bundle por elemento | ~10-40 KB | `/synergos/{name}/svelte/{slot}/main.js` |
| Vanilla | IIFE bundle por elemento | ~2-10 KB | `/synergos/{name}/vanilla/{slot}/main.js` |
| Metadatos | manifest.json por elemento | ~2-3 KB | `/synergos/{name}/{fw}/{slot}/manifest.json` |
| Índice global | registry.json | ~50-80 KB | `/synergos/registry.json` |
| Contrato CMS | contracts.json | ~100-150 KB | `/synergos/contracts.json` |
| Import map | import-map.json | ~2 KB | `/synergos/runtime/angular/{slot}/import-map.json` |

---

## 4. HALLAZGOS: COMPLEJIDAD COGNITIVA

### 4.1 El alias `@synergos/core` apunta a dos cosas diferentes — RIESGO ALTO

Este es el hallazgo cognitivo más peligroso del proyecto.

- En `tsconfig.base.json` (root): `@synergos/core` → `vitals/core/src/index.ts`
- En `platforms/angular/tsconfig.json` (override): `@synergos/core` → `libs/core/src/index.ts`

Un desarrollador que vea `import { ... } from '@synergos/core'` en código Angular y en código React está leyendo el **mismo alias** que referencia **dos librerías completamente distintas**. El alias override está documentado en MEMORY.md y en docs, pero no hay ningún guard automático que advierta si se usa el alias equivocado.

**Problema real:** Un desarrollador nuevo que escribe código fuera de Angular (en vitals/ o en tools/) y usa `@synergos/core` obtendrá la versión agnóstica. Si el mismo código se mueve dentro de Angular, resuelve diferente. Error silencioso.

### 4.2 Dos copias de SCSS tokens (vitals/core-assets ↔ libs/core-assets)

La fuente de verdad SCSS está en `vitals/core-assets/`. Existe una copia sincronizada en `platforms/angular/libs/core-assets/`.

La documentación dice que Angular usa su propia copia. Pero en ningún lugar existe un mecanismo automatizado que sincronice ambas copias ni un test que valide que están en sincronía.

**Problema real:** Una persona que actualiza tokens en `vitals/core-assets/` pero no en `libs/core-assets/` (o viceversa) produce divergencia silenciosa entre frameworks.

### 4.3 `element-inputs.json` — archivo de 2828 líneas como contrato paralelo

Cada elemento debe tener sus inputs declarados en `vitals/contracts/src/element-inputs.json` **además** de estar codificados como `input()` signals en el componente Angular.

Esta duplicación es intencional (permite validación de contrato sin compilar Angular), pero:
- No hay ningún linter/codegen que derive `element-inputs.json` del código fuente
- El desarrollador debe actualizar ambos manualmente y en sincronía
- La única forma de detectar desincronía es correr `npm run contracts:validate`

**Problema real:** En iteraciones rápidas, los inputs del código y los declarados en JSON pueden divergir durante días antes de que alguien corra la validación.

### 4.4 Archivos generados en `vitals/contracts/src/generated/` — opacidad de origen

Hay 8 archivos `.generated.ts` en `vitals/contracts/src/generated/`. No está claro desde el nombre de ningún script root qué comando los regenera, cuándo se deben regenerar, o si están commiteados.

**Problema real:** Un developer que modifica `element-registry.json` no sabe si debe regenerar los tipos, o si ocurre automáticamente.

### 4.5 `platforms/angular/modules/` con git submodules

La carpeta `modules/` usa git submodules para features de negocio independientes. Los git submodules son notoriamente difíciles de operar: clones sin `--recursive`, sync manual tras pull, resolución de conflictos diferente.

**Problema real:** Un `git clone` sin `--recurse-submodules` produce un estado silenciosamente incompleto.

### 4.6 Dos conceptos de "elemento" con nombres similares

Existe `ElementData` (modelo semántico de dominio CMS: objetos anidados, nesting profundo) y `ElementConfig` (payload plano de atributos HTML: strings, números).

La diferencia es fundamental para el correcto funcionamiento de la integración CMS, pero:
- Los nombres son similares
- La transformación entre ambos ocurre en los **mappers** de `vitals/core/src/mappers/`, no en el elemento
- El elemento Angular solo conoce `ElementConfig`; nunca debe recibir `ElementData`

**Problema real:** Un developer que pasa `ElementData` directamente a un elemento crea un bug difícil de detectar (inputs reciben objetos en lugar de strings; el componente puede silenciar el error o renderizar `[object Object]`).

### 4.7 41 scripts en root `package.json` sin agrupación visual

Los scripts están bien nombrados pero hay 41. No hay separación semántica, comentarios, ni agrupación. La navegación mental requiere leer todos para encontrar el comando correcto.

**Problema real:** Overhead cognitivo en el día a día, especialmente para scripts menos frecuentes (dry runs, por-framework releases, catalog, etc.).

### 4.8 `NX_WORKSPACE_ROOT_PATH` — conocimiento tribal crítico

Si Angular Nx se ejecuta en una shell donde el daemon root ya seteó `NX_WORKSPACE_ROOT_PATH`, los comandos Angular fallan silenciosamente usando el workspace equivocado. El fix (`unset NX_WORKSPACE_ROOT_PATH`) está en los scripts root pero no en la documentación de troubleshooting más visible.

**Problema real:** Cualquier desarrollador que invoca Angular Nx manualmente (sin los scripts root) puede reproducir builds incorrectos.

### 4.9 La distinción `elements` vs `experiences` no es evidente desde la carpeta

Las reglas arquitectónicas de una "experience" (state class, use-cases, adapter, infraestructure layer, domain layer) son radicalmente distintas de un "element" (input signals, computed, template). Pero desde `apps/` se ven como carpetas paralelas.

Un developer que añade una experience siguiendo el patrón de un element producirá código que viola la arquitectura sin error en compilación ni lint.

### Resumen de cargas cognitivas

| Nivel | Área |
|---|---|
| **Alta** | Alias `@synergos/core` dual; `NX_WORKSPACE_ROOT_PATH`; runtime bundle model; `element-inputs.json` como contrato paralelo |
| **Media** | Slots CDN (`/semver/`, `/v{major}/`, `/latest/`); `ElementData` vs `ElementConfig`; `scope:elements` no puede importar `scope:rendering`; patrón `coerceConfigInput` + `resolveConfigValue` |
| **Baja** | Estructura de cada elemento; tags Nx; patrones Angular modernos; jerarquía design system; versionado semántico |

---

## 5. HALLAZGOS: COMPLEJIDAD ARQUITECTÓNICA

### 5.1 Bien: Las tres capas están limpias y las fronteras son reales

```
vitals/  (agnóstico)
  ↓ solo via tsconfig paths, no npm
platforms/angular/libs/  (design system + core Angular)
  ↓ solo via @synergos/* aliases
platforms/angular/apps/elements + experiences  (artefactos finales)
```

Esta separación es real, está enforceada por ESLint boundaries, y es estructuralmente sana. **Preservar.**

### 5.2 Bien: `vitals/core/src/bridge/` — valor real si se usa

El bridge protocol (element-protocol, input-serializer, lifecycle-hooks) define cómo un Custom Element comunica su ciclo de vida de forma agnóstica al framework. Si todos los POCs lo implementan correctamente, esto es infraestructura valiosa.

**Señal de alerta:** Con solo 3-4 elementos en React y 2-3 en Svelte, es difícil saber si el bridge está siendo usado consistentemente o si cada POC lo implementa ad hoc. Esto requiere verificación.

### 5.3 Riesgo: `rendering/` lib acoplada a Angular pero con propósito agnóstico

`platforms/angular/libs/rendering/` contiene `ElementRegistry`, `ComponentResolver`, `InputMapper`, `ElementMounter`. Estos son mecanismos del runtime Angular de elementos. La frontera scope (`scope:rendering` no puede ser importado por `scope:elements`) es correcta.

**Señal de alerta:** `ElementMounter` y `ComponentResolver` — ¿para qué se usan exactamente si cada elemento se registra en su propio `main.ts`? Si rendering existe para soportar `angular-host` o `mf-host`, eso está bien. Si existe para una ambición de registry dinámico que aún no se usa, es sobreingeniería activa.

### 5.4 Riesgo: Elementos de integración mezclan responsabilidades

`macro-host`, `angular-host`, `mf-host`, `script-embed` están en `apps/elements/modules/` pero no son elementos de contenido — son mecanismos de integración de runtimes. Coexisten con `hero`, `banner`, `feature-grid` en la misma carpeta, creando una mezcla de "contenido" y "plomería". Esto es un problema de naming/organización, no de código.

### 5.5 La capa `experiences` introduce complejidad bien intencionada pero cargada

Las experiences tienen una arquitectura de 4 capas (domain, application, infrastructure, interface) con state explícito, use-cases como funciones puras, y adapters. Esto es correcto para casos de uso complejos.

Con solo 3 experiences actuales, existe riesgo de:
- Over-engineering para experiences que podrían ser compositions simples
- Confusión sobre qué califica como "experience" vs "composition compleja"
- Reglas muy prescriptivas (15 tests mínimos, componentes obligatorios de shared) que sin enforcement automático son solo convención

### 5.6 Bien: Boundary `scope:elements` no puede importar `scope:rendering`

Esta es una decisión arquitectónica excelente: los elementos son ciudadanos de UI puros, agnósticos al mecanismo de rendering. El boundary ESLint lo hace ejecutable. **Preservar.**

### 5.7 Riesgo moderado: `vitals/contracts/src/generated/` files sin pipeline visible

Los archivos `.generated.ts` implican un proceso de generación. Sin ver el comando explícito de regeneración, estos archivos pueden volverse stale y producir tipos incorrectos usados en compilación.

---

## 6. HALLAZGOS: COMPLEJIDAD OPERATIVA

### 6.1 No hay pipeline CI/CD visible en el repositorio

No se encontraron archivos `.github/workflows/`, `.gitlab-ci.yml`, `azure-pipelines.yml`, ni equivalentes. Todo el proceso de release depende de que un desarrollador humano ejecute los comandos correctos en el orden correcto, desde la máquina correcta.

**Riesgo operativo alto:**
- No hay gate automático que bloquee un push que rompe `contracts:validate`
- No hay evidencia de cuándo se publicó qué, ni quién lo hizo
- El `NX_WORKSPACE_ROOT_PATH` gotcha puede golpear en cualquier máquina local
- No hay reproducibilidad garantizada entre entornos

### 6.2 Versionado manual sin herramienta de bumping formal

No hay evidencia de `standard-version`, `semantic-release`, `nx release` configurado de forma automatizada, ni changelogs generados. El versionado parece ser manual.

Con 63+ elementos y potencialmente 3+ frameworks por elemento, el versionado manual es un vector de error: ¿quién decide qué bump? ¿cómo se asegura que un breaking change resulta en MAJOR y no PATCH?

### 6.3 CDN local (`C:\LOCAL_CDN`) con mapeo a producción no documentado

El path de CDN local es `C:\LOCAL_CDN\synergos\`. El script `publish.mjs` escribe ahí. Cómo ese path local se convierte en producción no está visible desde los scripts.

No se encontraron variables de entorno, parámetros CLI, ni configuración de deployment que defina el CDN de producción vs local.

**Riesgo:** El CDN local puede diverger del CDN de producción sin que nadie lo detecte fácilmente.

### 6.4 Bien: La validación pre-publish está automatizada

`npm run contracts:validate` (element:audit + manifest:validate) es un gate sólido. Falla si hay desincronías. **Preservar.**

### 6.5 Bien: `build:angular:changed` usa affected correctamente

`build:angular:changed` usa Nx affected para construir solo proyectos cambiados. Demuestra un uso correcto del grafo Nx. **Preservar.**

### 6.6 Riesgo medio: El release de runtime y el de elementos están acoplados manualmente

El release de Angular requiere: 1) build elements, 2) build runtime, 3) validate, 4) publish runtime, 5) publish elements. Si el runtime cambia pero los elementos no, ¿se republica el runtime con la misma versión? ¿Cómo se detecta ese caso?

### 6.7 Riesgo: `platforms/angular/modules/` (git submodules) en el path de build normal

Si los submodules no están inicializados, el build Angular puede fallar de formas no obvias. No hay documentación de qué pasa si se omite `--recurse-submodules`.

---

## 7. HALLAZGOS: NX Y BOUNDARIES

### 7.1 Bien: Dual Nx workspace es la decisión correcta

La razón es técnicamente sólida: Angular requiere `@angular/compiler-cli`, `zone.js`, `ng-packagr` en el mismo `node_modules` que ejecuta los builds. Poner eso en el root contaminaría React/Svelte/Vanilla y multiplicaría el tiempo de `npm install`.

La solución (workspace Angular aislado en `platforms/angular/`) es la correcta para este caso de uso.

**Lo que hay que mejorar:** La documentación del `NX_WORKSPACE_ROOT_PATH` gotcha debe aparecer de forma prominente en el ONBOARDING y en el README de troubleshooting, no solo en NX_GOVERNANCE.md.

### 7.2 Bien: Tags y boundaries son sólidos

El sistema de tags (`framework:`, `scope:`, `tier:`, `type:`, `element:`) es coherente y el boundary enforcement via ESLint está configurado. Que `scope:elements` no pueda importar `scope:rendering` es una decisión arquitectónica protegida automáticamente.

### 7.3 Hallazgo: `scope:cms-adapter` — riesgo de escape hatch

La regla dice que `scope:cms-adapter` puede importar cualquier scope. Esto es necesario para `macro-host` que hace de puente. Pero si este tag se aplica liberalmente a otros proyectos, se convierte en un escape hatch que hace los boundaries inútiles.

**Verificar:** ¿cuántos proyectos tienen este tag? Si son más de 2-3, hay un problema de gobernanza.

### 7.4 Nx Cloud configurado pero sin CI visible que lo use

El Nx Cloud (ID: `69adc8c549562612ec3b30c7`) está configurado para distribución remota de cache. Sin una pipeline CI que lo use, el beneficio está parcialmente limitado a developers individuales.

### 7.5 Configuración de release en Angular nx.json — solo para libs

La configuración de `release` en `platforms/angular/nx.json` cubre las libs core/shared/rendering. No hay evidencia de que cubra `apps/elements/`, lo que sugiere que el versioning de elementos es manual o está en los scripts de tools/.

### 7.6 Riesgo: Nx affected puede no detectar cambios en vitals/

Si un developer modifica `vitals/core/src/mappers/hero.mapper.ts`, ¿Nx lo refleja como afectando a los proyectos Angular? Dado que vitals/ no son proyectos Nx con `project.json`, el grafo puede no rastrear esas dependencias correctamente.

Esto significaría que `build:angular:changed` después de un cambio en mappers podría no reconstruir los elementos afectados.

---

## 8. HALLAZGOS: ESTRATEGIA MULTI-FRAMEWORK

### 8.1 La estrategia es correcta en principio; el problema es la asimetría de madurez

| Framework | Elementos | Design system | Runtime bundle | Experiences | Governance |
|---|---|---|---|---|---|
| Angular | 63+ | Completo | Sí | 3 | Completo |
| React | ~3-4 | No | No | No | Mínimo |
| Svelte | ~2-3 | No | No | No | Mínimo |
| Vanilla | 1 | No | No | No | Mínimo |

El sistema está diseñado para soportar plenamente múltiples frameworks, pero en la práctica es un sistema Angular con tres POCs. Esto no es un problema si es intencional, pero debe ser explícito.

### 8.2 Los POC no están en el mismo nivel de governance que Angular

Angular tiene: standards doc, element:audit, manifest:validate, contracts:validate, ESLint boundaries, Nx tags, OnPush/zoneless enforcement. Los POCs de React/Svelte/Vanilla no tienen ninguno de esos controles equivalentes.

**Riesgo:** Un elemento React publicado no pasa por el mismo rigor que uno Angular. Puede publicarse con contratos incorrectos.

### 8.3 Bien: vitals/ como capa agnóstica funciona

El diseño donde todos los frameworks pueden consumir `@synergos/contracts`, `@synergos/core`, `@synergos/shared` via tsconfig path aliases es elegante y funciona. No requiere npm linking ni publicación a un registry.

**Señal de alerta:** ¿El bridge protocol (`vitals/core/src/bridge/`) está siendo utilizado realmente en los POCs? Si React y Svelte implementan sus Custom Elements sin usar `element-protocol.ts`, el bridge es infraestructura no utilizada.

### 8.4 Vite base config compartida — bien, pero limitado

`vitals/shared/src/build/vite-base.ts` centraliza la config base de Vite para los 3 POCs. Esto es correcto. Pero si los elementos React/Svelte crecen, cada uno necesitará config específica que vite-base no puede anticipar.

### 8.5 No hay estrategia de parity testing cross-framework

No hay ningún test que verifique que `synergos-hero` en Angular y `synergos-hero` en React producen el mismo output de Custom Element API (mismo tag, mismos atributos, mismos eventos). La paridad semántica entre frameworks es solo convención.

---

## 9. HALLAZGOS: PIPELINE CDN/RUNTIME

### 9.1 Bien: El modelo de 3 slots (semver/major/latest) es sólido

| Slot | Propósito | Cache | Uso |
|---|---|---|---|
| `/{semver}/` | Inmutable, audit trail | Permanente | Debugging, rollback |
| `/v{major}/` | Estable para producción | TTL largo | Umbraco producción |
| `/latest/` | Siempre el último | TTL corto | Staging, desarrollo |

Esta estrategia es correcta y bien pensada. **Preservar.**

### 9.2 Bien: Import map para runtime compartido — excelente decisión de performance

Los 6 bundles del runtime Angular (~395 KB total) se cargan una vez. Cada elemento en CDN mode es ~5-15 KB. Para una página con 10 elementos: ~495 KB vs ~1500 KB en modo standalone (reducción del 60-80%).

La estrategia de externalize Angular core + import map es una decisión de ingeniería muy sólida. **Preservar y documentar como "no tocar sin entender completamente".**

### 9.3 Riesgo alto: Sin validación de sincronía import-map ↔ elementos publicados

Cuando se publican nuevos elementos Angular, estos son compilados contra una versión específica de Angular. El import-map apunta a una versión del runtime. Si el runtime se actualiza pero los elementos no se recompilan, los elementos pueden fallar en runtime al encontrar APIs que no coinciden.

No hay ningún mecanismo visible que valide que todos los elementos publicados fueron compilados contra el mismo Angular que el runtime publicado.

### 9.4 Riesgo alto: CDN de producción no definido en los scripts

El script `publish.mjs` escribe en `C:\LOCAL_CDN`. No hay evidencia de una variable de entorno `CDN_URL`, `CDN_PATH`, ni configuración de staging/producción. El proceso de "subir al CDN real" no está en los scripts del repo.

Esto implica que el deploy a CDN de producción es un proceso manual fuera del repo. Sin documentación visible de ese proceso, es un punto de fallo y conocimiento tribal.

### 9.5 Riesgo medio: registry.json y contracts.json sin historial

Estos archivos se sobreescriben en cada release. No hay un historial de versiones. Si se necesita debuggear qué versión del contrato se usó en una fecha específica, no hay forma de saberlo desde el CDN.

### 9.6 Riesgo bajo: Nombres de bundles del runtime fijos

Los nombres `ng-core.js`, `ng-common.js`, `sg-shared.js` son estables por convención, pero no están protegidos por ningún test de integración. Si Angular cambia su estructura interna, los bundles necesitan actualización manual.

---

## 10. FORTALEZAS QUE DEBEN PRESERVARSE

Estas son piezas que están bien resueltas y que cualquier simplificación debe proteger:

| Fortaleza | Por qué preservar |
|---|---|
| **Separación vitals/ ↔ platforms/** | Las fronteras son reales, el acoplamiento es mínimo y justificado |
| **Boundary enforcement ESLint** | `scope:elements` aislado de `scope:rendering` es arquitectura ejecutable |
| **Sistema de tags Nx** | `framework:`, `scope:`, `tier:` dan trazabilidad real al grafo |
| **Contrato UI ↔ CMS via CDN** | `contracts.json` + `registry.json` como fuente única de verdad es elegante |
| **3 version slots CDN** | Permite producción estable + staging + rollback sin coordinación |
| **Import map + runtime bundle** | 60-80% de reducción de payload. No tocar sin análisis profundo |
| **`contracts:validate` pre-publish** | Gate automático que evita publicar contratos rotos |
| **Angular standalone + signals + zoneless** | Código moderno, sin legacy, apto para el futuro |
| **SynergosDocs/** | Documentación real y de referencia. Ampliar, no reemplazar |
| **LLM.txt** | Governance para agentes IA. Muy valioso, mantener actualizado |
| **Dual Nx workspaces** | Decisión técnica correcta para el caso de uso |
| **Nx affected (build:angular:changed)** | Uso correcto del grafo de Nx |
| **Two-layer contract model** | `ElementData` (dominio) vs `ElementConfig` (HTML attrs) es una separación semántica correcta |

---

## 11. RIESGOS Y ANTI-PATRONES DETECTADOS

### Matriz de riesgos

| # | Área | Problema | Impacto | Probabilidad | Riesgo de tocar | Acción | Prioridad |
|---|---|---|---|---|---|---|---|
| R1 | Alias `@synergos/core` | Dos cosas con el mismo alias | Alto (bug silencioso) | Media | Bajo (documentación/linting) | Añadir lint rule que detecte import en contexto incorrecto | **ALTA** |
| R2 | CI/CD ausente | No hay pipeline automático | Crítico | Alta (si el equipo crece) | Bajo (es additive) | Crear pipeline CI mínimo con `contracts:validate` | **CRÍTICA** |
| R3 | CDN producción | Proceso de deploy no está en el repo | Alto | Alta | Bajo | Documentar + scripting el proceso de deploy real | **ALTA** |
| R4 | `element-inputs.json` | Duplicación manual de inputs del código | Alto (contratos stale) | Media | Bajo (mejorar tooling) | Codegen automatizado desde código Angular | **ALTA** |
| R5 | Versionado manual | Sin herramienta de semver bump | Medio | Media | Bajo | Configurar `nx release` para elementos | **MEDIA** |
| R6 | Import map sincronía | Runtime y elementos pueden desincronizarse | Crítico (runtime failures) | Media | Medio (requiere testing) | Añadir validation gate de compatibilidad de versión | **ALTA** |
| R7 | Git submodules | Clone sin `--recurse` produce estado roto | Medio | Alta (error humano) | Bajo | Añadir script de setup que valide submodules | **MEDIA** |
| R8 | SCSS duplicado | vitals/core-assets ≠ libs/core-assets posible | Medio (divergencia silenciosa) | Media | Bajo | Añadir test de sincronía entre las dos copias | **MEDIA** |
| R9 | POCs sin governance | React/Svelte elementos sin mismas validaciones | Medio | Media | Bajo | Extender `contracts:validate` a frameworks no-Angular | **MEDIA** |
| R10 | `NX_WORKSPACE_ROOT_PATH` | Gotcha silencioso en builds manuales | Medio | Alta | Bajo | Prominencia en troubleshooting docs | **MEDIA** |
| R11 | Generated files opacidad | `*.generated.ts` sin trigger visible | Bajo-Medio | Media | Bajo | Documentar el script generador + añadirlo a check CI | **BAJA** |
| R12 | bridge/ utilización real | Puede ser infraestructura no utilizada | Bajo | Media | Bajo | Verificar si POCs usan bridge; documentar | **BAJA** |
| R13 | `scope:cms-adapter` | Si se aplica liberalmente, rompe todos los boundaries | Alto | Baja (si hay governance) | Bajo | Auditar cuántos proyectos tienen este tag | **BAJA** |

---

## 12. ARQUITECTURA OBJETIVO RECOMENDADA

La arquitectura actual es fundamentalmente correcta. No se propone una reescritura. Se propone endurecer, hacer visible y automatizar lo que hoy depende de disciplina manual.

### Principios de simplificación

1. **Hacer explícito lo implícito** — todo proceso que hoy vive en la cabeza de alguien debe vivir en un script, test, o documento visible
2. **Automatizar los gates** — lo que hoy es "debes recordar ejecutar X antes de Y" debe ser imposible de omitir
3. **Un nombre = una cosa** — el alias `@synergos/core` resolviendo dos targets distintos debe resolverse con renaming o con linting
4. **La fuente de verdad es el código, no el JSON** — `element-inputs.json` debe derivarse del código, no mantenerse en paralelo
5. **CDN como sistema, no como carpeta** — el proceso de publicación a producción debe estar en el repo
6. **Separar integración de contenido** — `macro-host`, `mf-host`, `angular-host` merecen su propia subcarpeta que los identifique como plomería, no como elementos de contenido

### Cambios estructurales concretos propuestos

**Cambio 1 — Renaming de alias Angular-específico** *(baja fricción)*

Opciones:
- A) `@synergos/ng` → nuevo alias para `libs/core/` (Angular-específico)
- B) `@synergos/core-agnostic` → nuevo alias para `vitals/core/`
- C) Mantener nombres actuales + lint rule que falle en contexto incorrecto

La dirección debe decidirse antes de implementar. Hoy el mismo nombre designa dos librerías distintas.

**Cambio 2 — Subcategoría de integration hosts** *(baja fricción)*

```
apps/elements/modules/
  ├── content/          ← hero, banner, section, feature-grid, faq-section...
  └── integration/      ← macro-host, angular-host, mf-host, script-embed
```

**Cambio 3 — Script de codegen para `element-inputs.json`** *(complejidad media)*

Crear `tools/sync-inputs.mjs` que:
1. Lee todos los `input()` signals de los componentes Angular usando TS compiler API
2. Genera/actualiza `element-inputs.json` automáticamente
3. Se añade como paso previo en `contracts:validate`

**Cambio 4 — Pipeline CI mínimo** *(prioridad crítica)*

```yaml
# .github/workflows/ci.yml (o equivalente)
on: [push, pull_request]
jobs:
  validate:
    - npm run setup:angular
    - npm run contracts:validate
    - npm run build:angular:changed
    - npm run test
```

**Cambio 5 — CDN target parametrizable** *(baja fricción)*

```js
// tools/publish.mjs
const CDN_BASE = process.env.CDN_BASE_PATH ?? 'C:\\LOCAL_CDN';
```

Con `.env.local` para desarrollo y `.env.production` para producción.

**Cambio 6 — SCSS sync validation** *(baja fricción)*

```bash
# tools/check-scss-sync.mjs
# Compara checksums de vitals/core-assets/src/scss/ vs libs/core-assets/src/scss/
# Falla si divergen
# Añadirlo a npm run contracts:validate
```

**Cambio 7 — Troubleshooting doc prominente** *(baja fricción)*

Crear `SynergosDocs/TROUBLESHOOTING.md` con:
- `NX_WORKSPACE_ROOT_PATH` gotcha
- Git submodules setup
- Alias `@synergos/core` contexto correcto
- CDN local vs producción
- Regeneración de `*.generated.ts` files

---

## 13. PLAN DE SIMPLIFICACIÓN POR FASES

### Fase 0: Observabilidad y documentación *(sin tocar código)*

**Objetivo:** Hacer visible lo invisible. Cero riesgo de regresión.

- [ ] Crear `SynergosDocs/TROUBLESHOOTING.md` con los 5 gotchas más comunes
- [ ] Documentar el proceso real de deploy a CDN de producción
- [ ] Documentar qué script regenera los `*.generated.ts` files
- [ ] Auditar cuántos proyectos tienen el tag `scope:cms-adapter`
- [ ] Verificar si `vitals/core/src/bridge/` es usado por React/Svelte; documentar hallazgo
- [ ] Verificar si `platforms/angular/libs/rendering/` es usado solo por integration hosts
- [ ] Añadir nota prominente en `platforms/angular/README.md` sobre `NX_WORKSPACE_ROOT_PATH`

**Riesgo:** Ninguno.

---

### Fase 1: Quick wins sin riesgo de regresión

**Objetivo:** Automatizar gates que hoy dependen de disciplina.

- [ ] Parametrizar `CDN_BASE_PATH` en `tools/publish.mjs` con `.env` files
- [ ] Crear `tools/check-scss-sync.mjs` y añadirlo a `contracts:validate`
- [ ] Añadir validación de git submodules en `npm run setup:angular`
- [ ] Crear pipeline CI mínimo (stub que corre `contracts:validate` y `build:angular:changed`)
- [ ] Reorganizar los 41 scripts de `package.json` con comentarios de sección

**Riesgo:** Bajo.

---

### Fase 2: Endurecimiento de contracts y naming

**Objetivo:** Resolver las ambigüedades de naming y formalizar contratos de código.

- [ ] Decidir y resolver el conflicto del alias `@synergos/core` (rename o lint rule)
- [ ] Mover `macro-host`, `angular-host`, `mf-host`, `script-embed` a `apps/elements/modules/integration/`
- [ ] Extender `contracts:validate` para verificar elementos React/Svelte tienen los mismos gates
- [ ] Añadir lint rule que falle si `scope:cms-adapter` se aplica a más de N proyectos
- [ ] Crear `tools/check-import-map-compat.mjs` que valide versión Angular del runtime vs import-map

**Riesgo:** Bajo-medio. El renaming de aliases requiere testing post-cambio de todos los imports.

---

### Fase 3: Automatización del pipeline de distribución

**Objetivo:** El pipeline de publish debe ser reproducible, trazable y seguro.

- [ ] Implementar `tools/sync-inputs.mjs` (codegen de `element-inputs.json` desde código TS)
- [ ] Configurar `nx release` para versioning de elementos (automatizado desde commits)
- [ ] Añadir validation de compatibilidad runtime ↔ elementos al release workflow
- [ ] Añadir historial de `contracts.json` y `registry.json` (archivado con timestamp en CDN)
- [ ] Documentar proceso completo de rollback (cómo reverter un elemento a un slot anterior)

**Riesgo:** Medio. El codegen requiere pruebas extensas antes de reemplazar el flujo manual.

---

### Fase 4: Consolidación y gobernanza avanzada

**Objetivo:** Cerrar las brechas entre Angular y los frameworks POC; tomar decisiones estratégicas.

- [ ] **Decisión de producto:** ¿React/Svelte/Vanilla son POCs permanentes o frameworks de producción?
  - Si son producción: aplicar los mismos governance gates que Angular
  - Si son POC: documentarlos formalmente + nota en registry.json
- [ ] Evaluar si `vitals/core/src/bridge/` tiene valor real en POCs; si no, marcarlo como future-use
- [ ] Evaluar si `libs/rendering/` puede simplificarse si los integration hosts son los únicos consumidores

**Riesgo:** Variable según decisión de producto.

---

### Fase 5: Optimización avanzada *(condicional)*

Solo si las fases anteriores revelan necesidad:

- [ ] Investigar si el dual Nx workspace puede beneficiarse de Nx Crystal (nested workspaces)
- [ ] Evaluar si `experiences` debería tener su propio lib para state management compartido
- [ ] Evaluar si el design system (`libs/shared`) debería publicarse como librería standalone consumible fuera del monorepo

---

## 14. DECISIONES QUE DEBEN APROBARSE ANTES DE TOCAR CÓDIGO

Estas decisiones tienen impacto transversal y no deben asumirse sin alineación explícita:

| # | Decisión | Opciones | Impacto si se toma sin consenso |
|---|---|---|---|
| D1 | **Resolver alias `@synergos/core`** | A) Rename Angular-specific a `@synergos/ng`; B) Rename agnostic a `@synergos/core-agnostic`; C) Solo lint rule sin renaming | Todos los imports Angular y POCs |
| D2 | **¿React/Svelte/Vanilla son producción o POC?** | A) POC permanentes; B) Futuros de producción | Alcance de governance, testing, CI |
| D3 | **Codegen de `element-inputs.json`** | A) Generar desde TS compiler API; B) Generar desde decoradores custom; C) Mantener manual con mejor validación | Proceso de desarrollo de todos los elementos |
| D4 | **Pipeline CI/CD target** | A) GitHub Actions; B) GitLab CI; C) Azure DevOps | Infraestructura de automatización |
| D5 | **CDN de producción** | ¿Cuál es el CDN real? ¿Cómo se autentica? ¿Hay staging separado? | Scripts de publish, seguridad de credentials |
| D6 | **Versionado de elementos** | A) `nx release` automático desde commits; B) Manual vía CLI interactivo; C) Híbrido | Proceso de release completo, changelogs |

---

## 15. RECOMENDACIÓN FINAL

### El diagnóstico

Synergos.UI tiene una **arquitectura fundamentalmente sólida y bien pensada**. Las decisiones de diseño clave — vitals como capa agnóstica, dual Nx workspace, import map para runtime, 3 version slots en CDN, boundary enforcement ESLint, contrato formal UI↔CMS — son correctas y deben preservarse.

La complejidad real del sistema no es excesiva dado lo que resuelve: distribución multi-framework de 63+ elementos hacia CDN, con contratos formales hacia un CMS externo. Esa complejidad es necesaria.

Lo que **sí debe resolverse** no es la arquitectura sino la **capa de operabilidad y visibilidad**:

1. **El CI/CD ausente es el riesgo más urgente.** No es un problema de arquitectura, es un vacío operativo. Cualquier crecimiento del equipo sin CI es peligroso.

2. **La sincronía de `element-inputs.json` es frágil.** Un sistema tan riguroso en contratos no puede depender de que el desarrollador actualice manualmente un JSON de 2828 líneas.

3. **El CDN de producción debe estar en el repo.** Si el proceso de publicación real no es reproducible desde el repo, es conocimiento tribal y punto único de falla.

4. **El alias dual `@synergos/core` debe resolverse.** Es el único anti-patrón que puede producir bugs silenciosos de difícil diagnóstico.

### El orden correcto de acción

```
Fase 0  → Observar y documentar lo que ya existe        → sin riesgo, máximo conocimiento ganado
Fase 1  → Automatizar gates y parametrizar CDN          → riesgo mínimo, valor inmediato
Fase 2  → Resolver naming y extender governance         → riesgo bajo con buenas pruebas
Fase 3  → Pipeline de distribución automatizado         → trabajo real, resultado duradero
Fase 4  → Decisiones estratégicas sobre POCs y capas
Fase 5  → Optimización avanzada si aplica
```

### Lo que NO debe tocarse todavía

- El modelo de distribución CDN (slots, manifest, import-map) — funciona y es correcto
- Los ESLint boundaries — son el esqueleto que mantiene la arquitectura honesta
- La estructura `vitals/` — es la capa más valiosa del sistema
- Angular standalone + signals + zoneless — es el stack correcto, no tocar
- `SynergosDocs/` — ampliar, no reemplazar
- El two-layer contract model (`ElementData` vs `ElementConfig`) — es una separación semántica correcta aunque no obvia

### La frase que resume

> El proyecto no es demasiado complejo para lo que hace. Es complejo en algunos lugares donde la complejidad debería estar automatizada en lugar de documentada.

La diferencia entre "documentado en SynergosDocs" y "automatizado en CI" es la diferencia entre un sistema que funciona cuando todos conocen las reglas y un sistema que funciona aunque alguien las olvide.

---

*Auditoría basada en lectura directa del código fuente, configuraciones y documentación del monorepo. Branch: `master`. Fecha: 2026-04-03.*
