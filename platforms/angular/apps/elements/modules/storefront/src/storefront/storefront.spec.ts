import { ComponentFixture, StorefrontElementComponent, flushMicrotasks, installMemoryStorage, prepararLaTienda } from './arnes-de-la-tienda.test';

/**
 * La tienda montada entera, por el elemento: sin la base de la API, el scope de las rutas y el enlace profundo (014-despiece-tienda, T013). Las
 * pruebas son las de la spec única de antes, repartidas por el componente que ejercitan, con el arnés común.
 */
describe('La tienda: el elemento', () => {
  let fixture: ComponentFixture<StorefrontElementComponent>;
  let component: StorefrontElementComponent;
  const { tienda, createComponent } = prepararLaTienda((montado, instancia) => {
    fixture = montado;
    component = instancia;
  });

  // ── UI#91: el scope con espacio, tilde y «:» no rompe los enlaces profundos ──
  //
  // El router armaba la base con el scope CRUDO y la comparaba con `location.hash`, que
  // el navegador devuelve codificado: con `Mi sitio: ñ` no casaba nunca y recargar,
  // volver atrás o entrar por enlace dejaba la vista donde estaba. Hoy lee y escribe con
  // `segmentosDeRuta`/`baseDeRuta` de `@synergos/vitals-core`, la misma pieza en las ocho.
  it('sin la base de la API no llama a nada y degrada, visible (ADR 0137, CMS#196)', async () => {
    const red = vi.fn(() => Promise.reject(new Error('no debería llamarse')));
    vi.stubGlobal('fetch', red);
    await createComponent({});

    expect(red).not.toHaveBeenCalled();
    expect(tienda().catalogo.products().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
  });

  it('un scope con espacio, tilde y «:» sigue reconociendo sus rutas (UI#91)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    fixture.componentRef.setInput('scope', 'Mi sitio: ñ');
    fixture.detectChanges();

    // El enlace que alguien pega o teclea: el navegador lo guarda CODIFICADO.
    window.location.hash = '#/Mi sitio: ñ/plp';
    expect(window.location.hash).toBe('#/Mi%20sitio:%20%C3%B1/plp');
    await flushMicrotasks();
    fixture.detectChanges();
    expect(tienda().navegacion.view()).toBe('plp');

    // Y lo que la vertical escribe al navegar es suyo: codificado y reconocible.
    tienda().navegacion.navigate('cart');
    await flushMicrotasks();
    expect(window.location.hash).toBe('#/Mi%20sitio%3A%20%C3%B1/carrito');
  });

  // ── Hash router: deep-link a una vista ────────────────────────────────────────
  it('deep-links views through the hash router', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    tienda().navegacion.goToPlp();
    expect(window.location.hash).toBe('#/storefront/plp');

    tienda().navegacion.goToAccount('favoritos');
    expect(window.location.hash).toBe('#/storefront/cuenta/favoritos');
    expect(tienda().navegacion.accountSection()).toBe('favoritos');

    // checkout sin carrito redirige a carrito.
    tienda().navegacion.navigate('checkout');
    expect(tienda().navegacion.view()).toBe('cart');
  });
});
