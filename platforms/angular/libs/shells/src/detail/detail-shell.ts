import {
  ChangeDetectionStrategy,
  Component,
  type TemplateRef,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

/**
 * SH-2 — `syn-detail-shell` (catálogo §1.3 doc 21).
 *
 * The reusable P2 organism: PDP-style layout with a media gallery (main image +
 * thumbnail strip), an info column, a **sticky CTA panel** (template), a specs
 * panel, tabbed reviews / Q&A slots (templates), and a related block (template).
 * **Domain-free:** the shell renders whatever the consumer projects — it never
 * knows "producto/estadía/curso". Tabs only appear for the slots the consumer
 * actually provides.
 */

/** One gallery entry. */
export interface DetailMedia {
  readonly url: string;
  readonly alt?: string;
}

/** One row of the specs panel. */
export interface DetailSpec {
  readonly label: string;
  readonly value: string;
}

/** Copy + behaviour config. Everything optional. */
export interface DetailShellConfig {
  readonly backLabel?: string;
  readonly specsHeading?: string;
  readonly reviewsLabel?: string;
  readonly qaLabel?: string;
  readonly relatedHeading?: string;
  readonly galleryLabel?: string;
  readonly tabsLabel?: string;
  /** Placeholder glyph when there is no media. Default `◻`. */
  readonly mediaPlaceholder?: string;
}

let detailInstanceId = 0;

@Component({
  selector: 'syn-detail-shell',
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'syn-detail-shell' },
  styleUrl: './detail-shell.scss',
  template: `
    <article class="syn-detail">
      @if (showBack()) {
        <button type="button" class="syn-detail__back" (click)="back.emit()">
          ← {{ config().backLabel || 'Volver' }}
        </button>
      }

      <div class="syn-detail__top">
        <!-- Gallery: main media + thumbnail strip -->
        <div class="syn-detail__gallery" [attr.aria-label]="config().galleryLabel || 'Galería'">
          <div class="syn-detail__media">
            @if (activeMedia(); as media) {
              <img class="syn-detail__media-img" [src]="media.url" [alt]="media.alt || ''" />
            } @else {
              <span class="syn-detail__media-placeholder" aria-hidden="true">
                {{ config().mediaPlaceholder || '◻' }}
              </span>
            }
          </div>
          @if (media().length > 1) {
            <ul class="syn-detail__strip" role="listbox" [attr.aria-label]="config().galleryLabel || 'Galería'">
              @for (entry of media(); track entry.url; let index = $index) {
                <li class="syn-detail__strip-item">
                  <button
                    type="button"
                    class="syn-detail__thumb"
                    role="option"
                    [class.is-active]="index === activeMediaIndex()"
                    [attr.aria-selected]="index === activeMediaIndex()"
                    (click)="selectMedia(index)"
                  >
                    <img class="syn-detail__thumb-img" [src]="entry.url" [alt]="entry.alt || ''" />
                  </button>
                </li>
              }
            </ul>
          }
        </div>

        <!-- Info column -->
        <div class="syn-detail__info">
          @if (eyebrow()) {
            <p class="syn-detail__eyebrow">{{ eyebrow() }}</p>
          }
          <h1 class="syn-detail__title">{{ title() }}</h1>
          @if (subtitle()) {
            <p class="syn-detail__subtitle">{{ subtitle() }}</p>
          }
          @if (bodyTemplate(); as body) {
            <div class="syn-detail__body">
              <ng-container [ngTemplateOutlet]="body" />
            </div>
          }
          @if (specs().length > 0) {
            <section class="syn-detail__specs">
              <h2 class="syn-detail__heading">{{ config().specsHeading || 'Especificaciones' }}</h2>
              <dl class="syn-detail__specs-list">
                @for (spec of specs(); track spec.label) {
                  <div class="syn-detail__spec">
                    <dt class="syn-detail__spec-label">{{ spec.label }}</dt>
                    <dd class="syn-detail__spec-value">{{ spec.value }}</dd>
                  </div>
                }
              </dl>
            </section>
          }
        </div>

        <!-- Sticky CTA panel -->
        @if (ctaTemplate(); as cta) {
          <aside class="syn-detail__cta">
            <ng-container [ngTemplateOutlet]="cta" />
          </aside>
        }
      </div>

      <!-- Tabbed social proof: reviews / Q&A (only the provided slots) -->
      @if (tabs().length > 0) {
        <section class="syn-detail__social">
          <div class="syn-detail__tabs" role="tablist" [attr.aria-label]="config().tabsLabel || 'Opiniones y preguntas'">
            @for (tab of tabs(); track tab.id) {
              <button
                type="button"
                role="tab"
                class="syn-detail__tab"
                [id]="fieldId + '-tab-' + tab.id"
                [class.is-active]="activeTab() === tab.id"
                [attr.aria-selected]="activeTab() === tab.id"
                [attr.aria-controls]="fieldId + '-panel-' + tab.id"
                (click)="selectTab(tab.id)"
              >
                {{ tab.label }}
              </button>
            }
          </div>
          @for (tab of tabs(); track tab.id) {
            @if (activeTab() === tab.id) {
              <div
                class="syn-detail__tab-panel"
                role="tabpanel"
                [id]="fieldId + '-panel-' + tab.id"
                [attr.aria-labelledby]="fieldId + '-tab-' + tab.id"
              >
                <ng-container [ngTemplateOutlet]="tab.template" />
              </div>
            }
          }
        </section>
      }

      <!-- Related -->
      @if (relatedTemplate(); as related) {
        <section class="syn-detail__related">
          <h2 class="syn-detail__heading">{{ config().relatedHeading || 'Relacionados' }}</h2>
          <ng-container [ngTemplateOutlet]="related" />
        </section>
      }
    </article>
  `,
})
export class DetailShellComponent {
  // ─── Inputs ────────────────────────────────────────────────────────────────
  readonly config = input<DetailShellConfig>({});
  readonly eyebrow = input('');
  readonly title = input('');
  readonly subtitle = input('');
  readonly media = input<readonly DetailMedia[]>([]);
  readonly specs = input<readonly DetailSpec[]>([]);
  readonly showBack = input(true);
  /** Sticky buy-box / CTA panel content. */
  readonly ctaTemplate = input<TemplateRef<unknown> | null>(null);
  /** Free description/body block under the title. */
  readonly bodyTemplate = input<TemplateRef<unknown> | null>(null);
  /** Reviews slot — its tab renders only when provided. */
  readonly reviewsTemplate = input<TemplateRef<unknown> | null>(null);
  /** Q&A slot — its tab renders only when provided. */
  readonly qaTemplate = input<TemplateRef<unknown> | null>(null);
  /** Related items block. */
  readonly relatedTemplate = input<TemplateRef<unknown> | null>(null);

  // ─── Outputs ───────────────────────────────────────────────────────────────
  readonly back = output<void>();
  readonly mediachange = output<number>();

  readonly fieldId = `syn-detail-${(detailInstanceId += 1)}`;

  // ─── State ─────────────────────────────────────────────────────────────────
  /** Resets to the first media whenever the gallery input changes. */
  readonly activeMediaIndex = linkedSignal(() => {
    this.media();
    return 0;
  });

  readonly activeMedia = computed(() => this.media()[this.activeMediaIndex()] ?? null);

  readonly tabs = computed(() => {
    const tabs: { id: string; label: string; template: TemplateRef<unknown> }[] = [];
    const reviews = this.reviewsTemplate();
    if (reviews) {
      tabs.push({ id: 'reviews', label: this.config().reviewsLabel || 'Opiniones', template: reviews });
    }
    const qa = this.qaTemplate();
    if (qa) {
      tabs.push({ id: 'qa', label: this.config().qaLabel || 'Preguntas', template: qa });
    }
    return tabs;
  });

  /** Follows the first available tab whenever the provided slots change. */
  readonly activeTab = linkedSignal(() => this.tabs()[0]?.id ?? '');

  // ─── Actions ───────────────────────────────────────────────────────────────
  selectMedia(index: number): void {
    if (index === this.activeMediaIndex() || index < 0 || index >= this.media().length) {
      return;
    }
    this.activeMediaIndex.set(index);
    this.mediachange.emit(index);
  }

  selectTab(id: string): void {
    if (id !== this.activeTab()) {
      this.activeTab.set(id);
    }
  }
}
