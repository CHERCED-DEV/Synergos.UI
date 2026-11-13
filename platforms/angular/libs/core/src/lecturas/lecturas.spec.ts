import {
  leerBandejaDelVertical,
  leerColeccionDelMiembro,
  leerElementoDelCatalogo,
  leerListadoDelCatalogo,
} from './index';

describe('los lectores de las formas neutras (012-blogs-social, I4)', () => {
  it('un elemento del catálogo: lo que trae, y lo que no trae queda ausente, no en cero', () => {
    const elemento = leerElementoDelCatalogo({
      id: ' post-1 ',
      titulo: 'Arquitectura por capas',
      imagen: '/media/capas.jpg',
      precio: null,
      calificacion: null,
      disponibles: null,
      atributos: { alias: 'camila-rios', comentarios: '7' },
    });

    expect(elemento).toEqual({
      id: 'post-1',
      titulo: 'Arquitectura por capas',
      imagen: '/media/capas.jpg',
      precio: undefined,
      precioAntes: undefined,
      calificacion: undefined,
      disponibles: undefined,
      atributos: { alias: 'camila-rios', comentarios: '7' },
    });
    expect(leerElementoDelCatalogo({ titulo: 'sin id' })).toBeNull();
  });

  it('el listado trae sus elementos y sus facetas, y sin «elementos» no es un listado', () => {
    const listado = leerListadoDelCatalogo({
      elementos: [{ id: 'a', titulo: 'A', atributos: {} }, { titulo: 'sin id' }],
      facetas: [
        { campo: 'etiqueta', titulo: 'Etiqueta', tipo: 'MultiSelect', valores: [{ valor: 'ux', etiqueta: 'ux', cantidad: 2 }] },
        { titulo: 'sin campo', valores: [] },
      ],
      total: 1,
    });

    expect(listado?.elementos.map((e) => e.id)).toEqual(['a']);
    expect(listado?.facetas).toEqual([
      { campo: 'etiqueta', titulo: 'Etiqueta', tipo: 'MultiSelect', valores: [{ valor: 'ux', etiqueta: 'ux', cantidad: 2 }] },
    ]);
    expect(listado?.total).toBe(1);
    expect(leerListadoDelCatalogo({ posts: [] })).toBeNull();
  });

  it('una colección: lo que el catálogo ya no tiene sale sin elemento, y el elemento toma el id de lo guardado', () => {
    const coleccion = leerColeccionDelMiembro({
      coleccion: 'saved',
      elementos: [
        { id: 'post-1', guardado: '2026-11-13T10:00:00Z', elemento: { titulo: 'Sin id propio', atributos: {} } },
        { id: 'ya-no-existe', guardado: '2026-11-12T10:00:00Z', elemento: null },
      ],
    });

    expect(coleccion?.elementos.map((e) => [e.id, e.elemento?.id ?? null])).toEqual([
      ['post-1', 'post-1'],
      ['ya-no-existe', null],
    ]);
  });

  it('la bandeja trae cada hilo con sus mensajes, y sin «hilos» no es una bandeja', () => {
    const hilos = leerBandejaDelVertical({
      hilos: [
        {
          id: 'th-1',
          contexto: 'dm',
          asunto: 'Ana Autora',
          contraparte: 'ana-autora-a1b2c3',
          ultimo: '¡Nos vemos!',
          fecha: '2026-11-13T10:00:00+00:00',
          cantidad: 2,
          mensajes: [
            { id: 'm1', de: 'ana-autora-a1b2c3', mio: false, texto: '¿Leíste?', fecha: '2026-11-13T09:00:00+00:00' },
            { id: 'm2', de: 'yo-0f1e2d', mio: true, texto: '¡Nos vemos!', fecha: '2026-11-13T10:00:00+00:00' },
            { de: 'sin id' },
          ],
        },
      ],
    });

    expect(hilos?.[0]?.contraparte).toBe('ana-autora-a1b2c3');
    expect(hilos?.[0]?.mensajes.map((m) => [m.id, m.mio])).toEqual([
      ['m1', false],
      ['m2', true],
    ]);
    expect(leerBandejaDelVertical({ threads: [] })).toBeNull();
  });
});
