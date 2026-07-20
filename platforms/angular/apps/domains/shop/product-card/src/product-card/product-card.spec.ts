import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Product } from '@synergos/contracts';
import { ProductCardComponent } from './product-card';

/** Producto mínimo válido; cada prueba sobreescribe solo lo que le importa. */
function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'P-1',
    sku: 'SKU-1',
    name: 'Silla Nórdica',
    slug: 'silla-nordica',
    description: '',
    price: 49000,
    currency: 'COP',
    images: [{ src: 'https://cdn.local/silla.jpg', alt: 'Silla', order: 0 }],
    category: { id: 'C-1', name: 'Muebles', slug: 'muebles' },
    inStock: true,
    ...overrides,
  };
}

describe('ProductCardComponent', () => {
  let fixture: ComponentFixture<ProductCardComponent>;
  let component: ProductCardComponent;

  const query = (selector: string): Element | null =>
    fixture.nativeElement.querySelector(selector) as Element | null;

  const settle = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductCardComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ── (1) El @else: el marco de media se pinta con foto y SIN foto ───────────
  // Es el arreglo principal. Si el marco desaparece cuando no hay foto, las
  // tarjetas de una grilla miden distinto: la grilla harapienta.
  describe('marco de media', () => {
    it('pinta la foto cuando el producto trae imagen', async () => {
      component.product.set(makeProduct());
      await settle();

      expect(query('.product-card__image')).toBeTruthy();
      expect(query('.product-card__img')).toBeTruthy();
      expect(query('.product-card__placeholder')).toBeNull();
    });

    it('pinta el MARCO y el plato con monograma cuando el producto NO trae imagen', async () => {
      component.product.set(makeProduct({ images: [] }));
      await settle();

      expect(query('.product-card__image')).toBeTruthy();
      expect(query('.product-card__img')).toBeNull();

      const placeholder = query('.product-card__placeholder');
      expect(placeholder).toBeTruthy();
      expect(placeholder?.textContent?.trim()).toBe('SN');
    });

    it('el plato es decorativo: no duplica el nombre para el lector de pantalla', async () => {
      component.product.set(makeProduct({ images: [] }));
      await settle();

      expect(query('.product-card__placeholder')?.getAttribute('aria-hidden')).toBe('true');
    });

    it('cae al plato si la foto falla al cargar', async () => {
      component.product.set(makeProduct());
      await settle();
      const img = query('.product-card__img');
      expect(img).toBeTruthy();

      // Evento real sobre el <img>: así se prueba también el binding (error),
      // no solo el método que hay detrás.
      img?.dispatchEvent(new Event('error'));
      await settle();

      expect(query('.product-card__image')).toBeTruthy();
      expect(query('.product-card__img')).toBeNull();
      expect(query('.product-card__placeholder')).toBeTruthy();
    });

    // El orden que importa, y que el test de arriba NO ejercía: el evento `error`
    // de la foto vieja aterriza DESPUÉS de haber cambiado de producto. Con el
    // handler leyendo la señal en vez de recibir el src, esto sacrificaba la foto
    // BUENA del producto nuevo.
    it('un error TARDÍO de la foto anterior no sacrifica la del producto nuevo', async () => {
      component.product.set(makeProduct());
      await settle();
      const srcViejo = component.imageSrc();

      // el usuario avanza de producto ANTES de que llegue el error de la foto vieja
      component.product.set(
        makeProduct({ id: 'P-2', images: [{ src: 'https://cdn.local/sana.jpg', alt: 'Sana', order: 0 }] }),
      );
      await settle();

      // ...y ahora sí llega, rezagado
      component.onImageError(srcViejo);
      await settle();

      expect(query('.product-card__img')).toBeTruthy();
      expect(query('.product-card__placeholder')).toBeNull();
    });

    it('un 404 previo no arrastra al siguiente producto al plato', async () => {
      component.product.set(makeProduct());
      await settle();
      component.onImageError(component.imageSrc());
      await settle();
      expect(query('.product-card__placeholder')).toBeTruthy();

      component.product.set(
        makeProduct({ id: 'P-2', images: [{ src: 'https://cdn.local/otra.jpg', alt: 'Otra', order: 0 }] }),
      );
      await settle();

      expect(query('.product-card__img')).toBeTruthy();
      expect(query('.product-card__placeholder')).toBeNull();
    });

    it('sin foto y con enlace, el plato va DENTRO del enlace (toda la media navega)', async () => {
      fixture.componentRef.setInput('productUrlTemplate', '/tienda/{slug}');
      component.product.set(makeProduct({ images: [] }));
      await settle();

      const link = query('.product-card__image-link');
      expect(link).toBeTruthy();
      expect(link?.querySelector('.product-card__placeholder')).toBeTruthy();
      // El enlace conserva nombre accesible propio aunque su contenido sea decorativo.
      expect(link?.getAttribute('aria-label')).toContain('Silla Nórdica');
    });
  });

  // ── Monograma: qué pasa con nombres vacíos o raros ─────────────────────────
  describe('monograma', () => {
    const monogramFor = (name: string): string => {
      component.product.set(makeProduct({ name, images: [] }));
      return component.monogram();
    };

    it('toma la inicial de las dos primeras palabras con carga', () => {
      expect(monogramFor('Silla Nórdica Roble')).toBe('SN');
    });

    it('salta las palabras vacías (de, la, con…)', () => {
      expect(monogramFor('Café de Colombia')).toBe('CC');
    });

    it('con una sola palabra usa sus dos primeras letras', () => {
      expect(monogramFor('Silla')).toBe('SI');
    });

    it('ignora comillas y puntuación de apertura', () => {
      expect(monogramFor('«Silla»')).toBe('SI');
      expect(monogramFor('"Mesa Roble"')).toBe('MR');
    });

    it('ignora un emoji inicial en vez de partirlo por la mitad', () => {
      // Con charAt(0) esto imprimiría media pareja subrogada (un rombo ).
      expect(monogramFor('🎁 Caja Regalo')).toBe('CR');
    });

    it('cae a · cuando no queda ninguna letra', () => {
      expect(monogramFor('')).toBe('·');
      expect(monogramFor('   ')).toBe('·');
      expect(monogramFor('🎁')).toBe('·');
      expect(monogramFor('!!!')).toBe('·');
    });

    it('nunca devuelve más de dos caracteres, ni cuando mayusculizar alarga', () => {
      // 'ß'.toUpperCase() === 'SS' — dos caracteres a partir de uno.
      expect(monogramFor('ßeta').length).toBe(2);
      expect(Array.from(monogramFor('Silla Nórdica Roble')).length).toBe(2);
    });

    it('funciona con alfabetos no latinos', () => {
      expect(monogramFor('Ωmega Δelta')).toBe('ΩΔ');
    });
  });

  // ── Los overlays ya no dependen de que HAYA foto ───────────────────────────
  describe('overlays sobre la media', () => {
    it('muestra el badge aunque el producto no tenga foto', async () => {
      component.product.set(makeProduct({ images: [], badge: 'Nuevo' }));
      await settle();

      const overlay = query('.product-card__badge-overlay');
      expect(overlay).toBeTruthy();
      expect(overlay?.textContent).toContain('Nuevo');
    });

    it('muestra "agotado" aunque el producto no tenga foto', async () => {
      component.product.set(makeProduct({ images: [], inStock: false }));
      await settle();

      expect(query('.product-card__out-of-stock-overlay')).toBeTruthy();
    });
  });

  // ── El skeleton sigue mandando sobre la media ──────────────────────────────
  it('mientras carga no pinta ni foto ni plato', async () => {
    component.product.set(makeProduct({ images: [] }));
    component.loading.set(true);
    await settle();

    expect(query('.product-card__skeleton')).toBeTruthy();
    expect(query('.product-card__image')).toBeNull();
    expect(query('.product-card__placeholder')).toBeNull();
  });
});
