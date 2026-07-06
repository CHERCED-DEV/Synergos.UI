import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ConsoleShellComponent } from '@synergos/shells';
import { SellerApiClient } from './seller-api.client';
import { SellerElementComponent } from './seller';

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
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
  }
}

// Smoke suite (directiva: mínimos, no exhaustivo) — render + secciones + degradación.
describe('SellerElementComponent (consola sobre SH-5/6/7)', () => {
  let fixture: ComponentFixture<SellerElementComponent>;
  let component: SellerElementComponent;

  async function createComponent(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [SellerElementComponent],
      providers: [provideZonelessChangeDetection(), SellerApiClient],
    }).compileComponents();

    fixture = TestBed.createComponent(SellerElementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    // Summary + orders load in the constructor; let them settle.
    await flushMicrotasks();
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  // ── render: panel + KPIs + secciones + degradación visible ──────────────────
  it('renders the panel with KPIs, the four sections and a visible degradation flag', async () => {
    installMemoryStorage();
    // Offline → every endpoint degrades to mock data.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    expect(component).toBeTruthy();
    expect(component.view()).toBe('panel');
    expect(component.degraded()).toBe(true);

    // KPIs from the (degraded) summary, pre-formatted for SH-5.
    expect(component.consoleKpis().length).toBeGreaterThan(0);
    expect(component.consoleKpis().map((kpi) => kpi.id)).toContain('ventas');

    // The console shell mounts with the four secciones.
    const shell = fixture.debugElement.query(By.directive(ConsoleShellComponent));
    expect(shell).not.toBeNull();
    expect(component.consoleConfig().sections.map((section) => section.id)).toEqual([
      'ventas',
      'publicaciones',
      'devoluciones',
      'reputacion',
    ]);

    // Ventas queue populated from the API (mock degradado) with row actions.
    expect(component.orders().length).toBeGreaterThan(0);
    expect(component.consoleRows().length).toBeGreaterThan(0);
    const paidRow = component.consoleRows().find((row) => row.order?.status === 'paid');
    expect(paidRow).toBeDefined();
    expect(component.rowActionsFor(paidRow!).map((action) => action.id)).toEqual(['advance']);
  });

  // ── secciones: cola de devoluciones + aprobar RMA (degradado) ────────────────
  it('switches to devoluciones and resolves an RMA through the advance action', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
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

    const resolved = component.returns().find((rma) => rma.rmaId === open!.rma!.rmaId);
    expect(resolved?.status).toBe('aprobado');
    // The action buttons disappear once resolved.
    const resolvedRow = component.consoleRows().find((row) => row.rma?.rmaId === open!.rma!.rmaId);
    expect(component.rowActionsFor(resolvedRow!)).toHaveLength(0);
  });

  // ── ventas: avanzar envío degrada a la escalera local coherente ─────────────
  it('advances a shipment one status forward when the endpoint is missing', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const paid = component.orders().find((order) => order.status === 'paid');
    expect(paid).toBeDefined();

    const row = component.consoleRows().find((entry) => entry.order?.orderNumber === paid!.orderNumber);
    component.onRowAction({ actionId: 'advance', row: row!, sectionId: 'ventas' });
    await flushMicrotasks();

    const advanced = component.orders().find((order) => order.orderNumber === paid!.orderNumber);
    expect(advanced?.status).toBe('preparing');
    expect(component.degraded()).toBe(true);
  });

  // ── publicar (SH-6): draft válido → publish degradado → recibo ───────────────
  it('publishes a product through the wizard with a degraded receipt', async () => {
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

    await component.onPublish(draft);
    fixture.detectChanges();

    const receipt = component.publishReceipt();
    expect(receipt).not.toBeNull();
    expect(receipt!.productId).toMatch(/^PUB-/);
    expect(component.publishing()).toBe(false);
    expect(component.degraded()).toBe(true);
  });

  // ── mensajes (SH-7): hilos degradados + responder agrega el mensaje ─────────
  it('loads buyer threads and appends the seller reply to the active thread', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

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

    const before = component.activeThread()!.messages.length;
    await component.onSendReply({
      thread: component.activeThread()!,
      body: 'Sí, tiene garantía de 12 meses.',
    });

    const active = component.activeThread()!;
    expect(active.messages.length).toBe(before + 1);
    expect(active.messages[active.messages.length - 1].from).toBe('seller');
    expect(component.sending()).toBe(false);
  });
});
