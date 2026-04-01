import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { ButtonComponent } from '../../primitives/button/button';

@Component({
  selector: 'syn-read-more',
  standalone: true,
  imports: [ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="syn-read-more">
      <div class="syn-read-more__content">
        {{ displayedText() }}
      </div>

      @if (canToggle()) {
        <syn-button
          variant="ghost"
          size="sm"
          [label]="toggleLabel()"
          [ariaLabel]="toggleLabel()"
          (pressed)="toggle()"
        />
      }
    </div>
  `,
  styleUrl: './read-more.scss',
})
export class ReadMoreComponent implements OnInit {
  readonly summary = input('');
  readonly content = input('');
  readonly collapsedLabel = input('Show more');
  readonly expandedLabel = input('Show less');
  readonly initiallyExpanded = input(false);

  readonly #expanded = signal(false);
  readonly expandedChange = output<boolean>();

  readonly canToggle = computed(() => Boolean(this.summary() && this.content() && this.summary() !== this.content()));
  readonly displayedText = computed(() =>
    this.canToggle() && !this.#expanded() ? this.summary() : this.content() || this.summary(),
  );
  readonly toggleLabel = computed(() => (this.#expanded() ? this.expandedLabel() : this.collapsedLabel()));

  ngOnInit(): void {
    this.#expanded.set(this.initiallyExpanded() || !this.summary());
  }

  toggle(): void {
    if (!this.canToggle()) {
      return;
    }

    const nextValue = !this.#expanded();
    this.#expanded.set(nextValue);
    this.expandedChange.emit(nextValue);
  }
}
