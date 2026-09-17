/**
 * tools/lib/indice-publicado.mjs
 *
 * El índice que abre un visitante no puede nombrar un elemento que el CDN no
 * sirve (#48).
 *
 * QUÉ PASÓ. `build-cdn.mjs` COPIABA el `catalog.html` versionado en la raíz —una
 * salida commiteada como si fuera una entrada— y su última escritura fue el
 * 2026-08-04, el commit de la purga: capturó el catálogo ANTERIOR, con los
 * elementos de las plataformas que ese mismo commit borraba. Medido contra la URL
 * pública: 141 nombres en el índice, 130 en el registry, y `quiz-flow` y
 * `rating-widget` contestando 404. Seis semanas.
 *
 * POR QUÉ NO LO VIO NADIE. `humo-cdn` comprueba que el índice RESPONDA —200 y con
 * cuerpo— y eso era cierto: el fichero estaba, bien formado y lleno. Lo que nadie
 * cruzaba era su CONTENIDO contra lo que hay al lado. Es el mismo reparto que dejó
 * el import map del CMS sin vigilar: cada mitad en verde y el hueco justo en medio.
 *
 * EL TELL, para reconocerlo en otro sitio: un artefacto GENERADO que está
 * versionado y que alguien COPIA en vez de regenerar. Mientras se copie, su
 * frescura depende de que una persona se acuerde — y el día que no se acuerde no
 * falla nada, porque un fichero viejo se sirve igual de bien que uno nuevo.
 */

/**
 * Los nombres de elemento que el índice anuncia.
 *
 * Se leen del atributo `data-name` que `catalog.mjs` pone en cada tarjeta, y no
 * del texto: el texto lleva también el tag y el alias, así que contarlo daría de
 * más y un gate que cuenta de más se relaja hasta que deja de servir.
 */
export function nombresDelIndice(html) {
  return [...html.matchAll(/data-name="([^"]+)"/g)].map((m) => m[1]);
}

/**
 * Los elementos que el árbol publicado sirve de verdad: los que tienen al menos
 * un bundle bajo algún framework.
 *
 * Se RECORRE el árbol en vez de preguntar por una ruta — la lección de #44: un
 * gate que construye la ruta de lo que mide sólo confirma lo que ya suponía.
 */
export function nombresPublicados({ raizSynergos, listarDirs, existe, unir }) {
  const publicados = [];

  for (const elemento of listarDirs(raizSynergos)) {
    if (elemento === 'runtime') continue;

    const conBundle = listarDirs(unir(raizSynergos, elemento)).some((framework) =>
      listarDirs(unir(raizSynergos, elemento, framework)).some((slot) =>
        existe(unir(raizSynergos, elemento, framework, slot, 'main.js'))));

    if (conBundle) publicados.push(elemento);
  }

  return publicados;
}

/**
 * Los que el índice anuncia y el registry ya no conoce.
 *
 * **Éste es el criterio, y la primera versión de este gate tenía otro.** Empecé
 * exigiendo que todo lo anunciado tuviera bundle, y eso afirma algo que no es:
 * el catálogo **no enlaza a ningún bundle** —comprobado, cero `<a href>`— y lo
 * que no está publicado sale marcado «Not published» con su insignia
 * `fw-inactive`. O sea que anunciar un elemento declarado y todavía sin
 * construir es HONESTO, y un gate que lo prohibiera estaría pidiendo que el
 * catálogo enseñe menos de lo que el editor puede colocar.
 *
 * Lo que de verdad pasó es otra cosa: el índice nombraba elementos **que el
 * registry ya no conoce** —`quiz-flow`, `rating-widget`, los de las plataformas
 * que la purga borró—, porque era una copia congelada el 2026-08-04. Esos sí
 * son un 404 con el nombre escrito en la portada.
 *
 * Y el corte importa porque los dos casos se ven igual en la página: los dos
 * salen sin versión. Lo que los separa no es cómo se ven, es si alguien puede
 * construirlos.
 */
export function anunciadosFueraDelRegistry(html, nombresDelRegistry) {
  const declarado = new Set(nombresDelRegistry);
  return nombresDelIndice(html).filter((n) => !declarado.has(n));
}

/**
 * Lo que el índice anuncia SIN bundle y SIN marcar como no publicado.
 *
 * La otra mitad: mientras lo no construido lleve su insignia, el índice dice la
 * verdad. El día que alguien quite el marcado —o que `CDN_ROOT` apunte a un
 * sitio que no existe, que es lo que pasaba fuera de la máquina del arquitecto—
 * la página pasa a prometer 132 elementos cargables y sólo hay 130.
 */
export function anunciadosSinMarcaNiBundle(html, publicados) {
  const sirve = new Set(publicados);

  return nombresDelIndice(html).filter((nombre) => {
    if (sirve.has(nombre)) return false;
    const tarjeta = recortarTarjeta(html, nombre);
    return tarjeta !== null && !tarjeta.includes('fw-inactive');
  });
}

/** El cuerpo de una tarjeta, de su `data-name` al cierre de su `</article>`. */
function recortarTarjeta(html, nombre) {
  const inicio = html.indexOf(`data-name="${nombre}"`);
  if (inicio === -1) return null;
  const fin = html.indexOf('</article>', inicio);
  return fin === -1 ? html.slice(inicio) : html.slice(inicio, fin);
}
