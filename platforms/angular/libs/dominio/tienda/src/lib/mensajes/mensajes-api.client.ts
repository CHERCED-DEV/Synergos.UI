import { Injectable, inject } from '@angular/core';
import { esRegistro, leerBooleano, leerJsonDelBorde, leerTexto } from '@synergos/core';
import { LecturasDeLaTienda } from '../comun/lecturas';
import type { MessageThread } from './mensajes.model';

/** Los hilos de quien compra con quien vende (`GET /messages`, mensajería v1). */
@Injectable({ providedIn: 'root' })
export class MensajesApi {
  readonly #lecturas: LecturasDeLaTienda = inject(LecturasDeLaTienda);

  // ─── Messages (mensajería v1) ────────────────────────────────────────────────

  async messages(apiBase: string): Promise<readonly MessageThread[]> {
    const url = `${apiBase}/messages`;
    try {
      const data = await leerJsonDelBorde(apiBase, url);
      const threads = normalizeThreads(data);
      if (threads) {
        return threads;
      }
      throw new Error('messages-shape');
    } catch (error) {
      this.#lecturas.markDegraded('GET /api/shop/messages', error);
      return mockThreads();
    }
  }
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
