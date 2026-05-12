# 05 - Validation Checklist

## 1) Contracts / Registry / Manifests

- [x] `npm run element:audit`
  - Resultado: **PASS** (sin errores).
  - Warnings residuales: **none** after compat/deprecated alias classification.
- [x] `npm run manifest:validate`
  - Resultado: **PASS**.
  - Manifests generados: 276.
- [x] `npm run contracts:validate`
  - Resultado: **PASS**.
  - Nota: `cms:validate` entra en modo `skip` controlado cuando no hay `uSync` exportado.

## 2) Typing / Build parcial

- [x] `npx tsc -p platforms/angular/libs/rendering/tsconfig.lib.json --noEmit`
  - Resultado: **PASS**.
- [ ] `npm run --prefix platforms/angular build`
  - Resultado: **FAIL (preexistente en core build)**.
  - Falla en `core:build:production` por `TS6059` (`rootDir` vs imports externos `vitals/contracts`).
  - Estado: fuera del alcance seguro de esta iteración, requiere ajuste estructural de build Angular package boundaries.

## 3) CMS contract validation

- [x] `npm run cms:validate`
  - Resultado: **PASS con warning de skip**.
  - Motivo: no se detectó `uSync/ContentTypes` en snapshot actual de `Synergos.CMS`.
  - Se probaron rutas candidatas:
    - `Synergos.CMS/uSync/v9/ContentTypes`
    - `Synergos.CMS/uSync/ContentTypes`
    - `Synergos.CMS/Synergos.CMS.Web/uSync/v9/ContentTypes`
    - `Synergos.CMS/Synergos.CMS.Web/uSync/ContentTypes`
    - `Synergos.CMS/Synergos.CMS.Web/App_Data/uSync/v9/ContentTypes`
    - `Synergos.CMS/Synergos.CMS.Web/App_Data/uSync/ContentTypes`

## 4) Checklist funcional del hardening

- [x] Resolución selector -> componente con resultado explícito de éxito/error.
- [x] Registro runtime Angular con validaciones mínimas de selector/tag.
- [x] Montaje (`mount`/`mountBlock`) con API explícita y wrapper compatible.
- [x] Pipeline `shop` completo en mapper/model/inputs.
- [x] Validación estructural de JSON de contratos en tooling.
- [x] Documentación técnica de estado actual, arquitectura objetivo, plan y decisiones.

## 5) Riesgos residuales abiertos

- [ ] Reducir aliases legacy fuera de registry como deuda de compatibilidad, aunque ya no ensucian `element:audit`.
- [ ] Migrar progresivamente castings legacy en `block.mapper.ts`.
- [ ] Resolver fallo estructural `core:build` en Angular package boundary.
- [ ] Re-ejecutar `cms:validate` contra snapshot real `uSync` cuando esté disponible.

- `element:audit` now passes cleanly without warning noise from known compat/deprecated aliases
- verify promoted contract fields stay aligned with `element-inputs.json` for:
  - banner / section / feature-grid / tab-group / data-table
  - gallery-item / button-container / column / container-block / divider / grid
  - icon-block / image-block / link-block / spacer / stack / text-block / video-block

- pps/elements now keeps a single justified local RuntimeConfig (data-table) after removing redundant duplicates
- logo-cloud.columns was added to the TS contract to match the already published input catalog

- targeted module tests now cover compound sanitizer behavior for data-table, anner-slider, logo-cloud, 	ab-group, and eature-grid
- legacy config.items compatibility was preserved in anner-slider while keeping slides as the public contract

- composition-level compound config tests now cover social-share, utton-group, and 
ewsletter-form
- legacy config.buttons compatibility is preserved in utton-group while items remains the canonical contract
- 
ewsletter-form now normalizes HTTP method casing before runtime submission logic
