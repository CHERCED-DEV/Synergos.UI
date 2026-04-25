import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynAudioPlayer</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-audio-player',
  standalone: true,
  templateUrl: './audio-player.html',
  styleUrl: './audio-player.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-audio-player' },
})
export class AudioPlayerElementComponent {
  readonly audioFile = input<string | undefined>(undefined);
  readonly trackTitle = input<string | undefined>(undefined);
  readonly artistName = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
