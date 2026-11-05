/**
 * Gate — la CDN de producción se publica sólo con un release (R-2 del CMS, D-002-P12, 2026-11-04).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL DEFECTO QUE CIERRA
 *
 * El arquitecto pidió un único release con todo completo, y producción se
 * despliega sólo con la etiqueta de un release que pone el director (R-1 y R-2,
 * lote 19). El CMS ya lo cumple (`deploy.yml`, CMS 88a4f9e0). Del lado del UI,
 * `despliegue-cdn.yml` corría `wrangler deploy` en CADA push a master —y a mano
 * con cualquier SHA—: en cuanto existieran las credenciales de Cloudflare, cada
 * push del UI habría cambiado los bundles que sirve producción, sin release.
 *
 * LA REGLA, MIRADA EN EL YAML
 *
 *   · la etiqueta `release-*` dispara la publicación, y el disparo manual pide el
 *     NOMBRE de un release (`inputs.release`), no un SHA;
 *   · un push a una rama sigue disparando —construye y comprueba—, pero ningún
 *     paso que publique (`wrangler deploy`, salvo `--dry-run`) corre sin la
 *     condición `steps.release.outputs.publicar == 'si'`;
 *   · `publicar` sale sólo del disparo manual o de una etiqueta, y sólo si es un
 *     `release-*`; y el commit del release tiene que estar en master;
 *   · nada de `workflow_run`, `schedule` ni `pull_request`, que publicarían sin
 *     release.
 *
 * Como el de `humo-tras-desplegar`, NO es un parser: corta el YAML sin
 * comentarios en pasos por su sangría y mira lo que cada uno dice. Lo que puede
 * fallar es pedir explicarse a un paso legítimo, que es el error barato.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { sinComentarios } from './humo-tras-desplegar.mjs';

/** Lo único que mueve el CDN. */
export const PUBLICA = 'wrangler deploy';

/** La condición sin la cual ningún paso publica. */
export const CONDICION = "steps.release.outputs.publicar == 'si'";

/** De dónde sale el release: el disparo manual, o una etiqueta. */
export const ORIGEN_DEL_RELEASE = "github.event.inputs.release || (github.ref_type == 'tag' && github.ref_name)";

/** El bloque `on:` de un workflow, sin sus comentarios ni sus líneas vacías. */
export function disparosDe(codigo) {
  const lineas = codigo.split('\n').map((l) => l.trimEnd());
  const inicio = lineas.findIndex((l) => /^on:\s*$/.test(l));
  if (inicio < 0) return '';
  const resto = lineas.slice(inicio + 1);
  const fin = resto.findIndex((l) => l.length > 0 && !/^\s/.test(l));
  return (fin < 0 ? resto : resto.slice(0, fin)).filter((l) => l.length > 0).join('\n');
}

/**
 * Los pasos de un workflow (cada `      - …` bajo `    steps:`, hasta el siguiente), sin comentarios. Lo que va
 * antes de `steps:` —la lista de ramas del `on:`, por ejemplo— no es un paso.
 */
export function pasosDe(codigo) {
  const pasos = [];
  let actual = null;
  let enPasos = false;
  for (const linea of codigo.split('\n')) {
    if (/^ {4}steps:\s*$/.test(linea)) {
      enPasos = true;
      continue;
    }
    if (!enPasos) continue;
    if (/^ {6}- /.test(linea)) {
      if (actual) pasos.push(actual.join('\n'));
      actual = [linea];
    } else if (actual) {
      if (linea.length > 0 && !/^ {7,}/.test(linea)) {
        pasos.push(actual.join('\n'));
        actual = null;
      } else {
        actual.push(linea);
      }
    }
  }
  if (actual) pasos.push(actual.join('\n'));
  return pasos;
}

/**
 * @param {string} yaml  el texto de `despliegue-cdn.yml`.
 * @returns {string[]} los motivos del rechazo; vacío = sólo un release publica.
 */
export function revisarPublicacionPorRelease(yaml) {
  const motivos = [];
  const codigo = sinComentarios(yaml.replace(/\r\n/g, '\n'));
  const disparos = disparosDe(codigo);

  if (!disparos) return ['no se encontró el bloque `on:`: el gate no tiene qué mirar'];

  if (!/^ {4}tags: \['release-\*'\]$/m.test(disparos)) {
    motivos.push("la etiqueta `release-*` no dispara la publicación (`push: tags: ['release-*']`)");
  }
  if (!/^ {2}workflow_dispatch:\n {4}inputs:\n {6}release:$/m.test(disparos)) {
    motivos.push('el disparo manual no pide el NOMBRE de un release (`inputs.release`)');
  }
  if (/^ {6}sha:$/m.test(disparos)) {
    motivos.push('el disparo manual acepta un SHA: publicaría cualquier commit, no un release');
  }
  for (const prohibido of ['workflow_run', 'schedule', 'pull_request']) {
    if (disparos.includes(prohibido)) motivos.push(`se dispara con «${prohibido}», que publicaría sin release`);
  }

  const pasos = pasosDe(codigo);
  const publican = pasos.filter((p) => p.includes(PUBLICA) && !p.includes('--dry-run'));
  if (publican.length === 0) motivos.push(`ningún paso corre «${PUBLICA}»: el gate no encuentra quién publica`);
  for (const paso of publican) {
    const si = paso.split('\n').find((l) => /^\s*(- )?if:/.test(l)) ?? '';
    if (!si.includes(CONDICION)) {
      const nombre = (paso.match(/name: (.+)/) ?? [, paso.split('\n')[0].trim()])[1];
      motivos.push(`el paso «${nombre}» publica sin la condición ${CONDICION}`);
    }
  }

  if (!codigo.includes(ORIGEN_DEL_RELEASE)) {
    motivos.push('`publicar` no sale sólo del disparo manual o de una etiqueta');
  }
  if (!codigo.includes('release-*) ;;')) motivos.push('no se comprueba que el release sea un `release-*`');
  if (!codigo.includes('git merge-base --is-ancestor "$SHA" FETCH_HEAD')) {
    motivos.push('no se comprueba que el commit del release esté en master');
  }

  return motivos;
}
