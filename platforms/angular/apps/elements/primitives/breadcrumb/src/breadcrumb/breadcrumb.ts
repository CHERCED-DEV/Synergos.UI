import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import type { BreadcrumbProps } from '@synergos/contracts';
import { InitialDataService } from '@synergos/core';
import { createConfigInputTransform, omitUndefinedProperties } from '@synergos/shared';
import { t } from '@synergos/vitals-core';

/**
 * <synergos-breadcrumb>: navigation breadcrumbs — an ordered trail of items, each optionally
 * linked, separated by a glyph, with the final item flagged as the current page
 * (`aria-current="page"`). Items can be authored as a JSON array (objects with `label`/`href`,
 * or bare strings).
 *
 * El `config` que manda el CMS tiene la forma de `BreadcrumbProps`, GENERADO del record C#
 * (ADR 0135): `items` es una LISTA ya parseada (`label`/`href`). La vista mandaba el TEXTO
 * `itemsJson` y este elemento hidrataba sin migas (D1). `label` (el nombre accesible de la
 * navegación) y `separator` no los autora el editor: llegan por atributo.
 *
 * Sin atributo, el nombre de la navegación sale del diccionario con `t()` (ADR 0136): la clave
 * `Nav.Breadcrumb` ya existía para esto —«Ruta de navegación»— y `BreadcrumbProps` declara
 * justo ese sub-prefijo, no `Nav` entero (17 claves que la miga no usa). Decía «Migas de pan»,
 * escrito a mano: una segunda copia del mismo concepto con otro texto.
 *
 * **El JSON-LD `BreadcrumbList` NO es de este elemento** (UI#90, regla 49). Lo intentaba con un
 * `<script type="application/ld+json">` en la plantilla, y el compilador de Angular quita los
 * `<script>` de las plantillas: con el interruptor encendido, 0 `ld+json` en el bundle y en el
 * DOM. Lo emite el CMS en el SSR —el resolver de `breadcrumb`, con los mismos pasos que viajan
 * acá—, junto al tag y no dentro, porque la hidratación vacía el host. Por eso no hay input
 * `includeStructuredData`: prometía algo que este elemento no puede cumplir.
 */

/** Fully-resolved trail item ready to render. */
export interface BreadcrumbItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly position: number;
  readonly isCurrent: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return '';
}

/**
 * Coerce arbitrary authored input into a clean breadcrumb trail. Strings
 * become label-only items; objects read `label`/`href`. Entries without a
 * usable label are dropped. The last surviving item is always the current
 * page (its href is cleared so it renders as plain text).
 */
export function normalizeItems(value: unknown): readonly BreadcrumbItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const cleaned = value
    .map((entry): { label: string; href: string } | null => {
      if (typeof entry === 'string') {
        const label = entry.trim();
        return label ? { label, href: '' } : null;
      }

      if (isRecord(entry)) {
        const label = (readString(entry['label']).trim() || readString(entry['text']).trim());
        const href = (readString(entry['href']).trim() || readString(entry['url']).trim());
        return label ? { label, href } : null;
      }

      return null;
    })
    .filter((item): item is { label: string; href: string } => item !== null);

  const lastIndex = cleaned.length - 1;

  return cleaned.map((item, index): BreadcrumbItem => {
    const isCurrent = index === lastIndex;
    return {
      id: `crumb-${index}-${item.label}`,
      label: item.label,
      href: isCurrent ? '' : item.href,
      position: index + 1,
      isCurrent,
    };
  });
}

/** Lo que llega en `config`, saneado. Exportado: `contrato-synhost.spec.ts` lo ejecuta con el `config` real de la vista. */
export function sanitizeBreadcrumbConfig(value: Partial<BreadcrumbProps>): Partial<BreadcrumbProps> {
  const items = normalizeItems(value.items);
  return omitUndefinedProperties<BreadcrumbProps>({
    items: items.length > 0 ? items : undefined,
  });
}

@Component({
  selector: 'sg-breadcrumb',
  standalone: true,
  templateUrl: './breadcrumb.html',
  styleUrl: './breadcrumb.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-breadcrumb' },
})
export class BreadcrumbElementComponent {
  readonly #initialData = inject(InitialDataService);

  readonly config = input<Partial<BreadcrumbProps> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<BreadcrumbProps>(sanitizeBreadcrumbConfig),
  });
  readonly labelInput = input<string | undefined>(undefined, { alias: 'label' });
  readonly separatorInput = input<string | undefined>(undefined, { alias: 'separator' });
  readonly itemsInput = input<string | undefined>(undefined, { alias: 'items' });

  readonly label = computed(() => this.labelInput() ?? t('Nav.Breadcrumb', 'Ruta de navegación'));
  readonly separator = computed(() => this.separatorInput() ?? '/');

  readonly items = computed<readonly BreadcrumbItem[]>(() =>
    normalizeItems(this.resolveSource(this.itemsInput(), this.config()?.items)),
  );

  readonly hasItems = computed(() => this.items().length > 0);

  private resolveSource(rawInput: string | undefined, configValue: unknown): unknown {
    if (rawInput !== undefined) {
      return this.#initialData.parseValue<unknown>(rawInput);
    }

    return configValue;
  }
}
