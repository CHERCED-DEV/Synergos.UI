import { Injectable, computed, inject, signal } from '@angular/core';
import { OrchestratorService } from '@synergos/transaction-engine';
import type { Author, DirectMessage, MessageThread } from '../comun/blogs.model';
import { isBlogsForbidden } from '../comun/errores';
import { RedDeBlogs } from '../comun/red-de-blogs';
import { TEXTOS_DE_BLOGS } from '../comun/textos';
import { MensajesApi } from './mensajes-api.client';

/**
 * Los mensajes directos de quien lee (012-blogs-social, I2): la bandeja, el hilo abierto y enviar, con la burbuja
 * optimista que se retira o se marca si no salió (UI#92).
 */
@Injectable()
export class MensajesDeBlogs {
  readonly #red = inject(RedDeBlogs);
  readonly #api = inject(MensajesApi);
  readonly #orchestrator = inject(OrchestratorService);
  readonly #textos = inject(TEXTOS_DE_BLOGS);

  readonly threads = signal<readonly MessageThread[]>([]);
  readonly activeThread = signal<MessageThread | null>(null);
  readonly threadsLoaded = signal(false);
  readonly sendingMessage = signal(false);
  readonly inboxUnread = computed(() => this.threads().reduce((sum, thread) => sum + thread.unread, 0));

  constructor() {
    // Mensajes directos — lo más sensible: sin esto el anónimo veía una bandeja sembrada.
    this.#red.alPerderLaSesion(() => {
      this.threads.set([]);
      this.activeThread.set(null);
      this.threadsLoaded.set(true);
    });
  }

  async loadThreads(): Promise<void> {
    this.#red.loading.set(true);
    try {
      const threads = await this.#orchestrator.callApi('messages', () => this.#api.messages(this.#red.apiBase()));
      this.threads.set(threads);
      this.threadsLoaded.set(true);
      this.#red.sessionAccess.set('ok');
    } catch (error) {
      if (this.#red.handleUnauthenticated(error, this.#textos.sesionParaMensajes)) {
        return;
      }
      this.#red.errorMessage.set(this.#textos.mensajesNoCargaron);
      void error;
    } finally {
      this.#red.loading.set(false);
    }
  }

  onThreadSelect(thread: MessageThread): void {
    this.#red.navegacion?.escribirRuta('messages', thread.id);
    void this.openThread(thread.id);
  }

  async openThread(threadId: string): Promise<void> {
    // Se intenta un hilo nuevo: el veredicto del anterior no aplica a este.
    this.#red.threadAccess.set('ok');
    // Optimistically clear unread on the selected row.
    this.threads.update((current) => current.map((thread) => (thread.id === threadId ? { ...thread, unread: 0 } : thread)));
    try {
      const thread = await this.#api.thread(this.#red.apiBase(), threadId);
      this.activeThread.set(thread);
      this.#red.threadAccess.set('ok');
      this.#red.sessionAccess.set('ok');
      this.threads.update((current) =>
        current.some((entry) => entry.id === thread.id)
          ? current.map((entry) => (entry.id === thread.id ? { ...thread, unread: 0 } : entry))
          : [{ ...thread, unread: 0 }, ...current],
      );
    } catch (error) {
      // Antes este catch se tragaba TODO en silencio: un 403 por deep-link a un hilo ajeno
      // caía al mock y abría otra conversación como si fuera esa.
      if (this.#red.handleUnauthenticated(error, this.#textos.sesionParaMensajes)) {
        return;
      }
      if (this.handleThreadForbidden(error)) {
        return;
      }
      this.#red.errorMessage.set(this.#textos.conversacionNoAbrio);
      void error;
    }
  }

  /** Start a DM with the profiled author (creates/opens a thread). */
  messageAuthor(author: Author): void {
    const threadId = `t-${author.handle}`;
    const existing = this.threads().find((thread) => thread.participant.actorKey === author.actorKey);
    if (!existing) {
      this.threads.update((current) => [
        {
          id: threadId,
          participant: author,
          lastMessage: '',
          lastAtUtc: new Date().toISOString(),
          unread: 0,
          messages: [],
        },
        ...current,
      ]);
    }
    this.threadsLoaded.set(true);
    this.#red.navegacion?.aplicar('messages');
    this.#red.navegacion?.escribirRuta('messages', existing?.id ?? threadId);
    void this.openThread(existing?.id ?? threadId);
  }

  onSendMessage(event: { thread: MessageThread; body: string }): void {
    const body = event.body.trim();
    if (!body || this.sendingMessage()) {
      return;
    }
    const threadId = event.thread.id;
    // Optimistic append.
    const local: DirectMessage = {
      id: `local-m-${Date.now().toString(36)}`,
      threadId,
      author: this.#red.autorLocal(),
      body,
      createdAtUtc: new Date().toISOString(),
      outgoing: true,
    };
    this.patchThread(threadId, (thread) => ({
      ...thread,
      messages: [...thread.messages, local],
      lastMessage: body,
      lastAtUtc: local.createdAtUtc,
    }));
    this.sendingMessage.set(true);
    this.#red.errorMessage.set('');
    this.#api
      .sendMessage(this.#red.apiBase(), { threadId, body })
      .then((message) => {
        // Reconcile the optimistic message id with the server's.
        this.patchThread(threadId, (thread) => ({
          ...thread,
          messages: thread.messages.map((entry) => (entry.id === local.id ? message : entry)),
        }));
        this.#red.eventos.messagesent({ threadId });
      })
      .catch((error: unknown) => {
        // Sin sesión o en un hilo ajeno, la burbuja se RETIRA: en el caso del 401 el
        // handler además vacía la bandeja, así que el hilo ya no existe.
        if (this.#red.handleUnauthenticated(error, this.#textos.sesionParaEnviar) || this.handleThreadForbidden(error)) {
          this.patchThread(threadId, (thread) => ({
            ...thread,
            messages: thread.messages.filter((entry) => entry.id !== local.id),
          }));
          return;
        }
        // Con el servidor caído tampoco salió (UI#92), pero el hilo sigue siendo suyo: el
        // mensaje se queda MARCADO, sin hora de envío y con su reintento.
        this.patchThread(threadId, (thread) => ({
          ...thread,
          messages: thread.messages.map((entry) => (entry.id === local.id ? { ...entry, failed: true } : entry)),
        }));
        this.#red.errorMessage.set(this.#textos.mensajeNoEnviado);
      })
      .finally(() => this.sendingMessage.set(false));
  }

  /** Reintenta un mensaje marcado, sin volver a teclearlo (UI#92). */
  retryMessage(thread: MessageThread, message: DirectMessage): void {
    if (!message.failed || this.sendingMessage()) {
      return;
    }
    this.sendingMessage.set(true);
    this.#red.errorMessage.set('');
    this.#api
      .sendMessage(this.#red.apiBase(), { threadId: thread.id, body: message.body })
      .then((sent) => {
        this.patchThread(thread.id, (entry) => ({
          ...entry,
          messages: entry.messages.map((item) => (item.id === message.id ? sent : item)),
        }));
        this.#red.eventos.messagesent({ threadId: thread.id });
      })
      .catch((error: unknown) => {
        if (this.#red.handleUnauthenticated(error, this.#textos.sesionParaEnviar) || this.handleThreadForbidden(error)) {
          return;
        }
        this.#red.errorMessage.set(this.#textos.mensajeSigueSinEnviar);
      })
      .finally(() => this.sendingMessage.set(false));
  }

  /**
   * 403 en `GET /thread/{id}`: hay sesión, pero la conversación es de otras dos personas.
   * Se cierra SOLO el hilo (la bandeja propia sigue siendo legítima) y se dice con esas
   * palabras — antes se caía al mock y se abría OTRA conversación en su lugar.
   */
  private handleThreadForbidden(error: unknown): boolean {
    if (!isBlogsForbidden(error)) {
      return false;
    }
    this.#red.threadAccess.set('forbidden');
    this.activeThread.set(null);
    this.#red.errorMessage.set('');
    // NO se pide foco de panel: este 403 no pinta un `.blogs__signin`, sino un `role="alert"`
    // sobre el message-center, que ya interrumpe al lector.
    this.#red.anunciar(this.#textos.conversacionAjena);
    return true;
  }

  /** Apply the same patch to a thread in the inbox and to the active thread. */
  private patchThread(id: string, patch: (thread: MessageThread) => MessageThread): void {
    this.threads.update((current) => current.map((thread) => (thread.id === id ? patch(thread) : thread)));
    const active = this.activeThread();
    if (active?.id === id) {
      this.activeThread.set(patch(active));
    }
  }
}
