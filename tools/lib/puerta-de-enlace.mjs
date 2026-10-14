/**
 * La puerta de enlace de `publish.mjs` (ADR 0140, revisión de D1, CMS#201): un elemento no se
 * publica si lo que importa del runtime no está en el runtime que su import map publicado nombra.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL CASO QUE CIERRA.
 *
 * Un elemento importa del runtime por su nombre —`import { x } from "@synergos/shared"`— y el
 * navegador lo enlaza contra el fichero que nombra el import map. Si ese fichero no exporta `x`,
 * el módulo NO ENLAZA («does not provide an export named x») y nada de esa app hidrata, sin un
 * rojo en ningún sitio: la página sigue en 200 con su SSR.
 *
 * Pasaba al publicar un elemento sin publicar el runtime que necesita: `release-cdn
 * --scope=elements` (la skill de publicar UN elemento) copia su `main.js`, y el mapa sigue
 * nombrando el `sg-shared` anterior, que no tiene el export nuevo. En local el CMS relee el mapa en
 * cada render, así que no hay ventana: está roto hasta que alguien publique el runtime.
 *
 * Lo que NO cierra, dicho para no mentir sobre su alcance: entre un despliegue del CDN y el
 * refresco del CMS en modo Http, el navegador puede bajar un elemento nuevo con el mapa viejo,
 * porque el `main.js` de un elemento se publica en una ruta que se sobrescribe. Eso lo cierra
 * publicar los elementos por contenido, como ya se publica el runtime.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * CÓMO. No se reimplementa el enlace: se le pide a esbuild, que ya es dependencia del repo. Se
 * empaquetan los elementos con sus nombres del runtime resueltos a los ficheros que nombra el
 * mapa —y nada más: lo que importan esos ficheros queda fuera—, y esbuild contesta lo mismo que el
 * navegador: «No matching export». Un nombre que el mapa no tiene también se dice: el navegador no
 * lo resolvería.
 */

import path from 'node:path';

/** Un especificador «desnudo»: lo que resuelve el import map, y no una ruta o una URL. */
const esDesnudo = (especificador) => !/^(\.{0,2}\/|[a-z][a-z0-9+.-]*:)/i.test(especificador);

/**
 * El fichero del CDN que nombra cada entrada del mapa, resuelto contra donde vive el mapa. Una URL
 * absoluta (un CDN local con su origen cableado) se toma por su ruta.
 *
 * @param {Record<string, string>} imports
 * @param {string} raizCdn la carpeta que sirve `/` (la que contiene `synergos/`)
 * @param {string} rutaDelMapa la ruta pública del mapa, p. ej. `/synergos/runtime/angular/latest/import-map.json`
 */
export function ficherosDelMapa(imports, raizCdn, rutaDelMapa) {
  const base = new URL(rutaDelMapa, 'http://cdn.invalid');
  return Object.fromEntries(
    Object.entries(imports).map(([nombre, url]) => [
      nombre,
      path.join(raizCdn, ...decodeURIComponent(new URL(url, base).pathname).split('/').filter(Boolean)),
    ]),
  );
}

/**
 * Enlaza los elementos contra el runtime publicado.
 *
 * @param {{
 *   elementos: { nombre: string, ruta: string }[],
 *   imports: Record<string, string>,
 *   raizCdn: string,
 *   rutaDelMapa: string,
 *   build: (opciones: object) => Promise<unknown>,
 * }} p `build` es el de esbuild (se inyecta para no atar la lógica a cómo se carga).
 * @returns {Promise<string[]>} los errores, uno por import que no enlaza; vacío si todo enlaza
 */
export async function revisarEnlace({ elementos, imports, raizCdn, rutaDelMapa, build }) {
  if (elementos.length === 0) return [];
  const ficheros = ficherosDelMapa(imports, raizCdn, rutaDelMapa);
  const porRuta = new Map(elementos.map((e) => [path.resolve(e.ruta), e.nombre]));
  const nombreDe = (fichero) => porRuta.get(path.resolve(fichero)) ?? fichero;
  const errores = [];

  try {
    await build({
      entryPoints: [...porRuta.keys()],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      logLevel: 'silent',
      outdir: path.join(raizCdn, '.puerta-de-enlace'),
      plugins: [
        {
          name: 'puerta-de-enlace',
          setup(b) {
            b.onResolve({ filter: /.*/ }, (a) => {
              if (a.kind === 'entry-point') return undefined;
              // Sólo se mira lo que importa el ELEMENTO; lo que importa el runtime queda fuera.
              if (!porRuta.has(path.resolve(a.importer)) || a.kind !== 'import-statement' || !esDesnudo(a.path)) {
                return { path: a.path, external: true };
              }
              if (!(a.path in ficheros)) {
                errores.push(`${nombreDe(a.importer)}: importa «${a.path}», que el import map no nombra.`);
                return { path: a.path, external: true };
              }
              return { path: ficheros[a.path] };
            });
          },
        },
      ],
    });
  } catch (err) {
    const especificadorDe = new Map(Object.entries(ficheros).map(([n, f]) => [path.resolve(f), n]));
    for (const e of err?.errors ?? [{ text: String(err?.message ?? err) }]) {
      const fichero = e.text.match(/No matching export in "([^"]+)"/)?.[1];
      const quien = e.location?.file ? nombreDe(path.resolve(e.location.file)) : 'un elemento';
      const de = fichero ? especificadorDe.get(path.resolve(fichero)) ?? fichero : null;
      const nombre = e.text.match(/for import "([^"]+)"/)?.[1];
      errores.push(
        de && nombre
          ? `${quien}: importa «${nombre}» de «${de}», y el runtime publicado (${path.basename(ficheros[de] ?? fichero)}) no lo exporta.`
          : `${quien}: ${e.text}`,
      );
    }
  }
  return errores;
}
