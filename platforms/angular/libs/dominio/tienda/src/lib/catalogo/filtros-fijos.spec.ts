import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AvisosDeLaTienda } from '../comun/avisos';
import { ConfiguracionDeLaTienda } from '../comun/configuracion';
import { TEXTOS_DE_LA_TIENDA, type TextosDeLaTienda } from '../comun/textos';
import { CatalogoDeLaTienda } from './catalogo';
import { facetasFijas, leerFiltrosFijos, type FiltroFijoDelCatalogo } from './filtros-fijos';

/**
 * La página «Ofertas» (014-despiece-tienda, I5): el bloque del catálogo declara sus filtros fijos y la tienda los aplica
 * en cada búsqueda sin ofrecerlos como faceta. El doble es la respuesta del SERVIDOR (la forma de la lectura genérica).
 */
const LECTURAS = '/api/lecturas/tienda';

function contestar(cuerpo: unknown): string[] {
  const pedidas: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      pedidas.push(String(url));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(cuerpo) } as Response);
    }),
  );
  return pedidas;
}

function catalogoCon(filtrosFijos: readonly FiltroFijoDelCatalogo[]): CatalogoDeLaTienda {
  TestBed.configureTestingModule({
    providers: [
      CatalogoDeLaTienda,
      ConfiguracionDeLaTienda,
      AvisosDeLaTienda,
      { provide: TEXTOS_DE_LA_TIENDA, useValue: {} as TextosDeLaTienda },
    ],
  });
  TestBed.inject(ConfiguracionDeLaTienda).conectar({
    apiBase: signal('/api/shop'),
    lecturasBase: signal(LECTURAS),
    zonaHoraria: signal(''),
    purchasePath: signal(undefined),
    shippingCountry: signal('CO'),
    filtrosFijos: signal(filtrosFijos),
  });
  return TestBed.inject(CatalogoDeLaTienda);
}

const LISTADO = {
  elementos: [
    {
      id: 'AUDIF-DIADEMA-001',
      titulo: 'Audífonos de diadema',
      imagen: null,
      precio: { monto: 320000, moneda: 'COP', texto: '$ 320.000' },
      precioAntes: { monto: 380000, moneda: 'COP', texto: '$ 380.000' },
      calificacion: null,
      disponibles: 8,
      atributos: { marca: 'Vértice', categoria: 'Tecnología' },
    },
  ],
  facetas: [
    { campo: 'category', titulo: 'Categoría', tipo: 'MultiSelect', valores: [{ valor: 'Tecnología', etiqueta: 'Tecnología', cantidad: 1 }] },
    { campo: 'oferta', titulo: 'Ofertas', tipo: 'MultiSelect', valores: [{ valor: 'En oferta', etiqueta: 'En oferta', cantidad: 1 }] },
  ],
  total: 1,
  pagina: 1,
  porPagina: 12,
};

describe('Los filtros fijos del catálogo', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('se leen del config con campo y valor, sin repetir, y lo demás no viaja', () => {
    expect(
      leerFiltrosFijos([
        { campo: 'oferta', valor: 'En oferta' },
        { campo: ' oferta ', valor: 'En oferta ' },
        { campo: '', valor: 'x' },
        { campo: 'marca' },
        'oferta=En oferta',
        null,
      ]),
    ).toEqual([{ campo: 'oferta', valor: 'En oferta' }]);
    expect(leerFiltrosFijos(undefined)).toEqual([]);
    expect(leerFiltrosFijos({ campo: 'oferta', valor: 'En oferta' })).toEqual([]);
  });

  it('se juntan por campo como facetas del criterio', () => {
    expect(
      facetasFijas([
        { campo: 'oferta', valor: 'En oferta' },
        { campo: 'category', valor: 'Ropa' },
        { campo: 'category', valor: 'Accesorios' },
      ]),
    ).toEqual({ oferta: ['En oferta'], category: ['Ropa', 'Accesorios'] });
  });

  it('la página «Ofertas»: el filtro va en cada búsqueda, su faceta no se ofrece y el precio de antes se ve', async () => {
    const pedidas = contestar(LISTADO);
    const catalogo = catalogoCon([{ campo: 'oferta', valor: 'En oferta' }]);

    await catalogo.runSearch();

    const url = new URL(pedidas[0], 'http://sitio');
    expect(url.pathname).toBe(`${LECTURAS}/catalogo`);
    expect(url.searchParams.get('filtro.oferta')).toBe('En oferta');
    expect(catalogo.discoveryFacets().map((faceta) => faceta.key)).toEqual(['category']);
    expect(catalogo.products()[0]).toMatchObject({ amount: 320000, listAmount: 380000 });
  });

  it('sin filtros fijos, el catálogo de siempre: la oferta es una faceta más', async () => {
    const pedidas = contestar(LISTADO);
    const catalogo = catalogoCon([]);

    await catalogo.runSearch();

    expect(new URL(pedidas[0], 'http://sitio').searchParams.has('filtro.oferta')).toBe(false);
    expect(catalogo.discoveryFacets().map((faceta) => faceta.key)).toEqual(['category', 'oferta']);
  });
});
