// ── Page API Response ─────────────────────────────────────────────────────────
// Mirror: Synergos.CMS/Application/Output/Config/
//
// STABILITY: These interfaces are hand-written and version-stable.
// The CMS serializes exactly this shape. Do NOT auto-generate this file.

export interface PageConfig {
  readonly title: string;
  readonly subtitle?: string;
  readonly seo: SeoConfig;
  readonly dom: PageDomConfig;
  readonly sections: readonly BlockConfig[];
}

export interface SeoConfig {
  readonly title?: string;
  readonly description?: string;
  readonly imageUrl?: string;
  readonly noIndex: boolean;
  readonly canonicalUrl?: string;
}

export interface PageDomConfig {
  readonly cssId?: string;
  readonly cssClass?: string;
}

export interface BlockConfig {
  readonly type: string;
  readonly blockClass: string;
  readonly data: Record<string, unknown>;
}

/** SEO output shape as returned by the CMS delivery endpoint. Mirrors SeoOutputConfig.cs. */
export interface SeoOutputConfig {
  readonly title?: string;
  readonly description?: string;
  readonly imageUrl?: string;
  readonly noIndex: boolean;
  readonly canonicalUrl?: string;
}
