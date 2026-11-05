import { Injectable, InjectionToken, inject } from '@angular/core';
import type {
  Author,
  Comment,
  CreatorTier,
  DirectMessage,
  Notification,
  Post,
  ReactionType,
  TrendingTag,
} from '@synergos/dominio/blogs';
import { desdeMenores, formatearImporte } from '@synergos/vitals-core';

/** El número de ESTA red en la página: de él salen el ámbito de su sesión, el de su bus y los id de sus campos. */
export const INSTANCIA_DE_BLOGS = new InjectionToken<number>('INSTANCIA_DE_BLOGS');

// Icons render as inline Lucide-style SVG in the template (@switch on `type`),
// so no per-OS emoji glyph is baked here — only the semantic type + a11y label.
export const REACTION_META: readonly { readonly type: ReactionType; readonly label: string }[] = [
  { type: 'like', label: 'Me gusta' },
  { type: 'love', label: 'Me encanta' },
  { type: 'celebrate', label: 'Celebrar' },
  { type: 'insightful', label: 'Interesante' },
];

/**
 * Cómo se dice y cómo se pinta lo que comparten las vistas de la red (012-blogs-social, I2, T015): las horas relativas,
 * las cifras, los importes, las iniciales, los id de los campos y las claves de las listas. Era la mitad de abajo del
 * componente único; ahora la piden las vistas y las piezas, como la presentación de la tienda.
 */
@Injectable()
export class PresentacionDeBlogs {
  /** El número de esta red en la página. */
  readonly instancia = inject(INSTANCIA_DE_BLOGS);

  readonly fieldId = `syn-blogs-${this.instancia}`;

  readonly reactionMeta = REACTION_META;

  /**
   * Repeat counts for the loading skeletons. They mirror the typical first page of
   * each list so the mould reserves the real footprint and the swap to data does not
   * shift the layout (doc 24, patrón de `data-grid`). The bones themselves are
   * `aria-hidden`; the announcement travels in a sibling `role="status"`.
   */
  readonly commentSkeletons = [0, 1, 2];

  readonly notificationSkeletons = [0, 1, 2, 3, 4];

  // ─── Relative-time / formatting ─────────────────────────────────────────────────────
  relativeTime(iso: string): string {
    const then = Date.parse(iso);
    if (!Number.isFinite(then)) {
      return '';
    }
    const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
    if (seconds < 60) {
      return 'ahora';
    }
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) {
      return `hace ${minutes} min`;
    }
    const hours = Math.round(minutes / 60);
    if (hours < 24) {
      return `hace ${hours} h`;
    }
    const days = Math.round(hours / 24);
    if (days < 7) {
      return `hace ${days} d`;
    }
    try {
      return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' }).format(then);
    } catch {
      return `hace ${days} d`;
    }
  }

  formatCount(value: number): string {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')} M`;
    }
    if (abs >= 1_000) {
      return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')} k`;
    }
    return String(value);
  }

  formatMinor(minorUnits: number, currency: string): string {
    return formatearImporte(desdeMenores(minorUnits, currency), currency);
  }

  initials(author: Author): string {
    const name = author.displayName || author.handle;
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  readonly trackPost = (_: number, post: Post): string => post.id;

  readonly trackComment = (_: number, comment: Comment): string => comment.id;

  readonly trackAuthor = (_: number, author: Author): string => author.actorKey;

  readonly trackTag = (_: number, tag: TrendingTag): string => tag.tag;

  readonly trackNotification = (_: number, notification: Notification): string => notification.id;

  readonly trackMessage = (_: number, message: DirectMessage): string => message.id;

  readonly trackTier = (_: number, tier: CreatorTier): string => tier.id;
}
