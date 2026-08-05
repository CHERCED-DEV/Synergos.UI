> ⚠️ **HISTÓRICO — plan escrito ANTES de la purga (2026-08-04).** Sus pasos editan
> `nx.json` y corren `nx affected`; ninguna de las dos cosas existe. Se conserva como
> registro de las decisiones que llevaron al repo actual, no como trabajo pendiente:
> lo pendiente vive en los issues de GitHub.

# SYNERGOS.UI — PLAN DE EJECUCIÓN CONTROLADA

> Basado en las auditorías AUDITORIA_ARQUITECTONICA.md y VALIDACION_TECNICA.md.
> Cada ítem parte de evidencia real de código. No hay refactors especulativos.
> Branch de trabajo: `master`.

---

## 1. CORRECCIÓN SEMÁNTICA DE LA MATRIZ UI ↔ CMS

### Por qué la matriz anterior era incompleta

El análisis previo usó solo dos dimensiones: "implementado en Angular" y "tiene IContentResolver en CMS". Eso era insuficiente.

El CMS tiene **tres rutas de rendering paralelas y coexistentes**:

| Ruta | Dónde viven las vistas | Qué produce | Quién la activa |
|---|---|---|---|
| **CDN (Custom Elements)** | `Views/Partials/Content/` | `<synergos-x config="...">` desde CDN | `IContentResolver` + `SynergosBlock.cshtml` |
| **SSR Components** | `Views/Partials/Ssr/Components/` | HTML server-rendered nativo | Umbraco block dispatcher |
| **SSR Foundation** | `Views/Partials/Ssr/Foundation/` | Sub-componentes HTML inline | Usado dentro de vistas SSR superiores |

Muchos elementos marcados como "Sin CMS" en la validación anterior **sí están en producción**, pero vía SSR, no vía Custom Element CDN.

### Definición de columnas para la matriz revisada

| Columna | Significado |
|---|---|
| **UI impl** | Componente Angular existe, compila, tiene tests |
| **CE/CDN** | `IContentResolver` + vista en `Content/` → se sirve como Custom Element desde CDN |
| **SSR** | Vista en `Ssr/Components/` o `Ssr/Foundation/` → se renderiza server-side en HTML nativo |
| **Ciclo cerrado** | Ambas capas (UI build + CMS view) existen y están alineadas — inferido del código |
| **Requires items** | El elemento necesita configuración de Block List en Umbraco para funcionar |
| **Estado real** | Evaluación operativa basada en evidencia |

### Matriz corregida completa

| Elemento | UI impl | CE/CDN | SSR | Ciclo cerrado | Estado real |
|---|---|---|---|---|---|
| **hero** | ✅ | ✅ | ✅ Ssr/Components | ✅ | **Producción — dual path** |
| **banner** | ✅ | ✅ | ✅ Ssr/Components (CtaBanner) | ✅ | **Producción — dual path** |
| **section** | ✅ | ✅ | ✅ Ssr/Components | ✅ | **Producción — dual path** |
| **feature-grid** | ✅ | ✅ | ✅ Ssr/Components | ✅ requires items | **Producción — dual path** |
| **faq-section** | ✅ | ✅ | ✅ Ssr/Components (FaqList) | ✅ requires items | **Producción — dual path** |
| **testimonial-section** | ✅ | ✅ | ✅ Ssr/Components (TestimonialList) | ✅ requires items | **Producción — dual path** |
| **logo-cloud** | ✅ | ✅ | ✅ Ssr/Components | ✅ requires items | **Producción — dual path** |
| **tab-group** | ✅ | ✅ | ✅ Ssr/Components | ✅ requires items | **Producción — dual path** |
| **banner-slider** | ✅ | ✅ | ✅ Ssr/Components | ✅ requires items | **Producción — dual path** |
| **data-table** | ✅ | ✅ | ✅ Ssr/Components | ✅ | **Producción — dual path** |
| **script-embed** | ✅ | ✅ | ✅ Ssr/Components | ✅ | **Producción — dual path** |
| **angular-host** | ✅ | ✅ | ✅ Ssr/Components | ✅ | **Producción — dual path** |
| **mf-host** | ✅ | ✅ | ✅ Ssr/Components | ✅ | **Producción — dual path** |
| **macro-host** | ✅ | ⚠️ vía MacroHostResolver | — | ✅ | **Producción — ruta especial** |
| **card** | ✅ | ✅ | ✅ Ssr/Components | ✅ | **Producción — dual path** |
| **media-text** | ✅ | ✅ | ✅ Ssr/Components (MediaTextSplit) | ✅ | **Producción — dual path** |
| **info-block** | ✅ | ✅ | ✅ Ssr/Components | ✅ | **Producción — dual path** |
| **cta-group** | ✅ | ✅ | ✅ Ssr/Components | ✅ | **Producción — dual path** |
| **alert-bar** | ✅ | ✅ | ✅ Ssr/Components | ✅ | **Producción — dual path** |
| **feature-item** | ✅ | ✅ | ✅ Ssr/Components (Feature) | ✅ | **Producción — dual path** |
| **key-value** | ✅ | ✅ | ✅ Ssr/Components | ✅ | **Producción — dual path** |
| **timeline-item** | ✅ | ✅ | ✅ Ssr/Components | ✅ | **Producción — dual path** |
| **faq-item** | ✅ | ✅ | ✅ Ssr/Components | ✅ | **Producción — dual path** |
| **testimonial-item** | ✅ | ✅ | ✅ Ssr/Components | ✅ | **Producción — dual path** |
| **gallery-item** | ✅ | ✅ | ✅ Ssr/Components | ✅ | **Producción — dual path** |
| **logo-item** | ✅ | ✅ | ✅ Ssr/Components | ✅ | **Producción — dual path** |
| **newsletter-form** | ✅ | ✅ | ✅ Ssr/Components | ✅ | **Producción — dual path** |
| **social-share** | ✅ | ✅ | ✅ Ssr/Components | ✅ | **Producción — dual path** |
| **iframe-embed** | ✅ | ✅ | ✅ Ssr/Components | ✅ | **Producción — dual path** |
| **external-widget** | ✅ | ✅ | ✅ Ssr/Components | ✅ | **Producción — dual path** |
| **accordion** | ✅ Angular + Svelte | ❌ sin resolver | ✅ Ssr/Components | ⚠️ SSR sí, CE no | **SSR activo. Ruta CE pendiente.** |
| **button-group** | ✅ | ⚠️ alias mismatch | ✅ Content/Compositions | ⚠️ vista existe, alias roto | **Vista CE existe, alias desincronizado** |
| **badge** | ✅ | ✅ | ✅ Ssr/Foundation | ✅ | **Producción — dual path** |
| **button** | ✅ | ✅ | ✅ Ssr/Foundation | ✅ | **Producción — dual path** |
| **link** | ✅ | ✅ | ✅ Ssr/Foundation | ✅ | **Producción — dual path** |
| **image-block** | ✅ | ✅ | ✅ Ssr/Foundation | ✅ | **Producción — dual path** |
| **video-block** | ✅ | ✅ | ✅ Ssr/Foundation | ✅ | **Producción — dual path** |
| **icon-block** | ✅ | ✅ | ✅ Ssr/Foundation | ✅ | **Producción — dual path** |
| **container-block** | ✅ | ✅ | ✅ blockgrid/Components | ✅ | **Producción — dual path** |
| **grid** | ✅ | ✅ | ✅ blockgrid/Components | ✅ | **Producción — dual path** |
| **column** | ✅ | ✅ | ✅ blockgrid/Components | ✅ | **Producción — dual path** |
| **stack** | ✅ | ✅ | ✅ Ssr/Components | ✅ | **Producción — dual path** |
| **divider** | ✅ | ✅ | ✅ Ssr/Foundation | ✅ | **Producción — dual path** |
| **spacer** | ✅ | ✅ | ✅ Ssr/Foundation | ✅ | **Producción — dual path** |
| **heading** | ✅ | ✅ | ✅ Ssr/Foundation | ✅ | **Producción — dual path** |
| **paragraph** | ✅ | ❌ sin resolver CE | ✅ Ssr/Foundation | ✅ SSR | **SSR activo. CE no necesario hoy.** |
| **rich-text** | ✅ | ❌ sin resolver CE | ✅ Ssr/Foundation (RichText) | ✅ SSR | **SSR activo. CE no necesario hoy.** |
| **eyebrow** | ✅ | ❌ sin resolver CE | ✅ Ssr/Foundation | ✅ SSR | **SSR activo. CE no necesario hoy.** |
| **quote** | ✅ | ❌ sin resolver CE | ✅ Ssr/Foundation | ✅ SSR | **SSR activo. CE no necesario hoy.** |
| **label** | ✅ | ❌ sin resolver CE | ✅ Ssr/Foundation | ✅ SSR | **SSR activo. CE no necesario hoy.** |
| **text-block** | ✅ | ❌ sin resolver CE | ✅ Ssr/Foundation | ✅ SSR | **SSR activo. CE no necesario hoy.** |
| **avatar** | ✅ Angular + Svelte | ❌ sin resolver CE | ✅ Ssr/Foundation | ✅ SSR | **SSR activo como sub-componente.** |
| **pricing-card** | ❌ solo React | ❌ sin resolver CE | ✅ Ssr/Components | ⚠️ SSR sí, CE solo React | **SSR activo. Angular CE no implementado.** |
| **stat** | ❌ solo React | ❌ sin resolver CE | ✅ Ssr/Components | ⚠️ SSR sí, CE solo React | **SSR activo. Angular CE no implementado.** |
| **feature-journey** | ✅ | ✅ | ✅ ViewName en ViewModel | ✅ CE activo + SSR preparado | **Producción CE. Requires Block List.** |
| **insight-explorer** | ✅ | ✅ | ✅ ViewName en ViewModel | ✅ CE activo + SSR preparado | **Producción CE. Requires Block List.** |
| **media-explorer** | ✅ | ✅ | ✅ ViewName en ViewModel | ✅ CE activo + SSR preparado | **Producción CE. Requires Block List.** |
| **hello-world** | ✅ | ❌ | ❌ | ❌ | **Template. No uso en producción.** |

### Resumen revisado

| Categoría | Elementos | Cambio vs. validación anterior |
|---|---|---|
| Producción CE + SSR (dual path) | 36 | Era 45; ahora más preciso con distinción |
| Producción CE única (experiences) | 3 | Sin cambio — experiences son CE-first |
| SSR activo, CE pendiente | 2 (accordion, button-group*) | Estaban marcados como "Sin CMS" — INCORRECTO |
| SSR activo, CE no necesario (text variants + avatar) | 7 | Estaban marcados como "Sin CMS" — INCORRECTO |
| SSR activo, CE solo React (sin Angular CE) | 2 (pricing-card, stat) | Estaban marcados como "Sin CMS" — INCORRECTO |
| Integration / ruta especial | 1 (macro-host) | Sin cambio |
| Template | 1 (hello-world) | Sin cambio |

*`button-group` tiene vista CE (`Content/Compositions/ButtonGroup.cshtml`) pero el alias está desincronizado.

**Lectura operativa correcta:** El sistema está más completo de lo que parecía. El CMS tiene cobertura de UI para prácticamente todos los elementos registrados — la diferencia es si esa cobertura es Custom Element (CDN) o SSR (server-rendered). Ambas son producción real.

---

## 2. PLAN DE EJECUCIÓN POR FASES

### Criterios de prioridad aplicados

1. **Impacto en confiabilidad de builds** — ¿puede este problema producir artefactos incorrectos silenciosamente?
2. **Riesgo de la intervención** — ¿puede este cambio romper algo en producción?
3. **Esfuerzo** — ¿cuánto cuesta ejecutarlo bien?
4. **Dependencias** — ¿requiere decisión de equipo o puede ejecutarse solo?

---

### FASE 1 — Correcciones técnicas sin riesgo estructural

**Criterio de entrada:** Ninguno. Se puede ejecutar ahora.
**Criterio de salida:** Builds correctos, imports limpios, imports verificados por compilador.

---

#### F1.1 — Corregir import relativo en `ElementMounter`

**Problema confirmado:**
```ts
// platforms/angular/libs/rendering/src/engines/element-mounter.ts (línea 4)
import { mapBlockToElement } from '../../../../../../vitals/core/src/mappers/block.mapper';
```
Path relativo que cruza el boundary de workspace. Nx no lo rastrea. Si vitals se mueve, falla silenciosamente hasta compilación.

**Fix:**
```ts
import { mapBlockToElement } from '@synergos/core';
```

**Evidencia de seguridad:** `mapBlockToElement` está exportado en `vitals/core/src/mappers/index.ts` y re-exportado en `vitals/core/src/index.ts` (public API de `@synergos/core`). El alias resuelve correctamente en el workspace Angular.

**Riesgo:** Ninguno. TypeScript valida en compilación. Si el import estuviera mal, el build fallaría inmediatamente.

**Verificación post-cambio:** `cd platforms/angular && npx nx run rendering:build` debe compilar sin errores.

---

#### F1.2 — Fijar el gap de `Nx affected` para `vitals/`

**Problema confirmado:** Cambios en `vitals/core/`, `vitals/contracts/`, `vitals/core-assets/`, `vitals/shared/` no aparecen como `affected` en el workspace Angular. Builds incrementales con `nx affected` pueden servir caché stale.

**Fix:** Añadir un named input `vitals` en `platforms/angular/nx.json` y referenciarlo en `targetDefaults`:

```json
// platforms/angular/nx.json
{
  "namedInputs": {
    "default": ["{projectRoot}/**/*", "sharedGlobals"],
    "production": [
      "default",
      "!{projectRoot}/.eslintrc.json",
      "!{projectRoot}/eslint.config.mjs"
    ],
    "sharedGlobals": [
      "{workspaceRoot}/tsconfig.json",
      "{workspaceRoot}/nx.json"
    ],
    "vitals": [
      "{workspaceRoot}/../../vitals/contracts/src/**/*",
      "{workspaceRoot}/../../vitals/core/src/**/*",
      "{workspaceRoot}/../../vitals/core-assets/src/**/*",
      "{workspaceRoot}/../../vitals/shared/src/**/*"
    ]
  },
  "targetDefaults": {
    "@angular/build:application": {
      "cache": true,
      "dependsOn": ["^build"],
      "inputs": ["production", "^production", "vitals"],
      ...
    },
    "@angular/build:unit-test": {
      "cache": true,
      "inputs": ["default", "^production", "vitals"],
      ...
    }
  }
}
```

**Efecto:** Cualquier cambio en `vitals/` invalidará la caché de todos los proyectos Angular. Esto es conservador pero correcto: vitals es una dependencia real de todos los elementos.

**Trade-off documentado:** Un cambio en `vitals/core-assets/src/scss/tokens/colors.scss` invalidará todos los builds Angular, no solo los que usan ese token. Es el precio correcto de no tener vitals como proyectos Nx. Aceptable en la fase actual del proyecto.

**Riesgo:** Bajo. Solo hace más proyectos appear como `affected`, nunca menos. No puede producir builds incorrectos, solo builds más amplios que antes.

**Verificación post-cambio:**
```bash
# Modificar un archivo en vitals/core/
echo "// test" >> vitals/core/src/mappers/hero.mapper.ts

# Correr affected desde Angular workspace
cd platforms/angular && unset NX_WORKSPACE_ROOT_PATH && npx nx affected --target=build --dry-run

# Debe mostrar hero (y otros elementos que dependen de core) como affected
# Revertir el cambio de prueba
```

---

#### F1.3 — Sincronizar alias de `button-group`

**Problema confirmado:**
```
UI registry:        { "name": "button-group", "alias": "elementCompButtonGroup" }
CMS SupportedAlias: "elementActionButtonGroup"
CMS resolver code:  // comentario explícito: "dedicated alias (elementActionButtonGroup)"
CMS view:           Content/Compositions/ButtonGroup.cshtml → ✅ existe y funciona
```

**Análisis del comentario en el CMS:**
```cs
/// Uses elementActionCtaGroup as the CMS backing type; editors may override
/// this with a dedicated alias (elementActionButtonGroup) if needed.
public string SupportedAlias => "elementActionButtonGroup";
```
El CMS usa `elementActionButtonGroup` intencionalmente. El naming sigue el prefijo `elementAction*` para elementos de tipo acción/interactivo. El registry UI tiene `elementCompButtonGroup` por inconsistencia de naming.

**Decisión recomendada:** Cambiar el registry UI para alinearse al CMS, no al revés. El CMS está en producción.

**Fix en `vitals/contracts/src/element-registry.json`:**
```json
// Antes:
{ "name": "button-group", "alias": "elementCompButtonGroup", "tag": "synergos-button-group", "tier": "composition" }

// Después:
{ "name": "button-group", "alias": "elementActionButtonGroup", "tag": "synergos-button-group", "tier": "composition" }
```

**Impacto en cascada:**
- `vitals/core/src/mappers/block.mapper.ts` — verificar que la key del mapper usa el nombre del elemento (`button-group`), no el alias. Si el mapper usa alias como key, debe actualizarse.
- `element-contract-audit.mjs` — re-ejecutar para confirmar que audit pasa con el nuevo alias.
- `macro-host` en producción — ahora podrá resolver `button-group` correctamente cuando el CMS envíe `elementActionButtonGroup`.

**Riesgo:** Bajo. El alias solo afecta la tabla de routing interno del registry. La vista Razor y el Custom Element tag (`synergos-button-group`) no cambian.

**Verificación post-cambio:**
```bash
node tools/element-contract-audit.mjs
# Debe pasar limpiamente con el nuevo alias
```

---

### FASE 2 — Documentación operativa y reducción de conocimiento tribal

**Criterio de entrada:** Fase 1 completa.
**Criterio de salida:** Un developer nuevo puede orientarse sin preguntar.

---

#### F2.1 — Crear `SynergosDocs/TROUBLESHOOTING.md`

Documento de problemas operativos frecuentes. Debe cubrir exactamente estos 5 gotchas confirmados:

**Contenido mínimo:**
1. `NX_WORKSPACE_ROOT_PATH` — síntoma, causa, fix (`unset NX_WORKSPACE_ROOT_PATH`)
2. El alias `@synergos/core` resuelve diferente en Angular vs vitals — cuándo usar cuál
3. Diferencia entre `ElementData` y `ElementConfig` — por qué los Custom Elements solo reciben el segundo
4. Las tres rutas de rendering del CMS (CDN, SSR Components, SSR Foundation) — cuándo se usa cada una
5. El gap de `Nx affected` para `vitals/` — qué cambios no se detectan automáticamente (hasta que F1.2 esté completo, y después documentar que fue corregido)

---

#### F2.2 — Documentar el estado real del `bridge/`

Añadir una sección en `SynergosDocs/ARCHITECTURE.md` o crear `SynergosDocs/BRIDGE_PROTOCOL.md` que diga explícitamente:

> `vitals/core/src/bridge/` define las interfaces de interoperabilidad cross-framework (`ElementProtocol`, `LifecycleHooks`, `InputSerializer`). **Actualmente no tiene implementaciones activas**. Los POCs de React y Svelte implementan sus Custom Element wrappers directamente. El bridge es el contrato aspiracional para el caso de uso de registry dinámico cross-framework. Si a los 12 meses no hay implementaciones, evaluar si moverlo a documentación spec o eliminarlo.

---

#### F2.3 — Agrupar los 41 scripts del `package.json` raíz

El `package.json` actual tiene 41 scripts sin agrupación visual. Añadir comentarios de sección usando el patrón `"// SECCION": ""` que es interpretado por algunos tooling como agrupación (aunque no es JSON estándar, usar directamente nombres de sección descriptivos como separadores visuales en el archivo).

**Agrupación propuesta:**
```
BUILD — build, build:angular, build:angular:dev, build:angular:changed, build:angular:stable, build:angular:elements, build:angular:experiences, build:react, build:svelte, build:vanilla
RUNTIME — build:runtime, build:runtime:dry
TEST — test, test:angular, test:react, test:svelte
LINT — lint, lint:angular
RELEASE — release, release:angular, release:react, release:svelte, release:vanilla, release:element
PUBLISH — publish:cdn, publish:runtime
VALIDATE — contracts:validate, element:audit, manifest:validate
TOOLS — cli, catalog, manifest:gen, contracts:export
GRAPHS — graph, graph:angular
SETUP — setup, setup:angular, setup:react, setup:svelte, setup:vanilla
```

---

### FASE 3 — Cambios que requieren decisión de equipo

**Criterio de entrada:** Fases 1 y 2 completas, decisiones aprobadas.
**Criterio de salida:** Depende de la decisión tomada.

---

#### F3.1 — Pipeline CI/CD mínimo

**Qué hace falta:** No existe ningún pipeline de CI en ninguno de los dos repos (UI ni CMS).

**Propuesta mínima viable para Synergos.UI:**
```yaml
# .github/workflows/ci.yml (o equivalente según plataforma)
on: [push, pull_request]
jobs:
  validate:
    steps:
      - npm run setup:angular
      - node tools/element-contract-audit.mjs    # gate de contratos
      - cd platforms/angular && npx nx affected --target=build --base=master
      - cd platforms/angular && npx nx affected --target=test --base=master
      - cd platforms/angular && npx nx affected --target=lint --base=master
```

**Requiere decidir:** plataforma de CI (GitHub Actions, GitLab CI, Azure DevOps). No se puede implementar sin esa información.

---

#### F3.2 — Parametrizar CDN de producción

**Qué hace falta:**
```js
// tools/publish.mjs — actualmente hardcodeado:
const CDN_BASE = 'C:\\LOCAL_CDN';

// Propuesta:
const CDN_BASE = process.env.CDN_BASE_PATH ?? 'C:\\LOCAL_CDN';
```

Con `.env.local` para desarrollo local y variables de entorno para CI/producción.

**Requiere decidir:** el CDN de producción real (S3, Azure Blob, Cloudflare R2). Sin esa información no se puede configurar el deploy real.

---

#### F3.3 — Destino del `bridge/` protocol

Tres opciones, cada una válida según la estrategia del equipo:

**Opción A — Mantener como contrato aspiracional (recomendado si POCs son POCs):**
Documentar en `SynergosDocs/BRIDGE_PROTOCOL.md` que es un spec sin implementaciones. No tocar el código. Re-evaluar en 12 meses.

**Opción B — Implementar en React y Svelte (si POCs van a crecer):**
Los elementos React/Svelte implementarían `ElementProtocol` en lugar de tener lifecycle propio. Requiere modificar `pricing-card`, `stat-counter`, `accordion`, `avatar` en sus respectivos frameworks. Trabajo estimado: 2-3 días.

**Opción C — Eliminar del código y convertir en spec document:**
Mover el contenido a `SynergosDocs/` como diseño de interfaz. Remover de `vitals/core/src/bridge/` y de la public API de `@synergos/core`. Requiere audit de que nadie lo importa (confirmado: cero consumidores). Riesgo: bajo, pero es una decisión de dirección técnica.

---

## 3. CAMBIOS DE BAJO RIESGO Y ALTO VALOR

Ordenados por impacto / esfuerzo:

| # | Cambio | Esfuerzo | Impacto | Riesgo |
|---|---|---|---|---|
| **F1.1** | Corregir import relativo en ElementMounter | 5 min | Alto — trazabilidad y Nx graph | Ninguno |
| **F1.2** | Fijar Nx affected para vitals/ | 15 min | Crítico — confiabilidad de builds | Bajo |
| **F1.3** | Sincronizar alias button-group | 10 min | Medio — cierra bug latente en macro-host | Bajo |
| **F2.1** | TROUBLESHOOTING.md | 1-2 h | Alto — reduce conocimiento tribal | Ninguno |
| **F2.3** | Agrupar scripts en package.json | 20 min | Medio — reduce carga cognitiva diaria | Ninguno |

Estos cinco cambios son ejecutables en una jornada de trabajo sin riesgo funcional.

---

## 4. CAMBIOS QUE REQUIEREN DECISIÓN MANUAL

| # | Decisión | Impacto de no decidir | Opciones |
|---|---|---|---|
| D1 | Plataforma de CI/CD | Sin CI, el gate de contratos se ejecuta solo manualmente | GitHub Actions / GitLab CI / Azure DevOps |
| D2 | CDN de producción | Deploy a producción sigue siendo proceso manual fuera del repo | S3 / Azure Blob / Cloudflare R2 |
| D3 | Destino del `bridge/` | Es infraestructura que no aporta valor actualmente | Mantener / Implementar en POCs / Eliminar como código |
| D4 | ¿`accordion` y `avatar` pasan a CDN? | Tienen implementación Angular + SSR; podrían activarse como CE/CDN sin desarrollo nuevo | Añadir IContentResolver en CMS / Dejarlos solo en SSR |
| D5 | ¿`pricing-card` y `stat` necesitan Angular CE? | Hoy son React POC + SSR. Si se quiere CDN Angular, hay que implementarlos | Implementar en Angular / Mantener React POC / Mantener solo SSR |
| D6 | Estrategia de versionado | Sin `nx release` configurado para elementos, el bump es manual | Configurar nx release para apps/elements / Manual con disciplina / Script custom |

---

## 5. RIESGOS DE IMPLEMENTACIÓN

### R1 — F1.2 invalida caché de builds no relacionados (aceptable)

**Escenario:** Un cambio en `vitals/core-assets/src/scss/tokens/colors.scss` marca TODOS los proyectos Angular como affected, incluyendo elementos que no usan ese token directamente.

**Evaluación:** Es el comportamiento correcto dado que vitals/ no tiene granularidad de proyectos Nx. La alternativa (seguir sin tracking) es peor: builds stale silenciosos. El costo en tiempo de build es bajo si el caché de Nx Cloud está activo.

**Mitigación:** Con Nx Cloud activo (ya configurado), los proyectos afectados pero sin cambios reales en su output usarán la caché distribuida si ya fueron buildeados antes.

### R2 — F1.3 alias change puede requerir flush de caché en macro-host

**Escenario:** Si `macro-host` tiene alguna caché del registry en alguna instancia del CMS en producción (poco probable dado que el registry se carga desde CDN en startup), el cambio de alias requeriría un restart.

**Mitigación:** La ruta CDN de `button-group` no cambia. El Custom Element tag (`synergos-button-group`) no cambia. El único cambio es el alias de lookup interno. El `ElementRegistry` se re-inicializa en cada startup de `macro-host` con `provideElementRegistry(ELEMENT_REGISTRY)`.

### R3 — F2.3 agrupación de scripts no es JSON estándar

Si se usan comentarios en `package.json`, algunos tooling los rechaza. La alternativa es usar un archivo `SCRIPTS.md` que documente la agrupación sin tocar el JSON.

**Mitigación:** Usar nombres descriptivos con prefijos claros (ya existen: `build:`, `release:`, `publish:`) y documentar la taxonomía en `SCRIPTS.md`.

---

## 6. LISTA DE PIEZAS A PRESERVAR SIN NEGOCIACIÓN

Las siguientes piezas no deben modificarse como parte de ninguna "simplificación" o "limpieza" sin evidencia de necesidad y análisis de impacto completo. Están aquí porque funcionan correctamente, son difíciles de recuperar si se rompen, o su valor real es mayor de lo que parece.

### Arquitectura

| Pieza | Por qué es intocable |
|---|---|
| **Dual Nx workspace** | Solución correcta al problema de aislar dependencias de framework. Unificarlos rompe el aislamiento de node_modules. |
| **Capa `vitals/`** | Única fuente agnóstica del sistema. Si adquiere dependencias de framework, la portabilidad cross-framework desaparece. |
| **Separación `ElementData` vs `ElementConfig`** | Los Custom Elements solo pueden recibir atributos HTML (strings). Si se les pasa un objeto JS, el atributo se serializa como `[object Object]`. Esta separación previene bugs de runtime que son difíciles de diagnosticar. |
| **Boundary ESLint `scope:elements` → no puede importar `scope:rendering`** | Garantiza que elementos de UI son independientes del runtime. Si se elimina, los elementos podrían acoplarse al mecanismo de mounting y perder la capacidad de funcionar standalone. |

### Build y distribución

| Pieza | Por qué es intocable |
|---|---|
| **Import map + runtime bundle Angular** | Reduce el payload por página ~80% (395 KB runtime compartido vs 130-200 KB por elemento standalone). Cambiar esta estrategia requiere un análisis de impacto de performance serio. |
| **Slots CDN (`/{semver}/`, `/v{major}/`, `/latest/`)** | Permite producción estable con `/v{major}/`, rollback inmediato con `/{semver}/`, y staging con `/latest/`. Simplificar los slots elimina capacidades operativas críticas. |
| **`contracts:validate` como gate pre-publish** | Es el único mecanismo automático que valida integridad del sistema antes de publicar. Si se bypasea o relaja, se puede publicar con contratos rotos y el CMS puede consumir manifests inválidos. |

### Gobernanza

| Pieza | Por qué es intocable |
|---|---|
| **`SynergosDocs/`** | 16 documentos, ~3000 líneas de documentación arquitectónica. Es la única fuente de verdad para entender el sistema completo. Ampliar, no reemplazar. |
| **`LLM.txt`** | Governance para agentes IA. Previene regresiones en generación de código. Debe actualizarse con cualquier cambio de convención, nunca reducirse. |
| **Sistema de tags Nx (`framework:`, `scope:`, `tier:`)** | Da trazabilidad real al grafo de proyectos. Los tags son la clave para entender qué afecta a qué. Eliminarlos elimina la posibilidad de razonamiento sobre el sistema. |

### Contratos

| Pieza | Por qué es intocable |
|---|---|
| **`element-registry.json`** | Fuente de verdad del catálogo. El CMS, el CLI, el manifest generator, el audit tool y el registry CDN derivan de este archivo. No sincronizar un cambio aquí con el CMS puede romper el rendering de páginas. |
| **`element-inputs.json` + audit pipeline** | El sistema actual pasa audit limpiamente (58/58). Cualquier cambio en la estructura del JSON o en las reglas del audit debe probarse con el audit corriendo en CI antes de commitear. |
| **La separación `rendering/` como lib** | Aunque solo la usa `macro-host`, la separación en librería independiente garantiza que el boundary `scope:elements → no puede importar scope:rendering` es ejecutable por ESLint. Si se fusiona con `macro-host`, se pierde el boundary. |

---

## APÉNDICE: ORDEN DE EJECUCIÓN RECOMENDADO

```
Semana 1:
  ├── F1.1 — Corregir import ElementMounter           (30 min, sin riesgo)
  ├── F1.2 — Fix Nx affected para vitals/             (1 h, bajo riesgo)
  ├── F1.3 — Sincronizar alias button-group           (30 min, bajo riesgo)
  └── F2.1 — Crear TROUBLESHOOTING.md                 (2 h, sin riesgo)

Semana 2:
  ├── F2.2 — Documentar estado de bridge/             (1 h, sin riesgo)
  └── F2.3 — Agrupar scripts package.json             (30 min, sin riesgo)

Bloqueado hasta decisión de equipo:
  ├── F3.1 — Pipeline CI/CD                           (D1: plataforma?)
  ├── F3.2 — Parametrizar CDN producción              (D2: CDN real?)
  └── F3.3 — Destino bridge/                          (D3: estrategia POCs?)

No urgente, evaluar en backlog:
  ├── D4 — accordion y avatar a ruta CDN
  ├── D5 — pricing-card y stat en Angular
  └── D6 — automatización de versionado de elementos
```

---

*Plan basado en evidencia real de código. Ninguna acción propuesta aquí requiere cambios estructurales sobre la arquitectura base. Branch: `master`. Fecha: 2026-04-03.*
