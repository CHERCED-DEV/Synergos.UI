import { facetasFijas, leerFiltrosFijos } from './index';

/**
 * Los filtros fijos que declara un bloque (014-despiece-tienda, I5; en el core desde 012-blogs-social, I6): «Ofertas»
 * en la tienda y una etiqueta en Blogs. Cómo los aplica cada catálogo lo prueba su vertical.
 */
describe('los filtros fijos del catálogo', () => {
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
        { campo: 'etiqueta', valor: 'arquitectura' },
        { campo: 'category', valor: 'Ropa' },
        { campo: 'category', valor: 'Accesorios' },
      ]),
    ).toEqual({ etiqueta: ['arquitectura'], category: ['Ropa', 'Accesorios'] });
  });
});
