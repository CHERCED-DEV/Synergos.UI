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
  readonly id = input('');
  readonly title = input('');
  readonly description = input('');
  readonly collapsible = input(true);
  readonly disabled = input(false);
  readonly initiallyExpanded = input(false);
  readonly tone = input<'neutral' | 'brand'>('neutral');

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
