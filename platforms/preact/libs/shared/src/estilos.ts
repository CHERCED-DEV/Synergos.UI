/**
 * El CSS del design system, inyectado una vez por documento.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ HACE FALTA ESCRIBIRLO, Y EN ANGULAR NO.
 *
 * Angular compila el `styleUrl` de cada componente dentro del bundle y lo
 * inyecta él solo al instanciar, con encapsulación emulada (`_ngcontent-*`).
 * Preact no trae nada de eso: el CSS es un fichero, alguien tiene que meterlo en
 * el documento, y **no hay encapsulación**.
 *
 * Que no la haya es correcto acá y no una carencia: las clases del design system
 * son `syn-*` **globales a propósito** —el CMS emite las mismas clases desde el
 * SSR y G-3 comprueba que todas tengan CSS—, así que encapsularlas rompería el
 * SSR. Lo que Angular hace es añadir un atributo que nadie necesita.
 *
 * `ESTILOS` lo sustituye el build (`tools/build.mjs`) con el SCSS compilado. Un
 * `<style data-synergos-preact>` y una guarda por si dos bundles del runtime
 * cargan a la vez — que es el mismo caso que la doble comprobación de
 * `customElements.get` en el adaptador.
 * ─────────────────────────────────────────────────────────────────────────────
 */

declare const __SYNERGOS_ESTILOS__: string;

const MARCA = 'data-synergos-preact';

export function instalarEstilos(): void {
  if (typeof document === 'undefined') return;
  if (document.querySelector(`style[${MARCA}]`)) return;

  const estilo = document.createElement('style');
  estilo.setAttribute(MARCA, '');
  estilo.textContent = __SYNERGOS_ESTILOS__;
  document.head.appendChild(estilo);
}
