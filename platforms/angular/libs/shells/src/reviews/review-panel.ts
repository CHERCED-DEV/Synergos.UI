import {
  ChangeDetectionStrategy,
  Component,
  type TemplateRef,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

/**
 * SH-13 — `syn-review-panel`.
 *
 * La prueba social: qué opinaron quienes ya consumieron, y el sitio para contarlo.
 *
 * **Cuatro dominios EXHIBEN valoración y ninguno la captura** (#28): Educación,
 * Propiedades, Viajes y Salud pintan estrellas y un conteo que no puede subir
 * desde el producto — el número sale del backend o del mock y nadie lo alimenta.
 * Una nota que no se puede ganar no es prueba social, es decoración.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **ESTA PIEZA GENERALIZA UN PATRÓN BIEN CONSTRUIDO, NO ARREGLA UNO ROTO.**
 *
 * La Tienda ya lo tenía resuelto en una pantalla, y con el razonamiento escrito:
 * `canReview` lo decide el SERVIDOR con el mismo gate que aplica el POST —
 * «deducirlo sería adivinar, y ofrecer un formulario que va a rebotar con 403» —
 * el resultado del envío es tipado con cuatro motivos, y no degrada a mock porque
 * «fingir una escritura que no ocurrió es peor que el error» (ADR 0112).
 *
 * Lo que se añade sobre ese precedente son dos cosas que no existían en ningún
 * dominio: la **distribución por estrella** y los **criterios por dominio**.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **La pieza no hace aritmética.** Ni el promedio ni la distribución: llegan
 * calculados. Con la lista paginada, el promedio de lo que se ve en pantalla no
 * es el promedio real, y una pieza que lo sumara mostraría un número plausible y
 * equivocado — el mismo criterio que SH-12 con los importes.
 */

/** Un tramo de la distribución: «5 estrellas → 128». */
export interface ReviewDistributionBar {
  /** 1..5. */
  readonly stars: number;
  readonly count: number;
}

/**
 * Un criterio propio del dominio, ya promediado.
 *
 * **Es el eje de especificidad de esta pieza**: una estadía se califica por
 * limpieza y ubicación, un curso por dificultad y utilidad, un producto por si
 * la talla corresponde. Un dominio que no declare criterios tiene sólo la nota
 * global, que es exactamente lo que la Tienda tiene hoy.
 */
export interface ReviewCriterion {
  readonly id: string;
  readonly label: string;
  /** Promedio 0..5, ya calculado por el dominio. */
  readonly score: number;
}

/** Una reseña publicada. Todo ya formateado por el dominio. */
export interface ReviewEntry {
  readonly id: string;
  readonly author: string;
  /** 1..5. */
  readonly rating: number;
  readonly title?: string;
  readonly body: string;
  /** Fecha ya formateada — la pieza no sabe de zonas ni de locales. */
  readonly date: string;
  /**
   * Quien la escribió consumió de verdad. Es el sello que distingue una reseña de
   * un comentario, y lo afirma el dominio: la pieza no sabe qué es «haber
   * comprado».
   */
  readonly verified?: boolean;
  /** Respuesta del vendedor / del anfitrión / del docente, si la hay. */
  readonly reply?: string;
}

/** El resumen, ya calculado por el dominio. */
export interface ReviewSummary {
  /** Promedio 0..5. */
  readonly average: number;
  readonly count: number;
  /** Distribución por estrella. Vacía = no se pinta. */
  readonly distribution?: readonly ReviewDistributionBar[];
  /** Los criterios propios del dominio, ya promediados. */
  readonly criteria?: readonly ReviewCriterion[];
}

/** Un criterio que se le PIDE a quien escribe (el gemelo de entrada de `ReviewCriterion`). */
export interface ReviewCriterionPrompt {
  readonly id: string;
  readonly label: string;
}

/** Por qué no se puede reseñar. Calca los cuatro motivos del precedente. */
export type ReviewBlockedReason = 'unauthenticated' | 'not-consumer' | 'already-reviewed';

/** Lo que la persona escribió. El autor NO va acá: lo pone el servidor de la sesión. */
export interface ReviewDraft {
  readonly rating: number;
  readonly title: string;
  readonly body: string;
  /** `criterioId → 1..5`. Vacío si el dominio no pide criterios. */
  readonly criteria: Readonly<Record<string, number>>;
}

export interface ReviewPanelConfig {
  readonly heading?: string;
  /** «opiniones», «reseñas», «valoraciones» — el sustantivo es del dominio. */
  readonly countLabel?: string;
  readonly emptyMessage?: string;
  readonly formTitle?: string;
  readonly ratingLabel?: string;
  readonly titleLabel?: string;
  readonly bodyLabel?: string;
  readonly submitLabel?: string;
  readonly sendingLabel?: string;
  readonly verifiedLabel?: string;
  /** Qué decir según por qué no puede reseñar. */
  readonly blockedUnauthenticated?: string;
  readonly blockedNotConsumer?: string;
  readonly blockedAlreadyReviewed?: string;
  /** Mínimo de caracteres del cuerpo. Default 10. */
  readonly minBody?: number;
}

const ESTRELLAS = [1, 2, 3, 4, 5] as const;

@Component({
  selector: 'syn-review-panel',
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'syn-review-panel' },
  styleUrl: './review-panel.scss',
  template: `
    <section class="syn-reviews" [attr.aria-labelledby]="headingId">
      <h2 class="syn-reviews__heading" [id]="headingId">
        {{ config().heading || 'Opiniones' }}
      </h2>

      <!-- ── Resumen: promedio, distribución y criterios del dominio ────────── -->
      @if (summary().count > 0) {
        <div class="syn-reviews__summary">
          <p class="syn-reviews__score">
            <span class="syn-reviews__average">{{ averageLabel() }}</span>
            <span class="syn-reviews__stars" [attr.aria-label]="averageAria()">
              @for (star of stars; track star) {
                <span
                  class="syn-reviews__star"
                  [class.is-on]="star <= roundedAverage()"
                  aria-hidden="true"
                  >★</span
                >
              }
            </span>
            <span class="syn-reviews__count">
              {{ summary().count }} {{ config().countLabel || 'opiniones' }}
            </span>
          </p>

          @if (distribution().length > 0) {
            <!-- La distribución es lo que hace legible una nota: 4,2 con todo en 4
                 y 4,2 mitad 5 mitad 3 son dos productos distintos. -->
            <ul class="syn-reviews__dist">
              @for (bar of distribution(); track bar.stars) {
                <li class="syn-reviews__dist-row">
                  <span class="syn-reviews__dist-label">{{ bar.stars }}★</span>
                  <span class="syn-reviews__dist-track">
                    <span
                      class="syn-reviews__dist-fill"
                      [style.inline-size.%]="barPercent(bar)"
                    ></span>
                  </span>
                  <span class="syn-reviews__dist-count">{{ bar.count }}</span>
                </li>
              }
            </ul>
          }

          @if (criteria().length > 0) {
            <dl class="syn-reviews__criteria">
              @for (item of criteria(); track item.id) {
                <div class="syn-reviews__criterion">
                  <dt class="syn-reviews__criterion-label">{{ item.label }}</dt>
                  <dd class="syn-reviews__criterion-score">{{ scoreLabel(item.score) }}</dd>
                </div>
              }
            </dl>
          }
        </div>
      }

      <!-- ── El formulario, o la razón por la que no está ───────────────────── -->
      @if (canReview()) {
        <form class="syn-reviews__form" (submit)="onSubmit($event)">
          <h3 class="syn-reviews__form-title">{{ config().formTitle || 'Cuenta tu experiencia' }}</h3>

          <fieldset class="syn-reviews__field">
            <legend class="syn-reviews__label">{{ config().ratingLabel || 'Tu calificación' }}</legend>
            <div class="syn-reviews__rate" role="radiogroup">
              @for (star of stars; track star) {
                <button
                  type="button"
                  class="syn-reviews__rate-btn"
                  role="radio"
                  [class.is-on]="star <= draftRating()"
                  [attr.aria-checked]="star === draftRating()"
                  [attr.aria-label]="star + ' de 5'"
                  (click)="draftRating.set(star)"
                >
                  ★
                </button>
              }
            </div>
          </fieldset>

          <!-- Los criterios que el dominio pide. Sin ellos, sólo la nota global. -->
          @for (prompt of criteriaPrompts(); track prompt.id) {
            <fieldset class="syn-reviews__field">
              <legend class="syn-reviews__label">{{ prompt.label }}</legend>
              <div class="syn-reviews__rate" role="radiogroup">
                @for (star of stars; track star) {
                  <button
                    type="button"
                    class="syn-reviews__rate-btn syn-reviews__rate-btn--sm"
                    role="radio"
                    [class.is-on]="star <= criterionValue(prompt.id)"
                    [attr.aria-checked]="star === criterionValue(prompt.id)"
                    [attr.aria-label]="prompt.label + ': ' + star + ' de 5'"
                    (click)="setCriterion(prompt.id, star)"
                  >
                    ★
                  </button>
                }
              </div>
            </fieldset>
          }

          <div class="syn-reviews__field">
            <label class="syn-reviews__label" [attr.for]="headingId + '-title'">
              {{ config().titleLabel || 'Título' }}
            </label>
            <input
              class="syn-reviews__input"
              type="text"
              maxlength="80"
              [id]="headingId + '-title'"
              [value]="draftTitle()"
              (input)="onTitleInput($event)"
            />
          </div>

          <div class="syn-reviews__field">
            <label class="syn-reviews__label" [attr.for]="headingId + '-body'">
              {{ config().bodyLabel || 'Tu opinión' }}
            </label>
            <textarea
              class="syn-reviews__input syn-reviews__textarea"
              rows="4"
              [id]="headingId + '-body'"
              [value]="draftBody()"
              (input)="onBodyInput($event)"
            ></textarea>
          </div>

          @if (notice()) {
            <p
              class="syn-reviews__notice"
              [class.is-error]="noticeIsError()"
              [attr.role]="noticeIsError() ? 'alert' : 'status'"
            >
              {{ notice() }}
            </p>
          }

          <button
            type="submit"
            class="syn-reviews__submit"
            [disabled]="!ready() || sending()"
          >
            {{ sending() ? config().sendingLabel || 'Enviando…' : config().submitLabel || 'Publicar opinión' }}
          </button>
        </form>
      } @else if (blockedMessage(); as mensaje) {
        <!-- A quien no puede reseñar no se le enseña el formulario, y se dice por
             qué: uno que siempre rebota es peor que no ofrecerlo. Y ante un 403 NO
             se ofrece iniciar sesión — la sesión no es el problema (ADR 0112). -->
        <p class="syn-reviews__blocked" role="status">{{ mensaje }}</p>
      }

      <!-- ── La lista ───────────────────────────────────────────────────────── -->
      @if (entries().length === 0) {
        <p class="syn-reviews__empty">
          {{ config().emptyMessage || 'Todavía no hay opiniones. Sé la primera persona en contar su experiencia.' }}
        </p>
      } @else {
        <ul class="syn-reviews__list">
          @for (entry of entries(); track entry.id) {
            <li class="syn-reviews__entry">
              <p class="syn-reviews__entry-head">
                <span class="syn-reviews__entry-author">{{ entry.author }}</span>
                @if (entry.verified) {
                  <span class="syn-reviews__verified">{{ config().verifiedLabel || 'Compra verificada' }}</span>
                }
                <span class="syn-reviews__entry-date">{{ entry.date }}</span>
              </p>
              <p class="syn-reviews__entry-stars" [attr.aria-label]="entry.rating + ' de 5'">
                @for (star of stars; track star) {
                  <span
                    class="syn-reviews__star"
                    [class.is-on]="star <= entry.rating"
                    aria-hidden="true"
                    >★</span
                  >
                }
              </p>
              @if (entry.title) {
                <p class="syn-reviews__entry-title">{{ entry.title }}</p>
              }
              <p class="syn-reviews__entry-body">{{ entry.body }}</p>
              @if (entry.reply) {
                <p class="syn-reviews__entry-reply">{{ entry.reply }}</p>
              }
            </li>
          }
        </ul>

        @if (footerTemplate()) {
          <div class="syn-reviews__footer">
            <ng-container [ngTemplateOutlet]="footerTemplate()!" />
          </div>
        }
      }
    </section>
  `,
})
export class ReviewPanelComponent {
  static #seq = 0;
  readonly headingId = `syn-reviews-${(ReviewPanelComponent.#seq += 1)}`;
  readonly stars = ESTRELLAS;

  readonly config = input<ReviewPanelConfig>({});
  /** Resumen YA calculado por el dominio. */
  readonly summary = input<ReviewSummary>({ average: 0, count: 0 });
  readonly entries = input<readonly ReviewEntry[]>([]);
  /**
   * Si ESTA persona puede reseñar. Lo decide el dominio con el mismo gate que
   * aplica el envío — deducirlo acá sería adivinar y ofrecer un formulario que va
   * a rebotar.
   */
  readonly canReview = input(false);
  /** Por qué no puede, cuando no puede. */
  readonly blockedReason = input<ReviewBlockedReason | null>(null);
  /** Los criterios que este dominio le pide a quien escribe. */
  readonly criteriaPrompts = input<readonly ReviewCriterionPrompt[]>([]);
  /** Aviso del dominio tras un envío (éxito o motivo del rechazo). */
  readonly notice = input('');
  readonly noticeIsError = input(false);
  readonly sending = input(false);
  /** Slot del dominio bajo la lista: «ver todas», paginación, lo que sea. */
  readonly footerTemplate = input<TemplateRef<unknown> | null>(null);

  readonly submitreview = output<ReviewDraft>();

  readonly draftRating = signal(0);
  readonly draftTitle = signal('');
  readonly draftBody = signal('');
  readonly draftCriteria = signal<Readonly<Record<string, number>>>({});

  readonly roundedAverage = computed(() => Math.round(this.summary().average));
  readonly averageLabel = computed(() => this.scoreLabel(this.summary().average));
  readonly averageAria = computed(() => `${this.averageLabel()} de 5`);
  readonly distribution = computed(() => this.summary().distribution ?? []);
  readonly criteria = computed(() => this.summary().criteria ?? []);

  /** El total de la distribución sale de ELLA, no de `count`: el dominio puede
   *  estar paginando y `count` ser el total del servidor. */
  readonly distributionTotal = computed(() =>
    this.distribution().reduce((sum, bar) => sum + bar.count, 0),
  );

  readonly blockedMessage = computed<string | null>(() => {
    const config = this.config();
    switch (this.blockedReason()) {
      case 'unauthenticated':
        return config.blockedUnauthenticated || 'Inicia sesión para dejar tu opinión.';
      case 'not-consumer':
        // Sin oferta de login a propósito: la sesión no es el problema.
        return (
          config.blockedNotConsumer ||
          'Solo quien ya lo usó puede opinar. Cuando tengas tu experiencia, vuelve por acá.'
        );
      case 'already-reviewed':
        return config.blockedAlreadyReviewed || 'Ya dejaste tu opinión. ¡Gracias!';
      default:
        return null;
    }
  });

  /** Listo para enviar: nota puesta y cuerpo con sustancia. */
  readonly ready = computed(() => {
    const min = this.config().minBody ?? 10;
    return this.draftRating() > 0 && this.draftBody().trim().length >= min;
  });

  barPercent(bar: ReviewDistributionBar): number {
    const total = this.distributionTotal();
    return total > 0 ? Math.round((bar.count / total) * 100) : 0;
  }

  /** Una nota se lee con un decimal: «4,2». */
  scoreLabel(score: number): string {
    return score.toLocaleString('es-CO', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }

  criterionValue(id: string): number {
    return this.draftCriteria()[id] ?? 0;
  }

  setCriterion(id: string, value: number): void {
    this.draftCriteria.update((current) => ({ ...current, [id]: value }));
  }

  onTitleInput(event: Event): void {
    this.draftTitle.set((event.target as HTMLInputElement | null)?.value ?? '');
  }

  onBodyInput(event: Event): void {
    this.draftBody.set((event.target as HTMLTextAreaElement | null)?.value ?? '');
  }

  /**
   * Emite el borrador. **No se limpia acá**: sólo el dominio sabe si el servidor
   * lo aceptó, y borrar el texto antes de saberlo es el defecto #26 —publicar
   * borrando el único ejemplar— con otro disfraz. `reset()` lo llama el dominio.
   */
  onSubmit(event: Event): void {
    event.preventDefault();
    if (!this.ready() || this.sending()) {
      return;
    }
    this.submitreview.emit({
      rating: this.draftRating(),
      title: this.draftTitle().trim(),
      body: this.draftBody().trim(),
      criteria: { ...this.draftCriteria() },
    });
  }

  /** Lo llama el dominio cuando el servidor SÍ aceptó. */
  reset(): void {
    this.draftRating.set(0);
    this.draftTitle.set('');
    this.draftBody.set('');
    this.draftCriteria.set({});
  }
}
