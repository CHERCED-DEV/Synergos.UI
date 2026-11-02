import { By, CON_MUESTRAS_DE_LA_CONSOLA, ComponentFixture, ConsolaPanelComponent, ConsoleShellComponent, HILO_DEL_CMS, NEGOCIO_DEL_CMS, SellerElementComponent, bandejaDelCms, flushMicrotasks, installFakeServer, installStatus, prepararLaConsola } from '../arnes-de-la-consola.test';

/**
 * La consola montada entera, por el estado: lo que dice cada lectura (014-despiece-tienda, T013). Las pruebas son las
 * de la spec única de antes, repartidas por el componente que ejercitan, con el arnés común.
 */
describe('La consola: el estado', () => {
  let fixture: ComponentFixture<SellerElementComponent>;
  const { consola, createComponent } = prepararLaConsola((montado) => {
    fixture = montado;
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
        expect(consola().estado.pedidos()).toEqual([]);
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
      consola().estado.goTo('mensajes');
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

      expect(consola().estado.lecturas().ventas).toBe('leidas');
      expect(host().querySelector('syn-console-shell syn-error-state')).toBeNull();
      expect(consola().vista(ConsolaPanelComponent).consoleRows().map((row) => row.id)).toEqual(['saga-7f3a']);
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
      consola().estado.goTo('mensajes');
      await flushMicrotasks();
      fixture.detectChanges();

      expect(consola().estado.lecturas().mensajes).toBe('caida');
      expect(host().querySelector('syn-message-center')).toBeNull();
      expect(host().querySelector('syn-error-state')?.textContent).toContain('No pudimos cargar esta sección.');
    });

    it('la cola que el servidor contesta sin pedidos dice que no hay, sin ejemplos aunque la página tenga la marca', async () => {
      installFakeServer({ 'GET /api/shop/seller/orders': bandejaDelCms([]) });
      await createComponent(NEGOCIO_DEL_CMS, CON_MUESTRAS_DE_LA_CONSOLA);

      expect(consola().estado.lecturas().ventas).toBe('vacia');
      expect(consola().estado.pedidos()).toEqual([]);
      expect(host().querySelector('syn-console-shell syn-empty-state')?.textContent).toContain(
        'No hay pedidos pagados en esta etapa.',
      );
    });
  });
});
