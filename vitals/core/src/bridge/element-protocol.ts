/**
 * Interface that every framework must implement to register a Web Component.
 * Defines the contract between the CMS orchestrator and any UI framework.
 *
 * ⚠ **HOY NO LO IMPLEMENTA NADIE** (hallazgo #67). `grep -rn "ElementProtocol"`
 * sobre `platforms/` y `vitals/`, fuera de este fichero, devuelve cero: Angular
 * registra sus elementos con `createCustomElement` de `@angular/elements`
 * directo. O sea que esto afirma una obligación que la única plataforma viva no
 * cumple — la regla 24 del `CLAUDE.md`, y en la capa agnóstica, que es donde lo
 * va a leer quien escriba la segunda plataforma. La decisión —honrarlo o
 * retirarlo— es de la HU #62, y hasta entonces nadie debería darlo por bueno.
 */
import type { FrameworkKind } from '@synergos/contracts';

export interface ElementProtocol {
  /** The custom element tag name (e.g., 'synergos-hero') */
  readonly tag: string;

  /** Mount the component into the given host element */
  mount(host: HTMLElement, inputs: Record<string, unknown>): void;

  /** Update component inputs */
  update(inputs: Record<string, unknown>): void;

  /** Unmount and clean up the component */
  destroy(): void;
}

/**
 * Registry entry for a framework-specific element implementation.
 */
export interface ElementRegistration {
  tag: string;

  /**
   * El framework sale de `FrameworkKind`, que es un alias de `ElementFramework`
   * — donde `ELEMENT_FRAMEWORKS` declara la lista UNA vez y el tipo se deriva
   * de ella.
   *
   * Acá estaba escrita a mano (`'angular' | 'react' | 'svelte' | 'vanilla'`):
   * la tercera copia, y la que el issue #42 no vio porque buscó en
   * `vitals/contracts/` y ésta vive en `vitals/core/`. El razonamiento de #42
   * vale igual: mientras el valor no viajaba era feo; desde que va del registry
   * al manifiesto y de ahí al segmento de ruta del CDN, es una avería
   * esperando — añadir un framework en una lista y no en la otra compila.
   */
  framework: FrameworkKind;

  factory: () => ElementProtocol;
}
