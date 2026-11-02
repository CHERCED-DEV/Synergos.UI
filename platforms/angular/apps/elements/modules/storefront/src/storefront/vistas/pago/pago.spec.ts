import { By, CheckoutWizardComponent, ComponentFixture, PRODUCT_A, PRODUCT_B, StorefrontElementComponent, TiendaCarritoComponent, bordeDeLaTienda, flushMicrotasks, installMemoryStorage, prepararLaTienda } from '../../arnes-de-la-tienda.test';

/**
 * La tienda montada entera, por el pago: la compra por el asistente, con el borde que se cae a la mitad (014-despiece-tienda, T013). Las
 * pruebas son las de la spec única de antes, repartidas por el componente que ejercitan, con el arnés común.
 */
describe('La tienda: el pago', () => {
  let fixture: ComponentFixture<StorefrontElementComponent>;
  let component: StorefrontElementComponent;
  const { tienda, createComponent, alertas, asistente, comprarAyB, motivosDe } = prepararLaTienda((montado, instancia) => {
    fixture = montado;
    component = instancia;
  });

  // ── happy: add → cart agrupado → SH-3 wizard → pay → confirm ─────────────────
  //
  // Corría con la red caída y lo que probaba era la orden `MOCK-<ts>` (UI#92, regla 16).
  // Contra la forma de verdad destapó además que la estrategia sólo aceptaba `confirmed`
  // y el borde contesta `Paid`: un pedido colocado salía como «no pudimos confirmarlo».
  it('runs the full lifecycle through the SH-3 wizard to a confirmation (happy case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', bordeDeLaTienda().fetchDoble);
    await createComponent();

    tienda().carrito.quickAdd(PRODUCT_A);
    tienda().carrito.quickAdd(PRODUCT_B);
    await flushMicrotasks();

    expect(tienda().carrito.cartCount()).toBe(2);
    expect(tienda().carrito.cartTotalMinor()).toBe((500_000 + 200_000) * 100);
    // Carrito agrupado por vendedor (multi-seller marketplace).
    expect(tienda().vista(TiendaCarritoComponent).cartGroups().map((group) => group.seller).sort()).toEqual([
      'PeriferiCO',
      'TecnoHub',
    ]);

    tienda().compra.customerName.set('Ada Lovelace');
    tienda().compra.customerEmail.set('ada@example.com');
    tienda().compra.customerAddress.set('Calle 1 #2-3');
    tienda().compra.customerCity.set('Bogotá');
    expect(tienda().compra.shippingValid()).toBe(true);

    tienda().navegacion.goToCheckout();
    fixture.detectChanges();
    expect(tienda().navegacion.view()).toBe('checkout');

    const wizard = fixture.debugElement.query(By.directive(CheckoutWizardComponent))
      .componentInstance as CheckoutWizardComponent;
    expect(wizard.currentStep()?.id).toBe('datos');

    wizard.next();
    fixture.detectChanges();
    expect(wizard.currentStep()?.id).toBe('pago');
    wizard.next();
    fixture.detectChanges();
    expect(wizard.currentStep()?.id).toBe('revisar');

    wizard.next(); // submit → pay (POST /checkout) → confirm (POST /confirm)
    await flushMicrotasks(30);
    fixture.detectChanges();

    expect(tienda().navegacion.view()).toBe('confirmation');
    expect(tienda().compra.orderRef()).toBe('ord_77');
    expect(tienda().compra.orderNumber()).toBe('SYN-77');
    expect(tienda().compra.confirmedItems().map((item) => item.title)).toEqual([
      'Audífonos Pro (servidor)',
      'Mouse Pro (servidor)',
    ]);
    expect(window.location.hash).toContain('/confirmacion');
    // Lo comprado ya no está por comprar (etapa 3): antes seguía en el carrito hasta «Seguir comprando».
    expect(tienda().carrito.cartCount()).toBe(0);
  });

  // ── UI#92: sin orden abierta no hay pedido, ni cobro, ni anuncio ──────────────
  it('con el POST /checkout caído no hay pedido: lo dice una vez, sin cobro ni anuncio', async () => {
    installMemoryStorage();
    const borde = bordeDeLaTienda({ caidas: ['POST /checkout'] });
    vi.stubGlobal('fetch', borde.fetchDoble);
    await createComponent();
    const pedidos: unknown[] = [];
    component.orderconfirmed.subscribe((payload) => pedidos.push(payload));
    const fallos = motivosDe();

    await comprarAyB(fallos.escuchar);

    // La estrategia CONTESTA que no abrió la orden; no revienta.
    expect(fallos.motivos).toEqual(['checkout-not-opened']);

    expect(tienda().navegacion.view()).toBe('checkout');
    expect(tienda().compra.orderNumber()).toBe('');
    expect(pedidos).toEqual([]);
    expect(borde.llamadas('POST /confirm')).toBe(0);
    // El carrito sigue ahí: nada se compró.
    expect(tienda().carrito.cartCount()).toBe(2);
    expect(alertas()).toEqual([asistente().config().payFailedMessage]);
  });

  // ── UI#92: la orden quedó y el pedido no — reintentar NO vuelve a cobrar ──────
  it('con el POST /confirm caído nombra la orden que quedó; reintentar confirma la MISMA', async () => {
    installMemoryStorage();
    const borde = bordeDeLaTienda({ caidas: ['POST /confirm'] });
    vi.stubGlobal('fetch', borde.fetchDoble);
    await createComponent();
    const fallos = motivosDe();

    await comprarAyB(fallos.escuchar);

    expect(fallos.motivos).toEqual(['order-not-placed']);
    expect(tienda().navegacion.view()).toBe('checkout');
    expect(tienda().compra.orderNumber()).toBe('');
    expect(alertas()).toEqual([asistente().config().confirmFailedMessage.replaceAll('{referencia}', 'ord_77')]);

    borde.encender('POST /confirm');
    asistente().next();
    await flushMicrotasks(30);
    fixture.detectChanges();

    expect(tienda().navegacion.view()).toBe('confirmation');
    expect(tienda().compra.orderNumber()).toBe('SYN-77');
    expect(borde.llamadas('POST /checkout')).toBe(1);
    expect(borde.llamadas('POST /confirm')).toBe(2);
  });
});
