/**
 * El contrato HTTP de los orquestadores, en tipos TypeScript (ADR 0140, F2 · CMS#201).
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
 *     ──tsc──▶ quien lo importe (nadie hasta la F4: ver abajo)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ SÓLO `Synergos.Bff.*`, Y POR QUÉ SIN RUTAS.
 *
 * El front conoce el contrato del FLUJO, no el de las capacidades (ADR 0140 §3): los
 * `Synergos.Api.*` los lee el orquestador, y su compatibilidad la cruza el CMS
 * (`ContratoConsumidorEventosTests`). Y el navegador no habla con las rutas del BFF sino con la
 * puerta, por operación (§6): por eso sale un mapa de tipos por operationId —qué cuerpo se
 * manda, qué vuelve con éxito, si pide Idempotency-Key— y no las rutas. Cómo se nombra cada
 * operación en la puerta lo decide la F3; los parámetros de ruta y de consulta viajan con la
 * ruta, así que tampoco salen (se validan igual: el día que salgan no habrá sorpresas).
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
 * QUIÉN LO IMPORTA: NADIE, HASTA LA F4.
 *
 * El cliente que lo usa llama a la puerta, y la puerta llega en la F3. La regla 24 de CLAUDE.md
 * («un contrato que no importa nadie es un comentario con sintaxis») queda abierta con fecha: en
 * la F4 el cliente de `vitals/core` lo importa y un renombre rompe `tsc`, con su mutante. Hasta
 * entonces lo que sí está vigilado es que el tipo versionado sea el que da el documento de HOY.
 *
 * Como en `contrato-synhost.mjs`, el cruce con el CMS no está en `npm test` (que corre sin
 * hermano): está en `contracts:validate` y en `design-gates-ui.yml` (G-14), y sin el CMS
 * RECHAZA. Lo que corre en `npm test` es esta lógica, en `contrato-http.spec.mjs`.
 */

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
const CLAVES_DE_OPERACION = new Set(['operationId', 'parameters', 'requestBody', 'responses']);
const CLAVES_DE_PARAMETRO = new Set(['name', 'in', 'required', 'schema']);
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
const RESERVADOS = new Set(['Operaciones', 'OperacionHttp']);

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
    if (!UBICACIONES.has(p.in)) {
      errores.push(`${quien}: parámetro «${p.name}» en «${p.in}» sin traducción`);
    } else if (p.in === 'header' && p.name !== LLAVE) {
      // El mapa sólo sabe decir si la operación pide la llave; otra cabecera se perdería.
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
  if (s.type === 'object') return [`export interface ${nombre} {`, ...propiedades(s).map((l) => `  ${l}`), '}'].join('\n');
  return `export type ${nombre} = ${tipoTs(s)};`;
}

function llaveDe(op) {
  const p = (op.parameters ?? []).find((x) => x.in === 'header' && x.name === LLAVE);
  if (!p) return 'ninguna';
  return p.required === true ? 'requerida' : 'opcional';
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
      `// ─── El contrato HTTP de ${fichero.replace(/\.json$/, '')} (ADR 0140, F2) ───`,
      '// GENERADO por tools/contrato-http.mjs desde el repo del CMS:',
      `//   ${[...RUTA_EN_CMS, fichero].join('/')}`,
      '// que a su vez GENERA `ContratoOpenApiTests` desde el host real del orquestador.',
      '// NO se edita a mano. Regenerar: `node tools/contrato-http.mjs` · comprobar: `--check`.',
      '//',
      '// Son los TIPOS del flujo y no sus rutas: el navegador llama a la puerta por operación',
      '// (ADR 0140 §6), y cómo se nombra ahí cada una lo decide la F3. Hasta la F4 no lo',
      '// importa nadie: la regla 24 de CLAUDE.md queda abierta con fecha.',
    ].join('\n'),
  ];

  for (const nombre of Object.keys(esquemas).sort(ordinal)) bloques.push(declaracion(nombre, esquemas[nombre]));

  const operaciones = [];
  for (const item of Object.values(doc.paths)) {
    for (const op of Object.values(item)) {
      const exito = Object.entries(op.responses).find(([c]) => /^2\d\d$/.test(c))[1];
      operaciones.push({
        id: op.operationId,
        cuerpo: op.requestBody ? tipoTs(op.requestBody.content[JSON_].schema) : 'undefined',
        respuesta: tipoTs(exito.content[JSON_].schema),
        llave: llaveDe(op),
      });
    }
  }
  operaciones.sort((a, b) => ordinal(a.id, b.id));

  bloques.push(
    [
      '/**',
      ' * Una operación del flujo: el cuerpo que se manda (`undefined` si no lleva), lo que vuelve',
      ` * con éxito y si pide la cabecera ${LLAVE}. Los rechazos vuelven como \`${RECHAZO}\`.`,
      ' */',
      'export interface OperacionHttp<TCuerpo, TRespuesta, TLlave extends "requerida" | "opcional" | "ninguna"> {',
      '  readonly cuerpo: TCuerpo;',
      '  readonly respuesta: TRespuesta;',
      '  readonly llave: TLlave;',
      '}',
      '',
      '/** Las operaciones del orquestador, por su operationId. */',
      'export interface Operaciones {',
      ...operaciones.map((o) => `  readonly ${o.id}: OperacionHttp<${o.cuerpo}, ${o.respuesta}, ${JSON.stringify(o.llave)}>;`),
      '}',
    ].join('\n'),
  );

  return bloques.join('\n\n') + '\n';
}

/**
 * El índice de la carpeta generada. Cada orquestador va en su espacio de nombres porque cada
 * documento trae sus propios esquemas (`MoneyDto`, `Rechazo`…): con `export *` el segundo
 * orquestador chocaría con el primero y `tsc` lo rechazaría por ambigüedad.
 *
 * @param {readonly string[]} documentos los `Synergos.Bff.*.json`, ya en orden.
 * @returns {string}
 */
export function generarIndice(documentos) {
  return [
    '// ─── Los contratos HTTP de los orquestadores (ADR 0140, F2) ───',
    '// GENERADO por tools/contrato-http.mjs: uno por cada `Synergos.Bff.*.json` del CMS, cada uno',
    '// en su espacio de nombres (cada documento trae sus propios esquemas). NO se edita a mano.',
    '',
    ...documentos.map((f) => {
      const { fichero, espacio } = nombresDe(f);
      return `export * as ${espacio} from './${fichero.replace(/\.ts$/, '')}';`;
    }),
    '',
  ].join('\n');
}

/**
 * Lo que la carpeta generada tiene que contener, a partir de lo que hay en `openapi/`.
 *
 * Sólo LEE los documentos de los orquestadores: los de las capacidades no llegan ni a abrirse,
 * así que un `Synergos.Api.*` roto no puede tumbar ni colar nada acá.
 *
 * @param {readonly string[]} ficheros los nombres que hay en `openapi/`.
 * @param {(fichero: string) => any} leer devuelve el documento ya parseado.
 * @returns {{ errores: string[], ficheros: Map<string, string> }}
 */
export function planDeFicheros(ficheros, leer) {
  const documentos = ficheros.filter(esDocumentoDelFlujo).sort(ordinal);
  if (documentos.length === 0) {
    return {
      errores: ['no hay ningún Synergos.Bff.*.json en openapi/: un --check sin documentos saldría en verde sin comprobar nada'],
      ficheros: new Map(),
    };
  }

  const errores = [];
  const salida = new Map();
  for (const f of documentos) {
    const doc = leer(f);
    const propios = validarDocumento(doc);
    if (propios.length > 0) errores.push(...propios.map((e) => `${f}: ${e}`));
    else salida.set(nombresDe(f).fichero, generarTs(doc, f));
  }
  if (errores.length > 0) return { errores, ficheros: new Map() };

  salida.set(INDICE, generarIndice(documentos));
  return { errores: [], ficheros: new Map([...salida].sort(([a], [b]) => ordinal(a, b))) };
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
