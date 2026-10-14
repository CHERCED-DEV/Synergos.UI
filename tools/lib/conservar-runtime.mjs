/**
 * `build:cdn` conserva las generaciones del runtime ya publicadas (ADR 0140, CMS#201).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ HACE FALTA, Y POR QUÉ NO ES OPCIONAL.
 *
 * El runtime se publica por contenido (`runtime-por-contenido.mjs`): el import
 * map nombra `sg-shared.<huella>.js`, y esa URL es inmutable un año. Pero
 * `build:cdn` arma el CDN DESDE CERO —borra la salida para no arrastrar
 * huérfanos— y publica sólo la generación de hoy. Sin conservar, el despliegue
 * siguiente borraría la generación anterior, y quien todavía tenga un mapa que
 * la nombre —un navegador con la página abierta, un CMS que aún no releyó el
 * suyo— pediría una URL que ya no existe: 404 y nada hidrata.
 *
 * Así que antes de publicar se recupera lo que ya estaba publicado, verificando
 * cada fichero contra su huella:
 *
 *   - de la salida anterior (`public/`), si está, sin red;
 *   - del CDN vivo, lo que falte. El origen por defecto es el CDN público del
 *     proyecto; `--conservar-desde` o `SYNERGOS_CDN_CONSERVAR_DESDE` lo
 *     sobrescriben.
 *
 * LAS REGLAS, Y TODAS FALLAN SEGURO:
 *
 *   - el origen es un ORIGEN (esquema y host), como lo lee el humo: una ruta
 *     que traiga se ignora y se dice. Con ella, el libro se pedía en
 *     `<ruta>/synergos/…`, daba 404 y se tomaba por «primer despliegue»
 *     mientras el humo, que la ignora, salía verde.
 *   - el origen contesta y NO tiene libro (404) → no hay nada que conservar: es
 *     el primer despliegue por contenido. Se avisa y se sigue. PERO sólo si el
 *     origen es un CDN de Synergos —sirve su `registry.json`—: un host que
 *     contesta 404 a todo (otro Worker, una errata) no prueba que no haya nada
 *     que conservar, y PARA.
 *   - tiene libro → se baja cada fichero que falte, y uno cuyo sha256 no casa
 *     con el libro o con su nombre PARA.
 *   - el origen no contesta (red, 5xx, cualquier otro estado) → PARA, con lo
 *     que hay que hacer. No se publica sin conservar.
 *   - `--sin-conservar` o `SYNERGOS_CDN_CONSERVAR=no` → no se conserva nada, y
 *     se dice en voz alta. Es para un CDN que no se despliega (el humo conectado
 *     del CMS), no para producción; y la salida lleva la MARCA
 *     (`MARCA_SIN_CONSERVAR`), que la puerta de `wrangler deploy`
 *     (`tools/cdn-desplegable.mjs`) no deja publicar.
 *
 * Se hace al EMPEZAR `build:cdn`, antes de compilar y de borrar nada: si el
 * origen no contesta, se sabe en un segundo y la salida anterior sigue intacta.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Todo es por framework, desde `FICHEROS_POR_FRAMEWORK`; el disco y la red se
 * inyectan, que es lo que deja ver fallar cada regla sin tocar internet.
 */

import path from 'node:path';

import { RUNTIME } from './cdn-cache-policy.mjs';
import { FICHEROS_POR_FRAMEWORK } from './mapa-del-runtime.mjs';
import { leerBandera } from './cli-utils.mjs';
import {
  LIBRO,
  LARGO_DE_LA_HUELLA,
  escribirAtomico,
  fusionarLibro,
  huellaDelNombre,
  leerLibro,
  libroVacio,
  rutaEnElRuntime,
  serializarLibro,
  sha256De,
} from './runtime-por-contenido.mjs';

/** El CDN público del proyecto: el mismo que mira el humo de `despliegue-cdn.yml`. */
export const ORIGEN_POR_DEFECTO = 'https://synergos-ui.synergos-labs.workers.dev';

/** Los frameworks cuyo runtime se conserva: los que tienen tabla de ficheros. */
export const FRAMEWORKS = Object.keys(FICHEROS_POR_FRAMEWORK);

/**
 * Qué conservar y de dónde, leído de la línea de órdenes y del entorno.
 *
 * @returns {{ conservar: true, origen: string, deDonde: string }
 *         | { conservar: false, porque: string }
 *         | { error: string }}
 */
export function configuracionDeConservar(argv, env = {}) {
  if (argv.includes('--sin-conservar')) return { conservar: false, porque: '--sin-conservar' };

  const interruptor = env.SYNERGOS_CDN_CONSERVAR ?? '';
  if (interruptor === 'no') return { conservar: false, porque: 'SYNERGOS_CDN_CONSERVAR=no' };
  if (interruptor !== '' && interruptor !== 'si') {
    return { error: `SYNERGOS_CDN_CONSERVAR=${interruptor} no se entiende: «no» para no conservar, o «si».` };
  }

  const bandera = leerBandera(argv, 'conservar-desde');
  const variable = env.SYNERGOS_CDN_CONSERVAR_DESDE || null;
  const [origen, deDonde] = bandera
    ? [bandera, '--conservar-desde']
    : variable
      ? [variable, 'SYNERGOS_CDN_CONSERVAR_DESDE']
      : [ORIGEN_POR_DEFECTO, 'por defecto'];

  let url = null;
  try {
    url = /^https?:\/\/[^/]/.test(origen) ? new URL(origen) : null;
  } catch {
    url = null;
  }
  if (!url) {
    return { error: `${deDonde}=${origen} no es una URL http(s) del CDN del que conservar.` };
  }
  // Su ORIGEN, como lo lee el humo (`new URL('/synergos/…', base)` ignora la ruta): los dos miran el
  // mismo sitio. Una ruta se dice, no se usa.
  const ruta = url.pathname.replace(/\/+$/, '');
  return {
    conservar: true,
    origen: url.origin,
    deDonde,
    ...(ruta || url.search ? { aviso: `${deDonde}=${origen} trae una ruta: se conserva desde su origen ${url.origin}, que es lo que mira el humo.` } : {}),
  };
}

/** La línea, ruidosa a propósito, de un `build:cdn` que no conserva nada. */
export function lineaDeNoConservar(porque) {
  return (
    `⚠ ${porque}: NO se conservan las generaciones del runtime ya publicadas. Este CDN no debe ` +
    `desplegarse: quien aún tenga un mapa anterior pediría URLs que acá no existen.`
  );
}

/**
 * La marca que deja en la salida un `build:cdn` que no conservó. Sin ella nada distinguía ese
 * `public/` de uno bueno: un `wrangler deploy` a mano lo publicaba, y el despliegue siguiente
 * tomaba su libro truncado por la verdad.
 */
export const MARCA_SIN_CONSERVAR = 'sin-conservar.json';

/** Deja la marca en la raíz de la salida: por qué no se conservó y cuándo. */
export async function marcarSinConservar({ salida, fs, porque, ahora = new Date() }) {
  const marca = { porque, cuando: ahora.toISOString(), desplegable: false };
  await escribirAtomico(fs, path.join(salida, MARCA_SIN_CONSERVAR), Buffer.from(`${JSON.stringify(marca, null, 2)}\n`));
}

/**
 * Si la salida se puede desplegar: no lo es una construida sin conservar. Es lo que corre la puerta
 * de `wrangler deploy` (`wrangler.jsonc`, `build.command`).
 *
 * @returns {Promise<{ ok: true } | { ok: false, motivo: string }>}
 */
export async function revisarDesplegable({ salida, fs }) {
  const marca = await leerSiExiste(fs, path.join(salida, MARCA_SIN_CONSERVAR));
  if (marca === null) return { ok: true };
  let porque = '';
  try {
    porque = JSON.parse(String(marca)).porque ?? '';
  } catch {
    porque = '';
  }
  return {
    ok: false,
    motivo:
      `${path.join(salida, MARCA_SIN_CONSERVAR)}: esta salida se construyó SIN conservar el runtime ya ` +
      `publicado${porque ? ` (${porque})` : ''}. Desplegarla borraría las generaciones que aún nombra ` +
      `quien tenga un mapa anterior, y el despliegue siguiente tomaría su libro truncado por la verdad. ` +
      `Constrúyela otra vez con npm run build:cdn, que conserva.`,
  };
}

/** Los bytes de un fichero, o `null` si no está. Cualquier otro error sube. */
async function leerSiExiste(fs, ruta) {
  try {
    return await fs.readFile(ruta);
  } catch (err) {
    if (err?.code === 'ENOENT') return null;
    throw err;
  }
}

const relativaDe = (entrada, framework) => {
  const ruta = rutaEnElRuntime(entrada.url, framework);
  if (!ruta) throw new Error(`${framework}: el libro nombra ${entrada.url}, que no es de runtime/${framework}/.`);
  return ruta;
};

/** Que unos bytes son los que el libro dice, y los que su nombre dice. Si no, PARA. */
function verificar(entrada, ruta, bytes, deDonde) {
  const sha = sha256De(bytes);
  if (sha !== entrada.sha256) {
    throw new Error(
      `${ruta.relativa} (${deDonde}): su sha256 es ${sha} y el libro dice ${entrada.sha256}. ` +
        `No se conserva un fichero con huella que no es el que se publicó.`,
    );
  }
  if (huellaDelNombre(ruta.nombre) !== sha.slice(0, LARGO_DE_LA_HUELLA)) {
    throw new Error(`${ruta.relativa} (${deDonde}): sus bytes no casan con la huella de su nombre.`);
  }
}

/**
 * Copia a `tmp` lo que la salida anterior tiene publicado por contenido: el
 * libro de cada framework y los ficheros que lista. Sin red.
 *
 * Un fichero que el libro lista y no está se deja para el origen; un libro
 * ilegible PARA —reemplazarlo por nada perdería sus generaciones—.
 */
export async function guardarAntesDeLimpiar({ salida, tmp, fs, frameworks = FRAMEWORKS }) {
  const resumen = {};
  for (const framework of frameworks) {
    const raiz = path.join(salida, 'synergos', RUNTIME, framework);
    const texto = await leerSiExiste(fs, path.join(raiz, 'latest', LIBRO));
    if (texto === null) continue;

    const libro = leerLibro(String(texto), framework);
    let ficheros = 0;
    for (const entrada of libro.entradas) {
      const ruta = relativaDe(entrada, framework);
      const bytes = await leerSiExiste(fs, path.join(raiz, ruta.relativa));
      if (bytes === null) continue;
      verificar(entrada, ruta, bytes, 'la salida anterior');
      await escribirAtomico(fs, path.join(tmp, framework, ruta.relativa), bytes);
      ficheros += 1;
    }
    await escribirAtomico(fs, path.join(tmp, framework, 'latest', LIBRO), Buffer.from(serializarLibro(libro)));
    resumen[framework] = { entradas: libro.entradas.length, ficheros };
  }
  return resumen;
}

/**
 * Un GET al origen que aguanta un parpadeo de la red.
 *
 * Sin respuesta o con un 5xx se reintenta un par de veces antes de rendirse:
 * medido en la integración, un `fetch failed` suelto contra el CDN público
 * paraba un `build:cdn` que un segundo después habría pasado. Un 404, un 200
 * o cualquier otro 4xx SON respuestas y se devuelven en el acto. Agotados los
 * intentos, sin red LANZA y con un 5xx lo devuelve: quien llama para igual.
 *
 * @param {{ intentos?: number, espera?: number, esperar?: (ms: number) => Promise<void> }} [reintentos]
 */
async function pedirAlOrigen(fetch, url, { intentos = 3, espera = 1000, esperar } = {}) {
  const dormir = esperar ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  for (let intento = 1; ; intento += 1) {
    let respuesta = null;
    let error = null;
    try {
      respuesta = await fetch(url);
    } catch (err) {
      error = err;
    }
    const reintentable = error !== null || respuesta.status >= 500;
    if (!reintentable || intento >= intentos) {
      if (error !== null) {
        throw new Error(`el origen no contesta (${url}): ${error?.message ?? error} (${intento} intento(s)).`);
      }
      return respuesta;
    }
    await respuesta?.body?.cancel?.();
    await dormir(espera * intento);
  }
}

/**
 * El libro del CDN vivo, o `null` si el origen contesta que no lo tiene (404).
 * Cualquier otra cosa —sin red, un 5xx, un 403— LANZA: no saber no es «no hay».
 */
export async function leerLibroVivo({ origen, framework, fetch, reintentos }) {
  const url = `${origen}/synergos/${RUNTIME}/${framework}/latest/${LIBRO}`;
  const respuesta = await pedirAlOrigen(fetch, url, reintentos);
  if (respuesta.status === 404) {
    await respuesta.body?.cancel?.();
    return null;
  }
  if (respuesta.status !== 200) {
    await respuesta.body?.cancel?.();
    throw new Error(`el origen contesta ${respuesta.status} a ${url}: no se sabe qué tiene publicado.`);
  }
  return leerLibro(await respuesta.text(), framework);
}

/**
 * Que el origen ES un CDN de Synergos: sirve su `registry.json`, con sus elementos. Sin esto, el 404
 * del libro no dice nada —un host que contesta 404 a todo también lo da— y se tomaba por «primer
 * despliegue»: se publicaba sin conservar, sin un solo rojo. LANZA si no lo es o no se sabe.
 */
export async function comprobarQueEsElCdn({ origen, fetch, reintentos }) {
  const url = `${origen}/synergos/registry.json`;
  const respuesta = await pedirAlOrigen(fetch, url, reintentos);
  const texto = respuesta.status === 200 ? await respuesta.text() : null;
  if (texto === null) await respuesta.body?.cancel?.();
  let registro = null;
  try {
    registro = texto === null ? null : JSON.parse(texto);
  } catch {
    registro = null;
  }
  if (!Array.isArray(registro?.elements)) {
    throw new Error(
      `${origen} no tiene el libro del runtime, y ${url} ${texto === null ? `contesta ${respuesta.status}` : 'no es un registry'}: ` +
        `no parece el CDN de Synergos (¿una errata en la URL, otro Worker?). Su 404 no prueba que no haya nada que conservar.`,
    );
  }
}

/**
 * Completa `tmp` con el CDN vivo: fusiona su libro con el de la salida anterior
 * y baja, verificando, cada fichero que falte.
 *
 * @returns {Promise<Record<string, { vivo: boolean, entradas: number, bajados: number }>>}
 */
export async function bajarDelOrigen({ tmp, origen, fetch, fs, frameworks = FRAMEWORKS, log = () => {}, reintentos }) {
  const resumen = {};
  let esElCdn = false;
  for (const framework of frameworks) {
    const vivo = await leerLibroVivo({ origen, framework, fetch, reintentos });
    const rutaLibro = path.join(tmp, framework, 'latest', LIBRO);
    const textoLocal = await leerSiExiste(fs, rutaLibro);
    const local = textoLocal === null ? libroVacio(framework) : leerLibro(String(textoLocal), framework);

    if (vivo === null) {
      // Un 404 sólo es «primer despliegue» si quien lo contesta es el CDN: se pregunta una vez.
      if (!esElCdn) {
        await comprobarQueEsElCdn({ origen, fetch, reintentos });
        esElCdn = true;
      }
      log(
        `⚠ ${framework}: ${origen} no tiene latest/${LIBRO} (404). No hay generaciones vivas que conservar: ` +
          `es el primer despliegue del runtime por contenido.`,
      );
    }

    const libro = fusionarLibro(local, vivo?.entradas ?? []);
    let bajados = 0;
    for (const entrada of libro.entradas) {
      const ruta = relativaDe(entrada, framework);
      const destino = path.join(tmp, framework, ruta.relativa);
      if ((await leerSiExiste(fs, destino)) !== null) continue;

      const url = `${origen}/synergos/${RUNTIME}/${framework}/${ruta.relativa}`;
      const respuesta = await pedirAlOrigen(fetch, url, reintentos);
      if (respuesta.status !== 200) {
        await respuesta.body?.cancel?.();
        throw new Error(
          `el libro declara ${ruta.relativa} y el origen contesta ${respuesta.status} (${url}). ` +
            `Una generación publicada que no se puede recuperar no se da por perdida en silencio.`,
        );
      }
      const bytes = Buffer.from(await respuesta.arrayBuffer());
      verificar(entrada, ruta, bytes, url);
      await escribirAtomico(fs, destino, bytes);
      bajados += 1;
    }

    if (libro.entradas.length > 0) await escribirAtomico(fs, rutaLibro, Buffer.from(serializarLibro(libro)));
    resumen[framework] = { vivo: vivo !== null, entradas: libro.entradas.length, bajados };
  }
  return resumen;
}

/**
 * Devuelve a la salida, ya limpia, lo que se conservó en `tmp`: cada fichero
 * con huella en su sitio y el libro de cada framework. Sin red, y verificando
 * otra vez cada fichero contra el libro. No borra nada de `tmp`.
 */
export async function restaurarDespuesDeLimpiar({ salida, tmp, fs, frameworks = FRAMEWORKS }) {
  const resumen = {};
  for (const framework of frameworks) {
    const texto = await leerSiExiste(fs, path.join(tmp, framework, 'latest', LIBRO));
    if (texto === null) continue;

    const libro = leerLibro(String(texto), framework);
    const raiz = path.join(salida, 'synergos', RUNTIME, framework);
    for (const entrada of libro.entradas) {
      const ruta = relativaDe(entrada, framework);
      const bytes = await leerSiExiste(fs, path.join(tmp, framework, ruta.relativa));
      if (bytes === null) {
        throw new Error(
          `${framework}: el libro conservado declara ${ruta.relativa} y no se pudo recuperar. ` +
            `Publicar sin él es un 404 para quien aún tenga el mapa que lo nombra.`,
        );
      }
      verificar(entrada, ruta, bytes, 'lo conservado');
      await escribirAtomico(fs, path.join(raiz, ruta.relativa), bytes);
    }
    await escribirAtomico(fs, path.join(raiz, 'latest', LIBRO), Buffer.from(serializarLibro(libro)));
    resumen[framework] = { entradas: libro.entradas.length };
  }
  return resumen;
}
