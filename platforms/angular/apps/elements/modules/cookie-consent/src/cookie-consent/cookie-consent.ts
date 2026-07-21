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
  coerceOptionalBooleanInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynCookieConsent</c>.
 *
 * A privacy consent banner: the visitor can accept all, reject non-essential,
 * or open a preferences panel to toggle each non-essential category. The
 * decision is persisted to <c>localStorage</c> so the banner stays dismissed
 * across visits, and broadcast through the <c>cookieconsent</c> CustomEvent so
 * integrations (analytics, marketing) can react without polling.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface CookieConsentRuntimeConfig {
  readonly bannerText?: string;
  readonly acceptLabel?: string;
  readonly rejectLabel?: string;
  readonly settingsLabel?: string;
  readonly saveLabel?: string;
  readonly title?: string;
  readonly policyLink?: string;
  readonly policyLabel?: string;
  readonly storageKey?: string;
  readonly categories?: readonly CookieCategoryConfig[];
}

export interface CookieCategoryConfig {
  readonly id?: string;
  readonly label?: string;
  readonly description?: string;
  /** Essential categories are always on and cannot be toggled off. */
  readonly essential?: boolean;
  /** Initial state for optional categories (ignored when essential). */
  readonly enabled?: boolean;
}

export interface CookieCategory {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly essential: boolean;
  readonly enabled: boolean;
}

/** The persisted consent record and the `cookieconsent` CustomEvent detail. */
export interface CookieConsentDecision {
  /** 'accept' = all on, 'reject' = only essentials, 'custom' = per-category. */
  readonly action: 'accept' | 'reject' | 'custom';
  /** Map of category id → granted. */
  readonly categories: Readonly<Record<string, boolean>>;
  /** ISO timestamp of the decision. */
  readonly timestamp: string;
}

const DEFAULT_STORAGE_KEY = 'syn-cookie-consent';
const DEFAULT_BANNER_TEXT =
  'Usamos cookies para mejorar tu experiencia y analizar el tráfico del sitio. Tú decides qué aceptar.';
const DEFAULT_TITLE = 'Tu privacidad';
const DEFAULT_ACCEPT_LABEL = 'Aceptar todo';
const DEFAULT_REJECT_LABEL = 'Rechazar';
const DEFAULT_SETTINGS_LABEL = 'Configurar';
const DEFAULT_SAVE_LABEL = 'Guardar preferencias';
const DEFAULT_POLICY_LABEL = 'Política de cookies';

const DEFAULT_CATEGORIES: readonly CookieCategory[] = [
  {
    id: 'necessary',
    label: 'Necesarias',
    description: 'Imprescindibles para el funcionamiento del sitio. Siempre activas.',
    essential: true,
    enabled: true,
  },
  {
    id: 'analytics',
    label: 'Analíticas',
    description: 'Nos ayudan a entender cómo se usa el sitio para mejorarlo.',
    essential: false,
    enabled: false,
  },
  {
    id: 'marketing',
    label: 'Marketing',
    description: 'Permiten mostrar contenido y anuncios más relevantes.',
    essential: false,
    enabled: false,
  },
];

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

export function normalizeCategories(value: unknown): readonly CookieCategory[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  return value
    .map((entry, index): CookieCategory | null => {
      if (!isRecord(entry)) {
        return null;
      }

      const id = (readString(entry['id']).trim() || `cat-${index}`).toLowerCase();
      const label = readString(entry['label']).trim();
      if (!label || seen.has(id)) {
        return null;
      }
      seen.add(id);

      const essential = entry['essential'] === true;
      return {
        id,
        label,
        description: readString(entry['description']).trim(),
        essential,
        // Essentials are always granted; optionals default off unless asked.
        enabled: essential ? true : entry['enabled'] === true,
      };
    })
    .filter((category): category is CookieCategory => category !== null);
}

function sanitizeCookieConsentConfig(
  value: Partial<CookieConsentRuntimeConfig>,
): CookieConsentRuntimeConfig {
  return omitUndefinedProperties<CookieConsentRuntimeConfig>({
    bannerText: coerceTrimmedStringInput(value.bannerText),
    acceptLabel: coerceTrimmedStringInput(value.acceptLabel),
    rejectLabel: coerceTrimmedStringInput(value.rejectLabel),
    settingsLabel: coerceTrimmedStringInput(value.settingsLabel),
    saveLabel: coerceTrimmedStringInput(value.saveLabel),
    title: coerceTrimmedStringInput(value.title),
    policyLink: coerceTrimmedStringInput(value.policyLink),
    policyLabel: coerceTrimmedStringInput(value.policyLabel),
    storageKey: coerceTrimmedStringInput(value.storageKey),
    categories: value.categories,
  });
}

@Component({
  selector: 'sg-cookie-consent',
  standalone: true,
  templateUrl: './cookie-consent.html',
  styleUrl: './cookie-consent.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-cookie-consent' },
})
export class CookieConsentElementComponent {
  readonly #destroyRef = inject(DestroyRef);

  readonly config = input<CookieConsentRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<CookieConsentRuntimeConfig>(sanitizeCookieConsentConfig),
  });
  readonly bannerTextInput = input<string | undefined>(undefined, { alias: 'bannerText' });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly acceptLabelInput = input<string | undefined>(undefined, { alias: 'acceptLabel' });
  readonly rejectLabelInput = input<string | undefined>(undefined, { alias: 'rejectLabel' });
  readonly settingsLabelInput = input<string | undefined>(undefined, { alias: 'settingsLabel' });
  readonly saveLabelInput = input<string | undefined>(undefined, { alias: 'saveLabel' });
  readonly policyLinkInput = input<string | undefined>(undefined, { alias: 'policyLink' });
  readonly policyLabelInput = input<string | undefined>(undefined, { alias: 'policyLabel' });
  readonly storageKeyInput = input<string | undefined>(undefined, { alias: 'storageKey' });
  readonly categoriesInput = input<string | undefined>(undefined, { alias: 'categories' });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `cookieconsent` CustomEvent. */
  readonly cookieconsent = output<CookieConsentDecision>();

  readonly bannerText = computed(() =>
    resolveConfigValue(this.bannerTextInput(), this.config()?.bannerText, DEFAULT_BANNER_TEXT),
  );
  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.config()?.title, DEFAULT_TITLE),
  );
  readonly acceptLabel = computed(() =>
    resolveConfigValue(this.acceptLabelInput(), this.config()?.acceptLabel, DEFAULT_ACCEPT_LABEL),
  );
  readonly rejectLabel = computed(() =>
    resolveConfigValue(this.rejectLabelInput(), this.config()?.rejectLabel, DEFAULT_REJECT_LABEL),
  );
  readonly settingsLabel = computed(() =>
    resolveConfigValue(this.settingsLabelInput(), this.config()?.settingsLabel, DEFAULT_SETTINGS_LABEL),
  );
  readonly saveLabel = computed(() =>
    resolveConfigValue(this.saveLabelInput(), this.config()?.saveLabel, DEFAULT_SAVE_LABEL),
  );
  readonly policyLink = computed(() =>
    resolveConfigValue(this.policyLinkInput(), this.config()?.policyLink, ''),
  );
  readonly policyLabel = computed(() =>
    resolveConfigValue(this.policyLabelInput(), this.config()?.policyLabel, DEFAULT_POLICY_LABEL),
  );
  readonly hasPolicyLink = computed(() => this.policyLink().trim().length > 0);

  readonly storageKey = computed(() =>
    resolveConfigValue(this.storageKeyInput(), this.config()?.storageKey, DEFAULT_STORAGE_KEY),
  );

  /** Categories from inputs/config, falling back to the canonical defaults. */
  readonly categories = computed<readonly CookieCategory[]>(() => {
    const normalized = normalizeCategories(this.resolveCategoriesSource());
    return normalized.length > 0 ? normalized : DEFAULT_CATEGORIES;
  });

  /** Live per-category toggle state inside the preferences panel. */
  readonly #selections = signal<Readonly<Record<string, boolean>>>({});

  /** Whether the banner is shown (false once a decision is persisted). */
  readonly #visible = signal<boolean>(true);
  readonly visible = this.#visible.asReadonly();

  /** Whether the per-category preferences panel is expanded. */
  readonly #settingsOpen = signal<boolean>(false);
  readonly settingsOpen = this.#settingsOpen.asReadonly();

  /** The decision read back from storage, if any (null = undecided). */
  readonly #storedDecision = signal<CookieConsentDecision | null>(null);
  readonly storedDecision = this.#storedDecision.asReadonly();

  /** Toggle state merged with category defaults — drives the panel checkboxes. */
  readonly categoryStates = computed(() =>
    this.categories().map((category) => ({
      ...category,
      enabled: category.essential ? true : this.#selections()[category.id] ?? category.enabled,
    })),
  );

  constructor() {
    // Hydrate from storage once; if a decision exists the banner stays hidden.
    const stored = this.readStoredDecision();
    if (stored) {
      this.#storedDecision.set(stored);
      this.#visible.set(false);
    }

    this.#destroyRef.onDestroy(() => {
      // No subscriptions / timers to tear down — signals are synchronous.
    });
  }

  toggleSettings(): void {
    const opening = !this.#settingsOpen();
    if (opening) {
      // Seed the panel with the current (default) state when first opened.
      const seed: Record<string, boolean> = {};
      for (const category of this.categories()) {
        seed[category.id] = category.essential ? true : category.enabled;
      }
      this.#selections.set({ ...seed, ...this.#selections() });
    }
    this.#settingsOpen.set(opening);
  }

  toggleCategory(category: CookieCategory, granted: boolean): void {
    if (category.essential) {
      return;
    }
    this.#selections.update((current) => ({ ...current, [category.id]: granted }));
  }

  isGranted(category: CookieCategory): boolean {
    if (category.essential) {
      return true;
    }
    return this.#selections()[category.id] ?? category.enabled;
  }

  acceptAll(): void {
    const map: Record<string, boolean> = {};
    for (const category of this.categories()) {
      map[category.id] = true;
    }
    this.commit('accept', map);
  }

  rejectAll(): void {
    const map: Record<string, boolean> = {};
    for (const category of this.categories()) {
      map[category.id] = category.essential;
    }
    this.commit('reject', map);
  }

  savePreferences(): void {
    const map: Record<string, boolean> = {};
    for (const category of this.categories()) {
      map[category.id] = this.isGranted(category);
    }
    this.commit('custom', map);
  }

  onCheckboxChange(category: CookieCategory, event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.toggleCategory(category, target?.checked ?? false);
  }

  /** Persist the decision, emit the event, and dismiss the banner. */
  private commit(action: CookieConsentDecision['action'], categories: Record<string, boolean>): void {
    const decision: CookieConsentDecision = {
      action,
      categories,
      timestamp: new Date().toISOString(),
    };

    this.writeStoredDecision(decision);
    this.#storedDecision.set(decision);
    this.#settingsOpen.set(false);
    this.#visible.set(false);
    this.cookieconsent.emit(decision);
  }

  private resolveCategoriesSource(): unknown {
    const raw = this.categoriesInput();
    if (raw !== undefined) {
      const trimmed = raw.trim();
      if (!trimmed) {
        return undefined;
      }
      try {
        return JSON.parse(trimmed);
      } catch {
        return undefined;
      }
    }
    return this.config()?.categories;
  }

  private readStoredDecision(): CookieConsentDecision | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    try {
      const raw = localStorage.getItem(this.storageKey());
      if (!raw) {
        return null;
      }
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed) || !isRecord(parsed['categories'])) {
        return null;
      }
      const action = readString(parsed['action']);
      return {
        action: action === 'accept' || action === 'reject' ? action : 'custom',
        categories: parsed['categories'] as Record<string, boolean>,
        timestamp: readString(parsed['timestamp']),
      };
    } catch {
      return null;
    }
  }

  private writeStoredDecision(decision: CookieConsentDecision): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify(decision));
    } catch {
      // Storage may be unavailable (private mode / quota) — fail silently.
    }
  }
}
