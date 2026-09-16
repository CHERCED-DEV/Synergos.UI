/**
 * La implementación de Angular de `ElementProtocol` (#62, opción A).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO EXISTE, Y QUÉ ESTABA MAL ANTES.
 *
 * `ElementProtocol` vive en `vitals/core/src/bridge/` y se presenta como *«the
 * interface that every framework must implement to register a Web Component»*.
 * Medido en #62: **no lo importaba nadie**. `grep -rn "ElementProtocol"` sobre
 * `platforms/` y `vitals/`, fuera de su propio fichero, devolvía cero — Angular
 * registraba con `createCustomElement` directo, en 127 `main.ts` idénticos.
 *
 * O sea una interfaz que afirmaba una obligación que la única plataforma viva no
 * cumplía, **en la capa agnóstica, que es donde la va a leer quien escriba la
 * segunda plataforma**. La regla 24: un contrato que no importa nadie no es un
 * contrato, es un comentario con sintaxis.
 *
 * La decisión fue **honrarlo**, y lo que lo hace posible es una medición: los
 * **127 de 127** `main.ts` tienen la MISMA forma —sólo cambian el orden de los
 * imports y el formato—. Un patrón repetido 127 veces sin variación no es un
 * patrón: es una función que nadie extrajo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL REPARTO, PORQUE NO ES OBVIO Y ES LA PARTE DISCUTIBLE.
 *
 * Hay DOS caminos de montaje y los dos hacen falta:
 *
 *   - **Por TAG** (`customElements.define`) — es el de producción. El CMS emite
 *     `<synergos-badge>` en el SSR y el bundle registra el tag; el navegador
 *     hace el resto. Lo sigue haciendo `createCustomElement` de
 *     `@angular/elements`, y **eso no se toca**: resuelve la coerción de
 *     atributos a inputs, que es trabajo real y no es de este contrato.
 *   - **IMPERATIVO** (`mount(host, inputs)`) — es el que `ElementProtocol`
 *     describe: dado un host y unos valores, montá. No hay tag de por medio.
 *
 * `registrarElementoAngular` hace el primero **construyendo el segundo**, así
 * que el adaptador es UN sitio y la interfaz deja de ser decorativa. Lo que NO
 * se hizo, y va dicho en vez de insinuado: **no se reescribió el camino por tag
 * para que pase por `mount`**. Habría que derivar `observedAttributes` de
 * `element-inputs.json` y reimplementar la coerción que `@angular/elements` ya
 * hace bien — cambiar un camino que funciona en 127 elementos por uno propio,
 * para satisfacer una interfaz. El contrato se honra teniéndolo implementado y
 * siendo el único sitio por donde se registra; no exige ser la plomería.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL ORDEN, QUE ES DONDE ESTÁ EL DEFECTO FÁCIL.
 *
 * `mount` devuelve `void` y crear la aplicación de Angular es asíncrono. Un
 * `update` que llegue antes de que el componente exista **no puede perderse en
 * silencio**: sería la misma familia de defectos que este repo persigue —una
 * escritura que no ocurre y nadie lo dice—. Se encadena sobre la promesa del
 * montaje, así que `mount` → `update` → `destroy` se aplican en ese orden
 * aunque se llamen los tres en el mismo tick, y los inputs que llegaron
 * mientras montaba se aplican al terminar.
 */

import {
  ApplicationConfig,
  ApplicationRef,
  ComponentRef,
  Type,
  createComponent,
} from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import type { ElementProtocol } from '@synergos/vitals-core';

/**
 * El adaptador de montaje de Angular.
 *
 * Es lo único de esta plataforma que implementa `ElementProtocol`, y por eso
 * el gate de #62 lo busca acá: un adaptador por plataforma, no uno por
 * elemento.
 */
export class AngularElement<T> implements ElementProtocol {
  readonly tag: string;

  private readonly componente: Type<T>;
  private readonly config: ApplicationConfig;

  /** La cola. Todo lo que hace este adaptador se encadena acá. */
  private pendiente: Promise<void> = Promise.resolve();

  private app: ApplicationRef | null = null;
  private ref: ComponentRef<T> | null = null;

  /**
   * Cuántos hijos tenía el host ANTES de montar.
   *
   * `createComponent` con un `hostElement` que no creó Angular renderiza dentro
   * y **no lo vacía al destruir** — con razón: el host es de quien lo pasó, y
   * borrarlo entero se llevaría por delante lo que el CMS dejó ahí en el SSR.
   * Así que se destruye lo que ESTE adaptador añadió y nada más. Sin esto,
   * `destroy()` dejaba el DOM pintado y decía que había limpiado.
   */
  private hijosAlMontar = 0;

  constructor(tag: string, componente: Type<T>, config: ApplicationConfig) {
    this.tag = tag;
    this.componente = componente;
    this.config = config;
  }

  mount(host: HTMLElement, inputs: Record<string, unknown> = {}): void {
    this.encolar(async () => {
      if (this.ref) return; // montar dos veces es un no-op, no un segundo componente.

      this.hijosAlMontar = host.childNodes.length;
      this.app = await createApplication(this.config);
      this.ref = createComponent(this.componente, {
        environmentInjector: this.app.injector,
        hostElement: host,
      });
      this.aplicar(inputs);
      this.app.attachView(this.ref.hostView);
      await this.estable();
    });
  }

  update(inputs: Record<string, unknown>): void {
    // Sobre la cola: un update antes de que el montaje termine se aplica al
    // terminar, no se pierde. Perderlo dejaría el elemento pintado con los
    // valores de arranque y nada lo diría.
    this.encolar(async () => {
      this.aplicar(inputs);
      await this.estable();
    });
  }

  destroy(): void {
    this.encolar(async () => {
      const host = this.ref?.location.nativeElement as HTMLElement | undefined;

      if (this.ref && this.app) this.app.detachView(this.ref.hostView);
      this.ref?.destroy();
      this.app?.destroy();

      // Lo que añadimos, y sólo eso. Ver `hijosAlMontar`.
      while (host && host.childNodes.length > this.hijosAlMontar) {
        host.removeChild(host.lastChild!);
      }

      this.ref = null;
      this.app = null;
    });
  }

  /** Para quien necesite esperar — los tests, y quien monte y mida. */
  get listo(): Promise<void> {
    return this.pendiente;
  }

  private encolar(paso: () => Promise<void>): void {
    this.pendiente = this.pendiente.then(paso);
  }

  /**
   * Espera a que el DOM refleje lo que se acaba de pedir.
   *
   * Sin esto, `listo` significaba «Angular ya creó el componente» y no «el
   * elemento está pintado»: con detección de cambios sin zonas, el `setInput`
   * marca sucio y el render llega después. Quien monta para medir —o para
   * mirarlo— leía un DOM vacío y no tenía forma de saber que era pronto.
   */
  private async estable(): Promise<void> {
    this.ref?.changeDetectorRef.detectChanges();
    await this.app?.whenStable();
  }

  private aplicar(inputs: Record<string, unknown>): void {
    if (!this.ref) return;
    for (const [nombre, valor] of Object.entries(inputs)) {
      this.ref.setInput(nombre, valor);
    }
  }
}

/**
 * Registra el custom element de un elemento de Angular.
 *
 * Es lo que llaman los 127 `main.ts`, y el único sitio de la plataforma donde
 * se llama a `customElements.define`. Devuelve el adaptador para que quien
 * monte imperativamente —un banco de pruebas, un host sin tag— tenga por dónde.
 *
 * **Registrar dos veces no redefine**: `customElements.define` lanza si el tag
 * ya existe, y el `main.ts` de cada elemento ya lo comprobaba. Ese `if` vivía
 * repetido 127 veces; ahora vive una.
 */
export function registrarElementoAngular<T>(
  tag: string,
  componente: Type<T>,
  config: ApplicationConfig,
): AngularElement<T> {
  const adaptador = new AngularElement(tag, componente, config);

  if (!customElements.get(tag)) {
    createApplication(config).then((appRef) => {
      // Se vuelve a mirar DESPUÉS del await: entre la comprobación de arriba y
      // este punto pudo registrarlo otro bundle que cargó a la vez. Sin esto,
      // `define` lanza y el elemento no monta — con el de arriba solo, la
      // carrera existe porque `createApplication` es asíncrono.
      if (customElements.get(tag)) return;
      customElements.define(tag, createCustomElement(componente, { injector: appRef.injector }));
    });
  }

  return adaptador;
}
