import { describe, expect, it } from 'vitest';

import { SIN_BORDE, cruzarRutas, rutasQueDeclara, rutasQuePide } from './rutas-del-borde.mjs';

describe('rutasQuePide', () => {
  it('saca la ruta de un template simple', () => {
    expect(rutasQuePide('const url = `${apiBase}/seller/summary`;')).toEqual(['seller/summary']);
  });

  it('convierte un segmento interpolado en `{}`', () => {
    const src = 'const url = `${apiBase}/order/${encodeURIComponent(orderRef)}/tracking/advance`;';
    expect(rutasQuePide(src)).toEqual(['order/{}/tracking/advance']);
  });

  // ── los dos puntos ciegos que de verdad se cometieron, medidos ──────────────
  it('cruza un `${…}` ANIDADO — el caso que dio 31 con un regex', () => {
    // `${qs ? `?${qs}` : ''}` lleva otro `${}` dentro. Un regex que busque `\$\{[^}]*\}` corta
    // en la primera `}` y arrastra basura a la ruta; contando llaves, no.
    const src = "const url = `${apiBase}/explore${qs ? `?${qs}` : ''}`;";
    expect(rutasQuePide(src)).toEqual(['explore{}']);
  });

  it('no deja el separador de más — el caso que dio 115 de 115', () => {
    // La ruta sale con `/` delante porque `${apiBase}` va seguido de `/`. Si no se quita, todo
    // `endsWith('/' + ruta)` compara contra `//feed` y NADA liga: el cruce informa que el
    // 100 % está ausente y se lee como que el borde entero desapareció.
    expect(rutasQuePide('`${apiBase}/feed`')).toEqual(['feed']);
    expect(rutasQuePide('`${apiBase}//feed/`')).toEqual(['feed']);
  });

  it('corta en la query escrita a mano', () => {
    expect(rutasQuePide('`${apiBase}/patients?q=${q}`')).toEqual(['patients']);
  });

  it('no repite la misma ruta pedida dos veces', () => {
    expect(rutasQuePide('`${apiBase}/feed` … `${apiBase}/feed`')).toEqual(['feed']);
  });
});

describe('rutasQueDeclara', () => {
  it('compone el `[Route]` con cada `[HttpX]` y normaliza los parámetros', () => {
    const cs = `
[ApiController]
[Route("api/shop")]
public sealed class ShopCatalogController : ControllerBase
{
    [HttpGet("order/{orderRef}/tracking")]
    public IActionResult Tracking(string orderRef) => Ok();

    [HttpPost("return/{rmaId}/advance")]
    public IActionResult Advance(string rmaId) => Ok();

    [HttpGet]
    public IActionResult Raiz() => Ok();
}
`;
    expect(rutasQueDeclara(cs)).toEqual([
      'api/shop/order/{}/tracking',
      'api/shop/return/{}/advance',
      'api/shop',
    ]);
  });
});

describe('cruzarRutas', () => {
  const declaradas = ['api/shop/orders', 'api/shop/return/{}/advance'];

  it('no reporta nada cuando todas ligan (happy)', () => {
    const clientes = [{ vertical: 'shop', rutas: ['orders', 'return/{}/advance'] }];
    const { fallos, medidas } = cruzarRutas(clientes, declaradas, {});
    expect(fallos).toEqual([]);
    expect(medidas).toBe(2);
  });

  it('caza una ruta que el borde no declara, y dice qué decidir', () => {
    const clientes = [{ vertical: 'seller', rutas: ['seller/product'] }];
    const { fallos, ausentes } = cruzarRutas(clientes, declaradas, {});
    expect(ausentes).toEqual(['seller :: seller/product']);
    expect(fallos).toHaveLength(1);
    // Lo que distingue este gate de «hay una ruta muerta»: nombra el corte.
    expect(fallos[0]).toContain('no se censa: se arregla');
  });

  it('acepta lo censado', () => {
    const clientes = [{ vertical: 'seller', rutas: ['seller/product'] }];
    const censo = { 'seller :: seller/product': 'porque sí, con su razón larga' };
    expect(cruzarRutas(clientes, declaradas, censo).fallos).toEqual([]);
  });

  it('rompe si una entrada del censo ya no corresponde (el segundo diente)', () => {
    const clientes = [{ vertical: 'shop', rutas: ['orders'] }];
    const censo = { 'shop :: orders': 'el CMS ya la declara' };
    const { fallos } = cruzarRutas(clientes, declaradas, censo);
    expect(fallos).toHaveLength(1);
    expect(fallos[0]).toContain('ya no corresponde');
  });

  it('trata un `{}` FINAL como la query antes de llamar ausente a nada', () => {
    // `explore{}` sale de `${apiBase}/explore${qs…}`: la ruta es `explore`.
    const clientes = [{ vertical: 'blogs', rutas: ['orders{}'] }];
    expect(cruzarRutas(clientes, declaradas, {}).fallos).toEqual([]);
  });

  it.each([
    ['sin clientes', [], ['api/shop/orders']],
    ['sin rutas declaradas', [{ vertical: 'shop', rutas: ['orders'] }], []],
  ])('rechaza %s en vez de pasar en verde', (_, clientes, declaradasVacias) => {
    const { fallos } = cruzarRutas(clientes, declaradasVacias, SIN_BORDE);
    expect(fallos).toHaveLength(1);
    expect(fallos[0]).toContain('descubrimiento roto');
    // Y no arrastra el censo entero: sin esto, cero rutas declaradas haría que el segundo
    // diente pidiera borrar las 16 entradas.
    expect(fallos[0]).not.toContain('ya no corresponde');
  });
});

describe('el censo del disco', () => {
  it('cada entrada trae su razón, y las de escritura dicen qué hacen sin borde', () => {
    for (const [clave, razon] of Object.entries(SIN_BORDE)) {
      expect(razon, clave).toBeTruthy();
      expect(razon.length, clave).toBeGreaterThan(30);
    }
  });

  // ── EL DIENTE QUE NO SE ESCRIBIÓ, Y POR QUÉ ────────────────────────────────
  //
  // Faltaría «ninguna entrada del censo es una escritura que FABRICA», que es la línea que
  // #77 vino a trazar. Se escribió buscando el vocabulario en la razón —`/fabrica|inventa/`—
  // y **marcó al bueno al primer intento**: la razón de `moderation/{}/{}` dice «escritura
  // honesta: devuelve `{ ok: false, reason }`, **no fabrica**», y un regex por palabra no
  // distingue la afirmación de su negación. Un gate que acusa justo a la entrada que declara
  // lo correcto enseña a ignorarlo — la misma razón por la que el repo hermano quitó el
  // diente de «tiene gemelo `Http*`» de `MoldeDelVerticalTests`.
  //
  // Y afinar el regex sería perseguir la cosa equivocada: lo que hay que comprobar no es qué
  // dice la razón, es qué hace el CÓDIGO. Eso exige seguir cada ruta hasta el método que la
  // pide y mirar su `catch`, que es otro gate. El disparador para escribirlo: la primera
  // entrada que alguien censa sobre una escritura sin decir qué devuelve sin borde.
  //
  // Mientras tanto lo que de verdad protege es el PRIMER diente: una ruta ausente sin censar
  // rompe el build, así que añadirla obliga a una persona a escribir la razón — y el mensaje
  // del fallo dice, con todas las letras, que una escritura que fabrica no se censa. Más la
  // regla 19 de `CLAUDE.md`, que se busca con un grep: un método de escritura que pide como
  // parámetro lo mismo que promete devolver.
  it('cada entrada nombra qué pasa sin borde, que es lo que hace útil la razón', () => {
    for (const [clave, razon] of Object.entries(SIN_BORDE)) {
      expect(razon.toLowerCase(), clave).toMatch(/degrada|devuelve|no aplica|null|cartel|mock/);
    }
  });
});
