/**
 * De qué framework es cada elemento — leído del DISCO, no de una lista.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE (issue #42).
 *
 * `element-registry.json` declaraba `name`, `alias`, `tag` y `tier`. No
 * declaraba framework. Y sin embargo el framework ya estaba en todas partes:
 * el tipo `ElementFramework` lo declara `element-manifest.schema.ts`, el tipo
 * `FrameworkKind` lo declara `component-resolution.contract.ts`, y
 * `publish.mjs` escribe el segmento en la ruta del CDN
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
 * `src/main.ts` es un elemento, y la plataforma que la contiene es su
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

/** Las plataformas que publican elementos, y dónde viven sus fuentes. */
export const PLATAFORMAS = [{ framework: 'angular', apps: 'platforms/angular/apps' }];

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
      'declarado en el registry y sin src/main.ts en ninguna plataforma — publish.mjs lo ' +
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
export function descubrirFuentes({ listar, existe, plataformas = PLATAFORMAS }) {
  const fuentes = new Map();

  for (const plataforma of plataformas) {
    const recorrer = (dir) => {
      for (const nombre of listar(dir)) {
        const completo = `${dir}/${nombre}`;
        if (existe(`${completo}/src/main.ts`)) {
          // El tier sale del segmento de carpeta cuando lo hay. `apps/domains/`
          // y `apps/experiences/` no lo llevan: ahí el tier lo sabe el registry
          // y no el disco, y decir `null` es decir la verdad.
          const segmentos = completo.split('/');
          const tier = TIER_POR_CARPETA.get(segmentos[segmentos.length - 2]) ?? null;
          fuentes.set(nombre, { framework: plataforma.framework, dir: completo, tier });
        } else {
          recorrer(completo);
        }
      }
    };
    recorrer(plataforma.apps);
  }

  return fuentes;
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
 * @param {{ name: string, framework: string }} entrada
 * @param {{ name: string, resolveBundlePath: (n: string) => string }[]} plataformas
 * @param {(ruta: string) => boolean} existe
 * @returns {{ plataforma: object } | { error: string }}
 */
export function elegirPlataforma(entrada, plataformas, existe) {
  const suya = plataformas.find((p) => p.name === entrada.framework);

  if (!suya) {
    return {
      error:
        `${entrada.name}: declara framework "${entrada.framework}" y ninguna plataforma lo ` +
        `publica (hay: ${plataformas.map((p) => p.name).join(', ')}).`,
    };
  }

  const intrusa = plataformas.find(
    (p) => p.name !== entrada.framework && existe(p.resolveBundlePath(entrada.name)),
  );
  if (intrusa) {
    return {
      error:
        `${entrada.name}: declara framework "${entrada.framework}" y hay un bundle construido ` +
        `en la plataforma "${intrusa.name}". Uno de los dos miente.`,
    };
  }

  return { plataforma: suya };
}
