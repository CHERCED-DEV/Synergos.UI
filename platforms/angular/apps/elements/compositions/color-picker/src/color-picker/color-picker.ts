import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynColorPicker</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-color-picker',
  standalone: true,
  templateUrl: './color-picker.html',
  styleUrl: './color-picker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-color-picker' },
})
export class ColorPickerElementComponent {
  readonly label = input<string | undefined>(undefined);
  readonly initialColor = input<string | undefined>(undefined);
  readonly paletteJson = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
