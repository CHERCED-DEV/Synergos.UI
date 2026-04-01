import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { classNames } from '../../../utils/class-names.util';
import { coerceConfigInput, resolveConfigValue } from '../../../utils/config-input.util';

export interface AccordionConfig {
  readonly id?: string;
  readonly title?: string;
  readonly description?: string;
  readonly collapsible?: boolean;
  readonly disabled?: boolean;
  readonly initiallyExpanded?: boolean;
  readonly tone?: 'neutral' | 'brand';
}

let accordionId = 0;

@Component({
  selector: 'syn-accordion',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="syn-accordion" [class]="accordionClass()">
      @if (collapsible()) {
        <button
          type="button"
          class="syn-accordion__trigger"
          [id]="headerId()"
          [disabled]="disabled()"
          [attr.aria-controls]="panelId()"
          [attr.aria-expanded]="expanded()"
          (click)="toggle()"
        >
          <span class="syn-accordion__copy">
            <span class="syn-accordion__title">{{ title() }}</span>

            @if (description()) {
              <span class="syn-accordion__description">{{ description() }}</span>
            }
          </span>

          <span class="syn-accordion__icon" aria-hidden="true">
            {{ expanded() ? '−' : '+' }}
          </span>
        </button>
      } @else {
        <div class="syn-accordion__trigger syn-accordion__trigger--static" [id]="headerId()">
          <span class="syn-accordion__copy">
            <span class="syn-accordion__title">{{ title() }}</span>

            @if (description()) {
              <span class="syn-accordion__description">{{ description() }}</span>
            }
          </span>
        </div>
      }

      @if (expanded() || !collapsible()) {
        <div
          class="syn-accordion__panel"
          role="region"
          [id]="panelId()"
          [attr.aria-labelledby]="headerId()"
        >
          <ng-content />
        </div>
      }
    </section>
  `,
  styleUrl: './accordion.scss',
})
export class AccordionComponent implements OnInit {
  readonly configInput = input<Partial<AccordionConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<AccordionConfig>,
  });
  readonly idInput = input<string | undefined>(undefined, { alias: 'id' });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly descriptionInput = input<string | undefined>(undefined, { alias: 'description' });
  readonly collapsibleInput = input<boolean | undefined>(undefined, { alias: 'collapsible' });
  readonly disabledInput = input<boolean | undefined>(undefined, { alias: 'disabled' });
  readonly initiallyExpandedInput = input<boolean | undefined>(undefined, {
    alias: 'initiallyExpanded',
  });
  readonly toneInput = input<'neutral' | 'brand' | undefined>(undefined, { alias: 'tone' });

  readonly id = computed(() =>
    resolveConfigValue(this.idInput(), this.configInput()?.id, ''),
  );
  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.configInput()?.title, ''),
  );
  readonly description = computed(() =>
    resolveConfigValue(this.descriptionInput(), this.configInput()?.description, ''),
  );
  readonly collapsible = computed(() =>
    resolveConfigValue(this.collapsibleInput(), this.configInput()?.collapsible, true),
  );
  readonly disabled = computed(() =>
    resolveConfigValue(this.disabledInput(), this.configInput()?.disabled, false),
  );
  readonly initiallyExpanded = computed(() =>
    resolveConfigValue(
      this.initiallyExpandedInput(),
      this.configInput()?.initiallyExpanded,
      false,
    ),
  );
  readonly tone = computed(() =>
    resolveConfigValue(this.toneInput(), this.configInput()?.tone, 'neutral'),
  );

  readonly #expanded = signal(false);
  readonly expandedChange = output<boolean>();

  readonly expanded = computed(() =>
    this.collapsible() ? this.#expanded() : true,
  );

  readonly accordionClass = computed(() =>
    classNames(
      'syn-accordion',
      `syn-accordion--${this.tone()}`,
      this.expanded() && 'syn-accordion--expanded',
      this.disabled() && 'syn-accordion--disabled',
      !this.collapsible() && 'syn-accordion--static',
    ),
  );

  readonly headerId = computed(() => `${this.baseId()}-header`);
  readonly panelId = computed(() => `${this.baseId()}-panel`);
  private readonly baseId = computed(() => this.id() || `syn-accordion-${accordionId}`);

  constructor() {
    accordionId += 1;
  }

  ngOnInit(): void {
    this.#expanded.set(this.initiallyExpanded());
  }

  toggle(): void {
    if (this.disabled() || !this.collapsible()) {
      return;
    }

    const nextValue = !this.#expanded();
    this.#expanded.set(nextValue);
    this.expandedChange.emit(nextValue);
  }
}
