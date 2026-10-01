import { baseDeRuta, mismaRuta, segmentosDeRuta } from './ruta-por-hash';
import { describe, expect, it } from 'vitest';

// Los hashes «del navegador» de abajo son los que devuelve `location.hash` después de
// asignarle el texto crudo: el fragmento codifica el espacio y lo que no es ASCII, y
// deja `:` tal cual (medido en el banco con `scope="muestra: scope"`, #88).
describe('las rutas por hash de las verticales (UI#91)', () => {
  const SCOPE = 'Mi sitio: ñ';
  const DEL_NAVEGADOR = '#/Mi%20sitio:%20%C3%B1';

  it('la base codifica el scope: el navegador no la vuelve a tocar', () => {
    expect(baseDeRuta(SCOPE)).toBe('#/Mi%20sitio%3A%20%C3%B1');
    expect(baseDeRuta('academy')).toBe('#/academy');
  });

  it('EL caso: el hash que devuelve el navegador sigue siendo de la vertical', () => {
    // Con la base cruda, `'#/Mi%20sitio:%20%C3%B1/curso/C1'.startsWith('#/Mi sitio: ñ/')`
    // es falso y la vertical no reconocía su propia ruta.
    expect(segmentosDeRuta(`${DEL_NAVEGADOR}/curso/C1`, SCOPE)).toEqual(['curso', 'C1']);
  });

  it('y el que escribió la propia vertical, con `:` como %3A', () => {
    expect(segmentosDeRuta(`${baseDeRuta(SCOPE)}/curso/C1`, SCOPE)).toEqual(['curso', 'C1']);
  });

  it('los segmentos llegan DECODIFICADOS: quien llama no vuelve a decodificar', () => {
    const hash = `${baseDeRuta(SCOPE)}/p/${encodeURIComponent('Silla 50% / roble')}`;
    expect(segmentosDeRuta(hash, SCOPE)).toEqual(['p', 'Silla 50% / roble']);
  });

  it('la base sola, con o sin barra final, es la ruta vacía', () => {
    expect(segmentosDeRuta(DEL_NAVEGADOR, SCOPE)).toEqual([]);
    expect(segmentosDeRuta(`${DEL_NAVEGADOR}/`, SCOPE)).toEqual([]);
  });

  it('otro scope, un prefijo del scope o un hash que no es ruta: null', () => {
    expect(segmentosDeRuta('#/otro/curso/C1', SCOPE)).toBeNull();
    expect(segmentosDeRuta('#/Mi%20sitio/curso/C1', SCOPE)).toBeNull();
    expect(segmentosDeRuta('#/academy-2/curso', 'academy')).toBeNull();
    expect(segmentosDeRuta('#seccion', SCOPE)).toBeNull();
    expect(segmentosDeRuta('', SCOPE)).toBeNull();
  });

  it('un segmento mal codificado no lanza: se queda como vino', () => {
    // `decodeURIComponent('%E0%A4%A')` lanza URIError; dentro de un `hashchange` eso
    // tumbaba el manejador entero.
    expect(segmentosDeRuta('#/academy/curso/%E0%A4%A', 'academy')).toEqual(['curso', '%E0%A4%A']);
  });

  it('mismaRuta compara la ruta, no la forma en que se escribió', () => {
    expect(mismaRuta(`${baseDeRuta(SCOPE)}/aula`, `${DEL_NAVEGADOR}/aula`)).toBe(true);
    expect(mismaRuta('#/academy/aula', '#/academy/curso')).toBe(false);
    expect(mismaRuta('', '')).toBe(true);
    expect(mismaRuta('', '#/academy')).toBe(false);
  });
});
