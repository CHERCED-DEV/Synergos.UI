import { Injectable, inject } from '@angular/core';
import { esRegistro, leerBooleano, leerTexto } from '@synergos/core';
import { LecturasDeLaConsola, type LecturaDeLaConsola } from './lecturas-de-la-consola';
import { legibles, readList } from './lectores-de-la-consola';
import {
  type SellerMessage,
  type SellerThread,
} from './consola.model';

/** Los hilos con quienes compran, y contestar uno (SH-7). */
@Injectable({ providedIn: 'root' })
export class MensajesDelVendedorApi {
  readonly #lecturas = inject(LecturasDeLaConsola);

  // ─── Mensajes / preguntas ────────────────────────────────────────────────────

  threads(apiBase: string): Promise<LecturaDeLaConsola<readonly SellerThread[]>> {
    return this.#lecturas.leer(apiBase, `${apiBase}/messages`, 'GET /api/shop/messages', normalizeThreads, mockThreads);
  }

  /**
   * Responde en el hilo. **`null` es «no salió»** (UI#92), la forma de las otras escrituras
   * de este cliente (#77).
   *
   * Devolvía un `msg-<ts>` con el texto y la fecha de hoy cuando el `POST` no llegaba, y la
   * consola lo pintaba en el hilo como enviado: el comprador nunca recibía la respuesta y el
   * vendedor creía haberla dado. **Y llegaba al `catch` aunque el borde SÍ la guardara**: el
   * CMS contesta el HILO entero (`ThreadDto`, con la respuesta al final de `messages`) y esto
   * leía un mensaje suelto en la raíz, así que el respaldo tapaba también el caso bueno
   * (regla 9). Por eso `normalizeReply` lee las dos formas: si sólo se quitara la
   * fabricación, una respuesta guardada saldría como «no se envió» e invitaría a mandarla
   * dos veces.
   */
  async reply(apiBase: string, threadId: string, body: string): Promise<SellerMessage | null> {
    const url = `${apiBase}/messages/${encodeURIComponent(threadId)}/reply`;
    try {
      const data = await this.#lecturas.postJson(apiBase, url, { body });
      const message = normalizeReply(data);
      if (message) {
        return message;
      }
      throw new Error('reply-shape');
    } catch (error) {
      // No pasa por `noSePudo`: eso es de las LECTURAS, y aquí no hay ejemplo que enseñar —
      // hay una respuesta que no salió.
      this.#lecturas.logger.warn('Shop seller API "POST /api/shop/messages/{id}/reply" — the reply was NOT sent.', error);
      return null;
    }
  }
}

function normalizeMessage(value: unknown, fallbackFrom: 'buyer' | 'seller'): SellerMessage | null {
  if (!esRegistro(value)) {
    return null;
  }
  const body = leerTexto(value['body']).trim() || leerTexto(value['text']).trim();
  if (!body) {
    return null;
  }
  const fromRaw = leerTexto(value['from']).trim().toLowerCase();
  return {
    id: leerTexto(value['id']).trim() || `msg-${Math.random().toString(36).slice(2, 8)}`,
    from: fromRaw === 'buyer' || fromRaw === 'seller' ? fromRaw : fallbackFrom,
    body,
    date: leerTexto(value['date']).trim(),
  };
}

/**
 * Lo que el borde devuelve al responder: el HILO entero (`ThreadDto` del CMS:
 * `{ threadId, messages: [{ messageId, from, body, sentAt }] }`), con la respuesta recién
 * guardada al final. Se toma ESA, con el id que le dio el servidor. Un mensaje suelto en la
 * raíz (`{ id, body, date }`) también se acepta. `from` del borde es un correo, así que la
 * autoría la pone quien la mandó: es la respuesta del vendedor.
 */
function normalizeReply(value: unknown): SellerMessage | null {
  if (!esRegistro(value) || !Array.isArray(value['messages'])) {
    return normalizeMessage(value, 'seller');
  }
  const last = value['messages'].at(-1);
  if (!esRegistro(last)) {
    return null;
  }
  const id = leerTexto(last['messageId']).trim() || leerTexto(last['id']).trim();
  const body = leerTexto(last['body']).trim();
  if (!id || !body) {
    return null;
  }
  return {
    id,
    from: 'seller',
    body,
    date: (leerTexto(last['sentAt']).trim() || leerTexto(last['date']).trim()).slice(0, 10),
  };
}

function normalizeThreads(value: unknown): readonly SellerThread[] | null {
  const list = readList(value, 'threads');
  if (!list) {
    return null;
  }
  const threads = list
    .map((entry): SellerThread | null => {
      if (!esRegistro(entry)) {
        return null;
      }
      const id = leerTexto(entry['id']).trim();
      const subject = leerTexto(entry['subject']).trim();
      if (!id || !subject) {
        return null;
      }
      const rawMessages = Array.isArray(entry['messages']) ? entry['messages'] : [];
      let messages = rawMessages
        .map((message) => normalizeMessage(message, 'buyer'))
        .filter((message): message is SellerMessage => message !== null);
      // Buyer-side thread shape only carries `lastMessage` — surface it as one message.
      const lastMessage = leerTexto(entry['lastMessage']).trim();
      if (messages.length === 0 && lastMessage) {
        messages = [
          {
            id: `${id}-last`,
            from: 'buyer',
            body: lastMessage,
            date: leerTexto(entry['date']).trim(),
          },
        ];
      }
      return {
        id,
        subject,
        counterpart:
          leerTexto(entry['counterpart']).trim() || leerTexto(entry['buyer']).trim(),
        date: leerTexto(entry['date']).trim(),
        unread: leerBooleano(entry['unread']),
        messages,
      };
    })
    .filter((thread): thread is SellerThread => thread !== null);
  return legibles(list, threads);
}

function mockThreads(): readonly SellerThread[] {
  return [
    {
      id: 'th-1',
      subject: 'Consulta sobre garantía · Audífonos Sony WH-1000XM5',
      counterpart: 'María G.',
      date: '2026-07-03',
      unread: true,
      messages: [
        {
          id: 'th-1-m1',
          from: 'buyer',
          body: '¿Tiene garantía oficial en Colombia?',
          date: '2026-07-03',
        },
      ],
    },
    {
      id: 'th-2',
      subject: 'Pedido ORD-2026-00512',
      counterpart: 'Andrea P.',
      date: '2026-06-29',
      unread: false,
      messages: [
        {
          id: 'th-2-m1',
          from: 'buyer',
          body: '¿Cuándo despachan mi pedido?',
          date: '2026-06-28',
        },
        {
          id: 'th-2-m2',
          from: 'seller',
          body: 'Tu pedido salió de bodega, llega mañana.',
          date: '2026-06-29',
        },
      ],
    },
    {
      id: 'th-3',
      subject: 'Pregunta · Mouse Logitech MX Master 3S',
      counterpart: 'Julián T.',
      date: '2026-06-27',
      unread: true,
      messages: [
        {
          id: 'th-3-m1',
          from: 'buyer',
          body: '¿Sirve para Mac y Windows a la vez?',
          date: '2026-06-27',
        },
      ],
    },
  ];
}
