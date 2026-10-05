import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, linkedSignal, output } from '@angular/core';
import { BadgeComponent } from '../../primitives/badge/badge';
import { classNames } from '../../../utils/class-names.util';

export type CarouselItemType = 'image' | 'video';

export interface CarouselItem {
  readonly id?: string;
  readonly src: string;
  readonly type?: CarouselItemType;
  readonly alt?: string;
  readonly label?: string;
  readonly thumbnailSrc?: string;
  readonly poster?: string;
  /**
   * A dónde lleva la diapositiva (CMS#192, caso 4). La imagen se vuelve el enlace, y su `alt`
   * —o el rótulo, si no tiene— su nombre accesible. Un vídeo no se envuelve: sus controles
   * dentro de un enlace serían dos acciones en el mismo sitio.
   */
  readonly href?: string;
}

@Component({
  selector: 'syn-carousel',
  standalone: true,
  imports: [BadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="syn-carousel"
      [class]="carouselClass()"
      role="region"
      [attr.aria-label]="ariaLabel()"
      tabindex="0"
      (keydown)="onKeydown($event)"
    >
      @if (activeItem(); as item) {
        <div
          class="syn-carousel__stage"
          [attr.role]="items().length > 1 ? 'group' : null"
          [attr.aria-label]="items().length > 1 ? activePositionLabel() : null"
        >
          @if ((item.type ?? 'image') === 'video') {
            <video
              class="syn-carousel__media"
              controls
              [attr.poster]="item.poster || null"
            >
              <source [src]="item.src" type="video/mp4" />
            </video>
          } @else if (item.href) {
            <a
              class="syn-carousel__link"
              [href]="item.href"
              [attr.aria-label]="item.alt ? null : item.label || null"
            >
              <img class="syn-carousel__media" [src]="item.src" [alt]="item.alt || ''" />
            </a>
          } @else {
            <img class="syn-carousel__media" [src]="item.src" [alt]="item.alt || ''" />
          }

          @if (item.label) {
            <div class="syn-carousel__meta">
              <syn-badge [text]="item.label" />
            </div>
          }
        </div>
      }

      @if (items().length > 1) {
        <div class="syn-carousel__controls">
          <button
            type="button"
            class="syn-carousel__control"
            [disabled]="!loop() && activeIndex() === 0"
            (click)="previous()"
          >
            {{ previousLabel() }}
          </button>

          <div class="syn-carousel__pager" role="tablist" [attr.aria-label]="pagerLabel()">
            @for (item of items(); track trackBy(item, $index); let index = $index) {
              <button
                type="button"
                class="syn-carousel__thumb"
                [class.syn-carousel__thumb--active]="activeIndex() === index"
                role="tab"
                [attr.aria-selected]="activeIndex() === index"
                [attr.aria-label]="thumbLabel(item, index)"
                (click)="select(index)"
              >
                @if (item.thumbnailSrc) {
                  <img
                    class="syn-carousel__thumb-image"
                    [src]="item.thumbnailSrc"
                    [alt]="item.alt || ''"
                  />
                } @else {
                  <span>{{ index + 1 }}</span>
                }
              </button>
            }
          </div>

          <button
            type="button"
            class="syn-carousel__control"
            [disabled]="!loop() && activeIndex() === lastIndex()"
            (click)="next()"
          >
            {{ nextLabel() }}
          </button>
        </div>
      }
    </section>
  `,
  styleUrl: './carousel.scss',
})
export class CarouselComponent {
  readonly #host = inject(ElementRef<HTMLElement>);

  readonly items = input<readonly CarouselItem[]>([]);
  readonly ariaLabel = input('Media carousel');
  /**
   * Los rótulos de los controles. Una hoja del design system recibe TEXTO, nunca claves ni el
   * diccionario (ADR 0136): los traduce quien la monta —`<synergos-carousel>` con `t()`— y se
   * los pasa. Estaban escritos aquí en inglés, «Previous»/«Next», y salían así en un sitio en
   * español (visto en vivo en /propiedades). Los defaults siguen siendo los de antes para quien
   * monte la pieza sin pasarlos.
   */
  readonly previousLabel = input('Previous');
  readonly nextLabel = input('Next');
  readonly pagerLabel = input('Slides');
  /** Nombre accesible de la miniatura de una diapositiva sin rótulo; `{n}` es su número. */
  readonly slideLabel = input('Slide {n}');
  /**
   * Nombre de la diapositiva visible (patrón APG de carrusel): sin él, quien no ve la pantalla no
   * sabe en cuál está ni cuántas hay. `{n}` es su número y `{total}` cuántas son.
   */
  readonly slidePositionLabel = input('Slide {n} of {total}');
  readonly loop = input(true);
  readonly startIndex = input(0);
  readonly compact = input(false);

  readonly activeIndex = linkedSignal(() => this.normalizeIndex(this.startIndex()));
  readonly activeItem = computed(() => this.items()[this.activeIndex()] ?? null);
  readonly lastIndex = computed(() => Math.max(0, this.items().length - 1));
  readonly activePositionLabel = computed(() =>
    this.slidePositionLabel()
      .replace('{n}', String(this.activeIndex() + 1))
      .replace('{total}', String(this.items().length)),
  );

  readonly activeIndexChange = output<number>();

  readonly carouselClass = computed(() =>
    classNames('syn-carousel', this.compact() && 'syn-carousel--compact'),
  );

  previous(): void {
    this.pauseVideos();
    const current = this.activeIndex();
    if (current <= 0) {
      if (this.loop()) {
        this.select(this.lastIndex());
      }
      return;
    }

    this.select(current - 1);
  }

  next(): void {
    this.pauseVideos();
    const current = this.activeIndex();
    if (current >= this.lastIndex()) {
      if (this.loop()) {
        this.select(0);
      }
      return;
    }

    this.select(current + 1);
  }

  select(index: number): void {
    const nextIndex = this.normalizeIndex(index);
    this.activeIndex.set(nextIndex);
    this.activeIndexChange.emit(nextIndex);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.previous();
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.next();
    }
  }

  thumbLabel(item: CarouselItem, index: number): string {
    return item.label || this.slideLabel().replace('{n}', String(index + 1));
  }

  trackBy(item: CarouselItem, index: number): string {
    return item.id ?? `${item.src}-${index}`;
  }

  private normalizeIndex(index: number): number {
    const total = this.items().length;
    if (total === 0) {
      return 0;
    }

    return Math.min(Math.max(0, index), total - 1);
  }

  private pauseVideos(): void {
    const hostElement = this.#host.nativeElement as HTMLElement;
    const videos = hostElement.querySelectorAll('video');
    videos.forEach((video) => {
      if (video instanceof HTMLVideoElement) {
        video.pause();
      }
    });
  }
}
