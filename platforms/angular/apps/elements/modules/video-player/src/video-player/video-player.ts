import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynVideoPlayer</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-video-player',
  standalone: true,
  templateUrl: './video-player.html',
  styleUrl: './video-player.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-video-player' },
})
export class VideoPlayerElementComponent {
  readonly videoFile = input<string | undefined>(undefined);
  readonly posterImage = input<string | undefined>(undefined);
  readonly chaptersJson = input<string | undefined>(undefined);
  readonly enableAnalytics = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
