import { ComponentFixture, StorefrontElementComponent, TestBed, TiendaCuentaPedidoComponent, flushMicrotasks, installMemoryStorage, prepararLaTienda, type ShopOrder } from '../../../arnes-de-la-tienda.test';

/**
 * La tienda montada entera, por el pedido: las devoluciones y cuándo se puede devolver (014-despiece-tienda, T013). Las
 * pruebas son las de la spec única de antes, repartidas por el componente que ejercitan, con el arnés común.
 */
describe('La tienda: el pedido', () => {
  let fixture: ComponentFixture<StorefrontElementComponent>;
  const { tienda, abrirLaCompra, createComponent } = prepararLaTienda((montado) => {
    fixture = montado;
  });

  // ── devoluciones y consola de vendedor (#32) ─────────────────────────────────
  describe('devoluciones', () => {
    /** Deja la cuenta abierta con pedidos y un servidor que contesta lo que se le diga. */
    /** El pedido de los reclamos de abajo, como lo da el servidor: pagado y con su permiso de devolver. */
    const PEDIDO_DEL_SERVIDOR = {
      orderNumber: 'ORD-2026-00481',
      orderRef: 'ORD-2026-00481',
      date: '2026-09-10T15:00:00+00:00',
      status: 'paid',
      total: 1_499_000,
      currency: 'COP',
      items: [{ title: 'Audífonos Sony WH-1000XM5', qty: 1, amount: 1_499_000, productId: 'SONY-XM5', canReturn: true }],
    };

    async function abrirCuenta(responder: (url: string) => Response): Promise<void> {
      installMemoryStorage();
      // Los pedidos los sirve el servidor: antes salían de los de ejemplo, que el camino real ya no pinta (etapa 3).
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) =>
          Promise.resolve(String(url).endsWith('/orders') ? json({ orders: [PEDIDO_DEL_SERVIDOR] }) : responder(String(url))),
        ),
      );
      await createComponent();
      tienda().navegacion.goToAccount();
      await flushMicrotasks(20);
      fixture.detectChanges();
    }

    const json = (body: unknown, status = 200): Response =>
      ({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) }) as Response;

    const RECLAMO = {
      claimId: 'rma_x1',
      orderRef: 'ORD-2026-00481',
      lineRef: 'SONY-XM5',
      productName: 'Audífonos Sony WH-1000XM5',
      quantity: 1,
      refundAmountFormatted: '$1.499.000',
      reason: 'damaged',
      status: 'abierto',
      requestedAt: '2026-09-12',
      updatedAt: '2026-09-12',
    };

    it('EL caso: el reclamo SOBREVIVE a recargar, y no se ofrece abrir otro', async () => {
      // El servidor ya tiene un reclamo abierto sobre la línea. Antes esto no se
      // leía nunca, así que al recargar el botón volvía y se abría un SEGUNDO.
      await abrirCuenta((url) =>
        url.includes('/return') ? json({ returns: [RECLAMO] }) : json({}, 500),
      );

      const order = tienda().pedidos.orders().find((o) => o.orderNumber === 'ORD-2026-00481')!;
      const linea = order.items[0];

      expect(tienda().devoluciones.returnsUnknown(order)).toBe(false);
      expect(tienda().devoluciones.claimForLine(order.orderNumber, linea)?.claimId).toBe('rma_x1');
      expect(tienda().devoluciones.canReturnLine(order, linea)).toBe(false);
    });

    it('EL caso: si NO se pudo leer, tampoco se ofrece — no se sabe si ya hay uno', async () => {
      await abrirCuenta(() => json({}, 500));

      const order = tienda().pedidos.orders().find((o) => o.status === 'paid')!;
      expect(tienda().devoluciones.returnsUnknown(order)).toBe(true);
      expect(tienda().devoluciones.canReturnLine(order, order.items[0])).toBe(false);
    });

    it('EL caso: un POST fallido NO da el reclamo por abierto', async () => {
      await abrirCuenta((url) =>
        url.includes('/return') ? json({ returns: [] }) : json({}, 500),
      );

      const order = tienda().pedidos.orders().find((o) => o.status === 'paid')!;
      const linea = order.items[0];
      // Con la lectura en verde y sin reclamos, el botón SÍ se ofrece.
      expect(tienda().devoluciones.canReturnLine(order, linea)).toBe(true);
      // Devolver se pide desde la compra ABIERTA, como en la cuenta: es su detalle el que lo ofrece.
      abrirLaCompra(order);
      await flushMicrotasks();

      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            json({ error: 'Solo se puede devolver sobre una orden pagada.' }, 400),
          ),
        ),
      );
      tienda().vista(TiendaCuentaPedidoComponent).openReturn(order.orderNumber, linea);
      await tienda().devoluciones.submitReturn();

      // Ni reclamo inventado ni pantalla que diga que se abrió.
      expect(tienda().devoluciones.claimForLine(order.orderNumber, linea)).toBeNull();
      // Y se enseña lo que dijo el servidor, no un genérico: lo escribió quien sabe.
      expect(tienda().devoluciones.returnError()).toContain('orden pagada');
      expect(tienda().devoluciones.canReturnLine(order, linea)).toBe(true);
    });

    it('manda lineId y el motivo ELEGIDO, no un literal fijo', async () => {
      await abrirCuenta((url) =>
        url.includes('/return') ? json({ returns: [] }) : json({}, 500),
      );
      const order = tienda().pedidos.orders().find((o) => o.status === 'paid')!;
      const linea = order.items[0];
      // Devolver se pide desde la compra ABIERTA, como en la cuenta: es su detalle el que lo ofrece.
      abrirLaCompra(order);
      await flushMicrotasks();

      const cuerpos: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn((_url: string, init: RequestInit) => {
          cuerpos.push(String(init?.body ?? ''));
          return Promise.resolve(json(RECLAMO));
        }),
      );

      tienda().vista(TiendaCuentaPedidoComponent).openReturn(order.orderNumber, linea);
      tienda().devoluciones.setReturnReason('not-as-described');
      await tienda().devoluciones.submitReturn();

      const enviado = JSON.parse(cuerpos[0]) as { lineId: string; reason: string };
      // Sin `lineId` el borde contesta 400 — y contestaba 400 SIEMPRE, porque
      // este cuerpo no lo llevaba.
      expect(enviado.lineId).toBe('SONY-XM5');
      expect(enviado.reason).toBe('not-as-described');
      expect(tienda().devoluciones.claimForLine(order.orderNumber, linea)?.claimId).toBe('rma_x1');
    });
  });

  // ── el gate disjunto (#33) ───────────────────────────────────────────────────
  //
  // El botón era INALCANZABLE contra el backend real: pedía `delivered|shipped` y
  // el enum del CMS sólo tiene `Pending | Paid | Cancelled`. Lo único que lo hacía
  // aparecer eran los pedidos de ejemplo, que traían esos estados cableados.
  describe('cuándo se puede devolver', () => {
    async function conPedidos(responder: (url: string) => Response): Promise<void> {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(responder(String(url)))));
      await createComponent();
      tienda().navegacion.goToAccount();
      await flushMicrotasks(20);
      fixture.detectChanges();
    }

    const json = (body: unknown, status = 200): Response =>
      ({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) }) as Response;

    /**
     * Un pedido tal como lo emite el backend: el estado es uno de los TRES que el
     * enum tiene, y el permiso de devolver viene decidido por el servidor (#34) —
     * la UI ya no lo deduce de `status`.
     */
    const pedido = (status: ShopOrder['status'], canReturn = status === 'paid'): ShopOrder => ({
      orderNumber: 'ORD-REAL-1',
      orderRef: 'ORD-REAL-1',
      date: '2026-09-01',
      status,
      total: 120_000,
      currency: 'COP',
      items: [
        {
          title: 'Cafetera',
          qty: 1,
          amount: 120_000,
          productId: 'SKU-CAF',
          canReturn,
          returnBlock: canReturn ? undefined : 'order-not-paid',
        },
      ],
    });

    const etapas = (entregado: boolean) => ({
      orderRef: 'ORD-REAL-1',
      stages: [
        { id: 'paid', label: 'Pago confirmado', state: 'done' },
        { id: 'preparing', label: 'En preparación', state: 'done' },
        { id: 'shipped', label: 'Enviado', state: entregado ? 'done' : 'current' },
        { id: 'delivered', label: 'Entregado', state: entregado ? 'done' : 'pending' },
      ],
    });

    it('EL caso: el seguimiento y las devoluciones se piden con la REFERENCIA del pedido, no con su número (004, US 6)', async () => {
      // En la puerta la referencia es la saga y el número, ocho caracteres; en la directa, `ord_…` y `SYN-…`. El borde
      // busca por la referencia: pedir por el número daba 404, y «Mis compras» se quedaba sin seguimiento y con las
      // devoluciones «consultando» para siempre. Medido en vivo (T047).
      const urls: string[] = [];
      await conPedidos((url) => {
        urls.push(url);
        if (url.includes('/tracking')) return json({ ...etapas(true), orderRef: 'pta-saga-1' });
        if (url.includes('/return')) return json({ returns: [] });
        return json({ orders: [{ ...pedido('paid'), orderRef: 'pta-saga-1', orderNumber: 'CEBFA4B7' }] });
      });

      const order = tienda().pedidos.orders()[0];
      expect(order.orderRef).toBe('pta-saga-1');
      abrirLaCompra(order);
      await flushMicrotasks(20);
      tienda().vista(TiendaCuentaPedidoComponent).openReturn(order.orderNumber, order.items[0]);
      await tienda().devoluciones.submitReturn();

      const porPedido = urls.filter((u) => u.includes('/order/'));
      expect(porPedido.some((u) => u.includes('/order/pta-saga-1/tracking'))).toBe(true);
      expect(porPedido.filter((u) => u.includes('/order/pta-saga-1/return')).length).toBeGreaterThanOrEqual(2);
      expect(porPedido.filter((u) => u.includes('CEBFA4B7'))).toEqual([]);
    });

    it('EL caso: un pedido `paid` y entregado SÍ se puede devolver', async () => {
      await conPedidos((url) => {
        if (url.includes('/tracking')) return json(etapas(true));
        if (url.includes('/return')) return json({ returns: [] });
        return json({ orders: [pedido('paid')] });
      });

      const order = tienda().pedidos.orders()[0];
      expect(order.status).toBe('paid');
      abrirLaCompra(order);
      await flushMicrotasks(10);

      // Antes esto era FALSO siempre: el gate pedía `delivered|shipped`, que el
      // backend no emite nunca.
      expect(tienda().devoluciones.canReturnLine(order, order.items[0])).toBe(true);
      expect(tienda().vista(TiendaCuentaPedidoComponent).returnBlockedReason(order, order.items[0])).toBe('');
    });

    it('EL caso: el seguimiento ya NO decide — sin entregar, con `canReturn`, se ofrece y no se explica nada (etapa 3)', async () => {
      // Refinaba con «todavía no llegó», pero nadie avanza el envío y el seguimiento no pasa de «pagado»: «Pedir
      // devolución» no salía nunca, en ninguno de los dos caminos. Manda el servidor (`canReturn`).
      await conPedidos((url) => {
        if (url.includes('/tracking')) return json(etapas(false));
        if (url.includes('/return')) return json({ returns: [] });
        return json({ orders: [pedido('paid')] });
      });

      const order = tienda().pedidos.orders()[0];
      abrirLaCompra(order);
      await flushMicrotasks(10);

      expect(tienda().pedidos.isDelivered(order)).toBe(false);
      expect(tienda().devoluciones.canReturnLine(order, order.items[0])).toBe(true);
      expect(tienda().vista(TiendaCuentaPedidoComponent).returnBlockedReason(order, order.items[0])).toBe('');
    });

    it('EL caso: si el SEGUIMIENTO no se pudo leer, se ofrece igual', async () => {
      await conPedidos((url) => {
        if (url.includes('/tracking')) return json({}, 500);
        if (url.includes('/return')) return json({ returns: [] });
        return json({ orders: [pedido('paid')] });
      });

      const order = tienda().pedidos.orders()[0];
      // Sin pedir el seguimiento: no hay etapas que mirar.
      expect(tienda().pedidos.trackingStages(order.orderNumber)).toHaveLength(0);
      // La condición del servidor se cumple, así que el botón NO va a rebotar.
      // Bloquear la devolución porque se cayó el seguimiento cambiaría un problema
      // de información por uno de negocio.
      expect(tienda().devoluciones.canReturnLine(order, order.items[0])).toBe(true);
    });

    it('EL caso: manda el SERVIDOR — sin su permiso no se ofrece, aunque todo lo demás cuadre', async () => {
      // Pedido `paid`, entregado, sin reclamos: todo lo que la UI sabía mirar
      // dice que sí. Pero el servidor dice que no, y el servidor es el que aplica
      // el POST. Deducirlo acá es lo que produjo el #33.
      await conPedidos((url) => {
        if (url.includes('/tracking')) return json(etapas(true));
        if (url.includes('/return')) return json({ returns: [] });
        return json({ orders: [pedido('paid', false)] });
      });

      const order = tienda().pedidos.orders()[0];
      abrirLaCompra(order);
      await flushMicrotasks(10);

      expect(order.status).toBe('paid');
      expect(tienda().pedidos.isDelivered(order)).toBe(true);
      expect(tienda().devoluciones.canReturnLine(order, order.items[0])).toBe(false);
    });

    it('y el motivo lo NOMBRA el servidor: «ya hay un reclamo» se explica', async () => {
      await conPedidos((url) => {
        if (url.includes('/tracking')) return json(etapas(true));
        if (url.includes('/return')) return json({ returns: [] });
        return json({
          orders: [
            {
              ...pedido('paid'),
              items: [
                {
                  title: 'Cafetera',
                  qty: 1,
                  amount: 120_000,
                  productId: 'SKU-CAF',
                  canReturn: false,
                  returnBlock: 'already-open',
                },
              ],
            },
          ],
        });
      });

      const order = tienda().pedidos.orders()[0];
      abrirLaCompra(order);
      await flushMicrotasks(10);

      expect(tienda().vista(TiendaCuentaPedidoComponent).returnBlockedReason(order, order.items[0])).toContain('reclamo abierto');
    });

    it('un motivo que no le sirve a quien compró no se pinta', async () => {
      await conPedidos((url) => {
        if (url.includes('/tracking')) return json(etapas(true));
        if (url.includes('/return')) return json({ returns: [] });
        return json({ orders: [pedido('cancelled', false)] });
      });

      const order = tienda().pedidos.orders()[0];
      abrirLaCompra(order);
      await flushMicrotasks(10);

      // `order-not-paid`: a quien canceló no hay que contarle que no puede
      // devolver lo que nunca recibió.
      expect(tienda().vista(TiendaCuentaPedidoComponent).returnBlockedReason(order, order.items[0])).toBe('');
    });

    it('un pedido sin pagar o cancelado no se devuelve: el servidor lo rechaza', async () => {
      for (const estado of ['pending', 'cancelled'] as const) {
        await conPedidos((url) => {
          if (url.includes('/tracking')) return json(etapas(true));
          if (url.includes('/return')) return json({ returns: [] });
          return json({ orders: [pedido(estado)] });
        });

        const order = tienda().pedidos.orders()[0];
        abrirLaCompra(order);
        await flushMicrotasks(10);

        expect(tienda().devoluciones.canReturnLine(order, order.items[0])).toBe(false);
        // Y no se le explica nada: a quien canceló no hay que contarle que no
        // puede devolver lo que nunca recibió.
        expect(tienda().vista(TiendaCuentaPedidoComponent).returnBlockedReason(order, order.items[0])).toBe('');
        TestBed.resetTestingModule();
      }
    });
  });
});
