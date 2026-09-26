/**
 * Todo método público de un `*-api.client.ts` tiene quien lo llame (#76).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DE DÓNDE SALE. La **regla 32** de `CLAUDE.md` midió que de los métodos públicos de los
 * diez clientes, **dos** no los llamaba nadie, y aplazó el gate diciendo lo correcto: *«lo
 * que falta para escribirlo no es el cruce sino decidir qué se hace con esos dos, porque
 * censarlos con “no los llama nadie” sería un ticket sin abrir disfrazado de excepción»*.
 *
 * Al ir a decidirlo, la razón resultó más fuerte: **la ausencia de llamador estaba
 * ESCONDIENDO un defecto.** `realty::mortgage` apunta a un endpoint público y vivo que
 * contestaba una cuota **90,8×** alta —la tasa estaba a 100× entre los dos árboles— y nadie
 * lo había notado porque nadie llamaba. Quitarlo, que era la salida obvia para «código
 * muerto», habría borrado lo único que en los dos árboles apuntaba ahí (CMS#167).
 *
 * Así que el gate no dice «esto sobra»: dice **«esto no tiene llamador, decidí qué es»**. Y
 * lo que la decisión tiene que contestar es *por qué NO se cablea*, no *por qué no se cableó
 * todavía* — lo segundo es un ticket sin abrir con aspecto de excepción
 * (`feedback_a_census_entry_is_how_a_defect_survives_its_own_gate` del repo hermano).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ CUENTA COMO LLAMADOR, y qué NO.
 *
 * **Un spec no cuenta.** Es el corazón del cruce: el único llamador de `blogs::search` era un
 * spec que probaba el filtro de su mock con la red caída, o sea probaba el mock y no el
 * producto — y el endpoint que ese método pedía **no existe ni existió**. Contar los specs
 * habría dado 128 de 128 y cero hallazgos. Es la regla 5 un piso más arriba: allá un test que
 * llama al método no ve que falte el llamador; acá el gate no se deja convencer por ese test.
 *
 * **El propio cliente no cuenta.** Un método que sólo se llama desde dentro del cliente es
 * fontanería interna, y si además es público eso es otra cosa (visibilidad), no esto.
 *
 * **Y el llamador tiene que IMPORTAR el cliente.** Buscar `.<nombre>(` por todo el árbol
 * mediría «alguien nombra esto» en vez de «alguien llama a ESTE método» — la distinción que
 * costó su mutación al gate hermano `CamposDePeticionQueNadieLeeTests` del CMS, donde un
 * `Mode: v.Mode` sobre otro tipo con la misma propiedad lo hizo pasar en verde con el defecto
 * puesto.
 *
 * **Lo que esto NO caza, dicho para no mentir sobre su alcance:** un método llamado desde un
 * fichero que importa el cliente pero cuya llamada es sobre OTRO objeto con el mismo nombre de
 * método. Eso lo contaría como llamado. El sesgo va hacia el falso negativo —reporta de menos,
 * nunca de más— que es el lado correcto para un trinquete: un gate que acusa al bueno enseña a
 * ignorarlo.
 */

/** El sufijo que identifica a un cliente HTTP de un vertical. */
export const SUFIJO_CLIENTE = '-api.client.ts';

/**
 * Los métodos públicos SIN llamador que se aceptan, con su razón.
 *
 * Se vigila en los DOS sentidos: uno nuevo sin declarar rompe el build, y una entrada cuyo
 * método ya tiene llamador —o que ya no existe— también, porque una excepción que sobra deja
 * de leerse. Es la forma de `SIN_FUENTE_PROPIA` y de `SHOWCASE_MULTIPLATAFORMA`.
 */
export const SIN_LLAMADOR = {
  'realty::mortgage': {
    razon:
      'A propósito, y la razón contesta «por qué NO se cablea»: el spec del vertical (§4) decide ' +
      'que el cálculo base de la hipoteca es del CLIENTE —es una función pura y determinista— así ' +
      'que meterle una ida a la red no añade información y cuesta un viaje por pulsación. Cablear ' +
      'a la red algo que ya tiene dueño de este lado es el retroceso de ' +
      '`feedback_a_vertical_is_three_axes_and_only_one_crosses` del repo hermano. El sitio de ' +
      'aterrizaje está ENTERO —`mortgageServerResult` con precedencia servidor-gana y los cuatro ' +
      'setters de input invalidándolo— así que el día del disparador (spec §8: tasas de banco ' +
      'reales) cablear el disparo es una línea. Y no se borra porque era lo único que apuntaba al ' +
      'endpoint que CMS#167 encontró contestando 90,8× alto; hoy lo cruzan los vectores de oro, ' +
      'que no necesitan que nadie llame.',
    ticket: 'CHERCED-DEV/Synergos.UI#76',
  },
};

/**
 * Las palabras que no son un método aunque el corte las vea como tal.
 *
 * `constructor` es obvio; `if`/`for`/`while`/`switch`/`catch`/`return` aparecen como
 * `nombre(` al principio de una línea dentro de un cuerpo y el corte por indentación no las
 * distingue de una declaración. Se listan en vez de afinar el regex porque son finitas y
 * conocidas, y porque un regex que intente excluirlas es el `\s*` de bloque que este repo ya
 * pagó dos veces.
 */
const NO_SON_METODOS = new Set([
  'constructor', 'if', 'for', 'while', 'switch', 'catch', 'return', 'do', 'else', 'function',
  'get', 'set', 'new', 'await', 'typeof', 'super', 'this',
]);

/**
 * La fuente sin comentarios ni literales de cadena.
 *
 * **Hace falta en las dos mitades del cruce y por razones distintas**, y se midió cada una
 * en vez de afirmarlas: sin quitar comentarios, un `// TODO: llamar a this.#api.search(...)`
 * se cuenta como llamada (falso NEGATIVO: el método parece usado) y un `* async search(...)`
 * de un `@example` se cuenta como declaración (falso POSITIVO). Sin quitar literales, un
 * `'…/search?q='` no molesta hoy, pero una plantilla con `${x.search(y)}` sí.
 */
export function sinComentariosNiCadenas(fuente) {
  let salida = '';
  let i = 0;
  let enLinea = false;
  let enBloque = false;
  /** @type {string|null} */
  let comilla = null;

  while (i < fuente.length) {
    const c = fuente[i];
    const siguiente = fuente[i + 1];

    if (enLinea) {
      if (c === '\n') { enLinea = false; salida += c; }
      i += 1;
      continue;
    }
    if (enBloque) {
      if (c === '*' && siguiente === '/') { enBloque = false; i += 2; continue; }
      if (c === '\n') salida += c;   // se conservan los saltos: el corte de abajo es por línea
      i += 1;
      continue;
    }
    if (comilla) {
      if (c === '\\') { i += 2; continue; }
      if (c === comilla) { comilla = null; salida += ' '; }
      i += 1;
      continue;
    }
    if (c === '/' && siguiente === '/') { enLinea = true; i += 2; continue; }
    if (c === '/' && siguiente === '*') { enBloque = true; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') { comilla = c; salida += ' '; i += 1; continue; }

    salida += c;
    i += 1;
  }

  return salida;
}

/**
 * Los métodos públicos de un cliente.
 *
 * Se reconocen por la INDENTACIÓN de dos espacios —los miembros de la clase— con
 * `async`/`static` opcionales delante. Se dejan fuera `private`, `protected`, los `#privados`
 * y los `get`/`set`, que desde el llamador no son una llamada.
 */
export function metodosPublicos(fuente) {
  const limpia = sinComentariosNiCadenas(fuente);
  const metodos = [];

  for (const linea of limpia.split('\n')) {
    const m = /^ {2}(?:(private|protected|public|static|async|readonly)\s+)*([A-Za-z_$][\w$]*)\s*(?:<[^(]*>)?\s*\(/.exec(linea);
    if (!m) continue;
    if (/^ {2}(?:private|protected)\b/.test(linea)) continue;
    if (/^ {2}(?:async\s+)?(?:get|set)\s+[A-Za-z_$]/.test(linea)) continue;

    const nombre = m[2];
    if (NO_SON_METODOS.has(nombre)) continue;
    if (!metodos.includes(nombre)) metodos.push(nombre);
  }

  return metodos;
}

/**
 * Cruza los métodos de cada cliente contra sus llamadores.
 *
 * @param {ReadonlyArray<{vertical: string, cliente: string, fuente: string,
 *   vecinos: ReadonlyArray<{ruta: string, fuente: string}>}>} clientes
 *   `vecinos` son los ficheros que PUEDEN llamar: del mismo vertical, no specs, no el cliente.
 * @param {Record<string, {razon: string, ticket?: string}>} censo
 * @returns {{fallos: string[], medidos: number, sinLlamador: string[]}}
 */
export function cruzarLlamadores(clientes, censo = SIN_LLAMADOR) {
  const fallos = [];
  const sinLlamador = [];
  let medidos = 0;

  // Red de seguridad. Si el descubrimiento deja de ver —otra disposición, otro sufijo— todo lo
  // de abajo pasa sin mirar nada, y encima el segundo diente borraría el censo entero.
  if (clientes.length === 0) {
    return {
      fallos: ['no se descubrió ningún `*-api.client.ts`: el recorrido dejó de ver, y un cruce sobre cero clientes es un verde que no comprobó nada.'],
      medidos: 0,
      sinLlamador: [],
    };
  }

  for (const c of clientes) {
    for (const metodo of metodosPublicos(c.fuente)) {
      medidos += 1;
      const llamada = `.${metodo}(`;
      const llamado = c.vecinos.some((v) => sinComentariosNiCadenas(v.fuente).includes(llamada));
      if (llamado) continue;

      const clave = `${c.vertical}::${metodo}`;
      sinLlamador.push(clave);
      if (!(clave in censo)) {
        fallos.push(
          `\`${clave}\` es público y NADIE lo llama (fuera del propio cliente y de los specs). ` +
            'Decidí qué es: si el endpoint no existe, se quita; si existe, mirá qué contesta antes ' +
            'de borrarlo —CMS#167 vivía detrás de uno de éstos— y si se queda, declaralo en ' +
            '`SIN_LLAMADOR` con una razón que diga por qué NO se cablea.',
        );
      }
    }
  }

  // Y al revés: una entrada que ya no corresponde. Sin esto el censo se queda afirmando que
  // algo sigue sin llamador cuando ya lo tiene, y eso es cómo un censo empieza a mentir.
  for (const clave of Object.keys(censo)) {
    if (!sinLlamador.includes(clave)) {
      fallos.push(
        `\`${clave}\` está declarado en \`SIN_LLAMADOR\` y ya no corresponde: o tiene llamador, o el ` +
          'método ya no existe. Una excepción que sobra deja de leerse — borrá la entrada en el ' +
          'mismo commit.',
      );
    }
  }

  return { fallos, medidos, sinLlamador };
}
