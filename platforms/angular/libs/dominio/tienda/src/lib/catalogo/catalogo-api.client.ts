import { Injectable, inject } from '@angular/core';
import { esRegistro, leerBooleano, leerJsonDelBorde, leerNumero, leerTexto, leerTextos } from '@synergos/core';
import { LecturasDeLaTienda } from '../comun/lecturas';
import type {
  Facet,
  ProductCondition,
  ProductDetail,
  ProductQuestion,
  ProductReview,
  ProductVariant,
  SearchCriteria,
  SearchResult,
  ShopProduct,
} from './catalogo.model';

/**
 * El catálogo de la tienda: la búsqueda facetada (`GET /search`) y la ficha (`GET /product/{id}`). Son LECTURAS: si
 * el borde no contesta, degradan a su muestra con el cartel de «datos de ejemplo» (ver {@link LecturasDeLaTienda}).
 */
@Injectable({ providedIn: 'root' })
export class CatalogoApi {
  readonly #lecturas: LecturasDeLaTienda = inject(LecturasDeLaTienda);

  // ─── Search (faceted) ────────────────────────────────────────────────────────

  /**
   * El listado del catálogo. Con `lecturasBase`, el genérico (`GET {lecturasBase}/catalogo`, 014-despiece-tienda, I4);
   * sin ella, la ruta interina de siempre.
   */
  async search(
    apiBase: string,
    criteria: SearchCriteria,
    currency: string,
    lecturasBase = '',
  ): Promise<SearchResult> {
    if (lecturasBase) {
      return this.#listado(lecturasBase, criteria, currency);
    }
    const query = this.toSearchQuery(criteria);
    const url = `${apiBase}/search${query ? `?${query}` : ''}`;
    try {
      const data = await leerJsonDelBorde(apiBase, url);
      const result = normalizeSearch(data, currency);
      // A legitimately empty live result is fine — return it as-is when the shape matches.
      if (result && (result.products.length > 0 || esRegistro(data))) {
        return result;
      }
      throw new Error('search-shape');
    } catch (error) {
      this.#lecturas.markDegraded('GET /api/shop/search', error);
      return mockSearch(criteria, currency);
    }
  }

  // ─── Product detail ──────────────────────────────────────────────────────────

  /**
   * La ficha del producto. Con `lecturasBase`, la genérica y sus reseñas (`GET {lecturasBase}/catalogo/{id}` y
   * `…/resenas`, 014-despiece-tienda, I4); sin ella, la ruta interina de siempre.
   */
  async product(apiBase: string, id: string, currency: string, lecturasBase = ''): Promise<ProductDetail> {
    if (lecturasBase) {
      return this.#ficha(lecturasBase, id, currency);
    }
    const url = `${apiBase}/product/${encodeURIComponent(id)}`;
    try {
      const data = await leerJsonDelBorde(apiBase, url);
      const detail = normalizeDetail(data, currency);
      if (detail) {
        return detail;
      }
      throw new Error('product-shape');
    } catch (error) {
      this.#lecturas.markDegraded('GET /api/shop/product/{id}', error);
      return mockDetail(id, currency);
    }
  }

  async #listado(lecturasBase: string, criteria: SearchCriteria, currency: string): Promise<SearchResult> {
    const query = consultaDelListado(criteria);
    try {
      const resultado = leerListado(
        await leerJsonDelBorde(lecturasBase, `${lecturasBase}/catalogo${query ? `?${query}` : ''}`),
        currency,
      );
      if (resultado) {
        return resultado;
      }
      throw new Error('catalogo-shape');
    } catch (error) {
      this.#lecturas.markDegraded('GET /api/lecturas/{vertical}/catalogo', error);
      return mockSearch(criteria, currency);
    }
  }

  /**
   * La ficha y sus reseñas, a la vez. Si las reseñas no llegan, la ficha se muestra sin ellas y sin el formulario
   * (el fallo seguro de `canReview`), y se dice en el log: no hay muestra que poner en su lugar.
   */
  async #ficha(lecturasBase: string, id: string, currency: string): Promise<ProductDetail> {
    const ref = encodeURIComponent(id);
    try {
      const [ficha, resenas] = await Promise.all([
        leerJsonDelBorde(lecturasBase, `${lecturasBase}/catalogo/${ref}`),
        leerJsonDelBorde(lecturasBase, `${lecturasBase}/catalogo/${ref}/resenas`).catch((error: unknown) => {
          this.#lecturas.readFailed('GET /api/lecturas/{vertical}/catalogo/{id}/resenas', error);
          return null;
        }),
      ]);
      const detalle = leerFicha(ficha, resenas, currency);
      if (detalle) {
        return detalle;
      }
      throw new Error('ficha-shape');
    } catch (error) {
      this.#lecturas.markDegraded('GET /api/lecturas/{vertical}/catalogo/{id}', error);
      return mockDetail(id, currency);
    }
  }

  private toSearchQuery(criteria: SearchCriteria): string {
    const params = new URLSearchParams();
    if (criteria.q) {
      params.set('q', criteria.q);
    }
    if (criteria.category) {
      params.set('category', criteria.category);
    }
    if (criteria.sort && criteria.sort !== 'relevance') {
      params.set('sort', criteria.sort);
    }
    if (criteria.page > 1) {
      params.set('page', String(criteria.page));
    }
    for (const [key, values] of Object.entries(criteria.facets)) {
      if (values.length > 0) {
        params.set(key, values.join(','));
      }
    }
    return params.toString();
  }
}

function readCondition(value: unknown): ProductCondition {
  const raw = leerTexto(value).toLowerCase();
  return raw === 'used' || raw === 'refurbished' ? raw : 'new';
}

function normalizeProduct(value: unknown, fallbackCurrency: string): ShopProduct | null {
  if (!esRegistro(value)) {
    return null;
  }
  const id = leerTexto(value['id']).trim() || leerTexto(value['sku']).trim();
  const title = leerTexto(value['title']).trim() || leerTexto(value['name']).trim();
  if (!id || !title) {
    return null;
  }
  const amount = leerNumero(value['amount'] ?? value['price']);
  const listAmount = leerNumero(value['listAmount'] ?? value['listPrice']);
  return {
    id,
    title,
    subtitle: leerTexto(value['subtitle']).trim() || leerTexto(value['description']).trim(),
    amount,
    listAmount: listAmount > amount ? listAmount : undefined,
    currency: leerTexto(value['currency']).trim() || fallbackCurrency,
    brand: leerTexto(value['brand']).trim(),
    category: leerTexto(value['category']).trim(),
    seller: leerTexto(value['seller']).trim() || undefined,
    condition: readCondition(value['condition']),
    freeShipping: leerBooleano(value['freeShipping']),
    rating: leerNumero(value['rating']),
    reviewCount: Math.trunc(leerNumero(value['reviewCount'])),
    inStock: leerBooleano(value['inStock'], true),
    images: leerTextos(value['images']),
    badges: leerTextos(value['badges']),
  };
}

function normalizeFacets(value: unknown): readonly Facet[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry): Facet | null => {
      if (!esRegistro(entry)) {
        return null;
      }
      const key = leerTexto(entry['key']).trim();
      if (!key) {
        return null;
      }
      const rawValues = Array.isArray(entry['values']) ? entry['values'] : [];
      return {
        key,
        label: leerTexto(entry['label']).trim() || key,
        // Sin kind = MultiSelect: es el default del contrato y deja el checkbox de siempre.
        kind: leerTexto(entry['kind']).trim() || 'MultiSelect',
        values: rawValues
          .map((facetValue) => {
            if (!esRegistro(facetValue)) {
              return null;
            }
            const facetRaw = leerTexto(facetValue['value']).trim();
            if (!facetRaw) {
              return null;
            }
            return {
              value: facetRaw,
              label: leerTexto(facetValue['label']).trim() || facetRaw,
              count: Math.trunc(leerNumero(facetValue['count'])),
            };
          })
          .filter((facetValue): facetValue is Facet['values'][number] => facetValue !== null),
      };
    })
    .filter((facet): facet is Facet => facet !== null);
}

function normalizeSearch(value: unknown, fallbackCurrency: string): SearchResult | null {
  if (!esRegistro(value)) {
    return null;
  }
  const rawProducts = Array.isArray(value['products'])
    ? value['products']
    : Array.isArray(value['items'])
      ? value['items']
      : [];
  const products = rawProducts
    .map((entry) => normalizeProduct(entry, fallbackCurrency))
    .filter((product): product is ShopProduct => product !== null);

  return {
    products,
    facets: normalizeFacets(value['facets']),
    // Falls back to the page length when the backend omits `total`, which keeps an older
    // API honest: one page of results is exactly what we got.
    total: leerNumero(value['total']) || products.length,
  };
}

function normalizeVariant(value: unknown, fallbackAmount: number): ProductVariant | null {
  if (!esRegistro(value)) {
    return null;
  }
  const variantId = leerTexto(value['variantId']).trim() || leerTexto(value['id']).trim();
  if (!variantId) {
    return null;
  }
  const attributesRaw = esRegistro(value['attributes']) ? value['attributes'] : {};
  const attributes: Record<string, string> = {};
  for (const [key, attrValue] of Object.entries(attributesRaw)) {
    attributes[key] = leerTexto(attrValue);
  }
  const stock = Math.trunc(leerNumero(value['stock']));
  return {
    variantId,
    label: leerTexto(value['label']).trim() || variantId,
    attributes,
    amount: leerNumero(value['amount'] ?? value['price']) || fallbackAmount,
    inStock: leerBooleano(value['inStock'], stock > 0),
    stock,
  };
}

function normalizeReview(value: unknown): ProductReview | null {
  if (!esRegistro(value)) {
    return null;
  }
  const id = leerTexto(value['id']).trim();
  const body = leerTexto(value['body']).trim() || leerTexto(value['text']).trim();
  if (!id && !body) {
    return null;
  }
  return {
    id: id || `rev-${Math.random().toString(36).slice(2, 8)}`,
    author: leerTexto(value['author']).trim() || 'Anónimo',
    rating: leerNumero(value['rating']),
    title: leerTexto(value['title']).trim(),
    body,
    date: leerTexto(value['date']).trim(),
  };
}

function normalizeQuestion(value: unknown): ProductQuestion | null {
  if (!esRegistro(value)) {
    return null;
  }
  const question = leerTexto(value['question']).trim() || leerTexto(value['text']).trim();
  if (!question) {
    return null;
  }
  const answer = leerTexto(value['answer']).trim();
  return {
    id: leerTexto(value['id']).trim() || `q-${Math.random().toString(36).slice(2, 8)}`,
    author: leerTexto(value['author']).trim() || 'Comprador',
    question,
    answer: answer || undefined,
    date: leerTexto(value['date']).trim(),
  };
}

function normalizeDetail(value: unknown, fallbackCurrency: string): ProductDetail | null {
  if (!esRegistro(value)) {
    return null;
  }
  const product = normalizeProduct(value['product'] ?? value, fallbackCurrency);
  if (!product) {
    return null;
  }
  const rawVariants = Array.isArray(value['variants']) ? value['variants'] : [];
  const rawReviews = Array.isArray(value['reviews']) ? value['reviews'] : [];
  const rawQuestions = Array.isArray(value['questions']) ? value['questions'] : [];
  return {
    product,
    description: leerTexto(value['description']).trim() || product.subtitle,
    variants: rawVariants
      .map((entry) => normalizeVariant(entry, product.amount))
      .filter((variant): variant is ProductVariant => variant !== null),
    reviews: rawReviews
      .map((entry) => normalizeReview(entry))
      .filter((review): review is ProductReview => review !== null),
    questions: rawQuestions
      .map((entry) => normalizeQuestion(entry))
      .filter((question): question is ProductQuestion => question !== null),
    // Ausente ⇒ false. Un backend que no lo emita deja el formulario OCULTO, que es el
    // fallo seguro: lo contrario ofrecería escribir a quien va a recibir un 403.
    canReview: value['canReview'] === true,
  };
}

// ─── La lectura genérica del catálogo (014-despiece-tienda, I4) ────────────────
//
// La forma es neutra de vertical: un `elemento` con su `precio`, su `calificacion` y sus `atributos` (la tienda manda
// `marca` y `categoria`). Se lee a los MISMOS tipos de la tienda, así que las pantallas no cambian.

/** La query del listado genérico: cada faceta va por su campo, `filtro.{campo}`, con sus valores separados por coma. */
function consultaDelListado(criteria: SearchCriteria): string {
  const params = new URLSearchParams();
  if (criteria.q) {
    params.set('texto', criteria.q);
  }
  if (criteria.category) {
    params.set('filtro.category', criteria.category);
  }
  if (criteria.sort && criteria.sort !== 'relevance') {
    params.set('orden', criteria.sort);
  }
  if (criteria.page > 1) {
    params.set('pagina', String(criteria.page));
  }
  for (const [campo, valores] of Object.entries(criteria.facets)) {
    if (valores.length > 0) {
      params.set(`filtro.${campo}`, valores.join(','));
    }
  }
  return params.toString();
}

function leerRegistro(value: unknown): Record<string, unknown> {
  return esRegistro(value) ? value : {};
}

function leerElemento(value: unknown, monedaPorDefecto: string): ShopProduct | null {
  if (!esRegistro(value)) {
    return null;
  }
  const id = leerTexto(value['id']).trim();
  const title = leerTexto(value['titulo']).trim();
  if (!id || !title) {
    return null;
  }
  const precio = leerRegistro(value['precio']);
  const amount = leerNumero(precio['monto']);
  // El precio de antes de una oferta (I5): lo que la tarjeta ya pinta tachado. Sólo si es mayor, como en la interina.
  const antes = leerNumero(leerRegistro(value['precioAntes'])['monto']);
  const calificacion = leerRegistro(value['calificacion']);
  const atributos = leerRegistro(value['atributos']);
  const imagen = leerTexto(value['imagen']).trim();
  const disponibles = value['disponibles'];
  return {
    id,
    title,
    subtitle: '',
    amount,
    listAmount: antes > amount ? antes : undefined,
    currency: leerTexto(precio['moneda']).trim() || monedaPorDefecto,
    brand: leerTexto(atributos['marca']).trim(),
    category: leerTexto(atributos['categoria']).trim(),
    seller: undefined,
    condition: 'new',
    freeShipping: false,
    rating: leerNumero(calificacion['promedio']),
    reviewCount: Math.trunc(leerNumero(calificacion['cantidad'])),
    inStock: typeof disponibles === 'number' ? disponibles > 0 : true,
    images: imagen ? [imagen] : [],
    badges: [],
  };
}

function leerValorDeFaceta(value: unknown): Facet['values'][number] | null {
  if (!esRegistro(value)) {
    return null;
  }
  const raw = leerTexto(value['valor']).trim();
  if (!raw) {
    return null;
  }
  return { value: raw, label: leerTexto(value['etiqueta']).trim() || raw, count: Math.trunc(leerNumero(value['cantidad'])) };
}

function leerFacetas(value: unknown): readonly Facet[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry): Facet | null => {
      if (!esRegistro(entry)) {
        return null;
      }
      const key = leerTexto(entry['campo']).trim();
      if (!key) {
        return null;
      }
      const valores = Array.isArray(entry['valores']) ? entry['valores'] : [];
      return {
        key,
        label: leerTexto(entry['titulo']).trim() || key,
        kind: leerTexto(entry['tipo']).trim() || 'MultiSelect',
        values: valores
          .map((valor) => leerValorDeFaceta(valor))
          .filter((valor): valor is Facet['values'][number] => valor !== null),
      };
    })
    .filter((facet): facet is Facet => facet !== null);
}

function leerListado(value: unknown, monedaPorDefecto: string): SearchResult | null {
  if (!esRegistro(value) || !Array.isArray(value['elementos'])) {
    return null;
  }
  const products = value['elementos']
    .map((entry) => leerElemento(entry, monedaPorDefecto))
    .filter((product): product is ShopProduct => product !== null);
  return {
    products,
    facets: leerFacetas(value['facetas']),
    total: leerNumero(value['total']) || products.length,
  };
}

function leerOpcion(value: unknown, montoPorDefecto: number): ProductVariant | null {
  if (!esRegistro(value)) {
    return null;
  }
  const variantId = leerTexto(value['id']).trim();
  if (!variantId) {
    return null;
  }
  const stock = Math.trunc(leerNumero(value['disponibles']));
  return {
    variantId,
    label: leerTexto(value['titulo']).trim() || variantId,
    attributes: {},
    amount: leerNumero(leerRegistro(value['precio'])['monto']) || montoPorDefecto,
    inStock: stock > 0,
    stock,
  };
}

function leerResena(value: unknown, indice: number): ProductReview | null {
  if (!esRegistro(value)) {
    return null;
  }
  const body = leerTexto(value['texto']).trim();
  if (!body) {
    return null;
  }
  return {
    id: `res-${indice + 1}`,
    author: leerTexto(value['autor']).trim() || 'Anónimo',
    rating: leerNumero(value['calificacion']),
    title: leerTexto(value['titulo']).trim(),
    body,
    date: leerTexto(value['fecha']).trim(),
  };
}

function leerPregunta(value: unknown, indice: number): ProductQuestion | null {
  if (!esRegistro(value)) {
    return null;
  }
  const question = leerTexto(value['pregunta']).trim();
  if (!question) {
    return null;
  }
  return {
    id: `pre-${indice + 1}`,
    author: leerTexto(value['autor']).trim() || 'Comprador',
    question,
    answer: leerTexto(value['respuesta']).trim() || undefined,
    date: leerTexto(value['fecha']).trim(),
  };
}

function leerFicha(value: unknown, resenas: unknown, monedaPorDefecto: string): ProductDetail | null {
  if (!esRegistro(value)) {
    return null;
  }
  const elemento = leerElemento(value['elemento'], monedaPorDefecto);
  if (!elemento) {
    return null;
  }
  const descripcion = leerTexto(value['descripcion']).trim();
  const imagenes = leerTextos(value['imagenes']);
  const product: ShopProduct = { ...elemento, subtitle: descripcion, images: imagenes.length > 0 ? imagenes : elemento.images };
  const opciones = Array.isArray(value['opciones']) ? value['opciones'] : [];
  const preguntas = Array.isArray(value['preguntas']) ? value['preguntas'] : [];
  const deLasResenas = leerRegistro(resenas);
  const lista = Array.isArray(deLasResenas['resenas']) ? deLasResenas['resenas'] : [];
  return {
    product,
    description: descripcion,
    variants: opciones
      .map((entry) => leerOpcion(entry, product.amount))
      .filter((variant): variant is ProductVariant => variant !== null),
    reviews: lista
      .map((entry, indice) => leerResena(entry, indice))
      .filter((review): review is ProductReview => review !== null),
    questions: preguntas
      .map((entry, indice) => leerPregunta(entry, indice))
      .filter((question): question is ProductQuestion => question !== null),
    // Ausente ⇒ false, como en la interina: sin la lectura de las reseñas el formulario queda oculto.
    canReview: deLasResenas['puedeResenar'] === true,
  };
}

// ─── Mock data (visible degradation when the backend is not yet wired) ─────────

const MOCK_BRANDS = ['Sony', 'Samsung', 'Logitech', 'Xiaomi', 'Apple'];

const MOCK_CATEGORIES = ['Electrónica', 'Hogar', 'Computación', 'Audio'];

function mockSearch(criteria: SearchCriteria, currency: string): SearchResult {
  const all = mockCatalogue(currency);
  const term = criteria.q.trim().toLowerCase();
  let products = term
    ? all.filter(
        (product) =>
          product.title.toLowerCase().includes(term) ||
          product.brand.toLowerCase().includes(term),
      )
    : all;
  for (const [key, values] of Object.entries(criteria.facets)) {
    if (values.length === 0) {
      continue;
    }
    products = products.filter((product) => {
      if (key === 'brand') {
        return values.includes(product.brand);
      }
      if (key === 'condition') {
        return values.includes(product.condition);
      }
      if (key === 'category') {
        return values.includes(product.category);
      }
      return true;
    });
  }
  products = sortMock(products, criteria.sort);
  // The mock does not paginate, so every match is on the single page it returns.
  return { products, facets: mockFacets(all), total: products.length };
}

function sortMock(products: readonly ShopProduct[], sort: SearchCriteria['sort']): ShopProduct[] {
  const copy = [...products];
  switch (sort) {
    case 'price-asc':
      return copy.sort((a, b) => a.amount - b.amount);
    case 'price-desc':
      return copy.sort((a, b) => b.amount - a.amount);
    case 'newest':
      return copy.reverse();
    default:
      return copy.sort((a, b) => b.rating - a.rating);
  }
}

function mockFacets(products: readonly ShopProduct[]): readonly Facet[] {
  const count = (predicate: (product: ShopProduct) => boolean): number =>
    products.filter(predicate).length;
  return [
    {
      key: 'category',
      label: 'Categoría',
      values: MOCK_CATEGORIES.map((category) => ({
        value: category,
        label: category,
        count: count((product) => product.category === category),
      })),
    },
    {
      key: 'brand',
      label: 'Marca',
      values: MOCK_BRANDS.map((brand) => ({
        value: brand,
        label: brand,
        count: count((product) => product.brand === brand),
      })),
    },
    {
      key: 'condition',
      label: 'Condición',
      values: [
        { value: 'new', label: 'Nuevo', count: count((product) => product.condition === 'new') },
        { value: 'used', label: 'Usado', count: count((product) => product.condition === 'used') },
      ],
    },
  ];
}

function mockCatalogue(currency: string): readonly ShopProduct[] {
  const base: ReadonlyArray<Omit<ShopProduct, 'currency'>> = [
    {
      id: 'PMOCK-1',
      title: 'Audífonos Sony WH-1000XM5',
      subtitle: 'Cancelación de ruido · Bluetooth · 30h batería',
      amount: 1_499_000,
      listAmount: 1_799_000,
      brand: 'Sony',
      category: 'Audio',
      seller: 'TecnoHub',
      condition: 'new',
      freeShipping: true,
      rating: 4.8,
      reviewCount: 1240,
      inStock: true,
      images: [],
      badges: ['Envío gratis', '12 cuotas'],
    },
    {
      id: 'PMOCK-2',
      title: 'Smartphone Samsung Galaxy S24',
      subtitle: '256 GB · 8 GB RAM · Cámara 50 MP',
      amount: 3_299_000,
      brand: 'Samsung',
      category: 'Electrónica',
      seller: 'TecnoHub',
      condition: 'new',
      freeShipping: true,
      rating: 4.6,
      reviewCount: 870,
      inStock: true,
      images: [],
      badges: ['Envío gratis'],
    },
    {
      id: 'PMOCK-3',
      title: 'Mouse Logitech MX Master 3S',
      subtitle: 'Ergonómico · 8K DPI · USB-C',
      amount: 389_000,
      listAmount: 459_000,
      brand: 'Logitech',
      category: 'Computación',
      seller: 'PeriferiCO',
      condition: 'new',
      freeShipping: false,
      rating: 4.9,
      reviewCount: 2310,
      inStock: true,
      images: [],
      badges: ['Más vendido'],
    },
    {
      id: 'PMOCK-4',
      title: 'Aspiradora Xiaomi Robot Vacuum',
      subtitle: 'Mapeo láser · App · 5200 mAh',
      amount: 1_099_000,
      brand: 'Xiaomi',
      category: 'Hogar',
      seller: 'HogarPlus',
      condition: 'new',
      freeShipping: true,
      rating: 4.4,
      reviewCount: 530,
      inStock: true,
      images: [],
      badges: ['Oferta del día'],
    },
    {
      id: 'PMOCK-5',
      title: 'iPad Apple 10ª generación (usado)',
      subtitle: '64 GB · WiFi · Reacondicionado grado A',
      amount: 1_250_000,
      listAmount: 1_899_000,
      brand: 'Apple',
      category: 'Computación',
      seller: 'PeriferiCO',
      condition: 'used',
      freeShipping: false,
      rating: 4.2,
      reviewCount: 95,
      inStock: true,
      images: [],
      badges: ['Reacondicionado'],
    },
    {
      id: 'PMOCK-6',
      title: 'Parlante Sony SRS-XB23',
      subtitle: 'Portátil · Extra Bass · Resistente al agua',
      amount: 329_000,
      brand: 'Sony',
      category: 'Audio',
      seller: 'TecnoHub',
      condition: 'new',
      freeShipping: true,
      rating: 4.5,
      reviewCount: 410,
      inStock: false,
      images: [],
      badges: [],
    },
  ];
  return base.map((product) => ({ ...product, currency }));
}

function mockDetail(id: string, currency: string): ProductDetail {
  const product =
    mockCatalogue(currency).find((entry) => entry.id === id) ?? mockCatalogue(currency)[0];
  return {
    product,
    description:
      'Producto de demostración. La descripción real, especificaciones y galería ' +
      'se cargan desde el catálogo del CMS cuando el motor de la tienda responde.',
    variants: [
      {
        variantId: `${product.id}-v1`,
        label: 'Negro',
        attributes: { color: 'Negro' },
        amount: product.amount,
        inStock: true,
        stock: 12,
      },
      {
        variantId: `${product.id}-v2`,
        label: 'Plata',
        attributes: { color: 'Plata' },
        amount: product.amount + 40_000,
        inStock: true,
        stock: 4,
      },
      {
        variantId: `${product.id}-v3`,
        label: 'Azul',
        attributes: { color: 'Azul' },
        amount: product.amount,
        inStock: false,
        stock: 0,
      },
    ],
    reviews: [
      {
        id: 'r1',
        author: 'María G.',
        rating: 5,
        title: 'Excelente compra',
        body: 'Llegó rápido y funciona perfecto. Lo recomiendo totalmente.',
        date: '2026-05-12',
      },
      {
        id: 'r2',
        author: 'Carlos R.',
        rating: 4,
        title: 'Muy bueno',
        body: 'Cumple lo que promete, aunque el empaque llegó algo golpeado.',
        date: '2026-04-28',
      },
    ],
    questions: [
      {
        id: 'q1',
        author: 'Andrea',
        question: '¿Tiene garantía oficial en Colombia?',
        answer: 'Sí, 12 meses de garantía con el distribuidor oficial.',
        date: '2026-05-01',
      },
      {
        id: 'q2',
        author: 'Julián',
        question: '¿Hacen envío a Pasto?',
        date: '2026-05-20',
      },
    ],
    // En modo degradado NUNCA se ofrece reseñar: el backend que decide quién puede es
    // justo el que no está respondiendo. Invitar a escribir aquí acabaría en un envío
    // que se pierde.
    canReview: false,
  };
}
