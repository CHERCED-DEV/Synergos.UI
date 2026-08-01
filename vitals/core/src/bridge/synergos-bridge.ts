// ── Synergos host bridge helpers ────────────────────────────────────────
// Mirror: Synergos.CMS/docs/contracts/host-bridge.md (cap-220, ADR 0083).
//
// Helpers para que los Web Components UI consuman `window.synergos`
// inyectado por el CMS host. Standalone-safe: si el bridge no existe,
// retornan null/fallback values graceful.
//
// Pattern — usage:
//   import { t, getMember, getTheme } from '@synergos/core/bridge/synergos-bridge';
//   const label = t('Form.Submit', 'Submit');
//   const isLoggedIn = getMember() !== null;

import type {
  SynergosWindowBridge,
  SynergosMemberBridge,
  SynergosBrandBridge,
  SynergosPageBridge,
  SynergosThemeVariant,
} from '@synergos/contracts';

/** Resolve the global bridge. Returns null si no está poblado. */
export function getBridge(): SynergosWindowBridge | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bridge = (window as any).synergos as SynergosWindowBridge | undefined;
  return bridge && typeof bridge === 'object' ? bridge : null;
}

/** Lookup i18n key. Standalone fallback graceful — devuelve `fallback`
 *  o `key` literal si no hay bridge. Soporta {0}, {1}, ... placeholders
 *  via args opcional. */
export function t(key: string, fallback: string, ...args: unknown[]): string {
  const bridge = getBridge();
  let str: string;
  if (bridge?.i18n?.t) {
    str = bridge.i18n.t(key, fallback);
  } else if (bridge?.i18n?.keys?.[key] !== undefined) {
    str = bridge.i18n.keys[key];
  } else {
    str = fallback;
  }

  for (let i = 0; i < args.length; i++) {
    str = str.replace(`{${i}}`, String(args[i]));
  }
  return str;
}

/** Member context si autenticado. Null para anónimos o standalone. */
export function getMember(): SynergosMemberBridge | null {
  return getBridge()?.member ?? null;
}

/** Brand info. Default "default" / "Synergos" si no hay host. */
export function getBrand(): SynergosBrandBridge {
  return (
    getBridge()?.brand ?? {
      key: 'default',
      displayName: 'Synergos',
    }
  );
}

/**
 * El `data-theme` activo, verbatim y con su casing literal — hoy uno de
 * light / dark / silverGold / brand / eventsNight / terraLux / scholar /
 * meridian. Default "light" cuando no hay host (standalone, Storybook).
 *
 * Ojo al comparar: es `silverGold` en camelCase, no `silvergold`. Si vas a
 * ramificar, mejor `getTheme() === 'silverGold'` que un `toLowerCase()`, que
 * te dejaría fuera de sync con el `[data-theme]` real del DOM.
 */
export function getTheme(): SynergosThemeVariant {
  return getBridge()?.theme?.variant ?? 'light';
}

/** Page metadata. Empty defaults si no hay host. */
export function getPage(): SynergosPageBridge {
  return (
    getBridge()?.page ?? {
      id: 0,
      docType: '',
      canonicalUrl: '',
      cultures: [],
    }
  );
}

/** True si el Member tiene al menos uno de los roles indicados.
 *  Case-insensitive. False si anónimo. */
export function hasAnyRole(...roles: string[]): boolean {
  const member = getMember();
  if (member === null || roles.length === 0) return false;
  const memberRoles = new Set(member.roles.map(r => r.toLowerCase()));
  return roles.some(r => memberRoles.has(r.toLowerCase()));
}

/** Bridge contract version negociation. Returns major.minor.patch del
 *  bridge actual o null si no hay. UI components pueden warn si major
 *  no matchea su expected. */
export function getBridgeVersion(): string | null {
  return getBridge()?.version ?? null;
}
