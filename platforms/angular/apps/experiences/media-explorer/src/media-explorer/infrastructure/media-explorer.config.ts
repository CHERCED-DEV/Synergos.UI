export interface MediaExplorerConfig {
  readonly title?: string;
  readonly theme?: string;
  readonly variant?: string;
  readonly elementId?: string;
  readonly domClass?: string;
  /** JSON array of MediaItem — required, provided by CMS */
  readonly items?: string;
  /** Default filter/category to apply on init */
  readonly defaultCategory?: string;
}
