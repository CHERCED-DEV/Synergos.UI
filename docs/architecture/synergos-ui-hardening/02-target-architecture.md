# 02 - Target Architecture

## 1) Principios de diseño

- Contratos explícitos y tipados para resolución runtime.
- Errores de dominio estructurados (no solo strings en logs).
- Compatibilidad incremental: mantener APIs existentes y añadir APIs ricas en paralelo.
- Separación clara entre:
  - contrato de integración (`vitals/contracts`),
  - transformación CMS data -> inputs (`vitals/core/mappers`),
  - ejecución runtime Angular (`platforms/angular/libs/rendering`).

## 2) Capas propuestas

### Capa A - Contratos de dominio (agnóstica)

- Archivo nuevo: `vitals/contracts/src/component-resolution.contract.ts`.
- Modelos clave:
  - `FrameworkKind`
  - `RegistrySource`
  - `ComponentRegistryEntry`
  - `RuntimeComponentDefinition`
  - `ArtifactDescriptor`
  - `ManifestDescriptor`
  - `VersionedComponentContract`
  - `ComponentResolutionResult`
  - `ResolutionError`

### Capa B - Registry/Resolver runtime (Angular)

- `ElementRegistry` con validación de selector/tag y metadata (`framework`, `source`).
- `ComponentResolver` con resultado explícito:
  - `resolveDefinition(...) -> ComponentResolutionResult`
  - `resolve(...) -> string | null` mantenido por compatibilidad.

### Capa C - Pipeline de montaje

- `ElementMounter` con API explícita:
  - `mountWithResult(...) -> ElementMountResult`
  - `mountBlockWithResult(...) -> ElementMountResult`
- Métodos legacy (`mount`, `mountBlock`) se mantienen devolviendo `HTMLElement | null`.

### Capa D - Mapping selector/block -> componente

- `block.mapper.ts` con resultado estructurado:
  - `mapBlockToElementResult(...) -> BlockMappingResult`
  - `mapBlockToElement(...) -> MappedBlock | null` como wrapper compatible.

### Capa E - Contratos JSON y validación tooling

- `tools/lib/synergos-config.mjs` valida estructura de `element-registry.json` y `element-inputs.json` en carga.
- `tools/validate-cms-contracts.mjs` soporta múltiples rutas de `uSync` y modo degradado controlado si no hay snapshot disponible.

## 3) Flujo objetivo de resolución

1. Entrada: `contentTypeAlias` (selector CMS).
2. Normalización/validación del selector.
3. Lookup tipado en `ElementRegistry`.
4. Resultado explícito:
   - éxito: `RuntimeComponentDefinition`
   - fallo: `ResolutionError` con `code` + `message`.
5. Montaje del custom element y aplicación de inputs.
6. Para bloques: mapeo tipado con `BlockMappingResult` antes del mount.

## 4) Estrategia multi-framework limpia

- Registry admite metadata de framework/source sin meter condicionales ad-hoc en cada consumidor.
- Contrato de resolución se mantiene agnóstico y reusable para adapters futuros (React/Svelte/Vanilla si se requiere runtime equivalente).
- Se evita sobreingeniería: no se introdujeron nuevos contenedores o librerías externas.

## 5) Prioridad Angular resuelta

- Angular queda como referencia de ejecución con:
  - contrato runtime explícito,
  - trazabilidad de errores,
  - validación de registro,
  - compatibilidad con APIs actuales.

## 6) Modelo de dominio final (nombres adoptados)

- `FrameworkKind`
- `ComponentSelector`
- `ComponentRegistryEntry`
- `ArtifactDescriptor`
- `ManifestDescriptor`
- `ComponentInputContract`
- `ComponentResolutionResult`
- `ResolutionError`
- `RegistrySource`
- `RuntimeComponentDefinition`
- `VersionedComponentContract`

Estos modelos quedaron implementados en `component-resolution.contract.ts` y usados por la capa de rendering Angular.
