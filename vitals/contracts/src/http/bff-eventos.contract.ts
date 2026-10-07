// ─── El contrato HTTP de Synergos.Bff.Eventos (ADR 0140, F2) ───
// GENERADO por tools/contrato-http.mjs desde el repo del CMS:
//   Synergos.CMS.Web/docs/contracts/openapi/Synergos.Bff.Eventos.json
// que a su vez GENERA `ContratoOpenApiTests` desde el host real del orquestador.
// NO se edita a mano. Regenerar: `node tools/contrato-http.mjs` · comprobar: `--check`.
//
// Son los TIPOS del flujo y no sus rutas: el navegador llama a la puerta por operación
// (ADR 0140 §6), y cómo se nombra ahí cada una lo decide la F3. Hasta la F4 no lo
// importa nadie: la regla 24 de CLAUDE.md queda abierta con fecha.

export interface BuyTicketsRequest {
  readonly eventId?: string | null;
  readonly buyerKind?: string | null;
  readonly buyerId?: string | null;
  readonly lines?: readonly TicketLineRequest[] | null;
  readonly serviceFeePercent?: number | null;
}

export interface HeldSeatResponse {
  readonly tier: string;
  readonly seat: string | null;
  readonly quantity: number;
}

export interface MoneyDto {
  readonly amount: number;
  readonly currency: string;
}

export interface PageResponseOfPendingCompensationResponse {
  readonly items: readonly PendingCompensationResponse[];
  readonly total: number;
  readonly offset: number;
  readonly hasMore: boolean;
}

export interface PendingCompensationResponse {
  readonly purchaseId: string;
  readonly kind: string;
  readonly reason: string;
  readonly attempts: number;
  readonly nextAttemptUtc: string | null;
  readonly lastError: string | null;
  readonly stuck: boolean;
  readonly alertedAtUtc: string | null;
}

export interface Rechazo {
  readonly type: string;
  readonly title: "Invalid" | "NotFound" | "Conflict" | "Forbidden" | "Expired" | "Unavailable";
  readonly status: number;
  readonly detail: string;
  readonly code: string;
  readonly transient: boolean;
}

export interface TicketLineRequest {
  readonly quantity: number;
  readonly tier?: string | null;
  readonly seat?: string | null;
}

export interface TicketPurchaseResponse {
  readonly id: string;
  readonly buyerKind: string;
  readonly buyerId: string;
  readonly eventId: string;
  readonly status: string;
  readonly total: MoneyDto;
  readonly held: readonly HeldSeatResponse[];
  readonly pendingCompensations: number;
  readonly lastError: string | null;
}

/**
 * Una operación del flujo: el cuerpo que se manda (`undefined` si no lleva), lo que vuelve
 * con éxito y si pide la cabecera Idempotency-Key. Los rechazos vuelven como `Rechazo`.
 */
export interface OperacionHttp<TCuerpo, TRespuesta, TLlave extends "requerida" | "opcional" | "ninguna"> {
  readonly cuerpo: TCuerpo;
  readonly respuesta: TRespuesta;
  readonly llave: TLlave;
}

/** Las operaciones del orquestador, por su operationId. */
export interface Operaciones {
  readonly BuyTickets: OperacionHttp<BuyTicketsRequest, TicketPurchaseResponse, "requerida">;
  readonly CancelTicketPurchase: OperacionHttp<undefined, TicketPurchaseResponse, "ninguna">;
  readonly ConfirmTicketPurchase: OperacionHttp<undefined, TicketPurchaseResponse, "ninguna">;
  readonly GetTicketPurchase: OperacionHttp<undefined, TicketPurchaseResponse, "ninguna">;
  readonly ListCompensations: OperacionHttp<undefined, PageResponseOfPendingCompensationResponse, "ninguna">;
  readonly RetryTicketPurchase: OperacionHttp<undefined, TicketPurchaseResponse, "ninguna">;
}
