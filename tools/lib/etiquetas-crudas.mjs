/**
 * tools/lib/etiquetas-crudas.mjs
 *
 * Una etiqueta `<synergos-*>` escrita CRUDA en la plantilla de otro elemento necesita que su
 * bundle se cargue, y eso lo declara `dependencies` en `element-registry.json` (ADR 0140 F4,
 * CMS#201).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Esa etiqueta no la compone el editor, así que no pasa por el SynHost y el CMS no emite su
 * `<script>`: lo emite sólo si el registry la declara dependencia del elemento que la pinta
 * (`BundleDescriptor.Dependencies`, resuelto por `FileSystemBundleRegistryClient`). Sin eso el
 * elemento queda en el DOM sin definir —0×0, sin error de consola— y lo que se ve es el hueco.
 *
 * Medido en el navegador al verificar la F4: el QR de cada entrada de Eventos —la confirmación
 * de la compra y «Mis tickets»— no se dibujaba. `customElements.get('synergos-qr-code')` era
 * `undefined` y la página cargaba countdown-clock y no qr-code, porque `eventos` sólo declaraba
 * `["countdown-clock"]`. El QR lo pintan `eventos.html` Y `syn-credential-wallet`, un shell que
 * `eventos` importa: por eso se miran también las librerías, por la clase que el elemento usa.
 * La butaca (`<synergos-seat-map>`) faltaba igual.
 *
 * Qué cuenta como etiqueta cruda: `<synergos-x` en una plantilla del elemento (los `.html` de
 * sus fuentes, salvo `src/index.html`, que es la página de desarrollo) o en el código de sus
 * `.ts` sin comentarios (una plantilla en línea); y la de un componente de librería cuya clase
 * nombra el código del elemento. No cuentan su propia etiqueta ni las de `AJENAS_AL_REGISTRO`.
 *
 * Lo que NO mira, dicho: una etiqueta armada por concatenación o `document.createElement` con
 * una variable, y un componente de librería que llega por otro componente de librería (hoy
 * ninguno: los shells no se importan entre sí para pintar etiquetas crudas).
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Etiquetas `synergos-*` que NO son elementos del registry, con su razón. Entrar exige razón.
 */
export const AJENAS_AL_REGISTRO = {
  'synergos-flujo':
    'el coordinador de la compra (ADR 0140 F4): lo define cada participante al cargar su ' +
    'bundle con definirCoordinador(), no es un bundle aparte que se pueda declarar',
};

/** Quita los comentarios de un `.ts`/`.tsx`/`.mjs`: la prosa que NOMBRA una etiqueta no la pinta. */
export function sinComentariosDeCodigo(fuente) {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/** Quita los comentarios HTML de una plantilla. */
export function sinComentariosHtml(fuente) {
  return fuente.replace(/<!--[\s\S]*?-->/g, ' ');
}

/** Las etiquetas `synergos-*` que abre un texto: `Set<'synergos-x'>`. */
export function etiquetasQueAbre(texto) {
  return new Set([...texto.matchAll(/<(synergos-[a-z0-9]+(?:-[a-z0-9]+)*)\b/g)].map((m) => m[1]));
}

/**
 * Las etiquetas crudas de las fuentes de UN elemento (sin contar lo de librerías).
 *
 * @param {{ ruta: string, fuente: string }[]} archivos rutas relativas a la carpeta del elemento
 */
export function etiquetasDeLasFuentes(archivos) {
  const todas = new Set();
  for (const { ruta, fuente } of archivos) {
    if (/(^|\/)src\/index\.html$/.test(ruta) || /\.spec\.[tj]sx?$/.test(ruta)) continue;
    const texto = ruta.endsWith('.html') ? sinComentariosHtml(fuente) : sinComentariosDeCodigo(fuente);
    for (const e of etiquetasQueAbre(texto)) todas.add(e);
  }
  return todas;
}

/**
 * Los componentes de librería que pintan etiquetas crudas: `Map<Clase, Set<etiqueta>>`.
 *
 * @param {{ ruta: string, fuente: string, plantilla?: string }[]} archivos los `.ts` de las
 *   librerías, con el `.html` de su `templateUrl` si lo tienen
 */
export function componentesQuePintan(archivos) {
  const mapa = new Map();
  for (const { fuente, plantilla } of archivos) {
    const codigo = sinComentariosDeCodigo(fuente);
    const etiquetas = new Set([...etiquetasQueAbre(codigo), ...etiquetasQueAbre(sinComentariosHtml(plantilla ?? ''))]);
    if (etiquetas.size === 0) continue;
    for (const m of codigo.matchAll(/export\s+class\s+([A-Za-z0-9_]+)/g)) mapa.set(m[1], etiquetas);
  }
  return mapa;
}

/**
 * Cruza lo que cada elemento pinta crudo con lo que declara en `dependencies`.
 *
 * @param {{
 *   registro: { name: string, tag: string, dependencies?: string[] }[],
 *   pinta: Map<string, Set<string>>,
 * }} entrada `pinta`: por nombre de elemento, las etiquetas crudas que pinta (con las de sus
 *   librerías ya sumadas)
 * @returns {{ faltan: string[], sobran: string[], desconocidas: string[] }} cada una como
 *   `elemento → nombre` (o `elemento → <etiqueta>` en las desconocidas)
 */
export function revisarDependencias({ registro, pinta }) {
  const porEtiqueta = new Map(registro.map((e) => [e.tag, e.name]));
  const faltan = [];
  const sobran = [];
  const desconocidas = [];
  for (const elemento of registro) {
    const etiquetas = pinta.get(elemento.name) ?? new Set();
    const necesita = new Set();
    for (const etiqueta of etiquetas) {
      if (etiqueta === elemento.tag || Object.prototype.hasOwnProperty.call(AJENAS_AL_REGISTRO, etiqueta)) continue;
      const nombre = porEtiqueta.get(etiqueta);
      if (nombre) necesita.add(nombre);
      else desconocidas.push(`${elemento.name} → <${etiqueta}>`);
    }
    const declara = new Set(elemento.dependencies ?? []);
    for (const n of [...necesita].sort()) if (!declara.has(n)) faltan.push(`${elemento.name} → ${n}`);
    for (const n of [...declara].sort()) if (!necesita.has(n)) sobran.push(`${elemento.name} → ${n}`);
  }
  return { faltan, sobran, desconocidas };
}
