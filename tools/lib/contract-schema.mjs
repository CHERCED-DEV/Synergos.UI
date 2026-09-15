/**
 * Lee el contrato TypeScript del manifiesto y lo deja usable desde las
 * herramientas `.mjs`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ HACE FALTA (issue #43).
 *
 * `vitals/contracts/src/element-manifest.schema.ts` declara `ElementManifest`
 * —el contrato de la CDN, con todas las letras— y **no lo importaba nadie**:
 * sólo su propio `index.ts`. El que ESCRIBE el manifiesto es
 * `tools/lib/manifest-builder.mjs`, un `.mjs` sin tipos. O sea: la interfaz
 * decía una cosa, el artefacto publicado decía otra, y nada cruzaba las dos.
 * Se generaba, se publicaba y se tiraba.
 *
 * Eso es `feedback_contract_shape_needs_its_own_test` del repo hermano: lo que
 * hay que vigilar es **la CLAVE SERIALIZADA**, porque quien la lee es
 * defensivo y una clave que falta degrada en silencio. Y la mutación que lo
 * prueba no es borrar el campo —en un `.mjs` eso ni siquiera rompe nada—: es
 * **renombrar la clave que se emite**, que es la forma real de la deriva.
 *
 * PARSEAR FUENTE TIENE PUNTOS CIEGOS, Y ESTE FICHERO LOS NOMBRA. La regla del
 * repo hermano —`feedback_a_gate_that_parses_source_needs_its_own_mutations`—
 * dice que un gate que lee código con regex saca un número plausible y nadie
 * lo cruza. Los tres cortes que aquí importan, cada uno probado contra el caso
 * feo del fichero de verdad y no contra el bonito:
 *
 *   1. **Se parsea SIN comentarios.** El fichero documenta las rutas del CDN
 *      dentro de un bloque `/** … *\/` que contiene `{element}`, `:` y `/`. Un
 *      parser que no los quite primero se come llaves y dos puntos que no son
 *      código.
 *   2. **Las llaves se BALANCEAN, no se busca la primera `}`.** Un campo con
 *      tipo objeto en línea cerraría la interfaz veinte líneas antes de
 *      tiempo, y el gate se quedaría corto — en verde.
 *   3. **Sólo cuentan los campos de profundidad 1.** Un tipo anidado aporta
 *      claves que no son del manifiesto.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Quita comentarios de bloque y de línea, respetando las cadenas.
 *
 * No es un tokenizador de TypeScript y no pretende serlo: lo único que tiene
 * que sobrevivir intacto son los literales de cadena, porque de ahí salen los
 * valores de las uniones (`'angular' | 'react' | …`).
 */
export function sinComentarios(fuente) {
  let salida = '';
  let i = 0;
  let cadena = null;

  while (i < fuente.length) {
    const c = fuente[i];
    const siguiente = fuente[i + 1];

    if (cadena) {
      salida += c;
      if (c === '\\') {
        salida += siguiente ?? '';
        i += 2;
        continue;
      }
      if (c === cadena) cadena = null;
      i += 1;
      continue;
    }

    if (c === "'" || c === '"' || c === '`') {
      cadena = c;
      salida += c;
      i += 1;
      continue;
    }

    if (c === '/' && siguiente === '*') {
      const fin = fuente.indexOf('*/', i + 2);
      i = fin === -1 ? fuente.length : fin + 2;
      // Un salto, para que las líneas no se peguen y el `;` de arriba siga
      // cerrando lo que cerraba.
      salida += '\n';
      continue;
    }

    if (c === '/' && siguiente === '/') {
      const fin = fuente.indexOf('\n', i);
      i = fin === -1 ? fuente.length : fin;
      continue;
    }

    salida += c;
    i += 1;
  }

  return salida;
}

/**
 * Los valores de una unión de literales de cadena declarada como `export type`.
 *
 * @example valoresDeUnion(src, 'ElementFramework') → ['angular','react','svelte','vanilla']
 * @returns {string[]} Vacío si el tipo no está o no es una unión de cadenas.
 */
export function valoresDeUnion(fuente, nombre) {
  const limpio = sinComentarios(fuente);
  const re = new RegExp(`\\btype\\s+${nombre}\\s*=([^;]*);`, 'u');
  const m = limpio.match(re);
  if (!m) return [];
  return [...m[1].matchAll(/'([^']*)'/gu)].map((x) => x[1]);
}

/**
 * Los nombres de campo de PRIMER NIVEL de una interfaz.
 *
 * Devuelve el nombre tal como se serializa, sin el `?` de opcional: lo que hay
 * que cruzar contra el JSON es la clave, y que sea opcional es otra pregunta.
 *
 * @returns {{ nombre: string, opcional: boolean }[]}
 */
export function camposDeInterfaz(fuente, nombre) {
  const limpio = sinComentarios(fuente);
  const cabecera = new RegExp(`\\binterface\\s+${nombre}\\b[^{]*\\{`, 'u');
  const m = limpio.match(cabecera);
  if (!m) return [];

  // Balanceo de llaves — ver punto 2 de la cabecera.
  let i = m.index + m[0].length;
  let profundidad = 1;
  const inicio = i;
  while (i < limpio.length && profundidad > 0) {
    if (limpio[i] === '{') profundidad += 1;
    else if (limpio[i] === '}') profundidad -= 1;
    i += 1;
  }
  const cuerpo = limpio.slice(inicio, i - 1);

  // Los campos se cortan por `;` o salto de línea **a profundidad 0**, no por
  // línea. Cortar por línea es lo que uno escribe primero y funciona contra el
  // fichero de verdad —que tiene un campo por línea— mientras falla en silencio
  // con `interface X { a: string; b?: number; }`, donde sólo vería `a`. Es el
  // punto ciego que describe `feedback_a_gate_that_parses_source_needs_its_own_mutations`:
  // un número plausible y nadie lo cruza. Lo destapó el spec, no la lectura.
  const segmentos = [];
  let acumulado = '';
  let interna = 0;
  for (const c of cuerpo) {
    if (c === '{' || c === '(' || c === '[' || c === '<') interna += 1;
    else if (c === '}' || c === ')' || c === ']' || c === '>') interna -= 1;

    if (interna === 0 && (c === ';' || c === '\n')) {
      segmentos.push(acumulado);
      acumulado = '';
      continue;
    }
    acumulado += c;
  }
  segmentos.push(acumulado);

  const campos = [];
  for (const segmento of segmentos) {
    // Una firma de índice (`[majorAlias: string]: string`) no empieza por
    // identificador, así que no entra — y no debe: no es una clave.
    const campo = segmento.trim().match(/^(?:readonly\s+)?([A-Za-z_$][\w$]*)(\??)\s*:/u);
    if (campo) campos.push({ nombre: campo[1], opcional: campo[2] === '?' });
  }

  return campos;
}
