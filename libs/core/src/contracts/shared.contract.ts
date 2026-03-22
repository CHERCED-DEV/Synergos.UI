// ── Value Objects ─────────────────────────────────────────────────────────────
// Mirror: Synergos.CMS/Domain/Shared/

export interface Image {
  src: string;
  alt: string;
}

export interface Link {
  url: string;
  target: string;
  label?: string;
}

export interface SeoMetadata {
  title?: string;
  description?: string;
  image?: Image;
  noIndex: boolean;
  canonicalUrl?: string;
}

export interface TrackingData {
  label?: string;
  category?: string;
  action?: string;
}
