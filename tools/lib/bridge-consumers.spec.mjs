import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

import { raicesEnDisco } from './frameworks.mjs';

/**
 * Helpers del host bridge que nadie llama (issue #17).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTE GATE CUENTA CONSUMIDORES Y NO DECLARACIONES.
 *
 * La forma de `window.synergos` ya está vigilada: `ContractsIndexTests` (CMS
 * #88) cruza las TRES declaraciones —el `record` que el CMS emite, la interfaz
 * que `host-bridge.md` documenta, y la del harness Vitest— por nombre de campo.
 * Ese gate está bien y sigue haciendo falta.
 *
 * Lo que no mira, y es lo que costó el defecto: **si alguien lo consume.**
 *
 *   > El CMS emitía `window.synergos.member` en cada página con el miembro
 *   > autenticado. `getMember()` y `hasAnyRole()` existían, exportados y
 *   > documentados. El harness los probaba —«member shape para autenticados»,
 *   > en verde— armando su propio mock con `buildBridge({member})` y
 *   > preguntándole a `getBridge()?.member`: probaba el lector contra un objeto
 *   > que él mismo construía.
 *   >
 *   > Las tres patas de acuerdo, el gate en verde, y CERO consumidores. Un
 *   > miembro autenticado se veía anónimo para todos los web components, y la
 *   > tienda le pedía por formulario el nombre a quien ya había entrado.
 *
 * La mutación que lo demuestra: vaciar `getMember()` para que devuelva siempre
 * `null` dejaba los 1331 tests en verde y ninguna app cambiaba de comportamiento.
 *
 * Por eso acá no se comprueba que el helper exista —eso ya está cubierto— sino
 * que alguien lo LLAME desde código de producción. Un helper del bridge sin
 * llamadores es una decisión pendiente disfrazada de activo.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Cómo se amplía: si aparece un helper nuevo del bridge que todavía no tiene
 * consumidor, va a `PENDIENTES` **con la razón al lado** — igual que la lista de
 * `HttpClient` de CMS#49. Lo que no se puede es que entre en silencio.
 */

const REPO = path.resolve(import.meta.dirname, '../..');
/**
 * Las raíces de TODAS las plataformas construibles, no `platforms/angular` (#60).
 *
 * La regla de este gate es NEUTRAL —un helper de `window.synergos` sin llamadores es una decisión pendiente disfrazada de activo, en cualquier framework— y estaba apuntando a una ruta
 * cableada: la regla 25. La lista sale del disco, que es lo único que encuentra
 * una plataforma que nadie escribió en ningún sitio. Lo que NO cubre, dicho en
 * vez de insinuado: una plataforma cuyo árbol interno no se parezca al de
 * Angular queda invisible acá, porque este gate sigue sabiendo qué subcarpeta
 * mirar. El contrato de layout es #62; hasta entonces lo que impide que esto
 * pase en verde sin mirar nada es la red de seguridad de más abajo.
 */
const RAICES = raicesEnDisco(REPO);
const BRIDGE = path.join(REPO, 'vitals/core/src/bridge/synergos-bridge.ts');

/**
 * Helpers que todavía no tienen consumidor, con la razón por la que se acepta.
 * Sacar uno de acá es cablearlo; añadir uno exige escribir por qué.
 */
const PENDIENTES = new Map([
  [
    'getBrand',
    'El branding llega por tokens CSS (`--syn-*`), que es el camino con gate ' +
      'propio (check-css-parity). Este helper sirve a un elemento que quiera el ' +
      'nombre o el logo del brand en su propio markup, y todavía no hay ninguno.',
  ],
  [
    'getTheme',
    'Mismo caso: el tema se aplica por `data-theme` + tokens, no leyéndolo en TS. ' +
      'Un elemento sólo lo necesitaría para ramificar lógica por tema, y hacer eso ' +
      'es justo lo que el design system existe para evitar.',
  ],
  [
    'getBridgeVersion',
    'Negociación de versión del contrato. Se usará cuando haya un cambio mayor ' +
      'que obligue a un elemento a comportarse distinto según la versión del host; ' +
      'hoy sólo existe la 1.x.',
  ],
  [
    't',
    'DEUDA, y medida: la i18n del host no la consume ninguna app — las copias ' +
      'están en español en línea, en las plantillas. Una cuenta anterior dijo «15 ' +
      'consumidores» y era una colisión: el regex `t(` casa con cualquier cosa. ' +
      'Cablearlo es traducir las copias de nueve apps y no cabe en el defecto #17.',
  ],
  [
    'getPage',
    'DEUDA, y medida: cero consumidores. La cuenta anterior dijo 1 y era otra ' +
      'colisión — `CmsPageService.getPage(path)` es un método distinto que se ' +
      'llama igual. Lo necesitaría un elemento que quiera saber en qué página ' +
      'está para analítica o canónicas, y hoy ninguno lo hace.',
  ],
  [
    'getBridge',
    'Es el acceso crudo del que se derivan los demás. Los consumidores llaman a ' +
      'los helpers tipados, que es lo correcto; llamarlo directo sería saltarse ' +
      'el contrato.',
  ],
]);

function ficheros(raiz, exts) {
  const encontrados = [];
  if (!existsSync(raiz)) return encontrados;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (/^(node_modules|dist|\.cdn-out|\.test-out)$/.test(e.name)) continue;
        walk(full);
      } else if (exts.some((x) => e.name.endsWith(x))) {
        // Los specs no cuentan como consumidores: un test que llama al helper
        // es exactamente el falso positivo que dejó pasar el defecto.
        if (e.name.endsWith('.spec.ts') || e.name.endsWith('.spec.mjs')) continue;
        encontrados.push(full);
      }
    }
  };
  walk(raiz);
  return encontrados;
}

/**
 * Quita comentarios antes de buscar la llamada.
 *
 * Sin esto el gate se satisface con una MENCIÓN: la primera versión pasaba en
 * verde con el consumo borrado, porque el propio JSDoc del servicio decía
 * «`getMember()` y `hasAnyRole()`» y el regex casaba con eso. Es el mismo diente
 * que el gate de CMS#49 tiene por la misma razón —nombrar a otra capacidad se
 * mira **con los comentarios quitados**— y lo destapó mutar éste.
 */
function sinComentarios(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

/**
 * ¿Este fichero llama de verdad al helper del bridge?
 *
 * Dos trampas que la mutación destapó, y las dos dejaban el gate verde con el
 * consumo borrado:
 *
 * 1. **Una mención en un comentario.** La cierra `sinComentarios`.
 * 2. **Una DECLARACIÓN que se llama igual.** `HostIdentityService` expone su
 *    propio método `hasAnyRole(...)`, que envuelve al del bridge. El regex de
 *    llamada casaba con la firma del método, así que el helper parecía
 *    consumido por el mismo fichero que había dejado de consumirlo.
 *
 * Por eso se exigen las dos cosas: que el fichero **importe** el helper del
 * bridge, y que quede una llamada después de quitar comentarios y firmas de
 * método.
 */
function llama(src, helper) {
  const importaDelBridge = new RegExp(
    `import\\s*\\{[^}]*\\b${helper}\\b[^}]*\\}\\s*from\\s*'@synergos/vitals-core'`,
    's',
  ).test(src);
  if (!importaDelBridge) return false;

  const sinFirmas = src.replace(
    new RegExp(`^\\s*(?:public |private |protected )?(?:readonly )?${helper}\\s*\\(`, 'gm'),
    ' ',
  );
  return new RegExp(`\\b${helper}\\s*\\(`).test(sinFirmas);
}

/** Los helpers que el bridge exporta, leídos del fichero — no de una lista a mano. */
function helpersExportados() {
  const src = readFileSync(BRIDGE, 'utf8');
  return [...src.matchAll(/^export function ([a-zA-Z][a-zA-Z0-9]*)\s*\(/gm)].map((m) => m[1]);
}

describe('consumidores del host bridge', () => {
  const helpers = helpersExportados();

  it('el bridge exporta helpers y se leen del fichero, no de una lista', () => {
    // Si esto baja a cero, el gate dejó de mirar nada y hay que arreglarlo a él.
    expect(helpers.length).toBeGreaterThan(3);
  });

  it('hay plataformas que recorrer', () => {
    // La otra red, y hace falta desde #60: la lista sale del disco, así que si
    // el descubrimiento deja de ver, `fuentes` sale vacío y «ningún helper tiene
    // consumidor» se convertiría en «todos lo tienen» sin mirar nada.
    expect(RAICES.length).toBeGreaterThan(0);
  });

  it('cada helper del bridge tiene al menos un consumidor de producción', () => {
    const fuentes = RAICES.flatMap((raiz) => [
      ...ficheros(path.join(raiz, 'apps'), ['.ts']),
      ...ficheros(path.join(raiz, 'libs'), ['.ts']),
    ])
      .filter((f) => !f.includes(`${path.sep}bridge${path.sep}`))
      .map((f) => sinComentarios(readFileSync(f, 'utf8')));

    const sinConsumidor = [];
    for (const helper of helpers) {
      if (PENDIENTES.has(helper)) continue;
      if (!fuentes.some((src) => llama(src, helper))) {
        sinConsumidor.push(helper);
      }
    }

    expect(
      sinConsumidor,
      `Estos helpers del host bridge no los llama nadie desde apps/ ni libs/.\n` +
        `El CMS emite el dato en cada página y nadie lo lee — es el defecto #17.\n` +
        `Cablealo, o muévelo a PENDIENTES con la razón escrita:\n  ` +
        sinConsumidor.join(', '),
    ).toEqual([]);
  });

  it('la lista de pendientes no nombra helpers que ya no existen', () => {
    // Un permiso que sobra deja de leerse — misma regla que la lista de #49.
    const fantasmas = [...PENDIENTES.keys()].filter((h) => !helpers.includes(h));
    expect(
      fantasmas,
      `PENDIENTES nombra helpers que el bridge ya no exporta: ${fantasmas.join(', ')}`,
    ).toEqual([]);
  });
});
