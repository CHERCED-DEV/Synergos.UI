import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { InitialDataService } from '@synergos/core';
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
 * Runtime config for the CMS element <c>elementSynAppLauncher</c>.
 *
 * The launcher/gallery of domain apps for SynergosLabs (the platform hub).
 * Each app renders as a domain card (icon + name + tagline + status badge)
 * inside a filterable, searchable grid; clicking a card deep-links to the
 * app's siteRoot (or marks it as an embed). Filtering and searching are
 * entirely client-side and reactive (signals); facets are derived from the
 * apps' own `industry` / `persona` / `capabilities` metadata.
 *
 * The shared `@synergos/contracts` package does not yet declare an
 * `AppLauncherElementConfig`; the canonical shape lives here next to the
 * component until that contract lands in the registry ola.
 */
export interface AppLauncherRuntimeConfig {
  readonly title?: string;
  /**
   * Línea de apoyo bajo el título. Sin default: si el CMS no compone nada, el `@if` del
   * template no pinta el `<p>` y el header queda exactamente como estaba — el cambio es
   * aditivo. El alias del ElementType es `subheading`; la traducción de nombre vive en
   * `SynHost/AppLauncher.cshtml`, que es la frontera CMS↔componente.
   */
  readonly subtitle?: string;
  readonly searchLabel?: string;
  readonly searchPlaceholder?: string;
  readonly ctaLabel?: string;
  readonly emptyLabel?: string;
  readonly allFiltersLabel?: string;
  readonly apps?: readonly DomainAppConfig[];
}

export type DomainAppStatus = 'live' | 'beta' | 'soon';
export type DomainAppDemoMode = 'embed' | 'deeplink';

export interface DomainAppConfig {
  readonly id?: string;
  readonly name?: string;
  readonly tagline?: string;
  readonly icon?: string;
  readonly status?: string;
  readonly industry?: string;
  readonly persona?: string;
  readonly capabilities?: readonly string[];
  readonly url?: string;
  readonly demoMode?: string;
}

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

const STATUS_LABELS: Record<DomainAppStatus, string> = {
  live: 'En vivo',
  beta: 'Beta',
  soon: 'Próximamente',
};

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

export function normalizeApps(value: unknown): readonly DomainApp[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index): DomainApp | null => {
      if (!isRecord(entry)) {
        return null;
      }

      const name = readString(entry['name']).trim();
      if (!name) {
        return null;
      }

      const id = readString(entry['id']).trim() || `app-${index}`;
      const tagline = readString(entry['tagline']).trim();
      const icon = readString(entry['icon']).trim();
      const status = normalizeStatus(entry['status']);
      const industry = readString(entry['industry']).trim();
      const persona = readString(entry['persona']).trim();
      const capabilities = readStringArray(entry['capabilities']);
      const url = readString(entry['url']).trim();
      const demoMode = normalizeDemoMode(entry['demoMode']);

      const searchText = [name, tagline, industry, persona, ...capabilities]
        .join(' ')
        .toLowerCase();

      return {
        id,
        name,
        tagline,
        icon,
        status,
        statusLabel: STATUS_LABELS[status],
        industry,
        persona,
        capabilities,
        url,
        demoMode,
        searchText,
      };
    })
    .filter((app): app is DomainApp => app !== null);
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

function sanitizeAppLauncherConfig(
  value: Partial<AppLauncherRuntimeConfig>,
): Partial<AppLauncherRuntimeConfig> {
  return omitUndefinedProperties<AppLauncherRuntimeConfig>({
    title: coerceTrimmedStringInput(value.title),
    subtitle: coerceTrimmedStringInput(value.subtitle),
    searchLabel: coerceTrimmedStringInput(value.searchLabel),
    searchPlaceholder: coerceTrimmedStringInput(value.searchPlaceholder),
    ctaLabel: coerceTrimmedStringInput(value.ctaLabel),
    emptyLabel: coerceTrimmedStringInput(value.emptyLabel),
    allFiltersLabel: coerceTrimmedStringInput(value.allFiltersLabel),
    apps: value.apps,
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

  readonly config = input<AppLauncherRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<AppLauncherRuntimeConfig>(sanitizeAppLauncherConfig),
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
    resolveConfigValue(this.titleInput(), this.config()?.title, 'Galería de aplicaciones'),
  );
  // Default vacío A PROPÓSITO: el Hub no tenía subtítulo, y un default de fábrica lo
  // pintaría siempre. Con '' sólo aparece cuando el editor compone algo.
  readonly subtitle = computed(() =>
    resolveConfigValue(this.subtitleInput(), this.config()?.subtitle, ''),
  );
  readonly searchLabel = computed(() =>
    resolveConfigValue(this.searchLabelInput(), this.config()?.searchLabel, 'Buscar aplicaciones'),
  );
  readonly searchPlaceholder = computed(() =>
    resolveConfigValue(
      this.searchPlaceholderInput(),
      this.config()?.searchPlaceholder,
      'Buscar por nombre, industria o capacidad…',
    ),
  );
  readonly ctaLabel = computed(() =>
    resolveConfigValue(this.ctaLabelInput(), this.config()?.ctaLabel, 'Abrir app'),
  );
  readonly emptyLabel = computed(() =>
    resolveConfigValue(
      this.emptyLabelInput(),
      this.config()?.emptyLabel,
      'No hay aplicaciones que coincidan con los filtros.',
    ),
  );
  readonly allFiltersLabel = computed(() =>
    resolveConfigValue(this.allFiltersLabelInput(), this.config()?.allFiltersLabel, 'Todas'),
  );

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
      return count === 1 ? '1 aplicación' : `${count} aplicaciones`;
    }

    return `${count} de ${total} aplicaciones`;
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
