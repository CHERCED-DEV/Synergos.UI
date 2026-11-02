import { ComponentFixture, PRODUCT_A, PRODUCT_B, ShopFulfillmentStrategy, StorefrontElementComponent, TiendaCarritoComponent, flushMicrotasks, installMemoryStorage, prepararLaTienda } from '../../arnes-de-la-tienda.test';

/**
 * La tienda montada entera, por el carrito: el cupón, agregar (se oye y se ve) y sus líneas (014-despiece-tienda, T013). Las
 * pruebas son las de la spec única de antes, repartidas por el componente que ejercitan, con el arnés común.
 */
describe('La tienda: el carrito', () => {
  let fixture: ComponentFixture<StorefrontElementComponent>;
  const { tienda, createComponent, agregarAlCarrito, respuestaPromo } = prepararLaTienda((montado) => {
    fixture = montado;
  });

  it('un cupón aceptado entra como línea NEGATIVA y baja el total', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    await agregarAlCarrito();

    const antes = tienda().carrito.cartTotalMinor();
    expect(antes).toBeGreaterThan(0);

    respuestaPromo({ code: 'BIENVENIDA10', amountMinor: 500_000, label: 'Cupón BIENVENIDA10' });
    await tienda().carrito.applyPromo('BIENVENIDA10');

    expect(tienda().carrito.promo()?.code).toBe('BIENVENIDA10');
    // El backend mandó el descuento en POSITIVO; se fuerza el signo, porque
    // sumarlo se vería como un cargo sorpresa.
    expect(tienda().carrito.promo()?.amountMinor).toBe(-500_000);
    expect(tienda().carrito.cartTotalMinor()).toBe(antes - 500_000);

    // Y se VE: un total más bajo sin la línea que lo explica se lee como un error
    // de precio.
    const filas = tienda().vista(TiendaCarritoComponent).cartSummaryRows().map((f) => f.id);
    expect(filas).toEqual(['subtotal', 'promo', 'total']);
  });

  it('quitar el cupón devuelve el total anterior', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    await agregarAlCarrito();
    const antes = tienda().carrito.cartTotalMinor();

    respuestaPromo({ code: 'X', amountMinor: 100_000, label: 'Cupón X' });
    await tienda().carrito.applyPromo('X');
    expect(tienda().carrito.cartTotalMinor()).toBe(antes - 100_000);

    tienda().carrito.removePromo();
    expect(tienda().carrito.promo()).toBeNull();
    expect(tienda().carrito.cartTotalMinor()).toBe(antes);
    expect(tienda().vista(TiendaCarritoComponent).cartSummaryRows()).toEqual([]);
  });

  it('un descuento mayor que el carrito NO deja el total bajo cero', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    await agregarAlCarrito();

    respuestaPromo({ code: 'TODO', amountMinor: 999_999_999, label: 'Cupón TODO' });
    await tienda().carrito.applyPromo('TODO');

    // Un carrito que se debe a sí mismo no es un carrito, y el checkout lo
    // cobraría como un importe negativo.
    expect(tienda().carrito.cartTotalMinor()).toBe(0);
  });

  it('EL caso: un 200 sin descuento utilizable NO es un cupón aplicado', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    await agregarAlCarrito();
    const antes = tienda().carrito.cartTotalMinor();

    // El servidor contesta OK y no manda importe.
    respuestaPromo({ code: 'VACIO' });
    await tienda().carrito.applyPromo('VACIO');

    // Decir que sí dejaría el total igual y al comprador creyendo que ahorró.
    expect(tienda().carrito.promo()).toBeNull();
    expect(tienda().carrito.promoRejection()).toBe('unknown');
    expect(tienda().carrito.cartTotalMinor()).toBe(antes);
  });

  it('el mínimo no alcanzado dice CUÁNTO falta', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    await agregarAlCarrito();

    respuestaPromo({ reason: 'minimum-not-met', shortfallMinor: 1_200_000 }, 422);
    await tienda().carrito.applyPromo('GRANDE');

    expect(tienda().carrito.promoRejection()).toBe('minimum-not-met');
    // Es lo único accionable de ese rechazo.
    expect(tienda().carrito.promoDetail()).toContain('12.000');
  });

  it('cada estado del servidor tiene su motivo', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    await agregarAlCarrito();

    const casos: Array<[number, unknown, string]> = [
      [404, null, 'unknown'],
      [410, null, 'expired'],
      [409, null, 'already-used'],
      [422, { reason: 'not-applicable' }, 'not-applicable'],
      [500, null, 'failed'],
    ];
    for (const [status, body, esperado] of casos) {
      respuestaPromo(body, status);
      await tienda().carrito.applyPromo('X');
      expect(tienda().carrito.promoRejection()).toBe(esperado);
    }
  });

  it('con el endpoint caído NO se aplica nada', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    await agregarAlCarrito();
    const antes = tienda().carrito.cartTotalMinor();

    await tienda().carrito.applyPromo('LOQUESEA');

    // Un descuento fingido acá es una promesa de plata que el checkout rompe.
    expect(tienda().carrito.promo()).toBeNull();
    expect(tienda().carrito.promoRejection()).toBe('failed');
    expect(tienda().carrito.cartTotalMinor()).toBe(antes);
  });

  // ── #82: agregar al carrito SE OYE ─────────────────────────────────────────────
  // Abrir el cajón se veía y no se oía. Y el `.then` no tenía `catch`: un fallo del motor era un
  // rechazo sin manejar, mudo para todos.
  it('agregar al carrito se anuncia por la región del documento', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    tienda().carrito.quickAdd(PRODUCT_A);
    await vi.waitFor(
      () =>
        expect(document.querySelector('[data-syn-live-announcer]')?.textContent).toBe(
          'Audífonos Pro agregado al carrito.',
        ),
      { timeout: 2000, interval: 20 },
    );
    expect(tienda().navegacion.cartOpen()).toBe(true);
  });

  it('si el motor no puede agregar, no abre el cajón y lo dice asertivo', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    vi.spyOn(ShopFulfillmentStrategy.prototype, 'select').mockRejectedValue(new Error('sin cupo'));

    tienda().carrito.quickAdd(PRODUCT_A);
    await vi.waitFor(
      () =>
        expect(document.querySelector('[data-syn-live-announcer]')?.textContent).toBe(
          'No se pudo agregar Audífonos Pro al carrito.',
        ),
      { timeout: 2000, interval: 20 },
    );
    expect(tienda().navegacion.cartOpen()).toBe(false);
    expect(document.querySelector('[data-syn-live-announcer]')?.getAttribute('aria-live')).toBe('assertive');
  });

  // ── #87: el fallo de agregar también se VE, junto al botón que se pulsó ──────────
  // Desde el #82 se oía y no se veía nada: quien mira pulsaba, el cajón no se abría y no
  // había ningún porqué. Se pulsa el BOTÓN de la tarjeta (regla 5), no se llama al método.
  it('si el motor no puede agregar, la tarjeta lo dice al lado del botón, y reintentar lo limpia', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    // El «Agregar» rápido vive en las tarjetas del PLP, no en las de la portada.
    tienda().navegacion.navigate('plp');

    const botonDe = (tarjeta: Element) =>
      tarjeta.querySelector('.storefront__card-actions .storefront__card-add button') as HTMLButtonElement;
    const tarjetaConAgregar = (): Element | undefined =>
      Array.from(fixture.nativeElement.querySelectorAll('.storefront__card') as NodeListOf<Element>).find((t) => botonDe(t));
    await vi.waitFor(
      () => {
        fixture.detectChanges();
        expect(tarjetaConAgregar(), 'no hay ninguna tarjeta con «Agregar» en el PLP').toBeTruthy();
      },
      { timeout: 2000, interval: 20 },
    );
    const tarjeta = tarjetaConAgregar();
    expect(tarjeta!.querySelector('.storefront__add-error')).toBeNull();

    const select = vi.spyOn(ShopFulfillmentStrategy.prototype, 'select').mockRejectedValueOnce(new Error('sin cupo'));
    botonDe(tarjeta!).click();
    await vi.waitFor(
      () => {
        fixture.detectChanges();
        expect(tarjeta!.querySelector('.storefront__add-error')?.textContent).toContain('No se pudo agregar');
      },
      { timeout: 2000, interval: 20 },
    );
    expect(botonDe(tarjeta!).textContent?.trim()).toBe('Reintentar');
    // No es una región viva: el anuncio ya lo hizo el anunciador; una segunda lo diría dos veces.
    const aviso = tarjeta!.querySelector('.storefront__add-error')!;
    expect(aviso.getAttribute('role')).toBeNull();
    expect(aviso.getAttribute('aria-live')).toBeNull();

    select.mockRestore();
    botonDe(tarjeta!).click();
    await vi.waitFor(
      () => {
        fixture.detectChanges();
        expect(tarjeta!.querySelector('.storefront__add-error')).toBeNull();
      },
      { timeout: 2000, interval: 20 },
    );
    expect(botonDe(tarjeta!).textContent?.trim()).toBe('Agregar');
  });

  // ── filter: removing one line keeps the rest ─────────────────────────────────
  it('removes a single line from the cart without touching the rest (filter case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    tienda().carrito.quickAdd(PRODUCT_A);
    tienda().carrito.quickAdd(PRODUCT_B);
    await flushMicrotasks();
    expect(tienda().carrito.cartLineCount()).toBe(2);

    const lineB = tienda().carrito.cartItems().find((item) => item.productRef === 'P-B')?.id ?? '';
    tienda().carrito.removeFromCart(lineB);
    await flushMicrotasks();

    const refs = tienda().carrito.cartItems().map((item) => item.productRef);
    expect(refs).toEqual(['P-A']);
    expect(tienda().carrito.cartTotalMinor()).toBe(500_000 * 100);
    expect(tienda().vista(TiendaCarritoComponent).cartGroups()).toHaveLength(1);
  });

  // ── idempotent: re-adding the same product+variant accumulates qty, one line ──
  it('re-adding the same product+variant keeps one line and accumulates qty (idempotent case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    tienda().carrito.quickAdd(PRODUCT_A);
    tienda().carrito.quickAdd(PRODUCT_A);
    tienda().carrito.quickAdd(PRODUCT_A);
    await flushMicrotasks();

    // One line (deterministic id), qty accumulated to 3.
    expect(tienda().carrito.cartLineCount()).toBe(1);
    expect(tienda().carrito.cartCount()).toBe(3);
    expect(tienda().carrito.cartTotalMinor()).toBe(500_000 * 3 * 100);
  });
});
