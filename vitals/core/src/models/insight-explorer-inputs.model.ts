export interface InsightExplorerInputs {
  config?: string;
  title: string;
  theme: string;
  variant: string;
  elementId: string;
  domClass: string;
  /** Serialized JSON array of InsightItem */
  items: string;
}
