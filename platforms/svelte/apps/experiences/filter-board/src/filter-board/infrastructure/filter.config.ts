export interface FilterConfig {
  readonly title?: string;
  readonly items?: ReadonlyArray<{
    readonly title?: string;
    readonly body?: string;
    readonly tags?: readonly string[];
  }>;
  readonly theme?: string;
}
