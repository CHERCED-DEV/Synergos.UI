import { Injectable, inject } from '@angular/core';
import { esRegistro as isRecord, leerBooleano as readBoolean, leerTexto as readString } from '@synergos/core';
import { BordeDeBlogs } from '../comun/borde-de-blogs';
import type { Notification } from '../comun/blogs.model';
import { buildMockNotifications } from '../comun/blogs.mock';
import { normalizeAuthor } from '../contenido/contenido-api.client';

/** Las notificaciones de quien lee (012-blogs-social, I2). */
@Injectable({ providedIn: 'root' })
export class NotificacionesApi {
  readonly #borde: BordeDeBlogs = inject(BordeDeBlogs);

  // ─── Notifications (no contract endpoint yet — degrades to mock) ─────────────

  /**
   * La actividad del member de la SESIÓN.
   *
   * @throws {BlogsUnauthorizedError} si no hay sesión.
   */
  async notifications(apiBase: string): Promise<readonly Notification[]> {
    const url = `${apiBase}/notifications`;
    try {
      const data = await this.#borde.getJson(apiBase, url);
      const list = normalizeNotifications(data);
      if (list) {
        return list;
      }
      throw new Error('notifications-shape');
    } catch (error) {
      this.#borde.rethrowIfAuthError(error);
      this.#borde.markDegraded('GET /api/blogs/notifications', error);
      return buildMockNotifications();
    }
  }
}

function normalizeNotifications(value: unknown): readonly Notification[] | null {
  const list = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value['notifications'])
      ? value['notifications']
      : null;
  if (!list) {
    return null;
  }
  const verbs: readonly Notification['verb'][] = ['follow', 'react', 'mention', 'reply', 'repost'];
  return list
    .map((entry): Notification | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const id = readString(entry['id']).trim();
      const actor = normalizeAuthor(entry['actor']);
      if (!id || !actor) {
        return null;
      }
      const verbRaw = readString(entry['verb']).trim().toLowerCase();
      const verb = verbs.includes(verbRaw as Notification['verb'])
        ? (verbRaw as Notification['verb'])
        : 'mention';
      return {
        id,
        verb,
        actor,
        summary: readString(entry['summary']).trim(),
        postId: typeof entry['postId'] === 'string' ? entry['postId'] : null,
        createdAtUtc: readString(entry['createdAtUtc']).trim() || new Date().toISOString(),
        read: readBoolean(entry['read']),
      };
    })
    .filter((entry): entry is Notification => entry !== null);
}
