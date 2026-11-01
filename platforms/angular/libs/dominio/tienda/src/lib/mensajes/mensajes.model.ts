/** Los hilos entre quien compra y quien vende (014-despiece-tienda, T008). */

/** One buyer↔seller thread from `GET /api/shop/messages` (mensajería v1). */
export interface MessageThread {
  readonly id: string;
  readonly subject: string;
  readonly counterpart: string;
  readonly lastMessage: string;
  readonly date: string;
  readonly unread: boolean;
}
