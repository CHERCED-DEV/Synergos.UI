/**
 * El contrato HTTP de los orquestadores, en tipos TypeScript (ADR 0140, F2 y F3 · CMS#201).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DE DÓNDE SALE.
 *
 * Desde la F2 cada pieza del backend publica su documento OpenAPI 3.1 en el CMS, en
 * `Synergos.CMS.Web/docs/contracts/openapi/<Ensamblado>.json`. No lo escribe nadie: lo genera
 * `ContratoOpenApiTests` desde el host real, y `SueloDelContratoTests` exige que sea rico
 * (operationId, un 2xx con esquema, ningún número que también sea cadena, `Rechazo` con `code`
 * y `transient`). La cadena, de punta a punta:
 *
 *   records + TypedResults del orquestador ──ContratoOpenApiTests──▶ openapi/Synergos.Bff.<X>.json
 *     ──este generador──▶ vitals/contracts/src/http/bff-<x>.contract.ts (+ su index.ts)
 *     ──tsc──▶ el cliente de la puerta de vitals/core (desde la F4: ver abajo)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ SÓLO `Synergos.Bff.*`, Y POR QUÉ POR LA PUERTA (F3).
 *
 * El front conoce el contrato del FLUJO, no el de las capacidades (ADR 0140 §3): los
 * `Synergos.Api.*` los lee el orquestador, y su compatibilidad la cruza el CMS
 * (`ContratoConsumidorEventosTests`). Y el navegador no habla con las rutas del BFF sino con la
 * puerta del CMS: `GET|POST /api/flujos/{flujo}/{operacion}`. Por eso sale un mapa por flujo y
 * por el NOMBRE EN LA PUERTA —el vocabulario fijo de saga: abrir, cerrar, cancelar, consultar, y
 * desde el cupón cotizar, la vista previa de la fase que abre sin reservar nada— y no por
 * operationId: el front sólo necesita la clave del flujo.
 *
 * Sólo salen las operaciones que el orquestador marca con `x-synergos-flujo` ({flujo,
 * operacion}), y sólo los esquemas que ellas alcanzan: lo demás (reintentar, compensaciones,
 * publicar la oferta) es operación del despliegue, y el navegador no tiene por qué conocerla.
 * Sin marcas, el mapa sale vacío, que es la verdad: la puerta no expone nada. Los parámetros de
 * ruta del orquestador viajan en la consulta, con su nombre. Las cabeceras que pone la puerta
 * (`x-synergos-puerta: true`: el sujeto, el negocio, el contacto) no salen: el navegador no las
 * manda, y si las mandara la puerta las tiraría. Cualquier otra extensión se sigue rechazando.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ UN GENERADOR PROPIO, Y POR QUÉ RECHAZA.
 *
 * `openapi-typescript` (medido en el informe de la F2) no pone suelo: un documento sin respuestas
 * genera `content?: never`, uno sin operationId genera `operations = Record<string, never>`, y
 * los dos compilan en verde. Acá se valida ANTES de generar, y lo que no se sabe traducir se
 * RECHAZA en vez de volverse `unknown`: un `unknown` compila contra cualquier cosa, que es el
 * contrato vacío con otro nombre. Si ASP.NET empieza a emitir un constructo nuevo, esto se pone
 * rojo hasta que alguien escriba su traducción — es lo que se quiere, aunque cueste.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUIÉN LO IMPORTA: EL CLIENTE DE LA PUERTA, DESDE LA F4.
 *
 * `vitals/core/src/flujos` lee el mapa, la tabla de ejecución (`OPERACIONES_DE_LA_PUERTA`, que
 * emite este generador del mismo documento) y la respuesta de la compra. Así se cierra la regla 24
 * de CLAUDE.md («un contrato que no importa nadie es un comentario con sintaxis»): un renombre en
 * el orquestador se regenera acá y rompe `test:tipos-vitals`, con los mutantes medidos.
 *
 * Como en `contrato-synhost.mjs`, el cruce con el CMS no está en `npm test` (que corre sin
 * hermano): está en `contracts:validate` y en `design-gates-ui.yml` (G-14), y sin el CMS
 * RECHAZA. Lo que corre en `npm test` es esta lógica, en `contrato-http.spec.mjs`.
 */

import { generarAvisos } from './avisos-de-los-flujos.mjs';

/** Dónde viven los documentos, dentro del repo del CMS. */
export const RUTA_EN_CMS = ['Synergos.CMS.Web', 'docs', 'contracts', 'openapi'];

/** Dónde se escriben los tipos, dentro de este repo. La carpeta es ENTERA generada. */
export const RUTA_GENERADA = ['vitals', 'contracts', 'src', 'http'];

/** El índice de la carpeta generada: un espacio de nombres por orquestador. */
export const INDICE = 'index.ts';

/** La cabecera que el orquestador exige o admite, y que el mapa declara por operación. */
export const LLAVE = 'Idempotency-Key';

/** El esquema común de los rechazos (ADR 0140 F2): ProblemDetails más `code` y `transient`. */
export const RECHAZO = 'Rechazo';

const DOCUMENTO_DEL_FLUJO = /^Synergos\.Bff\.([A-Z][A-Za-z0-9]*)\.json$/;
const IDENTIFICADOR = /^[A-Za-z_][A-Za-z0-9_]*$/;
const REF_A_ESQUEMA = /^#\/components\/schemas\/(.+)$/;
const JSON_ = 'application/json';
const PROBLEMA = 'application/problem+json';

const METODOS = new Set(['get', 'post', 'put', 'patch', 'delete']);
const CLAVES_DE_OPERACION = new Set(['operationId', 'parameters', 'requestBody', 'responses', 'x-synergos-flujo']);
const CLAVES_DE_PARAMETRO = new Set(['name', 'in', 'required', 'schema', 'x-synergos-puerta']);
const CLAVES_DE_RESPUESTA = new Set(['description', 'content']);
const CLAVES_DE_CUERPO = new Set(['content', 'required']);
const UBICACIONES = new Set(['path', 'query', 'header']);

// Un esquema es una de tres formas, y cada una admite sólo sus claves: lo demás (allOf,
// additionalProperties, anyOf, not, pattern…) no tiene traducción escrita.
const CLAVES_DE_REF = new Set(['$ref']);
const CLAVES_DE_ONEOF = new Set(['oneOf']);
const CLAVES_DE_TIPO = new Set(['type', 'properties', 'required', 'items', 'enum', 'format', 'maxLength']);
const TIPOS = new Set(['object', 'array', 'string', 'integer', 'number', 'boolean']);

// Los `format` que se traducen sin perder nada. `int64` NO está: un `long` que pase de 2^53
// llega redondeado a un `number` de JS, y eso es una decisión que hay que escribir, no heredar.
const FORMATOS = {
  integer: new Set(['int32']),
  number: new Set(['decimal', 'double', 'float']),
  string: new Set(['date-time', 'date', 'uuid']),
};

/** Los nombres que el generado declara por su cuenta: un esquema que se llame así chocaría. */
const RESERVADOS = new Set(['OperacionesDeLaPuerta', 'OperacionDeLaPuerta', 'TablaDeLaPuerta']);

/** La tabla de ejecución que el generado emite junto al mapa (ADR 0140 F4, el «cliente mínimo»). */
export const TABLA_DE_EJECUCION = 'OPERACIONES_DE_LA_PUERTA';

/** La marca de una operación que la puerta expone: `{ flujo, operacion }`. */
export const MARCA_DEL_FLUJO = 'x-synergos-flujo';

/** La marca de una cabecera que pone la puerta y no el navegador. */
export const MARCA_DE_LA_PUERTA = 'x-synergos-puerta';

/**
 * El vocabulario fijo de saga con que la puerta nombra las operaciones (ADR 0140 F3, decisión 6).
 * `cotizar` lo suma el cupón: la fase que abre, anticipada sin saga (`FlowRunner.AnticiparAsync`).
 * `listar` son las sagas del dueño, «mis reservas» (núcleo, NB-6 de 011). `disponibilidad` es una lectura sin
 * saga ni dueño, lo que se ve antes de abrir (NB-3): la única clase de operación que un flujo abre a invitados.
 * Es la misma lista que `EnLaPuertaExtensions.Operaciones` y `TablaDeLaPuerta.Operaciones` del CMS.
 */
export const OPERACIONES_DE_LA_PUERTA = ['abrir', 'cancelar', 'cerrar', 'consultar', 'cotizar', 'disponibilidad', 'listar'];

/** Los métodos que la puerta pasa. */
const METODOS_DE_LA_PUERTA = new Set(['get', 'post']);

/** Una clave de flujo: `eventos.compra`. Es lo que va en la ruta de la puerta. */
const CLAVE_DE_FLUJO = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

const ordinal = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const esObjeto = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);
const esNulo = (s) => esObjeto(s) && s.type === 'null' && Object.keys(s).length === 1;

/** ¿Es un documento de un orquestador? Los `Synergos.Api.*` son de las capacidades y no se leen. */
export function esDocumentoDelFlujo(fichero) {
  return DOCUMENTO_DEL_FLUJO.test(fichero);
}

/**
 * `Synergos.Bff.Eventos.json` → `bff-eventos.contract.ts` y el espacio de nombres `BffEventos`.
 * El nombre del documento es el del ensamblado (decisión del CMS), así que no hay tabla que
 * mantener entre los dos repos: se deriva.
 *
 * @param {string} fichero
 * @returns {{ fichero: string, espacio: string }}
 */
export function nombresDe(fichero) {
  const pieza = fichero.match(DOCUMENTO_DEL_FLUJO)[1];
  return {
    fichero: `bff-${pieza.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}.contract.ts`,
    espacio: `Bff${pieza}`,
  };
}

function sobran(objeto, permitidas, donde, errores) {
  for (const k of Object.keys(objeto)) {
    if (!permitidas.has(k)) errores.push(`${donde}: «${k}» sin traducción`);
  }
}

function revisarEsquema(s, donde, esquemas, errores) {
  if (!esObjeto(s)) {
    errores.push(`${donde}: no es un esquema`);
    return;
  }

  if (s.$ref !== undefined) {
    sobran(s, CLAVES_DE_REF, donde, errores);
    const nombre = typeof s.$ref === 'string' ? s.$ref.match(REF_A_ESQUEMA)?.[1] : undefined;
    if (nombre === undefined || !Object.hasOwn(esquemas, nombre)) errores.push(`${donde}: $ref colgante «${s.$ref}»`);
    return;
  }

  if (s.oneOf !== undefined) {
    sobran(s, CLAVES_DE_ONEOF, donde, errores);
    // Es como ASP.NET escribe un $ref anulable: `oneOf: [{type: null}, {$ref}]`. Cualquier otra
    // unión obligaría a discriminar, y eso no está escrito.
    const resto = Array.isArray(s.oneOf) ? s.oneOf.filter((a) => !esNulo(a)) : [];
    if (!Array.isArray(s.oneOf) || s.oneOf.length !== 2 || resto.length !== 1) {
      errores.push(`${donde}: oneOf que no es «X o null»`);
      return;
    }
    revisarEsquema(resto[0], donde, esquemas, errores);
    return;
  }

  sobran(s, CLAVES_DE_TIPO, donde, errores);
  const tipos = Array.isArray(s.type) ? s.type : [s.type];
  const reales = tipos.filter((t) => t !== 'null');
  // STJ con los defaults web (AllowReadingFromString) publica int y decimal como «número o
  // cadena», y eso en TS es `number | string`: el consumidor que lo lea como cadena compila.
  // El CMS lo quita con un transformer; si vuelve, se rechaza con su nombre.
  if (reales.includes('string') && (reales.includes('integer') || reales.includes('number'))) {
    errores.push(`${donde}: número que también es cadena`);
    return;
  }
  if (reales.length !== 1 || tipos.length - reales.length > 1 || !TIPOS.has(reales[0])) {
    errores.push(`${donde}: tipo ${JSON.stringify(s.type ?? null)} sin traducción`);
    return;
  }

  const tipo = reales[0];
  if (s.format !== undefined && !FORMATOS[tipo]?.has(s.format)) {
    errores.push(`${donde}: format «${s.format}» sin traducción en ${tipo}`);
  }
  if (s.enum !== undefined && (tipo !== 'string' || !Array.isArray(s.enum) || s.enum.length === 0 || s.enum.some((v) => typeof v !== 'string'))) {
    errores.push(`${donde}: enum que no es de cadenas`);
  }

  if (tipo === 'array') {
    if (s.items === undefined) errores.push(`${donde}: lista sin items`);
    else revisarEsquema(s.items, `${donde}[]`, esquemas, errores);
  }

  if (tipo === 'object') {
    // Un objeto sin propiedades se traduciría a `{}`, que en TS acepta casi cualquier cosa.
    if (!esObjeto(s.properties) || Object.keys(s.properties).length === 0) {
      errores.push(`${donde}: objeto sin propiedades`);
      return;
    }
    for (const r of Array.isArray(s.required) ? s.required : []) {
      if (!Object.hasOwn(s.properties, r)) errores.push(`${donde}: required nombra «${r}», que no es una propiedad`);
    }
    for (const [p, ps] of Object.entries(s.properties)) revisarEsquema(ps, `${donde}.${p}`, esquemas, errores);
  }
}

function revisarRespuestas(op, quien, esquemas, errores) {
  const respuestas = esObjeto(op.responses) ? Object.entries(op.responses) : [];
  for (const [codigo, r] of respuestas) if (esObjeto(r)) sobran(r, CLAVES_DE_RESPUESTA, `${quien} → ${codigo}`, errores);

  // Exactamente un éxito con cuerpo JSON: sin él el mapa no sabría qué devuelve la operación,
  // y con dos tendría que discriminar por estado, que no está escrito.
  const exitos = respuestas.filter(([c]) => /^2\d\d$/.test(c));
  const contenido = exitos.length === 1 ? exitos[0][1]?.content : undefined;
  if (exitos.length !== 1 || !esObjeto(contenido) || Object.keys(contenido).join() !== JSON_ || !esObjeto(contenido[JSON_].schema)) {
    errores.push(`${quien}: sin UNA respuesta 2xx con cuerpo ${JSON_} y esquema`);
  } else {
    revisarEsquema(contenido[JSON_].schema, `${quien} → ${exitos[0][0]}`, esquemas, errores);
  }

  for (const [codigo, r] of respuestas) {
    if (/^2\d\d$/.test(codigo)) continue;
    if (!/^[45]\d\d$/.test(codigo)) {
      errores.push(`${quien}: respuesta «${codigo}» sin traducción`);
      continue;
    }
    // Un rechazo sin cuerpo (el 401 de la llave compartida) no tiene forma que traducir. Uno con
    // cuerpo tiene que ser `Rechazo`, que es lo que el cliente va a leer por `code`.
    if (r?.content === undefined) continue;
    const media = esObjeto(r.content) ? r.content[PROBLEMA] : undefined;
    if (Object.keys(r.content ?? {}).join() !== PROBLEMA || media?.schema?.$ref !== `#/components/schemas/${RECHAZO}`) {
      errores.push(`${quien} → ${codigo}: un rechazo cuyo cuerpo no es «${RECHAZO}» en ${PROBLEMA}`);
    }
  }
}

function revisarParametros(op, quien, esquemas, errores) {
  for (const p of Array.isArray(op.parameters) ? op.parameters : []) {
    if (!esObjeto(p)) {
      errores.push(`${quien}: un parámetro que no es un objeto`);
      continue;
    }
    sobran(p, CLAVES_DE_PARAMETRO, `${quien} · ${p.name}`, errores);
    const deLaPuerta = p[MARCA_DE_LA_PUERTA];
    if (deLaPuerta !== undefined && (deLaPuerta !== true || p.in !== 'header' || p.name === LLAVE)) {
      // La marca dice «esto lo pone la puerta»: sólo tiene sentido en una cabecera, y nunca en la
      // llave, que la manda el navegador (la puerta la reemite atada al sujeto).
      errores.push(`${quien}: «${p.name}» lleva ${MARCA_DE_LA_PUERTA} y sólo vale \`true\` en una cabecera que no sea ${LLAVE}`);
    }
    if (!UBICACIONES.has(p.in)) {
      errores.push(`${quien}: parámetro «${p.name}» en «${p.in}» sin traducción`);
    } else if (p.in === 'header' && p.name !== LLAVE && deLaPuerta !== true) {
      // El mapa sólo sabe decir si la operación pide la llave; otra cabecera que no ponga la
      // puerta se perdería.
      errores.push(`${quien}: la cabecera «${p.name}» no es ${LLAVE}, y el mapa no sabe declararla`);
    }
    revisarEsquema(p.schema, `${quien} · ${p.name}`, esquemas, errores);
  }
}

function revisarCuerpo(op, quien, esquemas, errores) {
  const cuerpo = op.requestBody;
  if (cuerpo === undefined) return;
  if (esObjeto(cuerpo)) sobran(cuerpo, CLAVES_DE_CUERPO, `${quien} · cuerpo`, errores);
  const contenido = cuerpo?.content;
  if (cuerpo?.required !== true || !esObjeto(contenido) || Object.keys(contenido).join() !== JSON_ || !esObjeto(contenido[JSON_].schema)) {
    errores.push(`${quien}: el cuerpo de la petición no es un único ${JSON_} requerido con esquema`);
    return;
  }
  revisarEsquema(contenido[JSON_].schema, `${quien} · cuerpo`, esquemas, errores);
}

/**
 * La marca de la puerta en una operación: `{ flujo, operacion }`, con la operación del vocabulario
 * fijo, por GET o POST, una sola vez por flujo, y con lo que viaja en la consulta sin repetirse.
 */
function revisarMarca(op, metodo, quien, vistas, errores) {
  const marca = op[MARCA_DEL_FLUJO];
  if (marca === undefined) return;

  if (!esObjeto(marca) || Object.keys(marca).sort(ordinal).join() !== 'flujo,operacion') {
    errores.push(`${quien}: ${MARCA_DEL_FLUJO} tiene que ser { flujo, operacion } y nada más`);
    return;
  }
  if (typeof marca.flujo !== 'string' || !CLAVE_DE_FLUJO.test(marca.flujo)) {
    errores.push(`${quien}: ${MARCA_DEL_FLUJO}.flujo «${marca.flujo}» no es una clave de flujo (dominio.flujo)`);
  }
  if (!OPERACIONES_DE_LA_PUERTA.includes(marca.operacion)) {
    errores.push(`${quien}: ${MARCA_DEL_FLUJO}.operacion «${marca.operacion}» no es del vocabulario de la puerta (${OPERACIONES_DE_LA_PUERTA.join(', ')})`);
  }
  if (!METODOS_DE_LA_PUERTA.has(metodo)) {
    errores.push(`${quien}: la puerta sólo pasa GET y POST, y la operación es ${metodo.toUpperCase()}`);
  }

  const par = `${marca.flujo}/${marca.operacion}`;
  if (vistas.has(par)) errores.push(`${quien}: ${par} ya lo marca ${vistas.get(par)}`);
  else vistas.set(par, quien);

  // Ruta y consulta acaban en la MISMA consulta de la puerta: dos con el mismo nombre chocarían.
  const consulta = (op.parameters ?? []).filter((p) => p?.in === 'path' || p?.in === 'query').map((p) => p.name);
  for (const nombre of new Set(consulta.filter((n, i) => consulta.indexOf(n) !== i))) {
    errores.push(`${quien}: «${nombre}» llegaría dos veces a la consulta de la puerta`);
  }
}

function revisarRechazo(esquemas, errores) {
  const r = esquemas[RECHAZO];
  if (!esObjeto(r)) {
    errores.push(`el documento no trae el esquema «${RECHAZO}»: los rechazos no tendrían forma`);
    return;
  }
  // `code` es lo que el cliente compara (y traduce, ADR 0136) y `transient` decide si reintenta:
  // un Rechazo sin ellos es un ProblemDetails, y con él el cliente sólo sabría el estado.
  for (const [campo, tipo] of [['code', 'string'], ['transient', 'boolean']]) {
    if (r.properties?.[campo]?.type !== tipo || !Array.isArray(r.required) || !r.required.includes(campo)) {
      errores.push(`${RECHAZO}.${campo}: tiene que ser ${tipo} y requerido`);
    }
  }
}

/**
 * Los errores del documento, vacío si se puede traducir entero.
 *
 * No es cosmético: el generador confía en esta forma, y lo que no se sabe traducir NO se
 * traduce a `unknown`, se rechaza. Lo primero es la red por el vacío: un documento sin
 * operaciones generaría un mapa vacío que compila.
 *
 * @param {any} doc lo que se leyó de `openapi/Synergos.Bff.<X>.json`.
 * @returns {string[]}
 */
export function validarDocumento(doc) {
  const errores = [];
  if (!/^3\.1\.\d+$/.test(doc?.openapi ?? '')) errores.push(`openapi «${doc?.openapi}»: sólo se traduce 3.1.x`);

  const esquemas = esObjeto(doc?.components?.schemas) ? doc.components.schemas : {};
  for (const [nombre, s] of Object.entries(esquemas)) {
    if (!IDENTIFICADOR.test(nombre) || RESERVADOS.has(nombre)) errores.push(`esquema «${nombre}»: no sirve de nombre de tipo`);
    revisarEsquema(s, nombre, esquemas, errores);
  }
  revisarRechazo(esquemas, errores);

  const ids = new Set();
  const marcadas = new Map();
  let operaciones = 0;
  for (const [ruta, item] of Object.entries(esObjeto(doc?.paths) ? doc.paths : {})) {
    for (const [metodo, op] of Object.entries(esObjeto(item) ? item : {})) {
      if (!METODOS.has(metodo)) {
        errores.push(`${ruta}: «${metodo}» sin traducción`);
        continue;
      }
      operaciones++;
      const quien = typeof op?.operationId === 'string' ? op.operationId : `${metodo.toUpperCase()} ${ruta}`;
      if (!esObjeto(op)) {
        errores.push(`${quien}: no es una operación`);
        continue;
      }
      sobran(op, CLAVES_DE_OPERACION, quien, errores);
      // El operationId es la CLAVE del mapa: sin él la operación no tiene con qué nombrarse.
      if (typeof op.operationId !== 'string' || !IDENTIFICADOR.test(op.operationId)) {
        errores.push(`${quien}: sin operationId que sirva de clave`);
      } else if (ids.has(op.operationId)) {
        errores.push(`${quien}: operationId repetido`);
      }
      ids.add(op.operationId);
      revisarParametros(op, quien, esquemas, errores);
      revisarCuerpo(op, quien, esquemas, errores);
      revisarRespuestas(op, quien, esquemas, errores);
      revisarMarca(op, metodo, quien, marcadas, errores);
    }
  }
  if (operaciones === 0) errores.push('el documento no publica ninguna operación: generaría un mapa vacío que compila');

  return errores;
}

// ─── Generación ──────────────────────────────────────────────────────────────

const entreParentesis = (t) => (t.includes(' | ') ? `(${t})` : t);
const clave = (p) => (IDENTIFICADOR.test(p) ? p : JSON.stringify(p));

function propiedades(s) {
  const requeridas = new Set(s.required ?? []);
  return Object.entries(s.properties).map(([p, ps]) => `readonly ${clave(p)}${requeridas.has(p) ? '' : '?'}: ${tipoTs(ps)};`);
}

function tipoTs(s) {
  if (s.$ref !== undefined) return s.$ref.match(REF_A_ESQUEMA)[1];
  if (s.oneOf !== undefined) return `${tipoTs(s.oneOf.find((a) => !esNulo(a)))} | null`;
  const tipos = Array.isArray(s.type) ? s.type : [s.type];
  const tipo = tipos.find((t) => t !== 'null');
  let base;
  if (tipo === 'string') base = s.enum ? s.enum.map((v) => JSON.stringify(v)).join(' | ') : 'string';
  else if (tipo === 'integer' || tipo === 'number') base = 'number';
  else if (tipo === 'boolean') base = 'boolean';
  else if (tipo === 'array') base = `readonly ${entreParentesis(tipoTs(s.items))}[]`;
  else base = `{ ${propiedades(s).join(' ')} }`;
  return tipos.includes('null') ? `${base} | null` : base;
}

function declaracion(nombre, s) {
  if (nombre === RECHAZO) return declaracionDelRechazo(s);
  if (s.type === 'object') return [`export interface ${nombre} {`, ...propiedades(s).map((l) => `  ${l}`), '}'].join('\n');
  return `export type ${nombre} = ${tipoTs(s)};`;
}

/**
 * `Rechazo` con `title` ensanchado a `string`. El documento del orquestador lo declara como su
 * enum (`RejectionKind`), y eso es verdad DEL ORQUESTADOR; pero este fichero describe lo que el
 * navegador recibe por la PUERTA, y la puerta y el artefacto rechazan por su cuenta con la frase
 * HTTP de título («Unauthorized», «Not Found»): para 401, 405, 413, 415, 502 y 504 no hay
 * `RejectionKind` que poner. Un tipo que prometiera el enum dejaría compilar un `switch` por
 * `title` que falla en silencio con todo `puerta.*`. Se decide por `code` y `transient`.
 */
function declaracionDelRechazo(s) {
  const ancho = { ...s, properties: { ...s.properties, title: { type: 'string' } } };
  return [
    '/**',
    ' * Un rechazo, venga del orquestador o de la puerta. Se decide por `code` y `transient`: `title`',
    ' * es texto libre, porque la puerta y el artefacto ponen la frase HTTP («Unauthorized»).',
    ' */',
    `export interface ${RECHAZO} {`,
    ...propiedades(ancho).map((l) => `  ${l}`),
    '}',
  ].join('\n');
}

function llaveDe(op) {
  const p = (op.parameters ?? []).find((x) => x.in === 'header' && x.name === LLAVE);
  if (!p) return 'ninguna';
  return p.required === true ? 'requerida' : 'opcional';
}

/** Lo que el navegador manda en la consulta de la puerta: los parámetros de ruta y de consulta. */
function consultaDe(op) {
  const enConsulta = (op.parameters ?? []).filter((p) => p.in === 'path' || p.in === 'query');
  if (enConsulta.length === 0) return 'undefined';
  return `{ ${enConsulta
    .map((p) => `readonly ${clave(p.name)}${p.in === 'path' || p.required === true ? '' : '?'}: ${tipoTs(p.schema)};`)
    .join(' ')} }`;
}

/** Las operaciones marcadas, una por flujo y nombre en la puerta. */
function operacionesDeLaPuerta(doc) {
  const salida = [];
  for (const item of Object.values(doc.paths)) {
    for (const [metodo, op] of Object.entries(item)) {
      const marca = op[MARCA_DEL_FLUJO];
      if (marca === undefined) continue;
      const exito = Object.entries(op.responses).find(([c]) => /^2\d\d$/.test(c))[1];
      salida.push({
        flujo: marca.flujo,
        nombre: marca.operacion,
        metodo: metodo.toUpperCase(),
        consulta: consultaDe(op),
        nombresDeConsulta: (op.parameters ?? []).filter((p) => p.in === 'path' || p.in === 'query').map((p) => p.name),
        cuerpo: op.requestBody ? op.requestBody.content[JSON_].schema : undefined,
        respuesta: exito.content[JSON_].schema,
        parametros: (op.parameters ?? []).filter((p) => p.in === 'path' || p.in === 'query'),
        llave: llaveDe(op),
      });
    }
  }
  return salida.sort((a, b) => ordinal(a.flujo, b.flujo) || ordinal(a.nombre, b.nombre));
}

/** Los esquemas que alcanzan las operaciones marcadas, por $ref y de forma transitiva, más `Rechazo`. */
function esquemasAlcanzados(esquemas, operaciones) {
  const vistos = new Set([RECHAZO]);
  const pendientes = [esquemas[RECHAZO]];
  for (const o of operaciones) pendientes.push(o.cuerpo, o.respuesta, ...o.parametros.map((p) => p.schema));
  while (pendientes.length > 0) {
    const s = pendientes.pop();
    if (!esObjeto(s)) continue;
    const nombre = typeof s.$ref === 'string' ? s.$ref.match(REF_A_ESQUEMA)?.[1] : undefined;
    if (nombre !== undefined) {
      if (!vistos.has(nombre)) {
        vistos.add(nombre);
        pendientes.push(esquemas[nombre]);
      }
      continue;
    }
    for (const a of s.oneOf ?? []) pendientes.push(a);
    if (s.items !== undefined) pendientes.push(s.items);
    for (const ps of Object.values(s.properties ?? {})) pendientes.push(ps);
  }
  return vistos;
}

/**
 * El fichero TS de un documento. Determinista y en LF: el mismo JSON da el mismo texto, así que
 * `--check` puede comparar por igualdad. Los tipos y las operaciones salen en orden ordinal (no
 * el del documento, ni el del sistema: `localeCompare` cambia con la cultura); las propiedades,
 * en el del record, que es el que tiene sentido leer.
 *
 * @param {any} doc un documento que pasó `validarDocumento`.
 * @param {string} fichero su nombre en `openapi/`, para la cabecera.
 * @returns {string}
 */
export function generarTs(doc, fichero) {
  const esquemas = doc.components.schemas;
  const bloques = [
    [
      `// ─── El contrato HTTP de ${fichero.replace(/\.json$/, '')} por la puerta (ADR 0140, F3) ───`,
      '// GENERADO por tools/contrato-http.mjs desde el repo del CMS:',
      `//   ${[...RUTA_EN_CMS, fichero].join('/')}`,
      '// que a su vez GENERA `ContratoOpenApiTests` desde el host real del orquestador.',
      '// NO se edita a mano. Regenerar: `node tools/contrato-http.mjs` · comprobar: `--check`.',
      '//',
      '// Sólo lo que el navegador manda y recibe por la puerta (GET|POST /api/flujos/{flujo}/{operacion}):',
      `// las operaciones que el orquestador marca con ${MARCA_DEL_FLUJO}, por su nombre en la puerta, y los`,
      `// esquemas que alcanzan. Lo que pone la puerta no sale. Junto al mapa va ${TABLA_DE_EJECUCION},`,
      '// lo que el cliente necesita en ejecución; quién lo importa, y qué rompe un renombre, lo dice la',
      '// regla 24 de CLAUDE.md.',
    ].join('\n'),
  ];

  const operaciones = operacionesDeLaPuerta(doc);
  const alcanzados = esquemasAlcanzados(esquemas, operaciones);
  for (const nombre of Object.keys(esquemas).filter((n) => alcanzados.has(n)).sort(ordinal)) {
    bloques.push(declaracion(nombre, esquemas[nombre]));
  }

  const flujos = [...new Set(operaciones.map((o) => o.flujo))];
  bloques.push(
    [
      '/**',
      ' * Una operación por la puerta: con qué método, qué va en la consulta (los parámetros de ruta del',
      ' * orquestador viajan ahí, con su nombre), el cuerpo que se manda (`undefined` si no lleva), lo',
      ` * que vuelve con éxito y si pide la cabecera ${LLAVE}. Los rechazos vuelven como \`${RECHAZO}\`:`,
      ' * los del orquestador con su `code`, los de la puerta con `puerta.*`.',
      ' */',
      'export interface OperacionDeLaPuerta<TMetodo extends "GET" | "POST", TConsulta, TCuerpo, TRespuesta, TLlave extends "requerida" | "opcional" | "ninguna"> {',
      '  readonly metodo: TMetodo;',
      '  readonly consulta: TConsulta;',
      '  readonly cuerpo: TCuerpo;',
      '  readonly respuesta: TRespuesta;',
      '  readonly llave: TLlave;',
      '}',
      '',
      ...(flujos.length === 0
        ? [
            `/** Lo que la puerta expone de este orquestador: nada todavía, ninguna operación lleva ${MARCA_DEL_FLUJO}. */`,
            'export interface OperacionesDeLaPuerta {}',
          ]
        : [
            '/** Lo que la puerta expone de este orquestador: por flujo, y por su nombre en la puerta. */',
            'export interface OperacionesDeLaPuerta {',
            ...flujos.flatMap((f) => [
              `  readonly ${JSON.stringify(f)}: {`,
              ...operaciones
                .filter((o) => o.flujo === f)
                .map(
                  (o) =>
                    `    readonly ${o.nombre}: OperacionDeLaPuerta<${JSON.stringify(o.metodo)}, ${o.consulta}, ${
                      o.cuerpo === undefined ? 'undefined' : tipoTs(o.cuerpo)
                    }, ${tipoTs(o.respuesta)}, ${JSON.stringify(o.llave)}>;`,
                ),
              '  };',
            ]),
            '}',
          ]),
    ].join('\n'),
  );

  bloques.push(tablaDeEjecucion(operaciones, flujos));

  return bloques.join('\n\n') + '\n';
}

/**
 * La tabla de ejecución: método, llave y nombres de la consulta de cada operación marcada.
 *
 * El mapa de arriba son sólo tipos, y en ejecución el cliente no puede saber con qué método ir
 * —cerrar y cancelar son POST sin cuerpo— ni qué nombres codificar. Escribirla a mano en el
 * cliente sería una segunda copia del documento (regla 23), y una operación que gana un parámetro
 * de consulta quedaría en verde (medido en el plan de la F4). Sale de acá, del mismo documento, y
 * el tipo auxiliar hace que `satisfies` la cruce con el mapa: un renombre en uno sin el otro no
 * compila.
 */
function tablaDeEjecucion(operaciones, flujos) {
  const filas = flujos.flatMap((f) => [
    `  ${JSON.stringify(f)}: {`,
    ...operaciones
      .filter((o) => o.flujo === f)
      .map(
        (o) =>
          `    ${o.nombre}: { metodo: ${JSON.stringify(o.metodo)}, llave: ${JSON.stringify(o.llave)}, consulta: [${o.nombresDeConsulta
            .map((n) => JSON.stringify(n))
            .join(', ')}] },`,
      ),
    '  },',
  ]);
  return [
    '/**',
    ' * La forma en ejecución de cada operación del mapa: el método, la llave y los nombres que viajan',
    ' * en la consulta (ninguno si la operación no la lleva).',
    ' */',
    'export type TablaDeLaPuerta<TOperaciones> = {',
    '  readonly [F in keyof TOperaciones]: {',
    '    readonly [O in keyof TOperaciones[F]]: TOperaciones[F][O] extends OperacionDeLaPuerta<"GET" | "POST", unknown, unknown, unknown, "requerida" | "opcional" | "ninguna">',
    '      ? {',
    '          readonly metodo: TOperaciones[F][O]["metodo"];',
    '          readonly llave: TOperaciones[F][O]["llave"];',
    '          readonly consulta: TOperaciones[F][O]["consulta"] extends undefined ? readonly never[] : readonly (keyof TOperaciones[F][O]["consulta"] & string)[];',
    '        }',
    '      : never;',
    '  };',
    '};',
    '',
    '/**',
    ' * Lo que el cliente necesita en EJECUCIÓN y el mapa no le puede dar (son sólo tipos): con qué',
    ' * método va cada operación, si pide la llave y qué nombres codifica en la consulta. Sale del',
    ' * mismo documento que el mapa, y `satisfies` los cruza.',
    ' */',
    filas.length === 0
      ? `export const ${TABLA_DE_EJECUCION} = {} as const satisfies TablaDeLaPuerta<OperacionesDeLaPuerta>;`
      : [`export const ${TABLA_DE_EJECUCION} = {`, ...filas, '} as const satisfies TablaDeLaPuerta<OperacionesDeLaPuerta>;'].join('\n'),
  ].join('\n');
}

/**
 * El índice de la carpeta generada. Cada orquestador va en su espacio de nombres porque cada
 * documento trae sus propios esquemas (`MoneyDto`, `Rechazo`…): con `export *` el segundo
 * orquestador chocaría con el primero y `tsc` lo rechazaría por ambigüedad.
 *
 * Y, desde el núcleo N1, la UNIÓN de lo que la puerta expone de todos ellos: el mapa
 * (`OperacionesDeLaPuerta`, la intersección de los mapas de cada uno) y la tabla de ejecución
 * (`OPERACIONES_DE_LA_PUERTA`, sus filas juntas). El cliente de la puerta la usa y deja de nombrar a
 * un orquestador: un segundo flujo en otro orquestador entra al regenerar, sin tocar el cliente. Un
 * flujo vive en UN orquestador (lo exige la tabla de la puerta del CMS y lo comprueba
 * `planDeFicheros`), así que las claves de los mapas no se pisan.
 *
 * @param {readonly string[]} documentos los `Synergos.Bff.*.json`, ya en orden.
 * @returns {string}
 */
export function generarIndice(documentos) {
  const piezas = documentos.map((f) => {
    const { fichero, espacio } = nombresDe(f);
    return { espacio, local: `$${espacio}`, modulo: `./${fichero.replace(/\.ts$/, '')}` };
  });
  return [
    '// ─── Los contratos HTTP de los orquestadores (ADR 0140, F2) ───',
    '// GENERADO por tools/contrato-http.mjs: uno por cada `Synergos.Bff.*.json` del CMS, cada uno',
    '// en su espacio de nombres (cada documento trae sus propios esquemas). NO se edita a mano.',
    '',
    ...piezas.map((p) => `export * as ${p.espacio} from '${p.modulo}';`),
    '',
    ...piezas.map((p) => `import * as ${p.local} from '${p.modulo}';`),
    '',
    '/**',
    ' * Lo que la puerta expone de TODOS los orquestadores, por flujo y por su nombre en la puerta: la',
    ' * unión de sus mapas. Un flujo vive en un solo orquestador, así que las claves no se pisan.',
    ' */',
    `export type OperacionesDeLaPuerta = ${piezas.map((p) => `${p.local}.OperacionesDeLaPuerta`).join(' & ')};`,
    '',
    '/** La forma en ejecución de cada operación de un mapa (la misma en todos los documentos). */',
    `export type TablaDeLaPuerta<TOperaciones> = ${piezas[0].local}.TablaDeLaPuerta<TOperaciones>;`,
    '',
    '/** Las filas en ejecución de todos los orquestadores, juntas: lo que lee el cliente de la puerta. */',
    `export const ${TABLA_DE_EJECUCION} = {`,
    ...piezas.map((p) => `  ...${p.local}.${TABLA_DE_EJECUCION},`),
    '} as const satisfies TablaDeLaPuerta<OperacionesDeLaPuerta>;',
    '',
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// LOS ENVOLTORIOS DE LOS FLUJOS (núcleo N3, FR-030).
//
// Con el mapa y la tabla, `pedirAlFlujo` ya llama a cualquier flujo tipado; lo que un vertical
// escribía además era SU envoltorio —`eventos-compra.ts`—: la clave del flujo y una función por
// operación. Eso también sale del documento: un flujo nuevo aparece en el front con su envoltorio
// generado y ningún fichero de transporte escrito a mano (SC-006).
//
// Van en `vitals/core` y no junto a los tipos: llaman a `pedirAlFlujo`, que es del núcleo del
// front, y el paquete de contratos no depende de él. Son `export function` a propósito: el gate de
// los participantes (`coordinador-de-los-participantes.mjs`) deriva de ellas quién habla con el
// coordinador, y un objeto de flechas no lo vería.
// ─────────────────────────────────────────────────────────────────────────────

/** Dónde se escriben los envoltorios, dentro de este repo. La carpeta es ENTERA generada. */
export const RUTA_DE_LOS_ENVOLTORIOS = ['vitals', 'core', 'src', 'flujos', 'generados'];

/**
 * `salud.cita-previa` → el fichero `salud.cita-previa.ts`, la constante `FLUJO_SALUD_CITA_PREVIA` y la
 * pieza de sus funciones, `SaludCitaPrevia` (`abrirSaludCitaPrevia`).
 *
 * @param {string} flujo una clave de flujo válida.
 * @returns {{ fichero: string, constante: string, pieza: string }}
 */
export function nombresDelFlujo(flujo) {
  const partes = flujo.split(/[.-]/).filter((p) => p.length > 0);
  return {
    fichero: `${flujo}.ts`,
    constante: `FLUJO_${partes.map((p) => p.toUpperCase()).join('_')}`,
    pieza: partes.map((p) => p[0].toUpperCase() + p.slice(1)).join(''),
  };
}

/**
 * El envoltorio de un flujo: su clave y una función por operación marcada, cada una `pedirAlFlujo`
 * con la clave y la operación puestas y sus argumentos tipados por el contrato generado.
 *
 * @param {string} flujo la clave.
 * @param {ReadonlyArray<{ nombre: string, metodo: string, consulta: string, cuerpo: unknown, llave: string }>} operaciones
 *   las del flujo, ya en orden.
 * @param {string} documento el `Synergos.Bff.*.json` que lo marca, para la cabecera.
 * @returns {string}
 */
export function generarEnvoltorio(flujo, operaciones, documento) {
  const { constante, pieza } = nombresDelFlujo(flujo);
  return [
    `// ─── El flujo ${flujo} por la puerta (núcleo N3) ───`,
    `// GENERADO por tools/contrato-http.mjs desde ${documento} (repo del CMS). NO se edita a mano.`,
    '// Una función por operación que el orquestador marca: `pedirAlFlujo` con la clave y la operación',
    '// puestas, y sus argumentos y su respuesta tipados por el contrato generado.',
    '',
    "import { pedirAlFlujo, type OpcionesDePedido } from '../coordinador';",
    "import type { ArgsDe, OperacionesDeLaPuerta, RespuestaDe } from '../puerta';",
    "import type { ResultadoDelFlujo } from '../transporte';",
    '',
    '/** La clave del flujo, como la marca su orquestador. */',
    `export const ${constante} = ${JSON.stringify(flujo)};`,
    '',
    `type Operaciones = OperacionesDeLaPuerta[typeof ${constante}];`,
    ...operaciones.flatMap((o) => [
      '',
      `/** \`${o.nombre}\`: ${o.metodo}${o.consulta === 'undefined' ? '' : ' con consulta'}${
        o.cuerpo === undefined ? '' : ' con cuerpo'
      }; llave ${o.llave}. */`,
      `export function ${o.nombre}${pieza}(`,
      '  desde: Element,',
      `  args: ArgsDe<Operaciones[${JSON.stringify(o.nombre)}]>,`,
      '  opciones?: OpcionesDePedido,',
      `): Promise<ResultadoDelFlujo<RespuestaDe<Operaciones[${JSON.stringify(o.nombre)}]>>> {`,
      `  return pedirAlFlujo(desde, ${constante}, ${JSON.stringify(o.nombre)}, args, opciones);`,
      '}',
    ]),
    '',
  ].join('\n');
}

/**
 * El índice de los envoltorios: uno por flujo publicado, sin espacio de nombres (las claves no se
 * pisan, y si dos dieran la misma pieza `planDeFicheros` no genera).
 *
 * @param {readonly string[]} flujos las claves, ya en orden.
 * @returns {string}
 */
export function generarIndiceDeEnvoltorios(flujos) {
  return [
    '// ─── Los envoltorios de los flujos que expone la puerta (núcleo N3) ───',
    '// GENERADO por tools/contrato-http.mjs: uno por cada flujo marcado en los `Synergos.Bff.*.json`',
    '// del CMS, y la tabla de sus avisos. NO se edita a mano.',
    '',
    `export * from './${AVISOS.replace(/\.ts$/, '')}';`,
    ...flujos.map((f) => `export * from './${nombresDelFlujo(f).fichero.replace(/\.ts$/, '')}';`),
    '',
  ].join('\n');
}

/** La tabla de los avisos, junto a los envoltorios (núcleo N3, FR-032): sale del `appsettings.json` del CMS. */
export const AVISOS = 'avisos.ts';

/**
 * Los envoltorios de todos los documentos válidos, con su índice y la tabla de avisos; o los errores si
 * dos flujos darían el mismo nombre (sus funciones chocarían en `vitals-core`) o una ruta de aviso no
 * dice qué parámetro lee el participante.
 *
 * @param {ReadonlyMap<string, any>} documentos fichero → documento ya validado.
 * @param {ReadonlyMap<string, string>} avisos flujo → ruta del aviso, del `appsettings.json` del CMS.
 * @returns {{ errores: string[], ficheros: Map<string, string> }}
 */
function planDeEnvoltorios(documentos, avisos) {
  const plan = planDeEnvoltoriosDeLosFlujos(documentos);
  const tabla = generarAvisos(avisos);
  if (plan.errores.length > 0 || tabla.errores.length > 0) {
    return { errores: [...plan.errores, ...tabla.errores], ficheros: new Map() };
  }
  plan.ficheros.set(AVISOS, tabla.texto);
  return { errores: [], ficheros: new Map([...plan.ficheros].sort(([a], [b]) => ordinal(a, b))) };
}

/** Los envoltorios de los flujos, con su índice; o el error si dos darían el mismo nombre. */
function planDeEnvoltoriosDeLosFlujos(documentos) {
  const flujos = new Map();
  for (const [f, doc] of documentos) {
    for (const o of operacionesDeLaPuerta(doc)) {
      const actual = flujos.get(o.flujo) ?? { documento: f, operaciones: [] };
      actual.operaciones.push(o);
      flujos.set(o.flujo, actual);
    }
  }

  const porPieza = new Map();
  for (const flujo of flujos.keys()) {
    const { pieza } = nombresDelFlujo(flujo);
    porPieza.set(pieza, [...(porPieza.get(pieza) ?? []), flujo]);
  }
  const errores = [...porPieza]
    .filter(([, fs]) => fs.length > 1)
    .map(([pieza, fs]) => `los flujos ${fs.map((f) => `«${f}»`).join(' y ')} darían el mismo envoltorio (${pieza}): sus funciones chocarían`);
  if (errores.length > 0) return { errores, ficheros: new Map() };

  const claves = [...flujos.keys()].sort(ordinal);
  const ficheros = new Map(
    claves.map((flujo) => {
      const { documento, operaciones } = flujos.get(flujo);
      return [nombresDelFlujo(flujo).fichero, generarEnvoltorio(flujo, operaciones, documento)];
    }),
  );
  ficheros.set(INDICE, generarIndiceDeEnvoltorios(claves));
  return { errores: [], ficheros: new Map([...ficheros].sort(([a], [b]) => ordinal(a, b))) };
}

/**
 * Los flujos que marca cada documento: un flujo marcado por dos orquestadores es un error (la puerta
 * del CMS no arranca con él, y la unión del índice pisaría uno con otro).
 *
 * @param {ReadonlyMap<string, any>} documentos fichero → documento ya validado.
 * @returns {string[]}
 */
function flujosRepetidos(documentos) {
  const duenos = new Map();
  for (const [f, doc] of documentos) {
    for (const flujo of new Set(operacionesDeLaPuerta(doc).map((o) => o.flujo))) {
      duenos.set(flujo, [...(duenos.get(flujo) ?? []), f]);
    }
  }
  return [...duenos]
    .filter(([, fs]) => fs.length > 1)
    .map(([flujo, fs]) => `el flujo «${flujo}» lo marcan dos orquestadores (${fs.join(', ')}): un flujo vive en uno solo`);
}

/**
 * Lo que la carpeta generada tiene que contener, a partir de lo que hay en `openapi/`.
 *
 * Sólo LEE los documentos de los orquestadores: los de las capacidades no llegan ni a abrirse,
 * así que un `Synergos.Api.*` roto no puede tumbar ni colar nada acá.
 *
 * Y lo que tiene que contener la de los envoltorios (`envoltorios`, en `RUTA_DE_LOS_ENVOLTORIOS`), con
 * la tabla de los avisos derivada de `avisos`.
 *
 * @param {readonly string[]} ficheros los nombres que hay en `openapi/`.
 * @param {(fichero: string) => any} leer devuelve el documento ya parseado.
 * @param {ReadonlyMap<string, string>} [avisos] flujo → ruta del aviso, del `appsettings.json` del CMS.
 * @returns {{ errores: string[], ficheros: Map<string, string>, envoltorios: Map<string, string> }}
 */
export function planDeFicheros(ficheros, leer, avisos = new Map()) {
  const documentos = ficheros.filter(esDocumentoDelFlujo).sort(ordinal);
  if (documentos.length === 0) {
    return {
      errores: ['no hay ningún Synergos.Bff.*.json en openapi/: un --check sin documentos saldría en verde sin comprobar nada'],
      ficheros: new Map(),
      envoltorios: new Map(),
    };
  }

  const errores = [];
  const salida = new Map();
  const validos = new Map();
  for (const f of documentos) {
    const doc = leer(f);
    const propios = validarDocumento(doc);
    if (propios.length > 0) errores.push(...propios.map((e) => `${f}: ${e}`));
    else {
      validos.set(f, doc);
      salida.set(nombresDe(f).fichero, generarTs(doc, f));
    }
  }
  errores.push(...flujosRepetidos(validos));
  if (errores.length > 0) return { errores, ficheros: new Map(), envoltorios: new Map() };

  const envoltorios = planDeEnvoltorios(validos, avisos);
  if (envoltorios.errores.length > 0) return { errores: envoltorios.errores, ficheros: new Map(), envoltorios: new Map() };

  salida.set(INDICE, generarIndice(documentos));
  return {
    errores: [],
    ficheros: new Map([...salida].sort(([a], [b]) => ordinal(a, b))),
    envoltorios: envoltorios.ficheros,
  };
}

/**
 * Lo que separa la carpeta en disco de la que da el contrato de hoy, en las dos direcciones: un
 * fichero que falta, uno que no es el que da su documento (editado a mano o viejo) y uno que
 * sobra (su orquestador ya no publica). El CRLF de un checkout de Windows no cuenta como
 * diferencia: el contrato es el texto, no el fin de línea.
 *
 * @param {Map<string, string>} esperados
 * @param {Map<string, string>} enDisco
 * @returns {string[]}
 */
export function diferencias(esperados, enDisco) {
  const d = [];
  for (const [f, texto] of esperados) {
    if (!enDisco.has(f)) d.push(`${f}: falta`);
    else if (enDisco.get(f).replaceAll('\r\n', '\n') !== texto) d.push(`${f}: no está al día con el contrato del CMS`);
  }
  for (const f of enDisco.keys()) {
    if (!esperados.has(f)) d.push(`${f}: sobra — no sale de ningún Synergos.Bff.*.json`);
  }
  return d;
}
