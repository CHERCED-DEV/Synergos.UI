/**
 * El contrato de una plataforma: qué tiene que traer un wrapper (#62).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO EXISTE.
 *
 * «Qué tiene que traer una plataforma» existía sólo **como implementación**,
 * repartido en nueve sitios de `platforms/angular/`. Recorrido y clasificado el
 * árbol entero (`SynergosDocs/MEDICION_SEGUNDA_PLATAFORMA.md` §1), son SIETE
 * obligaciones — y **de las siete sólo la 2 tenía gate** (`revisarPlataformas`,
 * #44). Las otras seis no las comprobaba nadie: una `platforms/react/` a medias
 * pasaba el build y se descubría publicando.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTE GATE COMPRUEBA, Y LO QUE NO — DICHO, NO INSINUADO.
 *
 * Cinco de las siete se comprueban acá, **sin construir nada**. Las otras dos
 * necesitan un artefacto que sólo existe después de construir o de publicar, así
 * que este gate **no las mide y lo dice**, en vez de contarlas como cubiertas:
 *
 *   - **(4) el build escribe donde `resolveBundlePath` promete** — sólo se sabe
 *     con el `dist/` hecho. Lo comprueban `publish.mjs` (que falla si el bundle
 *     no está donde se prometió) y `cdn-size-budget` (que mide lo publicado).
 *     Acá se comprueba lo estático: que la plataforma **declare** un build.
 *   - **(6) el runtime publicado con su `import-map.json` y su `latest/`** — lo
 *     comprueba `cdn-runtime-check` contra el árbol del CDN, por framework
 *     publicado, desde #61.
 *
 * Y la 6 destapó algo al derivar el contrato, así que va escrito en vez de
 * resuelto por el camino corto: **hoy no tiene expresión estática por
 * plataforma**. Quien construye el runtime de Angular es `tools/build-runtime.mjs`,
 * que vive en la RAÍZ y es específico de Angular; no hay
 * `platforms/angular/tools/build-runtime.mjs`. Exigir uno pondría **roja a la
 * única plataforma que existe**, y un contrato que la única implementación viva
 * no cumple está derivado de un ideal y no de lo que hay — que es exactamente
 * lo que el ticket manda evitar. Se deja medido y su disparador es #64: el día
 * que haya un segundo runtime que construir, el constructor deja de poder vivir
 * en la raíz y ahí la obligación 6 gana su mitad estática.
 * ─────────────────────────────────────────────────────────────────────────────
 * LA OCTAVA, QUE LLEGÓ CON LA DECISIÓN DE #62.
 *
 * El despiece original medía SIETE. La octava no estaba porque `ElementProtocol`
 * —la interfaz de `vitals/core` que dice ser *«the interface that every
 * framework must implement to register a Web Component»*— **no la implementaba
 * nadie**, así que exigirla habría sido escribir un contrato que la única
 * plataforma viva incumple. Con la decisión tomada —**honrarlo**— pasa a ser
 * obligación, y tiene dos dientes porque uno solo no la vuelve real:
 *
 *   - **existe un adaptador que la implementa** — si no, la interfaz es un
 *     comentario con sintaxis (regla 24);
 *   - **y es el ÚNICO que registra** — si un elemento llama a
 *     `customElements.define` por su cuenta, el adaptador existe y no manda,
 *     que es la forma en que un contrato se queda de adorno sin que nada falle.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Las ocho, en el orden en que se leen. El texto es el contrato. */
export const OBLIGACIONES = [
  { n: 1, titulo: 'package.json propio — es lo que la hace construible' },
  { n: 2, titulo: 'entrada en PLATFORMS con name, distDir, resolveBundlePath y elementDistDir' },
  { n: 3, titulo: 'fuentes en platforms/<nombre>/apps/**/src/main.<ext>' },
  { n: 4, titulo: 'un build declarado, que escriba donde resolveBundlePath promete' },
  { n: 5, titulo: 'un cdn.config.mjs con sus externals — el contrato del navegador' },
  { n: 6, titulo: 'runtime publicado con su import-map.json y un puntero latest/' },
  { n: 7, titulo: 'vitals/core-assets traducido a su lenguaje de estilos, con su comprobación' },
  { n: 8, titulo: 'un adaptador de montaje que implementa ElementProtocol, y es el ÚNICO que registra' },
];

/** Las que este gate NO mide, con quién las mide. Se informa, no se esconde. */
export const FUERA_DE_ALCANCE = new Map([
  [4, 'parcial: acá se exige que el build ESTÉ DECLARADO. Que escriba donde `resolveBundlePath` ' +
      'promete lo comprueba `publish.mjs` con el dist hecho.'],
  [6, 'entera: necesita el árbol del CDN. La comprueba `cdn-runtime-check` por framework ' +
      'publicado (#61). Hoy no tiene mitad estática — ver la cabecera.'],
]);

const unirPorDefecto = (...partes) => partes.join('/');

/**
 * Cruza una plataforma del disco contra las obligaciones comprobables.
 *
 * El disco se inyecta, como en `frameworks.mjs`: es lo que permite verlo fallar
 * con una plataforma a medias sin crearla en el árbol de verdad.
 *
 * @param {{ raiz: string, framework: string, declaradas: string[],
 *           existe: (r: string) => boolean, leerJson: (r: string) => any,
 *           leer: (r: string) => string,
 *           fuentes: (framework: string) => number,
 *           unir?: (...p: string[]) => string }} io
 *   `declaradas` son los `name` de `PLATFORMS`; `fuentes` cuenta las que el
 *   descubrimiento ve para esa plataforma —se pasa como función para no
 *   duplicar acá la regla de qué cuenta como fuente (`todasLasFuentes`)—; y
 *   `fuentesDe(dir)` lista los ficheros de código bajo un directorio, que es lo
 *   que la obligación 8 necesita recorrer.
 * @returns {{ n: number, titulo: string, detalle: string }[]} Lo que falta.
 */
export function revisarPlataforma({
  raiz, framework, declaradas, existe, leerJson, leer, fuentes, fuentesDe, unir = unirPorDefecto,
}) {
  const base = unir(raiz, 'platforms', framework);
  const faltan = [];
  const falta = (n, detalle) =>
    faltan.push({ n, titulo: OBLIGACIONES.find((o) => o.n === n).titulo, detalle });

  // 1 ── package.json propio.
  const pkgRuta = unir(base, 'package.json');
  let pkg = null;
  if (!existe(pkgRuta)) {
    falta(1, `no existe ${pkgRuta}. Sin él la carpeta no es una plataforma: es una carpeta.`);
  } else {
    try {
      pkg = leerJson(pkgRuta);
    } catch (err) {
      falta(1, `${pkgRuta} no es JSON legible: ${err.message}`);
    }
  }

  // 2 ── entrada en PLATFORMS. `revisarPlataformas` ya la cruza en los dos
  //      sentidos (#44); acá se nombra para que las siete se lean juntas — un
  //      contrato partido en dos informes es uno que nadie lee entero.
  if (!declaradas.includes(framework)) {
    falta(2, `PLATFORMS (tools/lib/synergos-config.mjs) no declara "${framework}", así que el ` +
             `pipeline entero la ignora: ni se limpia, ni se publica, ni se mide.`);
  }

  // 3 ── fuentes descubribles.
  if (!existe(unir(base, 'apps'))) {
    falta(3, `no existe ${unir(base, 'apps')}. Es donde el descubrimiento busca.`);
  } else if (fuentes(framework) === 0) {
    falta(3, `${unir(base, 'apps')} existe y el descubrimiento no encuentra ni una fuente. ` +
             `La entrada la DECLARA la plataforma en PLATFORMS[].entrada (#64), porque la ` +
             `extensión no es la misma en todas. Si la tuya no está declarada o no coincide ` +
             `con lo que hay en el disco, el descubrimiento ve cero y el error sale por el ` +
             `sitio equivocado: culpando al registry.`);
  }

  // 4 ── un build declarado (la mitad estática; ver FUERA_DE_ALCANCE).
  if (pkg && !pkg.scripts?.build) {
    falta(4, `${pkgRuta} no declara scripts.build. Nada construiría sus elementos.`);
  }

  // 5 ── el contrato del navegador.
  const cdnRuta = unir(base, 'cdn.config.mjs');
  if (!existe(cdnRuta)) {
    falta(5, `no existe ${cdnRuta}. Sin declarar sus externals, cada elemento empaqueta su ` +
             `framework entero y la idea fundacional del repo —veinte elementos, UN runtime— ` +
             `deja de cumplirse sin que nada falle.`);
  } else if (!/export\s+const\s+EXTERNALS\b/.test(leer(cdnRuta))) {
    falta(5, `${cdnRuta} no exporta EXTERNALS. Es la clave que el build lee.`);
  }

  // 7 ── los tokens traducidos, con su comprobación.
  //      Se exige el SCRIPT y no un fichero concreto: `_tokens-bridge.scss` es
  //      cómo lo expresa Angular, y el lenguaje de estilos de la siguiente
  //      plataforma puede ser otro. Lo que no cambia es que la traducción tenga
  //      quien la compruebe — sin eso, un bridge stale no lo ve nadie (G-1).
  if (pkg && !pkg.scripts?.['sync:tokens:check']) {
    falta(7, `${pkgRuta} no declara scripts["sync:tokens:check"]. Los tokens de ` +
             `vitals/core-assets hay que traducirlos al lenguaje de estilos de la plataforma, ` +
             `y esa traducción se DERIVA: sin comprobación, una copia stale pasa desapercibida.`);
  }

  // 8 ── el adaptador de montaje, y que sea el único que registra (#62).
  const adaptadores = fuentesDe(unir(base, 'libs'))
    .filter((f) => /implements\s+ElementProtocol\b/.test(sinComentarios(leer(f))));

  if (adaptadores.length === 0) {
    falta(8, `ninguna fuente bajo ${unir(base, 'libs')} implementa ElementProtocol. Esa interfaz ` +
             `vive en vitals/core y dice ser la que «every framework must implement to register ` +
             `a Web Component»: sin nadie que la implemente es un comentario con sintaxis.`);
  } else {
    const registranPorSuCuenta = fuentesDe(unir(base, 'apps'))
      .filter((f) => /customElements\.define\s*\(/.test(sinComentarios(leer(f))));

    if (registranPorSuCuenta.length > 0) {
      falta(8, `${registranPorSuCuenta.length} fuente(s) bajo ${unir(base, 'apps')} llaman a ` +
               `customElements.define por su cuenta (${registranPorSuCuenta.slice(0, 3).join(', ')}` +
               `${registranPorSuCuenta.length > 3 ? ', …' : ''}). El adaptador existe y no manda: ` +
               `así es como un contrato se queda de adorno sin que nada falle.`);
    }
  }

  return faltan;
}

/** Los comentarios fuera: un gate que mide su propia explicación no mide nada. */
function sinComentarios(fuente) {
  return String(fuente).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Todas las plataformas del disco contra el contrato, en líneas de error.
 *
 * @returns {string[]} Vacío es que cuadran.
 */
export function revisarContratoDePlataformas({ raiz, frameworks, ...io }) {
  const errores = [];

  for (const framework of frameworks) {
    const faltan = revisarPlataforma({ raiz, framework, ...io });
    if (faltan.length === 0) continue;

    errores.push(
      `platforms/${framework}/ no cumple ${faltan.length} de las ${OBLIGACIONES.length} ` +
        `obligaciones del contrato:\n` +
        faltan.map((f) => `    (${f.n}) ${f.titulo}\n        → ${f.detalle}`).join('\n'),
    );
  }

  return errores;
}
