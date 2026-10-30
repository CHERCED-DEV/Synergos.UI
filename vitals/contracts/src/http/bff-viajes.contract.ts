// ─── El contrato HTTP de Synergos.Bff.Viajes por la puerta (ADR 0140, F3) ───
// GENERADO por tools/contrato-http.mjs desde el repo del CMS:
//   Synergos.CMS.Web/docs/contracts/openapi/Synergos.Bff.Viajes.json
// que a su vez GENERA `ContratoOpenApiTests` desde el host real del orquestador.
// NO se edita a mano. Regenerar: `node tools/contrato-http.mjs` · comprobar: `--check`.
//
// Sólo lo que el navegador manda y recibe por la puerta (GET|POST /api/flujos/{flujo}/{operacion}):
// las operaciones que el orquestador marca con x-synergos-flujo, por su nombre en la puerta, y los
// esquemas que alcanzan. Lo que pone la puerta no sale. Junto al mapa va OPERACIONES_DE_LA_PUERTA,
// lo que el cliente necesita en ejecución; quién lo importa, y qué rompe un renombre, lo dice la
// regla 24 de CLAUDE.md.

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

export interface ViajesCancelacionEntrada {
  readonly viaje: string;
  readonly retener: { readonly amount: number; readonly currency: string; };
}

export interface ViajesCancelacionPagina {
  readonly items: readonly ViajesCancelacionRespuesta[];
  readonly total: number;
  readonly offset: number;
  readonly hasMore: boolean;
}

export interface ViajesCancelacionRespuesta {
  readonly id: string;
  readonly flujo: string;
  readonly numero: string;
  readonly estado: string;
  readonly datos: { readonly viaje: string | null; readonly retener: { readonly amount: number; readonly currency: string; } | null; readonly aDevolver: { readonly amount: number; readonly currency: string; } | null; };
  readonly compensacionesPendientes: number;
  readonly error: string | null;
  readonly deshaciendo: boolean;
}

export interface ViajesDevolucionEntrada {
  readonly viaje: string;
  readonly monto: { readonly amount: number; readonly currency: string; };
}

export interface ViajesDevolucionPagina {
  readonly items: readonly ViajesDevolucionRespuesta[];
  readonly total: number;
  readonly offset: number;
  readonly hasMore: boolean;
}

export interface ViajesDevolucionRespuesta {
  readonly id: string;
  readonly flujo: string;
  readonly numero: string;
  readonly estado: string;
  readonly datos: { readonly viaje: string | null; readonly monto: { readonly amount: number; readonly currency: string; } | null; };
  readonly compensacionesPendientes: number;
  readonly error: string | null;
  readonly deshaciendo: boolean;
}

export interface ViajesReservaCotizacion {
  readonly flujo: string;
  readonly datos: { readonly itinerario: readonly ({ readonly producto: string; readonly etiqueta: string; readonly inicio: string; readonly fin: string; readonly precio?: { readonly amount: number; readonly currency: string; }; readonly noCumplido?: boolean; readonly devuelto?: { readonly amount: number; readonly currency: string; }; readonly unidad?: "noche" | "dia" | "trayecto"; readonly tramos?: number; readonly adultos?: number; readonly ninos?: number; })[] | null; readonly subtotal: { readonly amount: number; readonly currency: string; } | null; readonly descuento: { readonly amount: number; readonly currency: string; } | null; readonly impuesto: { readonly amount: number; readonly currency: string; } | null; readonly total: { readonly amount: number; readonly currency: string; } | null; readonly vence: string | null; };
}

export interface ViajesReservaEntrada {
  readonly items: readonly ({ readonly producto: string; readonly etiqueta?: string | null; readonly ventana: { readonly start: string; readonly end: string; }; readonly porNoche?: boolean | null; readonly porDia?: boolean | null; readonly tramos?: number | null; readonly adultos?: number | null; readonly ninos?: number | null; })[];
}

export interface ViajesReservaPagina {
  readonly items: readonly ViajesReservaRespuesta[];
  readonly total: number;
  readonly offset: number;
  readonly hasMore: boolean;
}

export interface ViajesReservaRespuesta {
  readonly id: string;
  readonly flujo: string;
  readonly numero: string;
  readonly estado: string;
  readonly datos: { readonly itinerario: readonly ({ readonly producto: string; readonly etiqueta: string; readonly inicio: string; readonly fin: string; readonly precio?: { readonly amount: number; readonly currency: string; }; readonly noCumplido?: boolean; readonly devuelto?: { readonly amount: number; readonly currency: string; }; readonly unidad?: "noche" | "dia" | "trayecto"; readonly tramos?: number; readonly adultos?: number; readonly ninos?: number; })[] | null; readonly subtotal: { readonly amount: number; readonly currency: string; } | null; readonly descuento: { readonly amount: number; readonly currency: string; } | null; readonly impuesto: { readonly amount: number; readonly currency: string; } | null; readonly total: { readonly amount: number; readonly currency: string; } | null; readonly vence: string | null; };
  readonly compensacionesPendientes: number;
  readonly error: string | null;
  readonly deshaciendo: boolean;
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
  readonly "viajes.cancelacion": {
    readonly abrir: OperacionDeLaPuerta<"POST", undefined, ViajesCancelacionEntrada, ViajesCancelacionRespuesta, "requerida">;
    readonly cancelar: OperacionDeLaPuerta<"POST", { readonly id: string; }, undefined, ViajesCancelacionRespuesta, "ninguna">;
    readonly consultar: OperacionDeLaPuerta<"GET", { readonly id: string; }, undefined, ViajesCancelacionRespuesta, "ninguna">;
    readonly listar: OperacionDeLaPuerta<"GET", { readonly estado?: string; readonly offset?: number; readonly limit?: number; }, undefined, ViajesCancelacionPagina, "ninguna">;
  };
  readonly "viajes.devolucion": {
    readonly cancelar: OperacionDeLaPuerta<"POST", { readonly id: string; }, undefined, ViajesDevolucionRespuesta, "ninguna">;
    readonly consultar: OperacionDeLaPuerta<"GET", { readonly id: string; }, undefined, ViajesDevolucionRespuesta, "ninguna">;
    readonly devolver: OperacionDeLaPuerta<"POST", undefined, ViajesDevolucionEntrada, ViajesDevolucionRespuesta, "requerida">;
    readonly listar: OperacionDeLaPuerta<"GET", { readonly estado?: string; readonly offset?: number; readonly limit?: number; }, undefined, ViajesDevolucionPagina, "ninguna">;
  };
  readonly "viajes.reserva": {
    readonly abrir: OperacionDeLaPuerta<"POST", undefined, ViajesReservaEntrada, ViajesReservaRespuesta, "requerida">;
    readonly cancelar: OperacionDeLaPuerta<"POST", { readonly id: string; }, undefined, ViajesReservaRespuesta, "ninguna">;
    readonly cerrar: OperacionDeLaPuerta<"POST", { readonly id: string; }, undefined, ViajesReservaRespuesta, "ninguna">;
    readonly consultar: OperacionDeLaPuerta<"GET", { readonly id: string; }, undefined, ViajesReservaRespuesta, "ninguna">;
    readonly cotizar: OperacionDeLaPuerta<"POST", undefined, ViajesReservaEntrada, ViajesReservaCotizacion, "ninguna">;
    readonly listar: OperacionDeLaPuerta<"GET", { readonly estado?: string; readonly offset?: number; readonly limit?: number; }, undefined, ViajesReservaPagina, "ninguna">;
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
  "viajes.cancelacion": {
    abrir: { metodo: "POST", llave: "requerida", consulta: [] },
    cancelar: { metodo: "POST", llave: "ninguna", consulta: ["id"] },
    consultar: { metodo: "GET", llave: "ninguna", consulta: ["id"] },
    listar: { metodo: "GET", llave: "ninguna", consulta: ["estado", "offset", "limit"] },
  },
  "viajes.devolucion": {
    cancelar: { metodo: "POST", llave: "ninguna", consulta: ["id"] },
    consultar: { metodo: "GET", llave: "ninguna", consulta: ["id"] },
    devolver: { metodo: "POST", llave: "requerida", consulta: [] },
    listar: { metodo: "GET", llave: "ninguna", consulta: ["estado", "offset", "limit"] },
  },
  "viajes.reserva": {
    abrir: { metodo: "POST", llave: "requerida", consulta: [] },
    cancelar: { metodo: "POST", llave: "ninguna", consulta: ["id"] },
    cerrar: { metodo: "POST", llave: "ninguna", consulta: ["id"] },
    consultar: { metodo: "GET", llave: "ninguna", consulta: ["id"] },
    cotizar: { metodo: "POST", llave: "ninguna", consulta: [] },
    listar: { metodo: "GET", llave: "ninguna", consulta: ["estado", "offset", "limit"] },
  },
} as const satisfies TablaDeLaPuerta<OperacionesDeLaPuerta>;
