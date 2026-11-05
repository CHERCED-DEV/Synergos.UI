import { Injectable, inject, signal } from '@angular/core';
import type { Post } from '../comun/blogs.model';
import { RedDeBlogs, VISTAS_CON_PANEL } from '../comun/red-de-blogs';
import { TEXTOS_DE_BLOGS } from '../comun/textos';
import { GuardadosApi } from './guardados-api.client';

/** Lo que guarda quien lee (012-blogs-social, I2): la lista, y el marcador optimista con su vuelta atrás. */
@Injectable()
export class GuardadosDeBlogs {
  readonly #red = inject(RedDeBlogs);
  readonly #api = inject(GuardadosApi);
  readonly #textos = inject(TEXTOS_DE_BLOGS);

  readonly savedPosts = signal<readonly Post[]>([]);
  readonly savedLoaded = signal(false);
  readonly savedSection = signal<'saved' | 'lists'>('saved');
  /**
   * Cola de persistencia POR POST: la siguiente llamada de un mismo post espera a que la
   * anterior termine, para que el servidor las aplique en el orden en que se pulsaron.
   * Ver {@link toggleSave}.
   */
  readonly #saveChains = new Map<string, Promise<void>>();
  /** Última intención por post; una respuesta con token caducado no toca la UI. */
  readonly #saveTokens = new Map<string, number>();
  /** Último estado que el SERVIDOR confirmó por post. La vuelta atrás va aquí, no a la
   *  foto optimista de pantalla. */
  readonly #saveConfirmed = new Map<string, boolean>();

  constructor() {
    this.#red.alParchear((id, patch) =>
      this.savedPosts.update((current) => current.map((post) => (post.id === id ? patch(post) : post))),
    );
    this.#red.alPerderLaSesion(() => {
      this.savedPosts.set([]);
      this.savedLoaded.set(true);
    });
  }

  isSaved(id: string): boolean {
    return this.#red.isSaved(id);
  }

  /**
   * Marcador optimista CON vuelta atrás: se pinta, se persiste y, si el servidor dice que
   * no, se deshace y se dice. Antes solo se pintaba — el post "guardado" desaparecía al
   * recargar porque nunca salió una petición.
   *
   * Las dos señales se mueven SIEMPRE juntas (`savedIds` manda el icono, `savedPosts` la
   * lista y el badge del nav): deshacer una sola dejaría el marcador encendido sobre una
   * lista que ya no lo contiene, que es peor que la mentira original.
   */
  toggleSave(post: Post): void {
    const saved = !this.#red.savedIds().has(post.id);

    // Foto EXACTA de lo que habría que deshacer, tomada del estado CONFIRMADO por el
    // servidor y no del que hay en pantalla: el de pantalla puede llevar pintado lo que una
    // pulsación anterior aún no ha persistido. El índice importa: la lista llega ORDENADA.
    const confirmado = this.#saveConfirmed.get(post.id);
    const previousIndex = this.savedPosts().findIndex((entry) => entry.id === post.id);
    const previousEntry = previousIndex >= 0 ? this.savedPosts()[previousIndex] : post;
    const estadoPrevio = confirmado ?? previousIndex >= 0;

    this.applySaved(post, saved);

    // Token = la ÚLTIMA intención del usuario para ESTE post. Una respuesta cuyo token ya
    // caducó no toca la UI: el usuario volvió a pulsar y esa pulsación es la dueña.
    const token = (this.#saveTokens.get(post.id) ?? 0) + 1;
    this.#saveTokens.set(post.id, token);

    // Y la cola SERIALIZA por post: la petición N+1 no sale hasta que la N termina, así el
    // servidor las aplica en el orden en que se pulsaron. Posts distintos = colas distintas.
    const previousCall = this.#saveChains.get(post.id) ?? Promise.resolve();
    const chain = previousCall
      // El fallo del anterior ya lo trató su propio `catch`; no debe romper la cola.
      .catch(() => undefined)
      .then(() => this.#api.setSaved(this.#red.apiBase(), post.id, saved))
      // El servidor lo aceptó: ESTE es el estado al que hay que volver si una pulsación
      // posterior falla.
      .then(() => {
        this.#saveConfirmed.set(post.id, saved);
      })
      .catch((error: unknown) => {
        if (this.#saveTokens.get(post.id) !== token) {
          // Llegó tarde. Revertir aquí pelearía contra la pulsación más reciente.
          return;
        }
        // Un 401 no es "falló la red": es que no hay sesión. El panel de "Inicia sesión"
        // vacía TODO lo personal (incluidos los guardados), así que el marcador optimista se
        // va con ello. Y anuncia por su cuenta.
        const invitacion = saved ? this.#textos.sesionParaGuardar : this.#textos.sesionParaGestionarGuardados;
        if (this.#red.handleUnauthenticated(error, invitacion)) {
          // ⚠️ El panel solo se pinta dentro de las cuatro vistas personales. El botón de
          // guardar vive en la TARJETA DE POST, o sea en el feed — donde no hay panel. Así
          // que en las vistas sin panel la invitación se pinta en el aviso global.
          if (!VISTAS_CON_PANEL.includes(this.#red.view())) {
            this.#red.errorMessage.set(invitacion);
          }
          return;
        }
        this.applySaved(previousEntry, estadoPrevio, previousIndex);
        // Un único canal: `errorMessage` ya se pinta en un `role="alert"` vivo.
        this.#red.errorMessage.set(saved ? this.#textos.guardarFallo : this.#textos.quitarGuardadoFallo);
      });

    this.#saveChains.set(post.id, chain);
    void chain.then(() => {
      // Si nadie encadenó detrás, este post está quieto: se sueltan sus entradas para que
      // los mapas no crezcan con cada post que el usuario toca en una sesión larga.
      if (this.#saveChains.get(post.id) === chain) {
        this.#saveChains.delete(post.id);
        this.#saveTokens.delete(post.id);
      }
    });
  }

  /**
   * Mueve las DOS señales del marcador a la vez. `at` solo se usa al revertir un
   * "quitar": reinserta la entrada en el índice del que salió.
   */
  private applySaved(post: Post, saved: boolean, at?: number): void {
    this.#red.savedIds.update((current) => {
      const next = new Set(current);
      if (saved) {
        next.add(post.id);
      } else {
        next.delete(post.id);
      }
      return next;
    });
    this.savedPosts.update((current) => {
      if (!saved) {
        return current.filter((entry) => entry.id !== post.id);
      }
      if (current.some((entry) => entry.id === post.id)) {
        return current;
      }
      // Se inserta sobre la lista ACTUAL, no sobre una copia congelada al pulsar: así una
      // reacción o un patch que hayan llegado entretanto sobreviven a la reversión.
      const next = [...current];
      next.splice(Math.min(Math.max(at ?? 0, 0), next.length), 0, post);
      return next;
    });
  }

  async loadSaved(): Promise<void> {
    this.#red.loading.set(true);
    try {
      const posts = await this.#api.saved(this.#red.apiBase());
      this.savedPosts.set(posts);
      this.#red.savedIds.set(new Set(posts.map((post) => post.id)));
      this.savedLoaded.set(true);
      this.#red.sessionAccess.set('ok');
    } catch (error) {
      if (this.#red.handleUnauthenticated(error, this.#textos.sesionParaGuardados)) {
        return;
      }
      this.#red.errorMessage.set(this.#textos.guardadosNoCargaron);
      void error;
    } finally {
      this.#red.loading.set(false);
    }
  }

  onSavedSectionChange(sectionId: string): void {
    if (sectionId === 'saved' || sectionId === 'lists') {
      this.savedSection.set(sectionId);
    }
  }
}
