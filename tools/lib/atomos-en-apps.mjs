/**
 * El detector de `gate:atomos` (014-despiece-tienda, T002; modelo Lego, M-1): los controles de formulario escritos a mano
 * en las plantillas de las apps de vertical. Una app compone los átomos del design system (`syn-button`, `syn-input`,
 * `syn-select`, `syn-textarea`…); un `<button>` a mano es un estilo propio que se separa de los siete temas.
 */

/** Las etiquetas que un átomo de `libs/shared` ya resuelve. */
export const CONTROLES = ['button', 'input', 'select', 'textarea'];

/** Sin comentarios: un `<button>` citado en un comentario no es un control. */
function sinComentariosHtml(plantilla) {
  return plantilla.replace(/<!--[\s\S]*?-->/g, '');
}

/** Las plantillas en línea de un componente (`template: \`…\``). */
function plantillasEnLinea(codigo) {
  return [...codigo.matchAll(/template:\s*`([\s\S]*?)`/g)].map((m) => m[1]);
}

/** Cuántos controles a mano hay en una plantilla, por etiqueta. */
export function controlesDeLaPlantilla(plantilla) {
  const limpia = sinComentariosHtml(plantilla);
  return Object.fromEntries(CONTROLES.map((c) => [c, (limpia.match(new RegExp(`<${c}(?=[\\s/>])`, 'g')) ?? []).length]));
}

/** Los ficheros que cuentan: plantillas y componentes, nunca sus pruebas. */
export function cuenta(ruta) {
  return /\.html$/.test(ruta) || (/\.ts$/.test(ruta) && !/\.spec\.ts$/.test(ruta));
}

/** Los controles a mano de una app, sumando sus plantillas (`.html`) y las plantillas en línea de sus `.ts`. */
export function controlesDeLaApp(fuentes) {
  const total = Object.fromEntries(CONTROLES.map((c) => [c, 0]));
  for (const { ruta, fuente } of fuentes) {
    if (!cuenta(ruta)) continue;
    const plantillas = ruta.endsWith('.html') ? [fuente] : plantillasEnLinea(fuente);
    for (const p of plantillas) {
      const n = controlesDeLaPlantilla(p);
      for (const c of CONTROLES) total[c] += n[c];
    }
  }
  return total;
}

export const suma = (n) => CONTROLES.reduce((a, c) => a + n[c], 0);

/**
 * El cruce con el piso. Una app obligatoria no tiene ninguno; las demás no suben de su piso, y si bajan el piso se
 * reescribe en el mismo commit (si no, la deuda pagada se vuelve a contraer en silencio).
 */
export function cruzarConElPiso(actual, { obligatorias = [], piso = {} }) {
  const errores = [];
  const bajaron = [];
  for (const app of obligatorias) {
    if (!(app in actual)) errores.push(`la app obligatoria «${app}» no existe`);
    else if (actual[app] > 0) errores.push(`${app}: ${actual[app]} a mano y es obligatoria (0)`);
  }
  for (const [app, antes] of Object.entries(piso)) {
    if (!(app in actual)) errores.push(`el piso nombra «${app}», que ya no existe`);
    else if (actual[app] > antes) errores.push(`${app}: ${antes} → ${actual[app]}`);
    else if (actual[app] < antes) bajaron.push(`${app}: ${antes} → ${actual[app]}`);
  }
  return { errores, bajaron };
}

/** El piso que corresponde a `actual` sin subir ninguno: las apps no obligatorias con su cifra, ordenadas. */
export function pisoDe(actual, { obligatorias = [], piso = {} }) {
  return Object.fromEntries(
    Object.keys(piso)
      .filter((app) => !obligatorias.includes(app) && app in actual)
      .sort((a, b) => a.localeCompare(b))
      .map((app) => [app, Math.min(piso[app], actual[app])]),
  );
}
