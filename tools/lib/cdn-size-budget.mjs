/**
 * Cuánto puede pesar un elemento publicado, y qué significa que engorde.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTO NO VIGILA BYTES. VIGILA EL CONTRATO DE EXTERNALS.
 *
 * Un elemento pesa ~2 KB porque Angular, RxJS, `@synergos/core` y
 * `@synergos/shared` quedan FUERA del bundle como bare imports y los resuelve
 * el import-map del `<head>` (ver `platforms/angular/cdn.config.mjs`). Es la
 * idea fundacional del repo: veinte elementos en una página comparten UN solo
 * Angular.
 *
 * Por eso un elemento que engorda 10× casi nunca es «un elemento pesado». Es
 * la señal de que **algo que debía quedar externo se empaquetó** — o sea, que
 * la arquitectura se rompió, en silencio, y el build salió verde.
 *
 * Y ya pasó. Durante la purga de Nx, `storefront` salió en 712 KB contra los
 * 287 KB del build anterior: al apuntar el alias a fuentes compiladas se perdía
 * el `sideEffects: false` que declaraba ng-packagr, y con él la poda. Se
 * arregló escribiendo ese campo en `.cdn-out/package.json` (build.mjs:201) y
 * quedó en 269 KB, mejor que con Nx.
 *
 *   > Lo importante no es que se arreglara. Es CÓMO se encontró: comparando
 *   > bytes a mano contra un build viejo. Si nadie hubiera mirado, se habría
 *   > publicado un elemento 2,6× más pesado y nada se habría puesto rojo.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * POR QUÉ UN UMBRAL POR TIER Y NO UN PRESUPUESTO POR ELEMENTO.
 *
 * 139 números a mano se abandonan: el primero que estorbe se sube, y a los tres
 * meses el fichero es una lista de permisos. Un umbral por tier son tres
 * números que alguien puede defender, más una tabla de excepciones donde cada
 * línea tuvo que justificarse para entrar.
 *
 * El registro por elemento existe igual —`tools/cdn-size-baseline.json`— pero
 * NO es el gate: es la memoria. Los números de la purga (`badge` = 1845 bytes,
 * `storefront` = 269 KB) vivían en la cabeza de quien la hizo y se iban con la
 * sesión.
 *
 * SIN COMPRIMIR, Y NO ES LO QUE PAGA EL VISITANTE. El gzip depende del
 * compresor y de su nivel, así que un cambio de infraestructura movería el
 * gate sin que cambiara una línea del repo. Se registran los dos y se juzga
 * por el estable.
 */

/** Un KiB, para que los límites se lean como se piensan. */
const KB = 1024;

/**
 * El techo por tier, sobre el bundle **publicado** y **sin comprimir**.
 *
 * Medidos contra el máximo real de cada tier el 2026-08-04, con ~20% de aire:
 * suficiente para que iterar sobre un elemento no moleste a nadie, muy lejos
 * de lo que cuesta empaquetar hasta el más pequeño de los externals.
 */
export const TECHO_POR_TIER = {
  primitive: 24 * KB, //  máx. real 20 041 (popover) · mín. 1 845 (badge)
  composition: 44 * KB, //  máx. real 35 445 (cart-item) · mín. 10 807 (faq-item)
  module: 72 * KB, //  máx. real sin excepción 62 476 (cart-summary)
};

/**
 * Los que pasan del techo de su tier, uno por uno y con motivo.
 *
 * Todos son la misma clase de cosa: un `module` que no es un elemento sino una
 * **aplicación entera** —un storefront completo, una historia clínica—, y que
 * empaqueta a propósito las libs de feature que `cdn.config.mjs` deja fuera de
 * EXTERNALS (`shop`, `transaction-engine`, `shells`, `rendering`). Compartirlas
 * por import-map acoplaría el despliegue de todos los elementos al de una lib.
 *
 * Entrar acá exige escribir la razón. Es el único trámite que impide que la
 * tabla se convierta en una lista de permisos.
 */
export const EXCEPCIONES = {
  academy: { techo: 396 * KB, razon: 'vertical completa: cursos, matrícula, progreso' },
  realty: { techo: 396 * KB, razon: 'vertical completa: fichas, mapa, agenda de visitas' },
  eventos: { techo: 384 * KB, razon: 'vertical completa: agenda, artistas, sesiones, seat-map' },
  blogs: { techo: 348 * KB, razon: 'vertical completa: índice, artículo, comentarios' },
  gov: { techo: 328 * KB, razon: 'vertical completa: trámites, formularios, expediente' },
  ehr: { techo: 328 * KB, razon: 'vertical completa: historia clínica, agenda, recetas' },
  storefront: { techo: 304 * KB, razon: 'tienda entera: catálogo, carrito, checkout' },
  'travel-shell': { techo: 292 * KB, razon: 'vertical completa: búsqueda, pax, itinerario' },
  seller: { techo: 160 * KB, razon: 'panel de vendedor: inventario, pedidos, métricas' },
  'product-detail': { techo: 104 * KB, razon: 'ficha con galería, variantes y motor de precio' },
};

/**
 * Cuánto puede crecer UN elemento respecto de la última medida antes de que
 * eso, por sí solo, sea sospechoso.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EL TECHO POR TIER NO ALCANZA, Y LO DESCUBRIÓ UN TEST.
 *
 * Escribiendo el spec de este gate salió el caso «un primitivo que engorda 10×
 * NO pasa»… y pasaba. `badge` publica 1 845 bytes; diez veces son 18 450, y el
 * techo de `primitive` está en 24 KB porque tiene que dejar vivir a `popover`,
 * que pesa 20 041.
 *
 *   > Un umbral por tier lo fija el elemento MÁS GRANDE del tier. Para el más
 *   > pequeño, eso no es un presupuesto: es un permiso para decuplicarse.
 *
 * Y «un elemento que engorde 10× rompe el build» es literalmente lo que la
 * épica #6 pide. Así que el techo por tier se queda —es el tope absoluto que
 * pedía el ticket— y se le suma un trinquete contra la última medida.
 *
 * ESTO NO SON 139 NÚMEROS QUE MANTENER, que es lo que el ticket temía con
 * razón. `tools/cdn-size-baseline.json` se GENERA (`npm run size:baseline`),
 * no se escribe a mano; lo único que hace falta de una persona es mirar el
 * diff, que es justo la revisión que este gate quiere provocar.
 *
 * El factor es 2 y no 1,2 a propósito: tiene que estar muy por encima de
 * cualquier cambio legítimo de un elemento —añadir una vista, un formulario— y
 * muy por debajo de lo que cuesta empaquetar hasta el más pequeño de los
 * externals. Un gate que salta cada vez que alguien trabaja se apaga.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const FACTOR_TRINQUETE = 2;

/**
 * Los externals que TODO elemento importa, sin excepción.
 *
 * No es una suposición: los tres salen del patrón de arranque que
 * `AGENTS.md` obliga a copiar en cada `src/main.ts` — `createApplication`
 * (@angular/platform-browser), `createCustomElement` (@angular/elements) y el
 * `appConfig` con sus providers (@angular/core). Un bundle al que le falte
 * cualquiera de los tres se los tragó.
 *
 * El resto de EXTERNALS (rxjs, forms, router, @synergos/*) NO se comprueba: un
 * elemento puede legítimamente no usarlos, y un gate que no distingue «no lo
 * usa» de «se lo comió» es ruido.
 */
export const EXTERNALS_UNIVERSALES = [
  '@angular/core',
  '@angular/elements',
  '@angular/platform-browser',
];

/**
 * El techo que le toca a un elemento: su excepción si la tiene, si no la de su tier.
 *
 * @param {string} nombre Nombre del elemento (la carpeta del CDN).
 * @param {string} tier `primitive` | `composition` | `module`.
 * @returns {{ techo: number, origen: string, razon?: string }}
 */
export function techoDe(nombre, tier) {
  const excepcion = EXCEPCIONES[nombre];
  if (excepcion) {
    return { techo: excepcion.techo, origen: 'excepción', razon: excepcion.razon };
  }

  const porTier = TECHO_POR_TIER[tier];
  if (porTier === undefined) {
    // Un tier que no conocemos NO se deja pasar en silencio. El día que se
    // añada un tier al registry, este gate tiene que ser de los que se enteran:
    // si no, los elementos nuevos nacen sin techo y nadie lo nota.
    return { techo: null, origen: 'tier desconocido' };
  }

  return { techo: porTier, origen: `tier ${tier}` };
}

/**
 * Si el código publicado sigue importando un external en vez de haberlo comido.
 *
 * Se busca el bare import en la forma que emite esbuild (`from"@angular/core"`,
 * sin espacio) y en la relajada, para que el gate no dependa de cómo minifica
 * la herramienta de hoy.
 *
 * @param {string} codigo Contenido del bundle publicado.
 * @param {string} external Especificador del paquete.
 * @returns {boolean}
 */
export function importaExterno(codigo, external) {
  const esc = external.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&');
  return new RegExp(`from\\s*["']${esc}["']`).test(codigo);
}

/**
 * El veredicto de un elemento publicado.
 *
 * @param {{ nombre: string, tier: string, bytes: number, codigo?: string, base?: number }} bundle
 *        `base` es lo que pesaba en `cdn-size-baseline.json`. Un elemento nuevo
 *        no lo tiene: nace sin trinquete y sólo responde ante el techo del tier.
 * @returns {{ ok: boolean, nombre: string, tier: string, bytes: number, techo: number|null,
 *             origen: string, razon?: string, veces: number|null, externalsAusentes: string[],
 *             base: number|null, crecimiento: number|null }}
 */
export function revisarBundle({ nombre, tier, bytes, codigo = '', base = null }) {
  const { techo, origen, razon } = techoDe(nombre, tier);

  // Se mira SIEMPRE, pase o no pase el tamaño. Un external tragado que aún
  // quepa bajo el techo es el mismo defecto un poco antes — y es justo cuando
  // sale barato arreglarlo.
  const externalsAusentes = EXTERNALS_UNIVERSALES.filter((e) => !importaExterno(codigo, e));

  const cabe = techo !== null && bytes <= techo;
  const crecimiento = base ? Number((bytes / base).toFixed(2)) : null;
  const trinqueteRoto = crecimiento !== null && crecimiento > FACTOR_TRINQUETE;

  return {
    ok: cabe && !trinqueteRoto && externalsAusentes.length === 0,
    nombre,
    tier,
    bytes,
    techo,
    origen,
    razon,
    veces: techo ? Number((bytes / techo).toFixed(2)) : null,
    externalsAusentes,
    base,
    crecimiento,
  };
}

/**
 * Qué decirle a quien acaba de ponerlo rojo.
 *
 * El mensaje habla de la CAUSA, no de los bytes. Quien lee «hero: 210 KB >
 * 72 KB» sube el número; quien lee «hero ya no importa @angular/core: se lo
 * empaquetó» va a mirar el sitio correcto.
 *
 * @param {ReturnType<typeof revisarBundle>} v
 * @returns {string[]} Líneas, sin prefijo de log.
 */
export function explicar(v) {
  const lineas = [];
  const kb = (n) => `${(n / KB).toFixed(1)} KB`;

  if (v.techo === null) {
    lineas.push(`${v.nombre}: tier "${v.tier}" sin techo definido (${kb(v.bytes)}).`);
    lineas.push(`  Añadí el tier a TECHO_POR_TIER en tools/lib/cdn-size-budget.mjs.`);
    return lineas;
  }

  if (v.externalsAusentes.length > 0) {
    lineas.push(
      `${v.nombre}: el bundle ya NO importa ${v.externalsAusentes.join(', ')} — se lo empaquetó.`,
    );
    lineas.push(`  Eso rompe el contrato de externals: este elemento ya no comparte el runtime.`);
    lineas.push(`  Mirá platforms/angular/cdn.config.mjs (EXTERNALS) y cómo lo consume build.mjs.`);
  }

  if (v.crecimiento !== null && v.crecimiento > FACTOR_TRINQUETE) {
    lineas.push(
      `${v.nombre}: ${kb(v.base)} → ${kb(v.bytes)} — ${v.crecimiento}× la última medida.`,
    );
    // OJO con afirmar que cabe: cuando el crecimiento es tan bruto que además
    // rompe el techo, decirlo sería mentira — y una mentira en el mensaje de un
    // gate es cómo empezó el issue #7.
    if (v.bytes <= v.techo) {
      lineas.push(`  Cabe bajo el techo de su tier, pero crecer ${v.crecimiento}× de una vez`);
      lineas.push(`  no es un cambio de feature. Si lo es, regenerá la línea base con`);
    } else {
      lineas.push(`  Crecer ${v.crecimiento}× de una vez no es un cambio de feature.`);
      lineas.push(`  Si de verdad lo es, regenerá la línea base con`);
    }
    lineas.push(`  \`npm run size:baseline\` y que el diff quede en el commit que lo causó.`);
  }

  if (v.bytes > v.techo) {
    lineas.push(
      `${v.nombre}: ${kb(v.bytes)} > ${kb(v.techo)} (${v.origen}) — ${v.veces}× el techo.`,
    );
    if (v.externalsAusentes.length === 0) {
      // Sin external ausente el diagnóstico no está cerrado, y decirlo importa:
      // el gate acusa un síntoma y quien lo lee tiene que buscar la causa.
      lineas.push(`  Los tres externals universales siguen ahí, así que no es el caso típico.`);
      lineas.push(`  Sospechá de una lib de feature nueva, o de que se perdió el`);
      lineas.push(`  \`sideEffects: false\` de .cdn-out/package.json (build.mjs:201) — ese`);
      lineas.push(`  exacto defecto dejó storefront en 712 KB durante la purga.`);
    }
    if (v.razon) lineas.push(`  Excepción vigente: "${v.razon}".`);
  }

  return lineas;
}
