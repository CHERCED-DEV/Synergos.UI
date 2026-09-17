#!/usr/bin/env node
/**
 * Obligación 7 del contrato: los tokens de `vitals/core-assets`, comprobados.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ACÁ NO HAY NADA QUE TRADUCIR, Y ÉSA ES LA RESPUESTA — NO UNA EXCUSA.
 *
 * La obligación dice «`vitals/core-assets` traducido a su lenguaje de estilos,
 * con su comprobación», y el contrato exige el SCRIPT y no un fichero concreto
 * justamente porque el lenguaje puede ser otro. El de esta plataforma es **Sass,
 * el mismo**, así que `badge.scss` hace `@use '…/vitals/core-assets/src/scss'`
 * directo y no hay bridge que regenerar.
 *
 * **Lo que NO se puede hacer es dar la obligación por cumplida y salir 0.** Un
 * script que no comprueba nada y contesta «✓» es peor que no tenerlo: el gate de
 * plataforma se pondría verde sobre una plataforma sin vigilancia de tokens, que
 * es exactamente la forma de la regla 25. Así que la comprobación existe y mide
 * la parte que SÍ puede desviarse acá.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ MIDE: QUE ESTA PLATAFORMA NO REDECLARE UN TOKEN DEL SSOT.
 *
 * Es G-2 del lado de Angular, acotado a esta plataforma. El SSOT es
 * `Synergos.CMS.Web/wwwroot/css/syn-tokens.css`, que el CMS sirve por `<link>`.
 * Si un `.scss` de acá DECLARA a nivel de tema un `--syn-*` que el SSOT también
 * define, gana el que llegue después en orden de fuente — y como el CSS de esta
 * plataforma viaja DENTRO de `sg-preact-shared.js` y se inyecta en el `<head>`
 * al montar, llega **después** del `<link>` del CMS. O sea que una copia a mano
 * ganaría en producción. Ya pasó en Angular con `_brand.scss`, sirviendo valores
 * pre-a11y (3,47:1 contra 5,19:1) y verificado en navegador.
 *
 * Usar `var(--syn-x, fallback)` NO es declarar: es leer con respaldo, que es lo
 * correcto y lo que hace `badge.scss`. Lo que se prohíbe es `--syn-x: valor` en
 * `:root` o en un selector de tema.
 *
 * El CMS se busca con `resolverRaizCms`, el MISMO resolutor que usan las otras
 * herramientas que lo necesitan (#57) — un tercer sitio con su propia
 * convención de rutas es cómo una de ellas acaba mirando a otro lado.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { comoApuntarAlCms, resolverRaizCms } from '../../../tools/lib/rutas-hermanas.mjs';

const BASE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAIZ_UI = path.resolve(BASE, '../..');
const SOLO_COMPROBAR = process.argv.includes('--check');

/** Los `--syn-*` que el SSOT del CMS define. */
function tokensDelSsot(rutaCms) {
  const ssot = path.join(rutaCms, 'Synergos.CMS.Web/wwwroot/css/syn-tokens.css');
  if (!existsSync(ssot)) {
    console.error(comoApuntarAlCms(ssot));
    process.exit(1);
  }
  return new Set([...readFileSync(ssot, 'utf8').matchAll(/(--syn-[\w-]+)\s*:/g)].map((m) => m[1]));
}

/** Los `.scss` de esta plataforma. */
function hojas(dir, salida = []) {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === 'dist') continue;
    const completo = path.join(dir, nombre);
    if (statSync(completo).isDirectory()) hojas(completo, salida);
    else if (completo.endsWith('.scss')) salida.push(completo);
  }
  return salida;
}

/**
 * Las declaraciones de token a NIVEL DE TEMA, o sea las que pueden pisar el
 * SSOT. Se excluyen las que viven dentro de un selector de componente, que son
 * locales y legítimas — `badge.scss` declara `--syn-badge-background` dentro de
 * `.syn-badge`, y eso no compite con nada.
 */
function declaracionesDeTema(fuente) {
  const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const salida = [];
  // Un bloque de tema es `:root`, `[data-theme=…]` o `html`. Cualquier otro
  // selector es de componente.
  const bloques = [...sinComentarios.matchAll(/(^|\})\s*([^{}]+)\{([^{}]*)\}/g)];
  for (const [, , selector, cuerpo] of bloques) {
    if (!/(^|\s|,)(:root|html|\[data-theme)/.test(selector)) continue;
    for (const m of cuerpo.matchAll(/(--syn-[\w-]+)\s*:/g)) salida.push(m[1]);
  }
  return salida;
}

function principal() {
  const { ruta, origen } = resolverRaizCms({ raizUi: RAIZ_UI });
  const ssot = tokensDelSsot(ruta);
  const problemas = [];

  for (const hoja of hojas(BASE)) {
    const fuente = readFileSync(hoja, 'utf8');
    for (const token of declaracionesDeTema(fuente)) {
      if (!ssot.has(token)) continue;
      problemas.push(`${path.relative(RAIZ_UI, hoja)} redeclara ${token}, que define el SSOT`);
    }
  }

  const rel = path.relative(RAIZ_UI, BASE);
  if (problemas.length > 0) {
    console.error(`[tokens] ${rel}: ${problemas.length} redeclaración(es) que ganarían al SSOT:`);
    for (const p of problemas) console.error(`  - ${p}`);
    console.error(
      '\nUn token del SSOT se LEE con `var(--syn-x, fallback)`; declararlo acá lo pisa en\n' +
        'producción, porque este CSS se inyecta después del <link> del CMS.',
    );
    process.exit(1);
  }

  console.log(
    `[tokens] ${rel}: ${ssot.size} tokens del SSOT (${origen}), ` +
      `0 redeclaradas. Sass es el mismo lenguaje que core-assets: no hay bridge que generar.`,
  );

  if (!SOLO_COMPROBAR) {
    console.log('[tokens] nada que escribir — ver la cabecera de este fichero.');
  }
}

principal();
