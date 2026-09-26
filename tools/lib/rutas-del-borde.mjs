/**
 * Toda ruta que un `*-api.client.ts` pide existe en el borde del CMS (#77).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DE DÓNDE SALE. Cerrando #76 hubo que contestar a mano, para UN método, la pregunta
 * *¿el endpoint EXISTE?*. Al cruzarlo para todos salieron **16 de 115** rutas que el
 * CMS no declara, y dos de ellas eran escrituras que FABRICABAN el acuse:
 *
 *   · `POST {apiBase}/seller/product`          → el vendedor veía «Publicación creada»
 *     con un `PUB-<timestamp36>` inventado, el host recibía el evento
 *     `productpublished` con ese id fantasma, y el borrador se BORRABA.
 *   · `POST {apiBase}/order/{ref}/tracking/advance` → el pedido se pintaba en «Enviado»
 *     sin haberse movido, con `nextOrderStatus(current)` calculado en local.
 *
 * Las dos fallaban el **100 %** de las veces, y ningún gate podía verlo: G-6 cruza las
 * CLAVES de la respuesta y G-7 los CUERPOS de la petición, y los dos dan por hecho que la
 * ruta existe. Una ruta que no existe no tiene claves ni cuerpo que cruzar, así que cae
 * justo en el hueco entre los dos.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ ES UN HALLAZGO Y QUÉ NO.
 *
 * Una ruta ausente **no es automáticamente un defecto**: una LECTURA que degrada a mock con
 * su cartel es legítima (regla 4) y así está construido medio producto mientras los bordes
 * llegan. Lo que este gate impide es que una ruta ausente pase **inadvertida**: cada una se
 * declara con su razón, y el censo se vigila en los dos sentidos, así que el día que el CMS
 * la declare la entrada sobra y rompe el build.
 *
 * Lo que el censo NO admite —y es la línea que importa— es una ruta ausente detrás de una
 * ESCRITURA QUE FABRICA. Eso no se censa: se arregla.
 */

export const SUFIJO_CLIENTE = '-api.client.ts';

/**
 * Las rutas que los clientes piden y el CMS no declara, cada una con su razón.
 *
 * Medido al escribirlo: 16 de 115. Todas son lecturas que degradan con su cartel o
 * escrituras que fallan HONESTAMENTE (devuelven `{ ok: false, reason }`), una vez arregladas
 * las dos que fabricaban.
 */
export const SIN_BORDE = {
  'academy :: courses/{}/reviews': 'Lectura de reseñas de un curso; degrada a mock con cartel.',
  'academy :: moderation/{}/{}': 'Escritura HONESTA: devuelve `{ ok: false, reason }`, no fabrica.',
  'academy :: reviews/{}/reports': 'Escritura HONESTA: devuelve `{ ok: false, reason }`.',
  'eventos :: promo': 'Validación de un código promocional; sin borde no aplica descuento y lo dice.',
  'seller :: order/{}/tracking/advance':
    'Escritura. Ya NO fabrica (#77): sin borde devuelve `null` y la consola deja el pedido ' +
    'quieto y lo dice. La ruta sigue ausente en el CMS — `order/{orderRef}/tracking` existe ' +
    'sólo como GET— así que el botón no puede funcionar hasta que exista.',
  'seller :: returns': 'Lectura de la cola de RMA; degrada a mock con cartel.',
  'seller :: seller/product':
    'Escritura. Ya NO fabrica (#77): sin borde devuelve `null`, el borrador sobrevive y no se ' +
    'emite `productpublished`. Publicar no funciona hasta que el CMS declare la ruta.',
  'seller :: seller/products': 'Lectura del catálogo del vendedor; degrada a mock con cartel.',
  'seller :: seller/summary': 'Lectura de KPIs; degrada a mock con cartel.',
  'shop :: moderation/{}/{}': 'Escritura HONESTA: devuelve `{ ok: false, reason }`.',
  'shop :: promo': 'Validación de un código promocional; sin borde no aplica descuento.',
  'shop :: reviews/{}/reports': 'Escritura HONESTA: devuelve `{ ok: false, reason }`.',
  'shop :: seller/desk': 'Lectura del escritorio del vendedor; degrada a mock con cartel.',
  'travel :: reviews/{}/reports': 'Escritura HONESTA: devuelve `{ ok: false, reason }`.',
  'travel :: search/{}{}': 'Búsqueda por destino; degrada a mock con cartel.',
  'travel :: stays/{}/reviews': 'Lectura de reseñas de un alojamiento; degrada a mock.',
};

/**
 * Las rutas que un cliente pide, extraídas de sus template literals.
 *
 * **Se avanza carácter a carácter contando llaves, y no con un regex.** Un `${…}` puede
 * llevar dentro otro —`${qs ? `?${qs}` : ''}`— y un regex no cruza anidamiento: la primera
 * versión de esto dio **31** y la segunda **115 de 115**, las dos por eso y por el separador.
 * Es el mismo punto ciego que `ComposeStackTests` del repo hermano pagó con un `\\s*`.
 */
export function rutasQuePide(fuente) {
  const salida = [];
  const marca = '${apiBase}';
  let i = 0;

  while ((i = fuente.indexOf(marca, i)) !== -1) {
    let j = i + marca.length;
    let ruta = '';

    while (j < fuente.length) {
      const c = fuente[j];
      if (c === '`') break;        // fin del template
      if (c === '?') break;        // empieza la query: la ruta acabó
      if (c === '$' && fuente[j + 1] === '{') {
        // Saltar la expresión completa contando llaves.
        let prof = 0;
        j += 1;
        while (j < fuente.length) {
          if (fuente[j] === '{') prof += 1;
          else if (fuente[j] === '}') {
            prof -= 1;
            if (prof === 0) { j += 1; break; }
          }
          j += 1;
        }
        ruta += '{}';
        continue;
      }
      ruta += c;
      j += 1;
    }

    const limpia = ruta.replace(/^\/+/, '').replace(/\/+$/, '');
    if (limpia && !salida.includes(limpia)) salida.push(limpia);
    i = j;
  }

  return salida;
}

/**
 * Las rutas que declara un controller de ASP.NET: su `[Route]` más cada `[HttpX("…")]`.
 */
export function rutasQueDeclara(fuente) {
  const base = /\[Route\("([^"]+)"\)\]/.exec(fuente)?.[1] ?? '';
  const salida = [];
  for (const m of fuente.matchAll(/\[Http(?:Get|Post|Put|Patch|Delete)(?:\("([^"]*)"\))?\]/g)) {
    const sufijo = (m[1] ?? '').replace(/\{[^}]*\}/g, '{}');
    salida.push(`${base}/${sufijo}`.replace(/\/+/g, '/').replace(/\/+$/, ''));
  }
  return salida;
}

/**
 * Cruza lo que los clientes piden contra lo que el borde declara.
 *
 * @param {ReadonlyArray<{vertical: string, rutas: ReadonlyArray<string>}>} clientes
 * @param {ReadonlyArray<string>} declaradas
 * @param {Record<string, string>} censo
 */
export function cruzarRutas(clientes, declaradas, censo = SIN_BORDE) {
  // Red de seguridad, en los dos lados: si cualquiera de los dos descubrimientos deja de ver,
  // el cruce sale vacío y el gate informa «todas ligan» sin haber mirado nada — y el segundo
  // diente, además, pediría borrar el censo entero.
  if (clientes.length === 0 || declaradas.length === 0) {
    return {
      fallos: [
        `descubrimiento roto: ${clientes.length} cliente(s) y ${declaradas.length} ruta(s) ` +
          'declarada(s). Un cruce sobre una lista vacía es un verde que no comprobó nada.',
      ],
      medidas: 0,
      ausentes: [],
    };
  }

  const fallos = [];
  const ausentes = [];
  let medidas = 0;

  for (const c of clientes) {
    for (const ruta of c.rutas) {
      medidas += 1;
      // Un `{}` FINAL es casi siempre la query (`${qs ? `?${qs}` : ''}`) y no un segmento, así
      // que se prueba con y sin él antes de llamar ausente a nada.
      const variantes = [ruta, ruta.replace(/\{\}$/, '').replace(/\/+$/, '')].filter(Boolean);
      const existe = variantes.some((v) => declaradas.some((d) => d === v || d.endsWith(`/${v}`)));
      if (existe) continue;

      const clave = `${c.vertical} :: ${ruta}`;
      ausentes.push(clave);
      if (!(clave in censo)) {
        fallos.push(
          `\`${clave}\` NO la declara ningún controller del CMS. Si es una lectura que degrada ` +
            'con su cartel, declarala en `SIN_BORDE` con su razón. Si es una ESCRITURA que ' +
            'fabrica un acuse, no se censa: se arregla — eso fue #77, donde la consola del ' +
            'vendedor decía «publicado» contra una ruta que no existe.',
        );
      }
    }
  }

  for (const clave of Object.keys(censo)) {
    if (!ausentes.includes(clave)) {
      fallos.push(
        `\`${clave}\` está en \`SIN_BORDE\` y ya no corresponde: o el CMS la declara, o el ` +
          'cliente dejó de pedirla. Una excepción que sobra deja de leerse — borrá la entrada.',
      );
    }
  }

  return { fallos, medidas, ausentes };
}
