import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import type { AppDelLanzador, AppLauncherProps } from '@synergos/contracts';
import { InitialDataService } from '@synergos/core';
import { t } from '@synergos/vitals-core';
import {
  BadgeComponent,
  HeadingComponent,
  LinkComponent,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * <synergos-app-launcher>: el lanzador de las apps de cada dominio (el hub de SynergosLabs).
 * Cada app es una tarjeta (icono + nombre + bajada + estado) en una rejilla con búsqueda y tres
 * filtros que se derivan de los datos de las propias apps; la tarjeta lleva a su siteRoot.
 *
 * Es una FUNCIONALIDAD (ADR 0134) y la del piloto de la ADR 0136 (CMS#186):
 *  - el `config` que manda el CMS tiene la forma de `AppLauncherProps`, GENERADO del record C#
 *    (ADR 0135): `title`, `subtitle` y `apps` como lista ya parseada. Nada más: una funcionalidad
 *    no recibe `configOverride`;
 *  - su microcopia sale del diccionario, secciones `AppLauncher` y `Common.States`, y la traduce
 *    ESTE componente con `t()`: las piezas del DS que monta (`syn-heading`, `syn-badge`,
 *    `syn-link`) reciben el texto ya traducido. Antes eran 18 textos a mano, y cinco sólo se
 *    podían cambiar tecleando JSON en el bloque. Los atributos `searchLabel`, `ctaLabel`… siguen
 *    ganando para quien monte el elemento a mano.
 */
export type DomainAppStatus = 'live' | 'beta' | 'soon';
export type DomainAppDemoMode = 'embed' | 'deeplink';

interface DomainApp {
  readonly id: string;
  readonly name: string;
  readonly tagline: string;
  readonly icon: string;
  readonly status: DomainAppStatus;
  readonly statusLabel: string;
  readonly industry: string;
  readonly persona: string;
  readonly capabilities: readonly string[];
  readonly url: string;
  readonly demoMode: DomainAppDemoMode;
  /** Lower-cased haystack for free-text search. */
  readonly searchText: string;
}

export interface AppSelectDetail {
  readonly id: string;
  readonly url: string;
  readonly demoMode: DomainAppDemoMode;
}

interface FacetOption {
  readonly value: string;
  readonly label: string;
}

const STATUSES: readonly DomainAppStatus[] = ['live', 'beta', 'soon'];
const DEMO_MODES: readonly DomainAppDemoMode[] = ['embed', 'deeplink'];

/** El rótulo del estado, del diccionario. Claves LITERALES: el gate las cruza con el contrato. */
function etiquetaDeEstado(status: DomainAppStatus): string {
  switch (status) {
    case 'live':
      return t('AppLauncher.Status.Live', 'En vivo');
    case 'beta':
      return t('AppLauncher.Status.Beta', 'Beta');
    default:
      return t('Common.States.ComingSoon', 'Próximamente');
  }
}

export const ALL_FACET_VALUE = '__all__';

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

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  return '';
}

function readStringArray(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => readString(entry).trim())
      .filter((entry): entry is string => entry.length > 0);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  return [];
}

function normalizeStatus(value: unknown): DomainAppStatus {
  const candidate = readString(value).trim().toLowerCase() as DomainAppStatus;
  return STATUSES.includes(candidate) ? candidate : 'soon';
}

function normalizeDemoMode(value: unknown): DomainAppDemoMode {
  const candidate = readString(value).trim().toLowerCase() as DomainAppDemoMode;
  return DEMO_MODES.includes(candidate) ? candidate : 'deeplink';
}

/**
 * Las apps del cable (`AppDelLanzador`), saneadas: recorta, normaliza `status`/`demoMode` a su
 * vocabulario, `capabilities` como lista (una cadena con comas también vale) y da `id` a la que no
 * lo trae. Una app sin `name` no se pinta. Es lo que hace el sanitizador del `config` con `apps`.
 */
export function normalizarAppsDelCable(value: unknown): readonly AppDelLanzador[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index): AppDelLanzador | null => {
      if (!isRecord(entry)) {
        return null;
      }

      const name = readString(entry['name']).trim();
      if (!name) {
        return null;
      }

      const tagline = readString(entry['tagline']).trim();
      const icon = readString(entry['icon']).trim();
      const industry = readString(entry['industry']).trim();
      const persona = readString(entry['persona']).trim();
      const url = readString(entry['url']).trim();

      return {
        name,
        id: readString(entry['id']).trim() || `app-${index}`,
        ...(tagline ? { tagline } : {}),
        ...(icon ? { icon } : {}),
        status: normalizeStatus(entry['status']),
        ...(industry ? { industry } : {}),
        ...(persona ? { persona } : {}),
        capabilities: readStringArray(entry['capabilities']),
        ...(url ? { url } : {}),
        demoMode: normalizeDemoMode(entry['demoMode']),
      };
    })
    .filter((app): app is AppDelLanzador => app !== null);
}

/** Las apps listas para pintar: las del cable más su rótulo de estado (del diccionario) y su texto de búsqueda. */
export function normalizeApps(value: unknown): readonly DomainApp[] {
  return normalizarAppsDelCable(value).map((app, index): DomainApp => {
    const status = normalizeStatus(app.status);
    const tagline = app.tagline ?? '';
    const industry = app.industry ?? '';
    const persona = app.persona ?? '';
    const capabilities = app.capabilities ?? [];
    return {
      id: app.id ?? `app-${index}`,
      name: app.name,
      tagline,
      icon: app.icon ?? '',
      status,
      statusLabel: etiquetaDeEstado(status),
      industry,
      persona,
      capabilities,
      url: app.url ?? '',
      demoMode: normalizeDemoMode(app.demoMode),
      searchText: [app.name, tagline, industry, persona, ...capabilities].join(' ').toLowerCase(),
    };
  });
}

function buildFacet(values: readonly string[]): readonly FacetOption[] {
  const seen = new Set<string>();
  const options: FacetOption[] = [];

  for (const raw of values) {
    const value = raw.trim();
    if (!value) {
      continue;
    }

    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    options.push({ value, label: value });
  }

  return options.sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

/**
 * Lo que llega en `config`, saneado. Exportado: `contrato-synhost.spec.ts` lo ejecuta con el
 * `config` real de la vista. La microcopia (`searchLabel`, `ctaLabel`…) ya NO viaja en el
 * `config`: sale del diccionario.
 */
export function sanitizeAppLauncherConfig(value: Partial<AppLauncherProps>): Partial<AppLauncherProps> {
  const apps = normalizarAppsDelCable(value.apps);
  return omitUndefinedProperties<AppLauncherProps>({
    title: coerceTrimmedStringInput(value.title),
    subtitle: coerceTrimmedStringInput(value.subtitle),
    apps: apps.length > 0 ? apps : undefined,
  });
}

@Component({
  selector: 'sg-app-launcher',
  standalone: true,
  imports: [BadgeComponent, HeadingComponent, LinkComponent],
  templateUrl: './app-launcher.html',
  styleUrl: './app-launcher.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-app-launcher' },
})
export class AppLauncherElementComponent {
  readonly #initialData = inject(InitialDataService);
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly config = input<Partial<AppLauncherProps> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<AppLauncherProps>(sanitizeAppLauncherConfig),
  });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly subtitleInput = input<string | undefined>(undefined, { alias: 'subtitle' });
  readonly searchLabelInput = input<string | undefined>(undefined, { alias: 'searchLabel' });
  readonly searchPlaceholderInput = input<string | undefined>(undefined, {
    alias: 'searchPlaceholder',
  });
  readonly ctaLabelInput = input<string | undefined>(undefined, { alias: 'ctaLabel' });
  readonly emptyLabelInput = input<string | undefined>(undefined, { alias: 'emptyLabel' });
  readonly allFiltersLabelInput = input<string | undefined>(undefined, { alias: 'allFiltersLabel' });
  readonly appsInput = input<string | undefined>(undefined, { alias: 'apps' });

  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.config()?.title, t('AppLauncher.Title', 'Galería de aplicaciones')),
  );
  // Default vacío A PROPÓSITO: el Hub no tenía subtítulo, y un default de fábrica lo
  // pintaría siempre. Con '' sólo aparece cuando el editor compone algo.
  readonly subtitle = computed(() =>
    resolveConfigValue(this.subtitleInput(), this.config()?.subtitle, ''),
  );
  // ─── Microcopia: del diccionario (ADR 0136); el atributo gana para quien monte a mano ───
  readonly searchLabel = computed(
    () => this.searchLabelInput() ?? t('AppLauncher.Search.Label', 'Buscar aplicaciones'),
  );
  readonly searchPlaceholder = computed(
    () =>
      this.searchPlaceholderInput() ??
      t('AppLauncher.Search.Placeholder', 'Buscar por nombre, industria o capacidad…'),
  );
  readonly ctaLabel = computed(() => this.ctaLabelInput() ?? t('AppLauncher.Open', 'Abrir app'));
  readonly emptyLabel = computed(
    () =>
      this.emptyLabelInput() ??
      t('AppLauncher.Empty', 'No hay aplicaciones que coincidan con los filtros.'),
  );
  readonly allFiltersLabel = computed(
    () => this.allFiltersLabelInput() ?? t('AppLauncher.Filters.All', 'Todas'),
  );
  readonly filtersLabel = computed(() => t('AppLauncher.Filters.Aria', 'Filtros'));
  readonly industryLabel = computed(() => t('AppLauncher.Filters.Industry', 'Industria'));
  readonly personaLabel = computed(() => t('AppLauncher.Filters.Persona', 'Persona'));
  readonly capabilityLabel = computed(() => t('AppLauncher.Filters.Capability', 'Capacidad'));
  readonly capabilitiesLabel = computed(() => t('AppLauncher.Capabilities', 'Capacidades'));
  readonly embedLabel = computed(() => t('AppLauncher.EmbedPreview', 'Vista previa integrada'));

  /** «Estado: En vivo», el nombre accesible del distintivo de cada app. */
  statusAriaLabel(app: DomainApp): string {
    return t('AppLauncher.Status.Aria', 'Estado: {status}', { status: app.statusLabel });
  }

  readonly allApps = computed<readonly DomainApp[]>(() =>
    normalizeApps(this.resolveSource(this.appsInput(), this.config()?.apps)),
  );

  // ─── Facets (derived from the apps' own metadata) ──────────────────────────
  readonly industryOptions = computed<readonly FacetOption[]>(() =>
    buildFacet(this.allApps().map((app) => app.industry)),
  );
  readonly personaOptions = computed<readonly FacetOption[]>(() =>
    buildFacet(this.allApps().map((app) => app.persona)),
  );
  readonly capabilityOptions = computed<readonly FacetOption[]>(() =>
    buildFacet(this.allApps().flatMap((app) => app.capabilities)),
  );

  readonly hasIndustryFilter = computed(() => this.industryOptions().length > 0);
  readonly hasPersonaFilter = computed(() => this.personaOptions().length > 0);
  readonly hasCapabilityFilter = computed(() => this.capabilityOptions().length > 0);
  readonly hasFilters = computed(
    () => this.hasIndustryFilter() || this.hasPersonaFilter() || this.hasCapabilityFilter(),
  );

  // ─── Live filter / search state (signals, immediate commit) ────────────────
  readonly query = signal('');
  readonly industry = signal(ALL_FACET_VALUE);
  readonly persona = signal(ALL_FACET_VALUE);
  readonly capability = signal(ALL_FACET_VALUE);

  readonly visibleApps = computed<readonly DomainApp[]>(() => {
    const query = this.query().trim().toLowerCase();
    const industry = this.industry();
    const persona = this.persona();
    const capability = this.capability();

    return this.allApps().filter((app) => {
      if (query && !app.searchText.includes(query)) {
        return false;
      }

      if (industry !== ALL_FACET_VALUE && app.industry !== industry) {
        return false;
      }

      if (persona !== ALL_FACET_VALUE && app.persona !== persona) {
        return false;
      }

      if (capability !== ALL_FACET_VALUE && !app.capabilities.includes(capability)) {
        return false;
      }

      return true;
    });
  });

  readonly resultCount = computed(() => this.visibleApps().length);
  readonly resultLabel = computed(() => {
    const count = this.resultCount();
    const total = this.allApps().length;
    if (count === total) {
      return count === 1
        ? t('AppLauncher.Count.One', '1 aplicación')
        : t('AppLauncher.Count.Other', '{count} aplicaciones', { count });
    }

    return t('AppLauncher.Count.Filtered', '{count} de {total} aplicaciones', { count, total });
  });

  onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.query.set(target?.value ?? '');
  }

  onIndustryChange(event: Event): void {
    this.industry.set(this.readSelectValue(event));
  }

  onPersonaChange(event: Event): void {
    this.persona.set(this.readSelectValue(event));
  }

  onCapabilityChange(event: Event): void {
    this.capability.set(this.readSelectValue(event));
  }

  /**
   * Emits `appselect` so the host page can route to the app's siteRoot
   * (deep-link) or open the embed preview. The native anchor still performs
   * default navigation for deep-link cards; the event lets the hub intercept.
   */
  onSelect(app: DomainApp): void {
    const detail: AppSelectDetail = { id: app.id, url: app.url, demoMode: app.demoMode };
    this.#host.nativeElement.dispatchEvent(
      new CustomEvent<AppSelectDetail>('appselect', { detail, bubbles: true, composed: true }),
    );
  }

  private readSelectValue(event: Event): string {
    const target = event.target as HTMLSelectElement | null;
    return target?.value ?? ALL_FACET_VALUE;
  }

  private resolveSource(rawInput: string | undefined, configValue: unknown): unknown {
    if (rawInput !== undefined) {
      return this.#initialData.parseValue<unknown>(rawInput);
    }

    return configValue;
  }
}
