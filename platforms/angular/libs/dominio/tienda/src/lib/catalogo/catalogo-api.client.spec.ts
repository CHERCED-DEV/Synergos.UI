import { TestBed } from '@angular/core/testing';
import { LecturasDeLaTienda } from '../comun/lecturas';
import { CatalogoApi } from './catalogo-api.client';

describe('CatalogoApi', () => {
  function createClient(): CatalogoApi {
    return TestBed.inject(CatalogoApi);
  }
  const degradado = (): boolean => TestBed.inject(LecturasDeLaTienda).degraded;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('normalises a live faceted search response (happy case)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              products: [
                { id: 'X1', title: 'Producto X', amount: 99_000, currency: 'COP', brand: 'Acme' },
              ],
              facets: [
                {
                  key: 'brand',
                  label: 'Marca',
                  values: [{ value: 'Acme', label: 'Acme', count: 1 }],
                },
              ],
            }),
        } as Response),
      ),
    );
    const client = createClient();
    const result = await client.search(
      '/api/shop',
      { q: '', category: '', facets: {}, sort: 'relevance', page: 1 },
      'COP',
    );

    expect(result.products).toHaveLength(1);
    expect(result.products[0].id).toBe('X1');
    expect(result.facets).toHaveLength(1);
    expect(degradado()).toBe(false);
  });

  it('reads `total` from the response, not the page length', async () => {
    // The seam that matters: `total` drives pageCount in the shell, so a page of 1 out of 30
    // must report 30. Mistyping the key here (`totalCount`, `Total`) silently collapses the
    // pager to a single page and strands the rest of the catalogue — and nothing else in the
    // suite would notice, because every other test lets fetch reject into the mock.
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              total: 30,
              products: [
                { id: 'X1', title: 'Producto X', amount: 99_000, currency: 'COP', brand: 'Acme' },
              ],
              facets: [],
            }),
        } as Response),
      ),
    );
    const client = createClient();
    const result = await client.search(
      '/api/shop',
      { q: '', category: '', facets: {}, sort: 'relevance', page: 1 },
      'COP',
    );

    expect(result.products).toHaveLength(1);
    expect(result.total).toBe(30);
  });

  it('falls back to the page length when the backend omits `total`', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              products: [
                { id: 'X1', title: 'Producto X', amount: 99_000, currency: 'COP', brand: 'Acme' },
              ],
              facets: [],
            }),
        } as Response),
      ),
    );
    const client = createClient();
    const result = await client.search(
      '/api/shop',
      { q: '', category: '', facets: {}, sort: 'relevance', page: 1 },
      'COP',
    );

    expect(result.total).toBe(1);
  });

  it('serialises multi-value facets as CSV and sends page>1', async () => {
    // The wire contract the backend parses: `values.join(',')`. The Tienda backend shipped a
    // bug where `category` was the one key it did not split, and two categories returned zero
    // — this asserts our half of that contract so a change here surfaces loudly.
    let requestedUrl = '';
    vi.stubGlobal(
      'fetch',
      vi.fn((input: unknown) => {
        requestedUrl = String(input);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ products: [], facets: [], total: 0 }),
        } as Response);
      }),
    );

    const client = createClient();
    await client.search(
      '/api/shop',
      {
        q: 'laptop',
        category: '',
        facets: { category: ['Hogar', 'Deportes'], brand: ['Acme'] },
        sort: 'price-asc',
        page: 2,
      },
      'COP',
    );

    expect(requestedUrl).toContain('category=Hogar%2CDeportes');
    expect(requestedUrl).toContain('brand=Acme');
    expect(requestedUrl).toContain('page=2');
    expect(requestedUrl).toContain('q=laptop');
    expect(requestedUrl).toContain('sort=price-asc');
  });

  it('filters the mock catalogue by selected facet when degraded (filter case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const client = createClient();

    const result = await client.search(
      '/api/shop',
      { q: '', category: '', facets: { brand: ['Sony'] }, sort: 'relevance', page: 1 },
      'COP',
    );

    expect(degradado()).toBe(true);
    expect(result.products.length).toBeGreaterThan(0);
    expect(result.products.every((product) => product.brand === 'Sony')).toBe(true);
  });
});
