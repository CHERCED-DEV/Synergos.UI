import { Injectable, computed, inject, signal } from '@angular/core';
import type { Notification } from '../comun/blogs.model';
import { RedDeBlogs } from '../comun/red-de-blogs';
import { TEXTOS_DE_BLOGS } from '../comun/textos';
import { InicioDeBlogs } from '../contenido/inicio';
import { NotificacionesApi } from './notificaciones-api.client';

/** Las notificaciones de quien lee (012-blogs-social, I2): la lista, el filtro de menciones y abrir cada una. */
@Injectable()
export class NotificacionesDeBlogs {
  readonly #red = inject(RedDeBlogs);
  readonly #api = inject(NotificacionesApi);
  readonly #inicio = inject(InicioDeBlogs);
  readonly #textos = inject(TEXTOS_DE_BLOGS);

  readonly notifications = signal<readonly Notification[]>([]);
  readonly notificationsLoaded = signal(false);
  readonly notificationFilter = signal<'all' | 'mentions'>('all');
  readonly unreadCount = computed(() => this.notifications().filter((notification) => !notification.read).length);
  readonly filteredNotifications = computed(() => {
    if (this.notificationFilter() === 'mentions') {
      return this.notifications().filter((notification) => notification.verb === 'mention');
    }
    return this.notifications();
  });

  constructor() {
    this.#red.alPerderLaSesion(() => {
      this.notifications.set([]);
      this.notificationsLoaded.set(true);
    });
  }

  setNotificationFilter(filter: 'all' | 'mentions'): void {
    this.notificationFilter.set(filter);
  }

  markAllRead(): void {
    this.notifications.update((current) => current.map((notification) => ({ ...notification, read: true })));
  }

  markRead(notification: Notification): void {
    this.notifications.update((current) =>
      current.map((entry) => (entry.id === notification.id ? { ...entry, read: true } : entry)),
    );
  }

  openNotification(notification: Notification): void {
    this.markRead(notification);
    const navegacion = this.#red.navegacion;
    if (notification.postId) {
      const post = this.#inicio.posts().find((entry) => entry.id === notification.postId);
      if (post) {
        navegacion?.openPost(post);
        return;
      }
      navegacion?.openPostById(notification.postId);
      return;
    }
    navegacion?.openProfile(notification.actor.handle);
  }

  async loadNotifications(): Promise<void> {
    this.#red.loading.set(true);
    try {
      const list = await this.#api.notifications(this.#red.apiBase());
      this.notifications.set(list);
      this.notificationsLoaded.set(true);
      this.#red.sessionAccess.set('ok');
    } catch (error) {
      if (this.#red.handleUnauthenticated(error, this.#textos.sesionParaNotificaciones)) {
        return;
      }
      this.#red.errorMessage.set(this.#textos.notificacionesNoCargaron);
      void error;
    } finally {
      this.#red.loading.set(false);
    }
  }
}
