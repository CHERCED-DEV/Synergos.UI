import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { InitialDataService } from '@synergos/core';
import {
  coerceTrimmedStringInput,
  createConfigInputTransform,
  omitUndefinedProperties,
  resolveConfigValue,
} from '@synergos/shared';

/**
 * Runtime config for the CMS element <c>elementSynPoll</c>.
 *
 * A single-question poll: the visitor picks one option and votes. Votes are
 * POSTed to `voteEndpoint` when configured; otherwise the tally is kept
 * locally so the component is fully functional offline (demos, previews).
 * Once a vote is cast the options turn into horizontal result bars showing
 * each option's share as a percentage. Casting a vote emits a `pollvote`
 * CustomEvent carrying the chosen option and the updated tallies.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface PollRuntimeConfig {
  readonly question?: string;
  readonly options?: readonly PollOptionConfig[];
  readonly voteEndpoint?: string;
  readonly resultsEndpoint?: string;
}

export interface PollOptionConfig {
  readonly id?: string;
  readonly label?: string;
  readonly votes?: number;
}

export interface PollOption {
  readonly id: string;
  readonly label: string;
  readonly votes: number;
}

/** A result row: an option plus its computed share of the total. */
export interface PollResult extends PollOption {
  readonly percent: number;
}

/** Emitted on the `pollvote` CustomEvent and the typed Angular output. */
export interface PollVoteDetail {
  readonly optionId: string;
  readonly results: readonly PollResult[];
  readonly totalVotes: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

function readVotes(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed);
    }
  }
  return 0;
}

/** Coerce arbitrary input into a clean, deduped list of poll options. */
export function normalizeOptions(value: unknown): readonly PollOption[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const result: PollOption[] = [];

  value.forEach((entry, index) => {
    let id = '';
    let label = '';
    let votes = 0;

    if (typeof entry === 'string') {
      label = entry.trim();
      id = label;
    } else if (isRecord(entry)) {
      label = readString(entry['label']).trim() || readString(entry['text']).trim();
      id = readString(entry['id']).trim() || readString(entry['value']).trim() || label;
      votes = readVotes(entry['votes']);
    }

    if (!label) {
      return;
    }

    const finalId = id || `option-${index}`;
    if (seen.has(finalId)) {
      return;
    }
    seen.add(finalId);
    result.push({ id: finalId, label, votes });
  });

  return result;
}

/** Compute each option's percentage share, rounding to whole numbers. */
export function computeResults(options: readonly PollOption[]): readonly PollResult[] {
  const total = options.reduce((sum, option) => sum + option.votes, 0);
  return options.map((option) => ({
    ...option,
    percent: total > 0 ? Math.round((option.votes / total) * 100) : 0,
  }));
}

function sanitizePollConfig(value: Partial<PollRuntimeConfig>): PollRuntimeConfig {
  return omitUndefinedProperties<PollRuntimeConfig>({
    question: coerceTrimmedStringInput(value.question),
    options: value.options,
    voteEndpoint: coerceTrimmedStringInput(value.voteEndpoint),
    resultsEndpoint: coerceTrimmedStringInput(value.resultsEndpoint),
  });
}

@Component({
  selector: 'sg-poll',
  standalone: true,
  templateUrl: './poll.html',
  styleUrl: './poll.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-poll' },
})
export class PollElementComponent {
  readonly #initialData = inject(InitialDataService);

  readonly config = input<PollRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<PollRuntimeConfig>(sanitizePollConfig),
  });
  readonly questionInput = input<string | undefined>(undefined, { alias: 'question' });
  readonly optionsInput = input<string | undefined>(undefined, { alias: 'optionsJson' });
  readonly voteEndpointInput = input<string | undefined>(undefined, { alias: 'voteEndpoint' });
  readonly resultsEndpointInput = input<string | undefined>(undefined, { alias: 'resultsEndpoint' });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `pollvote` CustomEvent. */
  readonly pollvote = output<PollVoteDetail>();

  readonly question = computed(() =>
    resolveConfigValue(this.questionInput(), this.config()?.question, ''),
  );

  readonly voteEndpoint = computed(() =>
    resolveConfigValue(this.voteEndpointInput(), this.config()?.voteEndpoint, ''),
  );

  /** Options as authored, before any local vote is layered on top. */
  readonly baseOptions = computed<readonly PollOption[]>(() =>
    normalizeOptions(this.resolveSource(this.optionsInput(), this.config()?.options)),
  );

  /** Local vote deltas keyed by option id (demo / offline tally). */
  readonly #localVotes = signal<Record<string, number>>({});

  /** The option the visitor voted for, or null before voting. */
  readonly votedOptionId = signal<string | null>(null);

  /** The option highlighted before committing (keyboard / hover focus). */
  readonly selectedOptionId = signal<string | null>(null);

  readonly #submitting = signal(false);
  readonly #submitFailed = signal(false);
  readonly submitting = this.#submitting.asReadonly();
  readonly submitFailed = this.#submitFailed.asReadonly();

  readonly hasVoted = computed(() => this.votedOptionId() !== null);
  readonly hasOptions = computed(() => this.baseOptions().length > 0);

  /** Effective options = authored votes + local deltas. */
  readonly options = computed<readonly PollOption[]>(() => {
    const deltas = this.#localVotes();
    return this.baseOptions().map((option) => ({
      ...option,
      votes: option.votes + (deltas[option.id] ?? 0),
    }));
  });

  readonly results = computed<readonly PollResult[]>(() => computeResults(this.options()));

  readonly totalVotes = computed(() =>
    this.options().reduce((sum, option) => sum + option.votes, 0),
  );

  readonly totalVotesLabel = computed(() => {
    const total = this.totalVotes();
    return total === 1 ? '1 voto' : `${total} votos`;
  });

  /** Whether a given option can receive keyboard focus (roving tabindex). */
  focusIndex(option: PollOption): number {
    if (this.hasVoted()) {
      return -1;
    }
    const selected = this.selectedOptionId();
    if (selected) {
      return option.id === selected ? 0 : -1;
    }
    return option.id === this.baseOptions()[0]?.id ? 0 : -1;
  }

  isSelected(option: PollOption): boolean {
    return this.selectedOptionId() === option.id;
  }

  isVoted(option: PollOption): boolean {
    return this.votedOptionId() === option.id;
  }

  select(option: PollOption): void {
    if (this.hasVoted()) {
      return;
    }
    this.selectedOptionId.set(option.id);
  }

  vote(option: PollOption): void {
    if (this.hasVoted() || this.#submitting()) {
      return;
    }

    this.selectedOptionId.set(option.id);
    this.votedOptionId.set(option.id);
    this.#localVotes.update((current) => ({
      ...current,
      [option.id]: (current[option.id] ?? 0) + 1,
    }));

    this.#submitFailed.set(false);
    this.submitVote(option.id);

    const detail: PollVoteDetail = {
      optionId: option.id,
      results: this.results(),
      totalVotes: this.totalVotes(),
    };
    this.pollvote.emit(detail);
  }

  /** Roving keyboard navigation across the options list. */
  onOptionKeydown(event: KeyboardEvent, option: PollOption, index: number): void {
    if (this.hasVoted()) {
      return;
    }

    const options = this.baseOptions();
    const last = options.length - 1;

    const handlers: Record<string, () => void> = {
      ArrowDown: () => this.moveFocus(index === last ? 0 : index + 1),
      ArrowRight: () => this.moveFocus(index === last ? 0 : index + 1),
      ArrowUp: () => this.moveFocus(index === 0 ? last : index - 1),
      ArrowLeft: () => this.moveFocus(index === 0 ? last : index - 1),
      Home: () => this.moveFocus(0),
      End: () => this.moveFocus(last),
      Enter: () => this.vote(option),
      ' ': () => this.vote(option),
    };

    const handler = handlers[event.key];
    if (handler) {
      event.preventDefault();
      handler();
    }
  }

  private moveFocus(index: number): void {
    const option = this.baseOptions()[index];
    if (!option) {
      return;
    }
    this.selectedOptionId.set(option.id);
    this.focusOption(option.id);
  }

  private focusOption(id: string): void {
    if (typeof requestAnimationFrame !== 'function') {
      return;
    }
    requestAnimationFrame(() => {
      const host = document.querySelector('sg-poll, synergos-poll');
      const root = host?.shadowRoot ?? document;
      const node = (root as ParentNode).querySelector<HTMLElement>(`[data-option-id="${id}"]`);
      node?.focus();
    });
  }

  private submitVote(optionId: string): void {
    const endpoint = this.voteEndpoint().trim();
    if (!endpoint || typeof fetch !== 'function') {
      return;
    }

    this.#submitting.set(true);
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ optionId }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        this.#submitting.set(false);
      })
      .catch(() => {
        this.#submitFailed.set(true);
        this.#submitting.set(false);
      });
  }

  private resolveSource(rawInput: string | undefined, configValue: unknown): unknown {
    if (rawInput !== undefined) {
      return this.#initialData.parseValue<unknown>(rawInput);
    }
    return configValue;
  }
}
