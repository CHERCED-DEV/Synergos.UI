import { ComponentFixture, ConsolaPublicarComponent, SellerElementComponent, installFakeServer, installMemoryStorage, prepararLaConsola } from '../../arnes-de-la-consola.test';

/**
 * La consola montada entera, por publicar: el recibo del servidor y el borrador que sobrevive (014-despiece-tienda, T013). Las pruebas son las
 * de la spec única de antes, repartidas por el componente que ejercitan, con el arnés común.
 */
describe('La consola: publicar', () => {
  let fixture: ComponentFixture<SellerElementComponent>;
  let component: SellerElementComponent;
  const { consola, createComponent } = prepararLaConsola((montado, instancia) => {
    fixture = montado;
    component = instancia;
  });

  // ── publicar (SH-6): sin borde no hay recibo, y el borrador SOBREVIVE ────────
  it('does not fabricate a publish receipt, and keeps the draft, when the endpoint is missing', async () => {
    installMemoryStorage();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    await createComponent();

    consola().estado.goTo('publicar');
    fixture.detectChanges();

    // Empty draft gates the first step; a filled draft opens the way.
    expect(consola().vista(ConsolaPublicarComponent).wizardValidity()['datos']).toBe(false);
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
    consola().vista(ConsolaPublicarComponent).onDraftChange(draft);
    expect(consola().vista(ConsolaPublicarComponent).wizardValidity()['datos']).toBe(true);
    expect(consola().vista(ConsolaPublicarComponent).wizardValidity()['precio']).toBe(true);

    const emitidos: unknown[] = [];
    component.productpublished.subscribe((r) => emitidos.push(r));

    await consola().vista(ConsolaPublicarComponent).onPublish(draft);
    fixture.detectChanges();

    // Las CUATRO cosas que hacía el defecto, una por una (#77).
    expect(consola().vista(ConsolaPublicarComponent).publishReceipt()).toBeNull();          // no hay «Publicación creada»
    expect(emitidos).toHaveLength(0);                       // ni evento al host con un id fantasma
    expect(consola().estado.listings().some((l) => l.title === draft.title)).toBe(false);
    expect(consola().vista(ConsolaPublicarComponent).draft()['title']).toBe(draft.title);   // …y el borrador NO se borró
    expect(consola().estado.actionError()).toContain('borrador');
    expect(consola().vista(ConsolaPublicarComponent).publishing()).toBe(false);
    expect(consola().estado.muestras()).toBe(false);
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

    consola().estado.goTo('publicar');
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
    consola().vista(ConsolaPublicarComponent).onDraftChange(draft);
    await consola().vista(ConsolaPublicarComponent).onPublish(draft);
    fixture.detectChanges();

    const receipt = consola().vista(ConsolaPublicarComponent).publishReceipt();
    expect(receipt?.productId).toBe('SKU-778899');
    expect(receipt?.status).toBe('en revisión');
    expect(receipt!.productId).not.toMatch(/^PUB-/);
    expect(consola().estado.actionError()).toBeNull();
  });
});
