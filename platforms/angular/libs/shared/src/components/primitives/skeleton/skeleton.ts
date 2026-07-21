import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { classNames } from '../../../utils/class-names.util';

export type SkeletonShape = 'line' | 'block' | 'circle';
type SkeletonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'syn-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="syn-skeleton" [class]="skeletonClass()">
      @for (line of lineIndexes(); track line; let isLast = $last) {
        <span
          class="syn-skeleton__item"
          [class.syn-skeleton__item--last]="isLast && lines() > 1 && shape() === 'line'"
          [style.width]="lineWidth(isLast)"
          [style.height]="resolvedHeight()"
        ></span>
      }
    </div>
  `,
  styleUrl: './skeleton.scss',
})
export class SkeletonComponent {
  readonly shape = input<SkeletonShape>('line');
  readonly size = input<SkeletonSize>('md');
  readonly lines = input(1);
  readonly width = input('');
  readonly height = input('');
  readonly lastLineWidth = input('72%');
  readonly animated = input(true);

  readonly lineIndexes = computed(() =>
    Array.from({ length: Math.max(1, Math.floor(this.lines())) }, (_, index) => index),
  );

  readonly skeletonClass = computed(() =>
    classNames(
      'syn-skeleton',
      `syn-skeleton--${this.shape()}`,
      `syn-skeleton--${this.size()}`,
      !this.animated() && 'syn-skeleton--static',
    ),
  );

  resolvedHeight(): string {
    if (this.height()) {
      return this.height();
    }

    switch (this.shape()) {
      case 'block':
        return this.resolveBlockHeight();
      case 'circle':
        return this.resolveCircleSize();
      case 'line':
      default:
        return this.resolveLineHeight();
    }
  }

  lineWidth(isLast: boolean): string {
    if (this.width()) {
      return this.width();
    }

    if (this.shape() === 'circle') {
      return this.resolveCircleSize();
    }

    if (this.shape() === 'block') {
      return '100%';
    }

    return isLast && this.lines() > 1 ? this.lastLineWidth() : '100%';
  }

  private resolveLineHeight(): string {
    switch (this.size()) {
      case 'sm':
        return '0.75rem';
      case 'lg':
        return '1.25rem';
      case 'md':
      default:
        return '1rem';
    }
  }

  private resolveBlockHeight(): string {
    switch (this.size()) {
      case 'sm':
        return '4rem';
      case 'lg':
        return '8rem';
      case 'md':
      default:
        return '6rem';
    }
  }

  private resolveCircleSize(): string {
    switch (this.size()) {
      case 'sm':
        return '2rem';
      case 'lg':
        return '4rem';
      case 'md':
      default:
        return '3rem';
    }
  }
}
