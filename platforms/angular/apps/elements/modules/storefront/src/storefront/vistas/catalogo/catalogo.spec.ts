import { ComponentFixture, StorefrontElementComponent, TiendaCatalogoComponent, flushMicrotasks, installMemoryStorage, prepararLaTienda } from '../../arnes-de-la-tienda.test';

/**
 * La tienda montada entera, por el catálogo: comparar (014-despiece-tienda, T013). Las
 * pruebas son las de la spec única de antes, repartidas por el componente que ejercitan, con el arnés común.
 */
describe('La tienda: el catálogo', () => {
  let fixture: ComponentFixture<StorefrontElementComponent>;
  const { tienda, createComponent } = prepararLaTienda((montado) => {
    fixture = montado;
  });

  // ── SH-14 comparar (#30) ─────────────────────────────────────────────────────
  //
  // Se PULSA el botón: lo que esta HU entrega es que comparar sea ALCANZABLE desde
  // el catálogo, y un spec que llamara a `toggleCompare(product)` pasaría en verde
  // con el botón quitado (regla 5 de CLAUDE.md).
  describe('comparar', () => {
    const botones = (): HTMLButtonElement[] =>
      Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.storefront__cmp button'),
      ) as HTMLButtonElement[];

    it('marca dos productos desde el catálogo y la ficha se alinea por atributo', async () => {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();
      // El catálogo vive en la PLP, no en el inicio.
      tienda().navegacion.goToPlp();
      await flushMicrotasks();
      fixture.detectChanges();

      expect(botones().length).toBeGreaterThan(1);
      expect(fixture.nativeElement.querySelector('.syn-compare__table')).toBeNull();

      botones()[0].click();
      botones()[1].click();
      fixture.detectChanges();

      expect(tienda().vista(TiendaCatalogoComponent).compare.count()).toBe(2);
      const filas = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.syn-compare__attr-label'),
      ).map((el) => el.textContent?.trim());
      expect(filas).toContain('Marca');
      expect(filas).toContain('Condición');
    });

    it('un producto sin reseñas NO trae fila de calificación: nadie la dio', async () => {
      installMemoryStorage();
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
      await createComponent();
      tienda().navegacion.goToPlp();
      await flushMicrotasks();

      // Se fuerzan los dos candidatos a «sin reseñas»: el catálogo sembrado trae
      // valoraciones, y lo que se prueba es que un 0 no se escriba como «0,0».
      tienda().catalogo.products.set(
        tienda()
          .catalogo.products()
          .slice(0, 2)
          .map((product) => ({ ...product, rating: 0, reviewCount: 0 })),
      );
      fixture.detectChanges();

      botones()[0].click();
      botones()[1].click();
      fixture.detectChanges();

      const filas = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.syn-compare__attr-label'),
      ).map((el) => el.textContent?.trim());
      expect(filas).not.toContain('Calificación');
    });
  });
});
