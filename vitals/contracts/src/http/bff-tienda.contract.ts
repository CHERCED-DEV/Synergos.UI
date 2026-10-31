// ─── El contrato HTTP de Synergos.Bff.Tienda por la puerta (ADR 0140, F3) ───
// GENERADO por tools/contrato-http.mjs desde el repo del CMS:
//   Synergos.CMS.Web/docs/contracts/openapi/Synergos.Bff.Tienda.json
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

export interface TiendaCompraCerrarEntrada {
  readonly direccion: { readonly linea1: string; readonly linea2?: string | null; readonly ciudad: string; readonly region?: string | null; readonly codigoPostal?: string | null; readonly pais: string; readonly contacto?: string | null; };
}

export interface TiendaCompraCotizacion {
  readonly flujo: string;
  readonly datos: { readonly lineasDelPedido: readonly { readonly sujeto: { readonly kind: string; readonly id: string; }; readonly cantidad: number; readonly precioUnitario: { readonly amount: number; readonly currency: string; }; }[] | null; readonly subtotal: { readonly amount: number; readonly currency: string; } | null; readonly descuento: { readonly amount: number; readonly currency: string; } | null; readonly impuesto: { readonly amount: number; readonly currency: string; } | null; readonly total: { readonly amount: number; readonly currency: string; } | null; readonly pedido: string | null; readonly envio: string | null; readonly cobroId: string | null; };
}

export interface TiendaCompraEntrada {
  readonly lineas: readonly { readonly producto: { readonly kind: "tienda.producto"; readonly id: string; }; readonly cantidad: number; }[];
  readonly promocion?: string | null;
}

export interface TiendaCompraPagina {
  readonly items: readonly TiendaCompraRespuesta[];
  readonly total: number;
  readonly offset: number;
  readonly hasMore: boolean;
}

export interface TiendaCompraRespuesta {
  readonly id: string;
  readonly flujo: string;
  readonly numero: string;
  readonly estado: string;
  readonly datos: { readonly lineasDelPedido: readonly { readonly sujeto: { readonly kind: string; readonly id: string; }; readonly cantidad: number; readonly precioUnitario: { readonly amount: number; readonly currency: string; }; }[] | null; readonly subtotal: { readonly amount: number; readonly currency: string; } | null; readonly descuento: { readonly amount: number; readonly currency: string; } | null; readonly impuesto: { readonly amount: number; readonly currency: string; } | null; readonly total: { readonly amount: number; readonly currency: string; } | null; readonly pedido: string | null; readonly envio: string | null; readonly cobroId: string | null; };
  readonly compensacionesPendientes: number;
  readonly error: string | null;
  readonly deshaciendo: boolean;
}

export interface TiendaDevolucionEntrada {
  readonly compra: string;
  readonly monto: { readonly amount: number; readonly currency: string; };
}

export interface TiendaDevolucionPagina {
  readonly items: readonly TiendaDevolucionRespuesta[];
  readonly total: number;
  readonly offset: number;
  readonly hasMore: boolean;
}

export interface TiendaDevolucionRespuesta {
  readonly id: string;
  readonly flujo: string;
  readonly numero: string;
  readonly estado: string;
  readonly datos: { readonly compra: string | null; readonly monto: { readonly amount: number; readonly currency: string; } | null; };
  readonly compensacionesPendientes: number;
  readonly error: string | null;
  readonly deshaciendo: boolean;
}

export interface TiendaEntregaEntrada {
  readonly compra: string;
}

export interface TiendaEntregaPagina {
  readonly items: readonly TiendaEntregaRespuesta[];
  readonly total: number;
  readonly offset: number;
  readonly hasMore: boolean;
}

export interface TiendaEntregaRespuesta {
  readonly id: string;
  readonly flujo: string;
  readonly numero: string;
  readonly estado: string;
  readonly datos: { readonly compra: string | null; readonly estadoDelEnvio: string | null; };
  readonly compensacionesPendientes: number;
  readonly error: string | null;
  readonly deshaciendo: boolean;
}

export interface TiendaEnvioDetalle {
  readonly flujo: string;
  readonly datos: { readonly destino: { readonly linea1: string; readonly linea2?: string | null; readonly ciudad: string; readonly region?: string | null; readonly codigoPostal?: string | null; readonly pais: string; readonly contacto?: string | null; } | null; readonly transportadora: string | null; readonly estadoDelEnvio: string | null; readonly eventos: readonly ({ readonly estado: string; readonly nota: string | null; readonly instante: string; })[] | null; };
}

export interface TiendaEnvioDetalleEntrada {
  readonly compra: string;
}

export interface TiendaEnvioEntrada {
  readonly compra: string;
  readonly guia?: string | null;
}

export interface TiendaEnvioPagina {
  readonly items: readonly TiendaEnvioRespuesta[];
  readonly total: number;
  readonly offset: number;
  readonly hasMore: boolean;
}

export interface TiendaEnvioRespuesta {
  readonly id: string;
  readonly flujo: string;
  readonly numero: string;
  readonly estado: string;
  readonly datos: { readonly compra: string | null; readonly estadoDelEnvio: string | null; };
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
  readonly "tienda.compra": {
    readonly abrir: OperacionDeLaPuerta<"POST", undefined, TiendaCompraEntrada, TiendaCompraRespuesta, "requerida">;
    readonly cancelar: OperacionDeLaPuerta<"POST", { readonly id: string; }, undefined, TiendaCompraRespuesta, "ninguna">;
    readonly cerrar: OperacionDeLaPuerta<"POST", { readonly id: string; }, TiendaCompraCerrarEntrada, TiendaCompraRespuesta, "ninguna">;
    readonly consultar: OperacionDeLaPuerta<"GET", { readonly id: string; }, undefined, TiendaCompraRespuesta, "ninguna">;
    readonly cotizar: OperacionDeLaPuerta<"POST", undefined, TiendaCompraEntrada, TiendaCompraCotizacion, "ninguna">;
    readonly listar: OperacionDeLaPuerta<"GET", { readonly estado?: string; readonly offset?: number; readonly limit?: number; }, undefined, TiendaCompraPagina, "ninguna">;
  };
  readonly "tienda.devolucion": {
    readonly cancelar: OperacionDeLaPuerta<"POST", { readonly id: string; }, undefined, TiendaDevolucionRespuesta, "ninguna">;
    readonly consultar: OperacionDeLaPuerta<"GET", { readonly id: string; }, undefined, TiendaDevolucionRespuesta, "ninguna">;
    readonly devolver: OperacionDeLaPuerta<"POST", undefined, TiendaDevolucionEntrada, TiendaDevolucionRespuesta, "requerida">;
    readonly listar: OperacionDeLaPuerta<"GET", { readonly estado?: string; readonly offset?: number; readonly limit?: number; }, undefined, TiendaDevolucionPagina, "ninguna">;
  };
  readonly "tienda.entrega": {
    readonly abrir: OperacionDeLaPuerta<"POST", undefined, TiendaEntregaEntrada, TiendaEntregaRespuesta, "requerida">;
    readonly cancelar: OperacionDeLaPuerta<"POST", { readonly id: string; }, undefined, TiendaEntregaRespuesta, "ninguna">;
    readonly consultar: OperacionDeLaPuerta<"GET", { readonly id: string; }, undefined, TiendaEntregaRespuesta, "ninguna">;
    readonly listar: OperacionDeLaPuerta<"GET", { readonly estado?: string; readonly offset?: number; readonly limit?: number; }, undefined, TiendaEntregaPagina, "ninguna">;
  };
  readonly "tienda.envio": {
    readonly abrir: OperacionDeLaPuerta<"POST", undefined, TiendaEnvioEntrada, TiendaEnvioRespuesta, "requerida">;
    readonly cancelar: OperacionDeLaPuerta<"POST", { readonly id: string; }, undefined, TiendaEnvioRespuesta, "ninguna">;
    readonly consultar: OperacionDeLaPuerta<"GET", { readonly id: string; }, undefined, TiendaEnvioRespuesta, "ninguna">;
    readonly detalle: OperacionDeLaPuerta<"POST", undefined, TiendaEnvioDetalleEntrada, TiendaEnvioDetalle, "ninguna">;
    readonly listar: OperacionDeLaPuerta<"GET", { readonly estado?: string; readonly offset?: number; readonly limit?: number; }, undefined, TiendaEnvioPagina, "ninguna">;
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
  "tienda.compra": {
    abrir: { metodo: "POST", llave: "requerida", consulta: [] },
    cancelar: { metodo: "POST", llave: "ninguna", consulta: ["id"] },
    cerrar: { metodo: "POST", llave: "ninguna", consulta: ["id"] },
    consultar: { metodo: "GET", llave: "ninguna", consulta: ["id"] },
    cotizar: { metodo: "POST", llave: "ninguna", consulta: [] },
    listar: { metodo: "GET", llave: "ninguna", consulta: ["estado", "offset", "limit"] },
  },
  "tienda.devolucion": {
    cancelar: { metodo: "POST", llave: "ninguna", consulta: ["id"] },
    consultar: { metodo: "GET", llave: "ninguna", consulta: ["id"] },
    devolver: { metodo: "POST", llave: "requerida", consulta: [] },
    listar: { metodo: "GET", llave: "ninguna", consulta: ["estado", "offset", "limit"] },
  },
  "tienda.entrega": {
    abrir: { metodo: "POST", llave: "requerida", consulta: [] },
    cancelar: { metodo: "POST", llave: "ninguna", consulta: ["id"] },
    consultar: { metodo: "GET", llave: "ninguna", consulta: ["id"] },
    listar: { metodo: "GET", llave: "ninguna", consulta: ["estado", "offset", "limit"] },
  },
  "tienda.envio": {
    abrir: { metodo: "POST", llave: "requerida", consulta: [] },
    cancelar: { metodo: "POST", llave: "ninguna", consulta: ["id"] },
    consultar: { metodo: "GET", llave: "ninguna", consulta: ["id"] },
    detalle: { metodo: "POST", llave: "ninguna", consulta: [] },
    listar: { metodo: "GET", llave: "ninguna", consulta: ["estado", "offset", "limit"] },
  },
} as const satisfies TablaDeLaPuerta<OperacionesDeLaPuerta>;
