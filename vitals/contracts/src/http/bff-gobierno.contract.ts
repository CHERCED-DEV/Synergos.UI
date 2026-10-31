// ─── El contrato HTTP de Synergos.Bff.Gobierno por la puerta (ADR 0140, F3) ───
// GENERADO por tools/contrato-http.mjs desde el repo del CMS:
//   Synergos.CMS.Web/docs/contracts/openapi/Synergos.Bff.Gobierno.json
// que a su vez GENERA `ContratoOpenApiTests` desde el host real del orquestador.
// NO se edita a mano. Regenerar: `node tools/contrato-http.mjs` · comprobar: `--check`.
//
// Sólo lo que el navegador manda y recibe por la puerta (GET|POST /api/flujos/{flujo}/{operacion}):
// las operaciones que el orquestador marca con x-synergos-flujo, por su nombre en la puerta, y los
// esquemas que alcanzan. Lo que pone la puerta no sale. Junto al mapa va OPERACIONES_DE_LA_PUERTA,
// lo que el cliente necesita en ejecución; quién lo importa, y qué rompe un renombre, lo dice la
// regla 24 de CLAUDE.md.

export interface GobiernoDecisionEntrada {
  readonly radicacion: string;
  readonly decision: string;
  readonly nota: string;
}

export interface GobiernoDecisionPagina {
  readonly items: readonly GobiernoDecisionRespuesta[];
  readonly total: number;
  readonly offset: number;
  readonly hasMore: boolean;
}

export interface GobiernoDecisionRespuesta {
  readonly id: string;
  readonly flujo: string;
  readonly numero: string;
  readonly estado: string;
  readonly datos: { readonly radicacion: string | null; readonly decision: string | null; readonly estado: string | null; };
  readonly compensacionesPendientes: number;
  readonly error: string | null;
  readonly deshaciendo: boolean;
}

export interface GobiernoRadicacionCotizacion {
  readonly flujo: string;
  readonly datos: { readonly tramite: { readonly kind: "gobierno.tramite"; readonly id: string; } | null; readonly total: { readonly amount: number; readonly currency: string; } | null; readonly expediente: string | null; readonly estado: string | null; readonly notificacionElectronica: boolean | null; readonly versionDelTexto: string | null; };
}

export interface GobiernoRadicacionEntrada {
  readonly tramite: { readonly kind: "gobierno.tramite"; readonly id: string; };
  readonly notificacionElectronica: boolean;
  readonly versionDelTexto: string;
}

export interface GobiernoRadicacionPagina {
  readonly items: readonly GobiernoRadicacionRespuesta[];
  readonly total: number;
  readonly offset: number;
  readonly hasMore: boolean;
}

export interface GobiernoRadicacionRespuesta {
  readonly id: string;
  readonly flujo: string;
  readonly numero: string;
  readonly estado: string;
  readonly datos: { readonly tramite: { readonly kind: "gobierno.tramite"; readonly id: string; } | null; readonly total: { readonly amount: number; readonly currency: string; } | null; readonly expediente: string | null; readonly estado: string | null; readonly notificacionElectronica: boolean | null; readonly versionDelTexto: string | null; };
  readonly compensacionesPendientes: number;
  readonly error: string | null;
  readonly deshaciendo: boolean;
}

export interface GobiernoSubsanacionEntrada {
  readonly radicacion: string;
  readonly nota?: string | null;
}

export interface GobiernoSubsanacionPagina {
  readonly items: readonly GobiernoSubsanacionRespuesta[];
  readonly total: number;
  readonly offset: number;
  readonly hasMore: boolean;
}

export interface GobiernoSubsanacionRespuesta {
  readonly id: string;
  readonly flujo: string;
  readonly numero: string;
  readonly estado: string;
  readonly datos: { readonly radicacion: string | null; readonly estado: string | null; };
  readonly compensacionesPendientes: number;
  readonly error: string | null;
  readonly deshaciendo: boolean;
}

export interface GobiernoTomaEntrada {
  readonly radicacion: string;
  readonly nota?: string | null;
}

export interface GobiernoTomaPagina {
  readonly items: readonly GobiernoTomaRespuesta[];
  readonly total: number;
  readonly offset: number;
  readonly hasMore: boolean;
}

export interface GobiernoTomaRespuesta {
  readonly id: string;
  readonly flujo: string;
  readonly numero: string;
  readonly estado: string;
  readonly datos: { readonly radicacion: string | null; readonly estado: string | null; };
  readonly compensacionesPendientes: number;
  readonly error: string | null;
  readonly deshaciendo: boolean;
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
  readonly "gobierno.decision": {
    readonly abrir: OperacionDeLaPuerta<"POST", undefined, GobiernoDecisionEntrada, GobiernoDecisionRespuesta, "requerida">;
    readonly cancelar: OperacionDeLaPuerta<"POST", { readonly id: string; }, undefined, GobiernoDecisionRespuesta, "ninguna">;
    readonly consultar: OperacionDeLaPuerta<"GET", { readonly id: string; }, undefined, GobiernoDecisionRespuesta, "ninguna">;
    readonly listar: OperacionDeLaPuerta<"GET", { readonly estado?: string; readonly offset?: number; readonly limit?: number; }, undefined, GobiernoDecisionPagina, "ninguna">;
  };
  readonly "gobierno.radicacion": {
    readonly abrir: OperacionDeLaPuerta<"POST", undefined, GobiernoRadicacionEntrada, GobiernoRadicacionRespuesta, "requerida">;
    readonly cancelar: OperacionDeLaPuerta<"POST", { readonly id: string; }, undefined, GobiernoRadicacionRespuesta, "ninguna">;
    readonly cerrar: OperacionDeLaPuerta<"POST", { readonly id: string; }, undefined, GobiernoRadicacionRespuesta, "ninguna">;
    readonly consultar: OperacionDeLaPuerta<"GET", { readonly id: string; }, undefined, GobiernoRadicacionRespuesta, "ninguna">;
    readonly cotizar: OperacionDeLaPuerta<"POST", undefined, GobiernoRadicacionEntrada, GobiernoRadicacionCotizacion, "ninguna">;
    readonly listar: OperacionDeLaPuerta<"GET", { readonly estado?: string; readonly offset?: number; readonly limit?: number; }, undefined, GobiernoRadicacionPagina, "ninguna">;
  };
  readonly "gobierno.subsanacion": {
    readonly abrir: OperacionDeLaPuerta<"POST", undefined, GobiernoSubsanacionEntrada, GobiernoSubsanacionRespuesta, "requerida">;
    readonly cancelar: OperacionDeLaPuerta<"POST", { readonly id: string; }, undefined, GobiernoSubsanacionRespuesta, "ninguna">;
    readonly consultar: OperacionDeLaPuerta<"GET", { readonly id: string; }, undefined, GobiernoSubsanacionRespuesta, "ninguna">;
    readonly listar: OperacionDeLaPuerta<"GET", { readonly estado?: string; readonly offset?: number; readonly limit?: number; }, undefined, GobiernoSubsanacionPagina, "ninguna">;
  };
  readonly "gobierno.toma": {
    readonly abrir: OperacionDeLaPuerta<"POST", undefined, GobiernoTomaEntrada, GobiernoTomaRespuesta, "requerida">;
    readonly cancelar: OperacionDeLaPuerta<"POST", { readonly id: string; }, undefined, GobiernoTomaRespuesta, "ninguna">;
    readonly consultar: OperacionDeLaPuerta<"GET", { readonly id: string; }, undefined, GobiernoTomaRespuesta, "ninguna">;
    readonly listar: OperacionDeLaPuerta<"GET", { readonly estado?: string; readonly offset?: number; readonly limit?: number; }, undefined, GobiernoTomaPagina, "ninguna">;
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
  "gobierno.decision": {
    abrir: { metodo: "POST", llave: "requerida", consulta: [] },
    cancelar: { metodo: "POST", llave: "ninguna", consulta: ["id"] },
    consultar: { metodo: "GET", llave: "ninguna", consulta: ["id"] },
    listar: { metodo: "GET", llave: "ninguna", consulta: ["estado", "offset", "limit"] },
  },
  "gobierno.radicacion": {
    abrir: { metodo: "POST", llave: "requerida", consulta: [] },
    cancelar: { metodo: "POST", llave: "ninguna", consulta: ["id"] },
    cerrar: { metodo: "POST", llave: "ninguna", consulta: ["id"] },
    consultar: { metodo: "GET", llave: "ninguna", consulta: ["id"] },
    cotizar: { metodo: "POST", llave: "ninguna", consulta: [] },
    listar: { metodo: "GET", llave: "ninguna", consulta: ["estado", "offset", "limit"] },
  },
  "gobierno.subsanacion": {
    abrir: { metodo: "POST", llave: "requerida", consulta: [] },
    cancelar: { metodo: "POST", llave: "ninguna", consulta: ["id"] },
    consultar: { metodo: "GET", llave: "ninguna", consulta: ["id"] },
    listar: { metodo: "GET", llave: "ninguna", consulta: ["estado", "offset", "limit"] },
  },
  "gobierno.toma": {
    abrir: { metodo: "POST", llave: "requerida", consulta: [] },
    cancelar: { metodo: "POST", llave: "ninguna", consulta: ["id"] },
    consultar: { metodo: "GET", llave: "ninguna", consulta: ["id"] },
    listar: { metodo: "GET", llave: "ninguna", consulta: ["estado", "offset", "limit"] },
  },
} as const satisfies TablaDeLaPuerta<OperacionesDeLaPuerta>;
