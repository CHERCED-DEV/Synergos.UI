# Dev CDN Mode — el ciclo editor→navegador

> Reescrito al rehacer `dev-cdn` sobre `build.mjs --watch` (issue #2). La versión
> anterior describía el flujo de Nx: un proceso **por elemento** y una copia de
> `dist/` a `C:\LOCAL_CDN` en cada recompilación. Nada de eso existe ya.

## Concepto

**El servidor *es* un CDN, no un modo especial.**

`npm run dev:cdn` levanta un solo proceso que sirve el layout **completo** del CDN
—el mismo que produce `publish.mjs`— desde lo que hay compilado en `dist/`. El CMS
lo consume con el cliente HTTP que ya tiene:

```
SYNERGOS_CDN_MODE=Http
SYNERGOS_CDN_URL=http://localhost:4321
```

Cero código de desarrollo del lado del CMS. No hay que decirle que está en modo dev,
ni registrar qué puerto sirve qué elemento: para él es un CDN igual que producción.

```
  editor          build.mjs --watch          dev-cdn (un proceso)
  guardás  ───>   recompila incremental ───> traduce la ruta y lee de dist/
  en apps/        (~5 s, reusa el programa)   │
  o libs/                    │                ├─ /synergos/registry.json   (al vuelo)
                             │                ├─ /synergos/<el>/angular/<slot>/main.js
                             ├─ dist/libs/ ──>├─ /synergos/runtime/angular/<ver>/…
                             │  rehace el     └─ /synergos/__dev.json  (latido)
                             │  runtime (3,4 s)          │
                             ▼                           ▼
                        fs.watch(dist/)            navegador recarga
```

**No se copia nada.** El servidor traduce la ruta y lee el fichero. La versión
anterior sincronizaba `dist/` → carpeta del CDN, y esa copia era la fuente de todos
los «lo cambié y no se ve»: un sync a medias deja el CDN con la mitad vieja y no
avisa. Acá no hay copia que pueda quedarse atrás — si `dist/` tiene el bundle nuevo,
la siguiente petición lo sirve; si no lo tiene, da **404** en vez del de antes.

## Uso

```bash
npm run dev:cdn                        # los 139 elementos
npm run dev:cdn -- --solo=badge,hero   # sólo esos — arranca en ~6 s
npm run dev:cdn -- --puerto 5000
npm run dev:cdn -- --sin-livereload
```

Se para con **Ctrl-C**. Es un proceso: no hay registro de servidores que limpiar ni
señal de parada que dejar en el disco. (`dev-cdn-stop.mjs` y `lib/dev-servers.mjs`
se retiraron con el rework — existían porque antes había N procesos.)

## Lo que hay que saber, y no es obvio

### `--solo` manda sobre lo que hay en el disco

`dist/` conserva lo de builds anteriores. Sin ese filtro, un `--solo=badge,hero`
anunciaría los 139 en el `registry.json` y el CMS hidrataría 137 bundles de
antigüedad desconocida.

> Código viejo con cara de nuevo es **peor que un 404**, porque un 404 se investiga.

### Tocar `libs/` rehace el runtime

`@synergos/core` y `@synergos/shared` están en EXTERNALS (`cdn.config.mjs`): **no se
empaquetan dentro de los elementos**, viven en el runtime compartido y los resuelve
el import-map. `build.mjs --watch` los recompila a `dist/libs/sg-*.js`, pero quien
los mete en el runtime es `build-runtime.mjs`.

Sin ese eslabón, editar el design system recompila, el navegador recarga, y **todo
sigue igual** — con el build diciendo `✓ al día`. Es el síntoma más desconcertante
posible, así que el dev-cdn vigila `dist/libs` y rehace el runtime (~3,4 s) cuando
cambia. Sólo se paga al tocar `libs/`.

### Se sirve `no-store`, y eso se aparta de producción a propósito

En producción, `/synergos/<el>/angular/0.1.0/main.js` va con `immutable` y un año.
Servir eso acá significaría recompilar, recargar y ver el bundle de hace media hora
— justo el ciclo que este servidor existe para eliminar.

Que dev y producción difieran en caché **no deja un hueco sin vigilar**: las
cabeceras de verdad las comprueba `tools/humo-cdn.mjs` contra la URL pública, que es
el único sitio donde esa pregunta se puede contestar (issue #9).

**El CORS sí se imita, y no es opcional:** el CMS corre en otro origen, así que sin
`access-control-allow-origin` el navegador descarga el bundle y luego se niega a
ejecutarlo, con un error que no menciona al CDN.

### El runtime se construye solo si falta

`build.mjs --watch` **no** lo compila: es otro script y cambia sólo cuando cambia la
versión de Angular. Pero sin él los elementos cargan y se rompen al arrancar, con un
error que habla de módulos. Así que el dev-cdn lo comprueba al arrancar y lo
construye si no está.

## LiveReload

Sin servidor extra y sin fichero en disco: el latido vive **en memoria** y se sirve
en `/synergos/__dev.json`. El cliente (`tools/lib/livereload.mjs`) se inyecta **al
vuelo** en el `main.js` servido — nunca toca el fichero de `dist/`, así que lo que se
publica jamás lo lleva dentro.

Se vigila `dist/` y no las fuentes a propósito: que un fichero cambie no significa
que compile. Recargando cuando la **salida** se mueve, el navegador siempre recibe
algo que el compilador dio por bueno.

## Ficheros

| fichero | rol |
|---|---|
| `tools/dev-cdn.mjs` | el servidor y el ciclo de vida del watch |
| `tools/lib/dev-cdn-routes.mjs` | la traducción de rutas y las cabeceras — lógica pura |
| `tools/lib/dev-cdn-routes.spec.mjs` | el gate: que dev imite el layout publicado |
| `tools/lib/livereload.mjs` | el snippet que hace el poll |

## Requisitos

Ninguno de los de antes. No hace falta IIS, ni `C:\LOCAL_CDN`, ni publicar el runtime
a mano, ni el daemon de Nx. Sólo `npm run setup` una vez.
