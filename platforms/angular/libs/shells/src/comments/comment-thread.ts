import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ButtonComponent, InputComponent } from '@synergos/shared';

/**
 * SH-15 — `syn-comment-thread`.
 *
 * Un hilo de comentarios con sus respuestas: quién, cuándo, qué dijo, el «me gusta» y la caja para responder. Nació
 * dentro de la red social (012-blogs-social, I2, T016), donde era una plantilla recursiva del componente único, y sube
 * aquí porque no tiene nada de la red: lo mismo es el hilo de un artículo, de una lección o de un anuncio.
 *
 * **La pieza no sabe de dominio, ni formatea.** El nombre, la hora («hace 3 min») y la cifra («1,2 k») llegan ya
 * dichos; la pieza no conoce una zona horaria ni un locale.
 *
 * **Y no decide nada.** Responder, dar «me gusta» y abrir el perfil de quien escribió son salidas: el dominio llama a su
 * borde y pinta lo que el servidor guardó. Por eso el borrador de cada respuesta lo guarda quien la usa (`drafts`): un
 * envío que no llegó deja el texto donde estaba, y eso sólo lo sabe el dominio (#26).
 *
 * El molde de carga vive aquí con las MISMAS clases que el comentario (avatar de 36 px + cuerpo), así la geometría no se
 * duplica y no puede divergir. Es mudo para el lector (`aria-hidden`): el aviso va en un `role="status"` aparte, con
 * TEXTO, porque una región viva sin texto no se anuncia de forma fiable.
 *
 * **Sus clases son `syn-cthread__*`, no el nombre de la etiqueta.** `syn-comment-thread` ya es la raíz BEM del hilo que
 * el CMS pinta en el servidor (`CommentThread.cshtml`), con su hoja global en el sitio: con ese prefijo, el organismo
 * heredaba su margen y su raya (lo cazaron las capturas de I2).
 */

/** Un comentario del hilo, ya dicho por el dominio. */
export interface CommentThreadEntry {
  readonly id: string;
  /** Quién lo escribió, como se muestra. */
  readonly author: string;
  /** Su alias, sin la arroba. Sin alias, no se pinta. */
  readonly handle?: string;
  /** Las iniciales del avatar, ya calculadas. */
  readonly initials: string;
  readonly body: string;
  /** Cuándo, ya formateado («hace 3 min»). */
  readonly time: string;
  /** Los «me gusta», ya formateados («1,2 k»). */
  readonly likes: string;
  /** Quien lee ya dio «me gusta»: el botón queda marcado y no se ofrece otra vez. */
  readonly liked: boolean;
  readonly replies: readonly CommentThreadEntry[];
}

/** Lo que se escribió en la caja de respuesta de un comentario. */
export interface CommentThreadDraftChange {
  readonly entry: CommentThreadEntry;
  readonly value: string;
}

export interface CommentThreadConfig {
  /** El botón y la etiqueta de la caja de respuesta. Default «Responder». */
  readonly replyLabel?: string;
  /** Default «Responder…». */
  readonly replyPlaceholder?: string;
  /** El aviso mientras carga. Default «Cargando comentarios…». */
  readonly loadingMessage?: string;
  /** Default «Sé el primero en comentar.». */
  readonly emptyMessage?: string;
}

/** Las filas del molde cuando quien usa la pieza no dice cuántas: la primera página típica de un hilo. */
const FILAS_DEL_MOLDE = 3;

@Component({
  selector: 'syn-comment-thread',
  standalone: true,
  imports: [NgTemplateOutlet, ButtonComponent, InputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'syn-cthread' },
  styleUrl: './comment-thread.scss',
  template: `
    @if (loading() && entries().length === 0) {
      <ul class="syn-cthread__list" aria-hidden="true">
        @for (bone of bones(); track bone) {
          <li>
            <article class="syn-cthread__comment">
              <span class="syn-cthread__bone syn-cthread__bone--avatar"></span>
              <div class="syn-cthread__body">
                <span class="syn-cthread__bone syn-cthread__bone--head"></span>
                <span class="syn-cthread__bone syn-cthread__bone--text"></span>
                <span class="syn-cthread__bone syn-cthread__bone--action"></span>
                <span class="syn-cthread__bone syn-cthread__bone--form"></span>
              </div>
            </article>
          </li>
        }
      </ul>
      <p class="syn-cthread__sr-only" role="status">{{ loadingMessage() }}</p>
    } @else if (entries().length === 0) {
      <p class="syn-cthread__empty">{{ emptyMessage() }}</p>
    } @else {
      <ul class="syn-cthread__list">
        @for (entry of entries(); track entry.id) {
          <li>
            <ng-container [ngTemplateOutlet]="comment" [ngTemplateOutletContext]="{ $implicit: entry, depth: 0 }" />
          </li>
        }
      </ul>
    }

    <!-- Un comentario y sus respuestas, recursivo hasta la profundidad que traiga el hilo. Sólo el primer nivel lleva
         caja de respuesta: responder a una respuesta es responder al hilo. -->
    <ng-template #comment let-entry let-depth="depth">
      <article class="syn-cthread__comment" [class.syn-cthread__comment--nested]="depth > 0">
        <span class="syn-cthread__avatar" aria-hidden="true">{{ entry.initials }}</span>
        <div class="syn-cthread__body">
          <header class="syn-cthread__head">
            <syn-button variant="plain" (pressed)="authorSelect.emit(entry)"
              ><span class="syn-cthread__author">{{ entry.author }}</span></syn-button
            >
            @if (entry.handle) {
              <span class="syn-cthread__handle">&#64;{{ entry.handle }}</span>
            }
            <span class="syn-cthread__time">· {{ entry.time }}</span>
          </header>
          <p class="syn-cthread__text">{{ entry.body }}</p>
          <div class="syn-cthread__actions">
            <syn-button variant="ghost" size="sm" [selected]="entry.liked" [disabled]="entry.liked" (pressed)="like.emit(entry)">
              <svg class="syn-cthread__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>
              {{ entry.likes }}
            </syn-button>
          </div>
          @if (depth === 0) {
            <form class="syn-cthread__reply-form" (submit)="$event.preventDefault(); reply.emit(entry)">
              <syn-input
                class="syn-cthread__reply-input"
                [id]="idPrefix() + '-reply-' + entry.id"
                [ariaLabel]="replyLabel()"
                [placeholder]="replyPlaceholder()"
                [value]="draftFor(entry.id)"
                (valueChange)="draftChange.emit({ entry, value: $event })"
              />
              <syn-button type="submit" size="sm" [disabled]="!draftFor(entry.id).trim()">{{ replyLabel() }}</syn-button>
            </form>
          }
          @if (entry.replies.length > 0) {
            <ul class="syn-cthread__list syn-cthread__list--replies">
              @for (child of entry.replies; track child.id) {
                <li>
                  <ng-container [ngTemplateOutlet]="comment" [ngTemplateOutletContext]="{ $implicit: child, depth: depth + 1 }" />
                </li>
              }
            </ul>
          }
        </div>
      </article>
    </ng-template>
  `,
})
export class CommentThreadComponent {
  readonly entries = input<readonly CommentThreadEntry[]>([]);

  /** El borrador de la respuesta a cada comentario, por su id. Lo guarda quien usa la pieza. */
  readonly drafts = input<Readonly<Record<string, string>>>({});

  /** Mientras carga y no hay comentarios, el molde. */
  readonly loading = input(false);

  /** Cuántas filas tiene el molde. */
  readonly skeletons = input(FILAS_DEL_MOLDE);

  /** El prefijo de los id de las cajas de respuesta: dos hilos en una página no chocan. */
  readonly idPrefix = input('syn-cthread');

  readonly config = input<CommentThreadConfig>({});

  /** «Me gusta» a un comentario que quien lee aún no marcó. */
  readonly like = output<CommentThreadEntry>();

  /** Enviar la respuesta escrita en la caja de un comentario. */
  readonly reply = output<CommentThreadEntry>();

  readonly draftChange = output<CommentThreadDraftChange>();

  /** Abrir a quien escribió el comentario. */
  readonly authorSelect = output<CommentThreadEntry>();

  readonly bones = computed(() => Array.from({ length: Math.max(0, this.skeletons()) }, (_, index) => index));

  readonly replyLabel = computed(() => this.config().replyLabel || 'Responder');

  readonly replyPlaceholder = computed(() => this.config().replyPlaceholder || 'Responder…');

  readonly loadingMessage = computed(() => this.config().loadingMessage || 'Cargando comentarios…');

  readonly emptyMessage = computed(() => this.config().emptyMessage || 'Sé el primero en comentar.');

  draftFor(id: string): string {
    return this.drafts()[id] ?? '';
  }
}
