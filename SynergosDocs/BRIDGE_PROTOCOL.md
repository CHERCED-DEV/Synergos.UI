# Synergos Bridge Protocol

> Estado actual: **interfaces sin implementaciones activas**.
> Fecha de re-evaluación: **2027-04** (12 meses desde la auditoría de 2026-04).

---

## Qué es

`vitals/core/src/bridge/` define las interfaces de interoperabilidad cross-framework para el ecosistema Synergos. Es el contrato aspiracional que permitiría, en teoría, que cualquier framework produzca o consuma Custom Elements de forma estandarizada con un ciclo de vida unificado.

Está compuesto por tres archivos:

### `element-protocol.ts`

```ts
interface ElementProtocol {
  readonly tag: string;
  connectedCallback?(): void;
  disconnectedCallback?(): void;
  attributeChangedCallback?(name: string, old: string | null, next: string | null): void;
}

interface ElementRegistration {
  tag: string;
  framework: 'angular' | 'react' | 'svelte' | 'vanilla';
  version: string;
}
```

Define el contrato mínimo que un Custom Element debe implementar para ser registrable en un registry dinámico cross-framework.

### `lifecycle-hooks.ts`

```ts
interface LifecycleHooks {
  onMount?(): void;
  onInputChange?(changes: Record<string, { previous: unknown; current: unknown }>): void;
  onDestroy?(): void;
}
```

Abstracción de ciclo de vida agnóstica. Cada framework mapearía estos hooks a sus equivalentes nativos:
- Angular: `ngOnInit` / `ngOnChanges` / `ngOnDestroy`
- React: `useEffect` / `useEffect([deps])` / cleanup de useEffect
- Svelte: `onMount` / reactive declarations / `onDestroy`

### `input-serializer.ts`

Tres funciones puras de serialización:

```ts
serializeInput(value: unknown): string
deserializeInput(raw: string): unknown
inputsToAttributes(inputs: Record<string, unknown>): Record<string, string>
```

Utilidades para convertir valores JS a atributos HTML y viceversa. Cubren los casos: string, number, boolean, array (JSON), object (JSON), null.

---

## Estado actual (confirmado por análisis de código, 2026-04-03)

**Zero consumidores en la codebase.**

```bash
# Resultado de grep en todo el workspace:
grep -r "from '@synergos/core'" --include="*.ts" | grep -i "bridge\|ElementProtocol\|LifecycleHooks\|serializeInput"
# → 0 resultados en código fuente de producción
```

- Los POCs de React (`pricing-card`, `stat`) implementan su wrapper Custom Element directamente sin `ElementProtocol`.
- Los POCs de Svelte (`accordion`, `avatar`) usan el ciclo de vida nativo de Svelte 5 sin `LifecycleHooks`.
- Angular no usa `bridge/` para nada — el ciclo de vida lo gestiona `@angular/elements` directamente.
- La única mención del bridge en el codebase es un string hardcodeado en datos seed de `insight-explorer` (`"bridge-protocol"` como parte de un ejemplo de contenido, no como importación real).

Las interfaces están exportadas en la public API de `@synergos/core` (raíz y `vitals/core/src/index.ts`) pero esto no incrementa el bundle ya que son pure TypeScript interfaces — zero runtime.

---

## Por qué existe

El bridge fue diseñado para el caso de uso de **registry dinámico cross-framework**: un sistema donde el CMS podría solicitar un elemento por `tag` y el runtime resolvería dinámicamente qué framework/versión sirve ese tag, con interoperabilidad de ciclo de vida garantizada por contrato.

Este caso de uso **no está activo actualmente**. El routing de elementos hoy lo hace `macro-host` + `ComponentResolver` usando solo el tag y el registry estático.

---

## Opciones para la re-evaluación de 2027-04

### Opción A — Mantener como spec (recomendado si los POCs siguen siendo POCs)

No tocar el código. Documentar explícitamente que es un contrato sin implementaciones. El costo de mantenerlo es prácticamente cero: son interfaces sin runtime, no añaden peso al bundle.

### Opción B — Implementar en React y Svelte (si los POCs van a crecer)

Los elementos React/Svelte implementarían `ElementProtocol` en lugar de tener cada uno su lifecycle propio. Esto estandarizaría el wrapper pattern y facilitaría añadir nuevos elementos en POC frameworks.

**Candidatos de implementación:**
- `platforms/react/apps/elements/compositions/pricing-card/src/main.tsx`
- `platforms/react/apps/elements/compositions/stat-counter/src/main.tsx`
- `platforms/svelte/apps/elements/compositions/accordion/src/Accordion.svelte`
- `platforms/svelte/apps/elements/primitives/avatar/src/Avatar.svelte`

**Esfuerzo estimado:** 2-3 días. Bajo riesgo funcional, alto valor de estandarización si hay más frameworks en el futuro.

### Opción C — Eliminar del código y convertir en spec document

Eliminar `vitals/core/src/bridge/` y remover los re-exports de `vitals/core/src/index.ts`. Mover el contenido como diseño de interfaz a este documento.

**Pre-condición:** Confirmar que cero proyectos lo importan (confirmado al 2026-04-03). Si en la re-evaluación de 2027-04 sigue con cero consumidores, esta opción es la más limpia.

---

## Regla de governance hasta la re-evaluación

- No implementar nuevos elementos sobre el bridge sin decidir primero la estrategia (Opción A/B/C).
- No eliminar el bridge sin confirmar nuevamente que no hay consumidores.
- Los POCs pueden seguir usando su lifecycle propio — no es un bug, es una decisión pendiente.
- Si se añade un quinto framework, implementar el bridge en ese framework es la decisión por defecto (Opción B extendida).
