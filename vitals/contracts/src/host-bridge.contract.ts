// ── Host bridge contract ────────────────────────────────────────────────
// Mirror: Synergos.CMS/docs/contracts/host-bridge.md (cap-220)
//
// El CMS host inyecta `window.synergos` con i18n + theme + brand + member +
// page metadata. Los Web Components UI consumen este shape via los helpers
// en `@synergos/core/bridge/synergos-bridge`.
//
// NO IMPORTAR código del CMS aquí — solo el shape canónico documentado.

/** Raíz del bridge inyectado por el host. Standalone runs (sin host) la
 *  variable global puede ser undefined — los helpers manejan eso safe. */
export interface SynergosWindowBridge {
  /** Bridge contract version (semver). UI verifica compat antes de
   *  consumir features avanzadas. */
  readonly version: string;
  readonly i18n: SynergosI18nBridge;
  readonly theme: SynergosThemeBridge;
  readonly brand: SynergosBrandBridge;
  readonly member: SynergosMemberBridge | null;
  readonly page: SynergosPageBridge;
}

export interface SynergosI18nBridge {
  /** Active culture (e.g. "es-CO"). */
  readonly culture: string;
  /** Default culture for fallback when current key missing. */
  readonly defaultCulture: string;
  /** Map of resolved keys → strings (server-side resolved). */
  readonly keys: Record<string, string>;
  /** Lookup helper. Returns key itself if missing AND no fallback.
   *  Inyectado por el partial _SynergosBridge.cshtml — no tipar como
   *  método arrow ya que el this es la propia bridge.i18n. */
  t(key: string, fallback?: string): string;
}

/**
 * Las variantes que el CMS publica hoy, en su casing LITERAL.
 *
 * El value que elige el editor es el `data-theme` del `<html>` es el nombre
 * del bloque en `syn-tokens.css` — el mismo string, sin transformación
 * (ADR 0101 del CMS). Por eso `silverGold` va en camelCase.
 *
 * Este contrato decía `"light" | "dark" | "silvergold"`: tres de las ocho, y
 * la tercera todo-minúscula, una ortografía que no emite nadie. Un componente
 * que ramificara por ese string no entraba nunca en la rama. El SCSS del
 * repo (`_brand.scss`, `_tokens-bridge.scss`) siempre estuvo bien; el que
 * mentía era este tipo.
 *
 * Unión abierta a propósito (`| (string & {})`): el CMS es el dueño de la
 * lista, así que un tema nuevo allá no debe romper la compilación acá — pero
 * el autocompletado sigue sugiriendo los ocho conocidos.
 */
export type SynergosThemeVariant =
  | 'light'
  | 'dark'
  | 'silverGold'
  | 'brand'
  | 'eventsNight'
  | 'terraLux'
  | 'scholar'
  | 'meridian'
  | (string & {});

export interface SynergosThemeBridge {
  /** El `data-theme` activo, verbatim. Ver SynergosThemeVariant. */
  readonly variant: SynergosThemeVariant;
  /** Todas las variantes publicadas. `variant` SIEMPRE está dentro. */
  readonly available: readonly SynergosThemeVariant[];
}

export interface SynergosBrandBridge {
  /** Brand key del siteRoot activo (e.g. "acme", "default"). */
  readonly key: string;
  /** Display name. */
  readonly displayName: string;
}

export interface SynergosMemberBridge {
  /** Member key (Guid string format "N"). */
  readonly key: string;
  /** Display name. */
  readonly displayName: string;
  /** Email (lowercase). */
  readonly email: string;
  /** Roles — case-sensitive. */
  readonly roles: readonly string[];
}

export interface SynergosPageBridge {
  /** Page Id Umbraco (numeric). */
  readonly id: number;
  /** Page DocType alias. */
  readonly docType: string;
  /** Canonical URL absoluta. */
  readonly canonicalUrl: string;
  /** Published cultures (e.g. ["es-CO", "en-US"]). */
  readonly cultures: readonly string[];
}

/** Outcome enum tri-state — alineado con
 *  Synergos.CMS.Interfaces/IAuditTrailWriter.AuditEvent.Outcome.
 *  Use para form submissions, bulk operations, async ops. */
export type SynergosOutcome = 'success' | 'failure' | 'partial';
