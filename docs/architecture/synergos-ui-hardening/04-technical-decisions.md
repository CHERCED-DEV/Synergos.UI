# 04 - Technical Decisions

## Decisión 1 - Introducir contrato de resolución runtime explícito

- Decisión: crear `vitals/contracts/src/component-resolution.contract.ts` con modelos de dominio y errores tipados.
- Justificación: la resolución selector -> tag no puede depender de `string | null` en plataforma enterprise.
- Alternativa descartada: mantener solo logs y `null` checking.
- Riesgo asumido: nueva superficie de tipos que debe mantenerse alineada con runtime.
- Compatibilidad: se mantuvieron métodos legacy (`resolve`, `mount`, `mountBlock`).

## Decisión 2 - Endurecer `ElementRegistry` en Angular

- Decisión: validar selector/tag, registrar metadata (`framework`, `source`) y detectar colisiones de selector.
- Justificación: evita corrupción silenciosa del registry y mejora trazabilidad operacional.
- Alternativa descartada: registry simple sin validación para minimizar código.
- Riesgo asumido: warnings adicionales en runtime al detectar colisiones.
- Compatibilidad: firma principal `register(type, { tag })` sigue funcionando.

## Decisión 3 - Resultado explícito para `ComponentResolver` y `ElementMounter`

- Decisión: añadir `resolveDefinition`, `mountWithResult`, `mountBlockWithResult`.
- Justificación: soporta manejo robusto de errores y observabilidad sin romper API existente.
- Alternativa descartada: reemplazo directo de métodos legacy (breaking change).
- Riesgo asumido: coexistencia temporal de APIs vieja/nueva.

## Decisión 4 - Tipar resultado de `block.mapper`

- Decisión: crear `BlockMappingResult` + `BlockMappingError`.
- Justificación: elimina fallos implícitos por `null` sin contexto.
- Alternativa descartada: continuar con `MappedBlock | null` sin semántica de error.
- Riesgo asumido: necesidad de adoptar gradual en consumidores.

## Decisión 5 - Cerrar deuda contractual de componentes shop

- Decisión: agregar mappers, modelos y entries faltantes de `element-inputs.json` para los 8 aliases `shop`.
- Justificación: era el bloqueo principal de `element:audit` y `manifest:validate`.
- Alternativa descartada: excluir temporalmente `shop` de validadores.
- Riesgo asumido: contratos iniciales de shop pueden requerir ajuste fino al madurar integraciones CMS.
- Compatibilidad: sin romper aliases/tags existentes en registry.

## Decisión 6 - Validar JSON contractual al cargar scripts

- Decisión: ampliar `tools/lib/synergos-config.mjs` con validación estructural (alias/tag/tier/input descriptors).
- Justificación: fallar temprano y con mensajes claros en herramientas de publicación/generación.
- Alternativa descartada: validación tardía en cada script consumidor.
- Riesgo asumido: mayor strictness puede exponer inconsistencias latentes (deseable).

## Decisión 7 - Hacer `cms:validate` robusto a layout CMS y snapshot ausente

- Decisión: soportar múltiples rutas candidatas para `uSync` y modo skip con warning si no existe snapshot.
- Justificación: separar validación de UI de disponibilidad momentánea del export CMS.
- Alternativa descartada: mantener fallo duro por ruta única.
- Riesgo asumido: falso sentido de seguridad si se usa skip sin pipeline CMS complementario.
- Mitigación: conservar `--strict` para forzar fallo cuando se requiera.

## Deuda técnica dejada intencionalmente

- Warnings legacy en `element:audit` (aliases no registrados, wrappers legacy) no se eliminaron para evitar romper contratos activos.
- `block.mapper.ts` mantiene castings legacy en secciones no críticas de esta iteración.
- Build completo Angular (`core:build`) presenta fallo estructural de `rootDir`/imports externos preexistente, fuera del scope seguro de este hardening incremental.

- contrato tipado público ampliado para reflejar la API real ya aceptada por múltiples componentes Angular
- se promovieron al contrato varios campos que antes vivían solo como compatibilidad local en componentes, incluyendo bloques de:
  - `banner`
  - `banner-slider`
  - `feature-grid`
  - `tab-group`
  - `data-table`
  - `section`
  - `gallery-item`
  - `button-container`
  - `column`
  - `container-block`
  - `divider`
  - `grid`
  - `icon-block`
  - `image-block`
  - `link-block`
  - `spacer`
  - `stack`
  - `text-block`
  - `video-block`
- el objetivo no fue abrir contratos arbitrariamente, sino reducir la divergencia entre:
  - `element-inputs.json`
  - `element-config.contract.ts`
  - inputs/compat fields realmente soportados por Angular
- `tools/element-contract-audit.mjs` ahora distingue compatibilidad legacy conocida de deuda real:
  - aliases históricos en `block.mapper.ts` ya no ensucian el reporte si son compatibilidad deliberada
  - `angular-host`, `mf-host`, `macro-host` se tratan como nombres de transición documentados, no como falsas orfandades del registry

## Decision 8 - Reduce Local RuntimeConfig to Justified Exceptions

- Decision: remove redundant local RuntimeConfig types in pps/elements whenever the public contract already models those fields.
- Justification: reduces duplication between component code, element-inputs.json, and element-config.contract.ts, and makes the stable contract explicit.
- Alternative discarded: keep local aliases even when they add no distinct runtime shape.
- Risk assumed: simplifying local types can expose real contract drift that was previously hidden.
- Compatibility: no input breaking changes; this only consolidates typing.

- Result of this decision:
  - anner-slider and logo-cloud no longer use local RuntimeConfig types.
  - data-table remains as the only intentional exception because it normalizes matrix and record rows into a different runtime shape.
  - columns was added to LogoCloudElementConfig to close an actual drift already published in element-inputs.json.

- follow-up validation decision: keep data-table as the only local runtime-config exception, and back compound normalizers with module-level tests instead of re-expanding local contract types

- follow-up composition decision: preserve runtime legacy aliases only at the sanitization boundary (config.buttons in utton-group) instead of widening public contracts unnecessarily
