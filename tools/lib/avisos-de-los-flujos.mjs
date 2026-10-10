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
 * Lo que NO mira, dicho: los `appsettings.<Entorno>.json` ni las variables de entorno que
 * sobrescriban la ruta en un despliegue. La base es lo que reciben todos los entornos.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from 'node:fs';
import ts from 'typescript';

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
      errores.push(`${flujo}: el CMS manda el enlace «${ruta}» y ningún participante declara qué parámetro lee (AVISOS_DE_LOS_FLUJOS).`);
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
 * La tabla del UI tal como la compila el participante: el `.ts` transpilado e importado (sólo
 * importa TIPOS, que se borran).
 *
 * @param {string} fichero la ruta de `avisos.ts`
 */
export async function avisosDelUi(fichero) {
  const js = ts.transpileModule(readFileSync(fichero, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const modulo = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  return modulo.AVISOS_DE_LOS_FLUJOS;
}
