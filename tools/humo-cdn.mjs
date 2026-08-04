#!/usr/bin/env node
/**
 * El humo de un despliegue del CDN, contra la URL PÚBLICA (issue #9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTE FICHERO EXISTE SEPARADO PARA QUE UN GATE PUEDA LEERLO.
 *
 * El fallo más fácil de escribir en un humo —y el más difícil de notar— es
 * apuntarlo a `localhost`. Pasa SIEMPRE: contra un servidor local no hay nada
 * que pueda fallar, así que el workflow se pone verde con el CDN caído. Y un
 * despliegue verde con el CDN caído es peor que uno rojo, porque nadie lo va a
 * mirar.
 *
 * Al vivir en su propio fichero, `tools/lib/cdn-smoke.spec.mjs` puede exigir
 * que acá no aparezcan `localhost` ni `127.0.0.1`, y que la URL venga de
 * fuera. Metido dentro del YAML del workflow, ese gate tendría que leer YAML y
 * distinguir el humo del resto de pasos — o sea, no existiría.
 *
 * Es la misma figura que `tools/humo-publico.sh` en el repo del CMS, y por la
 * misma razón: lo que falla en un despliegue es todo lo que hay en el medio.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   node tools/humo-cdn.mjs https://synergos-ui.synergos-labs.workers.dev
 *   node tools/humo-cdn.mjs <url> --sha d6620b0     # espera a que llegue ESE commit
 *   node tools/humo-cdn.mjs <url> --intentos 20
 */
import { getArg } from './lib/cli-utils.mjs';
import { comprobaciones, elementoDePrueba, juzgar } from './lib/cdn-smoke.mjs';

// La URL viene de FUERA, siempre, y sin valor por defecto. Un default —aunque
// fuera el de producción— es la puerta por la que entra el humo contra sí mismo:
// alguien lo corre sin argumento, pasa, y nadie se entera de que no comprobó
// el despliegue que quería comprobar.
const BASE = process.argv[2];
if (!BASE || BASE.startsWith('--')) {
  console.error('uso: node tools/humo-cdn.mjs <url-pública> [--sha <commit>] [--intentos N]');
  process.exit(2);
}

const SHA = getArg('sha', null);
const INTENTOS = Number(getArg('intentos', 12));
const ESPERA_MS = 10_000;

const ok = (m) => console.log(`✓ ${m}`);
const mal = (m) => console.log(`✗ ${m}`);

async function pedir(ruta, metodo = 'GET') {
  const res = await fetch(new URL(ruta, BASE), { method: metodo, redirect: 'follow' });
  return { estado: res.status, cabeceras: res.headers, res };
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1. Esperar a que conteste el despliegue que nos interesa ─────────────────
//
// Cloudflare tarda en propagar, así que un humo inmediato le puede pegar a la
// versión ANTERIOR y darla por buena. Reintentar a ciegas no lo arregla: sólo
// hace más probable acertar sin saberlo.
//
// Por eso, cuando se pasa `--sha`, se compara contra algo que IDENTIFICA la
// versión: `publish.mjs` escribe el commit en el `meta.json` de cada elemento.
// Sin `--sha` se reintenta sólo hasta que el índice conteste.
async function esperarDespliegue() {
  for (let intento = 1; intento <= INTENTOS; intento++) {
    try {
      const { estado, res } = await pedir('/synergos/registry.json');
      if (estado === 200) {
        const registry = await res.json();
        const elemento = elementoDePrueba(registry);

        if (!SHA) return { registry, elemento };

        const meta = await pedir(`/synergos/${elemento.nombre}/angular/latest/meta.json`);
        if (meta.estado === 200) {
          const { commit } = await meta.res.json();
          if (commit === SHA) {
            ok(`el CDN contesta con el commit ${SHA} (intento ${intento})`);
            return { registry, elemento };
          }
          console.log(`  … todavía sirve ${commit ?? '(sin commit)'}, se espera ${SHA} (${intento}/${INTENTOS})`);
        }
      } else {
        console.log(`  … registry.json → ${estado} (${intento}/${INTENTOS})`);
      }
    } catch (e) {
      console.log(`  … ${e.message} (${intento}/${INTENTOS})`);
    }

    if (intento < INTENTOS) await dormir(ESPERA_MS);
  }

  mal(`el CDN no llegó a servir ${SHA ? `el commit ${SHA}` : 'un registry.json válido'} en ${INTENTOS} intentos`);
  process.exit(1);
}

console.log(`── humo contra ${BASE}\n`);
const { registry, elemento } = await esperarDespliegue();

// La versión del runtime no está en el registry: se lee del import-map, que es
// quien la manda de verdad — es el fichero que el navegador resuelve.
const importMap = await pedir('/synergos/runtime/angular/latest/import-map.json');
if (importMap.estado !== 200) {
  mal(`no hay import-map del runtime (${importMap.estado}) — los elementos no arrancarían`);
  process.exit(1);
}
const mapa = await importMap.res.json();
const runtimeVersion = /runtime\/angular\/([^/]+)\//.exec(
  Object.values(mapa.imports ?? {})[0] ?? '',
)?.[1];

if (!runtimeVersion) {
  mal('el import-map no dice qué versión del runtime sirve');
  process.exit(1);
}

ok(`${registry.elements.length} elementos · runtime ${runtimeVersion} · muestra: ${elemento.nombre}@${elemento.version}`);
console.log('');

// ── 2. Las comprobaciones ────────────────────────────────────────────────────
let fallos = 0;
for (const esperado of comprobaciones(elemento, runtimeVersion)) {
  const real = await pedir(esperado.ruta);
  const motivos = juzgar(esperado, real);

  if (motivos.length === 0) {
    ok(`${esperado.ruta} — ${esperado.que}`);
  } else {
    mal(`${esperado.ruta} — ${esperado.que}`);
    for (const m of motivos) console.log(`    ${m}`);
    fallos += motivos.length;
  }
}

// El índice tiene que traer elementos DENTRO. Un registry de dos líneas
// responde 200 con las cabeceras correctas y deja al CMS sin nada que resolver.
console.log('');
if ((registry.elements?.length ?? 0) === 0) {
  mal('el registry contesta pero viene vacío');
  fallos += 1;
}

if (fallos > 0) {
  console.log(`\n✗ ${fallos} fallo(s). El despliegue subió ficheros; el CDN no funciona.`);
  process.exit(1);
}

console.log('\n✓ el CDN responde como debe.');
