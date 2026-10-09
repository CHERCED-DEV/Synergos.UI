import { describe, expect, it } from 'vitest';

import {
  diferencias,
  esDocumentoDelFlujo,
  generarIndice,
  generarTs,
  nombresDe,
  planDeFicheros,
  validarDocumento,
} from './contrato-http.mjs';

const ref = (nombre) => ({ $ref: `#/components/schemas/${nombre}` });
const json = (schema) => ({ content: { 'application/json': { schema } } });
const rechazo = (description) => ({ description, content: { 'application/problem+json': { schema: ref('Rechazo') } } });
const sinCuerpo = { description: 'Falta la llave compartida o no es la buena (sin cuerpo).' };

/**
 * Un documento con la forma que emite `ContratoOpenApiTests` del CMS (ASP.NET Core 10): anulables
 * como `type: ["null", X]`, un $ref anulable como `oneOf`, decimal con `format`, la llave como
 * parámetro de cabecera y los rechazos en problem+json contra `Rechazo`. Y, desde la F3, dos
 * operaciones marcadas para la puerta (abrir, consultar), una cabecera que pone la puerta, y una
 * operación SIN marca con un esquema que sólo ella alcanza (`Ajuste`).
 */
const documento = () => ({
  openapi: '3.1.1',
  info: { title: 'Synergos.Bff.Prueba', version: 'v1' },
  paths: {
    '/v1/compras': {
      post: {
        operationId: 'Comprar',
        'x-synergos-flujo': { flujo: 'prueba.compra', operacion: 'abrir' },
        parameters: [
          { name: 'Idempotency-Key', in: 'header', required: true, schema: { maxLength: 128, type: 'string' } },
          { name: 'X-Synergos-Sujeto', in: 'header', schema: { type: 'string' }, 'x-synergos-puerta': true },
        ],
        requestBody: { ...json(ref('CompraRequest')), required: true },
        responses: { 201: { description: 'Created', ...json(ref('CompraResponse')) }, 401: sinCuerpo, 409: rechazo('Conflict') },
      },
    },
    '/v1/compras/{id}': {
      get: {
        operationId: 'VerCompra',
        'x-synergos-flujo': { flujo: 'prueba.compra', operacion: 'consultar' },
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK', ...json(ref('CompraResponse')) }, 401: sinCuerpo, 404: rechazo('NotFound') },
      },
    },
    '/v1/compras/{id}/ajustar': {
      post: {
        operationId: 'Ajustar',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'Idempotency-Key', in: 'header', schema: { maxLength: 128, type: 'string' } },
        ],
        requestBody: { ...json({ type: 'array', items: { type: ['null', 'string'] } }), required: true },
        responses: { 200: { description: 'OK', ...json(ref('Ajuste')) }, 401: sinCuerpo },
      },
    },
  },
  components: {
    schemas: {
      Rechazo: {
        required: ['type', 'title', 'status', 'detail', 'code', 'transient'],
        type: 'object',
        properties: {
          type: { type: 'string' },
          title: { enum: ['Invalid', 'NotFound'], type: 'string' },
          status: { type: 'integer', format: 'int32' },
          detail: { type: 'string' },
          code: { type: 'string' },
          transient: { type: 'boolean' },
        },
      },
      CompraRequest: {
        type: 'object',
        properties: {
          eventId: { type: ['null', 'string'] },
          lines: { type: ['null', 'array'], items: ref('Linea') },
          fee: { type: ['null', 'number'], format: 'decimal' },
        },
      },
      CompraResponse: {
        required: ['id', 'total', 'held', 'at'],
        type: 'object',
        properties: {
          id: { type: 'string' },
          total: ref('MoneyDto'),
          cupon: { oneOf: [{ type: 'null' }, ref('MoneyDto')] },
          held: { type: 'array', items: ref('Linea') },
          at: { type: ['null', 'string'], format: 'date-time' },
        },
      },
      Linea: {
        required: ['quantity'],
        type: 'object',
        properties: { quantity: { type: 'integer', format: 'int32' }, seat: { type: ['null', 'string'] } },
      },
      MoneyDto: {
        required: ['amount', 'currency'],
        type: 'object',
        properties: { amount: { type: 'number', format: 'decimal' }, currency: { type: 'string' } },
      },
      Ajuste: {
        required: ['lineas'],
        type: 'object',
        properties: { lineas: { type: 'array', items: ref('Linea') } },
      },
    },
    securitySchemes: { llaveCompartida: { type: 'apiKey', name: 'X-Synergos-Key', in: 'header' } },
  },
  security: [{ llaveCompartida: [] }],
});

/** Lo que tiene que salir de `documento()`, byte a byte: el contrato del generador. */
const ESPERADO = `// ─── El contrato HTTP de Synergos.Bff.Prueba por la puerta (ADR 0140, F3) ───
// GENERADO por tools/contrato-http.mjs desde el repo del CMS:
//   Synergos.CMS.Web/docs/contracts/openapi/Synergos.Bff.Prueba.json
// que a su vez GENERA \`ContratoOpenApiTests\` desde el host real del orquestador.
// NO se edita a mano. Regenerar: \`node tools/contrato-http.mjs\` · comprobar: \`--check\`.
//
// Sólo lo que el navegador manda y recibe por la puerta (GET|POST /api/flujos/{flujo}/{operacion}):
// las operaciones que el orquestador marca con x-synergos-flujo, por su nombre en la puerta, y los
// esquemas que alcanzan. Lo que pone la puerta no sale. Junto al mapa va OPERACIONES_DE_LA_PUERTA,
// lo que el cliente necesita en ejecución; quién lo importa, y qué rompe un renombre, lo dice la
// regla 24 de CLAUDE.md.

export interface CompraRequest {
  readonly eventId?: string | null;
  readonly lines?: readonly Linea[] | null;
  readonly fee?: number | null;
}

export interface CompraResponse {
  readonly id: string;
  readonly total: MoneyDto;
  readonly cupon?: MoneyDto | null;
  readonly held: readonly Linea[];
  readonly at: string | null;
}

export interface Linea {
  readonly quantity: number;
  readonly seat?: string | null;
}

export interface MoneyDto {
  readonly amount: number;
  readonly currency: string;
}

/**
 * Un rechazo, venga del orquestador o de la puerta. Se decide por \`code\` y \`transient\`: \`title\`
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
 * orquestador viajan ahí, con su nombre), el cuerpo que se manda (\`undefined\` si no lleva), lo
 * que vuelve con éxito y si pide la cabecera Idempotency-Key. Los rechazos vuelven como \`Rechazo\`:
 * los del orquestador con su \`code\`, los de la puerta con \`puerta.*\`.
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
  readonly "prueba.compra": {
    readonly abrir: OperacionDeLaPuerta<"POST", undefined, CompraRequest, CompraResponse, "requerida">;
    readonly consultar: OperacionDeLaPuerta<"GET", { readonly id: string; }, undefined, CompraResponse, "ninguna">;
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
 * mismo documento que el mapa, y \`satisfies\` los cruza.
 */
export const OPERACIONES_DE_LA_PUERTA = {
  "prueba.compra": {
    abrir: { metodo: "POST", llave: "requerida", consulta: [] },
    consultar: { metodo: "GET", llave: "ninguna", consulta: ["id"] },
  },
} as const satisfies TablaDeLaPuerta<OperacionesDeLaPuerta>;
`;

const errores = (doc) => validarDocumento(doc).join('\n');

describe('validarDocumento', () => {
  it('no reporta nada sobre un documento con la forma que emite el CMS (happy)', () => {
    expect(validarDocumento(documento())).toEqual([]);
  });

  it('rechaza un openapi que no es 3.1.x', () => {
    for (const version of ['3.0.3', '3.2.0', undefined]) {
      const d = documento();
      d.openapi = version;
      expect(errores(d)).toContain('sólo se traduce 3.1.x');
    }
  });

  it('rechaza un documento sin operaciones: generaría un mapa vacío que compila (red por el vacío)', () => {
    const d = documento();
    d.paths = {};
    expect(errores(d)).toContain('no publica ninguna operación');
  });

  it('rechaza lo que no sabe traducir en un esquema en vez de volverlo unknown: allOf, additionalProperties', () => {
    const d = documento();
    d.components.schemas.Linea.allOf = [ref('MoneyDto')];
    d.components.schemas.MoneyDto.additionalProperties = { type: 'string' };
    expect(errores(d)).toContain('Linea: «allOf» sin traducción');
    expect(errores(d)).toContain('MoneyDto: «additionalProperties» sin traducción');
  });

  it('rechaza un $ref o un oneOf con hermanos: cada forma de esquema admite sólo sus claves', () => {
    const d = documento();
    d.components.schemas.CompraResponse.properties.total = { ...ref('MoneyDto'), description: 'El total' };
    d.components.schemas.CompraResponse.properties.cupon.type = 'object';
    expect(errores(d)).toContain('CompraResponse.total: «description» sin traducción');
    expect(errores(d)).toContain('CompraResponse.cupon: «type» sin traducción');
  });

  it('rechaza claves sin traducción fuera de los esquemas: en la ruta, la operación, el parámetro, el cuerpo y la respuesta', () => {
    const casos = [
      [(d) => (d.paths['/v1/compras'].head = d.paths['/v1/compras'].post), '/v1/compras: «head» sin traducción'],
      [(d) => (d.paths['/v1/compras'].post.callbacks = {}), 'Comprar: «callbacks» sin traducción'],
      [(d) => (d.paths['/v1/compras'].post.parameters[0].style = 'simple'), 'Comprar · Idempotency-Key: «style» sin traducción'],
      [(d) => (d.paths['/v1/compras'].post.requestBody.description = 'x'), 'Comprar · cuerpo: «description» sin traducción'],
      [(d) => (d.paths['/v1/compras'].post.responses[201].headers = {}), 'Comprar → 201: «headers» sin traducción'],
    ];
    for (const [mutar, mensaje] of casos) {
      const d = documento();
      mutar(d);
      expect(errores(d)).toContain(mensaje);
    }
  });

  it('rechaza un tipo sin traducción: una unión, un esquema sin type, un null suelto', () => {
    const d = documento();
    d.components.schemas.Linea.properties.seat = { type: ['string', 'boolean'] };
    d.components.schemas.Linea.properties.quantity = {};
    d.components.schemas.MoneyDto.properties.currency = { type: 'null' };
    const e = errores(d);
    expect(e).toContain('Linea.seat: tipo ["string","boolean"] sin traducción');
    expect(e).toContain('Linea.quantity: tipo null sin traducción');
    expect(e).toContain('MoneyDto.currency: tipo "null" sin traducción');
  });

  it('rechaza un número que también es cadena, también en un parámetro', () => {
    const d = documento();
    d.components.schemas.Linea.properties.quantity = { type: ['integer', 'string'], format: 'int32' };
    d.paths['/v1/compras/{id}'].get.parameters[0].schema = { type: ['null', 'number', 'string'] };
    expect(errores(d)).toContain('Linea.quantity: número que también es cadena');
    expect(errores(d)).toContain('VerCompra · id: número que también es cadena');
  });

  it('rechaza un $ref colgante, y uno que no apunta a components/schemas', () => {
    const d = documento();
    d.components.schemas.CompraResponse.properties.total = ref('Dinero');
    d.paths['/v1/compras/{id}'].get.responses[200] = { description: 'OK', ...json({ $ref: '#/definitions/MoneyDto' }) };
    expect(errores(d)).toContain('CompraResponse.total: $ref colgante «#/components/schemas/Dinero»');
    expect(errores(d)).toContain('VerCompra → 200: $ref colgante «#/definitions/MoneyDto»');
  });

  it('rechaza un oneOf que no es «X o null»', () => {
    const d = documento();
    d.components.schemas.CompraResponse.properties.cupon = { oneOf: [ref('MoneyDto'), ref('Linea')] };
    expect(errores(d)).toContain('CompraResponse.cupon: oneOf que no es «X o null»');
  });

  it('rechaza un enum que no es de cadenas', () => {
    const d = documento();
    d.components.schemas.Rechazo.properties.status = { enum: [400, 404], type: 'integer' };
    expect(errores(d)).toContain('Rechazo.status: enum que no es de cadenas');
  });

  it('rechaza un objeto sin propiedades: se traduciría a {}, que acepta casi cualquier cosa', () => {
    const d = documento();
    d.components.schemas.MoneyDto = { type: 'object' };
    expect(errores(d)).toContain('MoneyDto: objeto sin propiedades');
  });

  it('rechaza un required que nombra una propiedad que no existe', () => {
    const d = documento();
    d.components.schemas.Linea.required = ['quantity', 'cantidad'];
    expect(errores(d)).toContain('Linea: required nombra «cantidad», que no es una propiedad');
  });

  it('rechaza una lista sin items', () => {
    const d = documento();
    delete d.components.schemas.CompraResponse.properties.held.items;
    expect(errores(d)).toContain('CompraResponse.held: lista sin items');
  });

  it('rechaza un format sin traducción: un long que en JS llegaría redondeado, un binario', () => {
    const d = documento();
    d.components.schemas.Linea.properties.quantity.format = 'int64';
    d.components.schemas.MoneyDto.properties.currency.format = 'binary';
    expect(errores(d)).toContain('Linea.quantity: format «int64» sin traducción en integer');
    expect(errores(d)).toContain('MoneyDto.currency: format «binary» sin traducción en string');
  });

  it('rechaza un esquema cuyo nombre no sirve de tipo, o choca con lo que el generado declara', () => {
    const d = documento();
    d.components.schemas['Page`1'] = d.components.schemas.Linea;
    d.components.schemas.OperacionesDeLaPuerta = d.components.schemas.Linea;
    d.components.schemas.OperacionDeLaPuerta = d.components.schemas.Linea;
    d.components.schemas.TablaDeLaPuerta = d.components.schemas.Linea;
    expect(errores(d)).toContain('esquema «Page`1»: no sirve de nombre de tipo');
    expect(errores(d)).toContain('esquema «OperacionesDeLaPuerta»: no sirve de nombre de tipo');
    expect(errores(d)).toContain('esquema «OperacionDeLaPuerta»: no sirve de nombre de tipo');
    expect(errores(d)).toContain('esquema «TablaDeLaPuerta»: no sirve de nombre de tipo');
  });

  it('rechaza una operación sin operationId: el mapa no tendría con qué nombrarla', () => {
    const d = documento();
    delete d.paths['/v1/compras/{id}'].get.operationId;
    expect(errores(d)).toContain('GET /v1/compras/{id}: sin operationId que sirva de clave');
  });

  it('rechaza un operationId repetido', () => {
    const d = documento();
    d.paths['/v1/compras/{id}'].get.operationId = 'Comprar';
    expect(errores(d)).toContain('Comprar: operationId repetido');
  });

  it('rechaza una operación sin UNA respuesta 2xx con JSON: sin éxito, sin cuerpo, otro tipo o dos éxitos', () => {
    const casos = [
      (op) => delete op.responses[200],
      (op) => (op.responses[200] = { description: 'OK' }),
      (op) => (op.responses[200] = { description: 'OK', content: { 'text/plain': { schema: { type: 'string' } } } }),
      (op) => (op.responses[202] = op.responses[200]),
    ];
    for (const mutar of casos) {
      const d = documento();
      mutar(d.paths['/v1/compras/{id}'].get);
      expect(errores(d)).toContain('VerCompra: sin UNA respuesta 2xx con cuerpo application/json y esquema');
    }
  });

  it('rechaza un rechazo con cuerpo que no es Rechazo, y una respuesta que no es 2xx/4xx/5xx', () => {
    const d = documento();
    d.paths['/v1/compras'].post.responses[409] = { description: 'Conflict', ...json(ref('MoneyDto')) };
    d.paths['/v1/compras/{id}'].get.responses.default = rechazo('x');
    expect(errores(d)).toContain('Comprar → 409: un rechazo cuyo cuerpo no es «Rechazo» en application/problem+json');
    expect(errores(d)).toContain('VerCompra: respuesta «default» sin traducción');
  });

  it('rechaza un Rechazo sin code o sin transient: el cliente sólo sabría el estado', () => {
    const d = documento();
    delete d.components.schemas.Rechazo.properties.code;
    d.components.schemas.Rechazo.required = d.components.schemas.Rechazo.required.filter((c) => c !== 'transient');
    expect(errores(d)).toContain('Rechazo.code: tiene que ser string y requerido');
    expect(errores(d)).toContain('Rechazo.transient: tiene que ser boolean y requerido');

    delete d.components.schemas.Rechazo;
    expect(errores(d)).toContain('no trae el esquema «Rechazo»');
  });

  it('rechaza un parámetro en una cookie y una cabecera que no es la llave', () => {
    const d = documento();
    d.paths['/v1/compras/{id}'].get.parameters.push({ name: 'sesion', in: 'cookie', schema: { type: 'string' } });
    d.paths['/v1/compras'].post.parameters.push({ name: 'X-Canal', in: 'header', schema: { type: 'string' } });
    expect(errores(d)).toContain('VerCompra: parámetro «sesion» en «cookie» sin traducción');
    expect(errores(d)).toContain('Comprar: la cabecera «X-Canal» no es Idempotency-Key');
  });

  it('rechaza un cuerpo de petición que no es un único JSON requerido', () => {
    for (const mutar of [
      (c) => (c.required = false),
      (c) => (c.content = { 'application/x-www-form-urlencoded': c.content['application/json'] }),
    ]) {
      const d = documento();
      mutar(d.paths['/v1/compras'].post.requestBody);
      expect(errores(d)).toContain('Comprar: el cuerpo de la petición no es un único application/json requerido con esquema');
    }
  });
});

describe('la puerta (ADR 0140 F3): marcas, cabeceras de la puerta y lo que no sale', () => {
  it('acepta la cabecera que pone la puerta, y sigue rechazando una cabecera sin esa marca', () => {
    expect(validarDocumento(documento())).toEqual([]);
    const d = documento();
    delete d.paths['/v1/compras'].post.parameters[1]['x-synergos-puerta'];
    expect(errores(d)).toContain('Comprar: la cabecera «X-Synergos-Sujeto» no es Idempotency-Key');
  });

  it('la marca de la puerta sólo vale `true`, en una cabecera, y nunca en la llave (la manda el navegador)', () => {
    const casos = [
      (op) => (op.parameters[1]['x-synergos-puerta'] = 'si'),
      (op) => (op.parameters[0]['x-synergos-puerta'] = true),
      (op) => op.parameters.push({ name: 'canal', in: 'query', schema: { type: 'string' }, 'x-synergos-puerta': true }),
    ];
    const nombres = ['X-Synergos-Sujeto', 'Idempotency-Key', 'canal'];
    casos.forEach((mutar, i) => {
      const d = documento();
      mutar(d.paths['/v1/compras'].post);
      expect(errores(d)).toContain(`Comprar: «${nombres[i]}» lleva x-synergos-puerta y sólo vale \`true\``);
    });
  });

  it('cualquier otra extensión se sigue rechazando, en la operación y en el parámetro', () => {
    const d = documento();
    d.paths['/v1/compras'].post['x-foo'] = 1;
    d.paths['/v1/compras'].post.parameters[0]['x-bar'] = true;
    expect(errores(d)).toContain('Comprar: «x-foo» sin traducción');
    expect(errores(d)).toContain('Comprar · Idempotency-Key: «x-bar» sin traducción');
  });

  it('rechaza una marca mal formada: forma, flujo, operación fuera del vocabulario, método, par repetido, consulta que choca', () => {
    const casos = [
      [(d) => (d.paths['/v1/compras'].post['x-synergos-flujo'] = { flujo: 'prueba.compra', operacion: 'abrir', extra: 1 }),
        'Comprar: x-synergos-flujo tiene que ser { flujo, operacion } y nada más'],
      [(d) => (d.paths['/v1/compras'].post['x-synergos-flujo'].flujo = 'Prueba'),
        'Comprar: x-synergos-flujo.flujo «Prueba» no es una clave de flujo'],
      [(d) => (d.paths['/v1/compras'].post['x-synergos-flujo'].operacion = 'BuyTickets'),
        'Comprar: x-synergos-flujo.operacion «BuyTickets» no es del vocabulario de la puerta'],
      [(d) => {
        d.paths['/v1/compras/{id}'].delete = { ...d.paths['/v1/compras/{id}'].get, operationId: 'Borrar' };
        d.paths['/v1/compras/{id}'].delete['x-synergos-flujo'] = { flujo: 'prueba.compra', operacion: 'cancelar' };
      }, 'Borrar: la puerta sólo pasa GET y POST, y la operación es DELETE'],
      [(d) => (d.paths['/v1/compras/{id}'].get['x-synergos-flujo'].operacion = 'abrir'),
        'VerCompra: prueba.compra/abrir ya lo marca Comprar'],
      [(d) => d.paths['/v1/compras/{id}'].get.parameters.push({ name: 'id', in: 'query', schema: { type: 'string' } }),
        'VerCompra: «id» llegaría dos veces a la consulta de la puerta'],
    ];
    for (const [mutar, mensaje] of casos) {
      const d = documento();
      mutar(d);
      expect(errores(d)).toContain(mensaje);
    }
  });

  it('sólo salen las operaciones marcadas, por flujo y nombre en la puerta, y los esquemas que ellas alcanzan', () => {
    const ts = generarTs(documento(), 'Synergos.Bff.Prueba.json');
    expect(ts).toContain('readonly abrir: OperacionDeLaPuerta<"POST", undefined, CompraRequest, CompraResponse, "requerida">;');
    expect(ts).toContain('readonly consultar: OperacionDeLaPuerta<"GET", { readonly id: string; }, undefined, CompraResponse, "ninguna">;');
    // La operación sin marca y el esquema que sólo ella alcanza no salen; la cabecera de la puerta tampoco.
    expect(ts).not.toContain('Ajustar');
    expect(ts).not.toContain('Ajuste');
    expect(ts).not.toContain('Sujeto');
  });

  it('sin marcas el mapa sale vacío y lo dice, con Rechazo como único esquema: es la verdad, la puerta no expone nada', () => {
    const d = documento();
    for (const item of Object.values(d.paths)) for (const op of Object.values(item)) delete op['x-synergos-flujo'];
    expect(validarDocumento(d)).toEqual([]);

    const ts = generarTs(d, 'Synergos.Bff.Prueba.json');
    expect(ts).toContain('export interface OperacionesDeLaPuerta {}');
    expect(ts).toContain('export const OPERACIONES_DE_LA_PUERTA = {} as const satisfies TablaDeLaPuerta<OperacionesDeLaPuerta>;');
    expect(ts).toContain('export interface Rechazo {');
    expect([...ts.matchAll(/^export interface (\w+)/gm)].map((m) => m[1])).toEqual([
      'Rechazo',
      'OperacionDeLaPuerta',
      'OperacionesDeLaPuerta',
    ]);
  });
});

describe('la tabla de ejecución y el rechazo de la puerta (ADR 0140 F4, el «cliente mínimo»)', () => {
  const tabla = (ts) => ts.slice(ts.indexOf('export const OPERACIONES_DE_LA_PUERTA'));

  it('la tabla sale del documento: método, llave y nombres de la consulta de cada operación marcada, y nada más', () => {
    const t = tabla(generarTs(documento(), 'Synergos.Bff.Prueba.json'));
    expect(t).toContain('abrir: { metodo: "POST", llave: "requerida", consulta: [] },');
    expect(t).toContain('consultar: { metodo: "GET", llave: "ninguna", consulta: ["id"] },');
    // La operación sin marca no tiene fila: el cliente no puede pedir lo que la puerta no abre.
    expect(t).not.toMatch(/ajustar|Ajustar/);
    expect(t).toMatch(/\} as const satisfies TablaDeLaPuerta<OperacionesDeLaPuerta>;\n$/);
  });

  it('una operación que gana un parámetro de consulta cambia la tabla, no sólo el tipo (M8 del plan de la F4)', () => {
    const d = documento();
    d.paths['/v1/compras'].post.parameters.push({ name: 'canal', in: 'query', required: true, schema: { type: 'string' } });
    const ts = generarTs(d, 'Synergos.Bff.Prueba.json');
    expect(ts).toContain('readonly abrir: OperacionDeLaPuerta<"POST", { readonly canal: string; }, CompraRequest, CompraResponse, "requerida">;');
    expect(tabla(ts)).toContain('abrir: { metodo: "POST", llave: "requerida", consulta: ["canal"] },');
  });

  it('el método y la llave de la tabla son los del documento, no un valor por defecto', () => {
    const d = documento();
    d.paths['/v1/compras/{id}'].post = { ...d.paths['/v1/compras/{id}'].get, operationId: 'Cerrar' };
    d.paths['/v1/compras/{id}'].post['x-synergos-flujo'] = { flujo: 'prueba.compra', operacion: 'cerrar' };
    d.paths['/v1/compras/{id}'].post.parameters = [
      ...d.paths['/v1/compras/{id}'].get.parameters,
      { name: 'Idempotency-Key', in: 'header', schema: { maxLength: 128, type: 'string' } },
    ];
    expect(validarDocumento(d)).toEqual([]);
    expect(tabla(generarTs(d, 'Synergos.Bff.Prueba.json'))).toContain('cerrar: { metodo: "POST", llave: "opcional", consulta: ["id"] },');
  });

  it('title se ensancha a string en el fichero de la puerta: la puerta y el artefacto ponen la frase HTTP, no el enum', () => {
    const ts = generarTs(documento(), 'Synergos.Bff.Prueba.json');
    const rechazo = ts.slice(ts.indexOf('export interface Rechazo {'), ts.indexOf('}', ts.indexOf('export interface Rechazo {')));
    expect(rechazo).toContain('readonly title: string;');
    expect(rechazo).not.toMatch(/"Invalid"|"NotFound"/);
    // Lo que decide sigue igual de estricto: `code` y `transient`, requeridos.
    expect(rechazo).toContain('readonly code: string;');
    expect(rechazo).toContain('readonly transient: boolean;');
  });
});

describe('generarTs', () => {
  it('un documento mínimo válido da el TypeScript esperado, byte a byte y en LF', () => {
    const ts = generarTs(documento(), 'Synergos.Bff.Prueba.json');
    expect(ts).toBe(ESPERADO);
    expect(ts).not.toContain('\r');
  });

  it('es determinista: dos corridas dan lo mismo, aunque los esquemas lleguen en otro orden (idempotent)', () => {
    const d = documento();
    const alReves = documento();
    alReves.components.schemas = Object.fromEntries(Object.entries(alReves.components.schemas).reverse());
    expect(generarTs(d, 'Synergos.Bff.Prueba.json')).toBe(generarTs(documento(), 'Synergos.Bff.Prueba.json'));
    expect(generarTs(alReves, 'Synergos.Bff.Prueba.json')).toBe(ESPERADO);
  });
});

describe('la selección: sólo los orquestadores', () => {
  it('nombra el fichero y el espacio de nombres a partir del ensamblado', () => {
    expect(nombresDe('Synergos.Bff.Eventos.json')).toEqual({ fichero: 'bff-eventos.contract.ts', espacio: 'BffEventos' });
    expect(nombresDe('Synergos.Bff.ViajesCorporativos.json').fichero).toBe('bff-viajes-corporativos.contract.ts');
    expect(esDocumentoDelFlujo('Synergos.Api.Pricing.json')).toBe(false);
  });

  it('un documento de capacidad no genera nada: ni se abre', () => {
    const leidos = [];
    const leer = (f) => {
      leidos.push(f);
      return documento();
    };
    const { errores: e, ficheros } = planDeFicheros(['Synergos.Api.Pricing.json', 'Synergos.Bff.Prueba.json', 'README.md'], leer);
    expect(e).toEqual([]);
    expect(leidos).toEqual(['Synergos.Bff.Prueba.json']);
    expect([...ficheros.keys()]).toEqual(['bff-prueba.contract.ts', 'index.ts']);
    expect(ficheros.get('bff-prueba.contract.ts')).toBe(ESPERADO);
    expect(ficheros.get('index.ts')).toBe(generarIndice(['Synergos.Bff.Prueba.json']));
    expect(ficheros.get('index.ts')).toContain("export * as BffPrueba from './bff-prueba.contract';\n");
  });

  it('sin documentos de orquestador RECHAZA: un --check sobre nada saldría en verde', () => {
    const { errores: e, ficheros } = planDeFicheros(['Synergos.Api.Pricing.json'], () => documento());
    expect(e.join('\n')).toContain('no hay ningún Synergos.Bff.*.json');
    expect(ficheros.size).toBe(0);
  });

  it('un documento que no valida no genera nada, y el error dice de qué fichero es', () => {
    const malo = documento();
    malo.openapi = '3.0.0';
    const { errores: e, ficheros } = planDeFicheros(['Synergos.Bff.Prueba.json'], () => malo);
    expect(e).toEqual(['Synergos.Bff.Prueba.json: openapi «3.0.0»: sólo se traduce 3.1.x']);
    expect(ficheros.size).toBe(0);
  });
});

describe('diferencias (lo que compara --check)', () => {
  const esperados = new Map([
    ['bff-prueba.contract.ts', ESPERADO],
    ['index.ts', generarIndice(['Synergos.Bff.Prueba.json'])],
  ]);

  it('nada que decir si el disco es el de hoy, aunque el checkout traiga CRLF', () => {
    expect(diferencias(esperados, new Map(esperados))).toEqual([]);
    const conCrlf = new Map([...esperados].map(([f, t]) => [f, t.replaceAll('\n', '\r\n')]));
    expect(diferencias(esperados, conCrlf)).toEqual([]);
  });

  it('dice el fichero editado a mano, el que falta y el que sobra', () => {
    const enDisco = new Map([
      ['bff-prueba.contract.ts', ESPERADO.replace('readonly total: MoneyDto;', 'readonly totalPagado: MoneyDto;')],
      ['bff-viejo.contract.ts', '// de un orquestador que ya no publica\n'],
    ]);
    expect(diferencias(esperados, enDisco)).toEqual([
      'bff-prueba.contract.ts: no está al día con el contrato del CMS',
      'index.ts: falta',
      'bff-viejo.contract.ts: sobra — no sale de ningún Synergos.Bff.*.json',
    ]);
  });
});
