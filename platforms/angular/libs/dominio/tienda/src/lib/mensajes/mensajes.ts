import { Injectable, computed, inject, signal } from '@angular/core';
import { ConfiguracionDeLaTienda } from '../comun/configuracion';
import { MensajesApi } from './mensajes-api.client';
import type { MessageThread } from './mensajes.model';

/** Los hilos de quien compra con quien vende (014-despiece-tienda, T008): se leen una vez, al abrirlos. */
@Injectable()
export class MensajesDeLaTienda {
  readonly #api = inject(MensajesApi);
  readonly #config = inject(ConfiguracionDeLaTienda);

  readonly threads = signal<readonly MessageThread[]>([]);
  readonly threadsLoaded = signal(false);
  readonly unreadCount = computed(() => this.threads().filter((thread) => thread.unread).length);

  loadThreads(): void {
    if (this.threadsLoaded()) {
      return;
    }
    void this.#api.messages(this.#config.apiBase(), this.#config.lecturasBase()).then((threads) => {
      this.threads.set(threads);
      this.threadsLoaded.set(true);
    });
  }
}
