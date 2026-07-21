import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynRichTooltip</c>.
 *
 * A rich tooltip: a trigger (text or wrapped content) that, on hover/focus,
 * reveals a floating panel carrying a title, a body paragraph and an optional
 * call-to-action link. Built for inline help, glossary terms and contextual
 * guidance across the verticals. Interaction is keyboard-accessible (focus
 * opens, Escape closes) and the panel uses `role="tooltip"` wired to the
 * trigger via `aria-describedby`.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface RichTooltipRuntimeConfig {
  readonly triggerText?: string;
  readonly title?: string;
  readonly body?: string;
  readonly actionLabel?: string;
  readonly actionHref?: string;
  readonly placement?: string;
}

/** Emitted on the `tooltiptoggle` CustomEvent and the typed Angular output. */
export interface RichTooltipToggleDetail {
  readonly open: boolean;
}

export type RichTooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

const PLACEMENTS: readonly RichTooltipPlacement[] = ['top', 'bottom', 'left', 'right'];
const DEFAULT_PLACEMENT: RichTooltipPlacement = 'top';

let tooltipSeq = 0;

export function normalizePlacement(value: unknown): RichTooltipPlacement {
  const candidate = coerceTrimmedStringInput(value)?.toLowerCase() as RichTooltipPlacement | undefined;
  return candidate && PLACEMENTS.includes(candidate) ? candidate : DEFAULT_PLACEMENT;
}

function sanitizeRichTooltipConfig(
  value: Partial<RichTooltipRuntimeConfig>,
): RichTooltipRuntimeConfig {
  return omitUndefinedProperties<RichTooltipRuntimeConfig>({
    triggerText: coerceTrimmedStringInput(value.triggerText),
    title: coerceTrimmedStringInput(value.title),
    body: coerceTrimmedStringInput(value.body),
    actionLabel: coerceTrimmedStringInput(value.actionLabel),
    actionHref: coerceTrimmedStringInput(value.actionHref),
    placement: coerceTrimmedStringInput(value.placement),
  });
}

@Component({
  selector: 'sg-rich-tooltip',
  standalone: true,
  templateUrl: './rich-tooltip.html',
  styleUrl: './rich-tooltip.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-rich-tooltip' },
})
export class RichTooltipElementComponent {
  readonly #destroyRef = inject(DestroyRef);

  readonly config = input<RichTooltipRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<RichTooltipRuntimeConfig>(sanitizeRichTooltipConfig),
  });
  readonly triggerTextInput = input<string | undefined>(undefined, { alias: 'triggerText' });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly bodyInput = input<string | undefined>(undefined, { alias: 'body' });
  readonly actionLabelInput = input<string | undefined>(undefined, { alias: 'actionLabel' });
  readonly actionHrefInput = input<string | undefined>(undefined, { alias: 'actionHref' });
  readonly placementInput = input<string | undefined>(undefined, { alias: 'placement' });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `tooltiptoggle` CustomEvent. */
  readonly tooltiptoggle = output<RichTooltipToggleDetail>();

  /** Stable id linking the trigger's aria-describedby to the panel. */
  readonly panelId = `syn-rich-tooltip-panel-${++tooltipSeq}`;

  readonly triggerText = computed(() =>
    resolveConfigValue(this.triggerTextInput(), this.config()?.triggerText, ''),
  );
  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.config()?.title, ''),
  );
  readonly body = computed(() =>
    resolveConfigValue(this.bodyInput(), this.config()?.body, ''),
  );
  readonly actionLabel = computed(() =>
    resolveConfigValue(this.actionLabelInput(), this.config()?.actionLabel, ''),
  );
  readonly actionHref = computed(() =>
    resolveConfigValue(this.actionHrefInput(), this.config()?.actionHref, ''),
  );
  readonly placement = computed<RichTooltipPlacement>(() =>
    normalizePlacement(resolveConfigValue(this.placementInput(), this.config()?.placement, '')),
  );

  readonly hasTitle = computed(() => this.title().length > 0);
  readonly hasBody = computed(() => this.body().length > 0);
  readonly hasAction = computed(
    () => this.actionLabel().length > 0 && this.actionHref().length > 0,
  );
  readonly hasContent = computed(() => this.hasTitle() || this.hasBody() || this.hasAction());

  /** Accessible label for the trigger when it shows no visible text. */
  readonly triggerLabel = computed(
    () => this.triggerText() || this.title() || 'Más información',
  );

  readonly #open = signal(false);
  readonly open = this.#open.asReadonly();

  /** Defers close so a pointer travelling trigger → panel does not flicker. */
  #closeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.#destroyRef.onDestroy(() => this.clearCloseTimer());
  }

  show(): void {
    this.clearCloseTimer();
    this.setOpen(true);
  }

  hide(): void {
    this.clearCloseTimer();
    this.setOpen(false);
  }

  /** Toggle used by click/tap (touch has no hover). */
  toggle(): void {
    this.clearCloseTimer();
    this.setOpen(!this.#open());
  }

  /** Schedule a close, cancellable if focus/pointer re-enters the widget. */
  scheduleHide(): void {
    this.clearCloseTimer();
    if (typeof setTimeout !== 'function') {
      this.setOpen(false);
      return;
    }
    this.#closeTimer = setTimeout(() => {
      this.#closeTimer = null;
      this.setOpen(false);
    }, 120);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.#open()) {
      event.preventDefault();
      this.hide();
    }
  }

  private setOpen(next: boolean): void {
    if (this.#open() === next) {
      return;
    }
    this.#open.set(next);
    this.tooltiptoggle.emit({ open: next });
  }

  private clearCloseTimer(): void {
    if (this.#closeTimer !== null) {
      clearTimeout(this.#closeTimer);
      this.#closeTimer = null;
    }
  }
}
