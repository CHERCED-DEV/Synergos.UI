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
        <div class="syn-carousel__stage">
          @if ((item.type ?? 'image') === 'video') {
            <video
              class="syn-carousel__media"
              controls
              [attr.poster]="item.poster || null"
            >
              <source [src]="item.src" type="video/mp4" />
            </video>
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
            Previous
          </button>

          <div class="syn-carousel__pager" role="tablist" aria-label="Slides">
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
            Next
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
  readonly loop = input(true);
  readonly startIndex = input(0);
  readonly compact = input(false);

  readonly activeIndex = linkedSignal(() => this.normalizeIndex(this.startIndex()));
  readonly activeItem = computed(() => this.items()[this.activeIndex()] ?? null);
  readonly lastIndex = computed(() => Math.max(0, this.items().length - 1));

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
    return item.label || `Slide ${index + 1}`;
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
