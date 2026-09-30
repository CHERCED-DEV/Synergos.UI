/**
 * El contrato de lo que viaja a cada elemento con resolver tipado (ADR 0135 · CMS#173).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL DEFECTO QUE ESTO CIERRA (D1).
 *
 * Cada vista SynHost del CMS armaba a mano un diccionario libre de claves, y nada obligaba
 * a que fueran las que lee el elemento: 43 colocables tiraban al hidratar lo que el editor
 * escribió. `kpi-card` recibía `kpiLabel` y leía `label`; el SSR pintaba bien y el bundle
 * lo borraba. El tipo que decía describir ese `config` —`elements-syn.contract.ts`, de
 * `cms-sync`— sale del ElementType de uSync, no de lo que emite la vista, y mete las
 * pestañas como propiedades.
 *
 * La cadena nueva, de punta a punta:
 *
 *   record C# [ElementoSynHost] ──ContratoSynHostTests──▶ docs/contracts/elementos-synhost.json
 *     ──este generador──▶ vitals/contracts/src/elementos-synhost.contract.ts
 *     ──tsc──▶ el sanitizador del elemento, tipado con él (leer una clave que no viaja: TS2339)
 *     ──contrato-synhost.spec.ts──▶ el sanitizador EJECUTADO con el `config` exacto de la vista
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ C# → TS Y NO AL REVÉS, Y POR QUÉ UN JSON EN MEDIO.
 *
 * Quien LLENA el record es el resolver, que vive en el CMS; el nombre de cada clave lo sigue
 * eligiendo lo que el elemento lee (ADR 0083) y el record es donde queda escrito para que
 * lo comprueben los dos compiladores. El JSON en `docs/contracts/` es lo único que los dos
 * repos pueden leer sin clonarse el uno al otro: el CI del CMS no chequea este repo, así que
 * el gate C# vive allá contra el JSON, y éste vive acá contra el mismo JSON. Es el reparto
 * de `mortgage-vectors.json` (#76 · CMS#167).
 *
 * Y por lo mismo el cruce con el CMS NO está en `npm test` (que corre sin hermano): está en
 * `contracts:validate` y en `design-gates-ui.yml`, y sin el CMS RECHAZA. Lo que sí corre en
 * `npm test` es esta LÓGICA (`contrato-synhost.spec.mjs`) y el spec que ejecuta los
 * sanitizadores contra el fichero generado, que está versionado.
 */

/** Dónde vive el contrato, dentro del repo del CMS. */
export const RUTA_EN_CMS = ['Synergos.CMS.Web', 'docs', 'contracts', 'elementos-synhost.json'];

/** Dónde se escribe el tipo generado, dentro de este repo. */
export const RUTA_GENERADA = ['vitals', 'contracts', 'src', 'elementos-synhost.contract.ts'];

const PRIMITIVOS = new Set(['string', 'number', 'boolean']);
const ORIGENES = new Set(['contenido', 'decision']);
const TIPOS_DE_COLOCABLE = new Set(['pieza', 'funcionalidad']);
const IDENTIFICADOR = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NOMBRE_DE_REGISTRY = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** La clave que el emitter del CMS añade a TODO `config`, fuera del record. */
export const ENVOLTURA = 'culture';

/**
 * Los errores de forma del contrato, vacío si está bien.
 *
 * No es cosmético: el generador confía en esta forma, y un contrato vacío generaría un
 * fichero vacío que compila — cero elementos tipados, todo en verde. Por eso lo primero es
 * la red de seguridad por el vacío.
 *
 * @param {any} contrato lo que se leyó de `elementos-synhost.json`.
 * @returns {string[]}
 */
export function validarContrato(contrato) {
  const errores = [];
  const elementos = Array.isArray(contrato?.elementos) ? contrato.elementos : null;
  const tipos = Array.isArray(contrato?.tipos) ? contrato.tipos : null;

  if (!elementos || elementos.length === 0) {
    return ['el contrato no declara ningún elemento: un fichero vacío generaría tipos vacíos que compilan'];
  }
  if (!tipos) errores.push('el contrato no trae la lista `tipos` (aunque esté vacía)');

  const nombresDeTipo = new Set((tipos ?? []).map((t) => t?.record));
  const conocido = (tipo) => {
    if (typeof tipo !== 'string') return false;
    if (tipo.endsWith('[]')) return conocido(tipo.slice(0, -2));
    return PRIMITIVOS.has(tipo) || nombresDeTipo.has(tipo);
  };

  const revisarCampos = (duenio, campos, conOrigen) => {
    if (!Array.isArray(campos) || campos.length === 0) {
      errores.push(`${duenio}: no declara ningún campo`);
      return;
    }
    const vistos = new Set();
    for (const campo of campos) {
      if (!IDENTIFICADOR.test(campo?.nombre ?? '')) errores.push(`${duenio}: campo con nombre inválido «${campo?.nombre}»`);
      if (vistos.has(campo?.nombre)) errores.push(`${duenio}.${campo?.nombre}: repetido`);
      vistos.add(campo?.nombre);
      if (!conocido(campo?.tipo)) errores.push(`${duenio}.${campo?.nombre}: tipo «${campo?.tipo}» sin traducción`);
      if (typeof campo?.opcional !== 'boolean') errores.push(`${duenio}.${campo?.nombre}: sin \`opcional\``);
      if (conOrigen && !ORIGENES.has(campo?.origen)) {
        errores.push(`${duenio}.${campo?.nombre}: origen «${campo?.origen}» (tiene que ser contenido o decision)`);
      }
    }
  };

  const nombres = new Set();
  for (const e of elementos) {
    const quien = e?.nombre ?? '(sin nombre)';
    if (!NOMBRE_DE_REGISTRY.test(e?.nombre ?? '')) errores.push(`${quien}: no es un nombre de registry`);
    if (nombres.has(e?.nombre)) errores.push(`${quien}: repetido`);
    nombres.add(e?.nombre);
    if (!TIPOS_DE_COLOCABLE.has(e?.tipo)) errores.push(`${quien}: tipo de colocable «${e?.tipo}»`);
    if (!IDENTIFICADOR.test(e?.record ?? '')) errores.push(`${quien}: record «${e?.record}» no es un identificador`);
    if (!Array.isArray(e?.diccionario)) errores.push(`${quien}: sin lista \`diccionario\``);
    revisarCampos(quien, e?.campos, true);

    const ejemplo = e?.ejemplo;
    if (typeof ejemplo !== 'object' || ejemplo === null || Array.isArray(ejemplo)) {
      errores.push(`${quien}: sin \`ejemplo\` — sin él no se puede ejecutar su sanitizador contra lo que emite la vista`);
      continue;
    }
    if (typeof ejemplo[ENVOLTURA] !== 'string') errores.push(`${quien}: el ejemplo no trae \`${ENVOLTURA}\`, que el emitter añade siempre`);
    const declarados = new Set((e.campos ?? []).map((c) => c?.nombre));
    for (const clave of Object.keys(ejemplo)) {
      if (clave !== ENVOLTURA && !declarados.has(clave)) {
        errores.push(`${quien}: el ejemplo trae «${clave}», que el record no declara`);
      }
    }
  }

  for (const t of tipos ?? []) {
    if (!IDENTIFICADOR.test(t?.record ?? '')) errores.push(`tipo «${t?.record}»: no es un identificador`);
    revisarCampos(t?.record ?? '(sin nombre)', t?.campos, false);
  }

  return errores;
}

/**
 * Los elementos del contrato que el registry no conoce. La identidad de un elemento es el
 * `name` del registry: con uno que no existe el emitter no resuelve ningún bundle y el tag
 * queda sin hidratar, sin error.
 *
 * @param {any} contrato
 * @param {ReadonlyArray<{name: string}>} registry
 * @returns {string[]}
 */
export function cruzarConRegistry(contrato, registry) {
  const nombres = new Set(registry.map((e) => e.name));
  return (contrato.elementos ?? [])
    .filter((e) => !nombres.has(e.nombre))
    .map((e) => `${e.nombre}: no está en element-registry.json — el emitter no resolvería su bundle`);
}

/** `kpi-card` → `KPI_CARD_SYNHOST`. */
export function constanteDe(nombre) {
  return `${nombre.replaceAll('-', '_').toUpperCase()}_SYNHOST`;
}

function tipoTs(tipo) {
  if (tipo.endsWith('[]')) return `readonly ${tipoTs(tipo.slice(0, -2))}[]`;
  return tipo;
}

function interfaz(record, campos, cabecera) {
  const lineas = [`/** ${cabecera} */`, `export interface ${record} {`];
  for (const c of campos) {
    if (c.origen) lineas.push(`  /** ${c.origen} */`);
    lineas.push(`  readonly ${c.nombre}${c.opcional ? '?' : ''}: ${tipoTs(c.tipo)};`);
  }
  lineas.push('}');
  return lineas.join('\n');
}

function literal(valor, sangria) {
  return JSON.stringify(valor, null, 2).replaceAll('\n', `\n${sangria}`);
}

/**
 * El fichero TS del contrato. Determinista: el mismo JSON da el mismo texto, así que
 * `--check` puede comparar por igualdad.
 *
 * @param {any} contrato un contrato que pasó `validarContrato`.
 * @returns {string}
 */
export function generarTs(contrato) {
  const bloques = [
    [
      '// ─── Lo que viaja a cada elemento con resolver tipado (ADR 0135) ─────────────',
      '// GENERADO por tools/contrato-synhost.mjs desde el repo del CMS:',
      '//   Synergos.CMS.Web/docs/contracts/elementos-synhost.json',
      '// que a su vez GENERA `ContratoSynHostTests` de los records [ElementoSynHost].',
      '// NO se edita a mano. Regenerar: `node tools/contrato-synhost.mjs` · comprobar: `--check`.',
      '//',
      '// El sanitizador de cada elemento se tipa con su interfaz: leer una clave que el CMS',
      '// no manda NO COMPILA. Y `contrato-synhost.spec.ts` lo ejecuta con el `ejemplo`, que es',
      '// el `config` EXACTO que emite la vista: una clave que viaja y nadie lee se pone roja.',
    ].join('\n'),
    [
      `/** Lo que el emitter del CMS añade a TODO \`config\`, fuera del record: la cultura de la petición. */`,
      'export interface EnvolturaSynHost {',
      `  readonly ${ENVOLTURA}: string;`,
      '}',
      '',
      '/** Las claves de la envoltura: viajan siempre y no las declara ningún record. */',
      `export const CLAVES_DE_ENVOLTURA_SYNHOST: readonly (keyof EnvolturaSynHost)[] = [${JSON.stringify(ENVOLTURA)}];`,
    ].join('\n'),
    [
      '/** Un elemento con contrato: quién es, qué campos viajan y un `config` real de su vista. */',
      'export interface ElementoSynHost<T> {',
      '  readonly nombre: string;',
      "  readonly tipo: 'pieza' | 'funcionalidad';",
      '  readonly record: string;',
      '  readonly diccionario: readonly string[];',
      '  readonly campos: readonly (keyof T & string)[];',
      '  /** Por cada campo que es una lista de records, los campos de sus ítems. */',
      '  readonly listas: Readonly<Partial<Record<keyof T & string, readonly string[]>>>;',
      '  readonly ejemplo: T & EnvolturaSynHost;',
      '}',
    ].join('\n'),
  ];

  for (const t of contrato.tipos) {
    bloques.push(interfaz(t.record, t.campos, `Parte de un record de ${'`'}ElementoSynHost${'`'} (C#: ${t.record}).`));
  }

  for (const e of contrato.elementos) {
    const dicc = e.diccionario.length > 0 ? ` · diccionario: ${e.diccionario.join(', ')}` : '';
    bloques.push(interfaz(e.record, e.campos, `<synergos-${e.nombre}> · ${e.tipo}${dicc}`));
  }

  const camposDe = new Map(contrato.tipos.map((t) => [t.record, t.campos.map((c) => c.nombre)]));
  const listasDe = (e) =>
    Object.fromEntries(
      e.campos
        .filter((c) => c.tipo.endsWith('[]') && camposDe.has(c.tipo.slice(0, -2)))
        .map((c) => [c.nombre, camposDe.get(c.tipo.slice(0, -2))]),
    );

  for (const e of contrato.elementos) {
    bloques.push(
      [
        `export const ${constanteDe(e.nombre)}: ElementoSynHost<${e.record}> = {`,
        `  nombre: ${JSON.stringify(e.nombre)},`,
        `  tipo: ${JSON.stringify(e.tipo)},`,
        `  record: ${JSON.stringify(e.record)},`,
        `  diccionario: ${JSON.stringify(e.diccionario)},`,
        `  campos: ${JSON.stringify(e.campos.map((c) => c.nombre))},`,
        `  listas: ${JSON.stringify(listasDe(e))},`,
        `  ejemplo: ${literal(e.ejemplo, '  ')},`,
        '};',
      ].join('\n'),
    );
  }

  bloques.push(
    [
      '/** Todos los elementos con contrato. Un spec exige que cada uno tenga su sanitizador ejecutado. */',
      'export const ELEMENTOS_SYNHOST = [',
      ...contrato.elementos.map((e) => `  ${constanteDe(e.nombre)},`),
      '] as const;',
    ].join('\n'),
  );

  return bloques.join('\n\n') + '\n';
}
