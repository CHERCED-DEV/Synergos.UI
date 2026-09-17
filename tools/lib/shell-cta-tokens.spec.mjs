import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { hojasDeShells, usosProhibidos, usosEnTexto, PROHIBIDOS } from './shell-cta-tokens.mjs';

/**
 * El CTA de un shell se pinta con un acento SÓLIDO (issue #25).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ HACE FALTA.
 *
 * Los trece shells pintaban el fondo de su botón primario con
 * `--syn-color-state-brand-surface` y la tinta con `--syn-color-text-on-brand`.
 * El primero **no es un acento: es un lavado con alpha** —del 8 % al 18 % según
 * el tema— y el segundo resuelve a blanco en los temas claros. Medido
 * componiendo el alpha sobre el lienzo y aplicando la fórmula de WCAG:
 *
 *   light       1,16 : 1        (con el par correcto: 5,92 : 1)
 *   silverGold  1,07 : 1
 *   terraLux    1,09 : 1
 *
 * El umbral AA es 4,5 para texto y 3,0 para UI. 1,07 no es «bajo contraste»: es
 * el botón de publicar sin texto visible, en cinco de los siete temas.
 *
 * **Por qué nadie lo vio, y por qué hace falta un gate y no un test de color.**
 * El fallback Sass es sólido (`#{syn.$color-brand-500}`), así que en el dev
 * server del UI —sin el CSS del CMS— el botón se ve perfecto: sólo se rompe
 * dentro del CMS, con los temas puestos. Y jsdom no resuelve `var()` en cascada,
 * así que un spec de componente no puede medir esto. Lo único que se puede
 * vigilar desde acá es **qué token se nombra**.
 *
 * Y hacía falta de verdad: alguien ya lo había arreglado en SH-1, con la razón
 * escrita en `discovery-shell.scss:11` («antes state-brand-surface wash → el
 * botón de búsqueda era un CTA fantasma»), y **no se generalizó**. Doce shells
 * siguieron con el lavado, incluidos los dos de esta semana (#19, #22), que se
 * escribieron copiando el bloque de tokens del shell de al lado. Así se propaga.
 * ─────────────────────────────────────────────────────────────────────────────
 */

describe('el CTA de los shells usa un acento sólido', () => {
  const hojas = hojasDeShells();

  it('hay hojas de shells que inspeccionar', () => {
    expect(hojas.length).toBeGreaterThan(10);
  });

  it('ningún shell nombra un token de LAVADO para su acento', () => {
    const malos = [];
    for (const hoja of hojas) {
      for (const uso of usosProhibidos(hoja)) {
        malos.push(`${path.basename(hoja)}:${uso.linea} usa ${uso.token} → ${uso.sugerido}`);
      }
    }

    expect(
      malos,
      `Estos shells pintan su acento con un token de lavado (alpha 8-18 %). Con la\n` +
        `tinta sobre blanco eso da 1,07:1 en silverGold y 1,16:1 en light — texto\n` +
        `invisible, no «bajo contraste». El par sólido está definido por tema y ya lo\n` +
        `usan SH-1 y la app blogs. Es el defecto #25:\n  ` +
        malos.join('\n  '),
    ).toEqual([]);
  });

  it('la prosa que EXPLICA el token roto sigue siendo legítima', () => {
    // `discovery-shell.scss:11` cuenta en un comentario por qué se cambió, y
    // nombra el token dentro del comentario. El gate busca el nombre DESNUDO
    // —para cazarlo escrito de cualquier forma— así que sin la exención ese
    // comentario daría positivo y la única explicación escrita del defecto
    // tendría que borrarse para pasar el build. Comprobado quitando
    // `sinComentarios`: este caso se pone rojo.
    const discovery = hojas.find((h) => h.endsWith('discovery-shell.scss'));
    expect(discovery).toBeTruthy();
    expect(readFileSync(discovery, 'utf8')).toContain('state-brand-surface');
    expect(usosProhibidos(discovery)).toEqual([]);
  });

  it('caza el token escrito SIN el prefijo, no sólo la forma canónica', () => {
    // El nombre se puede escribir de más de una manera —dentro de un
    // `color-mix`, con el prefijo partido por un salto de línea, o como un alias
    // propio— así que el gate busca el nombre desnudo. Sin esto sólo cazaría la
    // forma bonita y el token entraría por cualquier otra.
    expect(usosEnTexto('  --x: var(--syn-color-state-brand-surface, #fff);')).toHaveLength(1);
    expect(usosEnTexto('  --x: var(--mi-alias-state-brand-surface, #fff);')).toHaveLength(1);
    expect(usosEnTexto('  --x: var(--syn-color-action-primary, #fff);')).toEqual([]);
  });

  it('la lista de prohibidos nombra su reemplazo, no sólo el pecado', () => {
    // Un gate que dice «no uses esto» sin decir qué usar se salta con el primer
    // token que se le parezca.
    for (const [, sugerido] of PROHIBIDOS) {
      expect(sugerido).toMatch(/^--syn-color-action-primary/);
    }
  });
});
