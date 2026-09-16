/**
 * La implementación de Preact de `ElementProtocol` (#64).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ES EL GEMELO DEL DE ANGULAR, Y LA COMPARACIÓN ES EL PUNTO.
 *
 * `AngularElement` necesita `createApplication` —asíncrono—, un `ApplicationRef`,
 * `attachView`/`detachView` y una cola de promesas para que un `update` en el
 * mismo tick que el `mount` no se pierda. Acá `render(vnode, host)` es síncrono
 * y el propio Preact lleva la reconciliación, así que la cola sobra: `mount`,
 * `update` y `destroy` terminan antes de devolver.
 *
 * **Eso no lo hace mejor: lo hace DISTINTO, y es exactamente lo que la épica #37
 * quería medir.** El contrato `ElementProtocol` aguanta los dos, y aguanta uno
 * asíncrono y uno síncrono sin cambiar de forma — que era la pregunta.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `listo` EXISTE AUNQUE ACÁ SEA TRIVIAL, Y NO ES SIMETRÍA GRATUITA.
 *
 * Quien consume el adaptador no sabe de qué plataforma es —ése es el sentido de
 * que la interfaz viva en `vitals`—, así que un `await adaptador.listo` tiene que
 * compilar y hacer lo correcto en las dos. Devolver una promesa ya resuelta es la
 * verdad acá: cuando `mount` vuelve, el DOM ya está pintado.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DESTROY DEVUELVE EL HOST COMO LO ENCONTRÓ, IGUAL QUE EN ANGULAR.
 *
 * `render(null, host)` desmonta el árbol de Preact pero **no toca** los nodos que
 * ya estaban dentro del host antes de montar —el SSR del CMS los pone ahí—. Se
 * cuentan al montar y se recorta a esa marca, que es el mismo corte que
 * `hijosAlMontar` hace del lado de Angular. Sin eso, `destroy()` afirma que
 * limpió mientras deja nodos pintados.
 */

import { render } from 'preact';
import type { ComponentType, VNode } from 'preact';
import type { ElementProtocol } from '@synergos/core';

export class PreactElement<P extends Record<string, unknown>> implements ElementProtocol {
  readonly tag: string;

  private readonly componente: ComponentType<P>;
  private host: HTMLElement | null = null;
  private props: Partial<P> = {};
  private hijosAlMontar = 0;

  constructor(tag: string, componente: ComponentType<P>) {
    this.tag = tag;
    this.componente = componente;
  }

  mount(host: HTMLElement, inputs: Record<string, unknown> = {}): void {
    if (this.host) return;
    this.host = host;
    this.hijosAlMontar = host.childNodes.length;
    this.props = inputs as Partial<P>;
    this.pintar();
  }

  update(inputs: Record<string, unknown>): void {
    // Se FUSIONA, no se reemplaza: `update({ tone })` no puede borrar el `text`
    // que vino en `mount`. Es la misma semántica que `setInput` de Angular, que
    // es lo que hace que el mismo llamador sirva para las dos.
    this.props = { ...this.props, ...(inputs as Partial<P>) };
    this.pintar();
  }

  destroy(): void {
    const host = this.host;
    if (!host) return;
    render(null, host);
    while (host.childNodes.length > this.hijosAlMontar) {
      host.removeChild(host.lastChild as ChildNode);
    }
    this.host = null;
    this.props = {};
  }

  /** Resuelta siempre: `render` de Preact es síncrono. Ver la cabecera. */
  get listo(): Promise<void> {
    return Promise.resolve();
  }

  private pintar(): void {
    if (!this.host) return;
    const Componente = this.componente;
    render(<Componente {...(this.props as P)} /> as VNode, this.host);
  }
}

/**
 * Registra el custom element y devuelve su adaptador — el gemelo de
 * `registrarElementoAngular`.
 *
 * ⚠ **ES EL ÚNICO SITIO DE ESTA PLATAFORMA QUE LLAMA A `customElements.define`**,
 * y la obligación 8 del contrato lo comprueba recorriendo `apps/`: un elemento
 * que registre por su cuenta rompe el build. Sin eso el adaptador existe y no
 * manda, que es cómo un contrato se queda de adorno sin que nada falle (#62).
 *
 * El camino por TAG y el IMPERATIVO son dos, y los dos hacen falta: el CMS emite
 * `<synergos-badge>` en el SSR y el navegador instancia por tag; `mount(host,
 * inputs)` es el que describe `ElementProtocol`. Acá el primero se construye CON
 * el segundo —la clase del custom element delega en un `PreactElement`— así que
 * hay un solo sitio donde se monta y la interfaz no es decorativa.
 *
 * La coerción de atributo→prop es de esta plataforma y no del contrato: Preact no
 * trae un `@angular/elements`, así que se hace acá y en un solo sitio. Un
 * atributo HTML siempre llega como cadena; quien sabe qué es cada clave es el
 * normalizador de `vitals/core/src/inputs/`, que el elemento ya usa — por eso
 * esto pasa la cadena tal cual y no adivina tipos.
 */
export function registrarElementoPreact<P extends Record<string, unknown>>(
  tag: string,
  componente: ComponentType<P>,
  atributos: readonly string[] = [],
): PreactElement<P> {
  const adaptador = new PreactElement<P>(tag, componente);

  if (!customElements.get(tag)) {
    customElements.define(
      tag,
      class extends HTMLElement {
        static readonly observedAttributes = atributos;

        private readonly propio = new PreactElement<P>(tag, componente);

        connectedCallback(): void {
          this.propio.mount(this, leerAtributos(this, atributos));
        }

        disconnectedCallback(): void {
          this.propio.destroy();
        }

        attributeChangedCallback(nombre: string, _viejo: string | null, nuevo: string | null): void {
          this.propio.update({ [nombre]: nuevo ?? undefined });
        }
      },
    );
  }

  return adaptador;
}

/** Los atributos presentes, como cadenas. Los ausentes NO se emiten. */
function leerAtributos(el: HTMLElement, atributos: readonly string[]): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const nombre of atributos) {
    // Un atributo AUSENTE no es lo mismo que uno vacío, y la diferencia la
    // resuelve el normalizador con `undefined`. Emitir `null` haría que
    // `resolveConfigValue` lo tomara por un valor dado y pisara el del `config`.
    if (el.hasAttribute(nombre)) salida[nombre] = el.getAttribute(nombre);
  }
  return salida;
}
