/**
 * La interfaz que toda plataforma implementa para montar un Web Component.
 * Es el contrato entre el orquestador del CMS y cualquier framework de UI.
 *
 * **Angular la implementa desde #62** (`AngularElement`, en
 * `platforms/angular/libs/core/src/element-protocol/`), y es la **octava
 * obligación del contrato de plataforma**: existe un adaptador que la
 * implementa, y es el ÚNICO que llama a `customElements.define`. Hay gate
 * (`platform-contract`), con los dos dientes — porque el primero solo deja que
 * el adaptador exista y no mande, que es como un contrato honrado vuelve a ser
 * decorativo sin que nada falle.
 *
 * Esta cabecera decía **«HOY NO LO IMPLEMENTA NADIE»** (hallazgo #67), y era
 * cierto: `grep -rn "ElementProtocol"` fuera de este fichero devolvía cero. Se
 * decidió **honrarlo** en vez de retirarlo, y lo que lo hizo barato fue medir:
 * los **127 de 127** `main.ts` tenían la misma forma, así que no había un
 * patrón que respetar sino una función que nadie había extraído.
 *
 * **Lo que el contrato NO exige, dicho para que nadie lo suponga:** que el
 * camino de producción pase por `mount()`. El CMS emite `<synergos-badge>` en
 * el SSR y el navegador monta por TAG; el adaptador registra ese tag y expone
 * además el montaje imperativo, que es lo que esta interfaz describe. Reescribir
 * el camino por tag para que pase por aquí obligaría a reimplementar la coerción
 * de atributos que `@angular/elements` ya hace bien.
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
