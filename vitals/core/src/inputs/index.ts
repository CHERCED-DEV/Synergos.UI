/**
 * Lo que llega del CMS, normalizado — y por eso vive acá y no en un `shared`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTAS FUNCIONES SON LA DEFINICIÓN DE `vitals`, NO UNA CARPETA DE UTILIDADES.
 *
 * El editor escribe JSON sin tipo en un DocType de Umbraco; el elemento recibe
 * un atributo HTML que es una cadena. Entre las dos cosas hay UN normalizador
 * defensivo, y `LLM.txt` §2 lo dice con todas las letras: en `vitals` va «el
 * MODELO de lo que emite el CMS». Un `coerceTrimmedStringInput` es ese modelo
 * ejecutándose.
 *
 * Vivían en `platforms/angular/libs/shared/src/utils/` y se mudaron al SEGUNDO
 * CONSUMIDOR (la segunda plataforma, HU #64), que es la regla de promoción del
 * repo aplicada con fecha. No se mudaron antes a propósito: `FRONTERA_VITALS.md`
 * §5 las tenía medidas y clasificadas como grupo A desde #36, y una medición no
 * es una cola de trabajo.
 *
 * LO QUE SE EVITÓ MUDÁNDOLAS: la segunda copia. Escribir el badge de la segunda
 * plataforma sin esto significaba volver a escribir el normalizador, y dos
 * normalizadores que se separan es cómo una clave del CMS deja de cruzar en
 * silencio — sin error, sin log, con la pantalla a medias. `embed-url.util.ts`
 * lo dice en su propia cabecera y no es hipotético: su allowlist YA se duplicó
 * una vez (#10) y el defecto se quedó vivo en `media-explorer` mientras se
 * arreglaba en los otros dos sitios.
 *
 * HAY GATE, y va por el NOMBRE DE LA FUNCIÓN EXPORTADA y no por la ruta del
 * fichero (`tools/lib/normalizador-unico.mjs`): la séptima copia no se va a
 * llamar `config-input.util.ts`, se va a llamar `parseConfig` dentro del
 * componente que la necesitó. Lo único literal es el identificador.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * LO QUE NO BAJÓ, para que nadie lo busque acá:
 *   · `class-names.util.ts` — tres líneas que unen clases CSS. Se quedó en el
 *     `shared` de Angular no por descuido sino porque **nadie de la segunda
 *     plataforma lo pidió**: el badge no lo usa, y cada framework tiene su
 *     idioma para componer clases. Mudarlo por simetría es la abstracción
 *     prematura que `LLM.txt` §6 prohíbe. El día que el segundo `shared` lo
 *     necesite, baja — con consumidor, como bajaron estos cuatro.
 *   · Los 13 `sanitize*Config` co-locados (grupo B) y lo atrapado en clases
 *     (grupo C): siguen medidos en `FRONTERA_VITALS.md` §5 y el grupo B espera
 *     una decisión que no es mecánica (el `*Config` describe la API del design
 *     system, no lo que emite el CMS).
 */
export * from './config-input.util';
export * from './embed-url.util';
export * from './form.util';
export * from './monogram.util';
