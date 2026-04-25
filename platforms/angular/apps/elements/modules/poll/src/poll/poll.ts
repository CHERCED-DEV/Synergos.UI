import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Web Component scaffold for the CMS element <c>elementSynPoll</c>.
 * Bridge contract: each CMS property becomes a TypeScript input with
 * the same alias. Visual implementation is intentionally minimal —
 * design system replaces the placeholder template later.
 */
@Component({
  selector: 'sg-poll',
  standalone: true,
  templateUrl: './poll.html',
  styleUrl: './poll.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-poll' },
})
export class PollElementComponent {
  readonly question = input<string | undefined>(undefined);
  readonly optionsJson = input<string | undefined>(undefined);
  readonly voteEndpoint = input<string | undefined>(undefined);
  readonly resultsEndpoint = input<string | undefined>(undefined);
  readonly integration = input<string | undefined>(undefined);
}
