/**
 * El sello de `build:cdn`: la constancia de que una salida se TERMINÓ de construir.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE SE MIDIÓ, Y POR QUÉ EXISTE (CMS 002-produccion, 2026-10-15).
 *
 * «Workers Builds: synergos-ui» salió rojo en los 60 push a master que lo
 * dispararon, del 2026-08-02 al 2026-10-15: ni un verde. Reproducido en una copia
 * limpia: Cloudflare corre `npx wrangler deploy` sin construir antes, la puerta
 * (`tools/cdn-desplegable.mjs`) contestaba «se puede desplegar» sobre un `public/`
 * que NO EXISTÍA —sólo miraba la marca de «sin conservar»—, y Wrangler moría con
 * «The directory specified by the "assets.directory" field … does not exist».
 *
 * Y el caso peor no es ése, que al menos falla: es un `public/` A MEDIAS. Los
 * assets de Workers se publican atómicamente, así que un directorio a medio
 * construir REEMPLAZA la CDN entera por lo que haya. `build:cdn` comprueba todo
 * al final —runtime, import maps, runtime por contenido, presupuesto— y sale 1 si
 * algo falla; lo que no dejaba era CONSTANCIA de haber llegado al final. Una
 * salida terminada y una abandonada eran indistinguibles para quien despliega.
 *
 * El sello es esa constancia: lo escribe `build:cdn` como su ÚLTIMO acto, después
 * de todas sus comprobaciones, con el commit y cuántos ficheros dejó. La puerta lo
 * exige, y exige que cuadre: la cuenta (nadie añadió ni quitó nada después) y el
 * commit (el `public/` de otro commit no se despliega como si fuera éste).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * El disco se inyecta (`fs` de `node:fs/promises`), que es lo que deja ver fallar
 * cada regla sin construir nada.
 */

import path from 'node:path';

/** El fichero del sello, en la raíz de la salida. Se sirve como cualquier otro: no es secreto. */
export const SELLO = 'sello-del-cdn.json';

/** Quién publica la CDN, para que el mensaje de la puerta diga a dónde ir. */
const PUBLICADOR =
  'El publicador de la CDN es `.github/workflows/despliegue-cdn.yml`, que corre `npm run build:cdn` ' +
  'antes de desplegar. Si esto lo corrió Workers Builds, su build automático tiene que estar apagado ' +
  '(SynergosDocs/DESPLIEGUE_CDN.md §4).';

/** Cuántos ficheros hay bajo la salida, sin contar el sello. */
export async function contarFicheros({ salida, fs }) {
  let n = 0;
  const pendientes = [salida];
  while (pendientes.length > 0) {
    const dir = pendientes.pop();
    for (const entrada of await fs.readdir(dir, { withFileTypes: true })) {
      const ruta = path.join(dir, entrada.name);
      if (entrada.isDirectory()) pendientes.push(ruta);
      else if (!(dir === salida && entrada.name === SELLO)) n += 1;
    }
  }
  return n;
}

/**
 * Sella la salida: commit (o `null` si no hay git), cuándo y cuántos ficheros.
 * Lo llama `build:cdn` al final, y sólo al final.
 */
export async function sellar({ salida, fs, commit, ahora = new Date() }) {
  const sello = { commit: commit || null, generado: ahora.toISOString(), ficheros: await contarFicheros({ salida, fs }) };
  await fs.writeFile(path.join(salida, SELLO), `${JSON.stringify(sello, null, 2)}\n`);
  return sello;
}

/**
 * Si la salida es una que `build:cdn` terminó, para ESTE commit y sin tocar después.
 *
 * @param {{ salida: string, fs: object, commit?: string | null }} args `commit` = el `HEAD` de quien
 *   despliega; `null` si no hay git (entonces no se compara, y se dice).
 * @returns {Promise<{ ok: true, sello: object, aviso?: string } | { ok: false, motivo: string }>}
 */
export async function revisarSalida({ salida, fs, commit = null }) {
  let info;
  try {
    info = await fs.stat(salida);
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
    return { ok: false, motivo: `${salida} no existe: no hay nada construido que desplegar. ${PUBLICADOR}` };
  }
  if (!info.isDirectory()) {
    return { ok: false, motivo: `${salida} no es un directorio. ${PUBLICADOR}` };
  }

  let crudo;
  try {
    crudo = await fs.readFile(path.join(salida, SELLO), 'utf8');
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
    return {
      ok: false,
      motivo:
        `${salida} no lleva ${SELLO}: \`build:cdn\` no la terminó (se cortó a medias, o la armó otra ` +
        `cosa). Desplegarla reemplazaría la CDN entera por lo que haya ahí. ${PUBLICADOR}`,
    };
  }

  let sello;
  try {
    sello = JSON.parse(crudo);
  } catch {
    return { ok: false, motivo: `${path.join(salida, SELLO)} no es JSON: el sello está roto. Construí otra vez con npm run build:cdn.` };
  }
  if (!Number.isInteger(sello?.ficheros)) {
    return { ok: false, motivo: `${path.join(salida, SELLO)} no dice cuántos ficheros dejó: el sello está roto. Construí otra vez con npm run build:cdn.` };
  }

  const hay = await contarFicheros({ salida, fs });
  if (hay !== sello.ficheros) {
    return {
      ok: false,
      motivo:
        `${salida} tiene ${hay} ficheros y \`build:cdn\` dejó ${sello.ficheros}: alguien la tocó después ` +
        `de construirla. Construí otra vez con npm run build:cdn.`,
    };
  }

  if (commit && sello.commit && commit !== sello.commit) {
    return {
      ok: false,
      motivo:
        `${salida} se construyó en ${sello.commit.slice(0, 7)} y se está desplegando ${commit.slice(0, 7)}: ` +
        `sería publicar otro commit con el nombre de éste. Construí otra vez con npm run build:cdn.`,
    };
  }

  const aviso =
    !commit || !sello.commit
      ? 'no se pudo comparar el commit (sin git de un lado o del otro): se confía en la cuenta de ficheros.'
      : undefined;
  return { ok: true, sello, ...(aviso ? { aviso } : {}) };
}
