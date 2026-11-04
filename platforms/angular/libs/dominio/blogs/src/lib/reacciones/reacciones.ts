import { Injectable, inject } from '@angular/core';
import { reactionStateFor } from '../comun/blogs.mock';
import type { Post, ReactionState, ReactionType } from '../comun/blogs.model';
import { RedDeBlogs } from '../comun/red-de-blogs';
import { TEXTOS_DE_BLOGS } from '../comun/textos';
import { ReaccionesApi } from './reacciones-api.client';

/** Reaccionar y republicar (012-blogs-social, I2): se pinta en optimista y manda lo que el servidor guardó (UI#92). */
@Injectable()
export class ReaccionesDeBlogs {
  readonly #red = inject(RedDeBlogs);
  readonly #api = inject(ReaccionesApi);
  readonly #textos = inject(TEXTOS_DE_BLOGS);

  react(post: Post, type: ReactionType): void {
    const optimistic = toggleReaction(post.reactions, type);
    this.#red.patchPost(post.id, (current) => ({ ...current, reactions: optimistic }));

    this.#api
      .react(this.#red.apiBase(), post.id, type)
      .then((reactions) => {
        this.#red.patchPost(post.id, (current) => ({ ...current, reactions }));
        // Se anuncia lo que el SERVIDOR guardó, no lo que se pintó (UI#92).
        this.#red.eventos.postreacted({ id: post.id, type, active: reactions.mine === type });
      })
      .catch((error: unknown) => {
        this.#red.patchPost(post.id, (current) => ({ ...current, reactions: post.reactions }));
        this.#red.errorMessage.set(this.#textos.reaccionNoGuardada);
        void error;
      });
  }

  reactionCount(post: Post, type: ReactionType): number {
    return post.reactions.counts.find((entry) => entry.type === type)?.count ?? 0;
  }

  isReacted(post: Post, type: ReactionType): boolean {
    return post.reactions.mine === type;
  }

  toggleRepost(post: Post): void {
    const reposted = !post.reposted;
    this.#red.patchPost(post.id, (current) => ({
      ...current,
      reposted,
      repostCount: Math.max(0, current.repostCount + (reposted ? 1 : -1)),
    }));
  }
}

/**
 * Idempotent reaction toggle: clicking the same type removes it, a different type
 * replaces it. Mirrors the `IReactionService` contract (unique per actor/object/type).
 */
function toggleReaction(state: ReactionState, type: ReactionType): ReactionState {
  const counts = new Map<ReactionType, number>();
  for (const entry of state.counts) {
    counts.set(entry.type, entry.count);
  }
  const previous = state.mine;
  if (previous) {
    counts.set(previous, Math.max(0, (counts.get(previous) ?? 0) - 1));
  }
  let mine: ReactionType | null;
  if (previous === type) {
    mine = null; // toggled off
  } else {
    counts.set(type, (counts.get(type) ?? 0) + 1);
    mine = type;
  }
  const like = counts.get('like') ?? 0;
  const love = counts.get('love') ?? 0;
  const celebrate = counts.get('celebrate') ?? 0;
  const insightful = counts.get('insightful') ?? 0;
  return reactionStateFor(like, love, celebrate, insightful, mine);
}
