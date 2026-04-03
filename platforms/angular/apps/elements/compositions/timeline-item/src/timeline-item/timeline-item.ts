import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { TimelineItemElementConfig } from '@synergos/contracts';
import {
  DateDisplayComponent,
  HeadingComponent,
  type HeadingTone,
  coerceConfigInput,
  resolveConfigValue,
  resolveHeadingTone,
} from '@synergos/shared';

@Component({
  selector: 'sg-timeline-item',
  imports: [DateDisplayComponent, HeadingComponent],
  templateUrl: './timeline-item.html',
  styleUrl: './timeline-item.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-timeline-item' },
})
export class TimelineItemElementComponent {
  readonly configInput = input<Partial<TimelineItemElementConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<TimelineItemElementConfig>,
  });
  readonly headingTextInput = input<string | undefined>(undefined, { alias: 'headingText' });
  readonly bodyInput = input<string | undefined>(undefined, { alias: 'body' });
  readonly dateInput = input<string | undefined>(undefined, { alias: 'date' });
  readonly variantInput = input<string | undefined>(undefined, { alias: 'variant' });
  readonly themeInput = input<string | undefined>(undefined, { alias: 'theme' });

  readonly headingText = computed(() =>
    resolveConfigValue(this.headingTextInput(), this.configInput()?.headingText, ''),
  );
  readonly body = computed(() =>
    resolveConfigValue(this.bodyInput(), this.configInput()?.body, ''),
  );
  readonly date = computed(() =>
    resolveConfigValue(this.dateInput(), this.configInput()?.date, ''),
  );
  readonly variant = computed(() =>
    resolveConfigValue(this.variantInput(), this.configInput()?.variant, 'default'),
  );
  readonly theme = computed(() =>
    resolveConfigValue(this.themeInput(), this.configInput()?.theme, 'light'),
  );
  readonly hasDate = computed(() => this.date().trim().length > 0);
  readonly headingTone = computed<HeadingTone>(() => resolveHeadingTone(this.theme()));
  readonly hostClasses = computed(
    () => `timeline-item--${this.variant()} timeline-item--${this.theme()}`,
  );
}
