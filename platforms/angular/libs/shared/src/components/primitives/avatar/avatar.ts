import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';
type AvatarLoading = 'eager' | 'lazy';

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
      [class.syn-avatar--xl]="size() === 'xl'"
      role="img"
      [attr.aria-label]="resolvedAlt()"
    >
      @if (hasImage()) {
        <img
          class="syn-avatar__image"
          [src]="src()"
          [alt]="resolvedAlt()"
          [attr.loading]="loading() === 'lazy' ? 'lazy' : null"
          [attr.decoding]="loading() === 'lazy' ? 'async' : null"
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
  /** `lazy` para las listas largas (un feed, unas cuentas): la foto se pide al acercarse a la vista. */
  readonly loading = input<AvatarLoading>('eager');

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