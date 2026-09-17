/**
 * Paridad inversa: toda regla CSS de una app tiene quien la emita (issue #23).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL ESPEJO QUE FALTABA.
 *
 * El CMS corre `check-css-parity.mjs` (G-3), que exige que toda clase `syn-*`
 * **emitida** tenga CSS de respaldo. Acá va la otra dirección: **toda clase
 * declarada en el SCSS de una app aparece en su plantilla o en su TypeScript**.
 *
 * Hace falta porque cada vez que una app cambia markup propio por una pieza del
 * catálogo, su CSS se queda y nadie se entera: `__facet-*` es de antes de SH-1,
 * `__gallery-*` de antes de SH-2, y `__confirm-*` —en tres apps, con el mismo
 * nombre— de antes de SH-11. Son tres costos: peso en el bundle publicado (el
 * presupuesto mira el total, no si lo que hay dentro sirve), una mentira sobre
 * qué existe para el siguiente que lo abra, y la forma de defecto que este repo
 * ya conoce — lo que no tiene gate diverge.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Quita comentarios de bloque y de línea sin tocar el número de líneas. */
function sinComentarios(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

/**
 * Expande el anidamiento de SCSS y devuelve cada clase declarada.
 *
 * **La trampa nº1 del ticket**: el SCSS anida con `&__`, así que un barrido por
 * `\.app__clase` no encuentra casi nada — hay que resolver el `&` contra el
 * contexto padre. Medir sin esto da un número bajo que parece bueno.
 *
 * Devuelve `{ clase, linea, selector, grupo }` por cada selector del grupo, para
 * que quien limpie sepa si puede borrar el bloque o sólo una línea.
 */
export function clasesDeclaradas(scss) {
  const src = sinComentarios(scss);
  const salida = [];
  const pila = [];
  let buffer = '';
  let linea = 1;

  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (c === '\n') {
      linea += 1;
      buffer += ' ';
      continue;
    }
    if (c === '{') {
      const crudo = buffer.trim();
      buffer = '';
      // `@media`, `@supports`, `@include` con bloque… no aportan selector: el
      // contexto sigue siendo el de fuera, o el anidado de dentro se resolvería
      // contra una arroba.
      if (crudo.startsWith('@')) {
        pila.push(pila.length > 0 ? pila[pila.length - 1] : []);
        continue;
      }
      const padres = pila.length > 0 ? pila[pila.length - 1] : [''];
      const partes = crudo.split(',').map((p) => p.trim()).filter(Boolean);
      const resueltos = [];
      for (const parte of partes) {
        for (const padre of padres) {
          resueltos.push(parte.includes('&') ? parte.replace(/&/g, padre) : parte);
        }
      }
      pila.push(resueltos);

      for (const sel of resueltos) {
        for (const clase of clasesDeSelector(sel)) {
          salida.push({ clase, linea, selector: sel, grupo: partes.length });
        }
      }
      continue;
    }
    if (c === '}') {
      pila.pop();
      buffer = '';
      continue;
    }
    if (c === ';') {
      buffer = '';
      continue;
    }
    buffer += c;
  }
  return salida;
}

/** Las clases de un selector ya resuelto: `.a__b:hover .c` → ['a__b', 'c']. */
function clasesDeSelector(selector) {
  return [...selector.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]);
}

/**
 * Lo que la app EMITE: clases literales y prefijos compuestos.
 *
 * **La trampa nº3 del ticket**: la clase puede componerse en el TS
 * (`'app__chip is-' + estado`), así que se miran los dos ficheros. Y cuando la
 * interpolación parte el nombre —`` `app__card-${tipo}` ``— lo que queda es un
 * PREFIJO: todo lo que empiece por él cuenta como emitido, igual que hace el
 * gate del CMS. Sin eso, un modificador dinámico se reporta como muerto.
 */
export function clasesEmitidas(fuentes) {
  const exactas = new Set();
  const prefijos = new Set();
  for (const src of fuentes) {
    for (const m of src.matchAll(/([a-zA-Z][\w-]*__[\w-]*)/g)) {
      const token = m[1];
      const siguiente = src[m.index + token.length] ?? '';
      // Un token que muere justo donde empieza una interpolación es un prefijo.
      if (token.endsWith('-') || siguiente === '$' || siguiente === '{') {
        prefijos.add(token);
      } else {
        exactas.add(token);
      }
    }
    // `'app__' + algo` y `` `app__${algo}` `` — el prefijo queda sin sufijo.
    for (const m of src.matchAll(/([a-zA-Z][\w-]*__)(?:\$\{|\{|['"`]\s*\+)/g)) {
      prefijos.add(m[1]);
    }
  }
  return { exactas, prefijos };
}

/**
 * Las `syn-*` NO las emite la app: las emite el design system.
 *
 * Tres apps estilan `syn-tabs__*` desde su propio SCSS —`libs/shared/.../tabs.ts`
 * es quien las pinta—, y borrarlas por «nadie las emite acá» habría roto las
 * pestañas de las tres. Va por NAMESPACE y no por lista de excepciones a
 * propósito: la próxima se llamará de otra manera, y una lista escrita a mano no
 * la va a conocer.
 */
function esDelDesignSystem(clase) {
  return clase.startsWith('syn-');
}

/** Si algo la emite: exacta, o cubierta por un prefijo dinámico. */
export function estaEmitida(clase, { exactas, prefijos }) {
  if (exactas.has(clase)) {
    return true;
  }
  for (const p of prefijos) {
    if (clase.startsWith(p) && clase.length > p.length) {
      return true;
    }
  }
  return false;
}

/**
 * Las clases del SCSS que nadie emite.
 *
 * **La trampa nº2 del ticket**: un grupo mezcla vivos y muertos
 * (`&__flight-list, &__cart-lines, &__fares { … }`). Por eso cada huérfana viaja
 * con el tamaño de su grupo: `grupo === 1` se borra entera, `grupo > 1` es quitar
 * esa línea del selector. Un gate que no lo distinga o no atrapa nada o propone
 * borrar de más.
 */
export function huerfanas(scss, fuentes, exentas = new Set()) {
  const emitidas = clasesEmitidas(fuentes);
  const vistas = new Map();
  for (const d of clasesDeclaradas(scss)) {
    if (!d.clase.includes('__') || exentas.has(d.clase) || esDelDesignSystem(d.clase)) {
      continue;
    }
    if (estaEmitida(d.clase, emitidas)) {
      continue;
    }
    if (!vistas.has(d.clase)) {
      vistas.set(d.clase, d);
    }
  }
  return [...vistas.values()].sort((a, b) => a.linea - b.linea);
}
