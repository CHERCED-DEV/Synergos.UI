import type { ElementoDelCatalogo, FacetaDelListado, HiloDeLaBandeja } from '@synergos/core';
import type {
  Author,
  DirectMessage,
  MessageThread,
  ObjectKind,
  Post,
  ReactionCount,
  ReactionState,
  ReactionType,
  TrendingTag,
} from './blogs.model';

/**
 * Las lecturas genéricas de Blogs (`api/lecturas/blogs`, 012-blogs-social, I4) a los tipos de la app: una publicación
 * del catálogo de la red es un {@link Post} y un hilo de la bandeja, un {@link MessageThread}. Las pantallas no cambian;
 * cambia de dónde leen. Los atributos son los que emite `CatalogoDeBlogs` en el CMS.
 */

const TIPOS_DE_REACCION: readonly ReactionType[] = ['like', 'love', 'celebrate', 'insightful'];

/** El campo de la faceta de etiqueta en el catálogo de la red (`?filtro.etiqueta=`). */
export const CAMPO_ETIQUETA = 'etiqueta';

function esTipoDeReaccion(valor: string): valor is ReactionType {
  return (TIPOS_DE_REACCION as readonly string[]).includes(valor);
}

function valores(valor: string | undefined): readonly string[] {
  return (valor ?? '')
    .split(',')
    .map((entrada) => entrada.trim())
    .filter((entrada) => entrada !== '');
}

function entero(valor: string | undefined): number {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.trunc(numero) : 0;
}

/**
 * Una ruta del sitio o una URL http(s); cualquier otra cosa —un `javascript:`, un `//otro.sitio`— no, y la tarjeta abre
 * la publicación dentro de la red. La misma regla que `pageUrl` en la interina.
 */
export function paginaSegura(valor: string | undefined): string {
  const url = (valor ?? '').trim();
  return /^\/(?![/\\])/.test(url) || /^https?:\/\//i.test(url) ? url : '';
}

/** `like:2,love:1` y la reacción de quien lee, como el estado que pinta la tarjeta. */
function reacciones(atributos: Readonly<Record<string, string>>): ReactionState {
  const counts: ReactionCount[] = [];
  for (const par of valores(atributos['reacciones'])) {
    const [tipo = '', cantidad] = par.split(':');
    if (esTipoDeReaccion(tipo)) {
      counts.push({ type: tipo, count: entero(cantidad) });
    }
  }
  const mia = (atributos['miReaccion'] ?? '').trim();
  return {
    counts,
    mine: esTipoDeReaccion(mia) ? mia : null,
    total: counts.reduce((suma, entrada) => suma + entrada.count, 0),
  };
}

function tipoDeObjeto(tipo: string | undefined): ObjectKind {
  switch ((tipo ?? '').trim().toLowerCase()) {
    case 'article':
      return 'postPage';
    case 'lesson':
      return 'lesson';
    default:
      return 'post';
  }
}

/** Alguien por su cara pública, sin cifras: la lectura genérica no las trae. */
function autor(id: string, alias: string, nombre: string, imagen = '', verificado = false): Author {
  return {
    actorKey: id || alias,
    handle: alias || id,
    displayName: nombre || alias || id,
    bio: '',
    avatarUrl: imagen,
    bannerUrl: '',
    verified: verificado,
    followersCount: 0,
    followingCount: 0,
    postsCount: 0,
  };
}

/** Una publicación del catálogo de la red, o `null` si no dice quién la firma. */
export function postDelCatalogo(elemento: ElementoDelCatalogo): Post | null {
  const a = elemento.atributos;
  const id = (a['autorId'] ?? '').trim();
  const alias = (a['alias'] ?? '').trim();
  if (!id && !alias) {
    return null;
  }
  const pageUrl = paginaSegura(a['pagina']);
  return {
    ...(pageUrl ? { pageUrl } : {}),
    id: elemento.id,
    author: autor(id, alias, (a['autor'] ?? '').trim(), (a['autorImagen'] ?? '').trim(), a['verificado'] === 'si'),
    objectKind: tipoDeObjeto(a['tipo']),
    body: (a['cuerpo'] ?? '').trim(),
    media: elemento.imagen ? [{ url: elemento.imagen, kind: 'image', alt: (a['imagenAlt'] ?? '').trim() }] : [],
    hashtags: valores(a['etiquetas']),
    mentions: valores(a['menciones']),
    createdAtUtc: (a['fecha'] ?? '').trim() || new Date().toISOString(),
    reactions: reacciones(a),
    commentCount: entero(a['comentarios']),
    repostCount: entero(a['republicaciones']),
    reposted: false,
  };
}

/** Las etiquetas de un listado del catálogo de la red, con cuántas publicaciones las llevan. */
export function etiquetasDelListado(facetas: readonly FacetaDelListado[]): readonly TrendingTag[] {
  const faceta = facetas.find((entrada) => entrada.campo === CAMPO_ETIQUETA);
  return (faceta?.valores ?? []).map((valor) => ({ tag: valor.valor.replace(/^#/, ''), postCount: valor.cantidad }));
}

/**
 * Un hilo de la bandeja de los mensajes directos. La contraparte llega por su alias, y su nombre es el asunto; los
 * mensajes de quien lee salen a nombre de `yo` si se sabe, y si no, por el alias con que los firma.
 */
export function hiloDeMensajes(hilo: HiloDeLaBandeja, yo?: Author): MessageThread {
  const participant = autor(hilo.contraparte, hilo.contraparte, hilo.asunto);
  const messages = hilo.mensajes.map(
    (mensaje): DirectMessage => ({
      id: mensaje.id,
      threadId: hilo.id,
      author: mensaje.mio ? (yo ?? autor(mensaje.de, mensaje.de, mensaje.de)) : participant,
      body: mensaje.texto,
      createdAtUtc: mensaje.fecha,
      outgoing: mensaje.mio,
    }),
  );
  const ultimo = messages[messages.length - 1];
  return {
    id: hilo.id,
    participant,
    lastMessage: hilo.ultimo || ultimo?.body || '',
    lastAtUtc: hilo.fecha || ultimo?.createdAtUtc || new Date().toISOString(),
    unread: 0,
    messages,
  };
}
