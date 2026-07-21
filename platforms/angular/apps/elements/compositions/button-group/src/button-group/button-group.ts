import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { ButtonGroupElementConfig } from '@synergos/contracts';
import { InitialDataService } from '@synergos/core';
import {
  ButtonComponent,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

type ButtonGroupAlignment = 'left' | 'center' | 'right';
type ButtonGroupDirection = 'row' | 'column';
type ButtonGroupGap = 'xs' | 'sm' | 'md' | 'lg';
type ButtonSize = 'sm' | 'md' | 'lg';
type ButtonVariant = 'solid' | 'outline' | 'ghost';

interface ButtonGroupItem {
  readonly label: string;
  readonly variant: ButtonVariant;
  readonly size: ButtonSize;
  readonly href: string;
  readonly target: string;
  readonly disabled: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

export function resolveButtonVariant(value: string): ButtonVariant {
  return value === 'outline' || value === 'ghost' ? value : 'solid';
}

export function resolveButtonSize(value: string): ButtonSize {
  return value === 'sm' || value === 'lg' ? value : 'md';
}

export function resolveAlignment(value: string): ButtonGroupAlignment {
  return value === 'center' || value === 'right' ? value : 'left';
}

export function resolveDirection(value: string): ButtonGroupDirection {
  return value === 'column' ? 'column' : 'row';
}

export function resolveGap(value: string): ButtonGroupGap {
  return value === 'xs' || value === 'md' || value === 'lg' ? value : 'sm';
}

export function normalizeButtonGroupItem(value: unknown): ButtonGroupItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const label = readString(value['label']).trim();
  if (!label) {
    return null;
  }

  return {
    label,
    variant: resolveButtonVariant(readString(value['variant'])),
    size: resolveButtonSize(readString(value['size'])),
    href: readString(value['href']).trim(),
    target: readString(value['target']).trim() || '_self',
    disabled: readBoolean(value['disabled']),
  };
}

export function normalizeButtonGroupItems(value: unknown): readonly ButtonGroupItem[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .map((item) => normalizeButtonGroupItem(item))
    .filter((item): item is ButtonGroupItem => item !== null);

  return items.length > 0 ? items : undefined;
}

function readLegacyButtons(value: Partial<ButtonGroupElementConfig>): unknown {
  return isRecord(value) ? (value as Record<string, unknown>)['buttons'] : undefined;
}

export function sanitizeButtonGroupConfig(
  value: Partial<ButtonGroupElementConfig>,
): Partial<ButtonGroupElementConfig> {
  const alignment = coerceTrimmedStringInput(value.alignment);
  const direction = coerceTrimmedStringInput(value.direction);
  const gap = coerceTrimmedStringInput(value.gap);
  const items = normalizeButtonGroupItems(value.items) ?? normalizeButtonGroupItems(readLegacyButtons(value));

  return omitUndefinedProperties<Partial<ButtonGroupElementConfig>>({
    alignment: alignment ? resolveAlignment(alignment) : undefined,
    direction: direction ? resolveDirection(direction) : undefined,
    gap: gap ? resolveGap(gap) : undefined,
    items: items as Partial<ButtonGroupElementConfig>['items'],
  });
}

@Component({
  selector: 'sg-button-group',
  imports: [ButtonComponent],
  templateUrl: './button-group.html',
  styleUrl: './button-group.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-button-group' },
})
export class ButtonGroupComponent {
  readonly #initialData = inject(InitialDataService);

  readonly config = input<Partial<ButtonGroupElementConfig> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<ButtonGroupElementConfig>(sanitizeButtonGroupConfig),
  });
  readonly buttonsInput = input<string | undefined>(undefined, { alias: 'buttons' });
  readonly alignmentInput = input<string | undefined>(undefined, { alias: 'alignment' });
  readonly gapInput = input<string | undefined>(undefined, { alias: 'gap' });
  readonly directionInput = input<string | undefined>(undefined, { alias: 'direction' });

  readonly alignment = computed(() =>
    resolveConfigValue(this.alignmentInput(), this.config()?.alignment, 'left'),
  );
  readonly gap = computed(() =>
    resolveConfigValue(this.gapInput(), this.config()?.gap, 'sm'),
  );
  readonly direction = computed(() =>
    resolveConfigValue(this.directionInput(), this.config()?.direction, 'row'),
  );

  readonly parsedButtons = computed<readonly ButtonGroupItem[]>(() => {
    if (this.buttonsInput() !== undefined) {
      const parsedValue = this.#initialData.parseValue<unknown>(this.buttonsInput());

      if (!Array.isArray(parsedValue)) {
        return [];
      }

      return parsedValue
        .map((item) => normalizeButtonGroupItem(item))
        .filter((item): item is ButtonGroupItem => item !== null);
    }

    const configItems = normalizeButtonGroupItems(this.config()?.items);
    if (configItems) {
      return configItems;
    }

    return [];
  });
  readonly hostClasses = computed(
    () =>
      `sg-button-group--${resolveAlignment(this.alignment())} sg-button-group--${resolveDirection(this.direction())} sg-button-group--gap-${resolveGap(this.gap())}`,
  );
}
