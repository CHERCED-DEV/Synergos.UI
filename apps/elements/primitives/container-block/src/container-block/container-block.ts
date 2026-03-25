import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

@Component({
  selector: 'sg-container-block',
  imports: [],
  templateUrl: './container-block.html',
  styleUrl: './container-block.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-container-block' },
})
export class ContainerBlockComponent {
  // ── Inputs ────────────────────────────────────────────────────────────────
  readonly containerType = input<string>('default');
  readonly maxWidth = input<string>('');
  readonly padding = input<string>('md');
  readonly theme = input<string>('light');

  // ── Derived state ─────────────────────────────────────────────────────────
  readonly hostClasses = computed(() => `sg-container-block--${this.containerType()} sg-container-block--pad-${this.padding()} sg-container-block--${this.theme()}`);
}
