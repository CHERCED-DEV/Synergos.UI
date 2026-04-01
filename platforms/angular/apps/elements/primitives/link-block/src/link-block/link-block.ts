import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LinkComponent } from '@synergos/shared';

type LinkTone = 'brand' | 'neutral' | 'inverse';

@Component({
  selector: 'sg-link-block',
  imports: [LinkComponent],
  templateUrl: './link-block.html',
  styleUrl: './link-block.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-link-block' },
})
export class LinkBlockComponent {
  readonly href = input<string>('');
  readonly label = input<string>('');
  readonly target = input<string>('_self');
  readonly ariaLabel = input<string>('');
  readonly variant = input<string>('default');

  readonly resolvedTone = computed<LinkTone>(() =>
    this.variant() === 'subtle' ? 'neutral' : 'brand',
  );
  readonly underline = computed(() => this.variant() !== 'subtle');
}
