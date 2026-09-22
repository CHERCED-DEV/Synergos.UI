/**
 * Gate — un humo que ESPERA un commit tiene que colgar de quien lo publica.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL DEFECTO QUE CIERRA (issue #74)
 *
 * `humo-cdn.yml` corría en cada push a master, calculaba `git rev-parse --short
 * HEAD` y se lo pasaba a `humo-cdn.mjs --sha`, o sea exigía que el CDN
 * estuviera sirviendo ESE commit. Su cabecera afirmaba «Cloudflare despliega en
 * cada push a master».
 *
 * Medido el 2026-09-22: NINGÚN workflow del repo publicaba. El CDN servía un
 * build del 12 con el commit `b951c77`, que no está en master, ni en el
 * respaldo anterior a la refirma, ni en ninguna rama — o sea que lo último
 * publicado salió de un `wrangler deploy` a mano desde un árbol que nunca llegó
 * a GitHub. El `--sha` no podía casar NUNCA: treinta intentos, cinco minutos y
 * rojo, en cada push, para siempre.
 *
 * Y el daño no fue el rojo: fue que ese rojo permanente era la ÚNICA señal de
 * que el CDN llevaba diez días congelado. Un gate que grita siempre deja de
 * leerse —este repo ya lo tiene escrito dos veces (#68 y `design-gates.yml` del
 * CMS)— así que la divergencia entre el repo y lo publicado se acumuló detrás
 * de una señal que nadie miraba porque siempre decía lo mismo.
 *
 * LA REGLA, Y POR QUÉ NO ES «PROHIBIDO --sha»
 *
 * Esperar un commit es legítimo: el borde de Cloudflare tarda en propagar y un
 * humo inmediato le pega a la versión anterior y la da por buena. Lo que
 * distingue el caso bueno del defecto no es el `--sha`, es DE DÓNDE SALE:
 *
 *   · si el workflow lo DERIVA solo (`git rev-parse`), está afirmando por su
 *     cuenta que el CDN debería estar sirviendo HEAD — y eso sólo es verdad si
 *     él mismo acaba de publicarlo;
 *   · si lo PIDE (`inputs.sha`), lo afirmó una persona que sabe por qué.
 *
 * De ahí los dos dientes, y los dos se derivan del YAML en disco.
 *
 * POR QUÉ SE QUITAN LOS COMENTARIOS — Y CONTRA QUÉ, QUE NO ES LO QUE PARECE
 *
 * Lo primero que escribí acá fue que sin quitarlos el gate se quedaba ciego.
 * Es falso, y lo desmintió medirlo: hoy NINGÚN token aparece sólo en prosa
 * —los tres que se buscan están en el código de `despliegue-cdn.yml` y
 * `humo-cdn.mjs` está en el de los dos—, así que con el barrido apagado el
 * cruce sobre el disco de hoy da exactamente lo mismo.
 *
 * Contra lo que protege es contra un FALSO POSITIVO, que es el sentido
 * contrario. Medido con el par de mutaciones que lo separa: añadiéndole a
 * `humo-cdn.yml` una nota que dice «antes esto hacía `git rev-parse` y lo
 * pasaba a --sha» —o sea la cabecera que este arreglo pide escribir— con el
 * barrido puesto sigue verde, y sin él el gate ACUSA al fichero que explica el
 * defecto de estar cometiéndolo. Un gate que se pone rojo por su propia
 * explicación enseña a ignorarlo, que es el daño que este ticket vino a
 * cerrar.
 *
 * O sea: el barrido no es la medida —el receptor del token lo es— y se conserva
 * igual, porque las dos cabeceras de este arreglo nombran las formas prohibidas
 * y la siguiente las nombrará también. Queda dicho cuál de las dos mitades
 * sostiene el cruce para no mentir sobre su alcance.
 *
 * LO QUE ESTE GATE NO HACE, POR LA MISMA RAZÓN
 *
 * No SIGUE la variable. Mira si el workflow, en su código, nombra `git rev-parse`
 * y `humo-cdn.mjs`; NO comprueba que el SHA derivado sea el que acaba en `--sha`.
 * Hacerlo exigiría interpretar el shell de cada `run:`, y lo único que se ganaría
 * es distinguir un caso que hoy no existe: un workflow que corra el humo y además
 * derive un SHA para otra cosa saldría acusado siendo inocente.
 *
 * Se elige la versión burda a propósito, porque el error que puede cometer es el
 * barato —le pide explicarse a quien junta las dos cosas— y no el caro, que sería
 * dejar pasar el #74 otra vez. Si alguna vez marca a uno legítimo, el arreglo NO
 * es relajar el diente: es partir ese `run:` en dos pasos, que además se lee
 * mejor. Un gate que se cree más listo de lo que es es peor que no tenerlo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Lo que el humo del CDN se llama en disco — la herramienta, no el workflow. */
const HERRAMIENTA = 'humo-cdn.mjs';

/** Lo que de verdad publica. `wrangler deploy` es el único que mueve el CDN. */
const PUBLICA = 'wrangler deploy';

/** Derivar el SHA por su cuenta: el workflow decidiendo qué debería haber arriba. */
const DERIVA_SHA = 'git rev-parse';

/**
 * Quita los comentarios de un YAML sin tocar lo que va dentro de comillas.
 *
 * NO es un parser y no pretende serlo: lo único que hace falta acá es que un
 * `#` de comentario no cuente como código. En YAML un `#` abre comentario sólo
 * al principio de línea o precedido de espacio, así que `--sha` de un `run:`
 * sobrevive y la prosa de la cabecera no.
 *
 * Se recorre carácter a carácter y NO con un regex de bloque: este fichero es
 * de sangría significativa, y un `[\s\S]*?` sobre un formato así tiene puntos
 * ciegos que no dejan hueco —deja al gate midiendo un subconjunto y diciendo
 * que miró todo—. Es la lección de `ComposeStackTests` del repo del CMS.
 */
export function sinComentarios(yaml) {
  const salida = [];

  for (const linea of yaml.split('\n')) {
    let comilla = null;   // null | "'" | '"'
    let corte = -1;

    for (let i = 0; i < linea.length; i++) {
      const c = linea[i];

      if (comilla) {
        // En YAML la comilla simple se escapa duplicándola; la doble, con \.
        if (c === '\\' && comilla === '"') { i++; continue; }
        if (c === comilla) { comilla = null; }
        continue;
      }

      if (c === "'" || c === '"') { comilla = c; continue; }

      if (c === '#' && (i === 0 || linea[i - 1] === ' ' || linea[i - 1] === '\t')) {
        corte = i;
        break;
      }
    }

    salida.push(corte === -1 ? linea : linea.slice(0, corte));
  }

  return salida.join('\n');
}

/**
 * @param {{nombre: string, yaml: string}[]} workflows  los `.yml` de
 *   `.github/workflows/`, leídos del disco por quien llama.
 * @returns {string[]} los motivos del rechazo; vacío = pasa.
 */
export function revisarHumoTrasDesplegar(workflows) {
  const motivos = [];

  // ── Red de seguridad ───────────────────────────────────────────────────
  //
  // Si el descubrimiento deja de ver, las dos listas salen vacías y el cruce
  // pasa en verde SIN MIRAR NADA — que es el modo de fallo caro: un rojo se
  // arregla y un verde sobre el vacío se hereda. Así que la ausencia de
  // sujeto es un fallo, no un «no aplica».
  if (workflows.length === 0) {
    return ['no se leyó ningún workflow: el gate no tiene sujeto que mirar'];
  }

  const vistos = workflows.map(({ nombre, yaml }) => {
    const codigo = sinComentarios(yaml);
    return {
      nombre,
      corre: codigo.includes(HERRAMIENTA),
      publica: codigo.includes(PUBLICA),
      derivaSha: codigo.includes(DERIVA_SHA),
    };
  });

  const humos = vistos.filter((w) => w.corre);
  if (humos.length === 0) {
    motivos.push(
      `ningún workflow corre \`${HERRAMIENTA}\`: el CDN se publicaría sin que nadie lo comprobara (issue #9)`,
    );
  }

  // ── Diente 1: quien se inventa el SHA, publica ─────────────────────────
  for (const w of humos) {
    if (w.derivaSha && !w.publica) {
      motivos.push(
        `${w.nombre}: pasa un SHA que deriva él mismo (\`${DERIVA_SHA}\`) a \`${HERRAMIENTA}\`, ` +
          `y no publica (\`${PUBLICA}\`). Espera un commit que nada de este repo sube: ` +
          `se agota y sale rojo en cada corrida. Si lo tiene que esperar, que lo despliegue; ` +
          `si lo pide una persona, que venga de \`inputs.sha\`.`,
      );
    }
  }

  // ── Diente 2: quien publica, comprueba ─────────────────────────────────
  //
  // Es el issue #9 al derecho: «verde» de un despliegue significa que se
  // subieron los ficheros, no que el CDN funcione.
  for (const w of vistos) {
    if (w.publica && !w.corre) {
      motivos.push(
        `${w.nombre}: publica (\`${PUBLICA}\`) y no corre \`${HERRAMIENTA}\`. ` +
          `Un despliegue verde sin humo sólo dice que se subieron los ficheros (issue #9).`,
      );
    }
  }

  return motivos;
}
