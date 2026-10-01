import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Product, ProductListResponse } from '@synergos/contracts';
import { ProductGridComponent } from './product-grid';

/**
 * Paginar en la grilla: la región de resultados existe ANTES del cambio y el foco no se pierde (#82).
 *
 * El elemento no tenía spec. Lo que había: «Siguiente» → `currentPage` → el `effect` pone
 * `loading` → el `@if (!loading() && !apiError())` destruía la lista, la paginación y el
 * `<p aria-live>` con el número de página, y los recreaba con la página nueva — la región nacía
 * con su mensaje, y el botón que tenía el foco dejaba de existir. Un spec que buscara
 * `[aria-live]` después de la carga lo encontraba igual: por eso acá se compara la IDENTIDAD de
 * los nodos antes y después de paginar.
 */
function producto(n: number): Product {
  return {
    id: `p${n}`,
    sku: `SKU-${n}`,
    name: `Producto ${n}`,
    slug: `producto-${n}`,
    description: '',
    price: 10000 * n,
    currency: 'COP',
    images: [],
    category: { id: 'c', alias: 'c', name: 'Categoría', slug: 'c' },
    inStock: true,
  } as Product;
}

function pagina(page: number, totalPages = 3, total = 30): ProductListResponse {
  return {
    items: [producto(page * 10 + 1), producto(page * 10 + 2)],
    total,
    page,
    pageSize: 10,
    totalPages,
  };
}

describe('product-grid — resultados y paginación (#82)', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ProductGridComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Con el reset en un `finally`: si `verify()` lanza —una petición sin responder, que es lo
    // que deja un test que falló a mitad—, el TestBed quedaba instanciado y TODOS los tests
    // siguientes del fichero caían en rojo por eso, tapando cuál mutación rompió qué.
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  function montar() {
    const fixture = TestBed.createComponent(ProductGridComponent);
    fixture.detectChanges();
    responder(fixture, pagina(1));
    return fixture;
  }

  function responder(fixture: ReturnType<typeof TestBed.createComponent<ProductGridComponent>>, cuerpo: ProductListResponse): void {
    http.expectOne((req) => req.url === '/api/shop/products').flush(cuerpo);
    fixture.detectChanges();
  }

  const estado = (fixture: { nativeElement: HTMLElement }): HTMLElement =>
    fixture.nativeElement.querySelector('.product-grid__results-status') as HTMLElement;

  const boton = (fixture: { nativeElement: HTMLElement }, cual: 'prev' | 'next'): HTMLButtonElement =>
    fixture.nativeElement.querySelector(`.product-grid__page-${cual} button`) as HTMLButtonElement;

  it('la región de resultados existe desde el primer render, vacía, fuera de todo bloque', () => {
    const fixture = TestBed.createComponent(ProductGridComponent);
    fixture.detectChanges();
    // Todavía cargando: la región ya está, y calla.
    expect(estado(fixture)).not.toBeNull();
    expect(estado(fixture).getAttribute('role')).toBe('status');
    expect(estado(fixture).textContent?.trim()).toBe('');
    http.expectOne((req) => req.url === '/api/shop/products').flush(pagina(1));
    fixture.detectChanges();
    // La primera página es el contenido de la carga, no un evento: no se anuncia.
    expect(estado(fixture).textContent?.trim()).toBe('');
  });

  it('paginar NO destruye la región ni la paginación, y el resultado se dice al llegar', () => {
    const fixture = montar();
    const region = estado(fixture);
    const siguiente = boton(fixture, 'next');

    siguiente.click();
    fixture.detectChanges();
    // Cargando: los mismos nodos siguen ahí, y la región pasa por vacío.
    expect(estado(fixture)).toBe(region);
    expect(boton(fixture, 'next')).toBe(siguiente);
    expect(region.textContent?.trim()).toBe('');

    responder(fixture, pagina(2));
    expect(estado(fixture)).toBe(region);
    expect(region.textContent?.trim()).toBe('30 products · Page 2 of 3');
    expect(boton(fixture, 'next')).toBe(siguiente);
  });

  it('el número de página visible ya NO es una región viva: se diría dos veces', () => {
    const fixture = montar();
    // Las de `syn-button` no cuentan: son SUYAS, persistentes y vacías en reposo (la forma
    // correcta, regla 42). Se mira la plantilla de la grilla.
    const vivas = Array.from(
      fixture.nativeElement.querySelectorAll(
        '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]',
      ) as NodeListOf<HTMLElement>,
    ).filter((nodo) => !nodo.closest('syn-button'));
    expect(vivas).toEqual([estado(fixture)]);
    expect(fixture.nativeElement.querySelector('.product-grid__pagination-status')?.hasAttribute('aria-live')).toBe(false);
  });

  it('el foco se queda en el botón pulsado mientras carga la página nueva', () => {
    const fixture = montar();
    const siguiente = boton(fixture, 'next');
    siguiente.focus();
    siguiente.click();
    fixture.detectChanges();
    expect(document.activeElement).toBe(siguiente);
    responder(fixture, pagina(2));
    expect(document.activeElement).toBe(siguiente);
  });

  it('al llegar a la última página «Siguiente» se deshabilita, y el foco pasa a «Anterior»', () => {
    const fixture = montar();
    boton(fixture, 'next').click();
    fixture.detectChanges();
    responder(fixture, pagina(2));

    const siguiente = boton(fixture, 'next');
    siguiente.focus();
    siguiente.click();
    fixture.detectChanges();
    responder(fixture, pagina(3));

    expect(siguiente.disabled).toBe(true);
    expect(document.activeElement).toBe(boton(fixture, 'prev'));
    expect(estado(fixture).textContent?.trim()).toBe('30 products · Page 3 of 3');
  });

  it('una búsqueda sin resultados se anuncia; y la misma cifra dos veces vuelve a pasar por vacío', () => {
    const fixture = montar();
    const buscador = fixture.nativeElement.querySelector('.product-grid__search') as HTMLInputElement | null;
    // Sin `showFilters` no hay buscador: se busca por el método que el input llama.
    const buscar = (texto: string): void => {
      const evento = { target: { value: texto } } as unknown as Event;
      fixture.componentInstance.onSearch(evento);
      fixture.detectChanges();
    };
    expect(buscador).toBeNull();

    buscar('zzz');
    expect(estado(fixture).textContent?.trim()).toBe('');
    responder(fixture, { items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 });
    expect(estado(fixture).textContent?.trim()).toBe('No products found.');

    buscar('zz');
    expect(estado(fixture).textContent?.trim()).toBe('');
    responder(fixture, { items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 });
    expect(estado(fixture).textContent?.trim()).toBe('No products found.');
  });

  // ── #87, visto de paso: el buscador pide al servidor en CADA tecla ─────────────────
  // Lo que se mide primero no es el debounce sino lo que puede salir MAL: dos búsquedas en
  // vuelo, y la respuesta de la vieja llegando la última. Sin cancelar, la lista pinta los
  // resultados de «a» con «au» escrito en el buscador.
  it('la respuesta de una búsqueda VIEJA no pisa a la nueva', () => {
    const fixture = montar();
    const buscar = (texto: string): void => {
      fixture.componentInstance.onSearch({ target: { value: texto } } as unknown as Event);
      fixture.detectChanges();
    };
    const nombres = (): string[] => fixture.componentInstance.products().map((p) => p.name);

    buscar('a');
    buscar('au');
    const [vieja, nueva] = http.match((req) => req.url === '/api/shop/products');
    expect(nueva.request.params.get('search')).toBe('au');

    nueva.flush({ items: [{ ...producto(7), name: 'Audífonos' }], total: 1, page: 1, pageSize: 10, totalPages: 1 });
    // Una petición cancelada no se puede responder: si se canceló, ya no hay carrera.
    if (!vieja.cancelled) {
      vieja.flush({ items: [{ ...producto(8), name: 'Arroz' }], total: 1, page: 1, pageSize: 10, totalPages: 1 });
    }
    fixture.detectChanges();

    expect(nombres()).toEqual(['Audífonos']);
  });
});
