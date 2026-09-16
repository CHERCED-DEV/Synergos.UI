/**
 * De qué framework es cada elemento — leído del DISCO, no de una lista.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE (issue #42).
 *
 * `element-registry.json` declaraba `name`, `alias`, `tag` y `tier`. No
 * declaraba framework. Y sin embargo el framework ya estaba en todas partes:
 * `ElementFramework` en `element-manifest.schema.ts`, `FrameworkKind` en
 * `component-resolution.contract.ts` —los dos con los mismos cuatro valores
 * escritos por separado, hoy uno alias del otro— y el segmento que
 * `publish.mjs` escribe en la ruta del CDN
 * (`synergos/<element>/<framework>/latest/`).
 *
 * O sea que la CDN sabe de qué framework es cada bundle y **lo que el CMS lee,
 * no**. Los 132 eran Angular IMPLÍCITO, y una clave que no se emite cuando el
 * otro lado la resuelve con un valor por defecto no deja un hueco: **afirma
 * ese valor**, y lo afirma sin que nadie lo haya decidido. Es
 * `feedback_an_omitted_key_can_be_an_assertion` del repo hermano, con el
 * agravante de que acá el valor por defecto ni siquiera está escrito: sale de
 * que `PLATFORMS` tiene hoy un solo miembro.
 *
 * LA SALIDA NO ES PONER `'angular'` POR DEFECTO. Eso es escribir la
 * suposición en vez de medirla, que es exactamente lo que hacía el agujero.
 * Se MIDE: la fuente de verdad es la misma que usa el build
 * (`platforms/angular/tools/build.mjs`) — cada carpeta bajo `apps/` con un
 * la entrada que su plataforma declara es un elemento, y la plataforma que la
 * contiene es su
 * framework. 130 de los 132 se derivan así.
 *
 * LOS DOS QUE NO, y por qué van con su razón escrita al lado: `stat-counter` y
 * `module-mount` están en el registry y **no los construye nada** —
 * `tools/element-contract-audit.mjs` ya los nombra uno por uno como «registry
 * entries with no buildable project»—. Para ésos el framework no es un hecho
 * medido: es una declaración, y por eso se escribe donde se vea, con su
 * motivo, y el gate la cruza EN LOS DOS SENTIDOS. Una excepción que ya no hace
 * falta —el día que alguien escriba el elemento— rompe el build, porque una
 * excepción que sobra deja de leerse.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { PLATFORMS } from './synergos-config.mjs';

/**
 * Las plataformas que publican elementos, y dónde viven sus fuentes.
 *
 * Se DERIVA de `PLATFORMS`, que es lo que decide de verdad quién construye y
 * publica. Escribir acá `[{ framework: 'angular', … }]` habría dejado el
 * nombre de la plataforma en un tercer sitio: `PLATFORMS`, `ALL_FRAMEWORKS` y
 * esto, y el día que vuelva otra plataforma hay que acordarse de los tres.
 * Es la misma trampa que este fichero persigue con el framework de un elemento.
 *
 * La carpeta de fuentes es `platforms/<nombre>/apps` por convención — la misma
 * que recorre `platforms/angular/tools/build.mjs`.
 */
export const PLATAFORMAS = PLATFORMS.map((p) => ({
  framework: p.name,
  apps: `platforms/${p.name}/apps`,
  // La declara la plataforma (ver `PLATFORMS`).
  //
  // ⚠ NO lleva `?? 'src/main.ts'`, y la razón NO es la que escribí primero.
  // Puse que un default dejaría a una plataforma sin declarar «descubriendo cero
  // elementos en silencio», y al mutarlo —quitar la declaración de Angular y
  // poner el default— los 42 tests pasaron en VERDE: con default o sin él, una
  // plataforma que no declara entrada descubre cero y falla igual de fuerte
  // (`undefined` tampoco existe como fichero). O sea que la ventaja que afirmaba
  // no existe, y afirmarla era documentación por delante del código.
  //
  // La razón que SÍ se sostiene es más modesta: un default escribe la convención
  // `src/main.ts` en un SEGUNDO sitio, y en este repo la segunda copia de una
  // regla es la que se desvía (la tabla del import map, #58; `TIER_BY_NAME`,
  // #43). Sin default hay un solo sitio donde mirar.
  entrada: p.entrada,
}));

/**
 * Los tiers tal como se escriben en el disco: `apps/elements/<plural>/<nombre>`.
 * El singular es el valor del registry.
 */
const TIER_POR_CARPETA = new Map([
  ['primitives', 'primitive'],
  ['compositions', 'composition'],
  ['modules', 'module'],
]);

/**
 * Entradas del registry que NINGUNA plataforma construye, con el framework que
 * declaran y por qué se les cree.
 *
 * Entrar acá exige escribir la razón, y salir es automático: si algún día el
 * elemento tiene fuente, el gate exige que la entrada se borre de esta tabla.
 */
export const SIN_FUENTE_PROPIA = {
  'stat-counter': {
    framework: 'angular',
    razon:
      'declarado en el registry y sin fuente en ninguna plataforma — publish.mjs lo ' +
      'reporta como "not built" y element-contract-audit ya lo nombra. Declara angular ' +
      'porque es la única plataforma que publica; el día que alguien lo escriba, se mide.',
  },
  'module-mount': {
    framework: 'angular',
    razon:
      'mismo caso: su DocType existe en el CMS (elementSynModuleMount) y el Web Component ' +
      'no. Monta una app Angular en la página, así que si llega a existir será angular — ' +
      'pero eso no lo sabe el disco todavía.',
  },
};

/**
 * Los elementos que existen A PROPÓSITO en más de una plataforma (#59).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DECISIÓN, Y SU MITAD INCÓMODA.
 *
 * ¿Puede un mismo elemento existir en dos frameworks a la vez? **Sí, y no
 * deberíamos tener esas cosas así.** Las dos mitades importan: se habilita
 * porque la épica #37 no se puede contestar sin ello —el experimento es el
 * MISMO `badge` en dos plataformas, midiendo los dos pisos de peso— y se
 * declara una por una porque **no es la forma normal de escribir un elemento**.
 * Un `badge` de React que fuera producto sería otro elemento, con su nombre y
 * su DocType; lo que vive acá es un ESCAPARATE.
 *
 * Por eso no es una bandera ni una convención de nombres: es un censo, como
 * `SIN_FUENTE_PROPIA`, y se vigila **en los dos sentidos**. Un duplicado sin
 * declarar rompe el build —era el defecto: la fuente de una plataforma
 * desaparecía en silencio— y una declaración cuyo elemento ya no está duplicado
 * también, porque una excepción que sobra deja de leerse.
 *
 * **Hoy está VACÍO, y eso es el estado correcto**: sólo hay una plataforma
 * construible, así que no hay nada que declarar. La primera entrada la escribe
 * #64 junto con el elemento.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const SHOWCASE_MULTIPLATAFORMA = {
  // 'badge': { razon: 'El experimento de la épica #37: el mismo elemento en dos ' +
  //                   'plataformas para medir los dos pisos de peso (#64).' },
};

/** `synergos-text-block` → `text-block` */
export function slugDeTag(tag) {
  return tag.startsWith('synergos-') ? tag.slice('synergos-'.length) : tag;
}

/**
 * Recorre las plataformas y devuelve dónde vive la fuente de cada elemento.
 *
 * El disco se **inyecta** —`listar` y `existe`— por la misma razón que en
 * `cdn-runtime-check.mjs`: es lo que permite probar el gate sin montar un árbol
 * de ficheros de mentira.
 *
 * @param {{ listar: (dir: string) => string[], existe: (ruta: string) => boolean,
 *           plataformas?: typeof PLATAFORMAS }} io
 * @returns {Map<string, { framework: string, dir: string, tier: string|null }>}
 */
export function descubrirFuentes(io) {
  const fuentes = new Map();
  // Primera gana, no última — y sólo importa en el camino de error, porque una
  // colisión la rechaza `revisarFuentesDuplicadas`. Se fija para que el informe
  // sea estable: con «última gana» el mismo árbol da resultados distintos según
  // el orden de `PLATAFORMAS`, y eso convierte un fallo en algo que «a veces
  // pasa».
  for (const fuente of todasLasFuentes(io)) {
    if (!fuentes.has(fuente.nombre)) {
      fuentes.set(fuente.nombre, { framework: fuente.framework, dir: fuente.dir, tier: fuente.tier });
    }
  }
  return fuentes;
}

/**
 * El recorrido crudo: TODAS las fuentes, sin colapsar por nombre.
 *
 * Es la pieza que faltaba (#59). `descubrirFuentes` devuelve un `Map` por
 * nombre de elemento, así que con dos plataformas que tengan el mismo elemento
 * una desaparecía **sin decirlo** — y lo que se ponía rojo era el cruce contra
 * el registry, con un mensaje que **culpaba al registry**:
 *
 *   > `badge: declara framework "angular" y el disco dice "react" (fuente propia).`
 *
 * Quien leyera eso corregiría la entrada a `react` y dejaría de publicar el
 * bundle de Angular sin haber decidido nada. La verdad —«hay DOS fuentes para
 * este elemento»— no la decía nadie. Es la regla 25 en la fuente en vez de en
 * el CDN: un recorrido que colapsa una dimensión no falla, contesta sobre el
 * sitio equivocado.
 *
 * Vive acá y no en un segundo recorrido porque la regla de qué cuenta como
 * fuente —la entrada que declara la plataforma— tiene que estar escrita **una
 * vez**. Con dos
 * copias, la de al lado se desvía; es lo que costó la tabla del import map de
 * #58.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTA REGLA DA POR HECHO, ANOTADO EN VEZ DE ARREGLADO ACÁ (#59 → #62).
 *
 * ✅ **DECIDIDO EN #64: la entrada la DECLARA cada plataforma.** Esto decía que
 * una fuente es `<dir>/src/main.ts` **con esa extensión**, y avisaba de que un
 * `platforms/preact/` con `main.tsx` —lo normal en JSX— descubriría **CERO**
 * elementos y fallaría *por la razón equivocada*, mandando a alguien a mirar el
 * registry. Pasó exactamente eso en cuanto hubo una segunda plataforma.
 *
 * La salida NO fue aceptar `.tsx` «por si acaso» —eso es escribir una suposición
 * sobre un contrato que nadie escribió—. `PLATFORMS[].entrada` lo dice: Angular
 * declara `src/main.ts`, Preact declara `src/main.tsx`, la tercera declara la
 * suya. Se escribe **una vez**, en la misma tabla que ya declara
 * `resolveBundlePath`, y **sin default**: una plataforma que se olvide de
 * declararla rompe, en vez de descubrir cero elementos callando.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * @returns {{ nombre: string, framework: string, dir: string, tier: string|null }[]}
 */
export function todasLasFuentes({ listar, existe, plataformas = PLATAFORMAS }) {
  const encontradas = [];

  for (const plataforma of plataformas) {
    const recorrer = (dir) => {
      for (const nombre of listar(dir)) {
        const completo = `${dir}/${nombre}`;
        if (existe(`${completo}/${plataforma.entrada}`)) {
          // El tier sale del segmento de carpeta cuando lo hay. `apps/domains/`
          // y `apps/experiences/` no lo llevan: ahí el tier lo sabe el registry
          // y no el disco, y decir `null` es decir la verdad.
          const segmentos = completo.split('/');
          const tier = TIER_POR_CARPETA.get(segmentos[segmentos.length - 2]) ?? null;
          encontradas.push({ nombre, framework: plataforma.framework, dir: completo, tier });
        } else {
          recorrer(completo);
        }
      }
    };
    recorrer(plataforma.apps);
  }

  return encontradas;
}

/**
 * Dos plataformas con fuente para el MISMO nombre de elemento (#59).
 *
 * **Nombra las dos rutas; no elige.** Elegir es lo que hacía el `Map`, y el
 * precio era que el error salía en otro sitio culpando a otro fichero.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTO RECHAZA BAJO LAS DOS LECTURAS POSIBLES, Y POR ESO SE PUEDE ESCRIBIR HOY.
 *
 * La pregunta de producto que #59 abre —**¿un mismo elemento puede existir en
 * dos frameworks a la vez?**— NO está contestada, y este gate no la contesta:
 *
 *   - **(A) un elemento, un framework** — un `badge` de React es *otro*
 *     elemento, con su nombre y su DocType. Dos fuentes son un error, punto.
 *   - **(B) un elemento, N implementaciones** — que es lo que el registry
 *     PUBLICADO ya modela (`implementations` es un mapa) y lo que hace falta
 *     para el experimento de la épica: el MISMO badge en dos frameworks,
 *     midiendo los dos pisos de peso. Ahí dos fuentes son legítimas **y el
 *     rechazo sigue haciendo falta**, porque el `Map` colapsado publicaría una
 *     sola de las dos en silencio.
 *
 * O sea: bajo (A) el error es el veredicto; bajo (B) es el aviso de que hay que
 * enseñarle al pipeline a publicar las dos. Lo que NO se puede dejar es que
 * desaparezca una fuente sin que nada lo diga. El día que se decida (B), este
 * gate cambia de mensaje —no de sitio— y `elegirPlataforma` deja de rechazar.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * @returns {string[]} Líneas de error. Vacío es que cuadra.
 */
export function revisarFuentesDuplicadas(io, censo = SHOWCASE_MULTIPLATAFORMA) {
  const errores = [];
  const duplicados = new Set();

  for (const [nombre, encontradas] of implementacionesPorNombre(io)) {
    if (encontradas.length < 2) continue;
    duplicados.add(nombre);

    // Declarado: es un escaparate y el publicador saca las dos. No es un error.
    if (nombre in censo) continue;

    errores.push(
      `${nombre}: tiene fuente en ${encontradas.length} plataformas — ` +
        encontradas.map((f) => `${f.framework} (${f.dir})`).join('  |  ') +
        `. Sin declarar, el descubrimiento devuelve UNA y la otra no se publica; el cruce ` +
        `contra el registry se pondría rojo culpando a la entrada del registry, que no tiene ` +
        `la culpa. O son dos elementos con nombres distintos —que es lo normal— o es un ` +
        `escaparate y va en SHOWCASE_MULTIPLATAFORMA con su razón (ver #59).`,
    );
  }

  // El otro sentido. Una declaración sobre un elemento que ya no está duplicado
  // deja de leerse, y la siguiente que entre lo hará sin discusión.
  for (const [nombre, { razon }] of Object.entries(censo)) {
    if (duplicados.has(nombre)) continue;
    errores.push(
      `SHOWCASE_MULTIPLATAFORMA declara "${nombre}" y no tiene fuente en más de una ` +
        `plataforma. Borrá la declaración (razón que sobra: "${razon}").`,
    );
  }

  return errores;
}

/** Todas las fuentes agrupadas por nombre de elemento, en orden estable. */
function implementacionesPorNombre(io) {
  const porNombre = new Map();
  for (const fuente of todasLasFuentes(io)) {
    if (!porNombre.has(fuente.nombre)) porNombre.set(fuente.nombre, []);
    porNombre.get(fuente.nombre).push(fuente);
  }
  return [...porNombre].sort();
}

/**
 * En qué plataformas vive un elemento, en orden.
 *
 * Existe para que el publicador no tenga que volver a recorrer: quien publica
 * un escaparate necesita LAS DOS, y la regla de qué cuenta como fuente ya está
 * escrita una vez.
 *
 * @returns {string[]} Los frameworks, ordenados.
 */
export function implementacionesDe(nombre, io) {
  const encontradas = implementacionesPorNombre(io).find(([n]) => n === nombre);
  return encontradas ? encontradas[1].map((f) => f.framework).sort() : [];
}

/**
 * De qué framework es una entrada del registry, y de dónde sale esa respuesta.
 *
 * El orden importa: fuente propia > implementación compartida > declaración con
 * razón escrita. Varios tipos del CMS comparten UN web component —`heading`,
 * `paragraph`, `rich-text`, `eyebrow`, `quote` y `label` los pinta el mismo
 * `synergos-text-block`— y `publish.mjs` ya lo resuelve cayendo al `dist/` del
 * tag; acá se hace lo mismo para no inventar una segunda regla.
 *
 * @returns {{ framework: string, origen: string, razon?: string } | null}
 */
export function resolverFramework(entrada, fuentes) {
  const propia = fuentes.get(entrada.name);
  if (propia) return { framework: propia.framework, origen: 'fuente propia' };

  const slug = slugDeTag(entrada.tag);
  const compartida = slug === entrada.name ? undefined : fuentes.get(slug);
  if (compartida) {
    return { framework: compartida.framework, origen: `implementación compartida: ${slug}` };
  }

  const declarada = SIN_FUENTE_PROPIA[entrada.name];
  if (declarada) {
    return { framework: declarada.framework, origen: 'declarado sin fuente', razon: declarada.razon };
  }

  return null;
}

/**
 * El tier que sabe el DISCO, o `null` si el disco no lo sabe.
 *
 * Sólo lo sabe para lo que vive bajo `apps/elements/<tier>s/`. Para la tienda
 * (`apps/domains/shop/`) y las experiences no hay segmento de tier, y fingir
 * uno sería la misma fabricación que este repo persigue en otros diez sitios.
 */
export function tierDelDisco(nombre, fuentes) {
  return fuentes.get(nombre)?.tier ?? null;
}

/**
 * Cruza el `framework` declarado por cada entrada contra el medido.
 *
 * Los cuatro errores que puede dar, y por qué cada uno es un error y no un aviso:
 *
 *   - **no declara framework** → publicar una entrada sin framework significa
 *     elegirle uno en silencio, que es el defecto entero del issue #42.
 *   - **declara uno que el disco desmiente** → el bundle se publicaría bajo un
 *     slot que miente sobre quién lo produjo.
 *   - **no hay fuente ni declaración** → nadie sabe de qué framework es. No se
 *     adivina.
 *   - **excepción que ya no hace falta** → alguien escribió la fuente y la
 *     tabla sigue afirmando que no existe. Una excepción que sobra deja de
 *     leerse, y la siguiente que entre lo hará sin discusión.
 *
 * @returns {string[]} Líneas de error. Vacío es que todo cuadra.
 */
export function revisarFrameworks(registro, fuentes, frameworksValidos) {
  const errores = [];

  for (const entrada of registro) {
    const medido = resolverFramework(entrada, fuentes);

    if (medido === null) {
      errores.push(
        `${entrada.name}: ninguna plataforma tiene su fuente y no está en SIN_FUENTE_PROPIA. ` +
          `Escribí el elemento, o declaralo ahí con su razón.`,
      );
      continue;
    }

    if (entrada.framework === undefined) {
      errores.push(
        `${entrada.name}: no declara "framework" en element-registry.json (el disco dice ` +
          `"${medido.framework}", vía ${medido.origen}).`,
      );
      continue;
    }

    if (!frameworksValidos.includes(entrada.framework)) {
      errores.push(
        `${entrada.name}: framework "${entrada.framework}" no es uno de ${frameworksValidos.join(', ')}.`,
      );
      continue;
    }

    if (entrada.framework !== medido.framework) {
      errores.push(
        `${entrada.name}: declara framework "${entrada.framework}" y el disco dice ` +
          `"${medido.framework}" (${medido.origen}).`,
      );
    }
  }

  const porNombre = new Map(registro.map((e) => [e.name, e]));
  for (const [nombre, { razon }] of Object.entries(SIN_FUENTE_PROPIA)) {
    const entrada = porNombre.get(nombre);
    if (!entrada) {
      errores.push(`SIN_FUENTE_PROPIA nombra "${nombre}", que no está en el registry. Sobra.`);
      continue;
    }
    const propia = fuentes.get(nombre) ?? (slugDeTag(entrada.tag) === nombre ? undefined : fuentes.get(slugDeTag(entrada.tag)));
    if (propia) {
      errores.push(
        `SIN_FUENTE_PROPIA nombra "${nombre}" y su fuente YA existe en ${propia.dir}. ` +
          `Borrá la excepción: el framework se mide (razón que sobra: "${razon}").`,
      );
    }
  }

  return errores;
}

/**
 * Qué plataforma publica esta entrada, y qué decir cuando ninguna puede.
 *
 * Vive acá y no dentro de `publish.mjs` por lo mismo que `revisarRuntime`: una
 * comprobación cableada dentro del publicador no se puede ver fallar sin montar
 * un CDN a medias, y una comprobación que nadie vio fallar no vigila nada. Los
 * dos casos que distingue importan por separado:
 *
 *   - **ninguna plataforma se llama como el framework declarado** → la entrada
 *     no puede llegar al CDN por ningún camino, y el resumen de "skipped
 *     (not built)" la enterraría entre las que simplemente no se construyeron
 *     esta vez.
 *   - **hay bundle construido en OTRA plataforma** → el slot del CDN lleva el
 *     framework en la ruta, así que publicarlo ahí deja el manifiesto mintiendo
 *     sobre quién produjo el bundle. Hoy no puede pasar porque sólo hay una
 *     plataforma; el día que vuelva otra, pasa el primer día.
 *
 * **Y el tercer caso, desde #59: el ESCAPARATE.** Un elemento declarado en
 * `SHOWCASE_MULTIPLATAFORMA` existe en dos plataformas a propósito, así que ahí
 * un bundle de la otra no es que mienta: es el punto. Se devuelven LAS DOS y el
 * publicador saca las dos —el registry publicado ya modela `implementations`
 * como un mapa y `upsertCdnRegistryEntry` conserva las demás entradas—. Sin la
 * declaración se sigue rechazando, que es lo que impide que un duplicado por
 * accidente se publique como si fuera intencional.
 *
 * **Devuelve `plataformas` en plural incluso con una.** Es una lista de un
 * elemento en el caso normal, y así quien publica no tiene dos formas que
 * distinguir — `publish.mjs` ya iteraba sobre `[eleccion.plataforma]`, así que
 * el cambio ahí es quitar los corchetes.
 *
 * @param {{ name: string, framework: string }} entrada
 * @param {{ name: string, resolveBundlePath: (n: string) => string }[]} plataformas
 * @param {(ruta: string) => boolean} existe
 * @param {Record<string, {razon: string}>} [censo] El de escaparates.
 * @returns {{ plataformas: object[] } | { error: string }}
 */
export function elegirPlataforma(entrada, plataformas, existe, censo = SHOWCASE_MULTIPLATAFORMA) {
  const suya = plataformas.find((p) => p.name === entrada.framework);

  if (!suya) {
    return {
      error:
        `${entrada.name}: declara framework "${entrada.framework}" y ninguna plataforma lo ` +
        `publica (hay: ${plataformas.map((p) => p.name).join(', ')}).`,
    };
  }

  const otrasConBundle = plataformas.filter(
    (p) => p.name !== entrada.framework && existe(p.resolveBundlePath(entrada.name)),
  );

  if (otrasConBundle.length === 0) return { plataformas: [suya] };

  if (entrada.name in censo) {
    // El orden sale de `plataformas`, no del descubrimiento: el publicador
    // escribe un slot por framework y el informe tiene que leerse igual en dos
    // máquinas.
    return { plataformas: plataformas.filter((p) => p === suya || otrasConBundle.includes(p)) };
  }

  return {
    error:
      `${entrada.name}: declara framework "${entrada.framework}" y hay un bundle construido ` +
      `en la plataforma "${otrasConBundle[0].name}". Uno de los dos miente — o es un ` +
      `escaparate y va en SHOWCASE_MULTIPLATAFORMA con su razón (#59).`,
  };
}

/**
 * El tier de un elemento, sin adivinar (issue #43).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE HABÍA ANTES, Y POR QUÉ ERA PEOR QUE NO TENER NADA.
 *
 * `cms-sync.mjs` llevaba `TIER_BY_NAME`, 90 entradas a mano, y para lo que no
 * estaba ahí escribía `composition` y **sobreescribía el tier del registry**.
 * No es cosmético: el presupuesto de tamaño elige el techo POR TIER, así que
 * degradar un `module` a `composition` le baja el techo de 72 KB a 44 KB, en
 * silencio. Está documentado como la regla 2 del CLAUDE.md porque ya pasó.
 *
 * Y la tabla era **una copia**: se comprobaron las 90 contra el registry y las
 * 90 decían exactamente lo mismo. O sea que el dato correcto siempre estuvo
 * ahí, y lo que hacía falta era leerlo en vez de mantener un duplicado.
 *
 * Las dos fuentes reales, en orden, y el silencio como tercera opción borrada:
 *
 *   1. **la entrada del registry** — es el dato autorado, el que alguien
 *      decidió.
 *   2. **la carpeta donde vive la fuente** (`apps/elements/<tier>s/<nombre>`),
 *      que es el disco diciéndolo.
 *   3. **nada**. Un elemento nuevo del CMS sin componente todavía necesita que
 *      una persona decida si es un primitivo o una aplicación entera. Ese «no
 *      sé» no se rellena: se para y se dice.
 *
 * Y si los dos primeros contestan cosas distintas, tampoco se elige uno: eso es
 * que la fuente se movió de carpeta o que el registry quedó viejo, y las dos
 * merecen que alguien mire.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * @param {{ alias: string, name: string }} entrada
 * @param {Map<string, object>} registroPorAlias
 * @param {Map<string, object>} fuentes
 * @returns {{ tier: string, origen: string } | { error: string }}
 */
export function resolverTier(entrada, registroPorAlias, fuentes) {
  const delRegistry = registroPorAlias.get(entrada.alias)?.tier ?? null;
  const delDisco = tierDelDisco(entrada.name, fuentes);

  if (delRegistry && delDisco && delRegistry !== delDisco) {
    return {
      error:
        `${entrada.name}: el registry dice tier "${delRegistry}" y su fuente vive en ` +
        `${fuentes.get(entrada.name).dir} ("${delDisco}"). Uno de los dos hay que moverlo.`,
    };
  }

  if (delRegistry) return { tier: delRegistry, origen: 'registry' };
  if (delDisco) return { tier: delDisco, origen: 'carpeta de la fuente' };

  return {
    error:
      `${entrada.name} (${entrada.alias}): no está en el registry y no tiene fuente bajo ` +
      `apps/elements/<tier>s/, así que nadie sabe su tier. Antes esto escribía ` +
      `"composition" y le bajaba el techo de tamaño a 44 KB sin decir nada. ` +
      `Escribí el Web Component, o añadí la entrada al registry con su tier.`,
  };
}
