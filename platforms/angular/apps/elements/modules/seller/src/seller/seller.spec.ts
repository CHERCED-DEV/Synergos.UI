import { ComponentFixture, NEGOCIO_DEL_CMS, SellerElementComponent, TestBed, prepararLaConsola } from './arnes-de-la-consola.test';

/**
 * La consola montada entera, por el elemento: el subtítulo, quién atiende y una vista por página (014-despiece-tienda, T013). Las pruebas son las
 * de la spec única de antes, repartidas por el componente que ejercitan, con el arnés común.
 */
describe('La consola: el elemento', () => {
  let fixture: ComponentFixture<SellerElementComponent>;
  const { consola, createComponent } = prepararLaConsola((montado) => {
    fixture = montado;
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

  // ── 014-despiece-tienda, I3: una vista de la consola por página ─────────────────────────────────────────
  describe('una vista por página (I3)', () => {
    const RUTAS = [
      { vista: 'panel', url: '/tienda/vender/' },
      { vista: 'mensajes', url: '/tienda/vender/mensajes/' },
    ];

    it('abre la vista que el editor eligió y enlaza las otras con su página', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent({ ...NEGOCIO_DEL_CMS, vista: 'mensajes', rutas: RUTAS });

      expect(consola().estado.view()).toBe('mensajes');
      expect(consola().estado.urlDe('panel')).toBe('/tienda/vender/');
      // La suya y la que no tiene página se abren aquí.
      expect(consola().estado.urlDe('mensajes')).toBe('');
      expect(consola().estado.urlDe('publicar')).toBe('');
      const enlace = (fixture.nativeElement as HTMLElement).querySelector('.seller__nav a[href="/tienda/vender/"]');
      expect(enlace?.textContent?.trim()).toBe('Panel');
    });

    it('sin vista elegida abre el panel, como antes', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();

      expect(consola().estado.view()).toBe('panel');
    });
  });
});
