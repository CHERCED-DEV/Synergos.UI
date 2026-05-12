# 01 - Current State Assessment

## 1) Alcance inspeccionado

- Workspace principal: `Synergos.UI` (Nx multi-framework, contratos, tooling, build y runtime).
- Referencia solo lectura: `Synergos.CMS` y `_archive/fails/Synergos.CMS.epicfail2` para contrastar la integración CMS -> CDN -> custom elements.
- Ejes auditados: arquitectura, contratos, registry, mappers, Angular rendering, manifests, validaciones, build pipeline.

## 2) Mapa técnico actual

- Monorepo multi-framework con núcleo agnóstico en `vitals/*` y ejecución framework-specific en `platforms/*`.
- `vitals/contracts` centraliza contratos TS + `element-registry.json` + `element-inputs.json`.
- `vitals/core` concentra mappers CMS block data -> inputs/`config` para custom elements.
- Angular (`platforms/angular`) actúa como implementación principal para elementos/módulos.
- Pipeline contractual existente:
  - `element:audit` (registry <-> mapper <-> model <-> inputs)
  - `manifest:validate`
  - `cms:validate`

## 3) Problemas detectados (estado previo al hardening)

### 3.1 Contrato y modelización

- Resolución selector -> componente en Angular devolvía `string | null` sin resultado tipado explícito ni error estructurado.
- Registro Angular (`ElementRegistry`) minimalista: sin validación de selector/tag, sin diagnóstico de colisiones, sin metadata de source/framework.
- `elements.contract.ts` tenía aliases/tags como `string` genérico (bajo poder semántico para contratos críticos).

### 3.2 Registry / mapper / manifests

- `vitals/core/src/mappers/block.mapper.ts` concentraba la mayor fragilidad:
  - tabla extensa de alias/tag/mapping con gran dependencia en strings;
  - nulos silenciosos cuando no existe mapper.
- `shop` estaba registrado en `element-registry.json` pero incompleto en pipeline de contratos:
  - faltaban aliases en mapper;
  - faltaban modelos de inputs;
  - faltaban claves en `element-inputs.json`.
- Esto rompía validadores contractuales (`element:audit`, `manifest:validate`).

### 3.3 Observabilidad y errores

- Fallos de resolución/mapeo se reportaban principalmente con warnings de texto plano, sin código de error de dominio reutilizable.
- Sin resultado tipado end-to-end para `mount` y `mountBlock`.

### 3.4 Tooling

- `tools/lib/synergos-config.mjs` cargaba JSON sin validación estructural robusta (riesgo de fallos tardíos y mensajes ambiguos).
- `tools/validate-cms-contracts.mjs` asumía una única ruta de `uSync`; si no existía, fallaba duro aunque el snapshot CMS no estuviera exportado.

## 4) Riesgos y deuda técnica relevante

- Riesgo alto en la frontera CMS -> UI por strings de alias/tag dispersos y errores implícitos.
- Riesgo de regresión al crecer multi-framework sin contrato de resolución estándar.
- Deuda heredada visible en warnings persistentes de `element:audit`:
  - aliases legacy/no-registry presentes en mapper (intencionales pero no formalizados en catálogo);
  - entradas legacy (`angular-host`, `mf-host`, `macro-host`) no convergidas.

## 5) Hardcodes y puntos frágiles identificados

- Hardcodes de alias/tag en mapper (pieza crítica de integración).
- Fallos por ausencia de mapper resueltos por `null` sin error de dominio.
- Ruta CMS hardcodeada para `uSync` en validador (`cms:validate`) sin fallback.

## 6) `any`, castings inseguros y tipado débil

- No se detectó foco en `any` como principal problema; el problema dominante fue tipado insuficiente en resultados de resolución y contrato runtime.
- Existían múltiples castings `as unknown as ...` en mapper legacy (riesgo de seguridad de tipos, no abordable completamente en una sola iteración sin migración mayor).

## 7) Observaciones Angular (implementación de referencia)

- Angular components de shop exponen API pública clara con `input()` y `config` (base buena).
- El motor de rendering Angular (`registry/resolver/mounter`) necesitaba hardening para operar como capa de plataforma enterprise (errores explícitos, trazabilidad, metadata de registro).

## 8) Hallazgos de integración CMS ? UI

Pipeline objetivo validado conceptualmente:

`macro selector / block.type -> mapper/registry -> tag + inputs/config -> custom element`

Gap principal previo: faltaba modelización explícita del resultado de resolución y de los errores en el pipeline runtime.

## 9) Quick wins identificados y aplicados

- Cierre de deuda contractual de `shop` (mapper/model/inputs).
- Resultado tipado para resolver/mount/block-mapping.
- Validación estructural de JSON de contratos en tooling.
- `cms:validate` robusto ante múltiples layouts de repositorio CMS y snapshots sin `uSync`.
