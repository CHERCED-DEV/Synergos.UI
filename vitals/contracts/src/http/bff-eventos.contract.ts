// ─── El contrato HTTP de Synergos.Bff.Eventos por la puerta (ADR 0140, F3) ───
// GENERADO por tools/contrato-http.mjs desde el repo del CMS:
//   Synergos.CMS.Web/docs/contracts/openapi/Synergos.Bff.Eventos.json
// que a su vez GENERA `ContratoOpenApiTests` desde el host real del orquestador.
// NO se edita a mano. Regenerar: `node tools/contrato-http.mjs` · comprobar: `--check`.
//
// Sólo lo que el navegador manda y recibe por la puerta (GET|POST /api/flujos/{flujo}/{operacion}):
// las operaciones que el orquestador marca con x-synergos-flujo, por su nombre en la puerta, y los
// esquemas que alcanzan. Lo que pone la puerta no sale. Hasta la F4 no lo importa nadie: la
// regla 24 de CLAUDE.md queda abierta con fecha.

export interface BuyTicketsRequest {
  readonly eventId?: string | null;
  readonly lines?: readonly TicketLineRequest[] | null;
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
 * Una operación por la puerta: con qué método, qué va en la consulta (los parámetros de ruta del
 * orquestador viajan ahí, con su nombre), el cuerpo que se manda (`undefined` si no lleva), lo
 * que vuelve con éxito y si pide la cabecera Idempotency-Key. Los rechazos vuelven como `Rechazo`:
 * los del orquestador con su `code`, los de la puerta con `puerta.*`.
 */
export interface OperacionDeLaPuerta<TMetodo extends "GET" | "POST", TConsulta, TCuerpo, TRespuesta, TLlave extends "requerida" | "opcional" | "ninguna"> {
  readonly metodo: TMetodo;
  readonly consulta: TConsulta;
  readonly cuerpo: TCuerpo;
  readonly respuesta: TRespuesta;
  readonly llave: TLlave;
}

/** Lo que la puerta expone de este orquestador: por flujo, y por su nombre en la puerta. */
export interface OperacionesDeLaPuerta {
  readonly "eventos.compra": {
    readonly abrir: OperacionDeLaPuerta<"POST", undefined, BuyTicketsRequest, TicketPurchaseResponse, "requerida">;
    readonly cancelar: OperacionDeLaPuerta<"POST", { readonly id: string; }, undefined, TicketPurchaseResponse, "ninguna">;
    readonly cerrar: OperacionDeLaPuerta<"POST", { readonly id: string; }, undefined, TicketPurchaseResponse, "ninguna">;
    readonly consultar: OperacionDeLaPuerta<"GET", { readonly id: string; }, undefined, TicketPurchaseResponse, "ninguna">;
  };
}
