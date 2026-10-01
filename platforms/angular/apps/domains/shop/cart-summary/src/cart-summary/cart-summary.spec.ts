import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { cartStore } from '@synergos/shop';
import { CartSummaryComponent } from './cart-summary';

/**
 * El cajón del carrito (#87).
 *
 * El ticket decía «abre un `aria-modal` sin mover el foco adentro». Re-medido en el banco,
 * la premisa era peor: **el cajón no llegaba a abrirse**. El componente reflejaba su estado
 * en el atributo `open`, que es a la vez su input observado; `@angular/elements` leía de
 * vuelta el `""` recién escrito, el input lo cerraba, el reflejo lo quitaba… y Angular
 * cortaba con NG0103. Ningún spec lo veía porque no había ninguno — y uno con `TestBed` no
 * lo vería tampoco: sin custom element no hay `attributeChangedCallback` que cierre el lazo.
 * Por eso el último bloque lo monta como custom element de verdad.
 */

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('CartSummaryComponent — el foco del cajón', () => {
  let fixture: ComponentFixture<CartSummaryComponent>;
  let opener: HTMLButtonElement;

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const aside = (): HTMLElement => host().querySelector('aside.cart-drawer') as HTMLElement;
  const cerrar = (): HTMLButtonElement => host().querySelector('.cart-drawer__close button') as HTMLButtonElement;
  const asentar = async (): Promise<void> => {
    await fixture.whenStable();
    await esperar(0);
    await fixture.whenStable();
  };

  beforeEach(async () => {
    cartStore.closeDrawer();
    await TestBed.configureTestingModule({
      imports: [CartSummaryComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(CartSummaryComponent);
    document.body.appendChild(host());
    fixture.autoDetectChanges();
    await asentar();

    opener = document.createElement('button');
    opener.textContent = 'Agregar';
    document.body.appendChild(opener);
    opener.focus();
  });

  afterEach(() => {
    cartStore.closeDrawer();
    opener.remove();
    host().remove();
  });

  it('cerrado, el cajón es inert: sus controles no están en el orden de tabulación', async () => {
    expect(aside().getAttribute('aria-hidden')).toBe('true');
    expect(aside().hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(opener);
  });

  it('al abrirse, el foco ENTRA — al botón de cerrar', async () => {
    cartStore.openDrawer();
    await asentar();

    expect(aside().getAttribute('aria-hidden')).toBe('false');
    expect(aside().hasAttribute('inert')).toBe(false);
    expect(cerrar()).toBeTruthy();
    expect(document.activeElement).toBe(cerrar());
  });

  it('al cerrarse, el foco VUELVE a quien lo abrió', async () => {
    cartStore.openDrawer();
    await asentar();
    expect(document.activeElement).toBe(cerrar());

    cerrar().click();
    await asentar();

    expect(aside().getAttribute('aria-hidden')).toBe('true');
    expect(document.activeElement).toBe(opener);
  });

  it('con Escape también vuelve', async () => {
    cartStore.openDrawer();
    await asentar();

    aside().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await asentar();

    expect(cartStore.open()).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('con el cajón abierto, Tab no sale: del último vuelve al primero y Shift+Tab al revés', async () => {
    cartStore.openDrawer();
    await asentar();

    const enfocables = Array.from(
      aside().querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled])'),
    );
    expect(enfocables.length).toBeGreaterThanOrEqual(1);
    const primero = enfocables[0];
    const ultimo = enfocables[enfocables.length - 1];

    ultimo.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    ultimo.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(primero);

    const atras = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    primero.dispatchEvent(atras);
    expect(atras.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(ultimo);
  });

  it('el atributo `open` es una orden con forma de booleano HTML: presente abre, "false" cierra', async () => {
    fixture.componentRef.setInput('open', '');
    await asentar();
    expect(cartStore.open()).toBe(true);

    fixture.componentRef.setInput('open', 'false');
    await asentar();
    expect(cartStore.open()).toBe(false);
  });
});

describe('CartSummaryComponent como custom element — el lazo del reflejo', () => {
  // Montado como lo monta un navegador: con `attributeChangedCallback`. Es lo único que cierra
  // el lazo entre el reflejo del estado y el input observado.
  let el: HTMLElement;
  const tag = `q2-cart-summary-${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(async () => {
    // Como `registrarElementoAngular`: una aplicación propia, fuera de TestBed — que se
    // desmonta entre tests y se llevaría el inyector del elemento.
    const app = await createApplication({ providers: [provideZonelessChangeDetection()] });
    customElements.define(tag, createCustomElement(CartSummaryComponent, { injector: app.injector }));
  });

  beforeEach(async () => {
    cartStore.closeDrawer();
    el = document.createElement(tag);
    document.body.appendChild(el);
    await esperar(20);
  });

  afterEach(() => {
    cartStore.closeDrawer();
    el.remove();
  });

  it('el carrito lo abre y se QUEDA abierto — sin el reflejo en `open` peleando con el input', async () => {
    const errores: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errores.push(args);
    try {
      cartStore.openDrawer();
      await esperar(50);
    } finally {
      console.error = original;
    }

    const panel = el.querySelector('aside.cart-drawer') as HTMLElement;
    expect(panel.getAttribute('aria-hidden')).toBe('false');
    expect(el.hasAttribute('data-open')).toBe(true);
    expect(el.hasAttribute('open')).toBe(false);
    expect(errores.map(String).join('\n')).not.toMatch(/NG0103/);
  });

  it('y `open=""` en el HTML lo abre: la forma de un booleano de HTML', async () => {
    el.setAttribute('open', '');
    await esperar(50);
    expect((el.querySelector('aside.cart-drawer') as HTMLElement).getAttribute('aria-hidden')).toBe('false');
  });
});
