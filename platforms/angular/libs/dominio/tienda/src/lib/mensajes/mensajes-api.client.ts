import { Injectable, inject } from '@angular/core';
import { esRegistro, leerBandejaDelVertical, leerBooleano, leerJsonDelBorde, leerTexto } from '@synergos/core';
import { LecturasDeLaTienda } from '../comun/lecturas';
import type { MessageThread } from './mensajes.model';

/** Los hilos de quien compra con quien vende (`GET /messages`, mensajería v1). */
@Injectable({ providedIn: 'root' })
export class MensajesApi {
  readonly #lecturas: LecturasDeLaTienda = inject(LecturasDeLaTienda);

  // ─── Messages (mensajería v1) ────────────────────────────────────────────────

  /**
   * La bandeja. Con `lecturasBase`, la genérica (`GET {lecturasBase}/mensajes`, 014-despiece-tienda, I4): sólo los
   * hilos de la tienda, cada uno con su asunto. La interina manda `threadId` y ningún asunto, así que con ella esta
   * lectura descarta todos los hilos y pinta una bandeja vacía.
   */
  async messages(apiBase: string, lecturasBase = ''): Promise<readonly MessageThread[]> {
    const url = `${apiBase}/messages`;
    const endpoint = lecturasBase ? 'GET /api/lecturas/{vertical}/mensajes' : 'GET /api/shop/messages';
    try {
      const threads = lecturasBase
        ? leerHilos(await leerJsonDelBorde(lecturasBase, `${lecturasBase}/mensajes`))
        : normalizeThreads(await leerJsonDelBorde(apiBase, url));
      if (threads) {
        return threads;
      }
      throw new Error('messages-shape');
    } catch (error) {
      this.#lecturas.markDegraded(endpoint, error);
      return mockThreads();
    }
  }
}

/**
 * Los hilos de la bandeja genérica, leídos con el lector común de `@synergos/core` (012-blogs-social, I4). Sin asunto
 * no son de la tienda. Sin acuses de lectura en la mensajería v1: ninguno sale como «sin leer».
 */
function leerHilos(value: unknown): readonly MessageThread[] | null {
  const hilos = leerBandejaDelVertical(value);
  if (!hilos) {
    return null;
  }
  return hilos
    .filter((hilo) => hilo.asunto !== '')
    .map((hilo): MessageThread => ({
      id: hilo.id,
      subject: hilo.asunto,
      counterpart: hilo.contraparte,
      lastMessage: hilo.ultimo,
      date: hilo.fecha.slice(0, 10),
      unread: false,
    }));
}

function normalizeThreads(value: unknown): readonly MessageThread[] | null {
  const list = Array.isArray(value)
    ? value
    : esRegistro(value) && Array.isArray(value['threads'])
      ? value['threads']
      : null;
  if (!list) {
    return null;
  }
  return list
    .map((entry): MessageThread | null => {
      if (!esRegistro(entry)) {
        return null;
      }
      const id = leerTexto(entry['id']).trim();
      const subject = leerTexto(entry['subject']).trim();
      if (!id || !subject) {
        return null;
      }
      return {
        id,
        subject,
        counterpart: leerTexto(entry['counterpart']).trim() || leerTexto(entry['seller']).trim(),
        lastMessage: leerTexto(entry['lastMessage']).trim(),
        date: leerTexto(entry['date']).trim(),
        unread: leerBooleano(entry['unread']),
      };
    })
    .filter((thread): thread is MessageThread => thread !== null);
}

function mockThreads(): readonly MessageThread[] {
  return [
    {
      id: 'th-1',
      subject: 'Consulta sobre garantía',
      counterpart: 'TecnoHub',
      lastMessage: 'Sí, la garantía cubre 12 meses con distribuidor oficial.',
      date: '2026-06-25',
      unread: true,
    },
    {
      id: 'th-2',
      subject: 'Pedido ORD-2026-00512',
      counterpart: 'PeriferiCO',
      lastMessage: 'Tu pedido salió de bodega, llega mañana.',
      date: '2026-06-23',
      unread: false,
    },
  ];
}
