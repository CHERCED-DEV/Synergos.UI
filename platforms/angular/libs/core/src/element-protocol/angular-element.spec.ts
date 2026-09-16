import { Component, input } from '@angular/core';
import { provideZonelessChangeDetection } from '@angular/core';
import { AngularElement } from './angular-element';

/**
 * El adaptador de montaje de Angular (#62).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **Lo que se prueba acá es el ORDEN, no que Angular monte.** Que
 * `createComponent` funcione es de Angular; lo que este adaptador añade —y lo
 * único que puede romper en silencio— es que `mount` devuelve `void` mientras
 * crear la aplicación es asíncrono. Un `update` que llegue antes de que el
 * componente exista tiene dos finales posibles y sólo uno es aceptable: se
 * aplica al terminar, o **se pierde sin que nada lo diga**, que es la familia de
 * defectos que este repo persigue desde la regla 4.
 *
 * Por eso el fixture llama a los tres en el MISMO tick. Con `await` entre medias
 * el orden se cumple solo y el test pasa en verde con la cola quitada.
 * ─────────────────────────────────────────────────────────────────────────────
 */

@Component({
  selector: 'syn-prueba-adaptador',
  standalone: true,
  template: `<span class="v">{{ etiqueta() }}</span>`,
})
class PruebaComponent {
  readonly etiqueta = input('sin valor');
}

const config = { providers: [provideZonelessChangeDetection()] };

describe('AngularElement — el adaptador que implementa ElementProtocol', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => host.remove());

  it('monta con los inputs de arranque', async () => {
    const el = new AngularElement('synergos-prueba', PruebaComponent, config);
    el.mount(host, { etiqueta: 'hola' });
    await el.listo;

    expect(host.querySelector('.v')?.textContent).toBe('hola');
  });

  it('EL CASO: un update en el MISMO tick que el mount no se pierde', async () => {
    // Sin la cola, `update` corre cuando `this.ref` todavía es null, sale por el
    // guard y el elemento se queda pintado con el valor de arranque — sin error
    // y sin log. El fixture NO pone `await` entre los dos a propósito: con él,
    // el orden se cumple solo y la cola se podría quitar sin que nada fallara.
    const el = new AngularElement('synergos-prueba', PruebaComponent, config);
    el.mount(host, { etiqueta: 'de arranque' });
    el.update({ etiqueta: 'el bueno' });
    await el.listo;

    expect(host.querySelector('.v')?.textContent).toBe('el bueno');
  });

  it('y un destroy en el mismo tick deja el host limpio, no a medias', async () => {
    const el = new AngularElement('synergos-prueba', PruebaComponent, config);
    el.mount(host, { etiqueta: 'efímero' });
    el.destroy();
    await el.listo;

    expect(host.querySelector('.v')).toBeNull();
  });

  it('montar dos veces es un no-op, no un segundo componente', async () => {
    // El `main.ts` de cada elemento ya comprobaba esto antes de registrar, 127
    // veces. Acá vive una.
    const el = new AngularElement('synergos-prueba', PruebaComponent, config);
    el.mount(host, { etiqueta: 'uno' });
    el.mount(host, { etiqueta: 'dos' });
    await el.listo;

    expect(host.querySelectorAll('.v').length).toBe(1);
    expect(host.querySelector('.v')?.textContent).toBe('uno');
  });

  it('el tag es parte del contrato y se conserva', () => {
    // `ElementProtocol.tag` es de sólo lectura y es lo que liga el adaptador con
    // lo que el CMS emite en el SSR.
    expect(new AngularElement('synergos-badge', PruebaComponent, config).tag)
      .toBe('synergos-badge');
  });
});
