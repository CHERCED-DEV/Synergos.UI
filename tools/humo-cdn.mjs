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
 * QUÉ FRAMEWORKS COMPRUEBA (issue #44): los que el `registry.json` servido
 * DECLARA como publicados, uno por uno. Antes pedía `/angular/` a mano, así que
 * el humo de un despliegue con dos frameworks certificaba uno — y no fallaba:
 * salía verde habiendo mirado el segmento de ruta equivocado.
 *
 *   node tools/humo-cdn.mjs https://synergos-ui.synergos-labs.workers.dev
 *   node tools/humo-cdn.mjs <url> --sha d6620b0     # espera a que llegue ESE commit
 *   node tools/humo-cdn.mjs <url> --intentos 20
 */
import { getArg } from './lib/cli-utils.mjs';
import {
  comprobacionesGlobales,
  comprobacionesDeFramework,
  muestrasPorFramework,
  runtimeDelImportMap,
  juzgar,
} from './lib/cdn-smoke.mjs';

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
        // Una muestra POR FRAMEWORK publicado (issue #44). Cablear `angular`
        // acá no daba rojo: daba VERDE sobre el framework equivocado.
        const muestras = muestrasPorFramework(registry);

        if (!SHA) return { registry, muestras };

        // Basta con UNA para saber qué commit está sirviendo el CDN: publish
        // escribe el mismo en todos los meta.json de una corrida. Se toma la
        // primera muestra, que es la del primer framework por orden.
        const [primera] = muestras;
        const meta = await pedir(
          `/synergos/${primera.nombre}/${primera.framework}/latest/meta.json`,
        );
        if (meta.estado === 200) {
          const { commit } = await meta.res.json();
          if (commit === SHA) {
            ok(`el CDN contesta con el commit ${SHA} (intento ${intento})`);
            return { registry, muestras };
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
const { registry, muestras } = await esperarDespliegue();

// ── 2. El runtime de CADA framework ──────────────────────────────────────────
//
// La versión del runtime no está en el registry: se lee del import-map, que es
// quien la manda de verdad — es el fichero que el navegador resuelve. Y hay uno
// POR FRAMEWORK: un despliegue con dos publica dos, y comprobar el de Angular
// no dice nada sobre si el otro llegó.
let fallos = 0;
const runtimes = new Map();

for (const { framework } of muestras) {
  const importMap = await pedir(`/synergos/runtime/${framework}/latest/import-map.json`);
  if (importMap.estado !== 200) {
    mal(`[${framework}] no hay import-map del runtime (${importMap.estado}) — los elementos no arrancarían`);
    process.exit(1);
  }
  try {
    runtimes.set(framework, runtimeDelImportMap(await importMap.res.json(), framework));
  } catch (e) {
    mal(`[${framework}] ${e.message}`);
    process.exit(1);
  }
}

const resumen = muestras
  .map((m) => `${m.framework} ${runtimes.get(m.framework).version} (muestra ${m.nombre}@${m.version})`)
  .join(' · ');
ok(`${registry.elements.length} elementos · ${resumen}`);
console.log('');

// ── 3. Las comprobaciones ────────────────────────────────────────────────────
const comprobar = async (esperado) => {
  const real = await pedir(esperado.ruta);
  const motivos = juzgar(esperado, real);

  if (motivos.length === 0) {
    ok(`${esperado.ruta} — ${esperado.que}`);
  } else {
    mal(`${esperado.ruta} — ${esperado.que}`);
    for (const m of motivos) console.log(`    ${m}`);
    fallos += motivos.length;
  }
};

for (const esperado of comprobacionesGlobales()) await comprobar(esperado);

for (const muestra of muestras) {
  for (const esperado of comprobacionesDeFramework(muestra, runtimes.get(muestra.framework))) {
    await comprobar(esperado);
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
