export interface MediaExplorerInputs {
  config?: string;
  title: string;
  theme: string;
  variant: string;
  elementId: string;
  domClass: string;
  defaultCategory: string;
  /** Serialized JSON array of MediaItem */
  items: string;
}
