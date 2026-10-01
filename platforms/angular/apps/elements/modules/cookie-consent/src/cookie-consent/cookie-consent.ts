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
import type { CookieConsentProps } from '@synergos/contracts';
import { t } from '@synergos/vitals-core';
import {
  coerceOptionalBooleanInput,
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * <synergos-cookie-consent>: a privacy consent banner. The visitor can accept all, reject
 * non-essential, or open a preferences panel to toggle each non-essential category. The
 * decision is persisted to <c>localStorage</c> so the banner stays dismissed across visits, and
 * broadcast through the <c>cookieconsent</c> CustomEvent so integrations (analytics, marketing)
 * can react without polling.
 *
 * El `config` que manda el CMS tiene la forma de `CookieConsentProps`, GENERADO del record C#
 * (ADR 0135): los textos del aviso y el enlace a la política (`policyLink` + `policyLabel`). La
 * vista mandaba `policyUrl` y el aviso salía sin enlace a la política (D1). `title`,
 * `saveLabel`, `storageKey` y `categories` no los autora el editor: llegan por atributo.
 *
 * Los textos por defecto —lo que se pinta cuando ni el editor ni un atributo dicen nada— salen
 * de la sección `Cookie` del diccionario con `t()` (ADR 0136; la declara `CookieConsentProps`).
 * Cinco reusan claves que ya existían para este aviso (`AcceptAll`, `RejectAll`, `Customize`,
 * `BannerMessage`, `MoreInfo`): el respaldo de cada `t()` es su valor es-CO, así que con o sin
 * puente el elemento dice lo mismo que el diccionario.
 */
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

/**
 * Las tres categorías canónicas, con sus textos del diccionario. Una función y no una constante:
 * `t()` lee el puente al llamarla, y el módulo se evalúa antes de que el elemento se monte.
 */
function defaultCategories(): readonly CookieCategory[] {
  return [
    {
      id: 'necessary',
      label: t('Cookie.Necessary.Label', 'Necesarias'),
      description: t('Cookie.Necessary.Description', 'Imprescindibles para el funcionamiento del sitio. Siempre activas.'),
      essential: true,
      enabled: true,
    },
    {
      id: 'analytics',
      label: t('Cookie.Analytics.Label', 'Analíticas'),
      description: t('Cookie.Analytics.Description', 'Nos ayudan a entender cómo se usa el sitio para mejorarlo.'),
      essential: false,
      enabled: false,
    },
    {
      id: 'marketing',
      label: t('Cookie.Marketing.Label', 'Marketing'),
      description: t('Cookie.Marketing.Description', 'Permiten mostrar contenido y anuncios más relevantes.'),
      essential: false,
      enabled: false,
    },
  ];
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

/** Lo que llega en `config`, saneado. Exportado: `contrato-synhost.spec.ts` lo ejecuta con el `config` real de la vista. */
export function sanitizeCookieConsentConfig(value: Partial<CookieConsentProps>): Partial<CookieConsentProps> {
  return omitUndefinedProperties<CookieConsentProps>({
    bannerText: coerceTrimmedStringInput(value.bannerText),
    acceptLabel: coerceTrimmedStringInput(value.acceptLabel),
    rejectLabel: coerceTrimmedStringInput(value.rejectLabel),
    settingsLabel: coerceTrimmedStringInput(value.settingsLabel),
    policyLink: coerceTrimmedStringInput(value.policyLink),
    policyLabel: coerceTrimmedStringInput(value.policyLabel),
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

  readonly config = input<Partial<CookieConsentProps> | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<CookieConsentProps>(sanitizeCookieConsentConfig),
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
    resolveConfigValue(
      this.bannerTextInput(),
      this.config()?.bannerText,
      t('Cookie.BannerMessage', 'Usamos cookies para mejorar tu experiencia.'),
    ),
  );
  readonly title = computed(() => this.titleInput() ?? t('Cookie.Title', 'Tu privacidad'));
  readonly acceptLabel = computed(() =>
    resolveConfigValue(this.acceptLabelInput(), this.config()?.acceptLabel, t('Cookie.AcceptAll', 'Aceptar todo')),
  );
  readonly rejectLabel = computed(() =>
    resolveConfigValue(this.rejectLabelInput(), this.config()?.rejectLabel, t('Cookie.RejectAll', 'Rechazar todo')),
  );
  readonly settingsLabel = computed(() =>
    resolveConfigValue(this.settingsLabelInput(), this.config()?.settingsLabel, t('Cookie.Customize', 'Personalizar')),
  );
  readonly saveLabel = computed(() => this.saveLabelInput() ?? t('Cookie.SavePreferences', 'Guardar preferencias'));
  readonly policyLink = computed(() =>
    resolveConfigValue(this.policyLinkInput(), this.config()?.policyLink, ''),
  );
  readonly policyLabel = computed(() =>
    resolveConfigValue(this.policyLabelInput(), this.config()?.policyLabel, t('Cookie.MoreInfo', 'Más información')),
  );
  /** El distintivo de las categorías que no se pueden apagar. */
  readonly alwaysOnLabel = computed(() => t('Cookie.AlwaysOn', 'Siempre activas'));
  /** El nombre del grupo de botones de decisión. */
  readonly optionsLabel = computed(() => t('Cookie.Options', 'Opciones de consentimiento'));
  readonly hasPolicyLink = computed(() => this.policyLink().trim().length > 0);

  readonly storageKey = computed(() => this.storageKeyInput() ?? DEFAULT_STORAGE_KEY);

  /** Categories from the `categories` attribute, falling back to the canonical defaults. */
  readonly categories = computed<readonly CookieCategory[]>(() => {
    const normalized = normalizeCategories(this.resolveCategoriesSource());
    return normalized.length > 0 ? normalized : defaultCategories();
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
    return undefined;
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
