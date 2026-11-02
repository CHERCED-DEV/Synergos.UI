import { ComponentFixture, MUESTRAS_DE_LA_CUENTA, NEGOCIO_DEL_CMS, PRODUCT_A, StorefrontElementComponent, TiendaCuentaComponent, TiendaCuentaPedidoComponent, flushMicrotasks, installMemoryStorage, prepararLaTienda, type ShopProduct } from '../../arnes-de-la-tienda.test';

/**
 * La tienda montada entera, por «Mis compras»: la marca de demo y la tienda que no miente (014-despiece-tienda, T013). Las
 * pruebas son las de la spec única de antes, repartidas por el componente que ejercitan, con el arnés común.
 */
describe('La tienda: «Mis compras»', () => {
  let fixture: ComponentFixture<StorefrontElementComponent>;
  const { tienda, abrirLaCompra, createComponent } = prepararLaTienda((montado) => {
    fixture = montado;
  });

  // ── Account (SH-4): orders inbox + tracking timeline + return ────────────────
  it('con la marca de demo DECLARADA, mis compras y el seguimiento de ejemplo; sin ella no salen (SH-4 case)', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    // Los pedidos de ejemplo sólo los pinta una demo que lo escribe (etapa 3): el camino real ya no los inventa.
    await createComponent(NEGOCIO_DEL_CMS, [{ provide: MUESTRAS_DE_LA_CUENTA, useValue: true }]);

    tienda().navegacion.goToAccount();
    await flushMicrotasks();
    fixture.detectChanges();

    expect(tienda().navegacion.view()).toBe('account');
    expect(tienda().navegacion.accountSection()).toBe('compras');
    expect(tienda().pedidos.orders().length).toBeGreaterThan(0);

    const order = tienda().pedidos.orders()[0];
    abrirLaCompra(order);
    await flushMicrotasks();

    const stages = tienda().pedidos.trackingStages(order.orderNumber);
    expect(stages.length).toBeGreaterThan(0);
    expect(stages.some((stage) => stage.state === 'current' || stage.state === 'done')).toBe(true);

    // Devolución (#32). Este bloque AFIRMABA EL DEFECTO: decía «mock degradado →
    // claim abierto» y comprobaba que un reclamo inventado en el cliente contaba
    // como abierto. Con el servidor caído no hay reclamo, y por tanto tampoco se
    // ofrece el botón — no se sabe si la línea ya tiene uno.
    const linea = order.items[0];
    expect(tienda().devoluciones.returnsUnknown(order)).toBe(true);
    expect(tienda().devoluciones.canReturnLine(order, linea)).toBe(false);

    tienda().vista(TiendaCuentaPedidoComponent).openReturn(order.orderNumber, linea);
    await tienda().devoluciones.submitReturn();
    expect(tienda().devoluciones.claimForLine(order.orderNumber, linea)).toBeNull();
    expect(tienda().devoluciones.returnError()).not.toBe('');

    // Sección mensajes (v1): threads mock cargados al cambiar de sección.
    tienda().navegacion.onAccountSectionChange('mensajes');
    await flushMicrotasks();
    expect(tienda().mensajes.threads().length).toBeGreaterThan(0);
  });

  // ── La tienda que no miente (004-tienda-compra, etapa 3) ──────────────────────
  //
  // Lo que destapó el vivo del 2026-10-22: con la sesión caída «Mis compras» pintaba dos pedidos que la persona no hizo
  // (`ORD-2026-00481`, `ORD-2026-00512`), con el seguimiento caído una línea de tiempo con fechas falsas, «Pedir
  // devolución» no salía nunca porque el seguimiento no pasa de «pagado», y las fechas salían en ISO crudo.
  describe('la tienda que no miente (etapa 3)', () => {
    const json = (body: unknown, status = 200): Response =>
      ({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) }) as Response;

    const pedidoReal = (orderRef: string, orderNumber: string, date = '2026-10-23T02:30:00+00:00') => ({
      orderNumber,
      orderRef,
      date,
      status: 'paid',
      total: 120_000,
      currency: 'COP',
      items: [{ title: 'Cafetera', qty: 1, amount: 120_000, productId: 'SKU-CAF', canReturn: true }],
    });

    /** El seguimiento tal como sale hoy: pagado y nada más, porque nadie avanza el envío. */
    const soloPagado = (orderRef: string) => ({
      orderRef,
      stages: [
        { id: 'paid', label: 'Pago confirmado', state: 'done', date: '2026-10-23T02:30:00Z' },
        { id: 'shipped', label: 'Enviado', state: 'pending' },
        { id: 'delivered', label: 'Entregado', state: 'pending' },
      ],
    });

    async function cuenta(responder: (url: string) => Response, config: object = NEGOCIO_DEL_CMS): Promise<void> {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(responder(String(url)))));
      await createComponent(config);
      tienda().navegacion.goToAccount();
      await flushMicrotasks(20);
      fixture.detectChanges();
    }

    const texto = (): string => (fixture.nativeElement as HTMLElement).textContent ?? '';
    const filas = (): HTMLButtonElement[] =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.syn-account__row'));

    async function abrirPedido(indice: number): Promise<void> {
      filas()[indice].click();
      await flushMicrotasks(20);
      fixture.detectChanges();
    }

    it('sin sesión (el servidor contestó 401) pide entrar, y no pinta ningún pedido de ejemplo', async () => {
      await cuenta((url) => (url.endsWith('/orders') ? json({ error: 'sin sesión' }, 401) : json({}, 404)));

      expect(tienda().pedidos.estadoDeLasCompras()).toBe('sin-sesion');
      expect(tienda().pedidos.orders()).toEqual([]);
      expect(tienda().vista(TiendaCuentaComponent).accountConfig().inboxEmptyTitle).toBe('Inicia sesión para ver tus compras');
      expect(tienda().vista(TiendaCuentaComponent).accountConfig().inboxEmptyActionHref).toContain('/account/login?returnUrl=');
      expect(texto()).toContain('Inicia sesión para ver tus compras');
      expect(texto()).toContain('Iniciar sesión');
      expect(texto()).not.toContain('ORD-2026');
    });

    it('con la lectura caída lo dice y reintenta; nunca los pedidos de ejemplo', async () => {
      let caida = true;
      await cuenta((url) => {
        if (url.endsWith('/orders')) return caida ? json({}, 503) : json({ orders: [pedidoReal('ord_1', 'SYN-1')] });
        if (url.includes('/return')) return json({ returns: [] });
        return json({}, 404);
      });

      expect(tienda().pedidos.estadoDeLasCompras()).toBe('caida');
      expect(tienda().vista(TiendaCuentaComponent).accountConfig().errorMessage).toBe('No pudimos cargar tus compras.');
      expect(texto()).toContain('No pudimos cargar tus compras.');
      expect(texto()).not.toContain('ORD-2026');
      expect(tienda().pedidos.orders()).toEqual([]);

      caida = false;
      tienda().vista(TiendaCuentaComponent).reintentarCompras();
      await flushMicrotasks(20);
      fixture.detectChanges();

      expect(tienda().pedidos.estadoDeLasCompras()).toBe('leidas');
      expect(tienda().vista(TiendaCuentaComponent).accountConfig().errorMessage).toBeUndefined();
      expect(tienda().pedidos.orders().map((o) => o.orderNumber)).toEqual(['SYN-1']);
    });

    it('el seguimiento caído dice «Seguimiento no disponible», sin una línea de tiempo inventada', async () => {
      await cuenta((url) => {
        if (url.endsWith('/orders')) return json({ orders: [pedidoReal('ord_1', 'SYN-1')] });
        if (url.includes('/tracking')) return json({}, 500);
        if (url.includes('/return')) return json({ returns: [] });
        return json({}, 404);
      });

      filas()[0].click();
      fixture.detectChanges();
      expect(texto()).toContain('Consultando el seguimiento…');

      await flushMicrotasks(20);
      fixture.detectChanges();
      const detalle = (fixture.nativeElement as HTMLElement).querySelector('.storefront__order-detail')!;
      expect(detalle.textContent).toContain('Seguimiento no disponible');
      expect(detalle.querySelectorAll('.syn-timeline__date')).toHaveLength(0);
      expect(tienda().pedidos.trackingStages('SYN-1')).toEqual([]);
    });

    it('«Pedir devolución» se ofrece con `canReturn` en los DOS caminos, aunque el seguimiento siga en «pagado»', async () => {
      // La directa: `ord_…` y `SYN-…`. La puerta: la saga y su número de ocho. Devolver sigue siendo del personal.
      await cuenta((url) => {
        if (url.endsWith('/orders')) {
          return json({ orders: [pedidoReal('ord_1', 'SYN-1'), pedidoReal('pta-saga-2', 'ABCD1234')] });
        }
        if (url.includes('/tracking')) return json(soloPagado(url.includes('pta-') ? 'pta-saga-2' : 'ord_1'));
        if (url.includes('/return')) return json({ returns: [] });
        return json({}, 404);
      });

      for (const [indice, numero] of [[0, 'SYN-1'], [1, 'ABCD1234']] as const) {
        await abrirPedido(indice);
        const pedido = tienda().pedidos.orders()[indice];
        expect(pedido.orderNumber).toBe(numero);
        expect(tienda().pedidos.isDelivered(pedido)).toBe(false);
        expect(tienda().devoluciones.canReturnLine(pedido, pedido.items[0])).toBe(true);

        const devolver = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
          '.storefront__order-item button',
        )).find((b) => b.textContent?.trim() === 'Devolver')!;
        devolver.click();
        fixture.detectChanges();
        expect(texto()).toContain('Pedir devolución');
        tienda().devoluciones.closeReturn();
        fixture.detectChanges();
      }
    });

    it('las fechas salen en es-CO y en la hora del SITIO, no en ISO crudo', async () => {
      // 02:30 UTC del 23 son las 04:30 del 23 en Madrid. Un sitio que NO es el huso de esta máquina (Bogotá): si la
      // zona del sitio se perdiera y se leyera la del navegador, saldría el 22 a las 21:30.
      await cuenta(
        (url) => {
          if (url.endsWith('/orders')) return json({ orders: [pedidoReal('ord_1', 'SYN-1')] });
          if (url.includes('/tracking')) return json(soloPagado('ord_1'));
          if (url.includes('/return')) return json({ returns: [] });
          return json({}, 404);
        },
        { ...NEGOCIO_DEL_CMS, zonaHoraria: 'Europe/Madrid' },
      );

      expect(filas()[0].textContent).toContain('23 de octubre de 2026');
      expect(texto()).not.toContain('2026-10-23T');

      await abrirPedido(0);
      const fechas = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.syn-timeline__date')).map((f) =>
        f.textContent?.trim(),
      );
      expect(fechas).toEqual(['23 de octubre de 2026, 04:30']);
    });

    it('la ficha de un producto del CMS, sin variantes, lo agrega TAL CUAL con su cantidad: el botón no es mudo', async () => {
      // El CMS da `variants: []` (medido en vivo: BOLIGRAFO-ALU-001). `selectedVariant` quedaba en `null` y
      // «Agregar al carrito» volvía sin hacer nada ni decir nada.
      const boli: ShopProduct = { ...PRODUCT_A, id: 'BOLI-1', title: 'Bolígrafo de aluminio', amount: 38_000 };
      installMemoryStorage();
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) =>
          String(url).includes('/product/BOLI-1')
            ? Promise.resolve(json({ product: boli, variants: [], reviews: [], questions: [], canReview: false }))
            : Promise.reject(new Error('offline')),
        ),
      );
      await createComponent();
      tienda().navegacion.openProduct(boli);
      await flushMicrotasks();
      fixture.detectChanges();

      expect(tienda().catalogo.detail()?.variants).toEqual([]);
      expect(tienda().catalogo.selectedVariant()).toBeNull();
      expect(tienda().catalogo.pdpInStock()).toBe(true);
      tienda().catalogo.changeQuantity(1);
      fixture.detectChanges();

      const agregar = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button')).find(
        (b) => b.textContent?.trim() === 'Agregar al carrito',
      )!;
      expect(agregar.disabled).toBe(false);
      agregar.click();
      await flushMicrotasks();
      fixture.detectChanges();

      expect(tienda().carrito.cartLineCount()).toBe(1);
      expect(tienda().carrito.cartCount()).toBe(2);
      expect(tienda().carrito.cartTotalMinor()).toBe(38_000 * 2 * 100);
      expect(tienda().carrito.addFailedId()).toBeNull();
    });
  });
});
