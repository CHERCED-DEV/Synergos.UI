import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

@Component({
  selector: 'sg-image-block',
  imports: [],
  templateUrl: './image-block.html',
  styleUrl: './image-block.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-image-block' },
})
export class ImageBlockComponent {
  // ── Inputs ────────────────────────────────────────────────────────────────
  readonly src = input<string>('');
  readonly alt = input<string>('');
  readonly caption = input<string>('');
  readonly aspectRatio = input<string>('auto');
  readonly loading = input<string>('lazy');

  // ── Derived state ─────────────────────────────────────────────────────────
  readonly hasCaption = computed(() => !!this.caption());
}
