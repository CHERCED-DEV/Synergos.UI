export interface CarouselConfig {
  readonly title?: string;
  readonly items?: ReadonlyArray<{
    readonly title?: string;
    readonly body?: string;
    readonly image?: string;
    readonly ctaLabel?: string;
    readonly ctaUrl?: string;
  }>;
  readonly autoplay?: boolean;
  readonly interval?: number;
  readonly theme?: string;
}
