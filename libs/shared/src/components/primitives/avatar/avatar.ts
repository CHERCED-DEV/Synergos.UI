import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

type AvatarSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'syn-avatar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="syn-avatar"
      [class.syn-avatar--sm]="size() === 'sm'"
      [class.syn-avatar--md]="size() === 'md'"
      [class.syn-avatar--lg]="size() === 'lg'"
      role="img"
      [attr.aria-label]="resolvedAlt()"
    >
      @if (hasImage()) {
        <img
          class="syn-avatar__image"
          [src]="src()"
          [alt]="resolvedAlt()"
          (error)="onImageError()"
        />
      } @else {
        <span class="syn-avatar__initials" aria-hidden="true">{{ initials() }}</span>
      }
    </span>
  `,
  styleUrl: './avatar.scss',
})
export class AvatarComponent {
  readonly name = input('');
  readonly src = input('');
  readonly alt = input('');
  readonly size = input<AvatarSize>('md');

  readonly #imageErrored = signal(false);

  readonly hasImage = computed(() => this.src().length > 0 && !this.#imageErrored());
  readonly initials = computed(() => {
    const parts = this.name().trim().split(' ').filter(Boolean);

    if (parts.length === 0) {
      return '?';
    }

    const first = parts[0]?.[0] ?? '';
    const second = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
    return `${first}${second}`.toUpperCase();
  });

  readonly resolvedAlt = computed(() => this.alt() || this.name() || 'User avatar');

  onImageError(): void {
    this.#imageErrored.set(true);
  }
}