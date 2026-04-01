export interface InsightExplorerConfig {
  readonly title?: string;
  readonly theme?: string;
  readonly variant?: string;
  readonly elementId?: string;
  readonly domClass?: string;
  /** JSON array of InsightItem — CMS provides content, overrides static defaults */
  readonly items?: string;
}
