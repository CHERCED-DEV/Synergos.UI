# 03 - Refactor Plan

## 1) Backlog por fases

### Fase 0 - Baseline y diagnóstico (completada)

- Inspección de arquitectura, contratos y runtime.
- Ejecución de validadores de contrato para establecer baseline.
- Identificación de deuda crítica en `shop` + resolver/mounter.

### Fase 1 - Hardening contractual (completada)

- Introducir contratos de resolución runtime tipados (`component-resolution.contract.ts`).
- Endurecer tipado en `elements.contract.ts` para alias/tag/tier del registry.
- Mantener compatibilidad de API pública existente.

### Fase 2 - Estabilización de runtime Angular (completada)

- Refactor de `ElementRegistry` (validación, metadata, warnings de colisión).
- Refactor de `ComponentResolver` con `ComponentResolutionResult`.
- Refactor de `ElementMounter` con resultados explícitos y wrapper legacy.

### Fase 3 - Registry/mapper/model hardening (completada para deuda crítica)

- Añadir `BlockMappingResult` y error de dominio en `block.mapper.ts`.
- Incorporar aliases `shop` faltantes en mapper.
- Añadir modelos de inputs `shop` faltantes y exportarlos.
- Añadir mappers `shop` tipados y reutilizables.
- Completar `element-inputs.json` para elementos `shop`.

### Fase 4 - Tooling y validación de JSON (completada)

- Validación estructural de registry/inputs al cargar en scripts.
- Validador CMS tolerante a estructura multi-path y snapshot ausente.

### Fase 5 - Validación y documentación (completada)

- Re-ejecutar `contracts:validate` y compilación de `rendering`.
- Documentar estado actual, arquitectura objetivo, decisiones y checklist.

## 2) Priorización

### Alta

- Resolver fallos de `element:audit`/`manifest:validate` por deuda de `shop`.
- Eliminar resolución implícita en runtime Angular.
- Estandarizar error handling de resolución/mount.

### Media

- Validación robusta de JSON contractual en tooling.
- Robustez en `cms:validate` cuando no hay snapshot `uSync`.

### Baja (deuda residual intencional)

- Convergencia de aliases legacy/no-registry actualmente advertidos (19 warnings).
- Reducción progresiva de castings `as unknown as ...` en mapper legacy masivo.
- Resolución de problema estructural de build `core` Angular por `rootDir`/imports externos (preexistente al hardening aplicado).

## 3) Quick wins aplicados

- Pipeline contractual `shop` quedó consistente (registry + mapper + model + inputs + manifests).
- Resolver/mounter Angular ahora tiene contratos explícitos de éxito/error.
- `contracts:validate` ahora es ejecutable en este workspace aunque CMS no tenga snapshot `uSync` exportado.

## 4) Cambios de bajo riesgo

- Nuevos métodos explícitos manteniendo wrappers legacy (`resolve`, `mount`, `mountBlock`).
- Nuevos contratos/archivos sin eliminar APIs existentes.
- Ampliación de scripts de validación sin dependencias nuevas.

## 5) Cambios de alto impacto

- Estandarización del resultado de resolución y mapeo en runtime.
- Cierre de brecha contractual de 8 elementos `shop` que bloqueaban validaciones.

## 6) Migraciones sugeridas

1. Migrar consumidores internos para usar `resolveDefinition` y `mountWithResult` en vez de `null` checking.
2. Crear catálogo explícito para aliases legacy/no-registry y decidir su estrategia (promover a registry o retirar).
3. Plan de eliminación de castings en `block.mapper.ts` por dominios (primitives/compositions/modules/shop/experiences).
4. Alinear `core` Angular build con imports de contratos externos (`vitals/contracts`) para cerrar fallo estructural de `nx run-many build`.

- contract consolidation wave:
  - promote runtime compat fields from local component-only types into `vitals/contracts/src/element-config.contract.ts` where they already behave as public inputs
  - keep only truly transitional local compat types after public contract catches up
- tooling cleanup wave:
  - keep `element:audit` strict on real drift, but suppress legacy compatibility aliases that are intentionally mapper-only or deprecated wrapper names
