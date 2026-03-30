// ── Page API Response ─────────────────────────────────────────────────────────
// Mirror: Synergos.CMS/Application/Output/Config/

export interface PageConfig {
  title: string;
  subtitle?: string;
  seo: SeoConfig;
  dom: PageDomConfig;
  sections: readonly BlockConfig[];
}

export interface SeoConfig {
  title?: string;
  description?: string;
  imageUrl?: string;
  noIndex: boolean;
  canonicalUrl?: string;
}

export interface PageDomConfig {
  cssId?: string;
  cssClass?: string;
}

export interface BlockConfig {
  type: string;
  blockClass: string;
  data: Record<string, unknown>;
}
