import { By, ComponentFixture, StorefrontElementComponent, installMemoryStorage, prepararLaTienda } from '../../arnes-de-la-tienda.test';

/**
 * La tienda montada entera, por el inicio: la tienda vacía y el héroe que compone el CMS (014-despiece-tienda, T013). Las
 * pruebas son las de la spec única de antes, repartidas por el componente que ejercitan, con el arnés común.
 */
describe('La tienda: el inicio', () => {
  let fixture: ComponentFixture<StorefrontElementComponent>;
  let component: StorefrontElementComponent;
  const { tienda, createComponent } = prepararLaTienda((montado, instancia) => {
    fixture = montado;
    component = instancia;
  });

  it('starts on the home with an empty cart and degraded mock rails (empty case)', async () => {
    installMemoryStorage();
    // Offline → mock catalogue; still a valid empty cart.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    expect(component).toBeTruthy();
    expect(tienda().navegacion.view()).toBe('home');
    expect(tienda().carrito.cartCount()).toBe(0);
    expect(tienda().carrito.hasCart()).toBe(false);
    // Mock catalogue loaded → home rails present, degradation flagged.
    expect(tienda().catalogo.products().length).toBeGreaterThan(0);
    expect(tienda().catalogo.deals().length).toBeGreaterThan(0);
    expect(tienda().catalogo.homeCategories().length).toBeGreaterThan(0);
    expect(component.degraded()).toBe(true);
  });

  // ── config: el hero se COMPONE desde el CMS, no viene baked ──────────────────
  // El emitter del CMS no manda atributos sueltos: fusiona todo en UN `config`
  // JSON. Si `sanitizeConfig` deja de listar heading/subheading, las claves
  // desaparecen EN SILENCIO (sin error ni warning) y el <h1> vuelve al texto
  // hardcodeado. Este test monta por esa misma ruta —config como string JSON—
  // para que esa regresión salga en rojo.
  it('pinta en el hero el heading y el subheading que llegan en el JSON de config', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    fixture.componentRef.setInput(
      'config',
      JSON.stringify({ heading: 'X', subheading: 'Y' }),
    );
    fixture.detectChanges();

    expect(component.heading()).toBe('X');
    expect(component.subheading()).toBe('Y');

    const title = fixture.debugElement.query(By.css('.storefront__hero-title'));
    const sub = fixture.debugElement.query(By.css('.storefront__hero-sub'));
    expect(title.nativeElement.textContent.trim()).toBe('X');
    expect(sub.nativeElement.textContent.trim()).toBe('Y');
  });

  // ── config: sin CMS el hero queda IDÉNTICO (el cambio es puramente aditivo) ──
  it('cae a los textos por defecto del hero cuando el CMS no manda nada', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    const title = fixture.debugElement.query(By.css('.storefront__hero-title'));
    const sub = fixture.debugElement.query(By.css('.storefront__hero-sub'));
    expect(title.nativeElement.textContent.trim()).toBe('Todo lo que buscas, en un solo lugar');
    expect(sub.nativeElement.textContent.trim()).toBe(
      'Envíos a todo el país · hasta 36 cuotas · compra protegida',
    );
  });
});
