import { ComponentFixture, ConsolaPanelComponent, SellerElementComponent, bandejaDelCms, flushMicrotasks, prepararLaConsola } from '../arnes-de-la-consola.test';

/**
 * La consola montada entera, por los reembolsos: la cola de devoluciones (014-despiece-tienda, T013). Las pruebas son las
 * de la spec única de antes, repartidas por el componente que ejercitan, con el arnés común.
 */
describe('La consola: los reembolsos', () => {
  let fixture: ComponentFixture<SellerElementComponent>;
  const { consola, createComponent } = prepararLaConsola((montado) => {
    fixture = montado;
  });

  describe('la cola de devoluciones (T025)', () => {
    const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
    const json = (status: number, cuerpo: unknown): Response =>
      new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });
    /** A qué estado lleva cada `status` que lee el CMS (`ReturnAdvanceBody`). */
    const ESTADO_DEL_MOVIMIENTO: Record<string, string> = {
      approved: 'Approved',
      rejected: 'Rejected',
      received: 'Received',
      refunded: 'Refunded',
    };

    /** Una devolución como la emite el CMS (`VendedorDeLaTiendaController.DevolucionDto`, T024). */
    const devolucionDelCms = (rmaId: string, estado: string, motivo = 'Llegó con teclas flojas'): Record<string, unknown> => ({
      rmaId,
      orderRef: `ord-${rmaId}`,
      orderNumber: `N-${rmaId}`,
      camino: 'puerta',
      producto: 'Teclado mecánico compacto 65%',
      cantidad: 1,
      motivo,
      monto: 259000,
      montoFormatted: '$ 259.000',
      moneda: 'COP',
      estado,
      nota: null,
      solicitada: '2026-10-20T15:00:00+00:00',
      actualizada: '2026-10-20T15:00:00+00:00',
    });

    interface Servidor {
      readonly movimientos: { rmaId: string; cuerpo: unknown }[];
      /** Lo que contesta el próximo movimiento; sin él, el servidor lo hace y contesta la devolución movida. */
      responde: (() => Response | Promise<Response>) | null;
    }

    /** El borde con la forma del CMS: la cola de lo que hay, y el movimiento que la cambia. */
    function servidor(inicial: Record<string, string>, motivos: Record<string, string> = {}): Servidor {
      const estado = new Map(Object.entries(inicial).map(([rma, e]) => [rma, devolucionDelCms(rma, e, motivos[rma])]));
      const s: Servidor = { movimientos: [], responde: null };
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = new URL(String(input), 'http://cms.local');
          if (url.pathname === '/api/shop/seller/returns') return json(200, { devoluciones: [...estado.values()] });
          if (url.pathname === '/api/shop/seller/orders') return json(200, bandejaDelCms([]));
          const rma = /^\/api\/shop\/return\/([^/]+)\/advance$/.exec(url.pathname)?.[1];
          if (rma && init?.method === 'POST') {
            const rmaId = decodeURIComponent(rma);
            const cuerpo = JSON.parse(String(init.body)) as { status: string };
            s.movimientos.push({ rmaId, cuerpo });
            if (s.responde) return s.responde();
            const movida = { ...estado.get(rmaId)!, estado: ESTADO_DEL_MOVIMIENTO[cuerpo.status] };
            estado.set(rmaId, movida);
            return json(200, { claimId: rmaId, rmaId, status: 'en-revision', estado: movida['estado'] });
          }
          return json(404, { error: 'not found' });
        }),
      );
      return s;
    }

    const fila = (rmaId: string) => consola().vista(ConsolaPanelComponent).consoleRows().find((row) => row.id === rmaId)!;
    const acciones = (rmaId: string): string[] => consola().vista(ConsolaPanelComponent).rowActionsFor(fila(rmaId)).map((a) => a.id);
    const estadoDe = (rmaId: string) => consola().estado.devoluciones().find((d) => d.rmaId === rmaId)?.estado;
    const mover = (rmaId: string, movimiento: string): void =>
      consola().vista(ConsolaPanelComponent).onRowAction({ actionId: `devolucion:${movimiento}`, row: fila(rmaId), sectionId: 'devoluciones' });

    async function abrirLaCola(): Promise<void> {
      await createComponent();
      consola().estado.onSectionChange('devoluciones');
      await flushMicrotasks();
      fixture.detectChanges();
    }

    async function asentarYPintar(): Promise<void> {
      await flushMicrotasks();
      fixture.detectChanges();
    }

    it('cada devolución ofrece lo que le toca por su estado exacto, y la insignia cuenta las que piden algo', async () => {
      servidor({ 'RMA-1': 'Requested', 'RMA-2': 'Approved', 'RMA-3': 'Received', 'RMA-4': 'Refunded', 'RMA-5': 'Rejected' });
      await abrirLaCola();

      expect(acciones('RMA-1')).toEqual(['devolucion:approved', 'devolucion:rejected']);
      expect(acciones('RMA-2')).toEqual(['devolucion:received']);
      expect(acciones('RMA-3')).toEqual(['devolucion:refunded']);
      expect(acciones('RMA-4')).toEqual([]);
      expect(acciones('RMA-5')).toEqual([]);
      expect(['RMA-1', 'RMA-2', 'RMA-3', 'RMA-4', 'RMA-5'].map((rma) => fila(rma).cells['estado'])).toEqual([
        'Pedida',
        'Aprobada',
        'Recibida',
        'Reembolsada',
        'Rechazada',
      ]);
      expect(consola().estado.openReturnsCount()).toBe(3);
    });

    it('el motivo se lee con su texto, el mismo que eligió quien compra; un texto libre de antes, tal cual', async () => {
      servidor({ 'RMA-1': 'Requested', 'RMA-2': 'Approved' }, { 'RMA-1': 'damaged' });
      await abrirLaCola();

      expect(fila('RMA-1').cells['motivo']).toBe('Llegó dañado');
      expect(fila('RMA-2').cells['motivo']).toBe('Llegó con teclas flojas');
      expect(host().textContent).toContain('Llegó dañado');
      expect(host().textContent).not.toContain('damaged');
    });

    it('aprobar manda { status: approved } y la cola se vuelve a leer con lo que dice el servidor', async () => {
      const s = servidor({ 'RMA-1': 'Requested' });
      await abrirLaCola();

      mover('RMA-1', 'approved');
      await asentarYPintar();

      expect(s.movimientos).toEqual([{ rmaId: 'RMA-1', cuerpo: { status: 'approved', note: null } }]);
      expect(estadoDe('RMA-1')).toBe('Approved');
      expect(acciones('RMA-1')).toEqual(['devolucion:received']);
      expect(consola().estado.actionError()).toBeNull();
    });

    it('reembolsar pide confirmarlo: sin confirmar no sale nada; confirmado, manda { status: refunded }', async () => {
      const s = servidor({ 'RMA-3': 'Received' });
      await abrirLaCola();

      mover('RMA-3', 'refunded');
      fixture.detectChanges();
      expect(s.movimientos).toEqual([]);
      const confirmar = host().querySelector<HTMLButtonElement>('.seller__reembolsar button')!;
      expect(confirmar.textContent?.trim()).toBe('Sí, reembolsar');
      expect(host().textContent).toContain('Reembolsar $ 259.000 de la devolución RMA-3');

      confirmar.click();
      await asentarYPintar();

      expect(s.movimientos).toEqual([{ rmaId: 'RMA-3', cuerpo: { status: 'refunded', note: null } }]);
      expect(estadoDe('RMA-3')).toBe('Refunded');
      expect(host().querySelector('.seller__reembolsar')).toBeNull();
    });

    it('un reembolso que no sale se queda recibida y dice el motivo del servidor', async () => {
      const s = servidor({ 'RMA-3': 'Received' });
      s.responde = () => json(400, { error: 'El orquestador no pudo devolver la plata: payments.refund_over_captured.' });
      await abrirLaCola();

      mover('RMA-3', 'refunded');
      fixture.detectChanges();
      host().querySelector<HTMLButtonElement>('.seller__reembolsar button')!.click();
      await asentarYPintar();

      expect(estadoDe('RMA-3')).toBe('Received');
      expect(consola().estado.actionError()).toBe(
        'El orquestador no pudo devolver la plata: payments.refund_over_captured. La devolución sigue en «Recibida».',
      );
      expect(acciones('RMA-3')).toEqual(['devolucion:refunded']);
    });

    it('un movimiento que no sale no mueve la fila (#77) y la deja accionable; un segundo clic mientras vuela no sale', async () => {
      const s = servidor({ 'RMA-1': 'Requested' });
      let liberar: () => void = () => undefined;
      s.responde = () => json(503, { error: 'caído' });
      await abrirLaCola();

      mover('RMA-1', 'approved');
      await asentarYPintar();
      expect(estadoDe('RMA-1')).toBe('Requested');
      expect(consola().estado.actionError()).toBe(
        'No pudimos hacerlo ahora y nada cambió: vuelve a intentarlo. La devolución sigue en «Pedida».',
      );
      expect(acciones('RMA-1')).toEqual(['devolucion:approved', 'devolucion:rejected']);

      const pendiente = new Promise<Response>((resolver) => {
        liberar = () => resolver(json(200, { estado: 'Approved' }));
      });
      s.responde = () => pendiente;
      mover('RMA-1', 'approved');
      mover('RMA-1', 'rejected');
      await asentarYPintar();
      expect(acciones('RMA-1')).toEqual(['acto-en-vuelo']);
      liberar();
      await asentarYPintar();
      expect(s.movimientos.map((m) => m.cuerpo)).toEqual([
        { status: 'approved', note: null },
        { status: 'approved', note: null },
      ]);
    });
  });
});
