import { By, CON_MUESTRAS_DE_LA_CONSOLA, ComponentFixture, ConsolaPanelComponent, ConsoleShellComponent, NEGOCIO_DEL_CMS, PEDIDO_DEL_CMS, SellerElementComponent, TestBed, bandejaDelCms, flushMicrotasks, installFakeServer, installMemoryStorage, prepararLaConsola } from '../../arnes-de-la-consola.test';

/**
 * La consola montada entera, por el panel: los indicadores, las ventas y la bandeja del personal (014-despiece-tienda, T013). Las pruebas son las
 * de la spec única de antes, repartidas por el componente que ejercitan, con el arnés común.
 */
describe('La consola: el panel', () => {
  let fixture: ComponentFixture<SellerElementComponent>;
  const { consola, createComponent } = prepararLaConsola((montado) => {
    fixture = montado;
  });

  // ── render: panel + KPIs + secciones; los ejemplos, sólo con la marca ───────
  it('sin la base de la API no llama a nada y lo dice: caída, sin ejemplos (ADR 0137, CMS#196)', async () => {
    const red = vi.fn(() => Promise.reject(new Error('no debería llamarse')));
    vi.stubGlobal('fetch', red);
    await createComponent({});

    expect(red).not.toHaveBeenCalled();
    // Afirmaba `orders().length > 0` y `degraded()`: los pedidos de ejemplo como el camino normal (T006).
    expect(consola().estado.pedidos()).toEqual([]);
    expect(consola().estado.lecturas().ventas).toBe('caida');
    expect(consola().estado.muestras()).toBe(false);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('syn-console-shell syn-error-state')?.textContent).toContain(
      'No pudimos cargar esta sección.',
    );
  });

  it('con la marca de la demo, el panel enseña sus ejemplos —indicadores, cuatro secciones, la cola con su acción— y lo dice', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent(NEGOCIO_DEL_CMS, CON_MUESTRAS_DE_LA_CONSOLA);

    expect(consola().estado.view()).toBe('panel');
    expect(consola().estado.muestras()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('.seller__notice--warn')?.textContent?.trim()).toBe(
      'Estás viendo datos de ejemplo, no los de la tienda.',
    );

    // En Ventas, la banda de indicadores son las cuentas de la bandeja (T012).
    expect(consola().vista(ConsolaPanelComponent).consoleKpis().map((kpi) => kpi.id)).toEqual(['paid', 'preparing', 'shipped', 'delivered']);

    // The console shell mounts with the four secciones.
    const shell = fixture.debugElement.query(By.directive(ConsoleShellComponent));
    expect(shell).not.toBeNull();
    expect(consola().vista(ConsolaPanelComponent).consoleConfig().sections.map((section) => section.id)).toEqual([
      'ventas',
      'publicaciones',
      'devoluciones',
      'reputacion',
    ]);

    // Ventas queue from the samples, with row actions.
    // Los pedidos de ejemplo no traen actos: sólo su detalle.
    const paidRow = consola().vista(ConsolaPanelComponent).consoleRows().find((row) => row.pedido?.etapa === 'paid');
    expect(paidRow).toBeDefined();
    expect(consola().vista(ConsolaPanelComponent).rowActionsFor(paidRow!).map((action) => action.id)).toEqual(['detalle']);
  });

  it('sin la marca, con el CMS de hoy, nada se inventa: la cola es la del servidor, sin indicadores ni cartel', async () => {
    installMemoryStorage();
    installFakeServer({ 'GET /api/shop/seller/orders': bandejaDelCms() });
    await createComponent();

    expect(consola().estado.muestras()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('.seller__notice--warn')).toBeNull();
    // `GET seller/summary` no existe en el CMS de hoy (404): sin indicadores, en vez de los de ejemplo.
    expect(consola().estado.lecturas().resumen).toBe('caida');
    // En Ventas, los indicadores son las cuentas de la bandeja: las del servidor, no las de ejemplo.
    expect(consola().vista(ConsolaPanelComponent).consoleKpis().map((kpi) => kpi.value)).toEqual(['1', '0', '0', '0']);
    expect(consola().vista(ConsolaPanelComponent).consoleRows().map((row) => row.id)).toEqual(['saga-7f3a']);
  });

  // Las devoluciones (la cola, sus acciones y el POST que no sale) están en «la cola de devoluciones (T025)», abajo.

  // ── ventas: el envío NO avanza solo cuando el endpoint no está ───────────────
  it('leaves the order untouched and says so when the advance endpoint is missing', async () => {
    installMemoryStorage();
    // El pedido lo contesta el servidor; el acto, no (404 en esta tabla).
    installFakeServer({ 'GET /api/shop/seller/orders': bandejaDelCms() });
    await createComponent();

    const paid = consola().estado.pedidos().find((pedido) => pedido.etapa === 'paid');
    expect(paid).toBeDefined();

    const row = consola().vista(ConsolaPanelComponent).consoleRows().find((entry) => entry.pedido?.orderRef === paid!.orderRef);
    // El servidor dice qué actos tiene (T021): preparar, y nada más.
    expect(consola().vista(ConsolaPanelComponent).rowActionsFor(row!).map((a) => a.id)).toEqual(['acto:preparar', 'detalle']);
    consola().vista(ConsolaPanelComponent).onRowAction({ actionId: 'acto:preparar', row: row!, sectionId: 'ventas' });
    await flushMicrotasks();

    // Este test se llamaba «advances a shipment one status forward when the endpoint is
    // missing» y afirmaba `'preparing'` — el título decía el defecto. `POST
    // order/{ref}/tracking/advance` NO EXISTE en el CMS, así que eso pasaba el 100 % de las
    // veces y el pedido se pintaba en camino sin haber salido.
    const advanced = consola().estado.pedidos().find((pedido) => pedido.orderRef === paid!.orderRef);
    expect(advanced?.etapa).toBe('paid');
    expect(consola().estado.actionError()).toContain('Por preparar');
    expect(consola().estado.actionError()).toContain(paid!.orderNumber);
    // Una escritura caída no es «datos de ejemplo»: ese cartel es de las lecturas, y sólo con la marca.
    expect(consola().estado.muestras()).toBe(false);
  });

  // ── reputación cargando: esqueleto CON forma + aviso audible ────────────────
  it('reserves the reputation grid with a skeleton and still announces the load', async () => {
    installMemoryStorage();
    // A never-resolving fetch parks loadSummary() mid-flight → reputation() null.
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    await createComponent();

    expect(consola().estado.reputation()).toBeNull();

    const shell = fixture.debugElement.query(By.directive(ConsoleShellComponent));
    expect(shell).not.toBeNull();
    // ConsoleShellComponent is generic in TRow; only selectSection matters here.
    (shell.componentInstance as { selectSection(id: string): void }).selectSection('reputacion');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;

    // 1) The mould is the real grid: hero card + exactly three metric cards,
    //    reusing `seller__rep` / `seller__rep-card` so chrome and padding match.
    expect(host.querySelectorAll('.seller__rep-card--skeleton').length).toBe(
      consola().vista(ConsolaPanelComponent).repSkeletonCards.length + 1,
    );
    expect(
      host.querySelectorAll('.seller__rep-card--hero.seller__rep-card--skeleton').length,
    ).toBe(1);

    // 2) Bones are decorative and hidden from assistive tech…
    expect(host.querySelector('.seller__rep')?.getAttribute('aria-hidden')).toBe('true');

    // 3) …so the announcement MUST survive on a live region. Skeleton without
    //    this pair = prettier screen, silent screen reader — a11y REGRESSION.
    const announcement = host.querySelector('.seller__sr');
    expect(announcement).not.toBeNull();
    expect(announcement!.getAttribute('role')).toBe('status');
    expect(announcement!.textContent).toContain('Cargando reputación');
  });

  // ══ La bandeja del personal (013-seller-operaciones, T012) ═════════════════════════════════════════════════════
  //
  // Ventas lee la bandeja de la tienda entera (`GET seller/orders`), filtrada y paginada en el SERVIDOR, con las
  // cuentas de la tienda en la banda de indicadores; el detalle de un pedido dice a dónde va y con quién; las fechas van
  // en la hora del sitio. Los dobles tienen la forma de `VendedorDeLaTiendaController` (T011).
  describe('la bandeja (T012)', () => {
    const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
    const json = (status: number, cuerpo: unknown): Response =>
      new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });
    const pedido = (orderRef: string, etapa: string, cambios: object = {}): object => ({
      ...PEDIDO_DEL_CMS,
      orderRef,
      orderNumber: `N-${orderRef}`,
      etapa,
      ...cambios,
    });
    const CUENTAS = { paid: 5, preparing: 2, shipped: 1, delivered: 9 };

    /** Un borde que contesta la bandeja según la etapa y la página que se le piden, y el detalle de cada pedido. */
    function servidor(
      bandeja: (etapa: string | null, pagina: number) => object,
      detalles: Record<string, object> = {},
    ): string[] {
      const pedidas: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn((input: RequestInfo | URL) => {
          const url = new URL(String(input), 'http://cms.local');
          if (url.pathname === '/api/shop/seller/orders') {
            pedidas.push(url.search);
            return Promise.resolve(json(200, bandeja(url.searchParams.get('etapa'), Number(url.searchParams.get('pagina')))));
          }
          const ref = /^\/api\/shop\/seller\/orders\/(.+)$/.exec(url.pathname)?.[1];
          const detalle = ref ? detalles[decodeURIComponent(ref)] : undefined;
          return Promise.resolve(detalle ? json(200, detalle) : json(404, { error: 'not found' }));
        }),
      );
      return pedidas;
    }

    const chips = (): HTMLButtonElement[] => Array.from(host().querySelectorAll<HTMLButtonElement>('.syn-console__filter'));
    const indicadores = (): string[] =>
      Array.from(host().querySelectorAll('.syn-console__kpi-value')).map((k) => k.textContent?.trim() ?? '');

    async function asentarYPintar(): Promise<void> {
      await flushMicrotasks();
      fixture.detectChanges();
    }

    it('el filtro pide su etapa al servidor; las cuentas son las de la tienda entera y el chip no vuelve a «Todos»', async () => {
      const pedidas = servidor((etapa) =>
        etapa === 'shipped'
          ? bandejaDelCms([pedido('pta-enviado', 'shipped')], { cuentas: CUENTAS })
          : bandejaDelCms([pedido('pta-pagado', 'paid')], { cuentas: CUENTAS }),
      );
      await createComponent();

      expect(pedidas).toEqual(['?pagina=1']);
      // Las cuentas del servidor (5/2/1/9), no las de la página (un pagado): la página trae uno solo.
      expect(indicadores()).toEqual(['5', '2', '1', '9']);

      chips().find((c) => c.textContent?.trim() === 'En camino')!.click();
      await asentarYPintar();

      expect(pedidas).toEqual(['?pagina=1', '?etapa=shipped&pagina=1']);
      expect(consola().vista(ConsolaPanelComponent).consoleRows().map((row) => row.id)).toEqual(['pta-enviado']);
      expect(indicadores()).toEqual(['5', '2', '1', '9']);
      expect(chips().find((c) => c.getAttribute('aria-pressed') === 'true')?.textContent?.trim()).toBe('En camino');
    });

    it('la página siguiente se pide al servidor', async () => {
      const pedidas = servidor((_, pagina) =>
        bandejaDelCms([pedido(`pta-${pagina}`, 'paid')], { total: 51, cuentas: { ...CUENTAS, paid: 51 } }),
      );
      await createComponent();

      const siguiente = Array.from(host().querySelectorAll<HTMLButtonElement>('.syn-console__page-btn')).at(-1)!;
      expect(host().querySelector('.syn-console__page-status')?.textContent).toContain('Página 1 de 2');
      siguiente.click();
      await asentarYPintar();

      expect(pedidas).toEqual(['?pagina=1', '?pagina=2']);
      expect(consola().vista(ConsolaPanelComponent).consoleRows().map((row) => row.id)).toEqual(['pta-2']);
    });

    it('el detalle dice a dónde va y con quién; sin dirección, lo dice; y se cierra', async () => {
      servidor(() => bandejaDelCms([pedido('pta-1', 'paid'), pedido('dir-1', 'paid', { camino: 'directa' })]), {
        'pta-1': {
          ...pedido('pta-1', 'paid'),
          envio: {
            destino: { line1: 'Calle 1 # 2-3', line2: null, city: 'Bogotá', region: null, postalCode: null, country: 'CO', contact: 'Lucía' },
            transportadora: 'servientrega',
            estado: 'Ready',
            eventos: [],
          },
          motivoSinEnvio: null,
        },
        'dir-1': { ...pedido('dir-1', 'paid', { camino: 'directa' }), envio: { destino: null, transportadora: null, estado: null, eventos: [] }, motivoSinEnvio: 'sin_direccion' },
      });
      await createComponent();
      const verDetalle = (fila: number): void =>
        Array.from(host().querySelectorAll('.syn-console__tr')[fila].querySelectorAll<HTMLButtonElement>('.syn-console__action'))
          .find((b) => b.textContent?.trim() === 'Ver detalle')!
          .click();

      verDetalle(0);
      await asentarYPintar();
      const detalle = host().querySelector('.seller__detalle')!;
      expect(detalle.querySelector('.seller__detalle-title')?.textContent?.trim()).toBe('Pedido N-pta-1');
      expect(detalle.textContent).toContain('Calle 1 # 2-3, Bogotá, CO (Lucía)');
      expect(detalle.textContent).toContain('servientrega');

      verDetalle(1);
      await asentarYPintar();
      expect(host().querySelector('.seller__detalle')?.textContent).toContain('Este pedido no tiene una dirección registrada.');

      Array.from(host().querySelectorAll<HTMLButtonElement>('.seller__detalle button')).find((b) => b.textContent?.trim() === 'Cerrar')!.click();
      fixture.detectChanges();
      expect(host().querySelector('.seller__detalle')).toBeNull();
    });

    it('las fechas van en la hora del sitio: Madrid a propósito, porque esta máquina está en Bogotá', async () => {
      servidor(() => bandejaDelCms([pedido('pta-1', 'paid', { fecha: '2026-10-20T23:30:00Z' })]));
      await createComponent({ ...NEGOCIO_DEL_CMS, zonaHoraria: 'Europe/Madrid' });
      // En Madrid ya es el 21 a la 01:30 (CEST); en Bogotá serían las 18:30 del 20.
      expect(consola().vista(ConsolaPanelComponent).consoleRows()[0].cells['fecha']).toMatch(/^21 .*2026, 01:30$/);

      TestBed.resetTestingModule();
      servidor(() => bandejaDelCms([pedido('pta-1', 'paid', { fecha: '2026-10-20T23:30:00Z' })]));
      await createComponent({ ...NEGOCIO_DEL_CMS, zonaHoraria: 'America/Bogota' });
      expect(consola().vista(ConsolaPanelComponent).consoleRows()[0].cells['fecha']).toMatch(/^20 .*2026, 18:30$/);
    });

    it('las compras que el servidor no alcanzó a confirmar se dicen', async () => {
      servidor(() => bandejaDelCms([pedido('pta-1', 'paid')], { sinConciliar: 3 }));
      await createComponent();

      expect(host().querySelector('.seller__notice--warn')?.textContent?.trim()).toBe(
        '3 compras recientes todavía no se confirman aquí: vuelve a cargar en un momento.',
      );
    });

    it('una bandeja que llega tarde no se pinta: con dos filtros seguidos gana el último', async () => {
      const pendientes = new Map<string, (r: Response) => void>();
      vi.stubGlobal(
        'fetch',
        vi.fn((input: RequestInfo | URL) => {
          const url = new URL(String(input), 'http://cms.local');
          const etapa = url.searchParams.get('etapa') ?? 'todas';
          if (etapa === 'todas') return Promise.resolve(json(200, bandejaDelCms([pedido('pta-pagado', 'paid')])));
          return new Promise<Response>((resolver) => pendientes.set(etapa, resolver));
        }),
      );
      await createComponent();

      consola().estado.onFilterChange('preparing');
      consola().estado.onFilterChange('shipped');
      pendientes.get('shipped')!(json(200, bandejaDelCms([pedido('pta-enviado', 'shipped')])));
      await asentarYPintar();
      pendientes.get('preparing')!(json(200, bandejaDelCms([pedido('pta-preparando', 'preparing')])));
      await asentarYPintar();

      expect(consola().vista(ConsolaPanelComponent).consoleRows().map((row) => row.id)).toEqual(['pta-enviado']);
    });
  });
});
