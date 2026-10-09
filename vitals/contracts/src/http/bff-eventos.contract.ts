// ─── El contrato HTTP de Synergos.Bff.Eventos por la puerta (ADR 0140, F3) ───
// GENERADO por tools/contrato-http.mjs desde el repo del CMS:
//   Synergos.CMS.Web/docs/contracts/openapi/Synergos.Bff.Eventos.json
// que a su vez GENERA `ContratoOpenApiTests` desde el host real del orquestador.
// NO se edita a mano. Regenerar: `node tools/contrato-http.mjs` · comprobar: `--check`.
//
// Sólo lo que el navegador manda y recibe por la puerta (GET|POST /api/flujos/{flujo}/{operacion}):
// las operaciones que el orquestador marca con x-synergos-flujo, por su nombre en la puerta, y los
// esquemas que alcanzan. Lo que pone la puerta no sale. Junto al mapa va OPERACIONES_DE_LA_PUERTA,
// lo que el cliente necesita en ejecución; quién lo importa, y qué rompe un renombre, lo dice la
// regla 24 de CLAUDE.md.

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

/**
 * Un rechazo, venga del orquestador o de la puerta. Se decide por `code` y `transient`: `title`
 * es texto libre, porque la puerta y el artefacto ponen la frase HTTP («Unauthorized»).
 */
export interface Rechazo {
  readonly type: string;
  readonly title: string;
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

/**
 * La forma en ejecución de cada operación del mapa: el método, la llave y los nombres que viajan
 * en la consulta (ninguno si la operación no la lleva).
 */
export type TablaDeLaPuerta<TOperaciones> = {
  readonly [F in keyof TOperaciones]: {
    readonly [O in keyof TOperaciones[F]]: TOperaciones[F][O] extends OperacionDeLaPuerta<"GET" | "POST", unknown, unknown, unknown, "requerida" | "opcional" | "ninguna">
      ? {
          readonly metodo: TOperaciones[F][O]["metodo"];
          readonly llave: TOperaciones[F][O]["llave"];
          readonly consulta: TOperaciones[F][O]["consulta"] extends undefined ? readonly never[] : readonly (keyof TOperaciones[F][O]["consulta"] & string)[];
        }
      : never;
  };
};

/**
 * Lo que el cliente necesita en EJECUCIÓN y el mapa no le puede dar (son sólo tipos): con qué
 * método va cada operación, si pide la llave y qué nombres codifica en la consulta. Sale del
 * mismo documento que el mapa, y `satisfies` los cruza.
 */
export const OPERACIONES_DE_LA_PUERTA = {
  "eventos.compra": {
    abrir: { metodo: "POST", llave: "requerida", consulta: [] },
    cancelar: { metodo: "POST", llave: "ninguna", consulta: ["id"] },
    cerrar: { metodo: "POST", llave: "ninguna", consulta: ["id"] },
    consultar: { metodo: "GET", llave: "ninguna", consulta: ["id"] },
  },
} as const satisfies TablaDeLaPuerta<OperacionesDeLaPuerta>;
