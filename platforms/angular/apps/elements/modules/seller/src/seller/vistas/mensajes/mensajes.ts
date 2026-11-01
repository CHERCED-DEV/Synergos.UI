import { ChangeDetectionStrategy, Component, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { MensajesDelVendedorApi, type SellerMessage, type SellerThread } from '@synergos/dominio/tienda';
import { LinkComponent, SynErrorStateComponent } from '@synergos/shared';
import { MessageCenterComponent, type MessageCenterConfig, type MessageSendEvent } from '@synergos/shells';
import { EstadoDeLaConsola } from '../../estado/estado-de-la-consola';
import { PresentacionDeLaConsola } from '../../estado/presentacion';

/** Los mensajes con quienes compran sobre SH-7: leer un hilo y contestar. (014-despiece-tienda, T011) */
@Component({
  selector: 'sg-consola-mensajes',
  standalone: true,
  imports: [MessageCenterComponent, SynErrorStateComponent, LinkComponent],
  templateUrl: './mensajes.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'seller__vista' },
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ConsolaMensajesComponent {
  readonly #mensajes = inject(MensajesDelVendedorApi);
  protected readonly estado = inject(EstadoDeLaConsola);
  protected readonly presentacion = inject(PresentacionDeLaConsola);

  // ─── SH-7 mensajes ─────────────────────────────────────────────────────────
  readonly activeThread = signal<SellerThread | null>(null);

  readonly sending = signal(false);

  readonly messagesConfig: MessageCenterConfig = {
    heading: 'Mensajes y preguntas',
    listLabel: 'Conversaciones con compradores',
    emptyMessage: 'No tienes mensajes de compradores.',
    loadingMessage: 'Cargando conversaciones…',
    detailPlaceholder: 'Selecciona una conversación para ver el hilo y responder.',
    composerLabel: 'Responder al comprador',
    composerPlaceholder: 'Escribe tu respuesta…',
    sendLabel: 'Responder',
    sendingLabel: 'Enviando…',
  };

  // ─── SH-7 wiring (mensajes) ────────────────────────────────────────────────
  onThreadSelect(thread: SellerThread): void {
    if (thread.unread) {
      // Opening a thread clears its unread flag (local state; API syncs later).
      this.estado.threads.update((list) =>
        list.map((entry) => (entry.id === thread.id ? { ...entry, unread: false } : entry)),
      );
    }
    const current = this.estado.threads().find((entry) => entry.id === thread.id) ?? thread;
    this.activeThread.set(current);
  }

  async onSendReply(event: MessageSendEvent<SellerThread>): Promise<void> {
    if (this.sending()) {
      return;
    }
    this.sending.set(true);
    this.estado.actionError.set(null);
    try {
      const message = await this.#mensajes.reply(this.estado.apiBase(), event.thread.id, event.body);
      if (!message) {
        // NO salió (UI#92). El compositor ya se vació al enviar, así que el texto se queda en
        // el hilo, MARCADO y sin fecha —una fecha sería el acuse que no existe—, con su
        // reintento: borrarlo se lleva lo que acaba de escribir (regla 18b, la forma de EHR).
        this.unsentReplies += 1;
        this.patchThread(event.thread.id, (thread) => ({
          ...thread,
          messages: [
            ...thread.messages,
            { id: `sin-enviar-${this.unsentReplies}`, from: 'seller', body: event.body, date: '', failed: true },
          ],
        }));
        this.estado.actionError.set('Tu respuesta NO se envió. Queda en el hilo para reintentarla.');
        return;
      }
      this.patchThread(event.thread.id, (thread) => ({
        ...thread,
        messages: [...thread.messages, message],
        date: message.date,
      }));
    } finally {
      this.sending.set(false);
    }
  }

  /** Reintenta una respuesta marcada, sin volver a teclearla (UI#92). */
  async retryReply(thread: SellerThread, message: SellerMessage): Promise<void> {
    if (!message.failed || this.sending()) {
      return;
    }
    this.sending.set(true);
    this.estado.actionError.set(null);
    try {
      const sent = await this.#mensajes.reply(this.estado.apiBase(), thread.id, message.body);
      if (!sent) {
        this.estado.actionError.set('Tu respuesta sigue sin enviarse. Queda en el hilo.');
        return;
      }
      this.patchThread(thread.id, (entry) => ({
        ...entry,
        messages: entry.messages.map((item) => (item.id === message.id ? sent : item)),
        date: sent.date,
      }));
    } finally {
      this.sending.set(false);
    }
  }

  /** Cambia un hilo en la lista y, si es el abierto, también el abierto. */
  private patchThread(id: string, patch: (thread: SellerThread) => SellerThread): void {
    this.estado.threads.update((list) => list.map((thread) => (thread.id === id ? patch(thread) : thread)));
    const active = this.estado.threads().find((entry) => entry.id === id) ?? null;
    if (this.activeThread()?.id === id) {
      this.activeThread.set(active);
    }
  }

  /** Cuántas respuestas no salieron en esta pestaña: el id local de su burbuja marcada. */
  private unsentReplies = 0;
}
