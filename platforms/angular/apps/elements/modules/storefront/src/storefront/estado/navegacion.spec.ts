import { ComponentFixture, NEGOCIO_DEL_CMS, StorefrontElementComponent, prepararLaTienda } from '../arnes-de-la-tienda.test';

/**
 * La tienda montada entera, por la navegación: una vista por página (I3) (014-despiece-tienda, T013). Las
 * pruebas son las de la spec única de antes, repartidas por el componente que ejercitan, con el arnés común.
 */
describe('La tienda: la navegación', () => {
  let fixture: ComponentFixture<StorefrontElementComponent>;
  const { tienda, createComponent } = prepararLaTienda((montado) => {
    fixture = montado;
  });

  // ── 014-despiece-tienda, I3: Umbraco compone la tienda, una vista por página ──────────────────────────────
  //
  // El editor elige en el bloque qué parte de la tienda es la página (`vista`), y el CMS dice en qué página vive
  // cada una (`rutas`). Una vista que vive en otra página se abre yendo ahí; la suya y la que no tiene página, aquí.
  describe('una vista por página (I3)', () => {
    const RUTAS = [
      { vista: 'inicio', url: '/tienda/' },
      { vista: 'catalogo', url: '/tienda/catalogo/' },
      { vista: 'ficha', url: '/tienda/producto/' },
      { vista: 'carrito', url: '/tienda/carrito/' },
      { vista: 'confirmacion', url: '/tienda/confirmacion/' },
    ];

    it('abre la vista que el editor eligió para la página', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent({ ...NEGOCIO_DEL_CMS, vista: 'carrito', rutas: RUTAS });
      fixture.detectChanges();

      expect(tienda().navegacion.view()).toBe('cart');
    });

    it('enlaza la página de cada vista que vive en otra, con lo que esa vista necesita', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent({ ...NEGOCIO_DEL_CMS, vista: 'carrito', rutas: RUTAS });
      const navegacion = tienda().navegacion;

      expect(navegacion.urlDe('plp')).toBe('/tienda/catalogo/');
      expect(navegacion.urlDe('pdp', 'P-A')).toBe('/tienda/producto/#/storefront/p/P-A');
      expect(navegacion.urlDe('confirmation', 'pta-1')).toBe('/tienda/confirmacion/?compra=pta-1');
      // La suya, la que no tiene página y la confirmación sin compra se abren aquí.
      expect(navegacion.urlDe('cart')).toBe('');
      expect(navegacion.urlDe('account')).toBe('');
      expect(navegacion.urlDe('confirmation')).toBe('');

      fixture.detectChanges();
      const enlace = (fixture.nativeElement as HTMLElement).querySelector('.storefront__nav a[href="/tienda/catalogo/"]');
      expect(enlace?.textContent?.trim()).toBe('Tienda');
    });

    it('sin rutas, todo se abre en la página, como antes', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();

      expect(tienda().navegacion.urlDe('plp')).toBe('');
      tienda().navegacion.alPulsar('plp');
      expect(tienda().navegacion.view()).toBe('plp');
    });
  });
});
