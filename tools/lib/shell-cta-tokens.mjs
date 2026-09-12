import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '../..');
const SHELLS = path.join(REPO, 'platforms/angular/libs/shells/src');

/**
 * Tokens que NO pueden pintar un CTA sólido, con la razón medida al lado.
 *
 * `state-brand-surface` es un LAVADO con alpha (8-18 % según el tema, ver
 * `syn-tokens.css` del CMS), no un acento. Con `text-on-brand` —que resuelve a
 * blanco en los temas claros— da 1,07:1 en silverGold y 1,16:1 en light: texto
 * invisible, no «bajo contraste». El umbral AA es 4,5 (3,0 para UI).
 */
export const PROHIBIDOS = new Map([
  ['--syn-color-state-brand-surface', '--syn-color-action-primary'],
  ['--syn-color-text-on-brand', '--syn-color-action-primary-text'],
]);

/** Los `.scss` del catálogo de shells. */
export function hojasDeShells() {
  const encontradas = [];
  if (!existsSync(SHELLS)) return encontradas;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.scss')) encontradas.push(full);
    }
  };
  walk(SHELLS);
  return encontradas;
}

/** Quita comentarios: la prosa que EXPLICA el token roto es legítima. */
export function sinComentarios(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

/**
 * Los usos prohibidos de cada hoja: `[{ token, sugerido, linea }]`.
 *
 * Se busca el nombre **sin el prefijo** `--syn-color-` a propósito: así se caza
 * igual un `--syn-color-state-brand-surface` y un `state-brand-surface` escrito
 * de cualquier otra forma. El precio es que la PROSA que nombra el token roto
 * también daría positivo — y ahí está la razón de `sinComentarios`: el
 * comentario de `discovery-shell.scss` es la única explicación escrita que hay
 * de este defecto, y un gate que la borrara dejaría el repo sin memoria de por
 * qué se cambió. Se mira el CÓDIGO, no los comentarios.
 */
export function usosProhibidos(fichero) {
  return usosEnTexto(readFileSync(fichero, 'utf8'));
}

/** El detector, sobre texto — para poder probarlo sin inventar un fichero. */
export function usosEnTexto(src) {
  const lineas = sinComentarios(src).split('\n');
  const hallados = [];
  lineas.forEach((linea, i) => {
    for (const [token, sugerido] of PROHIBIDOS) {
      // `--syn-color-state-brand-surface` → `state-brand-surface`
      const desnudo = token.replace(/^--syn-color-/, '');
      if (linea.includes(desnudo)) {
        hallados.push({ token, sugerido, linea: i + 1 });
      }
    }
  });
  return hallados;
}
