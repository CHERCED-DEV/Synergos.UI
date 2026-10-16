/**
 * tools/lib/avisos-de-los-flujos.mjs
 *
 * El enlace del aviso de un flujo lo escribe el CMS y lo lee el participante: que los dos digan el
 * mismo parámetro (ADR 0140 F4, CMS#201).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * El CMS manda en el correo `Synergos:Puerta:Flujos:{flujo}:Aviso:Ruta` (hoy `/eventos/?compra={id}`),
 * y `<synergos-eventos>` abre la compra leyendo `?compra=`. Eran dos literales que nadie cruzaba:
 * `ValidadorDeLaPuerta` sólo exige una ruta del sitio y marcadores que existan, así que un
 * `/?id={id}` o un `/compras/{id}` arrancaba, y el enlace abría la cartelera sin una petición ni un
 * aviso —el spec «sin el parámetro, no se le pide nada al artefacto» confirma que ese caso calla—.
 * Es el mismo argumento con el que `CoordinadorDelFlujoEnLasVistasTests` del CMS cruza el
 * `flujo="…"` de las vistas.
 *
 * La tabla del lado UI es `AVISOS_DE_LOS_FLUJOS` (`vitals/core/src/flujos/avisos.ts`), que el
 * participante usa para leer; la del CMS, su `appsettings.json`. Se cruzan en los dos sentidos.
 *
 * DESDE EL NÚCLEO N3 (FR-032) la tabla del UI se DERIVA de la del CMS: `contrato-http.mjs` emite
 * `vitals/core/src/flujos/generados/avisos.ts` (`AVISOS_GENERADOS`) con el parámetro y el marcador de
 * cada ruta (`derivarAviso`), y un flujo nuevo no toca `avisos.ts`. La tabla a mano queda declarada,
 * para quien ya la lee, y este gate cruza las dos: el CMS con la generada, y la a mano con la generada.
 *
 * Lo que NO mira, dicho: los `appsettings.<Entorno>.json` ni las variables de entorno que
 * sobrescriban la ruta en un despliegue. La base es lo que reciben todos los entornos.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from 'node:fs';

const MARCADOR = /^\{([^{}]+)\}$/;

/**
 * El aviso que dice una ruta: el ÚNICO parámetro de su consulta cuyo valor es un marcador
 * (`/eventos/?compra={id}` → `{ parametro: 'compra', marcador: 'id' }`). `null` si no hay ninguno o
 * hay más de uno: el participante no sabría cuál leer, y adivinar es el defecto que G-15 existe para
 * cazar.
 *
 * @param {string} ruta
 * @returns {{ parametro: string, marcador: string } | null}
 */
export function derivarAviso(ruta) {
  const conMarcador = [...leerRutaDelAviso(ruta).consulta].filter(([, v]) => MARCADOR.test(v));
  if (conMarcador.length !== 1) return null;
  const [parametro, valor] = conMarcador[0];
  return { parametro, marcador: valor.match(MARCADOR)[1] };
}

/**
 * `vitals/core/src/flujos/generados/avisos.ts`: la tabla del UI derivada de las rutas del CMS. Los
 * flujos en orden ordinal; una ruta de la que no se deriva un aviso es un error, no una fila menos.
 *
 * @param {ReadonlyMap<string, string>} cms flujo → ruta, de `avisosDelCms`.
 * @returns {{ errores: string[], texto: string }}
 */
export function generarAvisos(cms) {
  const errores = [];
  const filas = [];
  for (const flujo of [...cms.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const aviso = derivarAviso(cms.get(flujo));
    if (!aviso) {
      errores.push(
        `${flujo}: la ruta del aviso «${cms.get(flujo)}» no trae UN parámetro con un marcador ({…}) en la consulta: el participante no sabría qué leer.`,
      );
      continue;
    }
    filas.push(`  ${JSON.stringify(flujo)}: { parametro: ${JSON.stringify(aviso.parametro)}, marcador: ${JSON.stringify(aviso.marcador)} },`);
  }
  const texto = [
    '// ─── Los enlaces de aviso de los flujos (núcleo N3, FR-032) ───',
    '// GENERADO por tools/contrato-http.mjs desde Synergos.CMS.Web/appsettings.json del CMS',
    '// (Synergos:Puerta:Flujos:{flujo}:Aviso:Ruta). NO se edita a mano.',
    '// Con qué parámetro de la consulta llega a la página el enlace del correo, y qué marcador lo llena.',
    '',
    "import type { AvisoDelFlujo } from '../avisos';",
    "import type { Flujo } from '../puerta';",
    '',
    filas.length === 0
      ? 'export const AVISOS_GENERADOS = {} as const satisfies Readonly<Partial<Record<Flujo, AvisoDelFlujo>>>;'
      : ['export const AVISOS_GENERADOS = {', ...filas, '} as const satisfies Readonly<Partial<Record<Flujo, AvisoDelFlujo>>>;'].join('\n'),
    '',
  ].join('\n');
  return { errores, texto };
}

/**
 * La tabla a mano contra la generada: cada aviso declarado a mano dice lo mismo que el derivado del CMS.
 *
 * @param {{ generados: Readonly<Record<string, { parametro: string, marcador: string }>>, declarados: Readonly<Record<string, { parametro: string, marcador: string }>> }} entrada
 */
export function cruzarDeclarados({ generados, declarados }) {
  const errores = [];
  for (const [flujo, lee] of Object.entries(declarados)) {
    const derivado = generados[flujo];
    if (!derivado) {
      errores.push(`${flujo}: AVISOS_DE_LOS_FLUJOS lo declara y no sale de ninguna ruta del CMS (AVISOS_GENERADOS).`);
    } else if (derivado.parametro !== lee.parametro || derivado.marcador !== lee.marcador) {
      errores.push(
        `${flujo}: AVISOS_DE_LOS_FLUJOS dice ?${lee.parametro}={${lee.marcador}} y el CMS, ?${derivado.parametro}={${derivado.marcador}}.`,
      );
    }
  }
  return errores;
}

/** El camino y la consulta de una ruta de aviso relativa al sitio (`/eventos/?compra={id}`). */
export function leerRutaDelAviso(ruta) {
  const url = new URL(ruta, 'http://sitio.invalid');
  return {
    camino: decodeURIComponent(url.pathname),
    consulta: new Map([...url.searchParams.entries()]),
  };
}

/** Las rutas de aviso que declara el `appsettings.json` del CMS: `Map<flujo, ruta>`. */
export function avisosDelCms(appsettings) {
  const flujos = appsettings?.Synergos?.Puerta?.Flujos ?? {};
  const avisos = new Map();
  for (const [flujo, config] of Object.entries(flujos)) {
    const ruta = config?.Aviso?.Ruta;
    if (typeof ruta === 'string' && ruta.trim() !== '') avisos.set(flujo, ruta.trim());
  }
  return avisos;
}

/**
 * Cruza las dos tablas. Devuelve los desacuerdos, cada uno con su flujo.
 *
 * @param {{ cms: Map<string, string>, ui: Readonly<Record<string, { parametro: string, marcador: string }>> }} entrada
 */
export function cruzarAvisos({ cms, ui }) {
  const errores = [];
  for (const [flujo, ruta] of cms) {
    const lee = ui[flujo];
    if (!lee) {
      errores.push(`${flujo}: el CMS manda el enlace «${ruta}» y la tabla del UI no dice qué parámetro lee (regenerar con contrato-http).`);
      continue;
    }
    const valor = leerRutaDelAviso(ruta).consulta.get(lee.parametro);
    if (valor !== `{${lee.marcador}}`) {
      errores.push(`${flujo}: el participante lee ?${lee.parametro}={${lee.marcador}} y la ruta del CMS es «${ruta}».`);
    }
  }
  for (const [flujo, lee] of Object.entries(ui)) {
    if (!cms.has(flujo)) {
      errores.push(`${flujo}: el participante lee ?${lee.parametro}= y el CMS no manda ningún enlace de aviso para ese flujo.`);
    }
  }
  return errores;
}

/**
 * Una tabla del UI tal como la compila el participante: el `.ts` transpilado e importado (sólo
 * importa TIPOS, que se borran).
 *
 * @param {string} fichero la ruta de `avisos.ts` (o de `generados/avisos.ts`)
 * @param {string} [nombre] la constante que se lee
 */
export async function avisosDelUi(fichero, nombre = 'AVISOS_DE_LOS_FLUJOS') {
  // Perezoso: `contrato-http.mjs` usa este módulo para GENERAR, y no necesita el compilador.
  const ts = (await import('typescript')).default;
  const js = ts.transpileModule(readFileSync(fichero, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const modulo = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  return modulo[nombre];
}
