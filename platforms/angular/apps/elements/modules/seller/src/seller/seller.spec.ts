import { type Provider, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ConsoleShellComponent } from '@synergos/shells';
import { MUESTRAS_DE_LA_CONSOLA, SellerApiClient } from './seller-api.client';
import { SellerElementComponent } from './seller';
import { asentar } from '../../../../../../tools/asentar';
import { SELLER_SYNHOST } from '@synergos/contracts';

/** La configuración de negocio que el CMS manda con los valores base de su sección (ADR 0137). */
const NEGOCIO_DEL_CMS = { apiBase: SELLER_SYNHOST.ejemplo.apiBase };

/** La demo que DECLARA los ejemplos de la consola (T006): sin esta marca, la consola no los pinta. */
const CON_MUESTRAS_DE_LA_CONSOLA: Provider[] = [{ provide: MUESTRAS_DE_LA_CONSOLA, useValue: true }];

/**
 * Un pedido como lo emite la bandeja del CMS (`VendedorDeLaTiendaController.PedidoDto`, T011). La consola ya no lee
 * `GET orders`, que es «Mis compras» del comprador (T012).
 */
const PEDIDO_DEL_CMS = {
  orderRef: 'saga-7f3a',
  orderNumber: 'T-2026-0042',
  fecha: '2026-10-20T15:00:00+00:00',
  comprador: 'Lucía Gómez',
  camino: 'puerta',
  etapa: 'paid',
  total: 259000,
  totalFormatted: '$ 259.000',
  moneda: 'COP',
  lineas: [{ title: 'Teclado mecánico compacto 65%', qty: 1, amount: 259000, amountFormatted: '$ 259.000' }],
  actos: ['preparar'],
  motivoSinActos: null,
};

/** La bandeja como la emite el CMS (`BandejaDto`): una página, las cuentas de la tienda entera y lo no conciliado. */
function bandejaDelCms(pedidos: readonly object[] = [PEDIDO_DEL_CMS], cambios: object = {}): object {
  return {
    pedidos,
    pagina: 1,
    porPagina: 50,
    total: pedidos.length,
    cuentas: { paid: pedidos.length, preparing: 0, shipped: 0, delivered: 0 },
    sinConciliar: 0,
    ...cambios,
  };
}

/** Un hilo como lo emite hoy `ThreadSummaryDto` del CMS en `GET messages`: `threadId` y no `id`, sin asunto (T030). */
const HILO_DEL_CMS = {
  threadId: 'th_31',
  contextRef: 'P-9',
  participants: ['comprador@correo.co', 'vendedor@tienda.co'],
  lastMessagePreview: '¿Tiene garantía?',
  lastMessageAt: '2026-09-30T10:00:00+00:00',
  messageCount: 1,
};

/** Un borde que contesta `status` a todo: la sesión vencida (401), el que no es del personal (403), el caído (500). */
function installStatus(status: number): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'no' }), { status, headers: { 'content-type': 'application/json' } }),
      ),
    ),
  );
}

/** Minimal in-memory localStorage stand-in so the wizard's draft store can persist. */
function installMemoryStorage(): void {
  const store = new Map<string, string>();
  const mock: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  };
  vi.stubGlobal('localStorage', mock);
}

/**
 * Settle a fetch().then() chain — fetch rejection is a macrotask in jsdom, so we
 * yield to real timers between microtask drains to let each hop resolve.
 */
async function flushMicrotasks(times = 8): Promise<void> {
  await asentar(times);
}

/**
 * Un borde de mentira CON LA FORMA del de verdad, apagable por MÉTODO y RUTA (#77).
 *
 * Hace falta porque los specs de acá tiraban `fetch` entero con `Promise.reject`, y entonces
 * **el sistema bajo prueba es el `catch`** — la regla 16. Tres de ellos afirmaban con todas
 * las letras lo que ese `catch` fabricaba: un RMA «aprobado», un pedido en «preparing» y un
 * recibo `PUB-…`, las tres cosas sin que el servidor existiera. Con la red apagada del todo no
 * hay forma de distinguir «lo publicó» de «se lo inventó».
 *
 * Las rutas que responden son las que el CMS DECLARA (`ShopCatalogController`, `api/shop`); las
 * que no están en esta tabla contestan **404**, que es lo que el CMS hace hoy con
 * `seller/product` y con `order/{ref}/tracking/advance`.
 */
function installFakeServer(respuestas: Record<string, unknown>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input);
    const metodo = (init?.method ?? 'GET').toUpperCase();
    const ruta = url.split('?')[0];
    // Se busca por «MÉTODO ruta» y, si no, por la ruta sola: así un test puede apagar el POST
    // de una ruta cuyo GET sí contesta, que es el caso que de verdad alcanza a una escritura.
    const clave = Object.keys(respuestas).find(
      (k) => k === `${metodo} ${ruta}` || k === ruta || ruta.endsWith(k.replace(/^[A-Z]+ /, '')),
    );
    if (clave === undefined) {
      return Promise.resolve(
        new Response(JSON.stringify({ error: 'not found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify(respuestas[clave]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// Smoke suite (directiva: mínimos, no exhaustivo) — render + secciones + lo que dice cada lectura.
describe('SellerElementComponent (consola sobre SH-5/6/7)', () => {
  let fixture: ComponentFixture<SellerElementComponent>;
  let component: SellerElementComponent;

  async function createComponent(config: object = NEGOCIO_DEL_CMS, extra: Provider[] = []): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [SellerElementComponent],
      providers: [provideZonelessChangeDetection(), SellerApiClient, ...extra],
    }).compileComponents();

    fixture = TestBed.createComponent(SellerElementComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('config', config);
    fixture.detectChanges();
    // Resumen y pedidos cargan en ngOnInit, ya con el config del CMS; que asienten.
    await flushMicrotasks();
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  // CMS#196: el subtítulo viajaba en el ElementType y nadie lo pintaba.
  it('pinta el subtítulo del CMS bajo la marca, y sin subtítulo no deja un párrafo vacío', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();
    expect(fixture.nativeElement.querySelector('.seller__brand-sub')).toBeNull();

    fixture.componentRef.setInput('config', { ...NEGOCIO_DEL_CMS, subheading: 'Ventas, publicaciones y devoluciones' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.seller__brand-sub').textContent.trim()).toBe(
      'Ventas, publicaciones y devoluciones',
    );
  });

  // CMS#197: el chip decía el `sellerName` que el editor escribiera en el JSON libre —el mismo
  // nombre para todo vendedor que abriera la página—. Ahora es el miembro de la sesión.
  // `HostIdentityService` lee `window.synergos` al construirse: el bridge va antes del componente.
  describe('quién atiende la consola (CMS#197)', () => {
    interface ConBridge {
      synergos?: unknown;
    }
    afterEach(() => {
      delete (globalThis as unknown as ConBridge).synergos;
    });
    const chip = (): string | null =>
      (fixture.nativeElement as HTMLElement).querySelector('.seller__seller-chip')?.textContent?.trim() ?? null;

    it('con sesión, el chip es el nombre del miembro', async () => {
      (globalThis as unknown as ConBridge).synergos = {
        member: { key: 'k-7', displayName: 'Tienda de Lucía', email: 'lucia@ejemplo.co', roles: ['seller'] },
      };
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();

      expect(chip()).toBe('Tienda de Lucía');
    });

    it('sin sesión, o sin host, no hay chip: no se inventa un vendedor', async () => {
      (globalThis as unknown as ConBridge).synergos = {};
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();
      expect(chip()).toBeNull();

      TestBed.resetTestingModule();
      delete (globalThis as unknown as ConBridge).synergos;
      await createComponent();
      expect(chip()).toBeNull();
    });
  });

  // ── render: panel + KPIs + secciones; los ejemplos, sólo con la marca ───────
  it('sin la base de la API no llama a nada y lo dice: caída, sin ejemplos (ADR 0137, CMS#196)', async () => {
    const red = vi.fn(() => Promise.reject(new Error('no debería llamarse')));
    vi.stubGlobal('fetch', red);
    await createComponent({});

    expect(red).not.toHaveBeenCalled();
    // Afirmaba `orders().length > 0` y `degraded()`: los pedidos de ejemplo como el camino normal (T006).
    expect(component.pedidos()).toEqual([]);
    expect(component.lecturas().ventas).toBe('caida');
    expect(component.muestras()).toBe(false);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('syn-console-shell syn-error-state')?.textContent).toContain(
      'No pudimos cargar esta sección.',
    );
  });

  it('con la marca de la demo, el panel enseña sus ejemplos —indicadores, cuatro secciones, la cola con su acción— y lo dice', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent(NEGOCIO_DEL_CMS, CON_MUESTRAS_DE_LA_CONSOLA);

    expect(component.view()).toBe('panel');
    expect(component.muestras()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('.seller__notice--warn')?.textContent?.trim()).toBe(
      'Estás viendo datos de ejemplo, no los de la tienda.',
    );

    // En Ventas, la banda de indicadores son las cuentas de la bandeja (T012).
    expect(component.consoleKpis().map((kpi) => kpi.id)).toEqual(['paid', 'preparing', 'shipped', 'delivered']);

    // The console shell mounts with the four secciones.
    const shell = fixture.debugElement.query(By.directive(ConsoleShellComponent));
    expect(shell).not.toBeNull();
    expect(component.consoleConfig().sections.map((section) => section.id)).toEqual([
      'ventas',
      'publicaciones',
      'devoluciones',
      'reputacion',
    ]);

    // Ventas queue from the samples, with row actions.
    // Los pedidos de ejemplo no traen actos: sólo su detalle.
    const paidRow = component.consoleRows().find((row) => row.pedido?.etapa === 'paid');
    expect(paidRow).toBeDefined();
    expect(component.rowActionsFor(paidRow!).map((action) => action.id)).toEqual(['detalle']);
  });

  it('sin la marca, con el CMS de hoy, nada se inventa: la cola es la del servidor, sin indicadores ni cartel', async () => {
    installMemoryStorage();
    installFakeServer({ 'GET /api/shop/seller/orders': bandejaDelCms() });
    await createComponent();

    expect(component.muestras()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('.seller__notice--warn')).toBeNull();
    // `GET seller/summary` no existe en el CMS de hoy (404): sin indicadores, en vez de los de ejemplo.
    expect(component.lecturas().resumen).toBe('caida');
    // En Ventas, los indicadores son las cuentas de la bandeja: las del servidor, no las de ejemplo.
    expect(component.consoleKpis().map((kpi) => kpi.value)).toEqual(['1', '0', '0', '0']);
    expect(component.consoleRows().map((row) => row.id)).toEqual(['saga-7f3a']);
  });

  // ── secciones: cola de devoluciones + aprobar RMA con el POST caído ──────────
  it('switches to devoluciones and resolves an RMA through the advance action', async () => {
    installMemoryStorage();
    // La cola la contesta el servidor; el POST que la resuelve, no (404).
    installFakeServer({
      'GET /api/shop/returns': {
        returns: [
          { rmaId: 'RMA-1', orderRef: 'ORD-9', product: 'Teclado', reason: 'Falla', openedAt: '2026-01-05', status: 'abierto' },
        ],
      },
    });
    await createComponent();

    component.onSectionChange('devoluciones');
    await flushMicrotasks();

    expect(component.activeSection()).toBe('devoluciones');
    expect(component.returns().length).toBeGreaterThan(0);

    const open = component.consoleRows().find((row) => row.rma?.status === 'abierto');
    expect(open).toBeDefined();
    expect(component.rowActionsFor(open!).map((action) => action.id)).toEqual([
      'approve',
      'reject',
    ]);

    component.onRowAction({ actionId: 'approve', row: open!, sectionId: 'devoluciones' });
    await flushMicrotasks();

    // Con el POST caído el RMA NO se mueve (#77). Este test afirmaba `'aprobado'`, que es lo
    // que el `catch` fabricaba haciendo eco de la intención de quien pulsó: el vendedor veía
    // la devolución resuelta y el servidor no se había enterado.
    const resolved = component.returns().find((rma) => rma.rmaId === open!.rma!.rmaId);
    expect(resolved?.status).toBe('abierto');
    expect(component.actionError()).toContain(open!.rma!.rmaId);
    // Y sigue accionable, que es la mitad que importa: una fila que se queda sin botones
    // después de un fallo deja al vendedor sin forma de reintentar.
    const sameRow = component.consoleRows().find((row) => row.rma?.rmaId === open!.rma!.rmaId);
    expect(component.rowActionsFor(sameRow!).map((a) => a.id)).toEqual(['approve', 'reject']);
  });

  // ── devoluciones: con el borde VIVO, el estado sale del servidor ─────────────
  it('takes the resolved RMA status from the server, not from the action pressed', async () => {
    installMemoryStorage();
    // Se pulsa `approve` y el servidor contesta `en-revision`, que el eco **no puede
    // producir** —fabricaba `aprobado` para approve y `rechazado` para reject— y que sí está
    // en el vocabulario (`SellerReturnStatus`). Es la regla 7: el fixture tiene que EXIGIR la
    // regla. Con `aprobado` no se distinguiría leer la respuesta de repetir la intención, y
    // con un valor de fuera del tipo —probé `devuelto`— lo que se mide es el normalizador.
    installFakeServer({
      'POST /api/shop/return/RMA-1/advance': { status: 'en-revision' },
      '/api/shop/returns': {
        returns: [
          { rmaId: 'RMA-1', orderRef: 'ORD-9', product: 'Teclado', reason: 'Falla', openedAt: '2026-01-05', status: 'abierto' },
        ],
      },
    });
    await createComponent();
    component.onSectionChange('devoluciones');
    await flushMicrotasks();

    const open = component.consoleRows().find((row) => row.rma?.rmaId === 'RMA-1');
    expect(open).toBeDefined();

    component.onRowAction({ actionId: 'approve', row: open!, sectionId: 'devoluciones' });
    await flushMicrotasks();

    expect(component.returns().find((r) => r.rmaId === 'RMA-1')?.status).toBe('en-revision');
    expect(component.actionError()).toBeNull();
  });

  // ── ventas: el envío NO avanza solo cuando el endpoint no está ───────────────
  it('leaves the order untouched and says so when the advance endpoint is missing', async () => {
    installMemoryStorage();
    // El pedido lo contesta el servidor; `POST order/{ref}/tracking/advance` no existe en el CMS (404).
    installFakeServer({ 'GET /api/shop/seller/orders': bandejaDelCms() });
    await createComponent();

    const paid = component.pedidos().find((pedido) => pedido.etapa === 'paid');
    expect(paid).toBeDefined();

    const row = component.consoleRows().find((entry) => entry.pedido?.orderRef === paid!.orderRef);
    // El servidor dice que tiene actos: se ofrece avanzar (los botones de cada acto llegan con T021).
    expect(component.rowActionsFor(row!).map((a) => a.id)).toEqual(['advance', 'detalle']);
    component.onRowAction({ actionId: 'advance', row: row!, sectionId: 'ventas' });
    await flushMicrotasks();

    // Este test se llamaba «advances a shipment one status forward when the endpoint is
    // missing» y afirmaba `'preparing'` — el título decía el defecto. `POST
    // order/{ref}/tracking/advance` NO EXISTE en el CMS, así que eso pasaba el 100 % de las
    // veces y el pedido se pintaba en camino sin haber salido.
    const advanced = component.pedidos().find((pedido) => pedido.orderRef === paid!.orderRef);
    expect(advanced?.etapa).toBe('paid');
    expect(component.actionError()).toContain('Por preparar');
    expect(component.actionError()).toContain(paid!.orderNumber);
    // Una escritura caída no es «datos de ejemplo»: ese cartel es de las lecturas, y sólo con la marca.
    expect(component.muestras()).toBe(false);
  });

  // ── publicar (SH-6): sin borde no hay recibo, y el borrador SOBREVIVE ────────
  it('does not fabricate a publish receipt, and keeps the draft, when the endpoint is missing', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    component.goTo('publicar');
    fixture.detectChanges();

    // Empty draft gates the first step; a filled draft opens the way.
    expect(component.wizardValidity()['datos']).toBe(false);
    const draft = {
      title: 'Teclado mecánico compacto 65%',
      brand: 'Synergos',
      category: 'Computación',
      description: 'Switches rojos, RGB, USB-C.',
      condition: 'new',
      images: ['https://cdn.example/keyboard.jpg'],
      amount: 259000,
      stock: 8,
    };
    component.onDraftChange(draft);
    expect(component.wizardValidity()['datos']).toBe(true);
    expect(component.wizardValidity()['precio']).toBe(true);

    const emitidos: unknown[] = [];
    component.productpublished.subscribe((r) => emitidos.push(r));

    await component.onPublish(draft);
    fixture.detectChanges();

    // Las CUATRO cosas que hacía el defecto, una por una (#77).
    expect(component.publishReceipt()).toBeNull();          // no hay «Publicación creada»
    expect(emitidos).toHaveLength(0);                       // ni evento al host con un id fantasma
    expect(component.listings().some((l) => l.title === draft.title)).toBe(false);
    expect(component.draft()['title']).toBe(draft.title);   // …y el borrador NO se borró
    expect(component.actionError()).toContain('borrador');
    expect(component.publishing()).toBe(false);
    expect(component.muestras()).toBe(false);
  });

  // ── publicar: con el borde VIVO, la referencia es la del servidor ────────────
  it('uses the receipt the server returned, with an id it could not have made up', async () => {
    installMemoryStorage();
    // `SKU-778899` no se parece a `PUB-<timestamp36>`: con un id de la misma forma, leer la
    // respuesta y fabricarla darían el mismo verde.
    installFakeServer({
      'POST /api/shop/seller/product': { productId: 'SKU-778899', status: 'en revisión' },
    });
    await createComponent();

    component.goTo('publicar');
    fixture.detectChanges();
    const draft = {
      title: 'Teclado mecánico compacto 65%',
      brand: 'Synergos',
      category: 'Computación',
      description: 'Switches rojos, RGB, USB-C.',
      condition: 'new',
      images: ['https://cdn.example/keyboard.jpg'],
      amount: 259000,
      stock: 8,
    };
    component.onDraftChange(draft);
    await component.onPublish(draft);
    fixture.detectChanges();

    const receipt = component.publishReceipt();
    expect(receipt?.productId).toBe('SKU-778899');
    expect(receipt?.status).toBe('en revisión');
    expect(receipt!.productId).not.toMatch(/^PUB-/);
    expect(component.actionError()).toBeNull();
  });

  // ── mensajes (SH-7): hilos degradados + responder agrega el mensaje ─────────
  /**
   * Lo que el CMS contesta al responder: el HILO entero (`ThreadDto`), con la respuesta al
   * final y el `from` como el correo del member. El id `msg_77` no lo puede producir el
   * respaldo de antes (`msg-<ts>`), y la fecha es la del SERVIDOR, no la de hoy (regla 7).
   */
  const HILO_RESPONDIDO = {
    threadId: 'th-1',
    contextRef: 'P-1',
    participants: ['comprador@correo.co', 'vendedor@tienda.co'],
    messages: [
      { messageId: 'msg_1', from: 'comprador@correo.co', body: '¿Tiene garantía?', sentAt: '2026-09-30T10:00:00+00:00' },
      { messageId: 'msg_77', from: 'vendedor@tienda.co', body: 'Sí, tiene garantía de 12 meses.', sentAt: '2026-09-30T15:00:00+00:00' },
    ],
    createdAt: '2026-09-30T10:00:00+00:00',
    lastMessageAt: '2026-09-30T15:00:00+00:00',
  };

  /**
   * Abre «Mensajes» y el primer hilo sin leer. Los hilos salen de la demo (la marca): la bandeja de hoy no se
   * lee —`GET messages` contesta `threadId` y no `id`, y eso lo arregla T031—. Lo que se prueba acá es la
   * RESPUESTA, que va al servidor.
   */
  async function abrirHiloSinLeer(): Promise<number> {
    component.goTo('mensajes');
    await flushMicrotasks();
    fixture.detectChanges();

    expect(component.threads().length).toBeGreaterThan(0);

    const unread = component.threads().find((thread) => thread.unread);
    expect(unread).toBeDefined();
    component.onThreadSelect(unread!);
    expect(component.activeThread()?.id).toBe(unread!.id);
    // Opening the thread clears its unread flag.
    expect(component.threads().find((thread) => thread.id === unread!.id)?.unread).toBe(false);
    return component.activeThread()!.messages.length;
  }

  it('loads buyer threads and appends the seller reply to the active thread', async () => {
    installMemoryStorage();
    installFakeServer({ 'POST /reply': HILO_RESPONDIDO });
    await createComponent(NEGOCIO_DEL_CMS, CON_MUESTRAS_DE_LA_CONSOLA);
    const before = await abrirHiloSinLeer();

    await component.onSendReply({
      thread: component.activeThread()!,
      body: 'Sí, tiene garantía de 12 meses.',
    });

    const active = component.activeThread()!;
    expect(active.messages.length).toBe(before + 1);
    // La respuesta que guardó el SERVIDOR: su id y su fecha, del final del hilo que devolvió.
    expect(active.messages.at(-1)).toEqual({
      id: 'msg_77',
      from: 'seller',
      body: 'Sí, tiene garantía de 12 meses.',
      date: '2026-09-30',
    });
    expect(component.actionError()).toBeNull();
    expect(component.sending()).toBe(false);
  });

  // ── UI#92: una respuesta que no salió se queda MARCADA, no con cara de enviada ─
  it('con el POST /reply caído la respuesta queda marcada en el hilo, se dice una vez y se reintenta', async () => {
    installMemoryStorage();
    installFakeServer({}); // nada contesta: el POST /reply sale 404
    await createComponent(NEGOCIO_DEL_CMS, CON_MUESTRAS_DE_LA_CONSOLA);
    const before = await abrirHiloSinLeer();

    await component.onSendReply({
      thread: component.activeThread()!,
      body: 'Sí, tiene garantía de 12 meses.',
    });
    fixture.detectChanges();

    const marcada = component.activeThread()!.messages.at(-1)!;
    expect(component.activeThread()!.messages.length).toBe(before + 1);
    // El texto no se pierde, pero no lleva fecha: sería el acuse que no existe.
    expect(marcada).toMatchObject({ from: 'seller', body: 'Sí, tiene garantía de 12 meses.', date: '', failed: true });
    const host = fixture.nativeElement as HTMLElement;
    expect(Array.from(host.querySelectorAll('[role="alert"]')).map((alerta) => alerta.textContent?.trim())).toEqual([
      'Tu respuesta NO se envió. Queda en el hilo para reintentarla.',
    ]);

    // Reintentar desde el hilo, ya con el borde arriba: la marcada se vuelve LA del servidor.
    installFakeServer({ 'POST /reply': HILO_RESPONDIDO });
    await component.retryReply(component.activeThread()!, marcada);

    const active = component.activeThread()!;
    expect(active.messages.length).toBe(before + 1);
    expect(active.messages.at(-1)).toEqual({
      id: 'msg_77',
      from: 'seller',
      body: 'Sí, tiene garantía de 12 meses.',
      date: '2026-09-30',
    });
    expect(component.actionError()).toBeNull();
  });

  // ── reputación cargando: esqueleto CON forma + aviso audible ────────────────
  it('reserves the reputation grid with a skeleton and still announces the load', async () => {
    installMemoryStorage();
    // A never-resolving fetch parks loadSummary() mid-flight → reputation() null.
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    await createComponent();

    expect(component.reputation()).toBeNull();

    const shell = fixture.debugElement.query(By.directive(ConsoleShellComponent));
    expect(shell).not.toBeNull();
    // ConsoleShellComponent is generic in TRow; only selectSection matters here.
    (shell.componentInstance as { selectSection(id: string): void }).selectSection('reputacion');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;

    // 1) The mould is the real grid: hero card + exactly three metric cards,
    //    reusing `seller__rep` / `seller__rep-card` so chrome and padding match.
    expect(host.querySelectorAll('.seller__rep-card--skeleton').length).toBe(
      component.repSkeletonCards.length + 1,
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

  // ══ Cada lectura dice lo que pasó (013-seller-operaciones, T006) ══════════════════════════════════════════════
  //
  // Sin sesión y sin permiso son de quien abre la consola: se dicen una vez, en lugar de las vistas. La caída es de una
  // lectura: la dice su superficie, con «Reintentar». Vacía es una respuesta. Y ninguna se tapa con ejemplos, aunque la
  // página tenga la marca de la demo.
  describe('lo que dice cada lectura (T006)', () => {
    const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
    const tituloDelAcceso = (): string | undefined =>
      host().querySelector('syn-empty-state.seller__acceso .syn-empty__title')?.textContent?.trim();

    it('sin sesión (401) la consola entera lo dice una vez, con el login de vuelta a esta página; la marca no lo tapa', async () => {
      const antes = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.history.replaceState(null, '', '/tienda/vendedor/?vista=panel#ventas');
      try {
        installStatus(401);
        await createComponent(NEGOCIO_DEL_CMS, CON_MUESTRAS_DE_LA_CONSOLA);

        expect(tituloDelAcceso()).toBe('Inicia sesión para atender la tienda.');
        const enlace = host().querySelector<HTMLAnchorElement>('syn-empty-state.seller__acceso a.syn-empty__action');
        expect(enlace?.textContent?.trim()).toBe('Iniciar sesión');
        const href = enlace?.getAttribute('href') ?? '';
        expect(href.startsWith('/account/login?returnUrl=')).toBe(true);
        expect(decodeURIComponent(href.slice('/account/login?returnUrl='.length))).toBe('/tienda/vendedor/?vista=panel#ventas');

        expect(host().querySelector('syn-console-shell')).toBeNull();
        expect(host().querySelector('.seller__notice--warn')).toBeNull();
        expect(component.pedidos()).toEqual([]);
      } finally {
        window.history.replaceState(null, '', antes);
      }
    });

    it('sin permiso (403) lo dice sin salida: la consola es del personal', async () => {
      installStatus(403);
      await createComponent();

      expect(tituloDelAcceso()).toBe('Esta consola es del personal de la tienda.');
      expect(host().querySelector('syn-empty-state.seller__acceso .syn-empty__action')).toBeNull();
      expect(host().querySelector('syn-console-shell')).toBeNull();

      // Tampoco por las otras vistas: el acceso es de la consola entera.
      component.goTo('mensajes');
      await flushMicrotasks();
      fixture.detectChanges();
      expect(host().querySelector('syn-message-center')).toBeNull();
      expect(tituloDelAcceso()).toBe('Esta consola es del personal de la tienda.');
    });

    it('una cola caída lo dice con «Reintentar» —no «Nada por aquí»—, y reintentar la vuelve a pedir', async () => {
      installStatus(500);
      await createComponent();

      const caida = host().querySelector('syn-console-shell syn-error-state');
      expect(caida?.textContent).toContain('No pudimos cargar esta sección.');
      expect(host().querySelector('syn-console-shell syn-empty-state')).toBeNull();

      installFakeServer({ 'GET /api/shop/seller/orders': bandejaDelCms() });
      caida!.querySelector<HTMLButtonElement>('button')!.click();
      await flushMicrotasks();
      fixture.detectChanges();

      expect(component.lecturas().ventas).toBe('leidas');
      expect(host().querySelector('syn-console-shell syn-error-state')).toBeNull();
      expect(component.consoleRows().map((row) => row.id)).toEqual(['saga-7f3a']);
    });

    it('Reputación sin resumen dice que no se pudo —no un esqueleto para siempre— y su «Reintentar» vuelve a pedirlo', async () => {
      installFakeServer({ 'GET /api/shop/seller/orders': bandejaDelCms() });
      await createComponent();
      const shell = fixture.debugElement.query(By.directive(ConsoleShellComponent));
      (shell.componentInstance as { selectSection(id: string): void }).selectSection('reputacion');
      fixture.detectChanges();

      // La que está a la vista es Reputación, sin tabla: si el shell volviera a Ventas, la caída del resumen se leería
      // como la de la cola de pedidos.
      expect(host().querySelector('.syn-console__nav-btn.is-active')?.textContent).toContain('Reputación');
      expect(host().querySelector('syn-console-shell table')).toBeNull();
      expect(host().querySelector('.seller__rep-card--skeleton')).toBeNull();
      const caida = host().querySelector('syn-error-state');
      expect(caida?.textContent).toContain('No pudimos cargar esta sección.');
      const reintentar = caida!.querySelector<HTMLButtonElement>('button')!;
      expect(reintentar.textContent?.trim()).toBe('Reintentar');

      const red = installFakeServer({});
      reintentar.click();
      await flushMicrotasks();
      expect(red.mock.calls.map(([url]) => String(url))).toContain('/api/shop/seller/summary');
    });

    it('Mensajes que no se pueden leer lo dicen —no «No tienes mensajes»—, también con la forma de hoy de GET messages', async () => {
      installFakeServer({ 'GET /api/shop/messages': { threads: [HILO_DEL_CMS] } });
      await createComponent();
      component.goTo('mensajes');
      await flushMicrotasks();
      fixture.detectChanges();

      expect(component.lecturas().mensajes).toBe('caida');
      expect(host().querySelector('syn-message-center')).toBeNull();
      expect(host().querySelector('syn-error-state')?.textContent).toContain('No pudimos cargar esta sección.');
    });

    it('la cola que el servidor contesta sin pedidos dice que no hay, sin ejemplos aunque la página tenga la marca', async () => {
      installFakeServer({ 'GET /api/shop/seller/orders': bandejaDelCms([]) });
      await createComponent(NEGOCIO_DEL_CMS, CON_MUESTRAS_DE_LA_CONSOLA);

      expect(component.lecturas().ventas).toBe('vacia');
      expect(component.pedidos()).toEqual([]);
      expect(host().querySelector('syn-console-shell syn-empty-state')?.textContent).toContain(
        'No hay pedidos pagados en esta etapa.',
      );
    });
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
      expect(component.consoleRows().map((row) => row.id)).toEqual(['pta-enviado']);
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
      expect(component.consoleRows().map((row) => row.id)).toEqual(['pta-2']);
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
      expect(component.consoleRows()[0].cells['fecha']).toMatch(/^21 .*2026, 01:30$/);

      TestBed.resetTestingModule();
      servidor(() => bandejaDelCms([pedido('pta-1', 'paid', { fecha: '2026-10-20T23:30:00Z' })]));
      await createComponent({ ...NEGOCIO_DEL_CMS, zonaHoraria: 'America/Bogota' });
      expect(component.consoleRows()[0].cells['fecha']).toMatch(/^20 .*2026, 18:30$/);
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

      component.onFilterChange('preparing');
      component.onFilterChange('shipped');
      pendientes.get('shipped')!(json(200, bandejaDelCms([pedido('pta-enviado', 'shipped')])));
      await asentarYPintar();
      pendientes.get('preparing')!(json(200, bandejaDelCms([pedido('pta-preparando', 'preparing')])));
      await asentarYPintar();

      expect(component.consoleRows().map((row) => row.id)).toEqual(['pta-enviado']);
    });
  });
});
