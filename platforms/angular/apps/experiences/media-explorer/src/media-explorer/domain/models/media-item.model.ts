export interface MediaItem {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** YouTube/Vimeo embed URL or direct video URL */
  readonly videoUrl: string;
  readonly thumbnailSrc: string;
  readonly thumbnailAlt: string;
  readonly tags: readonly string[];
  readonly duration?: string;
  readonly category?: string;
}
