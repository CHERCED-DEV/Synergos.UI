import { ComponentFixture, StorefrontElementComponent, TiendaVendedorComponent, flushMicrotasks, installMemoryStorage, prepararLaTienda } from '../../arnes-de-la-tienda.test';

/**
 * La tienda montada entera, por la cara del vendedor en la tienda (014-despiece-tienda, T013). Las
 * pruebas son las de la spec única de antes, repartidas por el componente que ejercitan, con el arnés común.
 */
describe('La tienda: la cara del vendedor en la tienda', () => {
  let fixture: ComponentFixture<StorefrontElementComponent>;
  let component: StorefrontElementComponent;
  const { tienda, createComponent } = prepararLaTienda((montado, instancia) => {
    fixture = montado;
    component = instancia;
  });

  describe('consola del vendedor', () => {
    async function abrirConsola(): Promise<void> {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();
      component.setRole('seller');
      await flushMicrotasks(20);
      fixture.detectChanges();
    }

    it('la consola se monta y trae sus cuatro secciones', async () => {
      await abrirConsola();

      expect(tienda().navegacion.view()).toBe('seller');
      expect(fixture.nativeElement.querySelector('syn-console-shell')).not.toBeNull();
      expect(tienda().vista(TiendaVendedorComponent).sellerConfig().sections.map((s) => s.id)).toEqual([
        'orders',
        'returns',
        'reviews',
        'messages',
      ]);
    });

    it('EL caso: las devoluciones SIN atender van primero', async () => {
      await abrirConsola();

      // El escritorio de ejemplo llega con la de `en-revision` ANTES que la
      // `abierto`, así que esto sólo pasa si el orden se aplica de verdad.
      expect(tienda().escritorio.sellerReturns().map((c) => c.status)).toEqual(['abierto', 'en-revision']);
    });

    it('EL caso: las opiniones reportadas van primero, con conteo o sin él', async () => {
      await abrirConsola();

      const cola = tienda().escritorio.sellerModeration();
      expect(cola.map((i) => i.reason)).toEqual(['reported', 'reported', 'pending']);
      // La segunda reportada llega SIN conteo: sin esta fila, ordenar sólo por
      // conteo daría el mismo resultado y la regla del motivo no se vigilaría
      // (regla 7 de CLAUDE.md, aprendida en #31).
      expect(cola[1].reportCount).toBe(0);
    });

    it('EL caso: un avance fallido NO cambia el estado del reclamo', async () => {
      await abrirConsola();
      const antes = tienda().escritorio.sellerReturns()[0];

      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: false,
            status: 400,
            json: () => Promise.resolve({ error: 'No se puede pasar de abierto a recibido.' }),
          } as Response),
        ),
      );
      await tienda().escritorio.advanceReturn(antes.claimId, 'received');

      // `refunded` mueve plata de verdad: pintar «Resuelto» sobre un POST que
      // falló diría que se devolvió algo que sigue donde estaba.
      expect(tienda().escritorio.sellerReturns()[0].status).toBe(antes.status);
      expect(tienda().escritorio.deskFailed()).toBe(true);
      expect(tienda().escritorio.deskNotice()).toContain('abierto a recibido');
    });

    it('un avance aceptado toma el estado QUE DEVUELVE el servidor', async () => {
      await abrirConsola();
      const objetivo = tienda().escritorio.sellerReturns()[0];

      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({ ...objetivo, claimId: objetivo.claimId, status: 'en-revision' }),
          } as Response),
        ),
      );
      await tienda().escritorio.advanceReturn(objetivo.claimId, 'approved');

      const despues = tienda()
        .escritorio.sellerReturns()
        .find((c) => c.claimId === objetivo.claimId)!;
      expect(despues.status).toBe('en-revision');
      expect(tienda().escritorio.deskFailed()).toBe(false);
    });

    it('el escritorio de ejemplo se rotula: es una LECTURA degradada, no una mentira', async () => {
      await abrirConsola();

      expect(component.degraded()).toBe(true);
      expect(fixture.nativeElement.querySelector('syn-status-banner')).not.toBeNull();
    });
  });
});
