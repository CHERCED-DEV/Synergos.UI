import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { ButtonGroupElementConfig } from '@synergos/contracts';
import { InitialDataService } from '@synergos/core';
import { ButtonComponent, coerceConfigInput, resolveConfigValue } from '@synergos/shared';

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

function resolveButtonVariant(value: string): ButtonVariant {
  return value === 'outline' || value === 'ghost' ? value : 'solid';
}

function resolveButtonSize(value: string): ButtonSize {
  return value === 'sm' || value === 'lg' ? value : 'md';
}

function resolveAlignment(value: string): ButtonGroupAlignment {
  return value === 'center' || value === 'right' ? value : 'left';
}

function resolveDirection(value: string): ButtonGroupDirection {
  return value === 'column' ? 'column' : 'row';
}

function resolveGap(value: string): ButtonGroupGap {
  return value === 'xs' || value === 'md' || value === 'lg' ? value : 'sm';
}

function normalizeButtonGroupItem(value: unknown): ButtonGroupItem | null {
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

  readonly configInput = input<Partial<ButtonGroupElementConfig> | undefined, unknown>(undefined, {
    alias: 'config',
    transform: coerceConfigInput<ButtonGroupElementConfig>,
  });
  readonly buttonsInput = input<string | undefined>(undefined, { alias: 'buttons' });
  readonly alignmentInput = input<string | undefined>(undefined, { alias: 'alignment' });
  readonly gapInput = input<string | undefined>(undefined, { alias: 'gap' });
  readonly directionInput = input<string | undefined>(undefined, { alias: 'direction' });

  readonly alignment = computed(() =>
    resolveConfigValue(this.alignmentInput(), this.configInput()?.alignment, 'left'),
  );
  readonly gap = computed(() =>
    resolveConfigValue(this.gapInput(), this.configInput()?.gap, 'sm'),
  );
  readonly direction = computed(() =>
    resolveConfigValue(this.directionInput(), this.configInput()?.direction, 'row'),
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

    const configItems = this.configInput()?.items;
    if (Array.isArray(configItems)) {
      return configItems
        .map((item) => normalizeButtonGroupItem(item))
        .filter((item): item is ButtonGroupItem => item !== null);
    }

    return [];
  });
  readonly hostClasses = computed(
    () =>
      `sg-button-group--${resolveAlignment(this.alignment())} sg-button-group--${resolveDirection(this.direction())} sg-button-group--gap-${resolveGap(this.gap())}`,
  );
}
