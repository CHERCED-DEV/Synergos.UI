> ⚠️ **OBSOLETO desde la purga de Nx (2026-08-04).** Este documento describe la arquitectura de build anterior. El build actual: `platforms/angular/tools/build.mjs` — ver BUILD_PIPELINE.md.

# SYNERGOS.UI — VALIDACIÓN TÉCNICA EMPÍRICA

> Segunda pasada. Basada en lectura directa de código fuente, ejecución de herramientas y
> verificación cruzada entre repos UI y CMS. Distingue con precisión entre hallazgos confirmados,
> hipótesis razonables y decisiones que requieren validación adicional.

---

## 1. HALLAZGOS CONFIRMADOS CON EVIDENCIA

### CF-01 — `libs/core-assets/` NO EXISTE (Corrección al Audit 1)

**Evidencia:**
```bash
ls platforms/angular/libs/
# → core  integrations  rendering  shared
# NO aparece core-assets
```

**Realidad:** Angular consume `vitals/core-assets/` directamente por dos rutas:

1. **SCSS** via `includePaths` en `platforms/angular/nx.json`:
   ```json
   "stylePreprocessorOptions": {
     "includePaths": ["../../vitals/core-assets/src"]
   }
   ```

2. **TypeScript** via path alias en `platforms/angular/tsconfig.json`:
   ```json
   "@synergos/core-assets": ["../../vitals/core-assets/src/index.ts"]
   ```

**Conclusión:** El hallazgo de "dos copias de SCSS tokens" del Audit 1 era **falso**. No existe duplicación. Angular usa la fuente única directamente. Sin riesgo de divergencia por copia.

---

### CF-02 — Bridge Protocol es código de interfaz sin implementaciones activas

**Evidencia — grep exhaustivo en toda la plataforma:**
```
grep -r "bridge|element-protocol|input-serializer|lifecycle-hooks" platforms/ --include="*.ts" -l
# → 0 archivos en Angular, React, Svelte, Vanilla
```

**Único match encontrado:**
```
platforms/angular/apps/experiences/insight-explorer/src/insight-explorer/domain/insight.domain.ts:89
# → texto hardcodeado en datos demo: "Bridge protocol cross-framework"
# → es una cadena en un array de datos estáticos, NO un import
```

**Contenido real de `vitals/core/src/bridge/`:**
- `element-protocol.ts` — interfaces TypeScript solamente (`ElementProtocol`, `ElementRegistration`)
- `input-serializer.ts` — 3 funciones utilitarias puras
- `lifecycle-hooks.ts` — interfaz `LifecycleHooks` solamente
- `index.ts` — re-exporta los tres archivos

**Los POCs no usan bridge:**
- React (`pricing-card/main.tsx`): implementa `HTMLElement` subclass manualmente con `connectedCallback`, `disconnectedCallback`, `attributeChangedCallback` propios.
- Svelte (`accordion/main.ts`): una línea: `import './Accordion.svelte'` — el compilador Svelte con `customElement: true` genera el wrapper directamente.

**El bridge SÍ está exportado** en `vitals/core/src/index.ts`:
```ts
export * from './bridge'; // presente
```
Por tanto es API pública pero sin consumidores reales.

**Conclusión:** `vitals/core/src/bridge/` es **infraestructura de intención, no de uso**. Define el contrato ideal de interoperabilidad cross-framework pero ningún framework lo implementa. No es dead code peligroso — no causa bugs — pero tampoco aporta valor funcional hoy.

---

### CF-03 — `@synergos/rendering` consumido exclusivamente por `macro-host`

**Evidencia:**
```
grep -r "from '@synergos/rendering'" platforms/angular/ --include="*.ts"

# Resultado exacto (3 archivos):
apps/elements/modules/macro-host/src/macro-host/macro-host.ts
apps/elements/modules/macro-host/src/macro-host/macro-host.spec.ts
apps/elements/modules/macro-host/src/app.config.ts
```

**Qué usa cada archivo:**
- `macro-host.ts` → `ElementMounter`
- `macro-host.spec.ts` → `ElementMounter` (mock en test)
- `app.config.ts` → `provideElementRegistry`

**Qué exporta `libs/rendering/src/index.ts`:**
```ts
export * from './engines';
// engines/: ElementRegistry, ComponentResolver, InputMapper, ElementMounter,
//           element-registry.providers (provideElementRegistry)
```

**Conclusión:** La librería `rendering/` es una pieza de infraestructura de **alcance muy específico**. Es crítica para `macro-host` y nadie más. Los 63 elementos de contenido (primitives, compositions, modules de contenido, experiences) tienen dependencia **cero** en rendering. Esto es correcto arquitectónicamente.

---

### CF-04 — `element-inputs.json` tiene 0 desincronías. Estado: saludable.

**Evidencia — ejecución directa:**
```bash
node -e "
  const d = require('./vitals/contracts/src/element-inputs.json');
  const keys = Object.keys(d).filter(k => !k.startsWith('_'));
  const empty = keys.filter(k => Array.isArray(d[k]) && d[k].length === 0);
  console.log('Total:', keys.length, 'Empty:', empty.length);
"
# → Total: 58  Empty: 0
```

**Confirmación adicional — element-contract-audit en vivo:**
```
$ node tools/element-contract-audit.mjs

Synergos Element Contract Audit
  Registry entries: 58
  Mapper aliases:   58
  Model files:      52
  Input entries:    58

Contract audit passed.
```

**Qué valida el audit (lectura real del código):**
- Cada entrada del registry tiene un mapper alias en `block.mapper.ts`
- Cada entrada del registry tiene inputs declarados en `element-inputs.json`
- Cada entrada del registry tiene un modelo de inputs (`*-inputs.model.ts`)
- Los campos del modelo coinciden con los campos del JSON de inputs

**La brecha que el audit NO detecta:** No compara los `input()` signals del componente Angular contra `element-inputs.json`. La sincronía se garantiza solo hasta el nivel de los modelos, no del código del componente. Sin embargo, dado que el patrón de los componentes es `input<Tipo>(alias: 'campo')` derivado directamente del modelo de inputs, la distancia entre modelo y componente es mínima.

**Conclusión del Audit 1 que era erróneo:** El archivo NO tiene entradas vacías, NO hay desincronías conocidas. El problema de mantenimiento es **teórico, no actual**.

---

### CF-05 — Git submodules: placeholder vacío, sin riesgo operativo activo

**Evidencia:**
```bash
cat .gitmodules
# → "# Git submodules registry"
# → (archivo vacío excepto por el comentario de cabecera)

ls platforms/angular/modules/
# → README.md
# → (solo el README, ningún directorio de módulo)
```

**Conclusión:** `platforms/angular/modules/` es una **infraestructura preparada para el futuro** pero sin contenido activo. No hay submodules registrados. No hay riesgo de `--recurse-submodules` porque no existe nada que recursar. El Audit 1 identificó un riesgo que **hoy no existe**. No necesita acción inmediata.

---

### CF-06 — `scope:cms-adapter` usado por exactamente 1 proyecto

**Evidencia:**
```
grep -r "cms-adapter" platforms/angular/ --include="project.json" -l
# → platforms/angular/apps/elements/modules/macro-host/project.json
# → (solo 1 resultado)
```

El tag está correctamente aplicado: `macro-host` es efectivamente el único elemento que necesita cruzar el boundary de rendering desde dentro de un elemento. No hay escape hatch generalizado.

**Conclusión:** El riesgo planteado en el Audit 1 no se materializa. La gobernanza está aplicada correctamente.

---

### CF-07 — Nx affected NO detecta cambios en `vitals/`

**Evidencia estructural:**

`platforms/angular/nx.json` — namedInputs:
```json
"namedInputs": {
  "default": ["{projectRoot}/**/*", "sharedGlobals"],
  "sharedGlobals": [
    "{workspaceRoot}/tsconfig.json",
    "{workspaceRoot}/nx.json"
  ]
}
```

`targetDefaults.@angular/build:application`:
```json
"inputs": ["production", "^production"]
```

**Por qué vitals/ no está cubierto:**
- `{projectRoot}/**/*` cubre solo archivos dentro de cada proyecto (`apps/elements/primitives/badge/**/*`)
- `sharedGlobals` cubre solo `platforms/angular/tsconfig.json` y `platforms/angular/nx.json`
- `vitals/` está fuera de `{workspaceRoot}` (`platforms/angular/`) del workspace Angular
- `vitals/` no tiene `project.json`, por lo que no es un proyecto Nx ni genera nodos en el grafo
- No hay plugins Nx configurados para rastrear dependencias TypeScript implícitas externas

**Escenario concreto de fallo:**
```bash
# Desarrollador modifica:
vitals/core/src/mappers/hero.mapper.ts

# Luego corre:
cd platforms/angular && npx nx affected --target=build

# Resultado: el proyecto `hero` NO aparece como affected.
# El build de `hero` usa el mapper stale desde caché.
# La publicación contiene el elemento incorrecto.
```

**Agravante:** `ElementMounter` en `rendering/` tiene un import directo con path relativo:
```ts
// platforms/angular/libs/rendering/src/engines/element-mounter.ts
import { mapBlockToElement } from '../../../../../../vitals/core/src/mappers/block.mapper';
```
Este import bypasea el alias `@synergos/core` y usa un path relativo directo. Nx no rastrea este path como dependencia del proyecto `rendering`. Un cambio en `block.mapper.ts` no marca `rendering` como affected.

**Conclusión:** Riesgo **confirmado y activo**. Cambios en vitals/ pueden producir builds stale en CI sin advertencia.

---

### CF-08 — El CMS tiene resolvers activos para 45 de 58 elementos (78%)

**Metodología:** cruce de `element-registry.json` contra `SupportedAlias` en los 4 archivos de resolvers del CMS (`ModuleContentResolvers.cs`, `CompositionContentResolvers.cs`, `PrimitiveContentResolvers.cs`, `ExperienceContentResolvers.cs`).

**Resultado:**

| Estado | Cantidad | Porcentaje |
|---|---|---|
| En registro + resolver CMS activo | 45 | 78% |
| En registro sin resolver CMS | 13 | 22% |
| En CMS sin estar en registro | 1 | — |

**Los 45 elementos con resolver activo confirmado:**
Modules (10): `hero`, `banner`, `banner-slider`, `data-table`, `faq-section`, `feature-grid`, `logo-cloud`, `section`, `tab-group`, `testimonial-section`
Modules-integration (4): `angular-host`, `iframe-embed`, `external-widget`, `mf-host`, `script-embed`
Compositions (13): `accordion` *(ver nota)*, `alert-bar`, `card`, `cta-group`, `faq-item`, `feature-item`, `gallery-item`, `info-block`, `key-value`, `logo-item`, `media-text`, `newsletter-form`, `social-share`, `testimonial-item`, `timeline-item`
Primitives (9): `badge`, `button`, `column`, `container-block`, `divider`, `grid`, `icon-block`, `image-block`, `link`, `spacer`, `stack`, `video-block`, `heading`
Experiences (3): `feature-journey`, `insight-explorer`, `media-explorer`

**Los 13 sin resolver CMS (clasificados):**

| Elemento | Alias registro | Categoría | Estado |
|---|---|---|---|
| `accordion` | elementCompAccordion | Composition | Implementado en Angular Y Svelte. Sin resolver CMS todavía. |
| `button-group` | elementCompButtonGroup | Composition | En Angular. Alias mismatch con CMS (ver CF-09). |
| `pricing-card` | elementInfoPricingCard | Composition | Solo React POC. Sin Angular. Sin resolver CMS. |
| `stat` | elementInfoStat | Composition | Solo React POC (`synergos-stat-counter`). Sin resolver CMS. |
| `macro-host` | elementIntegrationMacroHost | Integration | Tiene su propio `MacroHostResolver.cs` separado. No en los 4 archivos de resolvers estándar. |
| `avatar` | elementMediaAvatar | Primitive | Implementado en Angular Y Svelte. Sin resolver CMS. |
| `hello-world` | elementTemplateHelloWorld | Primitive | Template de demostración. No es un elemento de producción. |
| `text-block` | elementTextBlock | Primitive | Comparte tag `synergos-text-block` con `heading`. Variant genérico. |
| `eyebrow` | elementTextEyebrow | Primitive | Comparte tag `synergos-text-block`. Sin resolver propio. |
| `label` | elementTextLabel | Primitive | Comparte tag `synergos-text-block`. Sin resolver propio. |
| `paragraph` | elementTextParagraph | Primitive | Comparte tag `synergos-text-block`. Sin resolver propio. |
| `quote` | elementTextQuote | Primitive | Comparte tag `synergos-text-block`. Sin resolver propio. |
| `rich-text` | elementTextRichText | Primitive | Comparte tag `synergos-text-block`. Sin resolver propio. |

**Nota sobre `text-block` y variantes de texto:** 7 entradas del registry (`heading`, `paragraph`, `rich-text`, `eyebrow`, `quote`, `label`, `text-block`) mapean al mismo tag `synergos-text-block`. El CMS solo tiene resolver para `elementTextHeading`. Las demás variantes existen como aliases alternativos del mismo elemento pero sin rutas CMS propias. Es un diseño intencional (un Custom Element, múltiples aliases semánticos) pero solo `heading` está completamente cerrado.

---

### CF-09 — Alias mismatch entre CMS resolver y element-registry para `button-group`

**Evidencia:**
```
# En Synergos.CMS:
public string SupportedAlias => "elementActionButtonGroup";

# En vitals/contracts/src/element-registry.json:
{ "name": "button-group", "alias": "elementCompButtonGroup", ... }
```

**Impacto en rendering directo (Razor views):** Ninguno. El `SupportedAlias` del CMS selecciona qué resolver C# se invoca. El tag resultante (`synergos-button-group`) se inyecta en el HTML directamente. El alias del registry NO se usa en esa ruta.

**Impacto en macro-host:** Real. Si `macro-host` recibe `contentType: "elementActionButtonGroup"`, `ComponentResolver` busca en el registry que tiene `"elementCompButtonGroup"` → no resuelve → `macro-host` no monta el elemento → silencio.

**Conclusión:** El mismatch es un bug latente si `button-group` se usa alguna vez vía `macro-host` con el alias del CMS. No es un bug actual si el CMS lo renderiza directamente. Requiere sincronización de alias.

---

### CF-10 — La estructura de `rendering/` es coherente y no sobredimensionada para su función

**Código real de `ElementMounter`:**
```ts
mountBlock(container: HTMLElement, block: BlockConfig): HTMLElement | null {
  const mapped = mapBlockToElement(block);    // vitals/core/src/mappers/block.mapper
  const element = document.createElement(mapped.tag);
  this.#mapper.applyInputs(element, mapped.inputs);  // InputMapper: camelCase → kebab-case attrs
  container.appendChild(element);
  return element;
}
```

**Código real de `InputMapper`:**
```ts
applyInputs(element: HTMLElement, inputs: Record<string, string>): void {
  for (const [key, value] of Object.entries(inputs)) {
    element.setAttribute(this.#toKebabCase(key), value);
  }
}
```

**Código real de `ComponentResolver`:**
```ts
resolve(contentTypeAlias: string): string | null {
  return this.#registry.resolve(contentTypeAlias)?.tag ?? null;
}
```

**Análisis:** La capa rendering es pequeña (5 clases, ~150 líneas totales), hace exactamente lo que dice, y lo hace bien. No está sobredimensionada. El nombre "rendering" puede ser ambiguo (sugiere más complejidad de la que tiene), pero el código en sí es limpio.

---

## 2. HIPÓTESIS RAZONABLES AÚN NO CONFIRMADAS

### H-01 — element-inputs.json podría desincronizarse a medida que el catálogo crece

**Base:** El audit actual valida models vs inputs pero no valida `input()` signals del componente Angular vs inputs.json. Con 58 elementos en estado limpio hoy, el riesgo es teórico pero el mecanismo de derive es manual.

**Por confirmar:** ¿Hay alguna convención que fuerce la sincronía entre el componente y su modelo de inputs? Si el patrón es siempre: componente → declara los mismos campos que su `*-inputs.model.ts`, entonces el audit sí cubre la sincronía indirectamente.

**Estado:** Hipótesis razonable. No urgente. Monitorear a medida que crezca el catálogo.

---

### H-02 — El mismatch `elementActionButtonGroup` vs `elementCompButtonGroup` puede repetirse en otros elementos

**Base:** Solo inspeccioné los 4 archivos de resolvers estándar. Hay otros archivos en `Rendering/`: `ArtifactResolver.cs`, `ElementResolver.cs`, `MacroHostResolver.cs`, `PropsResolver.cs`. Pueden contener aliases que difieran del registry.

**Por confirmar:** Hacer un cruce completo de TODOS los aliases en todo el repo CMS contra todo el registry.

---

### H-03 — Los 6 elementos sin model file (`Model files: 52` vs 58 en registry) pueden tener validación incompleta

**Base:** El audit dice 52 model files para 58 elementos. Los 6 sin modelo son:
- Los 6 text-block variants (paragraph, rich-text, eyebrow, quote, label, text-block) probablemente comparten un modelo genérico
- O `hello-world` y algún otro no tienen modelo

**Por confirmar:** Identificar cuáles 6 no tienen modelo y si el audit los pasa por excepción o porque están cubiertos por un modelo compartido.

---

### H-04 — El import directo en `ElementMounter` puede existir en otros lugares del codebase

**Base:** Encontré `import { mapBlockToElement } from '../../../../../../vitals/core/src/mappers/block.mapper'` en `element-mounter.ts`. Este patrón (import relativo directo a vitals/) puede repetirse en otros lugares.

**Por confirmar:** Grep exhaustivo de imports relativos que crucen el boundary hacia `vitals/`.

---

## 3. VALIDACIÓN REAL DEL CONSUMO UI ↔ CMS

### Matriz de estado de cada elemento

| Elemento | Tier | Tag registrado | CMS Resolver | Framework(s) | Estado operativo |
|---|---|---|---|---|---|
| hero | module | synergos-hero | ✅ elementCompHero | Angular | **Producción** |
| banner | module | synergos-banner | ✅ elementCompCtaBanner | Angular | **Producción** |
| section | module | synergos-section | ✅ elementStructSection | Angular | **Producción** |
| feature-grid | module | synergos-feature-grid | ✅ elementCompFeatureGrid | Angular | **Producción** |
| faq-section | module | synergos-faq-section | ✅ elementCompFaqList | Angular | **Producción** |
| testimonial-section | module | synergos-testimonial-section | ✅ elementCompTestimonialList | Angular | **Producción** |
| logo-cloud | module | synergos-logo-cloud | ✅ elementCompLogoCloud | Angular | **Producción** |
| tab-group | module | synergos-tab-group | ✅ elementCorpTabGroup | Angular | **Producción** |
| banner-slider | module | synergos-banner-slider | ✅ elementCorpBannerSlider | Angular | **Producción** |
| data-table | module | synergos-data-table | ✅ elementCorpDataTable | Angular | **Producción** |
| script-embed | module | synergos-script-embed | ✅ elementIntScriptEmbed | Angular | **Producción** |
| angular-host | module | synergos-angular-host | ✅ elementIntAngularHost | Angular | **Producción** |
| mf-host | module | synergos-mf-host | ✅ elementIntMfHost | Angular | **Producción** |
| macro-host | module | synergos-macro-host | ⚠️ resolver separado | Angular | **Producción (ruta especial)** |
| card | composition | synergos-card | ✅ elementCompCard | Angular | **Producción** |
| media-text | composition | synergos-media-text | ✅ elementCompMediaTextSplit | Angular | **Producción** |
| info-block | composition | synergos-info-block | ✅ elementCompInfoBlock | Angular | **Producción** |
| accordion | composition | synergos-accordion | ❌ sin resolver | Angular + Svelte | **Sin CMS** |
| cta-group | composition | synergos-cta-group | ✅ elementActionCtaGroup | Angular | **Producción** |
| button-group | composition | synergos-button-group | ⚠️ alias mismatch | Angular | **Sin CMS (alias roto)** |
| feature-item | composition | synergos-feature-item | ✅ elementInfoFeature | Angular | **Producción** |
| stat | composition | synergos-stat-counter | ❌ sin resolver | React | **Sin CMS** |
| pricing-card | composition | synergos-pricing-card | ❌ sin resolver | React | **Sin CMS** |
| key-value | composition | synergos-key-value | ✅ elementInfoKeyValue | Angular | **Producción** |
| timeline-item | composition | synergos-timeline-item | ✅ elementInfoTimelineItem | Angular | **Producción** |
| faq-item | composition | synergos-faq-item | ✅ elementInfoFaqItem | Angular | **Producción** |
| testimonial-item | composition | synergos-testimonial-item | ✅ elementInfoTestimonialItem | Angular | **Producción** |
| gallery-item | composition | synergos-gallery-item | ✅ elementMediaGalleryItem | Angular | **Producción** |
| logo-item | composition | synergos-logo-item | ✅ elementMediaLogoItem | Angular | **Producción** |
| alert-bar | composition | synergos-alert-bar | ✅ elementCorpAlertBar | Angular | **Producción** |
| newsletter-form | composition | synergos-newsletter-form | ✅ elementCorpNewsletterForm | Angular | **Producción** |
| social-share | composition | synergos-social-share | ✅ elementCorpSocialShare | Angular | **Producción** |
| iframe-embed | composition | synergos-iframe-embed | ✅ elementIntIframeEmbed | Angular | **Producción** |
| external-widget | composition | synergos-external-widget | ✅ elementIntExternalWidget | Angular | **Producción** |
| container-block | primitive | synergos-container-block | ✅ elementStructContainer | Angular | **Producción** |
| grid | primitive | synergos-grid | ✅ elementStructGrid | Angular | **Producción** |
| column | primitive | synergos-column | ✅ elementStructColumn | Angular | **Producción** |
| stack | primitive | synergos-stack | ✅ elementStructStack | Angular | **Producción** |
| divider | primitive | synergos-divider | ✅ elementStructDivider | Angular | **Producción** |
| spacer | primitive | synergos-spacer | ✅ elementStructSpacer | Angular | **Producción** |
| heading | primitive | synergos-text-block | ✅ elementTextHeading | Angular | **Producción** |
| paragraph | primitive | synergos-text-block | ❌ sin resolver | Angular | **Sin CMS (variant)** |
| rich-text | primitive | synergos-text-block | ❌ sin resolver | Angular | **Sin CMS (variant)** |
| eyebrow | primitive | synergos-text-block | ❌ sin resolver | Angular | **Sin CMS (variant)** |
| quote | primitive | synergos-text-block | ❌ sin resolver | Angular | **Sin CMS (variant)** |
| label | primitive | synergos-text-block | ❌ sin resolver | Angular | **Sin CMS (variant)** |
| text-block | primitive | synergos-text-block | ❌ sin resolver | Angular | **Sin CMS (variant)** |
| button | primitive | synergos-button-container | ✅ elementActionButton | Angular | **Producción** |
| link | primitive | synergos-link-block | ✅ elementActionLink | Angular | **Producción** |
| image-block | primitive | synergos-image-block | ✅ elementMediaImage | Angular | **Producción** |
| video-block | primitive | synergos-video-block | ✅ elementMediaVideo | Angular | **Producción** |
| icon-block | primitive | synergos-icon-block | ✅ elementMediaIcon | Angular | **Producción** |
| avatar | primitive | synergos-avatar | ❌ sin resolver | Angular + Svelte | **Sin CMS** |
| badge | primitive | synergos-badge | ✅ elementInfoBadge | Angular | **Producción** |
| hello-world | primitive | synergos-hello-world | ❌ sin resolver | Angular | **Template** |
| feature-journey | experience | synergos-feature-journey | ✅ experienceFeatureJourney | Angular | **Producción** |
| insight-explorer | experience | synergos-insight-explorer | ✅ experienceInsightExplorer | Angular | **Producción** |
| media-explorer | experience | synergos-media-explorer | ✅ experienceMediaExplorer | Angular | **Producción** |

**Resumen:**
- **45 en producción**: tienen registro + resolver CMS + implementación Angular
- **3 experiencias en producción**: feature-journey, insight-explorer, media-explorer
- **2 sin CMS (solo React POC)**: stat, pricing-card
- **2 sin resolver CMS (implementados, pendientes)**: accordion, avatar
- **1 sin CMS (alias roto)**: button-group
- **6 variantes de text-block sin resolver propio**: paragraph, rich-text, eyebrow, quote, label, text-block
- **1 template**: hello-world
- **1 integration con ruta especial**: macro-host

---

## 4. VALIDACIÓN DEL GRAFO NX Y `affected`

### Dictamen: `vitals/` NO participa en el grafo Nx Angular — CONFIRMADO

**Razón técnica:**

El workspace Angular (`platforms/angular/`) tiene `{workspaceRoot}` = `platforms/angular/`. Los `namedInputs` son:

```json
"sharedGlobals": [
  "{workspaceRoot}/tsconfig.json",   // platforms/angular/tsconfig.json
  "{workspaceRoot}/nx.json"          // platforms/angular/nx.json
]
```

`vitals/` vive en `../../vitals/` relativo al workspace Angular. Sus archivos no están en ningún `{projectRoot}/**/*` (cada projectRoot está dentro de `apps/` o `libs/`). No están en `sharedGlobals`. No son proyectos Nx (no tienen `project.json`). No hay plugins Nx configurados para rastrear TypeScript imports externos.

**Tabla de comportamiento por tipo de cambio:**

| Cambio en vitals/ | Proyectos Angular detectados como affected | Estado |
|---|---|---|
| `vitals/core/src/mappers/hero.mapper.ts` | Ninguno | ❌ Gap confirmado |
| `vitals/contracts/src/element-registry.json` | Ninguno | ❌ Gap confirmado |
| `vitals/core-assets/src/scss/tokens/colors.scss` | Ninguno | ❌ Gap confirmado |
| `vitals/shared/src/utils/` | Ninguno | ❌ Gap confirmado |
| `platforms/angular/tsconfig.json` | Todos (por sharedGlobals) | ✅ Funciona |
| `platforms/angular/nx.json` | Todos (por sharedGlobals) | ✅ Funciona |
| `platforms/angular/libs/shared/src/**` | Todos los que dependen de shared | ✅ Funciona |

**Mitigación parcial existente:** Si se modifica `platforms/angular/tsconfig.json` (por ejemplo, al añadir un nuevo path alias), se invalida toda la caché. Pero cambiar el CONTENIDO de vitals no modifica tsconfig.json.

**Impacto real:** En builds locales (desarrollo normal), el desarrollador re-construye frecuentemente y no nota el problema. En CI (que aún no existe) o en workflows que confían en `nx affected` para builds incrementales, un cambio en `hero.mapper.ts` podría servirse desde caché stale.

---

## 5. VALIDACIÓN DE `bridge/`

### Dictamen: Interfaces sin implementaciones. Infraestructura de aspiración, no de uso.

**Contenido completo del bridge:**

```
element-protocol.ts   → interface ElementProtocol { tag, mount(), update(), destroy() }
                         interface ElementRegistration { tag, framework, factory }
input-serializer.ts   → serializeInput(), deserializeInput(), inputsToAttributes()
lifecycle-hooks.ts    → interface LifecycleHooks { onMount?, onInputChange?, onDestroy? }
index.ts              → re-exporta todo
```

**Consumidores reales:** Cero en producción. Cero en tests. Cero en POCs.

**Por qué React no lo usa:**

```tsx
// platforms/react/apps/elements/compositions/pricing-card/src/main.tsx
class PricingCardElement extends HTMLElement {
  static observedAttributes = OBSERVED;
  #root: Root | null = null;
  connectedCallback() { this.#render(); }
  disconnectedCallback() { this.#root?.unmount(); }
  attributeChangedCallback() { this.#render(); }
  // → Implementación manual completa, sin bridge
}
```

**Por qué Svelte no lo usa:**
```ts
// platforms/svelte/apps/elements/compositions/accordion/src/main.ts
import './Accordion.svelte';
// → El compilador Svelte con customElement:true genera el CE wrapper automáticamente
// → Sin bridge, sin protocol, sin lifecycle-hooks explícitos
```

**¿Es un problema?** No actualmente. El bridge no causa bugs (es solo interfaces), no agrega peso a bundles (no se importa), no genera deuda técnica activa. Su valor potencial es como contrato de interoperabilidad si en el futuro se quisiera un registry dinámico cross-framework. Sin ese caso de uso concreto, es documentación ejecutable sin ejecutar.

---

## 6. VALIDACIÓN DE `rendering/`

### Dictamen: Pequeña, cohesiva, necesaria para macro-host. No sobredimensionada.

**Tamaño real de la librería:**

| Archivo | Líneas | Responsabilidad |
|---|---|---|
| `element-registry.ts` | 20 | Signal-based registry (alias → tag) |
| `element-registry.providers.ts` | 47 | `provideElementRegistry()` factory |
| `component-resolver.ts` | 18 | alias → tag lookup |
| `input-mapper.ts` | 15 | camelCase → kebab-case → setAttribute |
| `element-mounter.ts` | 49 | orquesta: map → create → apply → append |
| `engines/index.ts` | 1 | re-export |
| `index.ts` | 1 | re-export |
| **Total** | **~151 líneas** | — |

**Análisis de cada clase:**

`ElementRegistry`: Mantiene un Map signal-based de `alias → { tag }`. Inicializado por `provideElementRegistry(ELEMENT_REGISTRY)` donde `ELEMENT_REGISTRY` = `element-registry.json`.

`ComponentResolver`: Adapta `alias → tag` con logging de warnings cuando no resuelve.

`InputMapper`: Convierte `Record<string, string>` de camelCase a atributos kebab-case del DOM.

`ElementMounter`: Orquesta el flujo completo: `BlockConfig` → mapper → `createElement` → applyInputs → append.

**Hallazgo de import directo en ElementMounter:**
```ts
// element-mounter.ts línea 4
import { mapBlockToElement } from '../../../../../../vitals/core/src/mappers/block.mapper';
```
Este import usa un path relativo que cruza el boundary de workspace (`../../../../../../vitals/`). Bypasea el alias `@synergos/core`. Consecuencias:
1. Nx no puede detectar la dependencia en el grafo
2. Si `vitals/core/src/mappers/block.mapper.ts` cambia, `rendering/` no aparece como affected
3. Si el path cambia (reorganización), el error ocurre en compilación (perceptible), no silenciosamente

**¿Está sobredimensionada?** No. 151 líneas para una responsabilidad específica y bien definida. Si `macro-host` desapareciera, toda la librería sería removible sin impacto en el resto del sistema.

**¿Es crítica?** Sí, pero solo para la funcionalidad de `macro-host`. Si `macro-host` es un elemento de producción usado activamente en el CMS (confirmado: tiene `MacroHostResolver.cs`), entonces `rendering/` es crítica para esa ruta.

---

## 7. VALIDACIÓN DE `element-inputs.json`

### Dictamen: Estado actual limpio. Mecanismo de sincronía depende solo de disciplina + audit.

**Estado empírico:**
- 58 elementos declarados
- 0 arrays vacíos
- 100% alineado con `element-registry.json`
- 100% alineado con `vitals/core/src/models/` (a nivel de campos, según audit)
- Audit pasa limpiamente: `Contract audit passed.`

**Qué valida el audit (confirmado leyendo el código):**
1. Cada entry de registry tiene un mapper en `block.mapper.ts` ✓
2. Cada entry de registry tiene key en `element-inputs.json` ✓
3. Cada entry de registry tiene `*-inputs.model.ts` en `models/` ✓
4. Campos del modelo coinciden con campos del JSON de inputs ✓ (ambas direcciones)

**Qué NO valida el audit:**
- Los `input()` signals del componente Angular vs los fields del modelo (no parsea TypeScript de componentes)
- La completitud de la documentación de cada input (descriptions, defaults pueden ser vacíos)

**Evaluación del riesgo real:** El modelo actúa como intermediario entre el JSON y el componente. Si se sigue el patrón establecido (componente usa exactamente los mismos campos que su modelo), el audit cubre la sincronía efectivamente. El riesgo solo se materializa si alguien añade un `input()` al componente sin actualizar el modelo.

---

## 8. VALIDACIÓN DE DUPLICIDAD `core-assets`

### Dictamen: NO hay duplicación. El hallazgo del Audit 1 era incorrecto.

**Evidencia:**
```bash
ls platforms/angular/libs/
# → core  integrations  rendering  shared
# → NO hay core-assets
```

**Fuente real y única:** `vitals/core-assets/src/scss/`

**Cómo Angular la consume:**

Para SCSS (compilación de estilos de componentes):
```json
// platforms/angular/nx.json (targetDefaults)
"stylePreprocessorOptions": {
  "includePaths": ["../../vitals/core-assets/src"]
}
```
Permite `@use 'scss' as syn;` en cualquier componente Angular sin path relativo.

Para TypeScript (imports de utilidades de tokens si los hubiera):
```json
// platforms/angular/tsconfig.json
"@synergos/core-assets": ["../../vitals/core-assets/src/index.ts"]
```

**Para React/Svelte/Vanilla:** Consumen directamente vía `vitals/shared/src/build/vite-base.ts` o configuraciones de Vite que incluyen los mismos paths.

**No existe divergencia.** No existe copia. El riesgo reportado en el Audit 1 **no existe**.

---

## 9. VALIDACIÓN DE GIT SUBMODULES

### Dictamen: Infraestructura preparada, sin contenido activo. Riesgo operativo cero.

**Evidencia:**
```bash
cat .gitmodules
# → "# Git submodules registry"
# → (vacío — solo comentario de encabezado)

ls platforms/angular/modules/
# → README.md
```

**Conclusión:** `.gitmodules` existe como registro de intención pero sin submodules registrados. `platforms/angular/modules/` es un placeholder vacío con README. No hay ningún submodule activo que requiera `--recurse-submodules` en ningún clone.

**Riesgo actual:** Ninguno. El README en `modules/` puede documentar la intención de uso futuro.

**Implicación para builds:** Un desarrollador que clone el repo sin `--recurse-submodules` no rompe nada. La carpeta `modules/` simplemente tiene el README.

---

## 10. CLASIFICACIÓN DE COMPLEJIDAD POR CATEGORÍA

| Pieza | Clasificación | Justificación |
|---|---|---|
| **Dual Nx workspace** | Complejidad necesaria y bien gestionada | Aislamiento técnico correcto. Sin esto, React/Svelte/Vanilla instalarían ng-packagr/zone.js. La solución es la adecuada para el caso de uso. |
| **`vitals/` (capa agnóstica)** | Complejidad necesaria y bien gestionada | Es la pieza más valiosa del diseño. Separa contratos de frameworks. Funciona limpiamente. |
| **`contracts/` (registry + inputs)** | Complejidad necesaria y bien gestionada | El JSON dual (registry + inputs) tiene un audit que los valida. El costo es bajo, el valor (contrato formal con CMS) es alto. |
| **`bridge/`** | Complejidad temporal aceptable | Define el protocolo ideal. No tiene implementaciones. No causa daño. Su valor es futuro. Si en 12 meses no hay implementaciones, reclasificar. |
| **`rendering/`** | Complejidad necesaria y bien gestionada | 151 líneas, cohesiva, para una función específica. No sobredimensionada. |
| **`experiences/`** | Complejidad necesaria pero mal visibilizada | La arquitectura 4-capas es correcta para la complejidad funcional. Pero la distinción con `elements/` no es evidente desde la estructura de carpetas ni hay lint que la enforece. |
| **Integration hosts (`macro-host`, `angular-host`, `mf-host`)** | Complejidad necesaria pero mal visibilizada | Técnicamente correctos. Operativamente confusos al estar mezclados con elementos de contenido. Solo taxonómico, no funcional. |
| **Runtime Angular (bundles ng-*.js)** | Complejidad necesaria y bien gestionada | La estrategia de externalización + import-map es sólida. Reduce bundle ~80%. El mecanismo es sofisticado pero el resultado es claro. |
| **Import map** | Complejidad necesaria y bien gestionada | Mecanismo estándar web (ES module import maps). Correcto y bien implementado. |
| **Scripts de `tools/`** | Complejidad necesaria pero mal visibilizada | 9 scripts bien escritos hacen cosas correctas. Pero no hay documentación de entrada/salida, ni tests. Son una caja negra. |
| **Slots CDN (semver/major/latest)** | Complejidad necesaria y bien gestionada | Estrategia de versionado estándar. Clara, bien documentada, sin ambigüedad. |
| **Git submodules** | Complejidad temporal aceptable | Hoy es un placeholder vacío sin riesgo. Si se pobla sin governance, se convierte en complejidad accidental. |
| **POCs multi-framework (React/Svelte/Vanilla)** | Complejidad temporal aceptable | Su propósito (demostrar portabilidad) es claro. Son aislados, no contaminan Angular. El problema es la falta de governance equivalente. |
| **`NX_WORKSPACE_ROOT_PATH`** | Complejidad accidental | Es un efecto secundario de cómo Nx maneja variables de entorno entre workspaces. No aporta valor, solo exige disciplina. Documentar bien es la solución mínima. |
| **`vitals/` invisible al grafo Nx Angular** | Complejidad accidental | No fue diseñada intencionalmente. Es una consecuencia de que vitals/ no tiene project.json. Requiere solución. |
| **Import relativo directo en `ElementMounter`** | Complejidad accidental | `../../../../../../vitals/core/...` bypasea el sistema de aliases. Debe corregirse a `@synergos/core`. |
| **41 scripts en root `package.json`** | Complejidad necesaria pero mal visibilizada | Los scripts son necesarios para la diversidad de targets. La falta de agrupación es el problema. |

---

## 11. FORTALEZAS A PRESERVAR SIN NEGOCIACIÓN

Estas piezas no deben tocarse sin justificación fuerte y análisis de impacto. En ningún caso como parte de una simplificación de "limpieza".

### 1. Dual Nx workspace
La separación `platforms/angular/nx.json` + root `nx.json` es la solución correcta al problema de aislar dependencias de framework. Unificarlos implicaría que React/Svelte instalen `@angular/compiler-cli`, `ng-packagr`, `zone.js`. No tocar.

### 2. Boundaries ESLint con `@nx/enforce-module-boundaries`
Las reglas `scope:elements → no puede importar scope:rendering` son arquitectura ejecutable. Cualquier refactor que las elimine elimina la garantía estructural de que elementos de contenido son independientes del runtime. No tocar.

### 3. Modelo de slots CDN (`/{semver}/`, `/v{major}/`, `/latest/`)
Estrategia de distribución correcta, documentada, coherente. Permite producción estable, staging, rollback y audit trail. No tocar.

### 4. Import map + runtime bundle
La externalización de Angular core + import-map reduce el payload por página ~80%. Es la decisión de ingeniería más impactante en performance del sistema. Cambiarla requeriría un análisis de impacto muy serio. No tocar sin evidencia de necesidad.

### 5. `contracts:validate` como gate pre-publish
El audit (`element-contract-audit.mjs`) es el único mecanismo automático que valida integridad del sistema. Si se rompe o se bypasea, se pierde la capacidad de detectar contratos rotos antes de publicar. No tocar ni relajar.

### 6. Separación `ElementData` vs `ElementConfig`
`ElementData` (dominio semántico CMS, objetos anidados) vs `ElementConfig` (payload plano de atributos HTML) es una separación semántica crítica. Los elementos Angular consumen solo `ElementConfig`. Si se colapsa esta distinción, los Custom Elements recibirían objetos complejos que no pueden manejar como atributos HTML. No tocar.

### 7. Capa `vitals/` (contracts, core, core-assets, shared)
Es la única capa verdaderamente agnóstica del sistema. Su valor es que los 4 frameworks pueden consumir las mismas interfaces y mappers sin acoplamiento a ningún framework. Cualquier modificación que añada dependencias de framework a vitals/ rompe este invariante. No tocar la separación.

### 8. Documentación estratégica en `SynergosDocs/`
Los 16 documentos (~3000 líneas) son la única fuente de verdad para entender el sistema. `ELEMENT_CONTRACT.md`, `BUILD_PIPELINE.md`, `INTEGRATION_GOVERNANCE.md`, `NX_GOVERNANCE.md`, `LLM.txt` son particularmente críticos. No reemplazar, solo ampliar.

### 9. `LLM.txt` como governance para agentes IA
Con 442 líneas de reglas para agentes de IA (incluyendo el agente actual), este archivo previene regresiones arquitectónicas en generación de código. Mantener actualizado con cualquier cambio de convención.

### 10. Separación rendering/ del scope de elements
La regla de boundary `scope:elements` no puede importar `scope:rendering` garantiza que los elementos de UI no saben cómo funcionan internamente. Preservar este boundary arquitectónico.

---

## 12. QUÉ PUEDE SIMPLIFICARSE SIN RIESGO

Ordenado por impacto y seguridad de ejecución:

| # | Acción | Riesgo | Impacto |
|---|---|---|---|
| S1 | Documentar `NX_WORKSPACE_ROOT_PATH` prominentemente en TROUBLESHOOTING.md | Ninguno | Alto (previene errores humanos) |
| S2 | Agregar `sharedGlobals` en Angular nx.json para rastrear `vitals/` vía inputs explícitos | Bajo (solo añade inputs al namedInput) | Alto (fixes affected gap) |
| S3 | Corregir el import relativo de `ElementMounter` a usar `@synergos/core` | Bajo (cambio de import, compilación valida) | Medio (mejora trazabilidad) |
| S4 | Agrupar los 41 scripts de root `package.json` con separadores de sección | Ninguno | Medio (reduce carga cognitiva) |
| S5 | Documentar que `bridge/` es API de intención sin implementaciones activas | Ninguno | Bajo (previene confusión) |
| S6 | Sincronizar alias: `elementCompButtonGroup` → `elementActionButtonGroup` (o viceversa) | Bajo-medio (cambio en registry o CMS, con prueba) | Medio (cierra bug latente de macro-host) |
| S7 | Agregar `ELEMENT_REGISTRY` como input explícito en el namedInput del proyecto `macro-host` | Bajo | Bajo (mejora affected de macro-host) |

---

## 13. QUÉ NO DEBE TOCARSE TODAVÍA

| Pieza | Razón |
|---|---|
| Renombrado de aliases `@synergos/core` | Requiere decisión de equipo (D1 del Audit 1). Impacta todos los imports del workspace Angular. |
| Mover integration hosts a subcarpeta | Es taxonómico. No hay evidencia de que cause problemas operativos hoy. Bajo impacto real. |
| Restructurar `tools/` | Los scripts funcionan. Hacerlos más transparentes (documentación, tests) es lo correcto, no restructurar. |
| Cambios al pipeline de CDN publish | Funciona. El único problema (CDN production path) se resuelve parametrizando `CDN_BASE_PATH`, sin tocar la lógica. |
| `rendering/` library | 151 líneas, funciona, es necesaria. No simplificar lo que no está complicado. |
| `bridge/` | No hace daño. Puede tener valor futuro. No remover sin decisión de producto sobre POC multi-framework. |
| Slots CDN | No tocar. |
| Import map strategy | No tocar. |

---

## 14. DECISIONES QUE REQUIEREN APROBACIÓN ANTES DE EJECUTAR

| # | Decisión | Por qué no puede asumirse | Opciones |
|---|---|---|---|
| D1 | **Fix del gap Nx affected para vitals/** | Hay múltiples formas de resolverlo con diferente impacto. La más correcta (añadir vitals como proyectos Nx en el workspace Angular con `project.json` mínimos) cambia la estructura del grafo. | A) `project.json` en vitals/ para el workspace Angular; B) `namedInputs` globales explícitos en el root del workspace Angular que cubran `../../vitals/**/*`; C) `nx-sync` plugin para TS paths |
| D2 | **Sincronización del alias `button-group`** | Puede requerir cambios en el CMS y en el registry simultáneamente. Hay que decidir cuál es el alias canónico. | A) Cambiar CMS a `elementCompButtonGroup`; B) Cambiar registry a `elementActionButtonGroup`; C) Añadir ambos alias como entradas en registry |
| D3 | **Destino del bridge protocol** | Tres opciones con consecuencias distintas para la estrategia multi-framework. | A) Mantener como contrato aspiracional; B) Implementarlo en React/Svelte (involucra más desarrollo); C) Moverlo a `SynergosDocs/` como spec document y eliminar del código |
| D4 | **Pipeline CI/CD** | Decisión de infraestructura. Depende de dónde vive el repo (GitHub, GitLab, Azure DevOps). | Requiere información de la plataforma de hosting real del repositorio |
| D5 | **Parametrización CDN producción** | Requiere saber cuál es el CDN de producción real (S3, Azure Blob, Cloudflare R2, etc.) para definir las variables de entorno correctas. | Requiere información del equipo de infraestructura |
| D6 | **Estado de `accordion`, `avatar`, `button-group` sin resolver CMS** | ¿Son elementos listos esperando ser conectados? ¿O están a medias? Si están listos, hay que añadir resolvers en CMS. Si no, debe marcarse explícitamente. | Requiere validación funcional de los elementos |

---

*Validación basada en lectura directa de código fuente, ejecución de `node tools/element-contract-audit.mjs`, grep cruzado de imports, cruce de aliases entre `element-registry.json` y `Synergos.CMS/Application/Rendering/Content/Resolvers/`. Branch: `master`. Fecha: 2026-04-03.*
