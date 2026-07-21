export interface ElementEmbedConfig {
  readonly component?: string;
  readonly tagName?: string;
  readonly scriptSrc?: string;
  readonly endpoint?: string;
  readonly params?: Record<string, string>;
  readonly props?: Record<string, unknown>;
  readonly textContent?: string;
}

export interface RemoteElementEmbedConfig extends ElementEmbedConfig {
  readonly remoteEntry?: string;
  readonly exposedModule?: string;
}
