# La documentación, medida — épica #40

Documento de la épica **#40**, «el fichero con más autoridad del repo es el más
desactualizado». Mismo papel que `FRONTERA_VITALS.md` cumple para la #36: acá
está **lo medido**, con el comando al lado, para que la próxima auditoría no
tenga que volver a contar.

> Todo lo de abajo se midió contra el disco y contra la red el **2026-09-15**,
> sobre `claude/core-negocio-funcionalidades-ighvdy`. Donde una cifra de la
> épica no cuadró, está dicho — **incluidas las de la épica misma**.

**La premisa de la épica se confirma, y se queda corta.** No es que la
documentación esté vieja: es que **la superficie que el público ve** —el índice
del CDN en producción— anuncia 17 elementos que devuelven 404, y ninguna guía
lo dice. Ver §5.

---

## 1. Inventario

41 ficheros versionados (`git ls-files '*.md' '*.txt'`, sin `.claude/`),
**7.943 líneas**, más **616 líneas de cabecera** en 58 scripts de `tools/`.

| familia | ficheros | líneas | último toque | qué es |
|---|---:|---:|---|---|
| Raíz (`CLAUDE.md`, `LLM.txt`, `AGENTS.md`, `README.md`) | 4 | 1.241 | 2026-08-04 → 09-15 | lo que se lee primero |
| `SynergosDocs/` | 21 | 4.634 | 2026-07-21 → 09-15 | la documentación de arquitectura |
| `docs/architecture/` | 10 | 1.815 | **2026-07-21, todos** | planes pre-purga; **nadie los enlaza** |
| Sueltos (`modules/README`, dos `libs/*/README`, dos `CHANGELOG`, PR template) | 6 | 253 | 2026-07-21 → 08-04 | — |

Cómo se saca:

```bash
git ls-files '*.md' '*.txt' | grep -v '^\.claude' | xargs wc -l | tail -1
for f in $(git ls-files '*.md' '*.txt' | grep -v '^\.claude'); do
  printf '%-70s %6s %s\n' "$f" "$(wc -l < "$f")" "$(git log -1 --format=%cs -- "$f")"
done
```

**Enlaces relativos rotos: 0.** Se comprobaron los 41 ficheros. El problema de
esta épica no son los enlaces — es el **contenido** de lo que enlazan.

---

## 2. Las cifras, contadas

La cuenta que importa y que casi todo documento escribe mal:

| qué | disco | cómo se cuenta |
|---|---:|---|
| Carpetas bajo `apps/` con `src/main.ts` (lo que el build compila) | **127** | `find platforms/angular/apps -name main.ts -path '*/src/*' \| wc -l` — y el propio build lo imprime: `[build] 0s  127 elementos + libs` |
| └ `apps/elements/primitives` | 23 | |
| └ `apps/elements/compositions` | 43 | |
| └ `apps/elements/modules` | 50 | |
| └ `apps/domains/shop` | 8 | |
| └ `apps/experiences` | 3 | |
| Entradas en `element-registry.json` (lo que el CMS puede colocar) | **132** | 31 primitive · 47 composition · 54 module |
| └ de ésas, con fuente medida | 130 | `tools/lib/element-sources.mjs` |
| └ declaradas sin fuente | 2 | `stat-counter`, `module-mount` |
| Entradas en `element-inputs.json` | 138 | |
| Elementos publicados en el CDN vivo | **130** | `curl -s $CDN/synergos/registry.json \| jq '.elements \| length'` |
| Modelos `vitals/core/src/models/*.model.ts` | 129 | |
| Mappers `vitals/core/src/mappers/*.mapper.ts` | 51 | |
| Librerías Angular en `platforms/angular/libs/` | **7** | core · shared · rendering · integrations · **shells · shop · transaction-engine** |
| Tiers del design system en `libs/shared/src/components/` | **4** | primitives (23) · compositions (16) · patterns (12) · **states (4)** |
| Ficheros `.spec.ts` | 239 | |
| Tests que corren | **1.793** | 213 de `tools/lib` + 1.580 de la plataforma |
| `it.skip` | 0 | lo defiende `spec-quarantine` |

**127 y 132 no son la misma cuenta y nunca lo fueron**: seis entradas del
registry comparten `synergos-text-block`, dos no las construye nada, y tres
fuentes son hosts deprecados que no están en el registry. `CLAUDE.md` ya lo dice
así desde #42; **el resto de los documentos, no**.

### El origen del «136», y por qué no se borra de donde SÍ es cierto

| momento | Angular `main.ts` | total `main.ts` | `project.json` |
|---|---:|---:|---:|
| Antes de la purga (`eef2f3d^`) | **136** | 147 | 164 |
| En la purga (`eef2f3d`, 2026-08-04) | **136** | 136 | 0 |
| Hoy | **127** | 127 | 0 |

O sea: **«136» fue verdad el 4 de agosto** y desde entonces se fueron nueve
elementos. Por eso las frases de `BUILD_PIPELINE.md` que cuentan la HISTORIA
(«con Nx, cada uno de los 136 elementos era una *application* independiente»)
**son correctas y se dejan**; las que hablan en presente, no.

---

## 3. Qué afirma cada documento que el disco desmiente

Sólo lo falsificable. Cada fila se comprobó ejecutando o listando, no leyendo.

### 3.1 Lo que se corrigió en esta pasada

| documento | afirmaba | el disco dice |
|---|---|---|
| `README.md` ×3, `AGENTS.md`, `SCRIPTS.md`, `BUILD_PIPELINE.md` ×3 | «los **136** elementos» (en presente) | 127 fuentes / 132 entradas |
| `DEV_CDN_MODE.md` | «los **139** elementos» | 127 |
| `README.md`, `AGENTS.md`, `LLM.txt`, `DESIGN_SYSTEM.md`, `CLAUDE.md` | `libs/core-assets/` con alias `@synergos/core-assets` | **no existe**; es `vitals/core-assets/`, y así lo mapea `tsconfig.base.json` |
| `WHERE_DOES_THIS_GO.md` §1 | los tokens tienen «espejo en `platforms/angular/libs/core-assets/`, lo cuadra `sync:tokens:check`» | ese directorio no existe; `sync-tokens.mjs` escribe y comprueba `libs/shared/src/styles/_tokens-bridge.scss` |
| `README.md`, `AGENTS.md`, `LLM.txt` §5 | design system en `foundations/`, `components/`, `patterns/` | `primitives/`, `compositions/`, `patterns/`, **`states/`** |
| `README.md`, `AGENTS.md`, `CLAUDE.md` | 5 librerías Angular | 7 — faltaban `shells`, `shop`, `transaction-engine` |
| `ARCHITECTURE.md` | primitives (27) · compositions (45) · modules (53) | 23 · 43 · 50 |
| `ARCHITECTURE.md` | `WHERE_DOES_THIS_GO` «lleva banner» | se reescribió y ya no lo lleva |
| `tools/catalog.mjs` (cabecera) | «56-element master registry» | 132 |
| `.github/workflows/tests-ui.yml` (nombre) | «240 specs de Angular» | 239 ficheros, 1.580 tests |

### 3.2 Lo peor: el documento que los otros dos declaran autoridad

`CLAUDE.md` y `AGENTS.md` dicen los dos **«All code generation MUST follow
`LLM.txt`»**. Y `LLM.txt` §9 decía:

> *«ESTADO ACTUAL: el runner de tests de Angular está SUSPENDIDO desde la purga
> de Nx… recablearlos a vitest con compilación Angular es un pendiente
> declarado.»*

`README.md` lo repetía dos veces más («los tests de Angular están suspendidos»,
«`npm test` — solo specs de la raíz (cdn-cache-policy)»).

**Medido: `npm test` corre 1.793 tests en verde, 239 ficheros de spec, cero
`it.skip`, y hay un gate que exige que la cuarentena siga en cero.** No es una
guía que se quedó corta: es una que **afirma de más** sobre la pieza que un
desarrollador usaría para saber si su cambio rompió algo. Corregido en los dos.

### 3.3 Lo que se deja como está, y por qué

**Seis documentos llevan su propio banner de desactualizado** —`ONBOARDING`,
`EXPERIENCES`, `OUTPUT_POLICY`, `TROUBLESHOOTING`, `MCP_SETUP` y (parcial)
`BRIDGE_PROTOCOL`—. Son 1.239 líneas que describen el repo anterior a la purga.
El banner es honesto, y por eso **no se parchean cifras sueltas ahí dentro**:
arreglarle un número a un documento repudiado lo deja pareciendo vivo sin
estarlo, que es el defecto que la épica persigue. Qué se hace con ellos es
decisión, no typo → HU.

**`docs/architecture/` — 1.815 líneas, el 23 % de toda la documentación:**

- diez ficheros, **un commit cada uno, todos del 2026-07-21** — dos semanas
  ANTES de la purga;
- **nadie los enlaza**: ni `CLAUDE.md`, ni `README`, ni `AGENTS`, ni `LLM.txt`,
  ni `SynergosDocs/`, ni ningún workflow (`grep -rn 'docs/architecture'` fuera
  de la propia carpeta devuelve una sola línea, y es de otro repo);
- describen el estado actual como «Nx multi-framework»;
- **siete de los diez no son UTF-8 válido** (`iconv -f UTF-8 -t UTF-8` falla).

No llevan banner. Un `grep` cae ahí y no avisa de nada. Qué se hace con ellos
→ HU.

---

## 4. Dónde se contradicen entre sí

Los tres ficheros de la raíz solapan sobre los mismos temas. Cruzados:

| tema | `CLAUDE.md` | `LLM.txt` | `SynergosDocs/` | quién tenía razón |
|---|---|---|---|---|
| Tests de Angular | «vivos, cuarentena en cero» | «SUSPENDIDO» | `SCRIPTS.md`: vivos | CLAUDE.md y SCRIPTS.md |
| Tiers del design system | no lo dice | `foundations/ components/ patterns/` | `WHERE_DOES_THIS_GO`: `primitives/ compositions/ patterns/` | WHERE_DOES_THIS_GO (le falta `states/`) |
| Dónde viven los tokens SCSS | `vitals/core-assets` (bien) **y** `libs/core-assets` en el árbol (mal) | `libs/core-assets/` | `DESIGN_SYSTEM`: `libs/core-assets` | `tsconfig.base.json` |
| Cómo se instala | — | — | `ONBOARDING`: `npm install` + `npm run setup`; `README`: `npm ci` ×2 | los dos funcionan; nadie dice cuál es el camino |
| Versión de Node | — | — | `ONBOARDING`: 22+; `README`: >=20 | **nadie**: no hay `engines`, y los workflows usan 20 en uno y 22 en dos |
| `modules/` | no lo nombra | §6 entera de reglas | `FEATURE_ARCHITECTURE` + `MODULE_CREATION_GUIDE` | el disco: `platforms/angular/modules/` contiene **un README y nada más**, y `.gitmodules` está vacío |

`LLM.txt` además **numera §15 antes de §14**.

---

## 5. Lo que le falta a quien entra hoy

Se recorrió el camino completo. Dónde se rompe:

| paso | qué pasa | medido |
|---|---|---|
| 1. Clonar y leer | `README.md` es lo primero y tenía tres cifras falsas, dos rutas inexistentes y la afirmación de que no hay tests | §3 |
| 2. Instalar | dos caminos documentados, ninguno canónico, y la versión de Node se contradice entre guía y CI | `npm install` (raíz) + `npm install --prefix platforms/angular`: **~2 min** |
| 3. Construir todo | funciona y es rápido | **34 s** de reloj (`[build] 32s hecho`) |
| 4. Construir uno | funciona, y es el ciclo bueno | **9 s** (`node tools/build.mjs --solo=badge,hero`) |
| 5. **Verlo en el navegador** | **no hay camino** — ver abajo | |
| 6. Saber dónde va lo que escriba | `WHERE_DOES_THIS_GO.md` §1 contesta bien, pero `LLM.txt` §5 contesta distinto, y **3 de las 7 librerías** (`shells`, `shop`, `transaction-engine`) no aparecen en ninguna de las dos | |

### El paso 5, medido

`npm run dev:cdn` levanta el CDN completo y sirve los bundles bien
(`GET /synergos/badge/angular/latest/main.js` → **200, 2.597 bytes**). Pero
`GET /` devuelve `catalog.html`, el fichero de 362 KB versionado en la raíz, y:

- **no carga un solo bundle**: `grep -c 'type="module"'` sobre lo servido → **0**.
  Es una lista estática. Nada se renderiza;
- lista **147** elementos. El registry tiene **132**;
- `build-cdn.mjs` lo **copia** a `public/index.html` en vez de regenerarlo
  («`catalog.html` es lo ÚNICO visitable de este despliegue», dice su propio
  comentario), así que lo mismo está **en producción**:

```
GET https://synergos-ui.synergos-labs.workers.dev/           → 200, 362.087 bytes, 147 elementos
GET https://synergos-ui.synergos-labs.workers.dev/synergos/registry.json → 130 elementos
GET .../synergos/quiz-flow/angular/latest/main.js            → 404
GET .../synergos/rating-widget/angular/latest/main.js        → 404
GET .../synergos/notification-stack/angular/latest/main.js   → 404
GET .../synergos/hero/angular/latest/main.js                 → 200
```

Los 16 nombres que el catálogo tiene de más incluyen `quiz-flow`,
`rating-widget`, `content-carousel`, `filter-board` y `notification-stack` —
**las experiencias de React, Svelte y Vanilla**. Y 147 es exactamente el número
de `main.ts` que había **antes** de la purga (§2).

Regenerarlo cuesta un comando y da la cuenta buena:

```
$ node tools/catalog.mjs
   132 elements: 54 modules · 47 compositions · 31 primitives
```

**La prosa se limpió de las plataformas purgadas y el artefacto que el público
abre, no.** Es la forma exacta que este repo ya conoce —una afirmación que
sobrevive porque nadie la cruza contra el disco— sólo que ésta se sirve por
HTTPS. No se arregla acá: cambiar `build-cdn.mjs` y decidir si `catalog.html`
sigue versionado es código y es decisión → HU.

---

## 6. Hallazgos de camino (no son documentación, se anotan acá)

- ~~**`tools/cli.mjs` está muerto.**~~ **CERRADO en #52.** Construía su menú entero con
  `glob('**/project.json')`, y no quedaba ninguno: `discoverProjects()` devolvía **0**, sin
  fallar. Ofrecía «Graph» (era `nx graph`) y «All frameworks» (había una), y llevaba un
  `U+FFFD` suelto en una etiqueta. Hoy descubre con `descubrirFuentes` —el mismo recorrido que
  usa el build, con specs— y **lista 127**, el número que imprime el build; «Graph» se fue, el
  menú de framework se deriva del disco y no se pregunta si hay uno solo, y **vacío es un fallo
  que dice dónde buscó**. `interactive.mjs` tenía su propia copia del mismo glob muerto y
  estrenó `.spec.mjs`: no tenía ninguno, que es por qué llevaba seis semanas así.
- **`tools/refresh-skill-catalog.mjs` escribe FUERA del repo**
  (`resolve(ROOT_UI, '..', '.claude/skills/...')`) y rotula el fichero
  `AUTO-GENERATED` con **«122 bundles» a mano**. El script npm `skill:refresh`
  **sí existe** — la épica decía que no; medido en `package.json:29`.
- **Las skills están duplicadas entre repos**: 21 nombres compartidos, **18
  idénticos byte a byte, 3 divergidos** (`synergos-architect`,
  `synergos-cms-author`, `synergos-guardrails`), y **3 sólo en el CMS** —
  `synergos-bff-author`, `synergos-capability-author` y, la que importa,
  **`synergos-ticket-first`**: quien entra por este repo no se entera de que el
  proceso existe.
- ~~**`cms-sync.mjs` no honra `SYNERGOS_CMS_PATH`**~~ **CERRADO en #57.** Aceptaba sólo
  `--cms-path` o el hermano, mientras `validate-cms-contracts.mjs` aceptaba las tres. Como
  `contracts:validate` encadena los dos, en un contenedor sin los repos como hermanos el gate
  completo no llegaba al final aunque cada mitad supiera correr. Hoy la resolución vive en
  `tools/lib/rutas-hermanas.mjs` —promovida al **segundo** consumidor, que es cuando toca— y
  devuelve **de dónde salió la ruta**, para que el mensaje de fallo no mande a adivinar cuál de
  las tres formas falló. Verificado desde un clon con el CMS **fuera** del directorio hermano:
  los cuatro pasos cruzados en `exit=0` con sólo `SYNERGOS_CMS_PATH`.
- ~~**`catalog.mjs` cae por defecto a `C:\LOCAL_CDN\synergos`**~~ **CERRADO en el mismo commit**, y
  **eran TRES copias, no una**: `catalog.mjs`, `refresh-skill-catalog.mjs` y dos líneas de prosa
  que ese script **escribe dentro del catálogo generado** afirmando que el CMS lee de
  `C:\LOCAL_CDN`. La tercera no la vio nadie hasta que el spec la cruzó. Hoy el default es
  `public/synergos` —la salida de `build:cdn`, que existe en cualquier clon que haya
  construido— y `CDN_ROOT` sigue mandando. `publish-runtime.mjs` conserva el suyo **a
  propósito**: ahí `LOCAL_CDN` es el DESTINO de una publicación en la máquina del arquitecto, no
  la fuente de una lectura, y el gate lo nombra como el único permitido.
- **La definición de hecho del PR no incluye `npm test`**, ni `size:check`, ni
  `contracts:validate`.
- **`.mcp.json` declara `angular-cli`**, un MCP de generadores, en un repo cuyo
  `LLM.txt` dice «NO hay generadores… Create files by hand».
- La épica dice **251 ficheros `.spec.ts`**; en disco hay **239**. La cifra de
  la épica también se midió.

---

## 7. Lo que hace falta y no existe: un gate

El CMS tiene `CifrasDeClaudeMdTests` y por eso sus cifras no se desvían. Acá
**no hay equivalente**, y por eso «136» sobrevivió en cinco ficheros, «139» en
uno, «56» en una cabecera y «240» en el nombre de un workflow.

Lo que un gate así tendría que cruzar —todo derivable del disco:

| cifra | de dónde se deriva |
|---|---|
| fuentes con `src/main.ts` | `descubrirFuentes()` de `tools/lib/element-sources.mjs`, que ya existe |
| entradas del registry, y por tier | `element-registry.json` |
| librerías de `platforms/angular/libs/` | `readdir` |
| tiers de `libs/shared/src/components/` | `readdir` |
| ficheros `.spec.ts` | `glob` |

Y la lección del repo hermano se aplica entera: **una lista nombrada vence a un
número** (`feedback_a_named_list_beats_a_count`). Que un gate cuadre «7
librerías» y deje la lista sin `shells` es exactamente cómo se llegó acá. → HU.

---

## 8. Cómo se reproduce esta medición

```bash
# cifras del disco
find platforms/angular/apps -name main.ts -path '*/src/*' | wc -l        # 127
node -e "console.log(require('./vitals/contracts/src/element-registry.json').length)"  # 132
ls platforms/angular/libs                                                 # 7
ls platforms/angular/libs/shared/src/components                           # 4 tiers
find platforms/angular -name '*.spec.ts' -not -path '*/node_modules/*' | wc -l  # 239

# la suite y los gates
npm run test:tools          # 213
npm test                    # 213 + 1.580
npm run contracts:validate  # exit 0 (80 avisos)
SYNERGOS_CMS_PATH=/ruta/al/CMS node tools/validate-cms-contracts.mjs  # exit 0

# el catálogo contra el registry
node -e "const h=require('fs').readFileSync('catalog.html','utf8');
const c=[...new Set([...h.matchAll(/data-name=\"([^\"]*)\"/g)].map(m=>m[1]))];
const r=require('./vitals/contracts/src/element-registry.json').map(e=>e.name);
console.log(c.length, r.length, c.filter(n=>!r.includes(n)));"

# ficheros que no son UTF-8
for f in $(git ls-files '*.md' '*.txt'); do iconv -f UTF-8 -t UTF-8 "$f" >/dev/null 2>&1 || echo "$f"; done

# enlaces relativos rotos
# (0 hoy — el script está en el cuerpo de la épica #40)
```
