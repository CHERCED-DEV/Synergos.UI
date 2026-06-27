import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
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
 * Runtime config for the CMS element <c>elementSynCommentsWidget</c>.
 *
 * A threaded comments widget: renders a nested list of comments (replies
 * indented under their parent) plus a form to post a new comment or reply.
 * Comments can be supplied inline via `comments` or fetched lazily from a
 * provider endpoint (`commentsEndpoint`). Submitting the form emits a
 * `commentsubmit` CustomEvent carrying the draft (body + optional parent),
 * and optimistically appends the comment to the local thread.
 *
 * Bridge contract: every CMS property is a TypeScript input with the same
 * alias. A `config` object (JSON) is also accepted; explicit attributes win
 * over `config`, which wins over defaults (see `resolveConfigValue`).
 */
export interface CommentsWidgetRuntimeConfig {
  readonly provider?: string;
  readonly threadId?: string;
  readonly title?: string;
  readonly emptyLabel?: string;
  readonly submitLabel?: string;
  readonly replyLabel?: string;
  readonly placeholder?: string;
  readonly locale?: string;
  readonly comments?: readonly CommentConfig[];
  readonly commentsEndpoint?: string;
}

export interface CommentConfig {
  readonly id?: string;
  readonly parentId?: string;
  readonly author?: string;
  readonly body?: string;
  readonly createdAt?: string;
}

export interface Comment {
  readonly id: string;
  readonly parentId: string;
  readonly author: string;
  readonly body: string;
  readonly createdAt: string;
}

/** A comment plus its (recursively nested) replies. */
export interface CommentNode {
  readonly comment: Comment;
  readonly depth: number;
  readonly replies: readonly CommentNode[];
}

/** Emitted on the `commentsubmit` CustomEvent and the typed Angular output. */
export interface CommentSubmitDetail {
  readonly threadId: string;
  readonly parentId: string;
  readonly author: string;
  readonly body: string;
}

const MAX_DEPTH = 4;

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

export function normalizeComments(value: unknown): readonly Comment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index): Comment | null => {
      if (!isRecord(entry)) {
        return null;
      }

      const body = readString(entry['body']).trim() || readString(entry['text']).trim();
      if (!body) {
        return null;
      }

      const id = readString(entry['id']).trim() || `c-${index}`;

      return {
        id,
        parentId: readString(entry['parentId']).trim() || readString(entry['parent']).trim(),
        author: readString(entry['author']).trim() || readString(entry['name']).trim() || 'Anónimo',
        body,
        createdAt: readString(entry['createdAt']).trim() || readString(entry['date']).trim(),
      };
    })
    .filter((comment): comment is Comment => comment !== null);
}

/** Build a nested tree from a flat list, honoring `parentId` links. */
export function buildCommentTree(comments: readonly Comment[]): readonly CommentNode[] {
  const byId = new Map<string, Comment>();
  for (const comment of comments) {
    byId.set(comment.id, comment);
  }

  const childrenOf = new Map<string, Comment[]>();
  const roots: Comment[] = [];
  for (const comment of comments) {
    const hasParent = comment.parentId && byId.has(comment.parentId) && comment.parentId !== comment.id;
    if (hasParent) {
      const bucket = childrenOf.get(comment.parentId);
      if (bucket) {
        bucket.push(comment);
      } else {
        childrenOf.set(comment.parentId, [comment]);
      }
    } else {
      roots.push(comment);
    }
  }

  const visited = new Set<string>();
  const toNode = (comment: Comment, depth: number): CommentNode => {
    visited.add(comment.id);
    const children = depth >= MAX_DEPTH ? [] : childrenOf.get(comment.id) ?? [];
    const replies = children
      .filter((child) => !visited.has(child.id))
      .map((child) => toNode(child, depth + 1));
    return { comment, depth, replies };
  };

  return roots.map((root) => toNode(root, 0));
}

function sanitizeConfig(value: Partial<CommentsWidgetRuntimeConfig>): CommentsWidgetRuntimeConfig {
  return omitUndefinedProperties<CommentsWidgetRuntimeConfig>({
    provider: coerceTrimmedStringInput(value.provider),
    threadId: coerceTrimmedStringInput(value.threadId),
    title: coerceTrimmedStringInput(value.title),
    emptyLabel: coerceTrimmedStringInput(value.emptyLabel),
    submitLabel: coerceTrimmedStringInput(value.submitLabel),
    replyLabel: coerceTrimmedStringInput(value.replyLabel),
    placeholder: coerceTrimmedStringInput(value.placeholder),
    locale: coerceTrimmedStringInput(value.locale),
    comments: value.comments,
    commentsEndpoint: coerceTrimmedStringInput(value.commentsEndpoint),
  });
}

const DEFAULT_LOCALE = 'es-CO';
const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
};

@Component({
  selector: 'sg-comments-widget',
  standalone: true,
  templateUrl: './comments-widget.html',
  styleUrl: './comments-widget.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sg-comments-widget' },
})
export class CommentsWidgetElementComponent {
  readonly #initialData = inject(InitialDataService);
  readonly #destroyRef = inject(DestroyRef);

  readonly config = input<CommentsWidgetRuntimeConfig | undefined, unknown>(undefined, {
    transform: createConfigInputTransform<CommentsWidgetRuntimeConfig>(sanitizeConfig),
  });
  readonly providerInput = input<string | undefined>(undefined, { alias: 'provider' });
  readonly threadIdInput = input<string | undefined>(undefined, { alias: 'threadId' });
  readonly titleInput = input<string | undefined>(undefined, { alias: 'title' });
  readonly emptyLabelInput = input<string | undefined>(undefined, { alias: 'emptyLabel' });
  readonly submitLabelInput = input<string | undefined>(undefined, { alias: 'submitLabel' });
  readonly replyLabelInput = input<string | undefined>(undefined, { alias: 'replyLabel' });
  readonly placeholderInput = input<string | undefined>(undefined, { alias: 'placeholder' });
  readonly localeInput = input<string | undefined>(undefined, { alias: 'locale' });
  readonly commentsInput = input<string | undefined>(undefined, { alias: 'comments' });
  readonly commentsEndpointInput = input<string | undefined>(undefined, {
    alias: 'commentsEndpoint',
  });
  readonly integration = input<string | undefined>(undefined);

  /** Typed Angular output mirroring the native `commentsubmit` CustomEvent. */
  readonly commentsubmit = output<CommentSubmitDetail>();

  readonly provider = computed(() =>
    resolveConfigValue(this.providerInput(), this.config()?.provider, ''),
  );
  readonly threadId = computed(() =>
    resolveConfigValue(this.threadIdInput(), this.config()?.threadId, 'default'),
  );
  readonly title = computed(() =>
    resolveConfigValue(this.titleInput(), this.config()?.title, 'Comentarios'),
  );
  readonly emptyLabel = computed(() =>
    resolveConfigValue(
      this.emptyLabelInput(),
      this.config()?.emptyLabel,
      'Aún no hay comentarios. Sé el primero en escribir.',
    ),
  );
  readonly submitLabel = computed(() =>
    resolveConfigValue(this.submitLabelInput(), this.config()?.submitLabel, 'Publicar'),
  );
  readonly replyLabel = computed(() =>
    resolveConfigValue(this.replyLabelInput(), this.config()?.replyLabel, 'Responder'),
  );
  readonly placeholder = computed(() =>
    resolveConfigValue(
      this.placeholderInput(),
      this.config()?.placeholder,
      'Escribe un comentario…',
    ),
  );
  readonly locale = computed(() =>
    resolveConfigValue(this.localeInput(), this.config()?.locale, DEFAULT_LOCALE),
  );
  readonly commentsEndpoint = computed(() =>
    resolveConfigValue(this.commentsEndpointInput(), this.config()?.commentsEndpoint, ''),
  );

  /** Inline / config comments. */
  readonly #inlineComments = computed<readonly Comment[]>(() =>
    normalizeComments(this.resolveSource(this.commentsInput(), this.config()?.comments)),
  );

  /** Comments fetched from the provider endpoint. */
  readonly #fetchedComments = signal<readonly Comment[]>([]);
  /** Comments added optimistically via the form. */
  readonly #localComments = signal<readonly Comment[]>([]);

  readonly #loading = signal(false);
  readonly #fetchFailed = signal(false);
  readonly loading = this.#loading.asReadonly();
  readonly fetchFailed = this.#fetchFailed.asReadonly();

  /** Union of inline + fetched + locally-posted comments, deduped by id. */
  readonly allComments = computed<readonly Comment[]>(() => {
    const merged = [...this.#inlineComments(), ...this.#fetchedComments(), ...this.#localComments()];
    const byId = new Map<string, Comment>();
    for (const comment of merged) {
      byId.set(comment.id, comment);
    }
    return [...byId.values()];
  });

  readonly tree = computed<readonly CommentNode[]>(() => buildCommentTree(this.allComments()));

  /** Depth-first flattening of the tree for a single flat @for in the template. */
  readonly flatNodes = computed<readonly { comment: Comment; depth: number }[]>(() => {
    const out: { comment: Comment; depth: number }[] = [];
    const walk = (nodes: readonly CommentNode[]): void => {
      for (const node of nodes) {
        out.push({ comment: node.comment, depth: node.depth });
        walk(node.replies);
      }
    };
    walk(this.tree());
    return out;
  });

  readonly count = computed(() => this.allComments().length);
  readonly hasComments = computed(() => this.count() > 0);
  readonly countLabel = computed(() => {
    const count = this.count();
    return count === 1 ? '1 comentario' : `${count} comentarios`;
  });

  /** Id of the comment currently being replied to (null = top-level form). */
  readonly replyingTo = signal<string | null>(null);
  /** Draft body for the top-level / reply form. */
  readonly draftBody = signal('');
  /** Draft author name. */
  readonly draftAuthor = signal('');

  readonly canSubmit = computed(() => this.draftBody().trim().length > 0);

  constructor() {
    // Lazy-fetch comments from the endpoint when one is configured.
    effect((onCleanup) => {
      const endpoint = this.commentsEndpoint().trim();
      this.#fetchedComments.set([]);
      this.#fetchFailed.set(false);

      if (!endpoint || typeof fetch !== 'function') {
        this.#loading.set(false);
        return;
      }

      const controller = new AbortController();
      onCleanup(() => controller.abort());

      this.#loading.set(true);
      fetch(endpoint, { signal: controller.signal, headers: { Accept: 'application/json' } })
        .then((response) =>
          response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)),
        )
        .then((data: unknown) => {
          const list = Array.isArray(data) ? data : isRecord(data) ? data['comments'] : null;
          this.#fetchedComments.set(normalizeComments(list));
          this.#loading.set(false);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return;
          }
          this.#fetchFailed.set(true);
          this.#loading.set(false);
        });
    });

    this.#destroyRef.onDestroy(() => {
      // AbortController cleanup handled by effect onCleanup.
    });
  }

  formattedDate(comment: Comment): string {
    const raw = comment.createdAt;
    if (!raw) {
      return '';
    }
    const parsed = Date.parse(raw);
    if (!Number.isFinite(parsed)) {
      return raw;
    }
    return new Intl.DateTimeFormat(this.locale(), DATE_FORMAT).format(new Date(parsed));
  }

  startReply(comment: Comment): void {
    this.replyingTo.set(comment.id);
    this.draftBody.set('');
  }

  cancelReply(): void {
    this.replyingTo.set(null);
    this.draftBody.set('');
  }

  isReplyingTo(comment: Comment): boolean {
    return this.replyingTo() === comment.id;
  }

  onBodyInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement | null;
    this.draftBody.set(target?.value ?? '');
  }

  onAuthorInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.draftAuthor.set(target?.value ?? '');
  }

  submit(): void {
    const body = this.draftBody().trim();
    if (!body) {
      return;
    }

    const parentId = this.replyingTo() ?? '';
    const author = this.draftAuthor().trim() || 'Tú';
    const detail: CommentSubmitDetail = {
      threadId: this.threadId(),
      parentId,
      author,
      body,
    };

    // Optimistically append the new comment to the local thread.
    const optimistic: Comment = {
      id: `local-${Date.now()}-${this.#localComments().length}`,
      parentId,
      author,
      body,
      createdAt: new Date().toISOString(),
    };
    this.#localComments.set([...this.#localComments(), optimistic]);

    this.commentsubmit.emit(detail);

    this.draftBody.set('');
    this.replyingTo.set(null);
  }

  private resolveSource(rawInput: string | undefined, configValue: unknown): unknown {
    if (rawInput !== undefined) {
      return this.#initialData.parseValue<unknown>(rawInput);
    }
    return configValue;
  }
}
