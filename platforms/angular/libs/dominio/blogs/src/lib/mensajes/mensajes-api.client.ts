import { Injectable, inject } from '@angular/core';
import {
  esRegistro as isRecord,
  leerBandejaDelVertical,
  leerBooleano as readBoolean,
  leerNumero as readNumber,
  leerTexto as readString,
} from '@synergos/core';
import { BordeDeBlogs } from '../comun/borde-de-blogs';
import type { Author, DirectMessage, MessageThread, NewMessage } from '../comun/blogs.model';
import { buildMockThread, buildMockThreads } from '../comun/blogs.mock';
import { hiloDeMensajes } from '../comun/lecturas-de-blogs';
import { normalizeAuthor } from '../contenido/contenido-api.client';

/** Los mensajes directos de quien lee (012-blogs-social, I2). */
@Injectable({ providedIn: 'root' })
export class MensajesApi {
  readonly #borde: BordeDeBlogs = inject(BordeDeBlogs);

  // ─── Direct messages (SH-7 message-center) ──────────────────────────────────

  /**
   * `GET /api/blogs/messages` — la bandeja del member de la SESIÓN.
   *
   * Sin parámetro de identidad: el `?user=<handle>` era el IDOR (saber el handle de
   * alguien bastaba para leerle los mensajes directos) y el backend ya no lo mira.
   *
   * Con `lecturasBase`, la bandeja genérica (`GET {lecturasBase}/mensajes`, 012-blogs-social, I4): sólo los mensajes
   * directos, con la contraparte por su alias y su nombre; los míos, a nombre de `yo`.
   *
   * @throws {BlogsUnauthorizedError} si no hay sesión.
   */
  async messages(apiBase: string, lecturasBase = '', yo?: Author): Promise<readonly MessageThread[]> {
    if (lecturasBase) {
      try {
        return await this.#bandeja(lecturasBase, yo);
      } catch (error) {
        this.#borde.rethrowIfAuthError(error);
        this.#borde.markDegraded('GET /api/lecturas/{vertical}/mensajes', error);
        return buildMockThreads();
      }
    }
    const url = `${apiBase}/messages`;
    try {
      const data = await this.#borde.getJson(apiBase, url);
      const list = normalizeThreads(data);
      if (list) {
        return list;
      }
      throw new Error('messages-shape');
    } catch (error) {
      this.#borde.rethrowIfAuthError(error);
      this.#borde.markDegraded('GET /api/blogs/messages', error);
      return buildMockThreads();
    }
  }

  /**
   * `GET /api/blogs/thread/{id}` — the open conversation + materialised messages.
   *
   * @throws {BlogsUnauthorizedError} si no hay sesión.
   * Con `lecturasBase`, el hilo sale de la bandeja genérica, que trae los mensajes de cada uno. Uno que no está ahí
   * —el que se acaba de abrir desde un perfil, que sólo existe aquí hasta el primer mensaje— se pide a la interina,
   * como siempre.
   *
   * @throws {BlogsForbiddenError} si la conversación no es del viewer.
   */
  async thread(apiBase: string, threadId: string, lecturasBase = '', yo?: Author): Promise<MessageThread> {
    if (lecturasBase) {
      try {
        const hilo = (await this.#bandeja(lecturasBase, yo)).find((entrada) => entrada.id === threadId);
        if (hilo) {
          return hilo;
        }
      } catch (error) {
        this.#borde.rethrowIfAuthError(error);
        this.#borde.markDegraded('GET /api/lecturas/{vertical}/mensajes', error);
      }
    }
    const url = `${apiBase}/thread/${encodeURIComponent(threadId)}`;
    try {
      const data = await this.#borde.getJson(apiBase, url);
      const thread = normalizeThread(
        isRecord(data) && isRecord(data['thread']) ? data['thread'] : data,
      );
      if (thread) {
        return thread;
      }
      throw new Error('thread-shape');
    } catch (error) {
      this.#borde.rethrowIfAuthError(error);
      this.#borde.markDegraded('GET /api/blogs/thread/{id}', error);
      const seeded = buildMockThread(threadId);
      if (!seeded) {
        // Sin hilo sembrado con ESE id, se propaga: mejor "no se pudo abrir" que
        // abrir una conversación que no es la que se pidió.
        throw error;
      }
      return seeded;
    }
  }

  /**
   * `POST /api/blogs/message` `{ threadId, body }` → the persisted message.
   *
   * **Lanza si no salió** (UI#92): la burbuja «enviada» que sintetizaba con el servidor
   * caído le decía a quien escribía que el otro ya lo tenía.
   *
   * @throws {BlogsUnauthorizedError} si no hay sesión.
   * @throws {BlogsForbiddenError} si la conversación no es del viewer.
   * @throws {BlogsWriteFailedError} si el borde no lo guardó.
   */
  async sendMessage(apiBase: string, draft: NewMessage): Promise<DirectMessage> {
    const url = `${apiBase}/message`;
    try {
      const data = await this.#borde.postJson(apiBase, url, draft);
      const message = normalizeMessage(
        isRecord(data) && isRecord(data['message']) ? data['message'] : data,
        draft.threadId,
      );
      if (message) {
        return message;
      }
      throw new Error('message-shape');
    } catch (error) {
      // Sin sesión el mensaje NO se envió: sintetizarlo dejaría la burbuja en pantalla
      // como si hubiera salido. Se re-lanza para que la UI retire el optimista. Y con el
      // servidor caído tampoco salió: lo mismo, con otro tipo (UI#92).
      this.#borde.rethrowIfAuthError(error);
      this.#borde.writeFailed('POST /api/blogs/message', error);
    }
  }

  async #bandeja(lecturasBase: string, yo?: Author): Promise<readonly MessageThread[]> {
    const hilos = leerBandejaDelVertical(await this.#borde.getJson(lecturasBase, `${lecturasBase}/mensajes`));
    if (!hilos) {
      throw new Error('mensajes-shape');
    }
    return hilos.map((hilo) => hiloDeMensajes(hilo, yo));
  }
}

// ─── DM normalisers ─────────────────────────────────────────────────────────────

function normalizeMessage(value: unknown, threadId: string): DirectMessage | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const author = normalizeAuthor(value['author']);
  if (!id || !author) {
    return null;
  }
  return {
    id,
    threadId: readString(value['threadId']).trim() || threadId,
    author,
    body: readString(value['body']).trim(),
    createdAtUtc: readString(value['createdAtUtc']).trim() || new Date().toISOString(),
    outgoing: readBoolean(value['outgoing']),
  };
}

function normalizeThread(value: unknown): MessageThread | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = readString(value['id']).trim();
  const participant = normalizeAuthor(value['participant'] ?? value['author']);
  if (!id || !participant) {
    return null;
  }
  const rawMessages = Array.isArray(value['messages']) ? value['messages'] : [];
  const messages = rawMessages
    .map((entry) => normalizeMessage(entry, id))
    .filter((entry): entry is DirectMessage => entry !== null);
  const last = messages[messages.length - 1];
  return {
    id,
    participant,
    lastMessage: readString(value['lastMessage']).trim() || last?.body || '',
    lastAtUtc: readString(value['lastAtUtc']).trim() || last?.createdAtUtc || new Date().toISOString(),
    unread: Math.trunc(readNumber(value['unread'])),
    messages,
  };
}

function normalizeThreads(value: unknown): readonly MessageThread[] | null {
  const list = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value['threads'])
      ? value['threads']
      : null;
  if (!list) {
    return null;
  }
  return list.map(normalizeThread).filter((entry): entry is MessageThread => entry !== null);
}
