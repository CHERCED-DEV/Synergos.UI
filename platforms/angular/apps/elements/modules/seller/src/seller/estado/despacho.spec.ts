import { ComponentFixture, ConsolaPanelComponent, PEDIDO_DEL_CMS, SellerElementComponent, bandejaDelCms, flushMicrotasks, prepararLaConsola } from '../arnes-de-la-consola.test';

/**
 * La consola montada entera, por el despacho: los actos del personal (014-despiece-tienda, T013). Las pruebas son las
 * de la spec única de antes, repartidas por el componente que ejercitan, con el arnés común.
 */
describe('La consola: el despacho', () => {
  let fixture: ComponentFixture<SellerElementComponent>;
  const { consola, createComponent } = prepararLaConsola((montado) => {
    fixture = montado;
  });

  describe('los actos (T021)', () => {
    const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
    const json = (status: number, cuerpo: unknown): Response =>
      new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });
    /** A qué lleva cada acto, como `VendedorDeLaTiendaController.Avanzar` (T019). */
    const SIGUIENTE: Record<string, { etapa: string; actos: string[]; motivoSinActos: string | null }> = {
      preparar: { etapa: 'preparing', actos: ['enviar'], motivoSinActos: null },
      enviar: { etapa: 'shipped', actos: ['entregar'], motivoSinActos: null },
      entregar: { etapa: 'delivered', actos: [], motivoSinActos: 'entregado' },
    };
    const ACTOS_DE: Record<string, string[]> = { paid: ['preparar'], preparing: ['enviar'], shipped: ['entregar'], delivered: [] };

    interface Servidor {
      readonly actos: { orderRef: string; cuerpo: unknown }[];
      lecturas: number;
      /** Lo que contesta el próximo acto; sin él, el servidor lo hace y contesta el pedido movido. */
      responde: ((orderRef: string) => Response | Promise<Response>) | null;
      mover(orderRef: string, acto: string): object;
    }

    /** El borde con la forma del CMS: la bandeja de lo que hay, el acto que la mueve y el detalle de cada pedido. */
    function servidor(inicial: Record<string, { etapa: string; actos?: string[]; motivoSinActos?: string | null }>): Servidor {
      const estado = new Map<string, Record<string, unknown>>(
        Object.entries(inicial).map(([ref, p]) => [
          ref,
          { ...PEDIDO_DEL_CMS, orderRef: ref, orderNumber: `N-${ref}`, etapa: p.etapa, actos: p.actos ?? ACTOS_DE[p.etapa], motivoSinActos: p.motivoSinActos ?? null },
        ]),
      );
      const s: Servidor = {
        actos: [],
        lecturas: 0,
        responde: null,
        mover: (orderRef, acto) => {
          const movido = { ...estado.get(orderRef)!, ...SIGUIENTE[acto] };
          estado.set(orderRef, movido);
          return movido;
        },
      };
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = new URL(String(input), 'http://cms.local');
          if (url.pathname === '/api/shop/seller/orders') {
            s.lecturas++;
            return json(200, bandejaDelCms([...estado.values()]));
          }
          const acto = /^\/api\/shop\/seller\/orders\/([^/]+)\/advance$/.exec(url.pathname)?.[1];
          if (acto && init?.method === 'POST') {
            const orderRef = decodeURIComponent(acto);
            const cuerpo = JSON.parse(String(init.body)) as { acto: string };
            s.actos.push({ orderRef, cuerpo });
            return s.responde ? s.responde(orderRef) : json(200, s.mover(orderRef, cuerpo.acto));
          }
          const detalle = /^\/api\/shop\/seller\/orders\/([^/]+)$/.exec(url.pathname)?.[1];
          const pedido = detalle ? estado.get(decodeURIComponent(detalle)) : undefined;
          return pedido ? json(200, { ...pedido, envio: null, motivoSinEnvio: 'sin_envio' }) : json(404, { error: 'not found' });
        }),
      );
      return s;
    }

    const fila = (orderRef: string) => consola().vista(ConsolaPanelComponent).consoleRows().find((row) => row.id === orderRef)!;
    const acciones = (orderRef: string): string[] => consola().vista(ConsolaPanelComponent).rowActionsFor(fila(orderRef)).map((a) => a.id);
    const etapaDe = (orderRef: string) => consola().estado.pedidos().find((p) => p.orderRef === orderRef)?.etapa;
    const pedir = (orderRef: string, acto: string): void =>
      consola().vista(ConsolaPanelComponent).onRowAction({ actionId: `acto:${acto}`, row: fila(orderRef), sectionId: 'ventas' });

    async function asentarYPintar(): Promise<void> {
      await flushMicrotasks();
      fixture.detectChanges();
    }

    it('ofrece los actos que dice el servidor y ninguno más; sin actos, el detalle dice por qué', async () => {
      servidor({
        'pta-pagado': { etapa: 'paid' },
        'pta-preparando': { etapa: 'preparing' },
        'pta-entregado': { etapa: 'delivered', motivoSinActos: 'entregado' },
        'pta-cerrada': { etapa: 'paid', actos: [], motivoSinActos: 'despacho_no_disponible' },
      });
      await createComponent();

      expect(acciones('pta-pagado')).toEqual(['acto:preparar', 'detalle']);
      expect(acciones('pta-preparando')).toEqual(['acto:enviar', 'detalle']);
      expect(acciones('pta-entregado')).toEqual(['detalle']);
      expect(acciones('pta-cerrada')).toEqual(['detalle']);

      await consola().despacho.abrirDetalle(fila('pta-cerrada').pedido!);
      fixture.detectChanges();
      expect(host().querySelector('.seller__detalle')?.textContent).toContain('Los pedidos de la puerta no se despachan desde este sitio.');
      await consola().despacho.abrirDetalle(fila('pta-entregado').pedido!);
      fixture.detectChanges();
      expect(host().querySelector('.seller__detalle')?.textContent).toContain('Este pedido ya se entregó.');
    });

    it('el acto va al servidor y la fila se mueve sólo con su respuesta; un segundo clic mientras vuela no sale', async () => {
      const s = servidor({ 'pta-1': { etapa: 'paid' } });
      let liberar: () => void = () => undefined;
      s.responde = (orderRef) =>
        new Promise<Response>((resolver) => {
          liberar = () => resolver(json(200, s.mover(orderRef, 'preparar')));
        });
      await createComponent();

      pedir('pta-1', 'preparar');
      pedir('pta-1', 'preparar');
      await asentarYPintar();

      expect(s.actos).toEqual([{ orderRef: 'pta-1', cuerpo: { acto: 'preparar', guia: null } }]);
      expect(etapaDe('pta-1')).toBe('paid');
      expect(acciones('pta-1')).toEqual(['acto-en-vuelo', 'detalle']);

      liberar();
      await asentarYPintar();

      expect(etapaDe('pta-1')).toBe('preparing');
      expect(acciones('pta-1')).toEqual(['acto:enviar', 'detalle']);
      expect(consola().estado.actionError()).toBeNull();
    });

    it('un rechazo no mueve la fila: dice por qué, por su código, y en qué etapa sigue', async () => {
      const s = servidor({ 'pta-1': { etapa: 'shipped' } });
      s.responde = () =>
        json(409, { code: 'fulfillment.transition_not_allowed', error: 'De Ready no se pasa a Delivered.', transient: false });
      await createComponent();
      const lecturas = s.lecturas;

      pedir('pta-1', 'entregar');
      await asentarYPintar();

      expect(etapaDe('pta-1')).toBe('shipped');
      expect(s.lecturas).toBe(lecturas);
      expect(consola().estado.actionError()).toBe('Primero márcalo enviado. El pedido sigue en «En camino».');
      expect(host().querySelector('[role="alert"]')?.textContent).toContain('Primero márcalo enviado.');
      expect(acciones('pta-1')).toEqual(['acto:entregar', 'detalle']);
    });

    it('fuera de orden dice la etapa que manda el servidor; una caída, que nada cambió', async () => {
      const s = servidor({ 'pta-1': { etapa: 'paid' } });
      s.responde = () => json(409, { code: 'tienda.acto_fuera_de_orden', error: 'No le toca.', etapa: 'shipped' });
      await createComponent();

      pedir('pta-1', 'preparar');
      await asentarYPintar();
      expect(consola().estado.actionError()).toBe('Ese paso ya no le toca a este pedido. El pedido sigue en «En camino».');

      s.responde = () => json(503, { code: 'fulfillment.unreachable', error: 'No respondió.', transient: true });
      pedir('pta-1', 'preparar');
      await asentarYPintar();
      expect(consola().estado.actionError()).toBe(
        'No pudimos hacerlo ahora y nada cambió: vuelve a intentarlo. El pedido sigue en «Por preparar».',
      );
      expect(etapaDe('pta-1')).toBe('paid');
    });

    it('enviar pide la guía: una de 81 no sale, y una de 80 sale recortada', async () => {
      const s = servidor({ 'pta-1': { etapa: 'preparing' } });
      await createComponent();

      pedir('pta-1', 'enviar');
      fixture.detectChanges();
      const campo = host().querySelector<HTMLInputElement>('.seller__guia input')!;
      expect(campo.getAttribute('maxlength')).toBe('80');

      campo.value = 'G'.repeat(81);
      campo.dispatchEvent(new Event('input'));
      host().querySelector<HTMLButtonElement>('.seller__enviar button')!.click();
      await asentarYPintar();
      expect(s.actos).toEqual([]);
      expect(consola().estado.actionError()).toBe('La guía: hasta 80 caracteres, en una línea.');

      campo.value = `  ${'G'.repeat(80)}  `;
      campo.dispatchEvent(new Event('input'));
      host().querySelector<HTMLButtonElement>('.seller__enviar button')!.click();
      await asentarYPintar();
      expect(s.actos).toEqual([{ orderRef: 'pta-1', cuerpo: { acto: 'enviar', guia: 'G'.repeat(80) } }]);
      expect(etapaDe('pta-1')).toBe('shipped');
      expect(host().querySelector('.seller__guia')).toBeNull();
    });

    it('sin sesión al actuar, la consola entera lo dice', async () => {
      const s = servidor({ 'pta-1': { etapa: 'paid' } });
      s.responde = () => json(401, { error: 'Se requiere iniciar sesión.' });
      await createComponent();

      pedir('pta-1', 'preparar');
      await asentarYPintar();

      expect(consola().estado.acceso()).toBe('sin-sesion');
      expect(consola().estado.actionError()).toBeNull();
    });
  });
});
